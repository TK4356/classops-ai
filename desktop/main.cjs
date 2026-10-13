'use strict';
const {app,BrowserWindow,protocol,ipcMain,Menu,shell,dialog,session,safeStorage,screen}=require('electron');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {isAppFrame,assetName,allowedExternal,CSP}=require('./security.cjs');
const {readCredentials,saveCredentials}=require('./credentials.cjs');
const {calculateWordPages}=require('./word-pages.cjs');
const diagnosticArg=process.argv.find(a=>a.startsWith('--diagnostic-report='));
const diagnosticFile=diagnosticArg?path.resolve(diagnosticArg.slice('--diagnostic-report='.length)):null;
app.setName('ClassOps-AI');
app.setAppUserModelId('org.classops.ai');
if(diagnosticFile){const profile=path.join(path.dirname(diagnosticFile),'desktop-diagnostic-profile');fsSync.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
protocol.registerSchemesAsPrivileged([{scheme:'classops',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let mainWindow,apiServer,apiOrigin,remembered=false;
const errors=[];
async function writeDiagnostic(data){if(!diagnosticFile)return;await fs.mkdir(path.dirname(diagnosticFile),{recursive:true});await fs.writeFile(diagnosticFile,JSON.stringify(data,null,2));}
function openExternal(url){if(allowedExternal(url))shell.openExternal(url).catch(()=>{});}
async function bootstrap(){
  const root=app.getAppPath(),userData=app.getPath('userData');
  const {createServer}=await import(pathToFileURL(path.join(root,'server.js')).href);
  const stored=await readCredentials(userData,safeStorage);remembered=!!stored;
  apiServer=createServer(stored||{});
  await new Promise((resolve,reject)=>{apiServer.once('error',reject);apiServer.listen(0,'127.0.0.1',resolve);});
  apiOrigin=`http://127.0.0.1:${apiServer.address().port}`;
  protocol.handle('classops',async request=>{
    const name=assetName(request.url);if(!name||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
    let bytes=await fs.readFile(path.join(root,name));
    // Use Windows fonts offline; no background requests for remote font stylesheets.
    if(name==='styles.css')bytes=Buffer.from(bytes.toString('utf8').replace(/^@import[^;]+;\s*/,'').replaceAll("'Manrope',sans-serif","'Segoe UI',sans-serif"));
    const type=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';
    return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':type,'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'}});
  });
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  let pagesBusy=false;
  ipcMain.handle('classops:word-pages',async(event,bytes)=>{
    if(event.sender!==mainWindow?.webContents||!isAppFrame(event.senderFrame?.url))throw new Error('App operation denied');
    if(pagesBusy)return {ok:false,message:'กำลังคำนวณหน้า กรุณารอผลก่อน'};
    if(!(bytes instanceof Uint8Array)||bytes.byteLength>15*1024*1024)throw new Error('Unsupported document');
    pagesBusy=true;try{return await calculateWordPages(bytes);}catch{return {ok:false,message:'ไฟล์ไม่ผ่านการตรวจความปลอดภัยสำหรับคำนวณหน้าด้วย Word หรือมีลิงก์ภายนอก ระบบจะไม่เดาเลขหน้า'};}finally{pagesBusy=false;}
  });
  ipcMain.handle('classops:api',async(event,route,payload)=>{
    if(event.sender!==mainWindow?.webContents||!isAppFrame(event.senderFrame?.url)||!['status','config','assistant','diagnostic'].includes(route))throw new Error('App operation denied');
    if(payload!==undefined&&Buffer.byteLength(JSON.stringify(payload),'utf8')>90000)throw new Error('App input too large');
    const response=await fetch(`${apiOrigin}/api/${route}`,route==='status'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json();
    if(route==='config'&&response.ok){try{await saveCredentials(userData,{apiKey:payload.apiKey,model:payload.model,remember:payload.remember===true},safeStorage);remembered=payload.remember===true;}catch(e){return {status:500,data:{message:e.message}};}}
    if(route==='status')data.remembered=remembered;
    return {status:response.status,data};
  });
  const area=screen.getPrimaryDisplay().workAreaSize;
  mainWindow=new BrowserWindow({width:Math.min(1320,area.width-40),height:Math.min(900,area.height-40),minWidth:Math.min(760,area.width-40),minHeight:Math.min(580,area.height-40),show:false,title:'ClassOps-AI',backgroundColor:'#f5f7f6',icon:path.join(root,'desktop','icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(root,'desktop','preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!isAppFrame(url)){event.preventDefault();openExternal(url);}});
  mainWindow.webContents.on('preload-error',(_event,_preload,error)=>errors.push('Preload: '+error.message));
  mainWindow.webContents.on('render-process-gone',(_event,details)=>errors.push('Renderer: '+details.reason));
  mainWindow.webContents.on('did-fail-load',async(_event,code,description)=>{errors.push(`Load ${code}: ${description}`);if(diagnosticFile){await writeDiagnostic({ok:false,errors});app.exit(1);}else dialog.showErrorBox('ClassOps-AI','เปิดแอปไม่สำเร็จ กรุณาลองเปิดใหม่');});
  session.defaultSession.on('will-download',(_event,item)=>{
    item.setSaveDialogOptions({title:'บันทึกไฟล์จาก ClassOps-AI',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'แอป',submenu:[{label:'ออกจาก ClassOps-AI',role:'quit'}]},
    {label:'แก้ไข',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'มุมมอง',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
    {label:'ช่วยเหลือ',submenu:[{label:'Google AI Studio',click:()=>openExternal('https://aistudio.google.com/apikey')},{label:'เกี่ยวกับแอป',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'ClassOps-AI',message:'ClassOps-AI '+app.getVersion(),detail:'ผู้ช่วยงานครูสำหรับ Windows\nAI ไม่มาแทนที่ครู AI มาช่วยงานของครู'})}]}
  ]));
  mainWindow.once('ready-to-show',()=>{if(!diagnosticFile)mainWindow.show();});
  mainWindow.webContents.once('did-finish-load',async()=>{
    if(!diagnosticFile)return;
    try{
      // Diagnostic reads only app-owned UI; it does not click, upload or transmit user data.
      const ui=await mainWindow.webContents.executeJavaScript(`({title:document.title,menuCount:document.querySelectorAll('[data-nav]').length,desktopBridge:!!window.classopsDesktop?.isDesktop,ready:document.querySelector('#homeTaskCount')?.textContent!=='0',keyFieldEmpty:document.querySelector('#geminiKey')?.value==='',storageNoticeHidden:document.querySelector('#storageNotice')?.hidden})`);
      const bridgeStatus=await mainWindow.webContents.executeJavaScript(`window.classopsDesktop.requestApi('status')`);
      const zipRoundTrip=await mainWindow.webContents.executeJavaScript(`(async()=>{const zip=new JSZip();zip.file('health.txt','ClassOps-AI');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});const result=await JSZip.loadAsync(await blob.arrayBuffer());return (await result.file('health.txt').async('string'))==='ClassOps-AI';})()`);
      const status=await (await fetch(`${apiOrigin}/api/status`)).json();
      const testKey='classops-diagnostic-key-not-a-real-google-key';
      const encryptionAvailable=safeStorage.isEncryptionAvailable();
      const encryptionRoundTrip=encryptionAvailable&&safeStorage.decryptString(safeStorage.encryptString(testKey))===testKey;
      const ipcReady=bridgeStatus.status===200&&bridgeStatus.data.provider==='google';
      const ok=errors.length===0&&ui.desktopBridge&&ui.menuCount===5&&ui.keyFieldEmpty&&ui.storageNoticeHidden&&status.provider==='google'&&encryptionRoundTrip&&ipcReady&&zipRoundTrip;
      await writeDiagnostic({ok,version:app.getVersion(),packaged:app.isPackaged,ui,ipcReady,zipRoundTrip,status:{provider:status.provider,configured:status.configured,model:status.model},encryptionAvailable,encryptionRoundTrip,errors});
      app.exit(ok?0:1);
    }catch(e){await writeDiagnostic({ok:false,errors:[...errors,e.message]});app.exit(1);}
  });
  await mainWindow.loadURL('classops://app/index.html');
}
if(!diagnosticFile&&!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.whenReady().then(bootstrap).catch(async error=>{if(diagnosticFile)await writeDiagnostic({ok:false,errors:[error.message]});else dialog.showErrorBox('ClassOps-AI','ไม่สามารถเปิดแอปได้: '+error.message);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{if(apiServer){apiServer.closeAllConnections();apiServer.close();}});
}
