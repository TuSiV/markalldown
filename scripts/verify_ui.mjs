// Render real application components with synthetic local-service/native-dialog fixtures.
// This complements backend/native tests; it does not claim to validate cryptography.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
const out=process.env.UI_SCREENSHOT_DIR || '/tmp/mad-ui-qa';mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const page=await b.newPage({viewport:{width:1440,height:1000},locale:'zh-CN'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const source='# 采购合同审查意见\n\n## 一、审查范围\n本次审查涉及采购合同及相关附件。\n\n甲方：示例科技有限公司\n联系人：示例联系人\n联系电话：13800138000\n邮箱：sample@example.com\n\n## 二、主要风险\n1. 付款节点及验收标准需明确。\n2. 违约责任条款需进一步细化。\n\n## 三、审查结论\n请结合实际履约安排完善合同条款。';
await page.addInitScript(text=>{localStorage.setItem('markitdown.locale','zh-CN');window.__TAURI_INTERNALS__={invoke:async(cmd)=>{if(cmd==='get_connection_info')return {port:18765,token:'synthetic-ui-test'};if(cmd==='plugin:dialog|open')return ['/fixtures/合同审查意见.md'];if(cmd==='plugin:path|basename')return '合同审查意见.md';if(cmd==='plugin:fs|read_file')return Array.from(new TextEncoder().encode(text));if(cmd==='plugin:dialog|confirm')return true;throw new Error('Unexpected native test command: '+cmd);}};},source);
await page.route('http://127.0.0.1:18765/**',async route=>{
 const url=new URL(route.request().url());let body={};
 if(url.pathname==='/api/health')body={status:'ok'};
 else if(url.pathname==='/api/convert')body={success:true,filename:'合同审查意见.md',cachePath:'/fixtures/result.md',preview:source.slice(0,80),charCount:source.length};
 else if(url.pathname==='/api/text')body={success:true,content:source};
 else throw new Error('Unexpected service test route: '+url.pathname);
 await route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},contentType:'application/json',body:JSON.stringify(body)});
});
const root=resolve('dist');
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://test').pathname));if(file!==root && !file.startsWith(root+sep)){res.writeHead(403);return res.end();}if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.getByRole('button',{name:'选择文件',exact:true}).click();await page.getByRole('heading',{name:'采购合同审查意见',exact:true}).waitFor();
const nav=page.getByRole('navigation',{name:'工作空间'});
await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;}'});
const shot=async name=>{await page.evaluate(async()=>{for(const el of document.querySelectorAll('.workspace-page'))if(el.offsetParent)el.scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:`${out}/${name}.png`,fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow)throw new Error(`Horizontal page overflow: ${name}`);};
await shot('conversion');
await nav.getByRole('button',{name:'导出中心',exact:true}).click();await shot('export');
await nav.getByRole('button',{name:'设置',exact:true}).click();await shot('settings');await page.getByRole('tab',{name:'转换',exact:true}).click();await page.getByRole('combobox',{name:'并发转换数量（下一批生效）',exact:true}).selectOption('2');
for(const name of ['文件转换','导出中心','设置']){await page.setViewportSize({width:800,height:750});await nav.getByRole('button',{name,exact:true}).click();await shot(`narrow-${name}`);}
if(errors.length)throw new Error(errors.join('\n'));
} catch(e) { console.error('Page errors:',errors);console.error(await page.locator('body').innerText());await page.screenshot({path:`${out}/error.png`,fullPage:true});throw e; } finally { await b.close();server.close(); }
console.log('Three main workspaces rendered at 1440 and 800 pixels; conversion, settings tabs and preview checked. Synthetic fixtures only.');
