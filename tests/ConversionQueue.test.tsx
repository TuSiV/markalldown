import React from "react";
import { render,screen,fireEvent,waitFor,cleanup } from "@testing-library/react";
import { beforeEach,afterEach,it,expect,vi } from "vitest";
import { DropZone } from "../src/components/DropZone";
import { useAppStore } from "../src/stores/appStore";
import { useUIStore,defaultPreferences } from "../src/stores/uiStore";
import { useI18n } from "../src/i18n";
import { api } from "../src/lib/api";
import { open } from "@tauri-apps/plugin-dialog";
vi.mock("../src/lib/api",()=>({api:{convertFile:vi.fn()},localizeError:(s:string)=>s}));
vi.mock("@tauri-apps/plugin-dialog",()=>({open:vi.fn()}));
vi.mock("@tauri-apps/plugin-fs",()=>({readFile:vi.fn(async()=>new Uint8Array([65])),readDir:vi.fn()}));
vi.mock("@tauri-apps/api/path",()=>({basename:vi.fn(async(p:string)=>p.split('/').pop()),join:vi.fn(async(...p:string[])=>p.join('/'))}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();useI18n.setState({locale:"zh-CN"});useUIStore.setState({...defaultPreferences,concurrency:2});useAppStore.setState({files:[],port:1234,token:"token",isReady:true,isConverting:false});vi.mocked(open).mockResolvedValue(['/one.md','/two.md','/three.md']);});afterEach(cleanup);
it("limits concurrent conversion calls and advances the next pending file when a slot is free",async()=>{
 const resolve: Array<()=>void>=[];
 vi.mocked(api.convertFile).mockImplementation(async(_c,file)=>await new Promise<any>(r=>resolve.push(()=>r({kind:"file",cachePath:'/'+file.name,preview:"full",charCount:4}))));
 render(<DropZone compact/>);fireEvent.click(screen.getByRole("button",{name:"选择文件"}));
 await waitFor(()=>expect(api.convertFile).toHaveBeenCalledTimes(2));expect(useAppStore.getState().files.filter(f=>f.status==="pending")).toHaveLength(1);
 resolve[0]();await waitFor(()=>expect(api.convertFile).toHaveBeenCalledTimes(3));resolve[1]();resolve[2]();
 await waitFor(()=>expect(useAppStore.getState().isConverting).toBe(false));expect(useAppStore.getState().files.every(f=>f.status==="done")).toBe(true);
});


it("allows native file selection before service readiness and queues all files",async()=>{
 useAppStore.setState({port:null,token:"",isReady:false});
 render(<DropZone/>);
 fireEvent.click(screen.getByRole("button",{name:"选择文件"}));
 await waitFor(()=>expect(useAppStore.getState().files).toHaveLength(3));
 expect(open).toHaveBeenCalledOnce();
 expect(api.convertFile).not.toHaveBeenCalled();
 expect(useAppStore.getState().files.every(file=>file.status==="pending")).toBe(true);
 vi.mocked(api.convertFile).mockResolvedValue({kind:"single",filename:"file.md",cachePath:"/cache/file",preview:"text",charCount:4});
 useAppStore.setState({port:1234,token:"token",isReady:true});
 await waitFor(()=>expect(useAppStore.getState().files.every(file=>file.status==="done")).toBe(true));
});
