import type { Block, Inline, Document, MarkerKind } from '@firecrawl/anydoc-wasm';
export interface AssetFile {name:string;mediaType:string;data:Uint8Array}
export interface Converted {content:string;assets:AssetFile[];warnings:string[];format:string;engine:string;elapsedMs:number}
const escape = (s:string) => s.replace(/([\\`*_[\]<>])/g,'\\$1');
const safe = (s:string) => s.replace(/[\s()<>]/g,c=>encodeURIComponent(c));
const ext:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','image/bmp':'bmp','image/tiff':'tiff'};
export function renderDocument(doc:Document): Pick<Converted,'content'|'assets'|'warnings'> {
 const warnings=new Set<string>(),assets:AssetFile[]=doc.assets.map(a=>({name:`assets/resource-${a.id}.${ext[a.mediaType]??'bin'}`,mediaType:a.mediaType,data:new Uint8Array(a.data)}));
 const byId=new Map(doc.assets.map((a,i)=>[a.id,assets[i]]));
 if(assets.length)warnings.add('资源保留原始内容，可能包含敏感信息；脱敏导出默认排除资源。');
 function inlines(items:Inline[]=[]):string {return items.map(i=>{
  switch(i.kind){
   case 'text': {let t=escape(i.text??'');if(i.style?.code){const fence='`'.repeat(Math.max(1,...[...(i.text??'').matchAll(/`+/g)].map(m=>m[0].length+1)));t=fence+' '+(i.text??'')+' '+fence;}else {if(i.style?.bold)t='**'+t+'**';if(i.style?.italic)t='*'+t+'*';if(i.style?.strike)t='~~'+t+'~~';}return t;}
   case 'lineBreak':return '  \n';
   case 'math':return '$'+(i.text??'')+'$';
   case 'checkbox':return i.checked?'[x] ':'[ ] ';
   case 'anchor': return `<a id="${escape(i.anchor??'')}"></a>`;
   case 'noteRef':return `[^${safe(i.noteId??'note')}]`;
   case 'link':return `[${inlines(i.content)}](${i.target?.kind==='anchor'?'#':''}${safe(i.target?.value??'')})`;
   case 'image': {
    if(i.source?.kind==='asset'){const a=byId.get(i.source.assetId!);if(a)return `![${escape(i.alt??'图片')}](${a.name})`;}
    if(i.source?.kind==='external'){warnings.add('外部图片未下载，离线预览不可用。');return `![${escape(i.alt??'图片')}](${safe(i.source.url??'')})`;}
    warnings.add('部分图片缺少可读取资源，仅保留说明。');return escape(i.alt??'[图片未提取]');
   }
  }
 }).join('');}
 function marker(kind:MarkerKind,n:number){
  if(kind==='bullet')return '-';
  if(kind==='lowerAlpha'||kind==='upperAlpha'){let s='';for(let k=n;k>0;k=Math.floor((k-1)/26))s=String.fromCharCode(97+(k-1)%26)+s;return (kind==='upperAlpha'?s.toUpperCase():s)+'.';}
  if(kind==='lowerRoman'||kind==='upperRoman'){let s='',k=n;for(const [v,t] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']] as const)while(k>=v){s+=t;k-=v;}return(kind==='lowerRoman'?s.toLowerCase():s)+'.';}
  return n+'.';
 }
 function blocks(items:Block[]=[]):string{return items.map(b=>{
  switch(b.kind){
   case 'heading':return (b.anchor?`<a id="${escape(b.anchor)}"></a>\n`:'')+'#'.repeat(Math.min(6,Math.max(1,b.level??1)))+' '+inlines(b.content);
   case 'paragraph':return inlines(b.content);
   case 'rule':return '---';
   case 'math':return '$$\n'+(b.text??'')+'\n$$';
   case 'codeBlock':{const fence='`'.repeat(Math.max(3,...[...(b.text??'').matchAll(/`+/g)].map(m=>m[0].length+1)));return fence+(b.lang??'').replace(/[\r\n`]/g,'')+'\n'+(b.text??'')+'\n'+fence;}
   case 'blockQuote':return blocks(b.blocks).split('\n').map(s=>'> '+s).join('\n');
   case 'list':return b.list?.items.map((item,i)=>{const m=item.markerLabel??marker(b.list!.marker,b.list!.start+i);return m+' '+blocks(item.blocks).split('\n').join('\n'+' '.repeat(m.length+1));}).join('\n')??'';
   case 'table':{
    const t=b.table!;if(t.kind==='layout')return t.grid.flatMap(row=>row.filter(s=>s.kind==='origin').map(s=>blocks(s.cell?.blocks))).join('\n\n');
    if(t.grid.some(row=>row.some(s=>s.kind==='covered'||(s.cell?.colSpan??1)>1||(s.cell?.rowSpan??1)>1)))warnings.add('合并单元格已展开，表格布局请对照原文件检查。');
    const width=Math.max(0,...t.grid.map(r=>r.length));if(!width)return '';
    const rows=t.grid.map(row=>Array.from({length:width},(_,i)=>row[i]?.kind==='origin'?blocks(row[i].cell?.blocks).replace(/\n/g,'<br>').replace(/\|/g,'\\|'):''));
    if(!t.headerRows)rows.unshift(Array(width).fill(''));
    return rows.map((r,i)=>'| '+r.join(' | ')+' |'+(i===0?'\n| '+Array(width).fill('---').join(' | ')+' |':'')).join('\n');
   }
  }
 }).join('\n\n');}
 let content=blocks(doc.blocks);
 for(const n of doc.notes)content+=`\n\n[^${safe(n.id)}]: `+blocks(n.blocks).split('\n').join('\n    ');
 const referenced=new Set<string>();for(const a of assets)if(content.includes(']('+a.name+')'))referenced.add(a.name);
 for(const a of assets)if(!referenced.has(a.name)){content+=`\n\n[嵌入资源](${a.name})`;warnings.add('部分嵌入对象作为附件保留，请单独检查。');}
 return {content,assets,warnings:[...warnings]};
}
