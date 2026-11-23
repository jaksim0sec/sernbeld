import {compileSkill} from '../core/skill-engine.js';
import {createSkillRunner} from '../core/skill-runner.js';

const DRAFT_ID = 'workbench-thrust';
const DEFAULT_CONFIG = {
  discipline: 'physical', baseAction: 'thrust', speed: 1, repeat: 1,
  power: 1, manaInjection: 0, energyDistribution: 'even'
};
// The workbench is a sandbox for timings, including settings beyond the player's current mastery.
const PREVIEW_ACTOR = {stamina: 100, mana: 0, maxMana: 0, physicalControl: 2, magicControl: 0};

const point = (r, a) => [180 + r * Math.cos(a), 180 + r * Math.sin(a)];

function createSeal(svg) {
  const ticks = Array.from({length: 48}, (_, i) => {
    const angle = i * Math.PI / 24;
    return `<path d="M${point(i % 4 === 0 ? 153 : 157, angle)}L${point(163, angle)}"/>`;
  }).join('');
  const arcs = Array.from({length: 4}, (_, i) => {
    const start = i * Math.PI / 2 - Math.PI / 2 + .1;
    return `<path d="M${point(171, start)}A171 171 0 0 1 ${point(171, start + 1.37)}"/>`;
  }).join('');
  svg.innerHTML = `<g class="skill-ring"><circle cx="180" cy="180" r="166"/>
    <circle cx="180" cy="180" r="149"/><circle cx="180" cy="180" r="110"/>
    <circle cx="180" cy="180" r="51"/>${ticks}${arcs}
    <path d="M180 34 326 180 180 326 34 180Z"/>
    <path d="M180 70 275 235 85 235Z M180 290 85 125 275 125Z"/>
  </g><g class="skill-timeline"></g>`;
  return svg.lastElementChild;
}

function drawTimeline(timeline, plan) {
  const nodes = plan?.steps.map(({at}) => point(113, -Math.PI + at / 1.7 * Math.PI)) ?? [];
  const links = nodes.map((p, i) => {
    const from = nodes[i - 1] ?? [180, 180];
    const [x, y] = p;
    return `<path class="skill-link" pathLength="1" data-step="${i}" d="M${from} L${p}"/>
      <g class="skill-node" data-step="${i}" transform="translate(${x} ${y})">
        <path d="M0 -14 14 0 0 14 -14 0Z"/><circle r="3"/>
      </g>`;
  }).join('');
  timeline.innerHTML = links;
}

export function createSkillWorkbench({library, canOpen, enter, leave}) {
  const byId = id => document.getElementById(id);
  const panel = byId('skillWorkbench'), toolbar = byId('skillsBtn'), satellite = byId('skillSatellite');
  const core = byId('skillCore'), diagram = byId('skillDiagram');
  const options = byId('skillOptions'), status = byId('skillStatus');
  const preview = byId('skillPreview'), save = byId('skillSave'), close = byId('skillClose');
  const timeline = createSeal(diagram);
  const choices = options.querySelectorAll('[data-speed], [data-repeat]');
  let config = null, plan = null, opener = null, frame = 0;
  const runner = createSkillRunner({
    spend: () => true,
    onStep: (_, index) => {
      diagram.querySelectorAll(`[data-step="${index}"]`).forEach(element => element.classList.add('fired'));
      status.value = `시험 중 · ${index + 1}/${plan.steps.length}회`;
    },
    onComplete: () => {
      preview.disabled = false;
      preview.classList.remove('playing');
      status.value = `시험 완료 · ${plan.steps.length}회 · ${plan.duration.toFixed(2)}초`;
    }
  });

  function cancelPreview() {
    runner.cancel();
    cancelAnimationFrame(frame);
    preview.classList.remove('playing');
    timeline.querySelectorAll('.fired').forEach(element => element.classList.remove('fired'));
  }

  function render() {
    cancelPreview();
    plan = config ? compileSkill(config, PREVIEW_ACTOR) : null;
    drawTimeline(timeline, plan);
    core.firstElementChild.hidden = Boolean(config);
    core.lastElementChild.hidden = !config;
    core.setAttribute('aria-label', config ? '찌르기' : '찌르기 추가');
    core.setAttribute('aria-disabled', String(Boolean(config)));
    options.hidden = !config;
    preview.disabled = !plan;
    save.classList.remove('saved', 'save-error');
    status.value = plan ? `${plan.duration.toFixed(2)}초 · 기력 ${plan.cost.stamina}` : '';
    if (!config) return;
    for (const choice of choices) {
      const field = 'speed' in choice.dataset ? 'speed' : 'repeat';
      choice.setAttribute('aria-pressed', String(Number(choice.dataset[field]) === config[field]));
    }
  }

  function updateSatellite() {
    const record = library.get(DRAFT_ID);
    satellite.textContent = record ? '◇' : '+';
    satellite.setAttribute('aria-label', record ? '저장한 찌르기 열기' : '기술 만들기');
    satellite.classList.toggle('has-skill', Boolean(record));
  }

  function open(event) {
    if (!panel.hidden || !canOpen()) return;
    const saved = library.get(DRAFT_ID);
    config = saved?.version === 1 ? saved.config : null;
    opener = event.currentTarget;
    enter();
    panel.hidden = false;
    document.body.classList.add('skill-editing');
    render();
    (config ? preview : core).focus({preventScroll: true});
  }

  function dismiss() {
    if (panel.hidden) return;
    cancelPreview();
    panel.hidden = true;
    document.body.classList.remove('skill-editing');
    leave();
    opener?.focus({preventScroll: true});
  }

  toolbar.hidden = satellite.hidden = false;
  updateSatellite();
  toolbar.addEventListener('click', open);
  satellite.addEventListener('click', open);
  close.addEventListener('click', dismiss);
  core.addEventListener('click', () => {
    if (config) return;
    config = {...DEFAULT_CONFIG};
    render();
    options.querySelector('[data-speed="1"]').focus({preventScroll: true});
  });
  for (const choice of choices) {
    choice.addEventListener('click', () => {
      if (!config) return;
      const field = 'speed' in choice.dataset ? 'speed' : 'repeat';
      const value = Number(choice.dataset[field]);
      if (config[field] === value) return;
      config = {...config, [field]: value};
      render();
    });
  }
  save.addEventListener('click', () => {
    if (!config) return;
    save.classList.remove('saved', 'save-error');
    try {
      library.put({id: DRAFT_ID, name: '찌르기', discipline: 'physical', version: 1, config});
      updateSatellite();
      save.classList.add('saved');
      status.value = '찌르기를 저장했어';
    } catch {
      save.classList.add('save-error');
      status.value = '기술을 저장할 수 없어';
    }
  });
  preview.addEventListener('click', () => {
    if (!plan || runner.isActive()) return;
    cancelPreview();
    runner.start(plan);
    preview.disabled = true;
    preview.classList.add('playing');
    status.value = '시험 시작';
    let previous = performance.now();
    const advance = now => {
      runner.advance(Math.max(0, now - previous) / 1000);
      previous = now;
      if (runner.isActive()) frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
  });

  return {isOpen: () => !panel.hidden, dismiss};
}
