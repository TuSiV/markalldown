import {createWorker} from 'tesseract.js';
let engine:Awaited<ReturnType<typeof createWorker>>|undefined;
self.onmessage=async(event:MessageEvent<{operation:string;base?:string;bytes?:Uint8Array}>)=>{
 try{
  if(event.data.operation==='init'){
   const base=event.data.base!;
   engine=await createWorker('chi_sim+eng',1,{workerPath:base+'ocr/worker.min.js',corePath:base+'ocr/core',langPath:base+'ocr/lang',workerBlobURL:false,cacheMethod:'none',logger:m=>self.postMessage({progress:`OCR ${Math.round((m.progress??0)*100)}%`}),errorHandler:()=>self.postMessage({error:'本地 OCR 模型加载或识别失败，请检查离线资源'})});
   self.postMessage({result:true});
  }else if(event.data.operation==='recognize'){
   if(!engine)throw Error('OCR 尚未就绪');
   const result=await engine.recognize(new Blob([event.data.bytes!]));self.postMessage({result:result.data.text});
  }else throw Error('未知 OCR 操作');
 }catch(e){self.postMessage({error:(e as Error).message||String(e)});}
};
