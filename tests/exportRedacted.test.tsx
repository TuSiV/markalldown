import { createHash, webcrypto } from "node:crypto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { exportRedacted } from "../src/lib/exportRedacted";
import { useAppStore } from "../src/stores/appStore";
import { usePrivacyStore, defaultPrivacySettings, policyKey } from "../src/stores/privacyStore";
import { privacyApi } from "../src/lib/privacyApi";
import { api } from "../src/lib/api";
vi.mock("../src/lib/api", () => ({ api: { readCachedText: vi.fn() } }));
vi.mock("../src/lib/privacyApi", () => ({ privacyApi: { exportReviewed: vi.fn() } }));
const conn = { port: 1234, token: "token" };
const source = "Phone 13800138000";
beforeEach(() => {
  vi.clearAllMocks();vi.stubGlobal("crypto", webcrypto);
  useAppStore.setState({ privacyEnabled: true, files: [{ id: "one", name: "private.md", size: 1, type: "md", status: "done", progress: 100, cachePath: "/one" }] });
  usePrivacyStore.setState({ ...defaultPrivacySettings, passphrase: "secure password", preparedFiles: {} });
  const settings = usePrivacyStore.getState();
  settings.setPreparedFiles({ one: { fileId: "one", optionsKey: policyKey(settings), passphrase: settings.passphrase, cachePath: "/one", original: source, approved: true,
    value: { documentId: "a".repeat(32), processingId: "b".repeat(32), content: "Reviewed redacted text", sourceHash: createHash("sha256").update(source).digest("hex"),
      vault: { version: "MAD-R2", kdf: "scrypt-16384-8-1", cipher: "AES-256-GCM", salt: "", nonce: "", data: "" }, summary: { occurrences: 1, unique: 1, categories: {}, findings: [] } } } });
  vi.mocked(api.readCachedText).mockResolvedValue(source);
  vi.mocked(privacyApi.exportReviewed).mockResolvedValue({ path: "/output", vaultPath: "/pack.json", files: 1, packId: "a".repeat(32), libraryPackId: null });
});
afterEach(() => vi.unstubAllGlobals());
it("exports the approved snapshot using a version-2 batch pack, without retaining a library entry by default", async () => {
  await exportRedacted(conn, "/output", useAppStore.getState().exportOptions);
  const body = vi.mocked(privacyApi.exportReviewed).mock.calls[0][1] as any;
  expect(body.files[0].content).toBe("Reviewed redacted text");expect(body.files[0].name).toBe("document_0001.md");
  expect(body.pack.version).toBe(2);expect(body.pack.vaults).toHaveLength(1);expect(body.saveToLibrary).toBe(false);
});
it("blocks export when cached source no longer matches the reviewed text", async () => {
  vi.mocked(api.readCachedText).mockResolvedValue("Changed source");
  await expect(exportRedacted(conn, "/output", useAppStore.getState().exportOptions)).rejects.toThrow(/Source changed/);
  expect(privacyApi.exportReviewed).not.toHaveBeenCalled();
  expect(usePrivacyStore.getState().preparedFiles.one).toBeUndefined();
});
it("blocks stale retention consent if the library choice changes during source verification", async () => {
  vi.mocked(api.readCachedText).mockImplementation(async () => { usePrivacyStore.getState().updateSettings({ saveToLibrary: true }); return source; });
  await expect(exportRedacted(conn, "/output", useAppStore.getState().exportOptions)).rejects.toThrow(/Review state changed/);
  expect(privacyApi.exportReviewed).not.toHaveBeenCalled();
});
