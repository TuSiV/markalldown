import init,{formatFromBytes,formatFromPath,toMarkdownBytes,toDocument} from '@firecrawl/anydoc-wasm';
import {renderDocument, type Converted} from './document';
const loaded=init();
self.onmessage=async(event:MessageEvent<{bytes:Uint8Array;name:string}>)=>{
 const start=performance.now();
 try {
  await loaded;
  const {bytes,name}=event.data;
  const format=formatFromBytes(bytes)??formatFromPath(name);
  if(!format)throw Error('不支持的文件格式');
  const result:Converted=format==='pdf'?{content:toMarkdownBytes(bytes,format),assets:[],warnings:['PDF 图片、批注与复杂阅读顺序请对照原件检查。'],format,engine:'anydoc-wasm',elapsedMs:0}:{...renderDocument(toDocument(bytes,format)),format,engine:'anydoc-wasm',elapsedMs:0};
  if(!result.content.trim())throw Error('未提取到正文');
  result.elapsedMs=performance.now()-start;
  self.postMessage({result});
 } catch(e){const error=e as Error&{code?:string;pages?:number[]};self.postMessage({error:error.message,code:error.code,pages:error.pages});}
};
