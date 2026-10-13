'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('classopsDesktop',Object.freeze({
  isDesktop:true,
  version:'3.5.0',
  calculateWordPages:bytes=>ipcRenderer.invoke('classops:word-pages',bytes),
  requestApi:(route,payload)=>{
    if(!['status','config','assistant','diagnostic'].includes(route))return Promise.reject(new Error('Unsupported app operation'));
    return ipcRenderer.invoke('classops:api',route,payload);
  }
}));
