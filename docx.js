// DOCX formatting preserves ZIP parts, including media, tables and relationships.
// Supports standard transitional WordprocessingML; never guesses for unsupported files.
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const DOCX_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_FILE=15*1024*1024,MAX_EXPANDED=60*1024*1024;
function parseXml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('ไม่รองรับไฟล์ XML ที่มี DTD');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('โครงสร้าง XML ในไฟล์ไม่สมบูรณ์');return doc;}
function elements(parent,name){return Array.from(parent.getElementsByTagNameNS(W,name));}
function direct(parent,name){return Array.from(parent.childNodes).find(n=>n.nodeType===1&&n.namespaceURI===W&&n.localName===name);}
function ensure(parent,name,first=false){let child=direct(parent,name);if(!child){child=parent.ownerDocument.createElementNS(W,`w:${name}`);first?parent.insertBefore(child,parent.firstChild):parent.appendChild(child);}return child;}
function attrs(node,values){for(const [key,value] of Object.entries(values))node.setAttributeNS(W,`w:${key}`,String(value));}
function setFont(rPr,font,size){attrs(ensure(rPr,'rFonts',true),{ascii:font,hAnsi:font,eastAsia:font,cs:font});const fonts=direct(rPr,'rFonts');for(const key of ['asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme'])fonts.removeAttributeNS(W,key);attrs(ensure(rPr,'sz'),{val:size*2});attrs(ensure(rPr,'szCs'),{val:size*2});}
function cleanOrder(parent,order){const nodes=Array.from(parent.childNodes).filter(n=>n.nodeType===1&&n.namespaceURI===W&&order.includes(n.localName));nodes.sort((a,b)=>order.indexOf(a.localName)-order.indexOf(b.localName));nodes.forEach(n=>parent.appendChild(n));}
const SECT_ORDER=['headerReference','footerReference','footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid','printerSettings','sectPrChange'];
const P_ORDER=['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'];
const R_ORDER=['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dstrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang','eastAsianLayout','specVanish','oMath','rPrChange'];
function protectedParagraphs(doc,styles){
  const blocked=new Set(),styleMap=new Map();
  if(styles)for(const s of elements(styles,'style'))styleMap.set(s.getAttributeNS(W,'styleId'),{name:direct(s,'name')?.getAttributeNS(W,'val')||'',base:direct(s,'basedOn')?.getAttributeNS(W,'val')||''});
  const tocStyle=(id,seen=new Set())=>{if(!id||seen.has(id))return false;seen.add(id);const s=styleMap.get(id);return /TOC|table.?of.?contents|สารบัญ/i.test(id+' '+(s?.name||''))||tocStyle(s?.base,seen);};
  let fieldDepth=0;
  const all=elements(doc,'p');
  // Lock a manual contents block as a range, including title and page column.
  for(let start=0;start<all.length;start++){
    const title=elements(all[start],'t').map(t=>t.textContent).join('').trim();
    if(!/^(?:สารบัญ(?:รูปภาพ|ตาราง)?|table\s+of\s+contents|contents)$/i.test(title))continue;
    let entries=0;
    for(let i=start;i<all.length;i++){
      const p=all[i],content=elements(p,'t').map(t=>t.textContent).join('').trim(),style=direct(direct(p,'pPr')||p,'pStyle')?.getAttributeNS(W,'val')||'';
      const entry=elements(p,'tab').length>0||/[.．…·]{4,}/.test(content)||tocStyle(style);
      if(i>start+1&&!entry&&content&&(/Heading|หัวเรื่อง/i.test(style)||entries>=1&&!/^(?:หน้า|[ก-ฮ]|[0-9ivxlcdm]+)$/i.test(content)))break;
      blocked.add(p);if(entry)entries++;
      if(i>start&&elements(p,'br').some(b=>b.getAttributeNS(W,'type')==='page'))break;
    }
  }
  for(const p of elements(doc,'p')){
    const content=elements(p,'t').map(t=>t.textContent).join(''),style=direct(direct(p,'pPr')||p,'pStyle')?.getAttributeNS(W,'val')||'';
    if(fieldDepth>0||tocStyle(style)||/[.．…·]{4,}/.test(content)||/^\s*(?:หน้า\s*)?\d+\s*$/.test(content)||elements(p,'tabs').length||['drawing','fldChar','fldSimple','instrText','hyperlink','tab','ptab','br','bookmarkStart','bookmarkEnd','sdt','ins','del','lastRenderedPageBreak'].some(name=>elements(p,name).length))blocked.add(p);
    for(const f of elements(p,'fldChar')){const type=f.getAttributeNS(W,'fldCharType');if(type==='begin')fieldDepth++;if(type==='end')fieldDepth=Math.max(0,fieldDepth-1);}
  }
  return blocked;
}
function editableParagraph(p,blocked){return !blocked?.has(p)&&p.parentNode?.localName==='body'&&elements(p,'t').length>0&&Array.from(p.childNodes).filter(n=>n.nodeType===1).every(n=>n.namespaceURI===W&&['pPr','r'].includes(n.localName))&&elements(p,'r').every(r=>Array.from(r.childNodes).filter(n=>n.nodeType===1).every(n=>n.namespaceURI===W&&['rPr','t'].includes(n.localName)));}
export function comparisonParts(before,after){let start=0,end=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;return {prefix:before.slice(0,start),before:before.slice(start,before.length-end),after:after.slice(start,after.length-end),suffix:end?before.slice(-end):''};}
// Review-only diff. Keep comparisonParts for DOCX run replacement unchanged.
// Graphemes keep Thai vowels/tones and joined emoji together when highlighting.
export function comparisonSegments(before,after){
  const segmenter=new Intl.Segmenter('th',{granularity:'grapheme'});
  const split=text=>Array.from(segmenter.segment(text),part=>part.segment);
  const a=split(before),b=split(after),segments=[];
  const append=(type,text)=>{if(!text)return;const last=segments[segments.length-1];if(last?.type===type)last.text+=text;else segments.push({type,text});};
  let start=0,end=0;
  while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  append('equal',a.slice(0,start).join(''));
  const left=a.slice(start,a.length-end),right=b.slice(start,b.length-end),n=left.length,m=right.length;
  if(!n)append('insert',right.join(''));
  else if(!m)append('delete',left.join(''));
  else {
    // Supported AI paragraphs are bounded to 6,000 input / 3,000 output chars.
    // LCS preserves every unchanged island between multiple edits in a sentence.
    const width=m+1,lcs=new Uint16Array((n+1)*width);
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
      const cell=i*width+j;
      lcs[cell]=left[i]===right[j]?lcs[cell+width+1]+1:Math.max(lcs[cell+width],lcs[cell+1]);
    }
    let i=0,j=0;
    while(i<n&&j<m){
      if(left[i]===right[j]){append('equal',left[i]);i++;j++;}
      else if(lcs[(i+1)*width+j]>=lcs[i*width+j+1])append('delete',left[i++]);
      else append('insert',right[j++]);
    }
    append('delete',left.slice(i).join(''));append('insert',right.slice(j).join(''));
  }
  append('equal',end?a.slice(-end).join(''):'');
  return segments;
}
function replaceParagraphText(p,text){const nodes=elements(p,'t'),old=nodes.map(n=>n.textContent).join(''),parts=comparisonParts(old,text),start=parts.prefix.length,finish=old.length-parts.suffix.length;let offset=0,inserted=false;for(const node of nodes){const value=node.textContent,a=offset,b=offset+value.length;offset=b;let next=value.slice(0,Math.max(0,Math.min(value.length,start-a)));if(!inserted&&b>=start){next+=parts.after;inserted=true;}if(b>finish)next+=value.slice(Math.max(0,finish-a));node.textContent=next;node.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');}}
export function wordAIParagraphs(loaded){let chars=0;return (loaded.editableParagraphs||[]).filter(p=>{if((loaded.lockedParagraphIds||[]).includes(p.id)||chars+p.text.length>6000)return false;chars+=p.text.length;return true;}).slice(0,80);}
export function mapWordPages(loaded,result){
  const records=loaded.paragraphRecords||[],normalize=text=>String(text).replace(/[\u0000-\u001F\uFFFC\u00AD]/g,'').normalize('NFC').replace(/\s+/g,' ').trim();
  if(!result?.ok||!Number.isInteger(result.totalPages)||result.totalPages<1||!Array.isArray(result.paragraphs)||result.paragraphs.length>20000)throw new Error('ผลคำนวณหน้าจาก Word ไม่สมบูรณ์');
  for(const item of result.paragraphs)if(typeof item.text!=='string'||!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<1||item.end<item.start||item.end>result.totalPages)throw new Error('เลขหน้าไม่ผ่านการตรวจ');
  const source=records.map(p=>({...p,key:normalize(p.text)})),target=result.paragraphs.map(p=>({...p,key:normalize(p.text)})),byId={};
  const put=(p,item)=>byId[p.id]={start:item.start,end:item.end};
  const nonemptySource=source.filter(p=>p.key),nonemptyTarget=target.filter(p=>p.key);
  if(source.length===target.length&&source.every((p,i)=>p.key===target[i].key))source.forEach((p,i)=>put(p,target[i]));
  else if(nonemptySource.length===nonemptyTarget.length&&nonemptySource.every((p,i)=>p.key===nonemptyTarget[i].key))nonemptySource.forEach((p,i)=>put(p,nonemptyTarget[i]));
  else {
    const groups=new Map(),sourceCounts=new Map();for(const p of nonemptySource)sourceCounts.set(p.key,(sourceCounts.get(p.key)||0)+1);for(const p of nonemptyTarget){if(!groups.has(p.key))groups.set(p.key,[]);groups.get(p.key).push(p);}
    for(const p of nonemptySource){const candidates=groups.get(p.key)||[];if(candidates.length===sourceCounts.get(p.key)&&candidates.length&&candidates.every(c=>c.start===candidates[0].start&&c.end===candidates[0].end))put(p,candidates[0]);}
  }
  const unknownIds=source.filter(p=>!byId[p.id]).map(p=>p.id),matchedCount=Object.keys(byId).length;
  if(!matchedCount)throw new Error('Word คำนวณหน้าสำเร็จ แต่ยังไม่พบข้อความที่จับคู่ตำแหน่งได้ ระบบจะไม่เดาเลขหน้า');
  return {totalPages:result.totalPages,byId,unknownIds,matchedCount,sourceCount:records.length,wordParagraphCount:result.paragraphs.length};
}
export function wordPageLabel(loaded,id){const page=loaded?.pageMap?.byId?.[id];return page?`Page ${page.start}${page.end!==page.start?'–'+page.end:''} of ${loaded.pageMap.totalPages} · ต้นฉบับ`:`ไม่ทราบหน้า · ย่อหน้า ${Number(String(id).slice(1))+1}`;}
export async function readDocx(file){
  if(!/\.docx$/i.test(file.name))throw new Error('รองรับเฉพาะ .docx กรุณาบันทึกไฟล์ .doc รุ่นเก่าเป็น .docx ก่อน');
  if(file.size>MAX_FILE)throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 15 MB');
  if(!globalThis.JSZip)throw new Error('ไม่พบตัวอ่าน Word กรุณาตรวจว่าโฟลเดอร์ vendor อยู่ครบ');
  const original=await file.arrayBuffer();
  const zip=await JSZip.loadAsync(original);
  const entries=Object.values(zip.files);if(entries.length>2000)throw new Error('ไฟล์มีส่วนประกอบมากเกินไป');
  const size=entries.reduce((sum,f)=>sum+(f._data?.uncompressedSize||0),0);if(size>MAX_EXPANDED)throw new Error('เอกสารมีขนาดหลังแตกไฟล์เกิน 60 MB');
  const main=zip.file('word/document.xml');if(!main||!zip.file('[Content_Types].xml'))throw new Error('ไฟล์นี้ไม่ใช่เอกสาร Word ที่รองรับ');
  const doc=parseXml(await main.async('string'));if(doc.documentElement.namespaceURI!==W)throw new Error('ไม่รองรับ Word Strict XML กรุณาบันทึกเป็น Word Document (.docx) แบบปกติ');
  const paragraphs=elements(doc,'p').map(p=>elements(p,'t').map(t=>t.textContent).join('')).filter(Boolean);
  const styles=zip.file('word/styles.xml')?parseXml(await zip.file('word/styles.xml').async('string')):null,blocked=protectedParagraphs(doc,styles);
  const editableParagraphs=elements(doc,'p').map((p,i)=>({id:`p${i}`,text:elements(p,'t').map(t=>t.textContent).join(''),editable:editableParagraph(p,blocked)})).filter(p=>p.editable&&p.text.trim()).map(({id,text})=>({id,text}));
  const paragraphRecords=elements(doc,'p').map((p,i)=>({id:`p${i}`,number:i+1,text:elements(p,'t').map(t=>t.textContent).join(''),protected:blocked.has(p)}));
  const cm=value=>value&&Number.isFinite(Number(value))?Number((Number(value)*2.54/1440).toFixed(2)):null;
  const sections=elements(doc,'sectPr').slice(0,6).map(p=>{const size=direct(p,'pgSz'),margin=direct(p,'pgMar');return {widthCm:cm(size?.getAttributeNS(W,'w')),heightCm:cm(size?.getAttributeNS(W,'h')),marginsCm:Object.fromEntries(['top','left','bottom','right'].map(side=>[side,cm(margin?.getAttributeNS(W,side))]))};});
  const layoutSummary=JSON.stringify({basis:'เฉพาะค่าที่ระบุโดยตรงใน XML ไม่ใช่การตรวจทุกหน้าหรือคำนวณรูปแบบที่สืบทอดครบ',sections,directFonts:[...new Set(elements(doc,'rFonts').flatMap(n=>['ascii','hAnsi','cs','eastAsia'].map(k=>n.getAttributeNS(W,k)).filter(Boolean)))].slice(0,10),directFontSizesPt:[...new Set(elements(doc,'sz').map(n=>Number(n.getAttributeNS(W,'val'))/2))].slice(0,10),directSpacing:elements(doc,'spacing').slice(0,8).map(n=>({line:n.getAttributeNS(W,'line'),rule:n.getAttributeNS(W,'lineRule'),before:n.getAttributeNS(W,'before'),after:n.getAttributeNS(W,'after')}))}).slice(0,3000);
  return {zip,original,paragraphs,editableParagraphs,paragraphRecords,lockedParagraphIds:[],layoutSummary,tableCount:elements(doc,'tbl').length,name:file.name};
}
export async function formatDocx(loaded,options){
  const margin=Number(options.margin),size=Number(options.fontSize),line=Number(options.lineHeight);
  const preserveLayout=options.preserveLayout!==false;
  if(!preserveLayout&&(!['a4','letter'].includes(options.paper)||!['portrait','landscape'].includes(options.orientation)||!Number.isFinite(margin)||margin<1||margin>4||!Number.isFinite(size)||size<10||size>24||![1,1.15,1.5,2].includes(line)||!['TH Sarabun New','Tahoma','Arial','preserve'].includes(options.font)))throw new Error('ค่ารูปแบบเอกสารไม่ถูกต้อง');
  // Always start with the original: choosing preserve after a prior run restores original fonts.
  const zip=await JSZip.loadAsync(loaded.original);const xml=parseXml(await zip.file('word/document.xml').async('string'));const body=elements(xml,'body')[0];if(!body)throw new Error('ไม่พบเนื้อหาเอกสาร');
  const edits=options.edits||[],allowed=wordAIParagraphs(loaded),all=elements(xml,'p');
  const styles=zip.file('word/styles.xml')?parseXml(await zip.file('word/styles.xml').async('string')):null,blocked=protectedParagraphs(xml,styles);
  if(!Array.isArray(edits)||edits.length>80||new Set(edits.map(e=>e?.id)).size!==edits.length)throw new Error('รายการแก้ไข AI ไม่ถูกต้อง');
  for(const edit of edits){const original=allowed.find(p=>p.id===edit?.id),p=all[Number(edit?.id?.slice(1))];if(!original||typeof edit.text!=='string'||!edit.text.trim()||edit.text.length>3000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\r\n]/.test(edit.text)||!p||!editableParagraph(p,blocked)||elements(p,'t').map(t=>t.textContent).join('')!==original.text)throw new Error('AI แก้ย่อหน้าที่ไม่รองรับหรือข้อมูลต้นฉบับเปลี่ยน');replaceParagraphText(p,edit.text);}
  if(preserveLayout){if(!edits.length)return new Blob([loaded.original],{type:DOCX_TYPE});zip.file('word/document.xml',new XMLSerializer().serializeToString(xml));return zip.generateAsync({type:'blob',mimeType:DOCX_TYPE,compression:'DEFLATE'});}
  let sections=elements(xml,'sectPr');if(!sections.length)sections=[ensure(body,'sectPr')];
  let [width,height]=options.paper==='letter'?[12240,15840]:[11906,16838];if(options.orientation==='landscape')[width,height]=[height,width];
  sections.forEach(section=>{attrs(ensure(section,'pgSz'),{w:width,h:height,orient:options.orientation});const m=Math.round(margin/2.54*1440);attrs(ensure(section,'pgMar'),{top:m,right:m,bottom:m,left:m});cleanOrder(section,SECT_ORDER);});
  // Set paragraph spacing without replacing text, numbering, table cells or heading styles.
  elements(xml,'p').filter(p=>!blocked.has(p)).forEach(p=>{const pr=ensure(p,'pPr',true),spacing=ensure(pr,'spacing');for(const key of ['beforeAutospacing','afterAutospacing','beforeLines','afterLines'])spacing.removeAttributeNS(W,key);attrs(spacing,{before:0,after:120,line:Math.round(line*240),lineRule:'auto'});cleanOrder(pr,P_ORDER);});
  if(options.font!=='preserve')elements(xml,'p').filter(p=>!blocked.has(p)).forEach(p=>elements(p,'r').forEach(r=>{const pr=ensure(r,'rPr',true);setFont(pr,options.font,size);cleanOrder(pr,R_ORDER);}));
  zip.file('word/document.xml',new XMLSerializer().serializeToString(xml));
  if(options.font!=='preserve'&&zip.file('word/styles.xml')){const styles=parseXml(await zip.file('word/styles.xml').async('string'));const defaults=ensure(styles.documentElement,'docDefaults',true);const run=ensure(ensure(defaults,'rPrDefault',true),'rPr');setFont(run,options.font,size);cleanOrder(run,R_ORDER);zip.file('word/styles.xml',new XMLSerializer().serializeToString(styles));}
  return zip.generateAsync({type:'blob',mimeType:DOCX_TYPE,compression:'DEFLATE'});
}
function escapeXml(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
export async function textToDocx(title,text){
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  const paras=text.split(/\r?\n/).map((line,i)=>`<w:p><w:pPr>${i===0?'<w:pStyle w:val="Title"/>':''}<w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${paras}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  zip.file('word/styles.xml',`<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New" w:eastAsia="TH Sarabun New"/><w:color w:val="000000"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="40"/></w:rPr></w:style></w:styles>`);
  return zip.generateAsync({type:'blob',mimeType:DOCX_TYPE,compression:'DEFLATE'});
}
