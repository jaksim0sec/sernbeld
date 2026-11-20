// Data-only compiler. The runtime owns animations, collision and spending resources.
const FIELDS = new Set(['discipline', 'baseAction', 'repeat', 'speed', 'power', 'manaInjection', 'energyDistribution']);
const SPEEDS = [0.75, 1, 1.25];
const POWERS = [0.75, 1, 1.25];
const validActor = value => value && typeof value === 'object' && !Array.isArray(value) &&
  ['stamina', 'mana', 'maxMana'].every(k => Number.isFinite(value[k]) && value[k] >= 0) &&
  ['physicalControl', 'magicControl'].every(k => Number.isSafeInteger(value[k]) && value[k] >= 0);

export function validateSkill(config, actor) {
  const errors = [];
  const cost = {stamina: 0, mana: 0};
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {ok: false, errors: ['invalid config'], cost};
  }
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
  const steps = [];
  const {repeat, speed, power, manaInjection, energyDistribution} = config;
  for (let index = 0; index < repeat; index++) {
    const mana = energyDistribution === 'last' ? (index === repeat - 1 ? manaInjection : 0) :
      Math.floor(manaInjection / repeat) + (index < manaInjection % repeat ? 1 : 0);
    steps.push({at: (0.3 + 0.45 * index) / speed, action: 'thrust', power, mana});
  }
  return {duration: (0.3 + 0.45 * (repeat - 1) + 0.25) / speed, steps, cost: validation.cost};
}
