import {useWebT} from './i18n';
import {useI18n} from '../i18n';
import {useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {convert,extensions,defaultLimits} from './convert';
import type {Converted} from './document';
import {categoryLabels,type Redacted,newId} from './privacy';
import {privacyJob} from './privacyClient';
import {download,exportConversion,markdownName} from './download';
import {ArrowUpRight,ArrowRight,FileText,FileCheck2,ShieldCheck,Layers,LockKeyhole,Upload,Settings2,RotateCcw,Loader2,Download,Copy,Code2,Eye} from 'lucide-react';
import brandMark from '../assets/brand.svg';
import './web.css';
import {prepareOfflineResources,type OfflineProgress} from './offlinePreparation';
import {ensureOfflineService,offlineUnavailableReason} from './offlineService';
interface Task {id:string;file:File;status:'pending'|'running'|'done'|'error'|'cancelled';message:string;result?:Converted}
type Page='convert'|'redact'|'recovery'|'settings';
type Recovery={content:string;restored:number;missing:number;integrity:string;originalMatch:boolean|null};
function Preview({content,assets=[]}:{content:string;assets?:Converted['assets']}){
 const tr=useWebT();
 const [urls,setUrls]=useState<Record<string,string>>({});
 useEffect(()=>{const u:Record<string,string>={};for(const a of assets)if(['image/png','image/jpeg','image/gif','image/webp','image/bmp'].includes(a.mediaType))u[a.name]=URL.createObjectURL(new Blob([a.data as BlobPart],{type:a.mediaType}));setUrls(u);return()=>Object.values(u).forEach(URL.revokeObjectURL);},[assets]);
 return <div className="web-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{img:({src,alt})=>urls[src??'']?<img src={urls[src??'']} alt={alt}/>:<span className="web-warning">{tr("[图片未加载：")}{alt||tr("图片")}]</span>,a:({href,children})=><a href={/^(https?:|mailto:)/.test(href??'')?href:undefined} target="_blank" rel="noopener noreferrer">{children}</a>}}>{content}</ReactMarkdown></div>;
}
export default function WebApp(){
 const tr=useWebT();
 const locale=useI18n(s=>s.locale);
 useEffect(()=>{document.documentElement.lang=locale;},[locale]);
 const [page,setPage]=useState<Page>('convert'),[tasks,setTasks]=useState<Task[]>([]),[selected,setSelected]=useState(''),[source,setSource]=useState(false),[ocr,setOcr]=useState(false),[limits,setLimits]=useState(defaultLimits);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[password,setPassword]=useState(''),[keywords,setKeywords]=useState(''),[whitelist,setWhitelist]=useState(''),[categories,setCategories]=useState(['phone','email','id_card','bank_account','credit_code']);
 const [redacted,setRedacted]=useState<Redacted|null>(null),[reviewed,setReviewed]=useState(false),[pack,setPack]=useState<unknown>(null),[packSaved,setPackSaved]=useState(false),[exportName,setExportName]=useState('');
 const [recoveryText,setRecoveryText]=useState(''),[recoveryPack,setRecoveryPack]=useState<unknown>(null),[recoveryName,setRecoveryName]=useState('document.md'),[recoveryPackName,setRecoveryPackName]=useState(''),[recovered,setRecovered]=useState<Recovery|null>(null),[recoveryReviewed,setRecoveryReviewed]=useState(false);
 const recoveryInput=useRef<HTMLInputElement>(null),packInput=useRef<HTMLInputElement>(null);
 const input=useRef<HTMLInputElement>(null),active=useRef<{id:string;controller:AbortController}|null>(null),job=useRef<AbortController|null>(null),tasksRef=useRef(tasks),alive=useRef(true);
 const [dragging,setDragging]=useState(false);
 const [footerPrivacyOpen,setFooterPrivacyOpen]=useState(false);
 const [offlineProgress,setOfflineProgress]=useState<OfflineProgress|null>(null),[preparingOffline,setPreparingOffline]=useState(false);
 const [offline,setOffline]=useState(false),[offlineService,setOfflineService]=useState(tr("正在检查离线服务…")),[offlineUnavailable,setOfflineUnavailable]=useState<string|null>(null),[online,setOnline]=useState(navigator.onLine);
 const task=tasks.find(t=>t.id===selected);
 const hasTasks=tasks.length>0;
 const navigation=[{id:'convert' as Page,label:tr("文件转换"),icon:FileText},{id:'redact' as Page,label:tr("脱敏审核"),icon:ShieldCheck},{id:'recovery' as Page,label:tr("文件恢复"),icon:RotateCcw},{id:'settings' as Page,label:tr("设置"),icon:Settings2}];
 const patch=(id:string,fields:Partial<Task>)=>setTasks(ts=>ts.map(t=>t.id===id?{...t,...fields}:t));
 const resetRedaction=()=>{setRedacted(null);setReviewed(false);setPack(null);setPackSaved(false);};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.controller.abort();job.current?.abort();};},[]);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>{
  tasksRef.current=tasks;
  if(active.current)return;
  const next=tasks.find(t=>t.status==='pending');if(!next)return;
  const controller=new AbortController();active.current={id:next.id,controller};patch(next.id,{status:'running',message:tr("等待本地引擎")});
  convert(next.file,controller.signal,m=>patch(next.id,{message:m}),ocr,limits).then(result=>{if(alive.current)patch(next.id,{status:'done',result,message:result.warnings.length?tr("完成，请检查提示"):tr("完成")});}).catch(e=>{if(alive.current)patch(next.id,{status:e.name==='AbortError'?'cancelled':'error',message:e.message});}).finally(()=>{active.current=null;if(alive.current)setTasks(ts=>[...ts]);});
 },[tasks,ocr,limits]);
 useEffect(()=>{resetRedaction();setExportName(task?markdownName(task.file.name):'document.md');},[selected]);
 const add=(files:File[])=>{
  setError('');if(tasksRef.current.length+files.length>100){setError(tr("队列最多100个文件，请清空已完成任务后再导入"));return;}
  const added=files.map(file=>({id:newId(),file,status:'pending' as const,message:tr("等待转换")}));setTasks(ts=>[...ts,...added]);if(!selected&&added.length)setSelected(added[0].id);
 };
 const cancelTask=(id:string)=>{if(active.current?.id===id)active.current.controller.abort();patch(id,{status:'cancelled',message:tr("已取消")});};
 async function run(action:()=>Promise<void>){setBusy(true);setError('');job.current=new AbortController();try{await action();}catch(e){setError((e as Error).message);}finally{job.current=null;setBusy(false);}}
 const terms=(s:string)=>s.split(/\r?\n/).filter(s=>s.trim());
 const performRedaction=()=>run(async()=>{if(!task?.result)throw Error(tr("请先选择已转换的文件"));resetRedaction();const value=await privacyJob<Redacted>('redact',{content:task.result.content,options:{categories,keywords:terms(keywords),whitelist:terms(whitelist)},password},job.current!.signal);setRedacted(value);});
 const performRecovery=()=>run(async()=>{setRecovered(null);setRecoveryReviewed(false);setRecovered(await privacyJob<Recovery>('recover',{content:recoveryText,pack:recoveryPack,password},job.current!.signal));});
 const savePack=()=>run(async()=>{if(!redacted||!reviewed)throw Error(tr("请先审核"));const name=markdownName(exportName);const value=await privacyJob<unknown>('pack',{redacted,password,name},job.current!.signal);setPack(value);download('recovery-'+redacted.document.processingId+'.json',JSON.stringify(value,null,2),'application/json');});
 async function readRecovery(file:File|undefined,kind:'text'|'pack'){
  if(!file)return;setError('');setRecovered(null);setRecoveryReviewed(false);if(kind==='pack'){setRecoveryPack(null);setRecoveryPackName('');}else setRecoveryText('');
  try{if(file.size>(kind==='pack'?10_000_000:32_000_000))throw Error(tr("文件超过恢复大小限制"));const text=await file.text();if(kind==='pack'){setRecoveryPack(JSON.parse(text));setRecoveryPackName(file.name);}else{setRecoveryText(text);setRecoveryName(file.name);}}catch(e){setError((e as Error).message);}
 }
 const prepareOffline=()=>run(async()=>{
  setPreparingOffline(true);setOfflineProgress(null);setOfflineService(tr("正在启动离线服务…"));
  try{await prepareOfflineResources(job.current!.signal,setOfflineProgress);setOffline(true);setOfflineService(tr("离线资源已准备完成。"));}
  catch(error){setOfflineService((error as Error).message);throw error;}
  finally{setPreparingOffline(false);}
 });
 useEffect(()=>{
  const controller=new AbortController();
  const unavailable=offlineUnavailableReason();setOfflineUnavailable(unavailable);
  if(unavailable){setOfflineService(unavailable);return;}
  ensureOfflineService(controller.signal).then(async registration=>{
   if(controller.signal.aborted)return;
   setOfflineService(tr("离线服务已就绪。"));
   try{const cache=await caches.open('mad-ocr-v1');const ready=await cache.match(new URL('offline-ready',registration.scope));if(!controller.signal.aborted)setOffline(!!ready);}
   catch{if(!controller.signal.aborted)setOfflineService(tr("离线缓存无法读取，请检查浏览器的网站数据权限后重试。"));}
  }).catch(error=>{if(!controller.signal.aborted)setOfflineService(error.message);});
  return()=>controller.abort();
 },[]);
 return <div className={'web-app '+(page==='convert'&&!hasTasks?'web-landing':'')}>
  <header className="web-header"><div className="web-header-inner">
   <button className="web-brand" aria-label={tr("MarkAllDown 首页")} disabled={busy} onClick={()=>setPage('convert')}><span className="web-brand-mark" aria-hidden="true"><img src={brandMark} alt=""/></span><strong>MarkAll<span>Down</span></strong></button>
   <nav className="web-nav" aria-label={tr("工作空间")}>{navigation.map(({id,label,icon:Icon})=><button key={id} disabled={busy} aria-current={page===id?'page':undefined} onClick={()=>{setPage(id);setError('');}}><Icon aria-hidden="true" size={15}/>{label}</button>)}</nav>
   <div className="web-header-tools"><div className="web-language" role="group" aria-label="中文 / English"><button type="button" aria-pressed={locale==='zh-CN'} onClick={()=>useI18n.getState().setLocale('zh-CN')}>中文</button><button type="button" aria-pressed={locale==='en-US'} onClick={()=>useI18n.getState().setLocale('en-US')}>English</button></div><span className="web-badge"><span className="web-live-dot"/>{online?tr("文件留在此设备"):tr("离线模式")}</span></div>
  </div></header>
  <main className="web-main">
   {error&&<div role="alert" className="web-alert">{tr(error)}</div>}
   {busy&&<div className="web-status">
    <div className="web-status-heading"><strong role="status">{preparingOffline?tr("正在准备离线资源"):tr("本地处理中…")}</strong><button onClick={()=>job.current?.abort()}>{preparingOffline?tr("取消准备"):tr("取消处理")}</button></div>
    {preparingOffline&&<div className="web-offline-progress">
     <progress aria-label={tr("离线资源准备进度")} max={offlineProgress?.total||1} value={offlineProgress?offlineProgress.completed:undefined}/>
     <p>{offlineProgress?tr(`已准备 ${offlineProgress.completed} / ${offlineProgress.total} 项资源 · ${Math.floor(offlineProgress.completed/offlineProgress.total*100)}%`):tr("正在连接离线服务并读取资源清单…")}</p>
     <small>{offlineProgress?.current?tr(`正在下载或检查：${offlineProgress.current}`):tr("正在检查已缓存资源…")}</small>
     <small>{tr("按资源数量统计；大模型下载时进度可能暂时不变。取消后重试会复用已缓存资源。")}</small>
    </div>}
   </div>}
   {page==='convert'&&<>
    <section className={'web-intro '+(hasTasks?'web-intro-compact':'')}>
     <p className="web-eyebrow"><span/> A LITTLE LESS FORMATTING. A LOT MORE CLARITY.</p>
     <h1>{hasTasks?<>{tr("你的文档，已进入工作台。")}</>:<>{tr("把文件，变成")}<br/><span>{tr("清晰的 Markdown。")}</span></>}</h1>
     <p className="web-lede">{tr("从 Word、PDF 到图片，整理成便于阅读、编辑与分享的文字。")}<br className="web-desktop-break"/>{tr("转换、审核与恢复，都在你的设备上完成。")}</p>
     {!hasTasks&&<div className="web-trust-strip"><span><ShieldCheck size={15} aria-hidden="true"/>{tr("本地处理")}</span><span><Layers size={15} aria-hidden="true"/>{tr("多格式转换")}</span><span><LockKeyhole size={15} aria-hidden="true"/>{tr("可审核脱敏")}</span></div>}
    </section>
    <section className={'web-drop '+(hasTasks?'web-drop-compact ':'')+(dragging?'is-dragging':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={e=>{if(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);add(Array.from(e.dataTransfer.files));}}>
     {!hasTasks&&<div className="web-drop-top"><span>01 / IMPORT</span><span>YOUR FILE → YOUR MARKDOWN</span></div>}
     {!hasTasks&&<div className="web-document-pair" aria-hidden="true"><span className="web-document-original"><FileText size={23}/><small>DOC · PDF</small></span><ArrowRight size={22}/><span className="web-document-md"><img src={brandMark} alt=""/><small>MARKDOWN</small></span></div>}
     <div className="web-import-content"><h2>{hasTasks?tr("继续添加文件"):tr("文档的下一种可能")}</h2><p>{hasTasks?tr("加入当前队列，逐个转换。"):tr("拖入你的文件，剩下的交给这里。")}</p></div>
     <button className="web-primary web-import-button" onClick={()=>input.current?.click()}><Upload size={17} aria-hidden="true"/>{tr("选择文件")}<ArrowUpRight size={18} aria-hidden="true"/></button>
     <input ref={input} type="file" multiple accept={extensions} hidden onChange={e=>{add(Array.from(e.target.files??[]));e.target.value='';}}/>
     <div className="web-import-options"><label className="web-check web-ocr-toggle"><input type="checkbox" checked={ocr} onChange={e=>setOcr(e.target.checked)}/><span>{tr("扫描件 / 图片使用本地 OCR")}</span></label><details className="web-formats"><summary>{tr("支持格式与限制")}</summary><p>{extensions}</p><p>{tr("每个文件")}{limits.maxFileMB} {tr("MB，队列最多100个。扫描件开启 OCR 后处理。")}</p></details></div>
     {!hasTasks&&<div className="web-format-strip" aria-label={tr("常见支持格式")}>{['DOCX','PDF','XLSX','PPTX','DOC',tr("图片")].map(f=><span key={f}>{f}</span>)}<span className="web-format-more">& MORE</span></div>}
    </section>
    {!hasTasks&&<section className="web-feature-row"><div><FileCheck2 size={20} aria-hidden="true"/><h3>{tr("保留有用的结构")}</h3><p>{tr("标题、列表与表格，")}<br/>{tr("让内容继续发挥价值。")}</p></div><div><ShieldCheck size={20} aria-hidden="true"/><h3>{tr("先审核，再分享")}</h3><p>{tr("检查敏感文字的替换结果，")}<br/>{tr("确认后导出脱敏正文。")}</p></div><div><RotateCcw size={20} aria-hidden="true"/><h3>{tr("原文，随时可找回")}</h3><p>{tr("妥善保存加密恢复包，")}<br/>{tr("需要时独立恢复文字。")}</p></div></section>}
    {hasTasks&&<div className={'web-grid web-conversion-grid '+(tasks.length===1?'web-single':'')}>
<section className="web-card web-queue"><div className="web-card-title"><h2>{tr("转换队列")}<small>{tasks.length}</small></h2><button disabled={tasks.some(t=>['pending','running'].includes(t.status))||busy} onClick={()=>{setTasks([]);setSelected('');resetRedaction();}}>{tr("清空")}</button></div>{!tasks.length&&<p className="web-empty">{tr("导入文件后，结果会显示在这里。")}</p>}<div className="web-task-list">{tasks.map(t=><div className={'web-task '+(selected===t.id?'selected':'')} key={t.id}><button className="web-task-select" disabled={busy} onClick={()=>setSelected(t.id)}><span className="web-file-icon" aria-hidden="true">{t.status==='running'?<Loader2 size={18} className="web-spin"/>:t.status==='done'?<FileCheck2 size={18}/>:<FileText size={18}/>}</span><span><strong>{t.file.name}</strong><small>{tr(t.message)}</small></span></button>{['pending','running'].includes(t.status)?<button onClick={()=>cancelTask(t.id)}>{tr("取消")}</button>:['error','cancelled'].includes(t.status)?<button onClick={()=>patch(t.id,{status:'pending',message:tr("等待重试")})}>{tr("重试")}</button>:null}</div>)}</div></section>
    <section className="web-card web-result"><div className="web-card-title"><div><p className="web-eyebrow">02 / YOUR MARKDOWN</p><h2>{tr("转换结果")}</h2></div><button onClick={()=>setSource(s=>!s)}>{source?<Eye size={15} aria-hidden="true"/>:<Code2 size={15} aria-hidden="true"/>}{source?tr("预览"):tr("源码")}</button></div>{task?.result?<><div className="web-actions"><button onClick={()=>navigator.clipboard.writeText(task.result!.content).catch(()=>setError(tr("无法访问剪贴板，请使用源码或下载")))}><Copy size={15} aria-hidden="true"/>{tr("复制")}</button><button className="web-primary" onClick={()=>exportConversion(task.file.name,task.result!)}><Download size={15} aria-hidden="true"/>{tr("下载")}{task.result.assets.length?' ZIP':' Markdown'}</button><button onClick={()=>setPage('redact')}><ShieldCheck size={15} aria-hidden="true"/>{tr("脱敏审核")}</button></div>{task.result.warnings.map(w=><p className="web-warning" key={tr(w)}>{tr(w)}</p>)}<p className="web-meta" data-engine={task.result.engine} data-format={task.result.format}>{task.result.format.toUpperCase()} · {Math.round(task.result.elapsedMs)} ms · {task.result.assets.length} {tr("个资源")}</p>{source?<pre className="web-source">{task.result.content}</pre>:<Preview content={task.result.content} assets={task.result.assets}/>}</>:<div className="web-processing" role="status">{task?.status==='running'||task?.status==='pending'?<><Loader2 size={30} className="web-spin" aria-hidden="true"/><h3>{tr("正在整理你的文档")}</h3><p>{tr(task.message)}</p><span className="web-processing-line"/></>:<><FileText size={30} aria-hidden="true"/><h3>{task?.status==='error'?tr("这份文件需要再检查"):tr("选择文件，查看结果")}</h3><p>{task?.status==='error'?task.message:tr("选择队列中的文件，查看转换后的全文。")}</p></>}</div>}</section></div>}
   </>}
   {page==='redact'&&<>
    <div className="web-page-heading"><p className="web-eyebrow">REVIEW BEFORE YOU SHARE</p><h1>{tr("脱敏审核")}<span>{tr("让分享更从容。")}</span></h1><p>{tr("逐项检查敏感信息，确认后分别保存恢复包与脱敏正文。")}</p></div>
    <div className="web-grid"><section className="web-card"><h2>{tr("选择文档与规则")}</h2><label>{tr("文档")}<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><option value="">{tr("请选择")}</option>{tasks.filter(t=>t.status==='done').map(t=><option key={t.id} value={t.id}>{t.file.name}</option>)}</select></label><div className="web-categories">{Object.entries(categoryLabels).map(([c,label])=><label className="web-check" key={c}><input type="checkbox" disabled={busy} checked={categories.includes(c)} onChange={e=>{setCategories(e.target.checked?[...categories,c]:categories.filter(x=>x!==c));resetRedaction();}}/>{tr(label)}</label>)}</div><label>{tr("自定义脱敏词（每行一个）")}<textarea value={keywords} disabled={busy} onChange={e=>{setKeywords(e.target.value);resetRedaction();}}/></label><label>{tr("白名单（每行一个）")}<textarea value={whitelist} disabled={busy} onChange={e=>{setWhitelist(e.target.value);resetRedaction();}}/></label><label>{tr("恢复包口令（至少8字符）")}<input type="password" autoComplete="new-password" value={password} disabled={busy} onChange={e=>{setPassword(e.target.value);resetRedaction();}}/></label><button className="web-primary" disabled={busy||!task?.result} onClick={performRedaction}>{tr("生成脱敏结果")}</button><p className="web-warning">{tr("人名、单位和项目名称请添加自定义词。图片与附件默认不进入脱敏导出。")}</p></section>
    <section className="web-card"><h2>{tr("全文对照与导出")}</h2>{redacted?<><p>{tr("替换")}{' '}{redacted.occurrences} {tr("处，")}{redacted.findings.length} {tr("项。")}</p><details><summary>{tr("查看替换明细（含原始信息）")}</summary>{redacted.findings.map((f,i)=><p key={i}>{tr(categoryLabels[f.category]??'自定义词')}：{f.original} × {f.count}</p>)}</details><div className="web-comparison"><details><summary>{tr("原文")}</summary><pre className="web-source">{task?.result?.content}</pre></details><pre className="web-source" aria-label={tr("脱敏全文")}>{redacted.content}</pre></div><label>{tr("导出文件名（也可能含敏感信息）")}<input value={exportName} onChange={e=>{setExportName(e.target.value);setReviewed(false);setPack(null);setPackSaved(false);}} disabled={busy}/></label><label className="web-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>{tr("我已检查全文、文件名和替换结果")}</label><div className="web-actions"><button disabled={!reviewed||busy} onClick={savePack}>{tr("下载加密恢复包")}</button><button disabled={!pack||!packSaved||!reviewed||busy} onClick={()=>{download(markdownName(exportName),redacted.content);}}>{tr("下载已审核脱敏正文")}</button></div>{pack&&<label className="web-check"><input type="checkbox" checked={packSaved} onChange={e=>setPackSaved(e.target.checked)}/>{tr("恢复包已保存在安全位置（浏览器无法确认下载完成）")}</label>}{pack&&!packSaved&&<p className="web-warning">{tr("请先保存恢复包；关闭页面将清除本次原文与口令。")}</p>}</>:<p className="web-empty">{tr("生成结果后，在这里逐项审核。")}</p>}</section></div>
   </>}
   {page==='recovery'&&<>
    <div className="web-page-heading"><p className="web-eyebrow">BRING YOUR WORDS BACK</p><h1>{tr("文件恢复")}<span>{tr("找回原来的文字。")}</span></h1><p>{tr("选择脱敏文件与对应恢复包，校验、预览，再另存。")}</p></div><div className="web-grid"><section className="web-card"><div className="web-file" role="group"><span className="web-step-number">01</span><strong>{tr("选择脱敏文件")}</strong><span className="web-file-hint">{tr("导入需要恢复的 Markdown")}</span><div className="web-file-choice"><button type="button" disabled={busy} onClick={e=>{e.preventDefault();recoveryInput.current?.click();}}>{tr("选择脱敏文件")}<ArrowUpRight size={14} aria-hidden="true"/></button><span>{recoveryText?recoveryName:tr("尚未选择文件")}</span></div><input hidden ref={recoveryInput} aria-label={tr("选择脱敏文件")} type="file" accept=".md,.txt" disabled={busy} onChange={e=>void readRecovery(e.target.files?.[0],'text')}/></div><div className="web-file" role="group"><span className="web-step-number">02</span><strong>{tr("选择恢复 JSON")}</strong><span className="web-file-hint">{tr("导入对应的加密恢复包")}</span><div className="web-file-choice"><button type="button" disabled={busy} onClick={e=>{e.preventDefault();packInput.current?.click();}}>{tr("选择恢复 JSON")}<ArrowUpRight size={14} aria-hidden="true"/></button><span>{recoveryPackName||tr("尚未选择恢复包")}</span></div><input hidden ref={packInput} aria-label={tr("选择恢复 JSON")} type="file" accept=".json" disabled={busy} onChange={e=>void readRecovery(e.target.files?.[0],'pack')}/></div><label>{tr("恢复口令")}<input type="password" autoComplete="off" value={password} disabled={busy} onChange={e=>{setPassword(e.target.value);setRecovered(null);setRecoveryReviewed(false);}}/></label><button className="web-primary" disabled={busy||!recoveryText||!recoveryPack} onClick={performRecovery}>{tr("校验并预览恢复")}</button></section><section className="web-card"><h2>{tr("恢复预览")}</h2>{recovered?<><p>{tr("已恢复")}{recovered.restored} {tr("处。")}{recovered.integrity==='exact'?tr("完整导出文件校验通过"):recovered.integrity==='legacy'?tr("旧版恢复包，缺少导出文件校验"):tr("文件已编辑，请检查缺失或修改内容")}。</p>{recovered.missing>0&&<p className="web-warning">{tr("有")}{recovered.missing} {tr("个原占位符未出现在文件中。")}</p>}<pre className="web-source">{recovered.content}</pre><label className="web-check"><input type="checkbox" checked={recoveryReviewed} onChange={e=>setRecoveryReviewed(e.target.checked)}/>{recovered.integrity==='exact'?tr("我已审核恢复结果"):tr("我确认文件可能已编辑，并已审核恢复结果")}</label><button className="web-primary" disabled={!recoveryReviewed} onClick={()=>download(markdownName(recoveryName).replace(/\.md$/,'.restored.md'),recovered.content)}>{tr("另存恢复文件")}</button></>:<p className="web-empty">{tr("通过校验后显示恢复结果。")}</p>}</section></div>
   </>}
   {page==='settings'&&<section className="web-card web-settings"><p className="web-eyebrow">MAKE IT YOURS</p><h1>{tr("设置与离线准备")}</h1><label>{tr("单文件大小上限（MB）")}<input type="number" min="1" max="100" value={limits.maxFileMB} onChange={e=>setLimits(l=>({...l,maxFileMB:Math.max(1,Math.min(100,Number(e.target.value)||1))}))}/></label><label>{tr("处理时间上限（秒）")}<input type="number" min="30" max="600" value={limits.timeoutSeconds} onChange={e=>setLimits(l=>({...l,timeoutSeconds:Math.max(30,Math.min(600,Number(e.target.value)||30))}))}/></label><p>{tr("上述设置从下一份文件开始生效。OCR 最多100页，图片最多2000万像素。")}</p><button className="web-primary" disabled={busy||!!offlineUnavailable} onClick={prepareOffline} aria-describedby="offline-service-status">{preparingOffline?tr("正在准备…"):tr("准备全部离线资源")}</button><p id="offline-service-status" role="status">{tr(offlineService)}</p><p>{offline?tr("离线资源已缓存，仍可能被浏览器清理。"):tr("基础页面与转换引擎会自动缓存；此按钮另外缓存 OCR 模型和 PDF 资源。")}</p><p>{tr("文档、映射明文与口令只保存在当前页面内存。所有模型从本站加载，不发送文档给外部服务。")}</p><button disabled={busy} onClick={()=>{active.current?.controller.abort();setTasks([]);setSelected('');setPassword('');setKeywords('');setWhitelist('');setRecoveryText('');setRecoveryPack(null);setRecoveryPackName('');setRecovered(null);resetRedaction();}}>{tr("清除当前文档与口令")}</button></section>}
  </main><footer className="web-footer">
   <div className="web-footer-top"><div className="web-footer-brand"><strong>MarkAllDown</strong><span>{tr("把内容留下，把格式放下。")}</span></div><span className="web-footer-trust"><ShieldCheck size={13} aria-hidden="true"/>{tr("本地转换 · 人工审核 · 独立恢复")}</span></div>
   <div className="web-footer-bottom"><span>© 2026 YONGZHE CHEN · {tr("基于 MIT 许可证开源")}</span><div className="web-footer-links" role="group" aria-label={tr("项目链接")}>
    <a href="https://github.com/TuSiV/markalldown" target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={12} aria-hidden="true"/></a>
    <a href="https://github.com/TuSiV/markalldown/releases" target="_blank" rel="noopener noreferrer">{tr("下载桌面版")}</a>
    <a href="https://github.com/TuSiV/markalldown/issues" target="_blank" rel="noopener noreferrer">{tr("问题反馈")}</a>
    <a href={import.meta.env.BASE_URL+'LICENSE.txt'} target="_blank" rel="noopener noreferrer">{tr("开源许可")}</a>
    <a href={import.meta.env.BASE_URL+'THIRD_PARTY_NOTICES.txt'} target="_blank" rel="noopener noreferrer">{tr("第三方许可")}</a>
    <button type="button" className="web-footer-data-toggle" aria-expanded={footerPrivacyOpen} aria-controls="web-footer-data" onClick={()=>setFooterPrivacyOpen(open=>!open)}><span>{tr("数据处理说明")}</span><span aria-hidden="true">{footerPrivacyOpen?'−':'+'}</span></button>
   </div></div>
   <div id="web-footer-data" className="web-footer-privacy" hidden={!footerPrivacyOpen}><div>
    <p>{tr("文件转换、OCR、脱敏与恢复在当前浏览器中处理；文档内容不会上传到本站服务器。首次使用和离线准备会从本站下载引擎与模型。")}</p>
    <p>{tr("文档、映射明文与口令仅保留在当前页面内存；刷新或关闭页面后清除。离线缓存保存应用、引擎和模型，浏览器可能清理缓存。界面语言偏好保存在本机。")}</p>
    <p>{tr("下载结果与恢复包由你自行保管。普通导出包含原文，脱敏结果须人工检查；恢复包不能重建原始 Word 或 PDF。")}</p>
    <a href="https://github.com/TuSiV/markalldown/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">{tr("完整安全与隐私说明")}</a>
   </div></div>
  </footer>
 </div>;
}

