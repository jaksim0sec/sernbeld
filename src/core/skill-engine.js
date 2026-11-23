// Data-only compiler. The runtime owns animations, collision and spending resources.
const FIELDS = new Set(['discipline', 'baseAction', 'repeat', 'speed', 'power', 'manaInjection', 'energyDistribution']);
export const MAX_PHYSICAL_ACTIONS = 3;
const SPEEDS = [0.75, 1, 1.25];
const POWERS = [0.75, 1, 1.25];
const validActor = value => value && typeof value === 'object' && !Array.isArray(value) &&
  ['stamina', 'mana', 'maxMana'].every(k => Number.isFinite(value[k]) && value[k] >= 0) &&
  ['physicalControl', 'magicControl'].every(k => Number.isSafeInteger(value[k]) && value[k] >= 0);

const ACTION_FIELDS = new Set(['action', 'share', 'repeat', 'speed', 'power', 'slot']);
const V2_FIELDS = new Set(['discipline', 'manaInjection', 'actions']);

function validateComposite(config, actor) {
  const errors = [];
  const cost = {stamina: 0, mana: 0};
  for (const key of Object.keys(config)) if (!V2_FIELDS.has(key)) errors.push('unknown block: ' + key);
  if (config.discipline !== 'physical') errors.push('unsupported discipline');
  if (!Number.isSafeInteger(config.manaInjection) || config.manaInjection < 0) errors.push('invalid manaInjection');
  if (!Array.isArray(config.actions) || config.actions.length < 1 || config.actions.length > MAX_PHYSICAL_ACTIONS) {
    errors.push('invalid action count');
  } else {
    let totalShare = 0;
    const usedSlots=new Set();
    for (const action of config.actions) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) { errors.push('invalid action'); continue; }
      for (const key of Object.keys(action)) if (!ACTION_FIELDS.has(key)) errors.push('unknown action field: ' + key);
      if (action.action !== 'thrust') errors.push('unsupported baseAction');
      if (action.slot !== undefined) {
        if (!Number.isSafeInteger(action.slot) || action.slot<0 || action.slot>=MAX_PHYSICAL_ACTIONS || usedSlots.has(action.slot)) errors.push('invalid slot');
        usedSlots.add(action.slot);
      }
      if (!Number.isSafeInteger(action.share) || action.share < 0 || action.share > 100) errors.push('invalid share');
      else totalShare += action.share;
      if (!Number.isSafeInteger(action.repeat) || action.repeat < 1 || action.repeat > 3) errors.push('invalid repeat');
      if (!SPEEDS.includes(action.speed)) errors.push('invalid speed');
      if (!POWERS.includes(action.power)) errors.push('invalid power');
      if (validActor(actor)) {
        const cap = actor.physicalControl < 1 ? 1 : actor.physicalControl < 2 ? 2 : 3;
        if (Number.isSafeInteger(action.repeat) && action.repeat > cap) errors.push('insufficient physicalControl for repeat');
        if (actor.physicalControl === 0 && action.speed > 1) errors.push('insufficient physicalControl for speed');
      }
      if (Number.isSafeInteger(action.repeat) && action.repeat >= 1 && action.repeat <= 3 &&
          SPEEDS.includes(action.speed) && POWERS.includes(action.power)) {
        cost.stamina += Math.ceil(8 * action.repeat * action.power * action.speed ** 2);
      }
    }
    if (totalShare !== 100) errors.push('shares must total 100');
  }
  if (!validActor(actor)) errors.push('invalid actor');
  if (Number.isSafeInteger(config.manaInjection) && config.manaInjection >= 0) cost.mana = config.manaInjection;
  if (validActor(actor)) {
    if (cost.stamina > actor.stamina) errors.push('insufficient stamina');
    if (cost.mana > actor.mana) errors.push('insufficient mana');
    if (cost.mana > actor.maxMana) errors.push('mana exceeds maxMana');
  }
  return {ok:errors.length===0, errors, cost};
}

