'use strict';
const ASSETS=new Set(['index.html','styles.css','enhancements.css','app.bundle.js','vendor/jszip.min.js']);
function isAppFrame(value){try{const u=new URL(value);return u.protocol==='classops:'&&u.hostname==='app'&&u.pathname==='/index.html';}catch{return false;}}
function assetName(value){try{const u=new URL(value);if(u.protocol!=='classops:'||u.hostname!=='app')return null;const name=decodeURIComponent(u.pathname).replace(/^\/+/, '')||'index.html';return ASSETS.has(name)?name:null;}catch{return null;}}
function allowedExternal(value){try{const u=new URL(value);return u.protocol==='https:'&&['aistudio.google.com','ai.google.dev'].includes(u.hostname)&&!u.username&&!u.password;}catch{return false;}}
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'none'";
module.exports={isAppFrame,assetName,allowedExternal,CSP};
