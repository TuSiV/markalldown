import {zipSync,strToU8} from 'fflate';
import type {Converted} from './document';
export function markdownName(name:string){return (name.replace(/[\\/\x00-\x1f]/g,'_').replace(/\.[^.]+$/,'')||'document')+'.md';}
export function download(name:string,data:BlobPart|Uint8Array,type='text/markdown;charset=utf-8'){
 const blob=new Blob([data as BlobPart],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
export function exportConversion(name:string,result:Converted){
 const md=markdownName(name);
 if(!result.assets.length){download(md,result.content);return;}
 const files:Record<string,Uint8Array>={[md]:strToU8(result.content)};
 for(const asset of result.assets)files[asset.name]=asset.data;
 download(md.replace(/\.md$/,'.zip'),zipSync(files),'application/zip');
}