function weightedMana(actions, total) {
  const exact=actions.map(action=>total*action.share/100);
  const result=exact.map(Math.floor);
  const priority=exact.map((n,index)=>({index,remain:n-result[index]}))
    .sort((a,b)=>b.remain-a.remain||a.index-b.index);
  for(let n=total-result.reduce((a,b)=>a+b,0),i=0;i<n;i++) result[priority[i].index]++;
  return result;
}

export function validateSkill(config, actor) {
  const errors = [];
  const cost = {stamina: 0, mana: 0};
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {ok: false, errors: ['invalid config'], cost};
  }
  if (Object.hasOwn(config,'actions')) return validateComposite(config,actor);
  for (const field of Object.keys(config)) if (!FIELDS.has(field)) errors.push('unknown block: ' + field);
  if (config.discipline !== 'physical') errors.push('unsupported discipline');
  if (config.baseAction !== 'thrust') errors.push('unsupported baseAction');
  if (!Number.isSafeInteger(config.repeat) || config.repeat < 1 || config.repeat > 3) errors.push('invalid repeat');
  if (!SPEEDS.includes(config.speed)) errors.push('invalid speed');
  if (!POWERS.includes(config.power)) errors.push('invalid power');
  if (!Number.isSafeInteger(config.manaInjection) || config.manaInjection < 0) errors.push('invalid manaInjection');
  if (config.energyDistribution !== 'even' && config.energyDistribution !== 'last') errors.push('invalid energyDistribution');
  if (!validActor(actor)) errors.push('invalid actor');

  const numbersValid = Number.isSafeInteger(config.repeat) && config.repeat >= 1 && config.repeat <= 3 &&
    SPEEDS.includes(config.speed) && POWERS.includes(config.power) &&
    Number.isSafeInteger(config.manaInjection) && config.manaInjection >= 0;
  if (numbersValid) {
    cost.stamina = Math.ceil(8 * config.repeat * config.power * config.speed ** 2);
    cost.mana = config.manaInjection;
  }
  if (validActor(actor)) {
    const maxRepeat = actor.physicalControl < 1 ? 1 : actor.physicalControl < 2 ? 2 : 3;
    if (Number.isSafeInteger(config.repeat) && config.repeat > maxRepeat) errors.push('insufficient physicalControl for repeat');
    if (actor.physicalControl === 0 && Number.isFinite(config.speed) && config.speed > 1) errors.push('insufficient physicalControl for speed');
    if (numbersValid) {
      if (cost.stamina > actor.stamina) errors.push('insufficient stamina');
      if (cost.mana > actor.mana) errors.push('insufficient mana');
      if (cost.mana > actor.maxMana) errors.push('mana exceeds maxMana');
    }
  }
  return {ok: errors.length === 0, errors, cost};
}

export function compileSkill(config, actor) {
  const validation = validateSkill(config, actor);
  if (!validation.ok) throw new RangeError('Invalid skill: ' + validation.errors.join(', '));
  if (Object.hasOwn(config,'actions')) {
    const steps=[];
    const allocations=weightedMana(config.actions,config.manaInjection);
    let offset=0;
    config.actions.forEach((action,actionIndex)=>{
      const {repeat,speed,power}=action;
      for(let index=0;index<repeat;index++) {
        const mana=Math.floor(allocations[actionIndex]/repeat)+(index<allocations[actionIndex]%repeat?1:0);
        steps.push({at:offset+(0.3+0.45*index)/speed,action:action.action,power,mana,actionIndex});
      }
      offset+=(0.3+0.45*(repeat-1)+0.25)/speed+0.12;
    });
    return {duration:offset-0.12,steps,cost:validation.cost};
  }
  const steps = [];
  const {repeat, speed, power, manaInjection, energyDistribution} = config;
  for (let index = 0; index < repeat; index++) {
    const mana = energyDistribution === 'last' ? (index === repeat - 1 ? manaInjection : 0) :
      Math.floor(manaInjection / repeat) + (index < manaInjection % repeat ? 1 : 0);
    steps.push({at: (0.3 + 0.45 * index) / speed, action: 'thrust', power, mana});
  }
  return {duration: (0.3 + 0.45 * (repeat - 1) + 0.25) / speed, steps, cost: validation.cost};
}
