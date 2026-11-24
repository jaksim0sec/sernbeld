import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {triangleGlb} from './glb-fixture.mjs';

const output = 'test-results/dev-studio';
const origin = 'http://127.0.0.1:8788';
const server = spawn('python3', ['-m', 'http.server', '8788', '--bind', '127.0.0.1'], {stdio:'ignore'});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(origin + '/README.md').then(r => r.ok, () => false)) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Development HTTP server did not start');
  browser = await chromium.launch({
    args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({viewport:{width:780,height:780}});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE\.WebGLProgram/.test(message.text())) errors.push(message.text());
  });
  await mkdir(output, {recursive:true});
  const status = page.getByRole('status');
  const waitStatus = text => status.filter({hasText:text}).waitFor({timeout:60_000});

  assert.equal((await page.goto(origin + '/tools/dev/?module=tools/dev/sample-garments.js')).status(), 200);
  await waitStatus('남성');
  const garmentOptions = page.getByLabel('모자');
  await garmentOptions.selectOption('hat.preview-cap');
  await waitStatus('시험용 챙모자');
  await page.getByLabel('체형').selectOption('female');
  await page.getByLabel('자세').selectOption('ik');
  await page.getByLabel('LOD').selectOption('2');
  await waitStatus(/여성.*손 IK.*LOD 2.*시험용 챙모자/);
  await garmentOptions.selectOption('hat.preview-crown');
  await page.getByLabel('기준 인체 비교').check();
  await waitStatus(/시험용 머리띠.*기준 인체/);
  await page.screenshot({path:output + '/garment.png'});

  assert.equal((await page.goto(origin + '/tools/dev/assets.html')).status(), 200);
  await waitStatus('kael-cutstone-v7.glb.gz');
  await page.getByLabel('모델 GLB').setInputFiles({name:'foliage.glb', mimeType:'model/gltf-binary', buffer:triangleGlb(1, 2)});
  await waitStatus(/foliage\.glb.*1\.00 × 2\.00 × 0\.00 m/);
  await page.getByLabel('모델 GLB').setInputFiles({name:'rock.glb', mimeType:'model/gltf-binary', buffer:triangleGlb(2, 1)});
  await waitStatus(/rock\.glb.*2\.00 × 1\.00 × 0\.00 m/);
  await page.getByLabel('충돌 GLB').setInputFiles({name:'rock-collision.glb', mimeType:'model/gltf-binary', buffer:triangleGlb(2, 1)});
  await waitStatus('rock-collision.glb');
  await page.getByLabel('모델 GLB').setInputFiles({name:'broken.glb', mimeType:'model/gltf-binary', buffer:Buffer.from('broken')});
  await waitStatus('모델을 열 수 없어');
  await page.getByLabel('모델 GLB').setInputFiles({name:'rock.glb', mimeType:'model/gltf-binary', buffer:triangleGlb(2, 1)});
  await waitStatus('rock.glb');
  await page.screenshot({path:output + '/asset.png'});

  assert.equal((await page.goto(origin + '/tools/dev/ui.html')).status(), 200);
  const frame = page.frameLocator('iframe');
  await frame.locator('#play:enabled').waitFor({timeout:60_000});
  assert(await frame.locator('#studio-back').isVisible());
  await frame.locator('[data-body=female]').click();
  await frame.locator('#play').click();
  await waitStatus('작업대에 외형을 적용했어');
  await page.getByLabel('화면 크기').selectOption('landscape');
  assert.equal((await page.locator('iframe').boundingBox()).height, 360);
  await page.screenshot({path:output + '/ui.png'});
  await page.locator('#screen').selectOption('game');
  await waitStatus('사이트의 저장 데이터를 사용해');
  assert.equal(await page.locator('iframe').getAttribute('src'), null);
  await page.getByRole('button', {name:'현재 저장으로 게임 열기'}).click();
  await page.waitForFunction(() => Boolean(document.querySelector('iframe').contentWindow.__dev), null, {timeout:90_000});
  const place = page.getByLabel('카엘로 이동');
  await place.focus();
  await place.selectOption('quay');
  await waitStatus('이동과 충돌을 확인해');
  const location = await frame.locator('body').evaluate(body => {
    const dev = body.ownerDocument.defaultView.__dev;
    const [x,z] = dev.region.places.quay;
    return Math.hypot(dev.player.pos.x - x, dev.player.pos.z - z);
  });
  assert(location < .2, 'Game did not move to the runtime quay');
  assert.deepEqual(errors, []);
  console.log('PASS garment module swap, runtime pose/LOD and bare comparison, GLB replacement/collision/error recovery, actual creator viewport and live world navigation');
} finally {
  await browser?.close();
  server.kill();
}
