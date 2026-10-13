'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const zipModule={exports:{}};
new Function('module','exports',require('node:fs').readFileSync(path.join(__dirname,'../vendor/jszip.min.js'),'utf8'))(zipModule,zipModule.exports);
const JSZip=zipModule.exports;
const run=(exe,args,options)=>new Promise((resolve,reject)=>execFile(exe,args,options,(error,stdout,stderr)=>error?reject(error):resolve({stdout,stderr})));
async function validateDocument(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<4||bytes.byteLength>15*1024*1024)throw new Error('ไฟล์คำนวณหน้าต้องเป็น .docx ไม่เกิน 15 MB');
  const zip=await JSZip.loadAsync(bytes),entries=Object.values(zip.files);
  if(entries.length>2000||entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>60*1024*1024||!zip.file('word/document.xml')||!zip.file('[Content_Types].xml'))throw new Error('เอกสารมีโครงสร้างไม่รองรับ');
  for(const e of entries){if(/vbaProject|activeX|embeddings/i.test(e.name))throw new Error('ไม่คำนวณหน้าไฟล์ที่มีส่วนประกอบแบบ active');if(e.name.endsWith('.rels'))for(const rel of (await e.async('string')).match(/<Relationship\b[^>]*>/g)||[])if(/TargetMode\s*=\s*["']External["']/i.test(rel)&&!(/Type\s*=\s*["'][^"']*\/hyperlink["']/i.test(rel)))throw new Error('ไฟล์มีส่วนประกอบที่ดึงข้อมูลภายนอก จึงไม่คำนวณหน้าอัตโนมัติ');}
  const xml=await zip.file('word/document.xml').async('string');if(/<!DOCTYPE|<!ENTITY|<\w*:altChunk\b|\b(?:DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE|DATABASE|LINK)\b/i.test(xml))throw new Error('ไฟล์มีฟิลด์ที่อาจเรียกข้อมูลภายนอก จึงไม่คำนวณหน้าอัตโนมัติ');
}
async function calculateWordPages(bytes,{runImpl=run,platform=process.platform,scriptPath=path.join(__dirname,'word-pages.ps1')}={}){
  if(platform!=='win32')return {ok:false,code:'WORD_WINDOWS_REQUIRED',message:'ต้องใช้แอป Windows และ Microsoft Word เพื่อคำนวณเลขหน้าจริง'};
  await validateDocument(bytes);
  const prefix=path.join(os.tmpdir(),'classops-word-pages-'),dir=await fs.mkdtemp(prefix),input=path.join(dir,'input.docx'),output=path.join(dir,'result.json');
  try {
    await fs.writeFile(input,bytes);
    // Fixed application code; user file data is never interpolated into commands.
    const script=await fs.readFile(scriptPath,'utf8'),exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    await runImpl(exe,['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:120000,maxBuffer:1024*1024,env:{...process.env,CLASSOPS_WORD_INPUT:input,CLASSOPS_WORD_OUTPUT:output}});
    const stat=await fs.stat(output);if(stat.size>16*1024*1024)throw new Error('ผลคำนวณใหญ่เกินขอบเขต');
    const result=JSON.parse(await fs.readFile(output,'utf8'));if(!result.ok)return {ok:false,code:result.code==='WORD_ISOLATION_FAILED'?'WORD_ISOLATION_FAILED':'WORD_PAGES_FAILED',message:result.code==='WORD_ISOLATION_FAILED'?'แยก Word สำหรับคำนวณไม่ได้ จึงหยุดโดยไม่แตะเอกสารที่คุณเปิดอยู่':'Word คำนวณหน้าไม่สำเร็จ ตรวจการติดตั้ง/เปิดใช้งาน Word และไฟล์ที่รองรับ'};
    if(!Number.isInteger(result.totalPages)||result.totalPages<1||result.totalPages>20000||!Array.isArray(result.paragraphs)||result.paragraphs.length>20000||!result.paragraphs.every(p=>typeof p.text==='string'&&p.text.length<=100000&&Number.isInteger(p.start)&&Number.isInteger(p.end)&&p.start>=1&&p.end>=p.start&&p.end<=result.totalPages))throw new Error('ผลเลขหน้าไม่ผ่านการตรวจ');
    return result;
  }catch(e){return {ok:false,code:e.killed?'WORD_PAGE_TIMEOUT':'WORD_PAGES_FAILED',message:e.killed?'Word คำนวณเกิน 2 นาที หาก Word ยังทำงานอยู่ให้ตรวจและปิดเฉพาะงานคำนวณที่ไม่มีเอกสารของคุณก่อนลองใหม่':'ไม่สามารถอ่านผลคำนวณหน้าได้ ระบบจะไม่เดาเลขหน้า'};}
  finally {if(path.resolve(dir).startsWith(path.resolve(prefix)))await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={calculateWordPages,validateDocument};
