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
    const geometries = d.scene.getObjectByName('kael')?.children?.filter(x => x.isMesh).map(x => x.geometry) || [];
    const pairs = [['quay','smithy'], ['pier_a','smithy'], ['pier_b','harbor_office'],
      ['quay','stall_b'], ['stall_b','plaza'], ['plaza','monastery'], ['monastery','north_gate']];
    const npcPaths = pairs.map(([from,to]) => ({ from, to, ok: !!nav?.path(...d.region.places[from], ...d.region.places[to]) }));
    const bridge = {upper:d.groundAt(413,-484,400),lower:d.groundAt(413,-484,70)};
    const grades = (routes || []).map(route => {
      let violations = 0;
      for (let i = 1; i < route.pts.length; i++) {
        const a = route.pts[i-1], b = route.pts[i], len = Math.hypot(b[0]-a[0], b[1]-a[1]);
        const steps = Math.max(1, Math.ceil(len / 2));
        let last = d.groundAt(a[0],a[1],400);
        for (let j=1; j<=steps; j++){
          const x=a[0]+(b[0]-a[0])*j/steps, z=a[1]+(b[1]-a[1])*j/steps;
          const h=d.groundAt(x,z,400);
          if (Math.abs(h-last)>1.9) violations++;
          last=h;
        }
      }
      return { id:route.id, reachable:route.reachable, waypoints:route.pts.length,
        paved:route.pavedSegments, violations };
    });
    return { grades, npcPaths, vertices: geometries.reduce((sum, geo) => sum + geo.attributes.position.count, 0),
      sceneCount: d.scene.children.length, webgl: !!d.renderer.getContext(), bridge };
  });
  console.log('KAEL ROADS '+JSON.stringify(result));
  assert(result.webgl && result.vertices > 10000, 'Existing Kael render geometry missing');
  assert(result.bridge.upper>77.9 && result.bridge.upper<78.3 && result.bridge.lower<74, 'Upper stone promenade blocks the lower stair or is not walkable');
  assert.equal(result.grades.length, 11, 'Incomplete route graph');
  assert(result.grades.every(x => x.reachable && x.waypoints >= 2), 'Missing navigable route');
  assert(result.grades.filter(x => x.paved > 2).length >= 8, 'Paving is absent from the main routes');
  assert(result.grades.every(x => x.violations === 0), 'Path crosses a non-traversable height jump');
  assert(result.npcPaths.every(x => x.ok), 'NPC cannot reach a major facility');
  assert.deepEqual(errors, [], 'Browser startup errors');
  console.log('PASS: Kael routes, collision-aware heights, merged paving and NPC navigation');
  await page.close();
} finally { if (browser) await browser.close(); server.kill(); }
