import {useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {convert,extensions,defaultLimits} from './convert';
import type {Converted} from './document';
import {categoryLabels,type Redacted,newId} from './privacy';
import {privacyJob} from './privacyClient';
import {download,exportConversion,markdownName} from './download';
import './web.css';
interface Task {id:string;file:File;status:'pending'|'running'|'done'|'error'|'cancelled';message:string;result?:Converted}
type Page='convert'|'redact'|'recovery'|'settings';
type Recovery={content:string;restored:number;missing:number;integrity:string;originalMatch:boolean|null};
function Preview({content,assets=[]}:{content:string;assets?:Converted['assets']}){
 const [urls,setUrls]=useState<Record<string,string>>({});
 useEffect(()=>{const u:Record<string,string>={};for(const a of assets)if(['image/png','image/jpeg','image/gif','image/webp','image/bmp'].includes(a.mediaType))u[a.name]=URL.createObjectURL(new Blob([a.data as BlobPart],{type:a.mediaType}));setUrls(u);return()=>Object.values(u).forEach(URL.revokeObjectURL);},[assets]);
 return <div className="web-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{img:({src,alt})=>urls[src??'']?<img src={urls[src??'']} alt={alt}/>:<span className="web-warning">[图片未加载：{alt||'图片'}]</span>,a:({href,children})=><a href={/^(https?:|mailto:)/.test(href??'')?href:undefined} target="_blank" rel="noopener noreferrer">{children}</a>}}>{content}</ReactMarkdown></div>;
}
export default function WebApp(){
 const [page,setPage]=useState<Page>('convert'),[tasks,setTasks]=useState<Task[]>([]),[selected,setSelected]=useState(''),[source,setSource]=useState(false),[ocr,setOcr]=useState(false),[limits,setLimits]=useState(defaultLimits);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[password,setPassword]=useState(''),[keywords,setKeywords]=useState(''),[whitelist,setWhitelist]=useState(''),[categories,setCategories]=useState(['phone','email','id_card','bank_account','credit_code']);
 const [redacted,setRedacted]=useState<Redacted|null>(null),[reviewed,setReviewed]=useState(false),[pack,setPack]=useState<unknown>(null),[packSaved,setPackSaved]=useState(false),[exportName,setExportName]=useState('');
 const [recoveryText,setRecoveryText]=useState(''),[recoveryPack,setRecoveryPack]=useState<unknown>(null),[recoveryName,setRecoveryName]=useState('document.md'),[recovered,setRecovered]=useState<Recovery|null>(null),[recoveryReviewed,setRecoveryReviewed]=useState(false);
 const input=useRef<HTMLInputElement>(null),active=useRef<{id:string;controller:AbortController}|null>(null),job=useRef<AbortController|null>(null),tasksRef=useRef(tasks),alive=useRef(true);
 const [offline,setOffline]=useState(false),[swReady,setSwReady]=useState(false),[online,setOnline]=useState(navigator.onLine);
 const task=tasks.find(t=>t.id===selected);
 const patch=(id:string,fields:Partial<Task>)=>setTasks(ts=>ts.map(t=>t.id===id?{...t,...fields}:t));
 const resetRedaction=()=>{setRedacted(null);setReviewed(false);setPack(null);setPackSaved(false);};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.controller.abort();job.current?.abort();};},[]);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>{
  tasksRef.current=tasks;
  if(active.current)return;
  const next=tasks.find(t=>t.status==='pending');if(!next)return;
  const controller=new AbortController();active.current={id:next.id,controller};patch(next.id,{status:'running',message:'等待本地引擎'});
  convert(next.file,controller.signal,m=>patch(next.id,{message:m}),ocr,limits).then(result=>{if(alive.current)patch(next.id,{status:'done',result,message:result.warnings.length?'完成，请检查提示':'完成'});}).catch(e=>{if(alive.current)patch(next.id,{status:e.name==='AbortError'?'cancelled':'error',message:e.message});}).finally(()=>{active.current=null;if(alive.current)setTasks(ts=>[...ts]);});
 },[tasks,ocr,limits]);
 useEffect(()=>{resetRedaction();setExportName(task?markdownName(task.file.name):'document.md');},[selected]);
 const add=(files:File[])=>{
  setError('');if(tasksRef.current.length+files.length>100){setError('队列最多100个文件，请清空已完成任务后再导入');return;}
  const added=files.map(file=>({id:newId(),file,status:'pending' as const,message:'等待转换'}));setTasks(ts=>[...ts,...added]);if(!selected&&added.length)setSelected(added[0].id);
 };
 const cancelTask=(id:string)=>{if(active.current?.id===id)active.current.controller.abort();patch(id,{status:'cancelled',message:'已取消'});};
 async function run(action:()=>Promise<void>){setBusy(true);setError('');job.current=new AbortController();try{await action();}catch(e){setError((e as Error).message);}finally{job.current=null;setBusy(false);}}
 const terms=(s:string)=>s.split(/\r?\n/).filter(s=>s.trim());
 const performRedaction=()=>run(async()=>{if(!task?.result)throw Error('请先选择已转换的文件');resetRedaction();const value=await privacyJob<Redacted>('redact',{content:task.result.content,options:{categories,keywords:terms(keywords),whitelist:terms(whitelist)},password},job.current!.signal);setRedacted(value);});
 const performRecovery=()=>run(async()=>{setRecovered(null);setRecoveryReviewed(false);setRecovered(await privacyJob<Recovery>('recover',{content:recoveryText,pack:recoveryPack,password},job.current!.signal));});
 const savePack=()=>run(async()=>{if(!redacted||!reviewed)throw Error('请先审核');const name=markdownName(exportName);const value=await privacyJob<unknown>('pack',{redacted,password,name},job.current!.signal);setPack(value);download('recovery-'+redacted.document.processingId+'.json',JSON.stringify(value,null,2),'application/json');});
 async function readRecovery(file:File|undefined,kind:'text'|'pack'){
  if(!file)return;setError('');setRecovered(null);setRecoveryReviewed(false);
  try{if(file.size>(kind==='pack'?10_000_000:32_000_000))throw Error('文件超过恢复大小限制');const text=await file.text();if(kind==='pack')setRecoveryPack(JSON.parse(text));else{setRecoveryText(text);setRecoveryName(file.name);}}catch(e){setError((e as Error).message);}
 }
 const prepareOffline=()=>run(async()=>{
  const registration=await navigator.serviceWorker.ready;
  const worker=registration.active;if(!worker)throw Error('离线服务尚未就绪，请刷新后重试');
  await new Promise<void>((resolve,reject)=>{
   const channel=new MessageChannel(),id=newId(),signal=job.current!.signal;
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);channel.port1.close();};
   const cancel=()=>{worker.postMessage({type:'CANCEL_OFFLINE',id});cleanup();reject(new DOMException('已取消','AbortError'));};
   const timer=setTimeout(()=>{worker.postMessage({type:'CANCEL_OFFLINE',id});cleanup();reject(Error('离线资源准备超时，请重试'));},120_000);
   signal.addEventListener('abort',cancel);if(signal.aborted){cancel();return;}
   channel.port1.onmessage=e=>{cleanup();e.data.ok?resolve():reject(Error('离线资源下载失败，请重试'));};worker.postMessage({type:'PREPARE_OFFLINE',id},[channel.port2]);
  });setOffline(true);
 });
 useEffect(()=>{if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(r=>{setSwReady(true);return caches.open('mad-ocr-v1').then(c=>c.match(new URL('offline-ready',r.scope)));}).then(r=>setOffline(!!r)).catch(()=>{});},[]);
 return <div className="web-app">
  <header className="web-header"><div><strong>MarkAllDown</strong><span>本地文档工作台</span></div><span className="web-badge">{online?'本地处理 · 不上传文档':'离线模式'}</span></header>
  <nav className="web-nav" aria-label="工作空间">{(['convert','redact','recovery','settings'] as Page[]).map((p,i)=><button key={p} disabled={busy} aria-current={page===p?'page':undefined} onClick={()=>{setPage(p);setError('');}}>{['文件转换','脱敏审核','文件恢复','设置'][i]}</button>)}</nav>
  <main className="web-main">
   {error&&<div role="alert" className="web-alert">{error}</div>}
   {busy&&<div role="status" className="web-status">本地处理中… <button onClick={()=>job.current?.abort()}>取消处理</button></div>}
   {page==='convert'&&<>
    <section className="web-intro"><div><p className="web-eyebrow">DOCUMENT → MARKDOWN</p><h1>把文件变成可用的 Markdown</h1><p>Office、PDF 与图片。逐个转换，保留资源，结果可审核。</p></div><label className="web-check"><input type="checkbox" checked={ocr} onChange={e=>setOcr(e.target.checked)}/>扫描件 / 图片使用本地 OCR</label></section>
    <section className="web-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();add(Array.from(e.dataTransfer.files));}}><button className="web-primary" onClick={()=>input.current?.click()}>选择文件</button><p>或将文件拖到这里 · 支持 DOC / PPT 等旧格式</p><input ref={input} type="file" multiple accept={extensions} hidden onChange={e=>{add(Array.from(e.target.files??[]));e.target.value='';}}/><details><summary>查看支持格式与限制</summary><p>{extensions}</p><p>每个文件 {limits.maxFileMB} MB，队列最多100个。手机默认逐个处理。扫描件开启 OCR 后处理。</p></details></section>
    <div className="web-grid"><section className="web-card"><div className="web-card-title"><h2>转换队列 <small>{tasks.length}</small></h2><button disabled={tasks.some(t=>['pending','running'].includes(t.status))||busy} onClick={()=>{setTasks([]);setSelected('');resetRedaction();}}>清空</button></div>{!tasks.length&&<p className="web-empty">导入文件后，结果会显示在这里。</p>}{tasks.map(t=><div className={'web-task '+(selected===t.id?'selected':'')} key={t.id}><button className="web-task-select" disabled={busy} onClick={()=>setSelected(t.id)}><strong>{t.file.name}</strong><small>{t.message}</small></button>{['pending','running'].includes(t.status)?<button onClick={()=>cancelTask(t.id)}>取消</button>:['error','cancelled'].includes(t.status)?<button onClick={()=>patch(t.id,{status:'pending',message:'等待重试'})}>重试</button>:null}</div>)}</section>
    <section className="web-card web-result"><div className="web-card-title"><h2>转换结果</h2><button onClick={()=>setSource(s=>!s)}>{source?'预览':'源码'}</button></div>{task?.result?<><div className="web-actions"><button onClick={()=>navigator.clipboard.writeText(task.result!.content).catch(()=>setError('无法访问剪贴板，请使用源码或下载'))}>复制</button><button className="web-primary" onClick={()=>exportConversion(task.file.name,task.result!)}>下载{task.result.assets.length?' ZIP':' Markdown'}</button><button onClick={()=>setPage('redact')}>脱敏审核</button></div>{task.result.warnings.map(w=><p className="web-warning" key={w}>{w}</p>)}<p className="web-meta">{task.result.engine} · {task.result.format} · {Math.round(task.result.elapsedMs)} ms · {task.result.assets.length} 个资源</p>{source?<pre className="web-source">{task.result.content}</pre>:<Preview content={task.result.content} assets={task.result.assets}/>}</>:<p className="web-empty">选择一份已完成的文件查看全文。</p>}</section></div>
   </>}
   {page==='redact'&&<>
    <h1>脱敏审核</h1><p>本地规则识别与自定义词替换。审核后分别下载恢复包和脱敏正文。</p>
    <div className="web-grid"><section className="web-card"><h2>选择文档与规则</h2><label>文档<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><option value="">请选择</option>{tasks.filter(t=>t.status==='done').map(t=><option key={t.id} value={t.id}>{t.file.name}</option>)}</select></label><div className="web-categories">{Object.entries(categoryLabels).map(([c,label])=><label className="web-check" key={c}><input type="checkbox" disabled={busy} checked={categories.includes(c)} onChange={e=>{setCategories(e.target.checked?[...categories,c]:categories.filter(x=>x!==c));resetRedaction();}}/>{label}</label>)}</div><label>自定义脱敏词（每行一个）<textarea value={keywords} disabled={busy} onChange={e=>{setKeywords(e.target.value);resetRedaction();}}/></label><label>白名单（每行一个）<textarea value={whitelist} disabled={busy} onChange={e=>{setWhitelist(e.target.value);resetRedaction();}}/></label><label>恢复包口令（至少8字符）<input type="password" autoComplete="new-password" value={password} disabled={busy} onChange={e=>{setPassword(e.target.value);resetRedaction();}}/></label><button className="web-primary" disabled={busy||!task?.result} onClick={performRedaction}>生成脱敏结果</button><p className="web-warning">人名、单位和项目名称请添加自定义词。图片与附件默认不进入脱敏导出。</p></section>
    <section className="web-card"><h2>全文对照与导出</h2>{redacted?<><p>替换 {redacted.occurrences} 处，{redacted.findings.length} 项。</p><details><summary>查看替换明细（含原始信息）</summary>{redacted.findings.map((f,i)=><p key={i}>{categoryLabels[f.category]??'自定义词'}：{f.original} × {f.count}</p>)}</details><div className="web-comparison"><details><summary>原文</summary><pre className="web-source">{task?.result?.content}</pre></details><pre className="web-source" aria-label="脱敏全文">{redacted.content}</pre></div><label>导出文件名（也可能含敏感信息）<input value={exportName} onChange={e=>{setExportName(e.target.value);setReviewed(false);setPack(null);setPackSaved(false);}} disabled={busy}/></label><label className="web-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>我已检查全文、文件名和替换结果</label><div className="web-actions"><button disabled={!reviewed||busy} onClick={savePack}>下载加密恢复包</button><button disabled={!pack||!packSaved||!reviewed||busy} onClick={()=>{download(markdownName(exportName),redacted.content);}}>下载已审核脱敏正文</button></div>{pack&&<label className="web-check"><input type="checkbox" checked={packSaved} onChange={e=>setPackSaved(e.target.checked)}/>恢复包已保存在安全位置（浏览器无法确认下载完成）</label>}{pack&&!packSaved&&<p className="web-warning">请先保存恢复包；关闭页面将清除本次原文与口令。</p>}</>:<p className="web-empty">生成结果后，在这里逐项审核。</p>}</section></div>
   </>}
   {page==='recovery'&&<>
    <h1>独立文件恢复</h1><p>无需转换历史。选择脱敏 Markdown 和对应恢复包，支持桌面 MAD-R1 / MAD-R2。</p><div className="web-grid"><section className="web-card"><label className="web-file">选择脱敏文件<input type="file" accept=".md,.txt" disabled={busy} onChange={e=>void readRecovery(e.target.files?.[0],'text')}/></label><label className="web-file">选择恢复 JSON<input type="file" accept=".json" disabled={busy} onChange={e=>void readRecovery(e.target.files?.[0],'pack')}/></label><label>恢复口令<input type="password" autoComplete="off" value={password} disabled={busy} onChange={e=>{setPassword(e.target.value);setRecovered(null);setRecoveryReviewed(false);}}/></label><button className="web-primary" disabled={busy||!recoveryText||!recoveryPack} onClick={performRecovery}>校验并预览恢复</button></section><section className="web-card"><h2>恢复预览</h2>{recovered?<><p>已恢复 {recovered.restored} 处。{recovered.integrity==='exact'?'完整导出文件校验通过':recovered.integrity==='legacy'?'旧版恢复包，缺少导出文件校验':'文件已编辑，请检查缺失或修改内容'}。</p>{recovered.missing>0&&<p className="web-warning">有 {recovered.missing} 个原占位符未出现在文件中。</p>}<pre className="web-source">{recovered.content}</pre><label className="web-check"><input type="checkbox" checked={recoveryReviewed} onChange={e=>setRecoveryReviewed(e.target.checked)}/>{recovered.integrity==='exact'?'我已审核恢复结果':'我确认文件可能已编辑，并已审核恢复结果'}</label><button className="web-primary" disabled={!recoveryReviewed} onClick={()=>download(markdownName(recoveryName).replace(/\.md$/,'.restored.md'),recovered.content)}>另存恢复文件</button></>:<p className="web-empty">通过校验后显示恢复结果。</p>}</section></div>
   </>}
   {page==='settings'&&<section className="web-card web-settings"><h1>设置与离线准备</h1><label>单文件大小上限（MB）<input type="number" min="1" max="100" value={limits.maxFileMB} onChange={e=>setLimits(l=>({...l,maxFileMB:Math.max(1,Math.min(100,Number(e.target.value)||1))}))}/></label><label>处理时间上限（秒）<input type="number" min="30" max="600" value={limits.timeoutSeconds} onChange={e=>setLimits(l=>({...l,timeoutSeconds:Math.max(30,Math.min(600,Number(e.target.value)||30))}))}/></label><p>上述设置从下一份文件开始生效。OCR 最多100页，图片最多2000万像素。</p><button className="web-primary" disabled={busy||!swReady} onClick={prepareOffline}>准备全部离线资源</button><p>{offline?'离线资源已缓存，仍可能被浏览器清理。':'基础页面与转换引擎会自动缓存；此按钮另外缓存 OCR 模型和 PDF 资源。'}</p><p>文档、映射明文与口令只保存在当前页面内存。所有模型从本站加载，不发送文档给外部服务。</p><button disabled={busy} onClick={()=>{active.current?.controller.abort();setTasks([]);setSelected('');setPassword('');setKeywords('');setWhitelist('');setRecoveryText('');setRecoveryPack(null);setRecovered(null);resetRedaction();}}>清除当前文档与口令</button></section>}
  </main><footer className="web-footer">MarkAllDown · 本地转换、人工审核、独立恢复</footer>
 </div>;
}
