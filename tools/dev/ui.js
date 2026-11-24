import {workspaceUrl} from './viewport.js';
import {normalizeStudioCharacter} from '../../src/entities/character/appearance.js';

const field = id => document.getElementById(id);
const screen = field('screen'), size = field('size'), status = field('status');
const place = field('place'), places = field('places'), openGame = field('open-game');
const frame = document.querySelector('iframe');
const page = {
  character:new URL('../../src/entities/character/studio.html', import.meta.url),
  game:new URL('../../index.html', import.meta.url)
};
const dimensions = {portrait:[390,736], landscape:[780,360], desktop:[1180,700]};
const fixture = new URLSearchParams(location.search).get('fixture');
if (fixture) {
  try {
    page.fixture = workspaceUrl(fixture, ['tools/dev/'], '.html');
    screen.add(new Option('작업 화면', 'fixture', true, true));
  } catch (error) {
    status.textContent = error.message;
  }
}

function loadScreen() {
  const game = screen.value === 'game';
  places.hidden = true;
  place.options.length = 1;
  openGame.hidden = !game;
  frame.hidden = game;
  if (game) {
    frame.removeAttribute('src');
    status.textContent = '게임은 이 사이트의 저장 데이터를 사용해. 별도 저장에서 시험하려면 다른 브라우저 프로필이나 로컬 서버를 사용해';
  } else frame.src = page[screen.value].href;
}
function resize() {
  const [width,height] = dimensions[size.value];
  frame.style.width = width + 'px';
  frame.style.height = height + 'px';
}

let profile = normalizeStudioCharacter({});
addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin || screen.value !== 'character') return;
  switch (event.data?.type) {
    case 'sernbeld:studio-ready':
      frame.contentWindow.postMessage({type:'sernbeld:edit-character', character:profile, first:false}, location.origin);
      break;
    case 'sernbeld:apply-character':
      profile = normalizeStudioCharacter(event.data.character);
      status.textContent = '작업대에 외형을 적용했어';
      break;
    case 'sernbeld:cancel-character':
      status.textContent = '외형 편집을 취소했어';
      loadScreen();
      break;
  }
});

const locationNames = {
  quay:'부두', plaza:'광장', smithy:'작업장', monastery:'수도원', north_gate:'북문'
};
place.addEventListener('focus', () => {
  const definitions = frame.contentWindow.__dev?.region.places;
  if (!definitions || place.options.length > 1) return;
  for (const [id, name] of Object.entries(locationNames)) {
    if (definitions[id]) place.add(new Option(name, id));
  }
});
place.addEventListener('change', () => {
  const dev = frame.contentWindow.__dev;
  const point = dev?.region.places[place.value];
  if (point) {
    dev.player.teleport(point[0], point[1], 0);
    dev.rig.reset(dev.player);
    place.value = '';
    status.textContent = '게임 창에서 이동과 충돌을 확인해';
  }
});
screen.addEventListener('change', () => {
  status.textContent = '';
  loadScreen();
});
openGame.addEventListener('click', () => {
  frame.src = page.game.href;
  frame.hidden = false;
  openGame.hidden = true;
  places.hidden = false;
  status.textContent = '게임 로딩이 끝나면 카엘의 장소로 이동할 수 있어';
});
size.addEventListener('change', resize);
resize();
loadScreen();
