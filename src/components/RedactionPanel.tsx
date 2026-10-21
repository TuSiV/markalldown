import { X } from "lucide-react";
import { PrivacyPanel } from "./PrivacyPanel";
import { useI18n } from "../i18n";
export function RedactionPanel({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  const english = useI18n(s => s.locale) === "en-US";
  return <aside className="workspace-page redaction-page h-full">
    <div className="redaction-heading flex items-center justify-between p-4 border-b"><h2 className="text-2xl font-semibold text-slate-800">{english ? "Redaction review" : "脱敏审核"}</h2><button onClick={onClose} aria-label={english ? "Close redaction" : "关闭脱敏审核"}><X className="w-4 h-4" /></button></div>
    <div className="redaction-body"><PrivacyPanel onExport={onExport} /></div>
  </aside>;
}
