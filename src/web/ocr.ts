import type {Converted} from './document';
export async function ocrFile(file:File,signal:AbortSignal,progress:(text:string)=>void,pdfPages?:number[]):Promise<Converted>{
 const start=performance.now(),base=new URL(import.meta.env.BASE_URL,location.href).href;
 const worker=new Worker(new URL('./ocr.worker.ts',import.meta.url),{type:'module'});
 // A supervisor owns the OCR worker, including its initialization. Terminating
 // it cancels nested workers even before Tesseract's async factory resolves.
 const abort=()=>worker.terminate();signal.addEventListener('abort',abort);
 function request<T>(data:unknown):Promise<T>{return new Promise((resolve,reject)=>{
  const cancel=()=>{signal.removeEventListener('abort',cancel);reject(new DOMException('已取消','AbortError'));};
  signal.addEventListener('abort',cancel);if(signal.aborted){cancel();return;}
  worker.onmessage=e=>{if(e.data.progress){progress(e.data.progress);return;}signal.removeEventListener('abort',cancel);e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};
  worker.onerror=()=>{signal.removeEventListener('abort',cancel);reject(Error('本地 OCR 引擎加载失败'));};worker.postMessage(data);
 });}
 async function recognize(image:HTMLCanvasElement|File){
  const blob=image instanceof File?image:await new Promise<Blob>((resolve,reject)=>image.toBlob(b=>b?resolve(b):reject(Error('无法读取页面图像'))));
  check();const text=await request<string>({operation:'recognize',bytes:new Uint8Array(await blob.arrayBuffer())});
  // Tesseract inserts word separators between individual Han glyphs. Keep
  // line boundaries and Latin/numeric separators; normalize only Han spaces.
  return text.replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu,'');
 }
 const check=()=>{if(signal.aborted)throw new DOMException('已取消','AbortError');};
 try {
  check();progress('加载本地中文 OCR 模型');
  await request({operation:'init',base});
  check();let content='';
  if(file.name.toLowerCase().endsWith('.pdf')){
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
   const {default:url}=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=url;
   const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:base+'pdf/cmaps/',cMapPacked:true,standardFontDataUrl:base+'pdf/fonts/',wasmUrl:base+'pdf/wasm/'});
   const abortPdf=()=>{void task.destroy();};signal.addEventListener('abort',abortPdf);
   try {
    const pdf=await task.promise;if(pdf.numPages>100)throw Error('OCR 最多处理100页，请拆分文件');
    const needs=pdfPages?new Set(pdfPages):undefined;
    for(let i=1;i<=pdf.numPages;i++){
     check();progress(`处理第 ${i}/${pdf.numPages} 页`);const page=await pdf.getPage(i);let text='';
     if(needs&&!needs.has(i)){const layer=await page.getTextContent();text=layer.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('');}
     else {
      const viewport=page.getViewport({scale:1});const scale=Math.min(2,Math.sqrt(8_000_000/(viewport.width*viewport.height)));
      const view=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
      const render=page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport:view});const cancel=()=>render.cancel();signal.addEventListener('abort',cancel);
      try{await render.promise;check();text=await recognize(canvas);}finally{signal.removeEventListener('abort',cancel);canvas.width=canvas.height=0;}
     }
     content+=`## 第 ${i} 页\n\n${text}\n\n`;page.cleanup();
    }
   } finally {signal.removeEventListener('abort',abortPdf);await task.destroy();}
  } else {
   const image=await createImageBitmap(file);try{if(image.width*image.height>20_000_000)throw Error('图片像素超过限制，请缩小后重试');content=await recognize(file);}finally{image.close();}
  }
  check();if(!content.trim())throw Error('OCR 未识别到文字');
  return {content,assets:[],format:file.name.toLowerCase().endsWith('.pdf')?'pdf':'image',engine:'tesseract-local',elapsedMs:performance.now()-start,warnings:['OCR 结果需对照原件审核，尤其是金额、日期及表格。图片未作为附件导出。']};
 } finally{signal.removeEventListener('abort',abort);worker.terminate();}
}
