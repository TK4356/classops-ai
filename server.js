// Local backend: API keys remain in memory/environment, never in browser files.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createGeminiClient,validRequest,GeminiError,DEFAULT_GEMINI_MODEL} from './gemini.js';
export {validRequest};
const root=path.dirname(fileURLToPath(import.meta.url));
function sendJson(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
async function readJson(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new GeminiError(415,'JSON_REQUIRED','JSON required');const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>90000)throw new GeminiError(413,'BODY_LIMIT','ข้อมูลยาวเกินไป');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GeminiError(400,'INVALID_JSON','JSON ไม่ถูกต้อง');}}
export function createServer(options={}){
  const client=createGeminiClient(options);let activeAI=0,configVersion=0,minuteStart=Date.now(),minuteCount=0,day=new Date().toISOString().slice(0,10),dayCount=0;const cache=new Map(),rpm=Number(options.requestsPerMinute||6),rpd=Number(options.requestsPerDay||100);
  return http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return sendJson(res,403,{message:'Local host only'});
      if(req.headers.origin&&req.headers.origin!==`http://${host}`)return sendJson(res,403,{message:'Same-origin requests only'});
      if(url.pathname==='/api/status'&&req.method==='GET')return sendJson(res,200,await client.status());
      if(!['/api/config','/api/assistant','/api/diagnostic'].includes(url.pathname))return sendJson(res,404,{message:'Not found'});
      if(req.method!=='POST')return sendJson(res,405,{message:'POST required'});
      const body=await readJson(req);
      if(url.pathname==='/api/config'){const config=client.configure(body?.apiKey,body?.model);configVersion++;cache.clear();return sendJson(res,200,{...config,message:'คีย์อยู่ในหน่วยความจำเซิร์ฟเวอร์จนปิดโปรแกรม'});}
      const diagnostic=url.pathname==='/api/diagnostic';
      if(diagnostic?(!body||Object.keys(body).length>0):!validRequest(body))throw new GeminiError(400,'INVALID_INPUT','กรุณาตรวจข้อมูลที่กรอก');
      if(!client.config().configured)throw new GeminiError(503,'KEY_REQUIRED','ยังไม่ได้ตั้ง Gemini API key ไปหน้าข้อมูลโรงเรียนและ AI เพื่อเชื่อม Google');
      const version=configVersion,cacheKey=JSON.stringify(body),cached=diagnostic?null:cache.get(cacheKey);if(cached&&Date.now()-cached.at<300000)return sendJson(res,200,{...cached.value,cached:true});
      if(activeAI>=2)throw new GeminiError(429,'APP_BUSY','AI กำลังทำงาน กรุณารอสักครู่',3);
      if(Date.now()-minuteStart>=60000){minuteStart=Date.now();minuteCount=0;}
      const today=new Date().toISOString().slice(0,10);if(day!==today){day=today;dayCount=0;}
      if(minuteCount>=rpm||dayCount>=rpd)throw new GeminiError(429,'APP_LIMIT','ถึงขีดจำกัดของเดโมแล้ว เพื่อช่วยควบคุมการใช้โควตา ลองใหม่ภายหลัง',minuteCount>=rpm?60:3600);
      minuteCount++;dayCount++;activeAI++;try{const result=diagnostic?await client.diagnostic():await client.generate(body);if(!diagnostic&&version===configVersion)cache.set(cacheKey,{at:Date.now(),value:result});if(cache.size>50)cache.delete(cache.keys().next().value);return sendJson(res,200,{...result,cached:false});}finally{activeAI--;}
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html',allowed=new Set(['index.html','standalone.html','styles.css','enhancements.css','app.bundle.js','app.js','core.js','docx.js','vendor/jszip.min.js']);
    if(!allowed.has(relative)){res.writeHead(404);res.end('Not found');return;}
    const data=await readFile(path.join(root,relative)),ext=path.extname(relative),type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'}[ext];res.writeHead(200,{'Content-Type':type||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(res.headersSent){res.end();return;}if(e instanceof GeminiError)return sendJson(res,e.status,{message:e.message,code:e.code},e.retryAfter?{'Retry-After':String(e.retryAfter)}:{});sendJson(res,500,{message:'ระบบยังไม่พร้อม กรุณาลองใหม่'});}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(typeof process.loadEnvFile==='function'){try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')console.error('Cannot load .env. Use environment variables instead.');}}
  const models=Object.fromEntries(['admin','plan','tasks','word','library'].map(kind=>[kind,process.env[`GEMINI_MODEL_${kind.toUpperCase()}`]]).filter(([,v])=>!!v)),port=Number(process.env.PORT||3000);
  createServer({models}).listen(port,'127.0.0.1',()=>console.log(`ClassOps-AI Google Gemini: http://127.0.0.1:${port}\nModel: ${process.env.GEMINI_MODEL||DEFAULT_GEMINI_MODEL}\nAPI key: ${process.env.GEMINI_API_KEY?'configured':'set in app settings or environment'}\nCtrl+C to stop`));
}
