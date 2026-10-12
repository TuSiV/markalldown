import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { RecoveryPanel } from "../src/components/RecoveryPanel";
import { Header } from "../src/components/Header";
import { privacyApi } from "../src/lib/privacyApi";
import { useAppStore } from "../src/stores/appStore";
import { useI18n } from "../src/i18n";
import { save } from "@tauri-apps/plugin-dialog";
vi.mock("../src/lib/privacyApi", () => ({ privacyApi: { previewRecovery: vi.fn(), saveRecovery: vi.fn(), listLibrary: vi.fn(), findLibrary: vi.fn(), saveLibrary: vi.fn(), deleteLibrary: vi.fn() } }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(), confirm: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
function textFile(name: string, text: string) {
  const file = new File([text], name);
  Object.defineProperty(file, "text", { value: async () => text });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode(text).buffer });
  return file;
}
beforeEach(() => {
  vi.clearAllMocks();useI18n.setState({ locale: "zh-CN" });
  useAppStore.setState({ files: [], port: 1234, token: "token", isReady: true });
  vi.mocked(privacyApi.listLibrary).mockResolvedValue({ packs: [] });
  vi.mocked(privacyApi.previewRecovery).mockResolvedValue({ content: "Restored 13800138000", restored: 1, integrity: "exact", originalMatch: true, documentIds: ["doc"], processingIds: ["process"] });
  vi.mocked(privacyApi.saveRecovery).mockResolvedValue({ path: "/tmp/new.md" });
  vi.mocked(save).mockResolvedValue("/tmp/new.md");
});
afterEach(cleanup);
async function externalPreview(integrity: "exact" | "edited" | "legacy" = "exact") {
  vi.mocked(privacyApi.previewRecovery).mockResolvedValue({ content: "Restored 13800138000", restored: 1, integrity, originalMatch: integrity === "exact", documentIds: [], processingIds: [] });
  render(<RecoveryPanel onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("脱敏 Markdown 文件"), { target: { files: [textFile("renamed.md", "# redacted")] } });
  fireEvent.change(screen.getByLabelText("加密恢复包 JSON"), { target: { files: [textFile("pack.json", '{"format":"MarkAllDownEncryptedVaultPack","version":1,"vaults":[]}')] } });
  fireEvent.change(screen.getByLabelText("恢复包口令"), { target: { value: "secure password" } });
  fireEvent.click(screen.getByRole("button", { name: "预览恢复结果" }));
  await screen.findByText("Restored 13800138000");
}
describe("independent recovery workspace", () => {
  it("opens from the header without converted files", () => {
    const open = vi.fn();render(<Header onRecovery={open} onRedact={vi.fn()} onExport={vi.fn()} />);
    const button = screen.getByRole("button", { name: "文件恢复" });
    expect((button as HTMLButtonElement).disabled).toBe(false);fireEvent.click(button);expect(open).toHaveBeenCalledOnce();
  });
  it("requires full preview review and saves a new file using the original recovery request", async () => {
    await externalPreview();
    const button = screen.getByRole("button", { name: "另存恢复副本" });expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("我已检查恢复结果全文"));fireEvent.click(button);
    await waitFor(() => expect(privacyApi.saveRecovery).toHaveBeenCalledOnce());
    const body = vi.mocked(privacyApi.saveRecovery).mock.calls[0][1];
    expect(body.content).toBe("# redacted");expect(body.path).toBe("/tmp/new.md");expect(body.reviewed).toBe(true);expect(body.allowEdited).toBe(false);
  });
  it.each(["edited", "legacy"] as const)("requires acknowledgement for %s recovery and invalidates preview on password change", async kind => {
    await externalPreview(kind);fireEvent.click(screen.getByLabelText("我已检查恢复结果全文"));
    const button = screen.getByRole("button", { name: "另存恢复副本" });expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("我确认仅恢复已知占位符，不将结果视为原文完整性证明"));expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("恢复包口令"), { target: { value: "another password" } });
    await waitFor(() => expect(screen.queryByText("Restored 13800138000")).toBeNull());expect(privacyApi.saveRecovery).not.toHaveBeenCalled();
  });
  it("matches a retained encrypted pack without an external JSON or conversion records", async () => {
    const record = { packId: "a".repeat(32), savedAt: 1, documents: 2, legacy: false };
    vi.mocked(privacyApi.findLibrary).mockResolvedValue({ packs: [record] });
    vi.mocked(privacyApi.listLibrary).mockResolvedValue({ packs: [record] });
    render(<RecoveryPanel onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("脱敏 Markdown 文件"), { target: { files: [textFile("copy.md", "# redacted")] } });
    fireEvent.click(screen.getByRole("button", { name: "在本地恢复库匹配" }));
    await screen.findByLabelText("选择本地恢复包");
    fireEvent.change(screen.getByLabelText("恢复包口令"), { target: { value: "secure password" } });
    fireEvent.click(screen.getByRole("button", { name: "预览恢复结果" }));
    await waitFor(() => expect(privacyApi.previewRecovery).toHaveBeenCalledOnce());
    expect(vi.mocked(privacyApi.previewRecovery).mock.calls[0][1].libraryPackId).toBe(record.packId);
    expect(vi.mocked(privacyApi.previewRecovery).mock.calls[0][1].pack).toBeUndefined();
  });
});
