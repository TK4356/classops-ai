import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Word correction highlight uses a dark fill with high-contrast white text in both builds',async()=>{
  const css=await readFile(new URL('../enhancements.css',import.meta.url),'utf8');
  const rule=css.match(/\.word-change\{([^}]+)\}/)?.[1];
  assert(rule,'missing correction highlight rule');
  const foreground=rule.match(/(?:^|;)color:(#[0-9a-f]{6})(?:;|$)/i)?.[1];
  const background=rule.match(/(?:^|;)background:(#[0-9a-f]{6})(?:;|$)/i)?.[1];
  assert.equal(foreground,'#ffffff');assert.equal(background,'#14532d');
  const luminance=hex=>{
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  assert((values[0]+0.05)/(values[1]+0.05)>=7,'highlight text contrast must remain at least 7:1');
  assert(rule.includes('box-decoration-break:clone'),'wrapped changes retain their highlight');
  const standalone=await readFile(new URL('../standalone.html',import.meta.url),'utf8');
  assert(standalone.includes('.word-change{'+rule+'}'),'single-file build must ship the same highlight');
});
