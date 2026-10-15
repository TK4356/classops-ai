import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparisonSegments} from '../docx.js';

const segmenter=new Intl.Segmenter('th',{granularity:'grapheme'});
const graphemes=text=>Array.from(segmenter.segment(text),part=>part.segment);

function assertValidDiff(before,after){
  const parts=comparisonSegments(before,after);
  assert(Array.isArray(parts));
  parts.forEach((part,index)=>{
    assert(['equal','delete','insert'].includes(part.type));
    assert.equal(typeof part.text,'string');
    assert(part.text.length>0,'do not create empty/placeholder segments');
    if(index)assert.notEqual(part.type,parts[index-1].type,'adjacent segments of the same type should be coalesced');
  });
  assert.equal(parts.filter(part=>part.type!=='insert').map(part=>part.text).join(''),before);
  assert.equal(parts.filter(part=>part.type!=='delete').map(part=>part.text).join(''),after);
  for(const [original,omitted] of [[before,'insert'],[after,'delete']]){
    const boundaries=new Set([0]);
    let offset=0;
    for(const cluster of graphemes(original)){offset+=cluster.length;boundaries.add(offset);}
    offset=0;
    for(const part of parts.filter(part=>part.type!==omitted)){
      offset+=part.text.length;
      assert(boundaries.has(offset),'a diff segment must end at a complete grapheme boundary');
    }
  }
  return parts;
}

test('comparison keeps the unchanged Thai text between separate corrections unbolded',()=>{
  const before='ครูส่งงานวันจัน และประชุมวันสุก';
  const after='ครูส่งงานวันจันทร์ และประชุมวันศุกร์';
  const parts=assertValidDiff(before,after);
  assert(parts.some(part=>part.type==='equal'&&part.text.includes(' และประชุมวัน')));
  assert(parts.filter(part=>part.type!=='equal').every(part=>!part.text.includes('ประชุม')));
  assert(parts.filter(part=>part.type!=='equal').length>=3);
});

test('insertions and deletions have no artificial bold text on the unchanged side',()=>{
  assert.deepEqual(assertValidDiff('ครูตรวจงาน','ครูช่วยตรวจงาน'),[
    {type:'equal',text:'ครู'},{type:'insert',text:'ช่วย'},{type:'equal',text:'ตรวจงาน'}
  ]);
  assert.deepEqual(assertValidDiff('ครูช่วยตรวจงาน','ครูตรวจงาน'),[
    {type:'equal',text:'ครู'},{type:'delete',text:'ช่วย'},{type:'equal',text:'ตรวจงาน'}
  ]);
  assert.deepEqual(assertValidDiff('','เพิ่ม'),[{type:'insert',text:'เพิ่ม'}]);
  assert.deepEqual(assertValidDiff('ลบ',''),[{type:'delete',text:'ลบ'}]);
});

test('identical text, including whitespace, is entirely equal',()=>{
  const text='ครู\tตรวจงาน\n  นักเรียน';
  assert.deepEqual(assertValidDiff(text,text),[{type:'equal',text}]);
  assert.deepEqual(assertValidDiff('',''),[]);
});

test('Thai combining marks stay with their base character when corrected',()=>{
  const parts=assertValidDiff('กิ','กี');
  assert.deepEqual(parts.filter(part=>part.type==='equal'),[]);
  assert.deepEqual(parts.filter(part=>part.type==='delete'),[{type:'delete',text:'กิ'}]);
  assert.deepEqual(parts.filter(part=>part.type==='insert'),[{type:'insert',text:'กี'}]);
  assertValidDiff('นักเรืยนตั้งใจเรืยน','นักเรียนตั้งใจเรียน');
});

test('emoji surrogate pairs and ZWJ sequences remain whole graphemes',()=>{
  const parts=assertValidDiff('ครู 👩‍🏫 สอน 🙂','ครู 👨‍🏫 สอน 😀');
  assert(parts.some(part=>part.type==='delete'&&part.text==='👩‍🏫'));
  assert(parts.some(part=>part.type==='insert'&&part.text==='👨‍🏫'));
  assert(parts.some(part=>part.type==='equal'&&part.text.includes(' สอน ')));
  assertValidDiff('🙂🙂🙂','🙂😀🙂');
});

test('repeated text preserves order and limits the correction to the edited occurrence',()=>{
  const parts=assertValidDiff('งาน งาน งาน','งาน ดี งาน');
  assert.equal(parts.filter(part=>part.type==='delete').map(part=>part.text).join(''),'งาน');
  assert.equal(parts.filter(part=>part.type==='insert').map(part=>part.text).join(''),'ดี');
  assert.equal(parts.filter(part=>part.type==='equal').map(part=>part.text).join(''),'งาน  งาน');
  assertValidDiff('abababab','ababXabab');
});

test('HTML-like text is kept literal and not escaped, interpreted, or discarded by the diff',()=>{
  const before='<img src=x onerror="alert(1)"> & ข้อความ';
  const after='<img src=x onerror="alert(2)"> & ข้อความ';
  const parts=assertValidDiff(before,after);
  assert.deepEqual(parts.filter(part=>part.type==='delete'),[{type:'delete',text:'1'}]);
  assert.deepEqual(parts.filter(part=>part.type==='insert'),[{type:'insert',text:'2'}]);
  assert(parts.some(part=>part.type==='equal'&&part.text.startsWith('<img')));
});

test('seeded randomized comparisons reconstruct both inputs and preserve a longest common subsequence',()=>{
  let seed=0x351;
  const random=limit=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%limit;};
  const alphabet=['กิ','กี','ร','า','น','👩‍🏫','🙂','a','b',' ','<','&'];
  const generate=()=>Array.from({length:random(20)},()=>alphabet[random(alphabet.length)]).join('');
  const lcsLength=(left,right)=>{
    let row=new Array(right.length+1).fill(0);
    for(const char of left){
      const next=[0];
      for(let j=0;j<right.length;j++)next.push(char===right[j]?row[j]+1:Math.max(row[j+1],next[j]));
      row=next;
    }
    return row[right.length];
  };
  for(let attempt=0;attempt<250;attempt++){
    const before=generate(),after=generate(),parts=assertValidDiff(before,after);
    const equalLength=parts.filter(part=>part.type==='equal').reduce((sum,part)=>sum+graphemes(part.text).length,0);
    assert.equal(equalLength,lcsLength(graphemes(before),graphemes(after)),`non-minimal diff on randomized case ${attempt}`);
    assert.deepEqual(comparisonSegments(before,after),parts,'comparison output should be deterministic');
  }
});
