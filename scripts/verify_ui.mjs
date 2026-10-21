// Render real application components with synthetic local-service/native-dialog fixtures.
// This complements backend/native tests; it does not claim to validate cryptography.
import { chromium, webkit } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
const out=process.env.UI_SCREENSHOT_DIR || '/tmp/mad-ui-qa';mkdirSync(out,{recursive:true});
const b=await (process.env.UI_BROWSER === 'webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}));
const page=await b.newPage({viewport:{width:1440,height:1000},locale:'zh-CN'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const source='# 采购合同审查意见\n\n## 一、审查范围\n本次审查涉及采购合同及相关附件。\n\n甲方：示例科技有限公司\n联系人：示例联系人\n联系电话：13800138000\n邮箱：sample@example.com\n\n## 二、主要风险\n1. 付款节点及验收标准需明确。\n2. 违约责任条款需进一步细化。\n\n## 三、审查结论\n请结合实际履约安排完善合同条款。' + '\n\n' + Array.from({length:60},(_,i)=>`第 ${i+1} 段：用于验证脱敏全文对照同步滚动的合成审查文字。`).join('\n\n');
await page.addInitScript(text=>{localStorage.setItem('markitdown.locale','zh-CN');window.isTauri=true;window.__desktopAppearance={platform:'windows',reduceTransparency:true,increaseContrast:false,reduceMotion:false};window.__TAURI_INTERNALS__={invoke:async(cmd)=>{if(cmd==='get_desktop_appearance')return window.__desktopAppearance;if(cmd==='get_connection_info')return {port:18765,token:'synthetic-ui-test'};if(cmd==='plugin:dialog|open')return ['/fixtures/合同审查意见.md'];if(cmd==='plugin:path|basename')return '合同审查意见.md';if(cmd==='plugin:fs|read_file')return Array.from(new TextEncoder().encode(text));if(cmd==='plugin:dialog|confirm')return true;throw new Error('Unexpected native test command: '+cmd);}};},source);
await page.route('http://127.0.0.1:18765/**',async route=>{
 const url=new URL(route.request().url());let body={};
 if(url.pathname==='/api/health')body={status:'ok'};
 else if(url.pathname==='/api/convert')body={success:true,filename:'合同审查意见.md',cachePath:'/fixtures/result.md',preview:source.slice(0,80),charCount:source.length};
 else if(url.pathname==='/api/text')body={success:true,content:source};
 else if(url.pathname==='/api/recovery/library/list')body={packs:[]};
 else if(url.pathname==='/api/redact')body={documentId:'a'.repeat(32),processingId:'b'.repeat(32),content:source.replace('13800138000','【MAD_'+'b'.repeat(32)+'_PHONE_0001】').replace('sample@example.com','【MAD_'+'b'.repeat(32)+'_EMAIL_0001】'),sourceHash:'synthetic',vault:{version:'MAD-R2'},summary:{occurrences:2,unique:2,categories:{phone:1,email:1},findings:[{category:'phone',original:'13800138000',count:1},{category:'email',original:'sample@example.com',count:1}]}};
 else throw new Error('Unexpected service test route: '+url.pathname);
 await route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},contentType:'application/json',body:JSON.stringify(body)});
});
const root=resolve('dist');
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://test').pathname));if(file!==root && !file.startsWith(root+sep)){res.writeHead(403);return res.end();}if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.getByRole('button',{name:'选择文件',exact:true}).waitFor();
if(await page.locator('.desktop-queue').count() || await page.locator('.desktop-result').count())throw new Error('Empty workspaces should not show queue/result placeholders');
await page.screenshot({path:`${out}/conversion-empty.png`,fullPage:true});
await page.getByRole('button',{name:'选择文件',exact:true}).click();await page.getByRole('heading',{name:'采购合同审查意见',exact:true}).waitFor();
const nav=page.getByRole('navigation',{name:'工作空间'});
await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;}[data-sonner-toaster]{visibility:hidden!important;}'});
const shot=async name=>{await page.evaluate(async()=>{for(const el of document.querySelectorAll('.workspace-page'))if(el.offsetParent)el.scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:`${out}/${name}.png`,fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow)throw new Error(`Horizontal page overflow: ${name}`);
const overlap=await page.evaluate(()=>{
 const grid=document.querySelector('.desktop-conversion-grid');
 if(!grid || getComputedStyle(grid).display==='contents' || !grid.offsetParent || getComputedStyle(grid).gridTemplateColumns.split(' ').length!==1)return false;
 const queue=grid.querySelector('.file-queue'), result=grid.querySelector('.desktop-result');
 return queue && result && queue.getBoundingClientRect().bottom>result.getBoundingClientRect().top+1;
});if(overlap)throw new Error(`File queue overlaps conversion result: ${name}`);
const layout=await page.evaluate(()=>{
 const app=document.querySelector('.desktop-app'), preview=document.querySelector('.desktop-preview');
 const footer=document.querySelector('.desktop-footer');
 if(!app||!footer)return null;
 const a=app.getBoundingClientRect(), f=footer.getBoundingClientRect();
 const visible=preview?.getClientRects().length;
 const p=visible?preview.getBoundingClientRect():null;
 const header=document.querySelector('.desktop-header').getBoundingClientRect();
 const queue=document.querySelector('.desktop-queue')?.getBoundingClientRect();
 return {height:innerHeight,appBottom:a.bottom,footerBottom:f.bottom,footerTop:f.top,preview:p?{top:p.top,bottom:p.bottom,left:p.left}:null,headerRight:header.right,queueRight:queue?.right};
});
if(layout){
 if(Math.abs(layout.appBottom-layout.height)>1||Math.abs(layout.footerBottom-layout.height)>1)throw new Error(`Unused window height: ${name} ${JSON.stringify(layout)}`);
 if(layout.preview&&(layout.preview.top>16||layout.footerTop-layout.preview.bottom>16||layout.preview.bottom>layout.footerTop||layout.preview.left<layout.headerRight||layout.preview.left<layout.queueRight))throw new Error(`Preview must fill the trailing column: ${name} ${JSON.stringify(layout)}`);
}
};
await page.locator('.desktop-conversion-grid.single').waitFor();
await shot('conversion');
for(const [width,height] of [[1470,930],[1000,720],[800,600],[1440,1000]]){
 await page.setViewportSize({width,height});await shot(`single-resize-${width}`);
}
await page.getByRole('button',{name:'关闭预览',exact:true}).click();await shot('conversion-preview-closed');
await page.getByRole('button',{name:'预览 合同审查意见.md',exact:true}).click();await shot('conversion-preview-reopened');
await page.getByRole('button',{name:'选择文件',exact:true}).click();
await page.locator('.desktop-conversion-grid:not(.single)').waitFor();
await shot('conversion-batch');
for(const [width,height] of [[1470,930],[1000,720],[800,600],[1440,1000]]){
 await page.setViewportSize({width,height});
 await page.getByRole('button',{name:'Markdown 源文',exact:true}).click();await shot(`batch-source-resize-${width}`);
 await page.getByRole('button',{name:'阅读预览',exact:true}).click();await shot(`batch-rendered-resize-${width}`);
}
await nav.getByRole('button',{name:'脱敏审核',exact:true}).click();await page.getByRole('checkbox',{name:'启用脱敏',exact:true}).check();
await page.getByLabel('映射文件加密口令（至少8字符，不会保存）').fill('synthetic-password');
await page.getByRole('button',{name:'检查所选文件的脱敏内容',exact:true}).click();await page.getByRole('checkbox',{name:'我已检查所选文件的全文及替换结果',exact:true}).waitFor();
await page.locator('.redaction-page').evaluate(el=>{el.scrollTop=0;});await shot('redaction-settings');
const reviewLayout=await page.evaluate(()=>{
 const page=document.querySelector('.redaction-page'),rules=page.querySelector('.review-rules').getBoundingClientRect(),options=page.querySelector('.review-options').getBoundingClientRect(),doc=page.querySelector('.review-document').getBoundingClientRect();
 const style=getComputedStyle(page),available=page.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
 return {rulesTop:rules.top,optionsTop:options.top,settingsBottom:Math.max(rules.bottom,options.bottom),docTop:doc.top,docLeft:doc.left,docRight:doc.right,rulesLeft:rules.left,optionsRight:options.right,height:doc.height,available};
});
if(Math.abs(reviewLayout.rulesTop-reviewLayout.optionsTop)>1||reviewLayout.docTop<reviewLayout.settingsBottom||Math.abs(reviewLayout.docLeft-reviewLayout.rulesLeft)>1||Math.abs(reviewLayout.docRight-reviewLayout.optionsRight)>1||Math.abs(reviewLayout.height-reviewLayout.available)>2)throw new Error(`Review must occupy a full workspace screen below settings: ${JSON.stringify(reviewLayout)}`);
await page.locator('.redaction-page').evaluate(el=>{const d=el.querySelector('.review-document');el.scrollTop+=d.getBoundingClientRect().top-el.getBoundingClientRect().top-parseFloat(getComputedStyle(el).paddingTop);});
await page.screenshot({path:`${out}/redaction.png`,fullPage:false});
await nav.getByRole('button',{name:'脱敏审核',exact:true}).waitFor();
await page.getByRole('button',{name:'标记原文',exact:true}).click();if(await page.locator('mark').count()!==2)throw new Error('Expected both detected terms to be highlighted');
await page.getByRole('button',{name:'左右对照',exact:true}).click();
const checkSync=async(index,fraction)=>{
 await page.locator('.review-text-columns pre').nth(index).evaluate((el,f)=>{el.scrollTop=f*(el.scrollHeight-el.clientHeight);},fraction);
 await page.waitForFunction(f=>{const panes=[...document.querySelectorAll('.review-text-columns pre')];return panes.length===2&&panes.every(el=>el.scrollHeight>el.clientHeight&&Math.abs(el.scrollTop/(el.scrollHeight-el.clientHeight)-f)<.01);},fraction);
};
await checkSync(0,.4);
const syncToggle=page.getByRole('checkbox',{name:'同步滚动',exact:true});
await syncToggle.uncheck();
await page.locator('.review-text-columns pre').nth(0).evaluate(el=>{el.scrollTop=.2*(el.scrollHeight-el.clientHeight);});
await page.waitForFunction(()=>{const p=[...document.querySelectorAll('.review-text-columns pre')];return Math.abs(p[0].scrollTop/(p[0].scrollHeight-p[0].clientHeight)-.2)<.01&&Math.abs(p[1].scrollTop/(p[1].scrollHeight-p[1].clientHeight)-.4)<.01;});
await syncToggle.check();
await checkSync(1,.7);await checkSync(0,1);await checkSync(1,0);
await page.getByRole('checkbox',{name:'我已检查所选文件的全文及替换结果',exact:true}).check();
await nav.getByRole('button',{name:'导出中心',exact:true}).click();await shot('export');
await nav.getByRole('button',{name:'文件恢复',exact:true}).click();await shot('recovery');
await nav.getByRole('button',{name:'设置',exact:true}).click();await shot('settings');await page.getByRole('tab',{name:'转换',exact:true}).click();await page.getByRole('combobox',{name:'同时转换数量（运行中的任务不会被中断）',exact:true}).selectOption('2');
for(const name of ['文件转换','脱敏审核','文件恢复','导出中心','设置']){await page.setViewportSize({width:800,height:750});await nav.getByRole('button',{name,exact:true}).click();await shot(`narrow-${name}`);}
// The same real desktop components under a synthetic native Mac preference bridge.
await page.setViewportSize({width:1440,height:1000});
const appearance=async flags=>{
 await page.evaluate(flags=>{window.__desktopAppearance={platform:'macos',reduceTransparency:false,increaseContrast:false,reduceMotion:false,...flags};window.dispatchEvent(new Event('focus'));},flags);
 await page.waitForFunction(flags=>{const root=document.querySelector('.desktop-app');return root?.dataset.platform==='macos' && Object.entries(flags).every(([key,value])=>root.dataset[key]===String(value));},flags);
};
await appearance({reduceTransparency:false,increaseContrast:false,reduceMotion:false});
for(const [name,label] of [['convert','文件转换'],['redaction','脱敏审核'],['recovery','文件恢复'],['export','导出中心'],['settings','设置']]){
 await nav.getByRole('button',{name:label,exact:true}).click();await shot(`mac-${name}`);
}
await page.getByRole('tab',{name:'通用与预览',exact:true}).click();
// Glass is limited to chrome; verify both surfaces and explicit light/dark preferences.
for(const selector of ['.desktop-header','.desktop-sidebar']) {
 if(!await page.locator(selector).evaluate(el=>getComputedStyle(el).backdropFilter.includes('blur')))throw new Error(`Missing Mac glass: ${selector}`);
}
const appearanceSelect=page.getByRole('combobox',{name:'外观',exact:true});
const selectStyle=await appearanceSelect.evaluate(el=>({appearance:getComputedStyle(el).appearance,image:getComputedStyle(el).backgroundImage}));
if(selectStyle.appearance!=='none' || !selectStyle.image.includes('svg'))throw new Error('Mac select must use the unified closed appearance');
await appearanceSelect.selectOption('dark');
await page.waitForFunction(()=>document.documentElement.dataset.macAppearance==='dark');
await shot('mac-dark-settings');
await nav.getByRole('button',{name:'文件转换',exact:true}).click();await shot('mac-dark-conversion');
if(await page.locator('.document-paper').evaluate(el=>getComputedStyle(el).backgroundColor)!=='rgb(36, 36, 38)')throw new Error('Dark document must remain opaque');
// Inspect every visible large surface, not just the settings preview.
for(const [name,label] of [['convert','文件转换'],['redaction','脱敏审核'],['recovery','文件恢复'],['export','导出中心'],['settings','设置']]) {
 await nav.getByRole('button',{name:label,exact:true}).click();await shot(`mac-dark-${name}`);
 const bright=await page.locator('.desktop-app').evaluate(root=>Array.from(root.querySelectorAll('*')).flatMap(el=>{
  const r=el.getBoundingClientRect(), css=getComputedStyle(el), color=css.backgroundColor.match(/[\d.]+/g)?.map(Number);
  if(!el.checkVisibility() || r.width*r.height<8000 || !color || color.length>3 && color[3]<.9)return [];
  return color.slice(0,3).every(v=>v>185)?[{tag:el.tagName,class:el.className,background:css.backgroundColor}]:[];
 }));
 if(bright.length)throw new Error(`Unadapted bright dark surfaces in ${name}: ${JSON.stringify(bright)}`);
 const unreadable=await page.locator('.desktop-app').evaluate(root=>Array.from(root.querySelectorAll('h2,h3,.form-label,.checkbox-row')).filter(el=>el.checkVisibility()).filter(el=>{
  const color=getComputedStyle(el).color.match(/[\d.]+/g)?.map(Number);return color && color.slice(0,3).every(v=>v<90);
 }).map(el=>el.textContent.slice(0,70)));
 if(unreadable.length)throw new Error(`Dark heading/label contrast missing in ${name}: ${JSON.stringify(unreadable)}`);
}
await nav.getByRole('button',{name:'设置',exact:true}).click();
await page.getByRole('combobox',{name:'外观',exact:true}).selectOption('light');
await page.waitForFunction(()=>document.documentElement.dataset.macAppearance==='light');
await appearance({reduceTransparency:true,increaseContrast:true,reduceMotion:true});
for(const selector of ['.desktop-header','.desktop-sidebar'])if(await page.locator(selector).evaluate(el=>getComputedStyle(el).backdropFilter)!=='none')throw new Error('Native reduced transparency must disable custom blur');
await shot('mac-accessible-settings');
await nav.getByRole('button',{name:'文件转换',exact:true}).click();
if(await page.locator('.document-paper').evaluate(el=>getComputedStyle(el).backgroundColor)!=='rgb(255, 255, 255)')throw new Error('Document surface must remain opaque');
await page.setViewportSize({width:800,height:600});await shot('mac-minimum-window');
await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
await appearance({reduceTransparency:false,increaseContrast:false,reduceMotion:false});
if(await page.locator('.desktop-sidebar').evaluate(el=>getComputedStyle(el).backdropFilter)!=='none')throw new Error('System high contrast must disable blur');
await shot('system-contrast');
if(errors.length)throw new Error(errors.join('\n'));
} catch(e) { console.error('Page errors:',errors);console.error(await page.locator('body').innerText());await page.screenshot({path:`${out}/error.png`,fullPage:true});throw e; } finally { await b.close();server.close(); }
console.log('Desktop workspaces, empty/single/batch layouts, Mac preference changes and minimum window rendered; tabs, highlights and review gates checked. Synthetic fixtures only.');
