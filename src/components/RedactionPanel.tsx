import { X } from "lucide-react";
import { PrivacyPanel } from "./PrivacyPanel";
import { useI18n } from "../i18n";
export function RedactionPanel({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  const english = useI18n(s => s.locale) === "en-US";
  return <aside className="w-[520px] max-w-[65vw] border-l bg-white flex flex-col">
    <div className="flex items-center justify-between p-4 border-b"><h2 className="font-semibold">{english ? "Redaction review" : "脱敏审核"}</h2><button onClick={onClose} aria-label={english ? "Close redaction" : "关闭脱敏审核"}><X className="w-4 h-4" /></button></div>
    <div className="overflow-y-auto p-4"><PrivacyPanel onExport={onExport} /></div>
  </aside>;
}
