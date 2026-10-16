import {useCallback} from 'react';
import {useI18n,type Locale} from '../i18n';
import {webMessages} from './messages';

const originals = new Map(Object.entries(webMessages).map(([zh,en])=>[en,zh]));
export function translateWeb(text:string,locale:Locale):string {
  const original = originals.get(text) ?? text;
  if(locale==='zh-CN')return original;
  if(webMessages[original])return webMessages[original];
  // Only generated progress/diagnostic strings enter this function. File names,
  // converted Markdown, redaction originals and restored content stay untouched.
  const prepared=original.match(/^已准备 (\d+) \/ (\d+) 项资源 · (\d+)%$/);
  if(prepared)return `Prepared ${prepared[1]} / ${prepared[2]} resources · ${prepared[3]}%`;
  if(original.startsWith('正在下载或检查：'))return 'Downloading or checking: '+original.slice('正在下载或检查：'.length);
  const page=original.match(/^处理第 (\d+)\/(\d+) 页$/);
  if(page)return `Processing page ${page[1]}/${page[2]}`;
  const size=original.match(/^文件超过 (.+) MB 限制，请调整设置或拆分文件$/);
  if(size)return `The file exceeds the ${size[1]} MB limit. Adjust settings or split the file.`;
  const offline=original.match(/^离线服务启动失败：([\s\S]*)。请保持联网，并在浏览器普通窗口中重试。$/);
  if(offline)return `Offline service failed to start: ${offline[1]}. Stay online and retry in a regular browser window.`;
  return original;
}
export function useWebT(){
  const locale=useI18n(s=>s.locale);
  return useCallback((text:string)=>translateWeb(text,locale),[locale]);
}
