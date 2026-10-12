import { FileText } from "lucide-react";
export function FileGlyph({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toUpperCase() || "FILE";
  const family = /PDF/.test(ext) ? 'pdf' : /DOC/.test(ext) ? 'word' : /XLS|CSV/.test(ext) ? 'sheet' : /PPT/.test(ext) ? 'slide' : 'text';
  return <span className={`file-glyph ${family}`} aria-hidden="true"><FileText size={20}/><small>{ext.slice(0,4)}</small></span>;
}
export function StatCard({ value, label, tone = "blue" }: { value: number | string; label: string; tone?: string }) {
  return <div className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
