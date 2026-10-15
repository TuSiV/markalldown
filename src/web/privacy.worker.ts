import {redact,recover,buildPack} from './privacy';
self.onmessage=async(e:MessageEvent)=>{
 try {const {operation,args}=e.data;let result;
  if(operation==='redact')result=await redact(args.content,args.options,args.password);
  else if(operation==='recover')result=await recover(args.content,args.pack,args.password);
  else if(operation==='pack')result=await buildPack(args.redacted,args.password,args.name);
  else throw Error('未知操作');
  self.postMessage({result});
 }catch(error){self.postMessage({error:(error as Error).message});}
};
