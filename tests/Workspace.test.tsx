import React from "react";
import { render,screen,fireEvent,waitFor,cleanup,within } from "@testing-library/react";
import { beforeEach,afterEach,it,expect,vi } from "vitest";
import App from "../src/App";
import { SettingsPanel } from "../src/components/SettingsPanel";
import { Preview } from "../src/components/Preview";
import { useAppStore } from "../src/stores/appStore";
import { usePrivacyStore,defaultPrivacySettings } from "../src/stores/privacyStore";
import { useUIStore,defaultPreferences } from "../src/stores/uiStore";
import { useI18n } from "../src/i18n";
import { api } from "../src/lib/api";
vi.mock("../src/components/DropZone",()=>({DropZone:()=> <div>Import documents</div>}));
vi.mock("../src/lib/api",()=>({api:{waitForServer:vi.fn(),restartServer:vi.fn(),readCachedText:vi.fn(),exportFiles:vi.fn()},localizeError:(s:string)=>s}));
vi.mock("../src/lib/privacyApi",()=>({privacyApi:{listLibrary:vi.fn(async()=>({packs:[]})),exportReviewed:vi.fn()}}));
vi.mock("@tauri-apps/plugin-dialog",()=>({confirm:vi.fn(async()=>true),save:vi.fn(),open:vi.fn()}));
vi.mock("sonner",()=>({Toaster:()=>null,toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();useI18n.setState({locale:"zh-CN"});useUIStore.setState({...defaultPreferences});useAppStore.setState({files:[],port:1234,token:"token",isReady:true,privacyEnabled:false,exportOptions:{...defaultPreferences.exportDefaults}});usePrivacyStore.setState({...defaultPrivacySettings,preparedFiles:{}});vi.mocked(api.waitForServer).mockResolvedValue({port:1234,token:"token"});vi.mocked(api.readCachedText).mockResolvedValue("# Full Markdown");});
afterEach(cleanup);
it("navigates all five workspaces without requiring converted documents for recovery",async()=>{
 render(<App/>);const nav=within(screen.getByRole("navigation",{name:"工作空间"}));
 fireEvent.click(nav.getByRole("button",{name:"文件恢复"}));expect(screen.getByRole("button",{name:"选择 JSON 恢复包"})).toBeTruthy();
 fireEvent.click(nav.getByRole("button",{name:"设置"}));expect(screen.getByRole("combobox",{name:"界面语言"})).toBeTruthy();
 fireEvent.click(nav.getByRole("button",{name:"脱敏审核"}));expect(screen.getByRole("checkbox",{name:"启用脱敏"})).toBeTruthy();
 fireEvent.click(nav.getByRole("button",{name:"导出中心"}));expect(screen.getByText("本次导出批次 · 0")).toBeTruthy();
 fireEvent.click(nav.getByRole("button",{name:"文件转换"}));expect(nav.getByRole("button",{name:"文件转换"}).getAttribute("aria-current")).toBe("page");
 await waitFor(()=>expect(api.waitForServer).toHaveBeenCalledOnce());
});
it("settings persist only working non-sensitive preferences and reset actual export options",()=>{
 usePrivacyStore.setState({passphrase:"never persist this",keywords:"private organization"});render(<SettingsPanel/>);
 fireEvent.click(screen.getByRole("tab",{name:"转换"}));
 fireEvent.change(screen.getByLabelText("同时转换数量（运行中的任务不会被中断）"),{target:{value:"3"}});
 fireEvent.click(screen.getByRole("tab",{name:"导出"}));
 fireEvent.change(screen.getByLabelText("默认格式"),{target:{value:"zip"}});
 fireEvent.click(screen.getByRole("tab",{name:"通用与预览"}));
 fireEvent.change(screen.getByLabelText("预览字号"),{target:{value:"18"}});
 expect(useUIStore.getState().concurrency).toBe(3);expect(useAppStore.getState().exportOptions.format).toBe("zip");
 const prefs=localStorage.getItem("markalldown.ui.preferences")!;expect(prefs).toContain('"fontSize":18');expect(prefs).not.toContain("never persist");expect(prefs).not.toContain("private organization");
 fireEvent.click(screen.getByRole("button",{name:"恢复界面与导出默认设置"}));expect(useUIStore.getState().concurrency).toBe(1);expect(useAppStore.getState().exportOptions.format).toBe("individual");expect(usePrivacyStore.getState().passphrase).toBe("never persist this");
});
it("blocks copy and download when only a failed full-text excerpt is available",async()=>{
 useAppStore.setState({files:[{id:"one",name:"one.md",size:1,type:"md",status:"done",progress:100,cachePath:"/missing",preview:"excerpt"}]});vi.mocked(api.readCachedText).mockRejectedValue(new Error("missing"));
 render(<Preview inline fileId="one" onClose={vi.fn()}/>);await screen.findByText(/全文读取失败/);
 expect((screen.getByRole("button",{name:"复制"}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole("button",{name:"下载"}) as HTMLButtonElement).disabled).toBe(true);
});
it("renders source and reading modes from the complete cached text",async()=>{
 useAppStore.setState({files:[{id:"one",name:"one.md",size:1,type:"md",status:"done",progress:100,cachePath:"/one"}]});
 render(<Preview inline fileId="one" onClose={vi.fn()}/>);await screen.findByRole("heading",{name:"Full Markdown"});
 fireEvent.click(screen.getByRole("button",{name:"Markdown 源文"}));expect(screen.getByText("# Full Markdown")).toBeTruthy();
});

it("settings tabs expose working controls only in the selected section",()=>{
 render(<SettingsPanel/>);expect(screen.getByRole("combobox",{name:"界面语言"})).toBeTruthy();
 expect(screen.queryByRole("combobox",{name:"默认格式"})).toBeNull();
 fireEvent.click(screen.getByRole("tab",{name:"导出"}));expect(screen.getByRole("combobox",{name:"默认格式"})).toBeTruthy();
 expect(screen.queryByRole("combobox",{name:"界面语言"})).toBeNull();
});


it("keeps the workspace and selected files when retrying startup",async()=>{
 useAppStore.setState({isReady:false,port:null,files:[{id:"waiting",name:"waiting.md",size:1,type:"text/markdown",status:"pending",progress:0}]});
 vi.mocked(api.waitForServer).mockRejectedValueOnce(new Error("service exited")).mockResolvedValueOnce({port:4321,token:"new-token"});
 vi.mocked(api.restartServer).mockResolvedValue(undefined);
 render(<App/>);
 await screen.findByRole("alert");
 const nav=within(screen.getByRole("navigation",{name:"工作空间"}));
 fireEvent.click(nav.getByRole("button",{name:"设置"}));
 expect(screen.getByRole("combobox",{name:"界面语言"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"重试",exact:true}));
 await waitFor(()=>expect(useAppStore.getState().isReady).toBe(true));
 expect(api.restartServer).toHaveBeenCalledOnce();
 expect(useAppStore.getState().files[0].name).toBe("waiting.md");
 expect(useAppStore.getState().port).toBe(4321);
 expect(screen.queryByRole("alert")).toBeNull();
});

it("disables irrelevant combined-export options and restores them for ZIP", async () => {
 const { ExportPanel } = await import("../src/components/ExportPanel");
 render(<ExportPanel workspace onClose={vi.fn()} onRedact={vi.fn()}/>);
 fireEvent.click(screen.getByRole("radio", {name:/合并为/}));
 expect((screen.getByRole("checkbox", {name:/保留原始文件名/}) as HTMLInputElement).disabled).toBe(true);
 expect((screen.getByRole("radio", {name:/平铺/}) as HTMLInputElement).disabled).toBe(true);
 expect(screen.getByText(/合并文件固定为 combined.md/)).toBeTruthy();
 fireEvent.click(screen.getByRole("radio", {name:/ZIP/}));
 expect((screen.getByRole("checkbox", {name:/保留原始文件名/}) as HTMLInputElement).disabled).toBe(false);
 expect((screen.getByRole("radio", {name:/平铺/}) as HTMLInputElement).disabled).toBe(false);
});

it("retains redaction naming restrictions when switching export formats", async () => {
 useAppStore.setState({privacyEnabled:true});
 usePrivacyStore.setState({anonymousNames:true});
 const { ExportPanel } = await import("../src/components/ExportPanel");
 render(<ExportPanel workspace onClose={vi.fn()} onRedact={vi.fn()}/>);
 fireEvent.click(screen.getByRole("radio", {name:/合并为/}));
 fireEvent.click(screen.getByRole("radio", {name:/ZIP/}));
 expect((screen.getByRole("checkbox", {name:/保留原始文件名/}) as HTMLInputElement).disabled).toBe(true);
 expect((screen.getByRole("radio", {name:/平铺/}) as HTMLInputElement).disabled).toBe(true);
});
