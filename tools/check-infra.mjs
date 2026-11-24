import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkCatalog,checkTasks} from './infra-contract.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const exists=p=>existsSync(resolve(root,p));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const jsonFiles=dir=>readdirSync(resolve(root,dir)).filter(p=>p.endsWith('.json')).map(p=>dir+'/'+p);
const catalog=jsonFiles('docs/catalog').flatMap(p=>{const entries=read(p);if(!Array.isArray(entries))throw Error(p+' must be an array');return entries;});
const taskDirs=['docs/tasks/active','docs/tasks/archive'].filter(exists);
const taskFiles=taskDirs.flatMap(jsonFiles);
const tasks=taskFiles.map(read);
const errors=[...checkCatalog(catalog,exists),...checkTasks(tasks,exists)];
for(const p of taskFiles){const t=read(p);if(!p.endsWith('/'+t.id+'.json'))errors.push('task filename mismatch '+p);if(p.includes('/active/')&&t.status==='done'||p.includes('/archive/')&&t.status!=='done')errors.push('task directory/status mismatch '+p);}
const mdFiles=['AGENTS.md','docs/UI_UX_DESIGN_GUIDELINES.md',...['docs/core','docs/workflows','docs/contracts','docs/validation','docs/references','docs/knowledge','docs/tasks','docs/tasks/active','docs/tasks/templates'].flatMap(dir=>readdirSync(resolve(root,dir)).filter(p=>p.endsWith('.md')).map(p=>dir+'/'+p))];
for(const p of mdFiles){const body=readFileSync(resolve(root,p),'utf8');for(const match of body.matchAll(/\]\(([^\s)]+)\)/g)){const target=match[1].split('#')[0];if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target))continue;try{const path=resolve(root,dirname(p),decodeURIComponent(target));const rel=relative(root,path);if(rel==='..'||rel.startsWith('../')||!existsSync(path))errors.push(p+': unresolved link '+target);}catch{errors.push(p+': invalid link '+target);}}}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('PASS '+catalog.length+' catalog entries, '+tasks.length+' task records, '+mdFiles.length+' routed documents');
