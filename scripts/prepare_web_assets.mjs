// Deterministic, same-origin OCR and PDF assets. No runtime CDN requests.
import {mkdir,copyFile,readdir,rm,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
if(process.argv.includes('--clean-build'))await rm(resolve('dist-web'),{recursive:true,force:true});
const root=resolve('public-web');await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
const resources=[];
async function copy(src,dest){await mkdir(join(root,dest,'..'),{recursive:true});await copyFile(src,join(root,dest));resources.push(dest);}
await copy('node_modules/tesseract.js/dist/worker.min.js','ocr/worker.min.js');
for(const file of await readdir('node_modules/tesseract.js-core'))if(/-lstm\.wasm(?:\.js)?$/.test(file))await copy('node_modules/tesseract.js-core/'+file,'ocr/core/'+file);
for(const lang of ['eng','chi_sim']){
 const path='node_modules/@tesseract.js-data/'+lang+'/4.0.0_best_int';
 const choices=await readdir(path);const variant=choices.includes('int')?'int':choices[0];
 await copy(choices.includes(lang+'.traineddata.gz')?path+'/'+lang+'.traineddata.gz':path+'/'+variant+'/'+lang+'.traineddata.gz','ocr/lang/'+lang+'.traineddata.gz');
}
for(const [src,dest] of [['cmaps','cmaps'],['standard_fonts','fonts'],['wasm','wasm']]){
 for(const file of await readdir('node_modules/pdfjs-dist/'+src))await copy('node_modules/pdfjs-dist/'+src+'/'+file,'pdf/'+dest+'/'+file);
}
await writeFile(join(root,'offline-resources.json'),JSON.stringify(resources));
await copyFile('src-tauri/icons/128x128.png',join(root,'icon.png'));
await copyFile('public/favicon.svg',join(root,'favicon.svg'));
const notices=[];
for(const pkg of ['@firecrawl/anydoc-wasm','tesseract.js','tesseract.js-core','@tesseract.js-data/eng','@tesseract.js-data/chi_sim','pdfjs-dist','@noble/hashes','fflate']){
 const path='node_modules/'+pkg;const metadata=JSON.parse(await readFile(path+'/package.json','utf8'));
 let license='';for(const f of await readdir(path))if(/^license(?:\.|$)/i.test(f)){license=await readFile(path+'/'+f,'utf8');break;}
 notices.push(`${pkg} ${metadata.version}\nLicense: ${metadata.license??'See upstream'}\n${license}`);
}
await writeFile(join(root,'THIRD_PARTY_NOTICES.txt'),notices.join('\n\n---\n\n'));
console.log(`Prepared ${resources.length} local OCR/PDF assets.`);
