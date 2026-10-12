import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPanel } from "../src/components/PrivacyPanel";
import { useAppStore } from "../src/stores/appStore";
import { usePrivacyStore, defaultPrivacySettings } from "../src/stores/privacyStore";
import { useI18n } from "../src/i18n";
import { api } from "../src/lib/api";
import { privacyApi } from "../src/lib/privacyApi";
vi.mock("../src/lib/api", () => ({ api: { readCachedText: vi.fn() } }));
vi.mock("../src/lib/privacyApi", () => ({ privacyApi: { redact: vi.fn(), suggest: vi.fn(), exportReviewed: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const vault = { version: "MAD-R1", kdf: "scrypt-16384-8-1", cipher:"AES-256-GCM",salt:"",nonce:"",data:"" };
beforeEach(() => {
  vi.clearAllMocks();
  usePrivacyStore.setState({ ...defaultPrivacySettings, preparedFiles: {} });
  useI18n.setState({locale:"zh-CN"});
  useAppStore.setState({ port:1234, token:"token", privacyEnabled:false, files:[
    {id:"one",name:"secret-one.txt",status:"done",cachePath:"/one",size:1,type:"txt",progress:100},
    {id:"two",name:"secret-two.txt",status:"done",cachePath:"/two",size:1,type:"txt",progress:100},
  ] });
  vi.mocked(api.readCachedText).mockImplementation(async (_c,path) => path === "/one" ? "original one" : "original two");
  vi.mocked(privacyApi.redact).mockImplementation(async (_c,text,_options,_password,documentId) => ({ documentId: documentId || "a".repeat(32), processingId: crypto.randomUUID().replace(/-/g,""), content:text+" masked "+"x".repeat(20010)+" END_OF_FULL_TEXT", sourceHash:"hash",vault,summary:{occurrences:1,unique:1,categories:{},findings:[{category:"phone",original:"13800138000",count:1}]} }));
  vi.mocked(privacyApi.suggest).mockResolvedValue({suggestions:[]});
});
afterEach(cleanup);
async function setup() {
  render(<PrivacyPanel onExport={vi.fn()}/>);
  fireEvent.click(screen.getByLabelText("启用脱敏"));
  fireEvent.change(screen.getByLabelText("映射文件加密口令（至少8字符，不会保存）"),{target:{value:"secure password"}});
  fireEvent.click(screen.getByRole("button",{name:"检查所选文件的脱敏内容"}));
  await screen.findByText("我已检查所选文件的全文及替换结果");
}
describe("privacy review gates", () => {
  it("shows full document beyond 20K and blocks unreviewed batch", async () => {
    await setup();
    expect(screen.getByText(/END_OF_FULL_TEXT/).textContent!.length).toBeGreaterThan(20000);
    expect((screen.getByRole("button",{name:/完成审核，前往导出/}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("我已检查所选文件的全文及替换结果"));
    expect(screen.getByText("整批审核：1/2 个文件已确认")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("选择要预览的文件"),{target:{value:"two"}});
    fireEvent.click(screen.getByRole("button",{name:"检查所选文件的脱敏内容"}));
    await screen.findByText("我已检查所选文件的全文及替换结果");
    fireEvent.click(screen.getByLabelText("我已检查所选文件的全文及替换结果"));
    expect((screen.getByRole("button",{name:/完成审核，前往导出/}) as HTMLButtonElement).disabled).toBe(false);
  });
  it("invalidates approvals when rule settings change", async () => {
    await setup();fireEvent.click(screen.getByLabelText("我已检查所选文件的全文及替换结果"));
    fireEvent.change(screen.getByLabelText("自定义敏感词（每行一个，精确替换）"),{target:{value:"new secret"}});
    await waitFor(()=>expect(screen.getByText("整批审核：0/2 个文件已确认")).toBeTruthy());
    expect(screen.queryByText("我已检查所选文件的全文及替换结果")).toBeNull();
  });
  it("resets outbound consent when provider changes",async()=>{
    await setup();fireEvent.click(screen.getByLabelText("我已检查所选文件的全文及替换结果"));
    fireEvent.click(screen.getByLabelText("可选 AI 辅助识别（默认关闭）"));
    fireEvent.click(screen.getByLabelText("我同意将当前脱敏稿发送至指定 AI 服务"));
    fireEvent.change(screen.getByLabelText("AI endpoint"),{target:{value:"https://another.example/v1"}});
    await waitFor(()=>expect((screen.getByLabelText("我同意将当前脱敏稿发送至指定 AI 服务") as HTMLInputElement).checked).toBe(false));
    expect(privacyApi.suggest).not.toHaveBeenCalled();
  });
  it("reuses approved tokens and restores correct original after switching documents",async()=>{
    await setup();fireEvent.click(screen.getByLabelText("我已检查所选文件的全文及替换结果"));
    fireEvent.change(screen.getByLabelText("选择要预览的文件"),{target:{value:"two"}});
    fireEvent.click(screen.getByRole("button",{name:"检查所选文件的脱敏内容"}));await screen.findByText("original two");
    fireEvent.change(screen.getByLabelText("选择要预览的文件"),{target:{value:"one"}});
    fireEvent.click(screen.getByRole("button",{name:"检查所选文件的脱敏内容"}));await screen.findByText("original one");
    expect(privacyApi.redact).toHaveBeenCalledTimes(2);
  });
});

describe("review/export separation", () => {
  it("keeps approvals in session memory when navigating to export and provides no recovery controls", async () => {
    useAppStore.setState({ files: useAppStore.getState().files.slice(0,1) });
    const go = vi.fn();
    const view = render(<PrivacyPanel onExport={go} />);
    fireEvent.click(screen.getByLabelText("启用脱敏"));
    fireEvent.change(screen.getByLabelText("映射文件加密口令（至少8字符，不会保存）"), { target: { value: "secure password" } });
    fireEvent.click(screen.getByRole("button", { name: "检查所选文件的脱敏内容" }));
    await screen.findByText("我已检查所选文件的全文及替换结果");
    fireEvent.click(screen.getByLabelText("我已检查所选文件的全文及替换结果"));
    fireEvent.click(screen.getByRole("button", { name: /完成审核，前往导出/ }));expect(go).toHaveBeenCalledOnce();
    expect(privacyApi.exportReviewed).not.toHaveBeenCalled();expect(screen.queryByText("从加密映射恢复 Markdown")).toBeNull();
    view.unmount();render(<PrivacyPanel onExport={go} />);
    expect(screen.getByText("整批审核：1/1 个文件已确认")).toBeTruthy();
    expect((screen.getByRole("button", { name: /完成审核，前往导出/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(usePrivacyStore.getState().saveToLibrary).toBe(false);
  });
});
