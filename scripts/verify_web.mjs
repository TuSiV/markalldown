// Real browser, real WASM, OCR and encryption. No conversion-service mocks.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
const python=process.env.MAD_PYTHON||'.venv/bin/python';
execFileSync(python,['scripts/web_fixtures.py']);
const out=resolve('web-evidence');mkdirSync(out,{recursive:true});
const root=resolve('dist-web'),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.gz':'application/gzip','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{const path=decodeURIComponent(new URL(req.url,'http://test').pathname);let file=resolve(root,'.'+path);if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403);return res.end();}if(path==='/'||path.endsWith('/index.html'))file=resolve(root,'index.html');if(!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
context.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
const base=`http://127.0.0.1:${server.address().port}`;
const checks=[];checks.push=(...items)=>{console.log(...items);return Array.prototype.push.apply(checks,items);};
const monitor=setInterval(()=>{void page.locator('body').innerText().then(t=>console.log('Browser status:',t.slice(-280))).catch(()=>{});},15000);
async function shot(name){await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow '+name);}
async function upload(path){await page.locator('input[type=file]').first().setInputFiles(path);}
async function downloaded(button,path){const event=page.waitForEvent('download');await button.click();const d=await event;await d.saveAs(path);return readFileSync(path);}
try{
 await page.goto(base);await page.getByRole('heading',{name:/把文件，变成/}).waitFor();
 if(await page.getByRole('heading',{name:/转换队列/}).count())throw Error('Empty landing exposes queue');
 await shot('landing-desktop');
 for(const width of [390,768]){await page.setViewportSize({width,height:844});await shot('landing-'+width);}
 await page.setViewportSize({width:1440,height:1000});
 await upload('/tmp/mad-web-fixtures/中文合同.docx');await page.locator('[data-engine="anydoc-wasm"][data-format="docx"]').waitFor({timeout:30000});
 const zip=await downloaded(page.getByRole('button',{name:'下载 ZIP'}),resolve(out,'contract.zip'));const files=unzipSync(zip);const original=strFromU8(files['中文合同.md']);
 if(!original.includes('13800138000')||!original.includes('125000.50')||!Object.keys(files).some(k=>k.startsWith('assets/')))throw Error('Document text or resource missing');
 checks.push('DOCX Chinese, money, table and resource ZIP');await shot('conversion-desktop');
 for(const [name,fmt] of [['sample.doc','doc'],['sample.ppt','ppt'],['sample.xls','xlsx'],['sample.xlsb','xlsx'],['chinese.doc','doc'],['chinese.ppt','ppt']]){
  await upload('tests/fixtures/local-engines/'+name);await page.getByRole('button',{name:new RegExp(name.replaceAll('.','\\.'))}).first().click();
  await page.locator(`[data-engine="anydoc-wasm"][data-format="${fmt}"]`).waitFor({timeout:30000});if(name.startsWith('chinese.'))await page.getByText('中文合同',{exact:false}).first().waitFor();
 }
 checks.push('DOC/PPT/XLS/XLSB actual WASM conversions');
 await page.getByRole('button',{name:/中文合同\.docx/}).first().click();
 await page.getByRole('navigation').getByRole('button',{name:'脱敏审核'}).click();
 await page.getByLabel('恢复包口令（至少8字符）').fill('browser-test-password');await page.getByRole('button',{name:'生成脱敏结果'}).click();
 await page.getByText(/替换 \d+ 处/).waitFor({timeout:30000});
 await page.getByLabel('我已检查全文、文件名和替换结果').check();
 const packBytes=await downloaded(page.getByRole('button',{name:'下载加密恢复包'}),resolve(out,'recovery.json'));
 if(await page.getByRole('button',{name:'下载已审核脱敏正文'}).isEnabled())throw Error('Recovery persistence gate missing');
 await page.getByLabel('恢复包已保存在安全位置',{exact:false}).check();
 const masked=await downloaded(page.getByRole('button',{name:'下载已审核脱敏正文'}),resolve(out,'redacted.md'));
 const script="import sys,json;sys.path.insert(0,'backend');from recovery import preview_recovery;b=json.load(sys.stdin);print(json.dumps(preview_recovery(b['content'],b['pack'],b['password']),ensure_ascii=False))";
 const result=JSON.parse(execFileSync(python,['-c',script],{input:JSON.stringify({content:masked.toString('utf8'),pack:JSON.parse(packBytes),password:'browser-test-password'}),encoding:'utf8'}));
 if(result.content!==original||result.integrity!=='exact')throw Error('Desktop failed to recover browser output');
 checks.push('Browser redaction → actual Python recovery, separate downloads and review gates');await shot('redaction-desktop');
 await page.getByRole('navigation').getByRole('button',{name:'文件恢复'}).click();
 const f=JSON.parse(readFileSync('/tmp/mad-web-fixtures/desktop.json','utf8'));writeFileSync(resolve(out,'desktop-redacted.md'),f.content);writeFileSync(resolve(out,'desktop-pack.json'),JSON.stringify(f.pack));
 await page.getByLabel('选择脱敏文件').setInputFiles(resolve(out,'desktop-redacted.md'));await page.getByLabel('选择恢复 JSON').setInputFiles(resolve(out,'desktop-pack.json'));await page.getByLabel('恢复口令',{exact:true}).fill(f.password);
 await page.getByRole('button',{name:'校验并预览恢复'}).click();await page.getByText('完整导出文件校验通过',{exact:false}).waitFor({timeout:30000});await page.getByLabel('我已审核恢复结果').check();
 const recovered=await downloaded(page.getByRole('button',{name:'另存恢复文件'}),resolve(out,'restored.md'));if(recovered.toString('utf8')!==f.source)throw Error('Browser failed to recover desktop output');
 checks.push('Desktop R2 → actual browser recovery');await shot('recovery-desktop');
 for(const width of [390,768]){await page.setViewportSize({width,height:844});for(const name of ['文件转换','脱敏审核','文件恢复','设置']){await page.getByRole('navigation').getByRole('button',{name}).click();await shot(name+'-'+width);}}
 await page.getByRole('navigation').getByRole('button',{name:'设置'}).click();await page.getByRole('button',{name:'准备全部离线资源'}).click();await page.getByText('离线资源已缓存',{exact:false}).waitFor({timeout:120000});
 await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.getByRole('navigation').getByRole('button',{name:'文件转换'}).click();await page.getByLabel('扫描件 / 图片使用本地 OCR').check();
 await upload('/tmp/mad-web-fixtures/scan.png');await page.locator('[data-engine="tesseract-local"][data-format="image"]').waitFor({timeout:120000});await page.getByText('Phone 13800138000',{exact:false}).waitFor();
 checks.push('Fresh reload offline + local image OCR without network');
 if(existsSync('/tmp/mad-web-fixtures/chinese-scan.png')){
  await upload('/tmp/mad-web-fixtures/chinese-scan.png');await page.getByRole('button',{name:/chinese-scan\.png/}).first().click();await page.locator('[data-engine="tesseract-local"][data-format="image"]').waitFor({timeout:120000});await page.getByText('中文合同',{exact:false}).waitFor();await page.getByText('125000.50',{exact:false}).waitFor();checks.push('Chinese OCR recognizes contract heading and amount offline');
 }

 await upload('/tmp/mad-web-fixtures/mixed.pdf');await page.getByRole('button',{name:/mixed\.pdf/}).first().click();await page.locator('[data-engine="tesseract-local"][data-format="pdf"]').waitFor({timeout:120000});await page.getByText('Text page 1',{exact:false}).waitFor();await page.getByText('Phone 13800138000',{exact:false}).waitFor();
 checks.push('Offline mixed PDF preserves text page and OCRs scanned page');await shot('offline-ocr-mobile');
 await page.getByLabel('扫描件 / 图片使用本地 OCR').uncheck();await upload('/tmp/mad-web-fixtures/mixed.pdf');await page.getByText('扫描页需要启用本地 OCR 后重试',{exact:false}).waitFor();checks.push('Scanned page failure is explicit when OCR disabled');
 const cancelContext=await browser.newContext({serviceWorkers:'block'}),cancelPage=await cancelContext.newPage();
 try{
  let release;const held=new Promise(r=>release=r);let started;const entered=new Promise(r=>started=r);
  await cancelContext.route('**/ocr/**',async route=>{started();await held;await route.abort().catch(()=>{});});
  await cancelPage.goto(base);await cancelPage.getByLabel('扫描件 / 图片使用本地 OCR').check();
  await cancelPage.locator('input[type=file]').first().setInputFiles('/tmp/mad-web-fixtures/scan.png');await entered;
  await cancelPage.getByRole('button',{name:'取消',exact:true}).click();release();
  await cancelPage.locator('input[type=file]').first().setInputFiles('/tmp/mad-web-fixtures/source.md');await cancelPage.getByRole('button',{name:/source\.md/}).first().click();
  await cancelPage.locator('[data-engine="utf8"][data-format="md"]').waitFor();
  if(cancelPage.workers().length)throw Error('Cancelled OCR left workers running');
  checks.push('Cancelling OCR during model initialization terminates workers and advances queue');
 }finally{await cancelContext.close();}

 if(external.length)throw Error('Unexpected external requests: '+external.join('\n'));if(errors.length)throw Error('Browser errors: '+errors.join('\n'));
 writeFileSync(resolve(out,'checks.json'),JSON.stringify({checks,externalRequests:external,pageErrors:errors},null,2));console.log(`Passed ${checks.length} browser checks.`);
}catch(e){console.error(await page.locator('body').innerText());await shot('failure');throw e;}finally{clearInterval(monitor);await browser.close();server.close();}
