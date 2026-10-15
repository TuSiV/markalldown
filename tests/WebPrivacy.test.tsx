// @vitest-environment node
import {describe,it,expect,beforeAll} from 'vitest';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {redact,recover,buildPack} from '../src/web/privacy';
let fixture:any;
const fixtureDir=join(tmpdir(),'mad-web-fixtures');
const python=process.env.MAD_PYTHON||(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
beforeAll(()=>{execFileSync(python,['scripts/web_fixtures.py',fixtureDir]);fixture=JSON.parse(readFileSync(join(fixtureDir,'desktop.json'),'utf8'));});
describe('Desktop/browser protocol interoperability',()=>{
 it('recovers desktop R2 and legacy R1 packs',async()=>{
  for(const [content,pack] of [[fixture.content,fixture.pack],[fixture.legacyContent,fixture.legacyPack]]){
   const result=await recover(content,pack,fixture.password);expect(result.content).toBe(fixture.source);
  }
 });
 it('matches all desktop rules, custom terms and whitelist, and Python restores the browser export',async()=>{
  const result=await redact(fixture.source,fixture.options,fixture.password);
  expect(result.occurrences).toBe(fixture.summary.occurrences);
  expect(result.findings).toEqual(fixture.summary.findings);
  expect(result.content).toContain('13800138001');
  const pack=await buildPack(result,fixture.password,'中文合同.md');
  const restored=await recover(result.content,pack,fixture.password);expect(restored.integrity).toBe('exact');expect(restored.content).toBe(fixture.source);
  const script="import sys,json;sys.path.insert(0,'backend');from recovery import preview_recovery;b=json.load(sys.stdin);print(json.dumps(preview_recovery(b['content'],b['pack'],b['password']),ensure_ascii=False))";
  const desktop=JSON.parse(execFileSync(python,['-c',script],{input:JSON.stringify({content:result.content,pack,password:fixture.password}),encoding:'utf8'}));
  expect(desktop.content).toBe(fixture.source);expect(desktop.integrity).toBe('exact');
 });
 it('rejects wrong password, modified manifests and unknown tokens',async()=>{
  await expect(recover(fixture.content,fixture.pack,'wrong-password')).rejects.toThrow();
  await expect(recover(fixture.content+'【MAD_unknown】',fixture.pack,fixture.password)).rejects.toThrow(/未知/);
  const corrupt=structuredClone(fixture.pack);corrupt.refs[0].documentId='a'.repeat(32);
  await expect(recover(fixture.content,corrupt,fixture.password)).rejects.toThrow();
 });
 it('reports edited and missing placeholders instead of claiming an exact recovery',async()=>{
  const modified=fixture.content.replace(/【MAD_[^】]+】/,'removed');
  const r=await recover(modified,fixture.pack,fixture.password);expect(r.integrity).toBe('edited');expect(r.missing).toBeGreaterThan(0);expect(r.originalMatch).toBe(false);
 });
 it('keeps YAML front matter first and supports non-ASCII passwords',async()=>{
  const input='---\ntitle: 合同\n---\n13800138000';const password='恢复口令测试一二三';
  const r=await redact(input,{categories:['phone'],keywords:[],whitelist:[]},password);expect(r.content.startsWith('---\ntitle: 合同\n---\n<!--')).toBe(true);
  expect((await recover(r.content,await buildPack(r,password,'test.md'),password)).content).toBe(input);
 });
});
