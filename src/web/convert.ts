import {ocrFile} from './ocr';
import type {Converted} from './document';
export const extensions='.doc,.docx,.docm,.xls,.xlsx,.xlsm,.xlsb,.ppt,.pps,.pot,.pptx,.pptm,.ppsx,.ppsm,.odt,.ods,.odp,.rtf,.epub,.csv,.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp,.tiff';
export const defaultLimits={maxFileMB:30,timeoutSeconds:120};
export async function convert(file:File,signal:AbortSignal,progress:(text:string)=>void,ocr:boolean,limits=defaultLimits):Promise<Converted>{
 if(file.size>limits.maxFileMB*1024*1024)throw Error(`文件超过 ${limits.maxFileMB} MB 限制，请调整设置或拆分文件`);
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();signal.addEventListener('abort',abort);if(signal.aborted)abort();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},limits.timeoutSeconds*1000);
 try {
  const ext=file.name.split('.').pop()?.toLowerCase();
  if(['md','txt'].includes(ext??'')){
   const content=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
   if(controller.signal.aborted)throw new DOMException('已取消','AbortError');
   if(!content.trim())throw Error('文件没有正文');
   return {content,assets:[],warnings:[],engine:'utf8',format:ext!,elapsedMs:0};
  }
  if(['png','jpg','jpeg','webp','bmp','tiff'].includes(ext??'')){if(!ocr)throw Error('图片需要启用本地 OCR');return await ocrFile(file,controller.signal,progress);}
  progress('本地转换中');
  try {
   return await new Promise<Converted>((resolve,reject)=>{
    const worker=new Worker(new URL('./conversion.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();controller.signal.removeEventListener('abort',cancel);};
    const cancel=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};
    controller.signal.addEventListener('abort',cancel);if(controller.signal.aborted){cancel();return;}
    worker.onmessage=e=>{cleanup();e.data.error?reject(Object.assign(new Error(e.data.error),{code:e.data.code,pages:e.data.pages})):resolve(e.data.result);};
    worker.onerror=()=>{cleanup();reject(Error('本地引擎加载失败，请刷新或检查离线资源'));};
    file.arrayBuffer().then(buffer=>{if(!controller.signal.aborted)worker.postMessage({bytes:new Uint8Array(buffer),name:file.name},[buffer]);}).catch(e=>{cleanup();reject(e);});
   });
  } catch(e){
   const error=e as Error&{code?:string;pages?:number[]};
   if(error.code==='needsOcr'&&ocr)return await ocrFile(file,controller.signal,progress,error.pages);
   const messages:Record<string,string>={needsOcr:'扫描页需要启用本地 OCR 后重试',encrypted:'文件已加密，请解密后重试',resourceLimit:'文档解压或结构超过引擎限制，请拆分文件',malformed:'文档损坏或未提取到正文',unsupported:'引擎不支持该文件格式',missingPart:'文件缺少必要内容'};
   if(error.code&&messages[error.code])throw Error(messages[error.code]);throw e;
  }
 }catch(e){if(timedOut)throw Error('转换超时，请增加时间限制或拆分文件');throw e;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
