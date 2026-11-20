// Deterministic frame-time runner. Rendering and collision stay with the game runtime.
const validPlan = plan => {
  if (!plan || !Number.isFinite(plan.duration) || plan.duration <= 0 || !Array.isArray(plan.steps) || !plan.steps.length ||
      !plan.cost || !Number.isFinite(plan.cost.stamina) || !Number.isFinite(plan.cost.mana) ||
      plan.cost.stamina < 0 || plan.cost.mana < 0) return false;
  let last = -1;
  for (const step of plan.steps) {
    if (!step || typeof step.action !== 'string' || !step.action || !Number.isFinite(step.at) ||
        step.at < 0 || step.at <= last || step.at > plan.duration || !Number.isFinite(step.power) ||
        !Number.isFinite(step.mana) || step.mana < 0) return false;
    last = step.at;
  }
  return true;
};

export function createSkillRunner({spend, onStep, onComplete=()=>{}}) {
  if (typeof spend !== 'function' || typeof onStep !== 'function' || typeof onComplete !== 'function') {
    throw new TypeError('Skill runner requires spend and onStep callbacks');
  }
  let cast = null;
  return {
    isActive() { return cast !== null; },
    start(plan) {
      if (!validPlan(plan)) throw new TypeError('Invalid compiled skill');
      if (cast) return {ok:false, reason:'busy'};
      const snap=JSON.parse(JSON.stringify(plan));
      if (spend({...snap.cost}) !== true) return {ok:false, reason:'insufficient energy'};
      cast={plan:snap,time:0,index:0};
      return {ok:true};
    },
    advance(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid frame delta');
      if (!cast) return 0;
      const running=cast;
      running.time+=dt;
      let fired=0;
      while (cast===running && running.index < running.plan.steps.length &&
             running.plan.steps[running.index].at <= running.time + 1e-9) {
        const index=running.index++;
        fired++;
        onStep({...running.plan.steps[index]},index);
      }
      if (cast===running && running.time>=running.plan.duration) {
        cast=null;
        onComplete();
      }
      return fired;
    },
    cancel() {
      if (!cast) return false;
      cast=null;
      return true;
    }
  };
}
