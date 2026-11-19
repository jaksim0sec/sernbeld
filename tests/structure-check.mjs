#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const baseline='/tmp/sernbeld-main/';
const text=async path=>readFile(path,'utf8');
const cssParts=['tokens','hud','menus-and-overlays','responsive','world-map'];
const css= (await Promise.all(cssParts.map(n=>text('styles/'+n+'.css')))).join('');
assert.equal(css,await text(baseline+'styles.css'),'CSS concatenation changed original stylesheet');
const mainHTML=await text(baseline+'index.html');
let currentHTML=await text('index.html');
// The PWA adds metadata and a deferred registration script without touching the game UI.
for (const entry of [
  '<link rel="manifest" href="./manifest.webmanifest">\\n',
  '<link rel="icon" href="./assets/pwa-icon.svg" type="image/svg+xml">\\n',
  '<meta name="theme-color" content="#102332">\\n',
  '<script src="./pwa.js" defer></script>\\n'
]) {
  const literal = entry.replaceAll('\\n', '\n');
  assert(currentHTML.includes(literal), 'Missing PWA integration: '+literal.trim());
  currentHTML = currentHTML.replace(literal, '');
}
const sprite=await text('assets/ui-icons.svg');
const symbols=new Map([...sprite.matchAll(/<symbol id="([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)].map(m=>[m[1],m[3]]));
let count=0;
currentHTML=currentHTML.replace(/<svg\b([^>]*)><use href="\.\/assets\/ui-icons\.svg#([^"]+)"><\/use><\/svg>/g,(_all,attrs,id)=>{
 assert(symbols.has(id),'Unresolved SVG sprite symbol '+id);count++;
 return '<svg'+attrs+'>'+symbols.get(id)+'</svg>';
});
assert.equal(count,15,'Expected all 15 inline SVGs replaced');
const styles=cssParts.map(n=>'<link rel="stylesheet" href="./styles/'+n+'.css">').join('\n');
assert(currentHTML.includes(styles),'CSS links changed order');
currentHTML=currentHTML.replace(styles,'<link rel="stylesheet" href="./styles.css">');
assert.equal(currentHTML,mainHTML,'Unexpected DOM/HTML change beyond CSS/SVG extraction');
console.log('PASS: original HTML reconstructed, CSS cascade intact and 15 icons valid');
