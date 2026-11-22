#!/usr/bin/env node
// Browser-level route check: actual colliders, terrain height, rendered Geo and
// the SAME NavGrid as NPC schedules. Static route metadata alone is not enough.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8789', '--bind', '127.0.0.1', '--directory', process.cwd()], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  let started = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:8789/index.html')).ok) { started = true; break; } } catch {}
    await sleep(150);
  }
  assert(started, 'Local preview did not start');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 780, height: 360 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:8789/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__dev, { timeout: 180000 });
  const result = await page.evaluate(() => {
    const d = window.__dev, routes = d.World.kaelPaths, nav = d.World.kaelNav;
    const geometry = d.scene.getObjectByName('kael')?.children?.find(x => x.isMesh)?.geometry;
    const pairs = [['quay','smithy'], ['pier_a','smithy'], ['pier_b','harbor_office'],
      ['quay','stall_b'], ['stall_b','plaza'], ['plaza','monastery']];
    const npcPaths = pairs.map(([from,to]) => ({ from, to, ok: !!nav?.path(...d.region.places[from], ...d.region.places[to]) }));
    const grades = (routes || []).map(route => {
      let violations = 0;
      for (let i = 1; i < route.pts.length; i++) {
        const a = route.pts[i-1], b = route.pts[i], len = Math.hypot(b[0]-a[0], b[1]-a[1]);
        const steps = Math.max(1, Math.ceil(len / 2));
        let last = d.groundAt(a[0],a[1],400);
        for (let j=1; j<=steps; j++){
          const x=a[0]+(b[0]-a[0])*j/steps, z=a[1]+(b[1]-a[1])*j/steps;
          const h=d.groundAt(x,z,400);
          if (Math.abs(h-last)>1.6) violations++;
          last=h;
        }
      }
      return { id:route.id, reachable:route.reachable, waypoints:route.pts.length,
        paved:route.pavedSegments, violations };
    });

    const probes = [
      [397,-430],[397,-440],[397,-448],[397,-450],[397,-452],[397,-454],[397,-464],[397,-470],
      [398,-474],[398,-478],[398,-480],[398,-482],[398,-484],[398,-486],[398,-492],
      [389,-448],[393,-448],[399,-448],[401,-448],[407,-448],[441,-448],[443,-448],
      [389,-480],[393,-480],[399,-480],[401,-480],[407,-480],[443,-480],[445,-480],
      [392,-490],[392,-498],[410,-490],[410,-500],[480,-500],[480,-509],
    ].map(([x,z])=>{
      const o=nav.idx(x,z), xy=o>=0?nav.center(o):null;
      return {at:[x,z],cell:xy,ground:+d.groundAt(x,z,400).toFixed(2),navH:o>=0?+nav.g[o].toFixed(2):null,ok:o>=0?!!nav.ok[o]:false,cols:d.collidersAt(x,z).filter(k=>!k.walk).slice(0,2)};
    });
    const riseTrials=[1.4,1.6,1.8,2,2.5,3,4,8,20].map(rise=>{
      nav.maxRise=rise;
      return {rise, upper:!!nav.path(397,-430,392,-488),gate:!!nav.path(392,-488,480,-500),
      lower:!!nav.path(397,-465,445,-480),stairs:!!nav.path(443,-480,397,-480),
      top:!!nav.path(397,-480,392,-490)};
    });
    nav.maxRise=1.4;
    const stairEntrance=[];
    for(let x=439;x<=457;x+=2) for(const z of [-472,-474,-476,-478,-480,-482,-484,-486]){
      const i=nav.idx(x,z);
      stairEntrance.push([x,z,+(nav.g[i]||0).toFixed(1),nav.ok[i]?1:0]);
    }
    nav.maxRise=8;
    const upperToGate=nav.path(392,-488,480,-500);
    const highJumps=[];
    if(upperToGate) for(let k=1;k<upperToGate.length;k++){
      const a=upperToGate[k-1],b=upperToGate[k],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const m=Math.max(1,Math.ceil(len));
      let prev=[a[0],a[1],d.groundAt(a[0],a[1],400)];
      for(let j=1;j<=m;j++){
        const x=a[0]+(b[0]-a[0])*j/m,z=a[1]+(b[1]-a[1])*j/m,h=d.groundAt(x,z,400);
        if(Math.abs(h-prev[2])>1.6)highJumps.push({from:prev.map(n=>+n.toFixed(2)),to:[x,z,h].map(n=>+n.toFixed(2)),rise:+(h-prev[2]).toFixed(2)});
        prev=[x,z,h];
      }
    }
    nav.maxRise=1.4;
    const northEntrance=[];
    for(let x=419;x<=455;x+=2)for(const z of [-492,-494,-496,-498,-500,-502,-504,-506,-508,-510,-512]){
      const i=nav.idx(x,z);
      northEntrance.push([x,z,+(nav.g[i]||0).toFixed(1),nav.ok[i]?1:0]);
    }
    nav.maxRise=1.65;
    const localPaths = [
      ["monastery-to-corridor",[392,-488],[413,-488]],
      ["monastery-to-x419",[392,-488],[419,-492]],
      ["monastery-to-backstreet",[392,-488],[423,-506]],
      ["corridor-to-backstreet",[413,-488],[423,-506]],
      ["backstreet-to-ramp",[423,-506],[439,-508]],
      ["ramp-to-northgate",[439,-508],[480,-500]],
      ["north-by-roof",[419,-492],[480,-500]],
      ["east-monastery",[392,-488],[420,-488]]
    ].map(([id,a,b])=>({id,path:nav.path(...a,...b)}));
    nav.maxRise=1.4;
    const monasteryGap=[];
    for(let x=391;x<=425;x+=2)for(const z of [-482,-484,-486,-488,-490,-492,-494,-496,-500,-504,-506]){
      const o=nav.idx(x,z);
      monasteryGap.push([x,z,+(nav.g[o]||0).toFixed(1),nav.ok[o]?1:0]);
    }
    const segments=[
      ["market-homes-a",[397,-432],[397,-470]],["market-homes-b",[445,-435],[440,-465]],
      ["homes-upper-a",[393,-467],[393,-490]],["homes-upper-b",[442,-465],[443,-491]],
      ["upper-north",[393,-495],[480,-500]]
    ].map(([id,a,b])=>({id,path:nav.path(...a,...b)?.length||0}));
    return { grades, npcPaths, vertices: geometry?.attributes?.position?.count || 0,
      sceneCount: d.scene.children.length, webgl: !!d.renderer.getContext(), probes, segments, riseTrials, stairEntrance, upperToGate, highJumps, northEntrance, localPaths, monasteryGap };
  });
  console.log('KAEL ROADS '+JSON.stringify(result));
  assert(result.webgl && result.vertices > 10000, 'Existing Kael render geometry missing');
  assert.equal(result.grades.length, 11, 'Incomplete route graph');
  assert(result.grades.every(x => x.reachable && x.waypoints >= 2), 'Missing navigable route');
  assert(result.grades.filter(x => x.paved > 2).length >= 8, 'Paving is absent from the main routes');
  assert(result.grades.every(x => x.violations === 0), 'Path crosses a non-traversable height jump');
  assert(result.npcPaths.every(x => x.ok), 'NPC cannot reach a major facility');
  assert.deepEqual(errors, [], 'Browser startup errors');
  console.log('PASS: Kael routes, collision-aware heights, merged paving and NPC navigation');
  await page.close();
} finally { if (browser) await browser.close(); server.kill(); }
