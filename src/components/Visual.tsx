import { FileText } from "lucide-react";
export function FileGlyph({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toUpperCase() || "FILE";
  const family = /PDF/.test(ext) ? 'pdf' : /DOC/.test(ext) ? 'word' : /XLS|CSV/.test(ext) ? 'sheet' : /PPT/.test(ext) ? 'slide' : 'text';
  return <span className={`file-glyph ${family}`} aria-hidden="true"><FileText size={20}/><small>{ext.slice(0,4)}</small></span>;
}
export function StatCard({ value, label, tone = "blue" }: { value: number | string; label: string; tone?: string }) {
  return <div className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
export function HighlightedText({ text, terms }: { text: string; terms: Array<{original: string; category: string}> }) {
  const values = [...new Set(terms.map(t => t.original).filter(Boolean))].sort((a,b)=>b.length-a.length);
  if (!values.length) return <>{text}</>;
  const escaped = values.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`,'g'));
  return <>{parts.map((part,index) => { const item = terms.find(t=>t.original===part);return item ? <mark key={index} title={item.category} className={`sensitive-mark mark-${item.category}`}>{part}</mark> : part; })}</>;
}
