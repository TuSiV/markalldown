import { scryptAsync } from '@noble/hashes/scrypt.js';
import type { EncryptedVault, PrivacyOptions } from '../lib/privacyApi';
const enc = new TextEncoder();
const ID = /^[a-f0-9]{32}$/;
const HASH = /^[a-f0-9]{64}$/;
const tokens = /【MAD_[^】\n]{1,150}】/g;
const identities = /^<!-- MarkAllDown:document=([a-f0-9]{32});processing=([a-f0-9]{32}) -->\r?\n/gm;
export const categoryLabels: Record<string, string> = {phone:'手机号',email:'邮箱',id_card:'身份证号',bank_account:'银行账号',credit_code:'信用代码',case_number:'案号',date:'日期',amount:'金额',address:'地址',file_code:'文件编号'};
const patterns: Record<string, RegExp> = {
 phone: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
 email: /(?<![\p{L}\p{N}_.\-])[-+\p{L}\p{N}_.]+@[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+(?![\p{L}\p{N}_.\-])/giu,
 id_card: /(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g,
 bank_account: /(?:银行账号|收款账号|银行账户|账号|账户)\s*[：:]\s*(?<value>\d{12,19})(?!\d)/g,
 credit_code: /统一社会信用代码\s*[：:]\s*(?<value>[0-9A-HJ-NPQRTUWXY]{18})(?![A-Z0-9])/gi,
 case_number: /[（(](?:19|20)\d{2}[)）][^\n（）()]{1,16}?\d{1,10}号/g,
 date: /(?<!\d)(?:19|20)\d{2}[年/-](?:0?[1-9]|1[0-2])[月/-](?:0?[1-9]|[12]\d|3[01])日?(?!\d)/g,
 amount: /(?:人民币|￥|¥|RMB\s*|CNY\s*)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:亿元|万元|元)?/g,
 address: /(?:注册地址|办公地址|通讯地址|住所地|地址)\s*[：:]\s*(?<value>[^\n，,。；;]{4,80})/g,
 file_code: /(?:合同编号|文件编号|协议编号)\s*[：:]\s*(?<value>[A-Za-z0-9_./-]{4,60})/g,
};
export const newId = () => crypto.randomUUID().replace(/-/g, '');
export async function digest(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))), b=>b.toString(16).padStart(2,'0')).join(''); }
const b64 = (bytes: Uint8Array) => { let s=''; for (const b of bytes) s+=String.fromCharCode(b); return btoa(s); };
function unb64(s: unknown) { if(typeof s!=='string'||s.length>28_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('恢复包编码错误'); return Uint8Array.from(atob(s),c=>c.charCodeAt(0)); }
function checkPassword(password: string) { if(typeof password!=='string'||[...password].length<8||[...password].length>1024)throw Error('口令需为8至1024个字符'); }
async function key(password: string, salt: Uint8Array) {
 checkPassword(password);
 const raw = await scryptAsync(enc.encode(password),salt,{N:16384,r:8,p:1,dkLen:32});
 try { return await crypto.subtle.importKey('raw',raw as BufferSource,'AES-GCM',false,['encrypt','decrypt']); } finally { raw.fill(0); }
}
export async function seal(payload: unknown, password: string, version: string): Promise<EncryptedVault> {
 const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:enc.encode('MarkAllDown:'+version)},await key(password,salt),enc.encode(JSON.stringify(payload)));
 return {version,kdf:'scrypt-16384-8-1',cipher:'AES-256-GCM',salt:b64(salt),nonce:b64(nonce),data:b64(new Uint8Array(data))};
}
async function open(vault: EncryptedVault, password: string, version: string): Promise<any> {
 if(!vault||vault.version!==version||vault.kdf!=='scrypt-16384-8-1'||vault.cipher!=='AES-256-GCM')throw Error('不支持的恢复包协议');
 const salt=unb64(vault.salt),nonce=unb64(vault.nonce),data=unb64(vault.data);
 if(salt.length!==16||nonce.length!==12||data.length>20_000_000)throw Error('恢复包大小错误');
 try {
  const aad=version==='MAD-R1'?'MarkAllDown:RedactionVault:v1':'MarkAllDown:'+version;
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce as BufferSource,additionalData:enc.encode(aad)},await key(password,salt),data as BufferSource);
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 } catch { throw Error('口令错误或恢复包损坏'); }
}
export interface DocumentMapping {documentId:string;processingId:string;sourceHash:string;redactedHash:string;mapping:Record<string,string>}
export interface Redacted {content:string;vault:EncryptedVault;document:DocumentMapping;findings:Array<{category:string;original:string;count:number}>;occurrences:number}
export async function redact(content: string, options: PrivacyOptions, password: string): Promise<Redacted> {
 checkPassword(password);
 if(content.length>5_000_000||content.includes('<!-- MarkAllDown:'))throw Error('正文超限或已包含恢复标识，请使用原文');
 if(options.categories.length>10||options.categories.some(c=>!patterns[c]))throw Error('未知脱敏类别');
 for(const terms of [options.keywords,options.whitelist])if(terms.length>1000||terms.some(s=>!s.trim()||[...s].length>200))throw Error('自定义词或白名单超限');
 const exclusions=[...content.matchAll(/【MAD_[^】]{1,150}】/g)].map(m=>[m.index!,m.index!+m[0].length]);
 const literal=(term:string)=>new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');
 for(const term of options.whitelist)for(const m of content.matchAll(literal(term)))exclusions.push([m.index!,m.index!+term.length]);
 type Match={start:number;end:number;category:string;original:string;priority:number};
 const candidates:Match[]=[];
 const collect=(pattern:RegExp,category:string,priority:number)=>{
  for(const m of content.matchAll(pattern)){
   const original=m.groups?.value??m[0],start=m.index!+(m.groups?.value?m[0].lastIndexOf(original):0),end=start+original.length;
   if(!exclusions.some(([a,b])=>a<end&&b>start))candidates.push({start,end,original,category,priority});
   if(candidates.length>20_000)throw Error('匹配数量过多，请拆分文档');
  }
 };
 for(const term of [...new Set(options.keywords)])collect(literal(term),'keyword',0);
 for(const c of [...new Set(options.categories)])collect(patterns[c],c,1);
 candidates.sort((a,b)=>a.priority-b.priority||(b.end-b.start)-(a.end-a.start)||a.start-b.start);
 const selected:Match[]=[];
 for(const m of candidates)if(!selected.some(s=>s.start<m.end&&s.end>m.start))selected.push(m);
 selected.sort((a,b)=>a.start-b.start);
 const documentId=newId(),processingId=newId(),mapping:Record<string,string>={},used=new Map<string,string>(),counts:Record<string,number>={},findings=new Map<string,{category:string;original:string;count:number}>();
 let result='',last=0;
 for(const m of selected){
  const k=JSON.stringify([m.category,m.original]);let token=used.get(k);
  if(!token){counts[m.category]=(counts[m.category]??0)+1;token=`【MAD_${processingId}_${m.category.toUpperCase()}_${String(counts[m.category]).padStart(4,'0')}】`;used.set(k,token);mapping[token]=m.original;}
  result+=content.slice(last,m.start)+token;last=m.end;
  const f=findings.get(k)??{category:m.category,original:m.original,count:0};f.count++;findings.set(k,f);
 }
 result+=content.slice(last);
 const header=`<!-- MarkAllDown:document=${documentId};processing=${processingId} -->\n`;
 const fm=result.match(/^(?:\ufeff)?---\r?\n.*?\r?\n(?:---|\.\.\.)\r?\n/s);
 result=fm?result.slice(0,fm[0].length)+header+result.slice(fm[0].length):header+result;
 const document={documentId,processingId,sourceHash:await digest(content),redactedHash:await digest(result),mapping};
 return {content:result,vault:await seal(document,password,'MAD-R2'),document,findings:[...findings.values()].sort((a,b)=>b.count-a.count),occurrences:selected.length};
}
function validateMapping(mapping: any, prefix='【MAD_'): asserts mapping is Record<string,string> {
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||Object.entries(mapping).some(([k,v])=>!k.startsWith(prefix)||typeof v!=='string')||Object.keys(mapping).length>20_000)throw Error('恢复映射错误');
}
function validateDocument(d: DocumentMapping) {
 if(!ID.test(d.documentId)||!ID.test(d.processingId)||!HASH.test(d.sourceHash)||!HASH.test(d.redactedHash))throw Error('文档识别信息错误');
 validateMapping(d.mapping,`【MAD_${d.processingId}_`);
}
export async function buildPack(redacted: Redacted, password: string, filename: string) {
 const d=redacted.document,packId=newId();
 if(await digest(redacted.content)!==d.redactedHash)throw Error('审核内容已变更，请重新脱敏');
 const metadata={documentId:d.documentId,processingId:d.processingId,sourceHash:d.sourceHash,redactedHash:d.redactedHash};
 const manifest={packId,documents:[metadata],exports:[{exportId:newId(),name:filename,kind:'document',contentHash:d.redactedHash,documentIds:[d.documentId],processingIds:[d.processingId]}]};
 return {format:'MarkAllDownEncryptedVaultPack',version:2,packId,refs:[{documentId:d.documentId,processingId:d.processingId}],vaults:[redacted.vault],manifest:await seal(manifest,password,'MAD-M1')};
}
export async function recover(content:string,pack:any,password:string) {
 if(content.length>8_000_000||!pack||pack.format!=='MarkAllDownEncryptedVaultPack'||![1,2].includes(pack.version)||!Array.isArray(pack.vaults)||!pack.vaults.length||pack.vaults.length>100)throw Error('恢复包或正文超限');
 const documents:DocumentMapping[]=[],combined:Record<string,string>=Object.create(null);
 for(const v of pack.vaults){
  const payload=await open(v,password,v.version);
  let mapping:Record<string,string>;
  if(v.version==='MAD-R2'){validateDocument(payload);documents.push(payload);mapping=payload.mapping;}
  else if(v.version==='MAD-R1'){validateMapping(payload);mapping=payload;}
  else throw Error('不支持的恢复包版本');
  for(const [k,val] of Object.entries(mapping)){if(k in combined&&combined[k]!==val)throw Error('恢复包映射冲突');combined[k]=val;}
 }
 const known=new Map(documents.map(d=>[d.processingId,d]));
 if(known.size!==documents.length)throw Error('重复文档识别码');
 const headers=[...content.matchAll(identities)];
 const pids=[...new Set([...content.matchAll(/【MAD_([a-f0-9]{12}|[a-f0-9]{32})_/g)].map(m=>m[1]).concat(headers.map(m=>m[2])))];
 for(const h of headers)if(known.get(h[2])?.documentId!==h[1])throw Error('文件与恢复包不匹配');
 let manifest:any;
 if(pack.version===2){
  if(documents.length!==pack.vaults.length||!pids.length||pids.some(p=>!known.has(p)))throw Error('文件与恢复包不匹配');
  manifest=await open(pack.manifest,password,'MAD-M1');
  if(!ID.test(pack.packId)||manifest.packId!==pack.packId||!Array.isArray(manifest.documents)||manifest.documents.length!==documents.length||!Array.isArray(pack.refs)||pack.refs.length!==documents.length)throw Error('恢复清单不匹配');
  documents.forEach((d,i)=>{for(const k of ['documentId','processingId','sourceHash','redactedHash'] as const)if(manifest.documents[i]?.[k]!==d[k])throw Error('文档清单不匹配');if(pack.refs[i]?.processingId!==d.processingId||pack.refs[i]?.documentId!==d.documentId)throw Error('文档索引不匹配');});
  if(!Array.isArray(manifest.exports)||manifest.exports.length>100)throw Error('导出清单错误');
  for(const r of manifest.exports){
   if(!ID.test(r.exportId)||!HASH.test(r.contentHash)||typeof r.name!=='string'||r.name.length>4096||!['document','combined'].includes(r.kind)||!Array.isArray(r.processingIds)||!r.processingIds.length||r.processingIds.length>100||new Set(r.processingIds).size!==r.processingIds.length||!Array.isArray(r.documentIds)||r.documentIds.length!==r.processingIds.length||r.processingIds.some((p:string,i:number)=>!known.has(p)||known.get(p)!.documentId!==r.documentIds[i]))throw Error('导出清单不匹配');
  }
 }
 const body=documents.length?content.replace(identities,''):content;
 if(body.includes('<!-- MarkAllDown:'))throw Error('恢复标识损坏');
 let count=0,length=body.length;
 for(const m of body.matchAll(tokens)){if(!(m[0] in combined))throw Error('正文包含未知占位符，请检查恢复包');length+=combined[m[0]].length-m[0].length;if(length>32_000_000)throw Error('恢复结果过大');count++;}
 if(!count&&!headers.length&&Object.keys(combined).length)throw Error('正文未找到对应占位符');
 const result=body.replace(tokens,t=>combined[t]);
 const originalMatch=pids.length===1&&known.has(pids[0])?await digest(result)===known.get(pids[0])!.sourceHash:null;
 const contentHash=await digest(content);
 const record=manifest?.exports.find((r:any)=>r.contentHash===contentHash&&r.processingIds.length===pids.length&&r.processingIds.every((p:string)=>pids.includes(p)));
 if(record&&pids.length===1&&record.kind==='document'&&!originalMatch)throw Error('恢复结果未通过原文校验');
 const missing=Object.keys(combined).filter(t=>pids.some(p=>t.startsWith(`【MAD_${p}_`))&&!content.includes(t)).length;
 return {content:result,restored:count,missing,integrity:pack.version===1?'legacy':record?'exact':'edited',originalMatch};
}
