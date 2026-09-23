/**
 * Cat Companion is a fictional pet model, not a biological model of cats.
 * Each key owns immutable state. Retain result.state after every resolve call.
 * Short presses call giveAttention; the UI calls giveTreat once per completed
 * hold. Coat selection is visual and never changes the behavior model.
 *
 * Energy, attention need, stimulation, and affection evolve independently.
 * Exact exponential integration makes quiet evolution independent of tick size.
 * demoSpeed accelerates routine cycles and energy/attention-need drift. Touch
 * effects, stimulation recovery, affection decay, and treats use real time.
 */

export const DEFAULT_SCHEDULE = Object.freeze({ day: '08:00', evening: '18:00', night: '23:00' });
const MINUTE = 60_000;
const PERIODS = Object.freeze(['day', 'evening', 'night']);

export const CAT_TIMING = Object.freeze({
  attentionHappyMs: 5_000,
  dayAfterAttentionSleepyMs: 20_000,
  daySleepMs: 25 * MINUTE,
  daySleepyMs: 2 * MINUTE,
  nightAfterAttentionSettlingMs: 12_000,
  nightZoomiesMs: 3 * MINUTE,
  nightSettlingMs: 2 * MINUTE,
  nightSleepMs: 10 * MINUTE,
  energyDriftMs: 4 * MINUTE,
  attentionNeedDriftMs: 30 * MINUTE,
  affectionDecayMs: 60_000,
  eatingMs: 3_000,
  groomingMs: 2_000,
  sleepLoveMs: 30_000,
  calmLoveMs: 45_000,
  wildLoveMs: 20_000,
  warningDwellMs: 5_000,
  enoughDwellMs: 8_000,
  overstimulatedDwellMs: 8_000,
  attackMs: 10_000,
  attackTapCount: 16,
  rapidTapGapMs: 900,
});

export const CARE_THRESHOLDS = Object.freeze({ warning: 0.34, enough: 0.60, overstimulated: 0.84, recovered: 0.16 });
export const TEMPERAMENTS = Object.freeze(Object.fromEntries([
  { id: 'chill', label: 'Chill', description: 'Easygoing, with gentle responses and quicker recovery.', sensitivity: 0.80, recoveryMs: 9_350, affectionGain: 0.90, needOffset: -0.08, energyOffset: -0.04, overloadAngerMs: 45_000, attackAngerMs: 90_000 },
  { id: 'clingy', label: 'Clingy', description: 'Seeks more company and shows affection readily.', sensitivity: 0.95, recoveryMs: 11_000, affectionGain: 1.30, needOffset: 0.08, energyOffset: 0, overloadAngerMs: 60_000, attackAngerMs: 120_000 },
  { id: 'playful', label: 'Playful', description: 'Enjoys energetic contact and playful gestures.', sensitivity: 0.82, recoveryMs: 10_450, affectionGain: 1.05, needOffset: 0, energyOffset: 0.10, overloadAngerMs: 50_000, attackAngerMs: 105_000 },
  { id: 'sensitive', label: 'Sensitive', description: 'Reaches its limit sooner and needs a longer quiet pause.', sensitivity: 1.25, recoveryMs: 13_200, affectionGain: 1.00, needOffset: -0.02, energyOffset: -0.03, overloadAngerMs: 75_000, attackAngerMs: 180_000 },
].map(item => [item.id, Object.freeze(item)])));

const ENERGY_TARGET = Object.freeze({ day: 0.20, evening: 0.50, night: 0.85 });
const NEED_TARGET = Object.freeze({ day: 0.30, evening: 0.96, night: 0.60 });
const INITIAL_NEED = Object.freeze({ day: 0.16, evening: 0.35, night: 0.30 });
const RETURN_MODE = Object.freeze({ sleep: 'asleep', calm: 'content', wild: 'zoomies' });
const DEFAULT_MODE = Object.freeze({ day: 'asleep', evening: 'content', night: 'zoomies' });
const LOVE_DURATION = Object.freeze({ sleep: CAT_TIMING.sleepLoveMs, calm: CAT_TIMING.calmLoveMs, wild: CAT_TIMING.wildLoveMs });
const ANIMATION_CYCLE_MS = Object.freeze({
  asleep: 3_600, sleepy: 3_000, content: 3_000, happy: 1_000, waiting: 2_200,
  grumpy: 2_800, zoomies: 700, settling: 2_600, annoyed: 1_300, playfight: 600,
  eating: 750, guarding: 1_100, love: 1_800, warning: 2_400, enough: 1_500,
  overstimulated: 1_800, recovering: 3_000, grooming: 1_100, attack: 900, angry: 2_800,
});

/** Return validated start minutes in the cyclic order day, evening, night. */
export function validateSchedule(schedule = DEFAULT_SCHEDULE) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new TypeError('Schedule must contain day, evening, and night times.');
  }

  const starts = {};
  for (const period of PERIODS) {
    const value = schedule[period];
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new RangeError(`${period} must be a valid 24-hour HH:mm time.`);
    }
    const [hour, minute] = value.split(':').map(Number);
    starts[period] = hour * 60 + minute;
  }

  if (new Set(Object.values(starts)).size !== PERIODS.length) {
    throw new RangeError('Day, evening, and night must start at different times.');
  }

  const eveningOffset = (starts.evening - starts.day + 1_440) % 1_440;
  const nightOffset = (starts.night - starts.day + 1_440) % 1_440;
  if (eveningOffset >= nightOffset) {
    throw new RangeError('Schedule must follow day, evening, then night, allowing midnight.');
  }

  return Object.freeze(starts);
}

/** Find the local period for a minute in [0, 1440), including fractional minutes. */
export function getPeriod(minuteOfDay, schedule = DEFAULT_SCHEDULE) {
  if (!Number.isFinite(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 1_440) {
    throw new RangeError('minuteOfDay must be between 0 and 1440, excluding 1440.');
  }
  const starts = validateSchedule(schedule);
  const fromDay = (minuteOfDay - starts.day + 1_440) % 1_440;
  const fromEvening = (starts.evening - starts.day + 1_440) % 1_440;
  const fromNight = (starts.night - starts.day + 1_440) % 1_440;
  if (fromDay >= fromNight) return 'night';
  if (fromDay >= fromEvening) return 'evening';
  return 'day';
}

function clamp(value) { return Math.min(1, Math.max(0, value)); }
function assertTime(nowMs) {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new RangeError('nowMs must be a finite, non-negative timestamp.');
}
function assertPeriod(period) {
  if (!PERIODS.includes(period)) throw new RangeError('period must be day, evening, or night.');
}
function assertSpeed(speed) {
  if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('demoSpeed must be a finite number greater than zero.');
}
function getTemperament(id) {
  if (!Object.hasOwn(TEMPERAMENTS, id)) throw new RangeError('Unknown cat temperament.');
  return TEMPERAMENTS[id];
}
function assertState(state) {
  if (!state || typeof state !== 'object') throw new TypeError('Create a state with createCatState first.');
  assertPeriod(state.period);
  getTemperament(state.temperament);
  assertTime(state.updatedAtMs);
  for (const field of ['energy', 'attentionNeed', 'stimulation', 'affection']) {
    if (!Number.isFinite(state[field]) || state[field] < 0 || state[field] > 1) {
      throw new RangeError(`${field} must be a normalized value between 0 and 1.`);
    }
  }
}

/** Create one independent key. Temperament is deliberately unrelated to coat. */
export function createCatState(nowMs, period, { temperament = 'chill' } = {}) {
  assertTime(nowMs);
  assertPeriod(period);
  const traits = getTemperament(temperament);
  return Object.freeze({
    createdAtMs: nowMs, updatedAtMs: nowMs, period, periodStartedAtMs: nowMs,
    routineStartedAtMs: nowMs, routineStartMode: null, temperament, demoSpeed: 1,
    energy: clamp(ENERGY_TARGET[period] + traits.energyOffset),
    attentionNeed: clamp(INITIAL_NEED[period] + traits.needOffset),
    stimulation: 0, affection: 0.10, careStage: 'normal',
    lastAttentionAtMs: null, attentionCount: 0, treatCount: 0,
    tapEffect: null, treat: null, recoveryContext: null,
    touchBurst: null, anger: null, careStageUntilMs: 0,
  });
}

function approach(value, target, elapsedMs, timeConstantMs) {
  return clamp(target + (value - target) * Math.exp(-elapsedMs / timeConstantMs));
}

function careStageFor(stimulation, previousStage, nowMs = Infinity, untilMs = 0) {
  if (stimulation >= CARE_THRESHOLDS.overstimulated) return 'overstimulated';
  if (nowMs < untilMs && ['warning', 'enough', 'overstimulated'].includes(previousStage)) {
    if (previousStage === 'warning' && stimulation >= CARE_THRESHOLDS.enough) return 'enough';
    return previousStage;
  }
  if (previousStage === 'overstimulated' || previousStage === 'recovering') {
    return stimulation > CARE_THRESHOLDS.recovered ? 'recovering' : 'normal';
  }
  if (stimulation >= CARE_THRESHOLDS.enough) return 'enough';
  if (stimulation >= CARE_THRESHOLDS.warning) return 'warning';
  return 'normal';
}

function finishRoutine(state, atMs, sourcePeriod, returnMode) {
  const startedAtMs = Math.max(atMs, state.periodStartedAtMs);
  if (startedAtMs < state.routineStartedAtMs) return state;
  return { ...state, tapEffect: null, routineStartedAtMs: startedAtMs,
    routineStartMode: sourcePeriod === state.period ? returnMode : DEFAULT_MODE[state.period] };
}

function angerFor(level, context, nowMs, period, traits, previous = null) {
  const attackUntilMs = nowMs + (level === 'attack' ? CAT_TIMING.attackMs : 0);
  const previousAttack = level === 'attack' && previous?.level === 'attack' ? previous : null;
  return Object.freeze({ level, startedAtMs: nowMs,
    calmAtMs: Math.max(previousAttack?.calmAtMs ?? 0,
      attackUntilMs + (level === 'attack' ? traits.attackAngerMs : traits.overloadAngerMs)),
    attackUntilMs,
    minCalmAtMs: level === 'attack' ? Math.max(previousAttack?.minCalmAtMs ?? 0,
      attackUntilMs + Math.max(45_000, traits.attackAngerMs / 2)) : nowMs,
    treatHelpUsed: previous?.level === 'attack' ? previous.treatHelpUsed : false, period, variant: context.variant });
}

function advanceState(state, nowMs, period, demoSpeed, attentionScale = 1, energyBias = 0) {
  assertState(state);
  assertTime(nowMs);
  assertPeriod(period);
  assertSpeed(demoSpeed);
  // Existing 1.0 saves gain mood memory without inventing a past grudge.
  state = { ...state, touchBurst: state.touchBurst ?? null, anger: state.anger ?? null,
    careStageUntilMs: state.careStageUntilMs ?? 0,
    treat: state.treat ? typeof state.treat.disturbed === 'boolean' && typeof state.treat.calmApplied === 'boolean'
      ? state.treat : Object.freeze({ ...state.treat, disturbed: state.treat.disturbed ?? false,
        calmApplied: state.treat.calmApplied ?? (state.updatedAtMs >= state.treat.mealEndsAtMs) }) : null };
  // A clock adjustment cannot reverse elapsed evolution or extend a deadline.
  const time = Math.max(nowMs, state.updatedAtMs);
  const elapsed = time - state.updatedAtMs;
  const traits = getTemperament(state.temperament);
  const stimulation = approach(state.stimulation, 0, elapsed, traits.recoveryMs);
  const needTarget = clamp(NEED_TARGET[state.period] + traits.needOffset);
  const needElapsed = elapsed * demoSpeed * (needTarget > state.attentionNeed ? attentionScale : 1);
  let current = {
    ...state, updatedAtMs: time, demoSpeed,
    energy: approach(state.energy, clamp(ENERGY_TARGET[state.period] + traits.energyOffset + energyBias), elapsed * demoSpeed, CAT_TIMING.energyDriftMs),
    attentionNeed: approach(state.attentionNeed, needTarget, needElapsed, CAT_TIMING.attentionNeedDriftMs),
    stimulation,
    affection: approach(state.affection, 0, elapsed, CAT_TIMING.affectionDecayMs),
    careStage: careStageFor(stimulation, state.careStage, time, state.careStageUntilMs),
    touchBurst: state.touchBurst && time - state.touchBurst.lastAtMs < CAT_TIMING.rapidTapGapMs ? state.touchBurst : null,
  };
  if (period !== state.period) {
    current = { ...current, period, periodStartedAtMs: time, routineStartedAtMs: time, routineStartMode: null };
  }
  if (current.treat && !current.treat.calmApplied && time >= current.treat.mealEndsAtMs) {
    const mealAtMs = current.treat.mealEndsAtMs;
    current.treat = Object.freeze({ ...current.treat, calmApplied: true });
    if (!current.treat.disturbed) {
      // A finished meal can soften the mood. It does not alter stimulation.
      current.careStageUntilMs = Math.min(current.careStageUntilMs, mealAtMs);
      current.careStage = careStageFor(stimulation, current.careStage, time, current.careStageUntilMs);
      const anger = current.anger;
      if (anger && !anger.treatHelpUsed && anger.startedAtMs <= mealAtMs && mealAtMs < anger.calmAtMs) {
        const stimulationAtMeal = clamp(state.stimulation * Math.exp((state.updatedAtMs - mealAtMs) / traits.recoveryMs));
        const calmAtMs = anger.level === 'overload' && stimulationAtMeal < 0.75 ? mealAtMs
          : Math.max(anger.minCalmAtMs, anger.level === 'attack'
            ? anger.calmAtMs - traits.attackAngerMs * 0.35
            : mealAtMs + (anger.calmAtMs - mealAtMs) * 0.5);
        current.anger = Object.freeze({ ...anger, calmAtMs, treatHelpUsed: true });
      }
    }
  }
  if (current.careStage === 'normal' && state.recoveryContext) {
    const recoveredAtMs = state.updatedAtMs + traits.recoveryMs * Math.log(state.stimulation / CARE_THRESHOLDS.recovered);
    current = finishRoutine({ ...current, recoveryContext: null }, recoveredAtMs,
      state.recoveryContext.period, RETURN_MODE[state.recoveryContext.variant]);
  }
  if (current.anger && time >= current.anger.calmAtMs) {
    const anger = current.anger;
    current = finishRoutine({ ...current, anger: null }, anger.calmAtMs, anger.period, RETURN_MODE[anger.variant]);
  }
  if (current.treat && time >= current.treat.loveEndsAtMs) {
    const treat = current.treat;
    current = finishRoutine({ ...current, treat: null }, treat.loveEndsAtMs, treat.period, treat.returnMode);
  }
  return Object.freeze(current);
}

/** Change temperament without resetting care values, counters, or active treats. */
export function setTemperament(state, id, nowMs) {
  getTemperament(id);
  const current = advanceState(state, nowMs, state.period, state.demoSpeed ?? 1);
  return Object.freeze({ ...current, temperament: id });
}

function variantForMode(mode, period, energy) {
  if (mode === 'asleep' || mode === 'sleepy') return 'sleep';
  if (energy >= 0.55 && (mode === 'zoomies' || mode === 'playfight' || (mode === 'settling' && period === 'night'))) return 'wild';
  return 'calm';
}
function progress(nowMs, start, end) { return clamp((nowMs - start) / (end - start)); }

function cycleStage(elapsedMs, stages, speed) {
  const total = stages.reduce((sum, stage) => sum + stage.durationMs, 0);
  let offset = elapsedMs % total;
  for (const stage of stages) {
    if (offset < stage.durationMs) return { mode: stage.mode, stage: stage.stage, elapsedMs: offset, nextChangeInMs: (stage.durationMs - offset) / speed };
    offset -= stage.durationMs;
  }
  throw new RangeError('Invalid behavior cycle.');
}

function normalBehavior(state, nowMs, demoSpeed, habits = {}) {
  const effect = state.tapEffect;
  const effectAge = effect ? Math.max(0, nowMs - effect.startedAtMs) : null;
  const effectDuration = effect ? effect.endsAtMs - effect.startedAtMs : CAT_TIMING.attentionHappyMs;
  if (effect && nowMs < effect.endsAtMs) {
    return { mode: effect.mode, stage: 'attention', variant: effect.variant, gesture: effect.gesture,
      elapsedMs: effectAge, nextChangeInMs: effect.endsAtMs - nowMs, effectProgress: progress(nowMs, effect.startedAtMs, effect.endsAtMs) };
  }
  if (state.period === 'day') {
    const recoveryEnd = effectDuration + CAT_TIMING.dayAfterAttentionSleepyMs;
    if (effectAge !== null && effectAge < recoveryEnd) {
      return { mode: 'sleepy', stage: 'back-to-sleep', elapsedMs: effectAge - effectDuration, nextChangeInMs: recoveryEnd - effectAge };
    }
    const elapsed = effectAge === null ? nowMs - state.routineStartedAtMs : effectAge - recoveryEnd;
    return cycleStage(Math.max(0, elapsed) * demoSpeed, [
      { mode: 'asleep', stage: 'day-sleep', durationMs: CAT_TIMING.daySleepMs * (habits.sleepScale ?? 1) },
      { mode: 'sleepy', stage: 'day-drowsy', durationMs: CAT_TIMING.daySleepyMs * (habits.playScale ?? 1) },
    ], demoSpeed);
  }
  if (state.period === 'evening') {
    const mode = state.attentionNeed >= 0.82 ? 'grumpy' : state.attentionNeed >= 0.60 ? 'waiting' : 'content';
    return { mode, stage: mode === 'waiting' ? 'wants-attention' : mode, elapsedMs: nowMs - state.routineStartedAtMs, nextChangeInMs: null };
  }
  const recoveryEnd = effectDuration + CAT_TIMING.nightAfterAttentionSettlingMs;
  if (effectAge !== null && effectAge < recoveryEnd) {
    return { mode: 'settling', stage: 'ready-to-play', elapsedMs: effectAge - effectDuration, nextChangeInMs: recoveryEnd - effectAge };
  }
  const elapsed = effectAge === null ? nowMs - state.routineStartedAtMs : effectAge - recoveryEnd;
  const stages = [
    { mode: 'zoomies', stage: 'zoomies', durationMs: CAT_TIMING.nightZoomiesMs * (habits.playScale ?? 1) },
    { mode: 'settling', stage: 'catching-breath', durationMs: CAT_TIMING.nightSettlingMs },
    { mode: 'asleep', stage: 'night-rest', durationMs: CAT_TIMING.nightSleepMs * (habits.sleepScale ?? 1) },
  ];
  if (effectAge === null && state.routineStartMode === 'asleep') stages.unshift(stages.pop());
  return cycleStage(Math.max(0, elapsed) * demoSpeed, stages, demoSpeed);
}

const OPTIONAL_INTERACTION_MODES = new Set(['watching', 'stretching', 'stalking', 'grooming', 'settling', 'zoomies']);
function naturalContext(state, nowMs, demoSpeed, habits = {}, activityMode) {
  if (state.treat) return { variant: state.treat.variant, sourceMode: nowMs < state.treat.mealEndsAtMs ? 'eating'
    : nowMs < state.treat.groomEndsAtMs ? 'grooming' : 'love' };
  if (state.anger) return { variant: state.anger.variant,
    sourceMode: state.anger.level === 'attack' && nowMs < state.anger.attackUntilMs ? 'attack' : 'angry' };
  if (state.recoveryContext && state.careStage !== 'normal') {
    return { variant: state.recoveryContext.variant, sourceMode: state.careStage };
  }
  const routine = normalBehavior(state, nowMs, demoSpeed, habits);
  if (state.tapEffect && nowMs < state.tapEffect.endsAtMs) {
    return { variant: state.tapEffect.variant, sourceMode: state.tapEffect.sourceMode };
  }
  if (OPTIONAL_INTERACTION_MODES.has(activityMode)) return {
    variant: variantForMode(activityMode === 'stalking' ? 'zoomies' : activityMode, state.period, state.energy), sourceMode: activityMode,
  };
  return { variant: variantForMode(routine.mode, state.period, state.energy), sourceMode: routine.mode };
}

function pressureBehavior(state) {
  const stage = state.careStage;
  if (stage === 'normal') return null;
  const gesture = stage === 'warning' ? 'side-eye' : stage === 'enough' ? 'shield'
    : stage === 'recovering' && state.stimulation < 0.40 ? 'slow-blink' : 'withdraw';
  const nextThreshold = stage === 'overstimulated' ? CARE_THRESHOLDS.overstimulated
    : stage === 'recovering' ? CARE_THRESHOLDS.recovered
      : stage === 'enough' ? CARE_THRESHOLDS.enough : CARE_THRESHOLDS.warning;
  return { mode: stage, stage, gesture, elapsedMs: 0,
    nextChangeInMs: Math.max(0, state.careStageUntilMs - state.updatedAtMs,
      getTemperament(state.temperament).recoveryMs * Math.log(state.stimulation / nextThreshold)),
    effectProgress: stage === 'recovering' ? clamp((CARE_THRESHOLDS.overstimulated - state.stimulation) / (CARE_THRESHOLDS.overstimulated - CARE_THRESHOLDS.recovered)) : null };
}

const IDLE_GESTURE = Object.freeze({ asleep: 'sleepy-smile', sleepy: 'slow-blink', content: 'slow-blink', waiting: 'headbutt', grumpy: 'side-eye', zoomies: 'pounce', settling: 'groom' });

function resolveBehavior(state, nowMs, demoSpeed, habits = {}) {
  const context = naturalContext(state, nowMs, demoSpeed, habits);
  const pressure = pressureBehavior(state);
  const treat = state.treat;
  const inLove = Boolean(treat && nowMs >= treat.groomEndsAtMs);
  const base = { variant: context.variant, affectionate: inLove, overloadWarning: state.careStage !== 'normal' || state.anger !== null, treatStyle: null,
    effectProgress: null, treatProgress: treat ? progress(nowMs, treat.startedAtMs, treat.mealEndsAtMs) : null };
  if (treat && nowMs < treat.mealEndsAtMs) {
    const protectiveStart = treat.startStyle === 'protective' && nowMs - treat.startedAtMs < 800;
    const treatStyle = treat.startStyle === 'protective' && !protectiveStart ? 'eager' : treat.startStyle;
    const mealTap = state.tapEffect && state.tapEffect.sourceMode === 'eating' && nowMs < state.tapEffect.endsAtMs;
    const guarding = protectiveStart || state.anger !== null || state.stimulation >= CARE_THRESHOLDS.enough || state.careStage === 'recovering';
    return { ...base, mode: guarding ? 'guarding' : 'eating', stage: guarding ? 'guarding-treat' : 'enjoying-treat',
      treatStyle, affectionate: treatStyle === 'affectionate',
      gesture: guarding ? 'shield' : mealTap || state.careStage === 'warning' ? 'side-eye'
        : treatStyle === 'tube-grab' ? 'pounce' : treatStyle === 'sleepy' ? 'sleepy-smile' : 'knead',
      elapsedMs: nowMs - treat.startedAtMs,
      nextChangeInMs: protectiveStart ? Math.min(treat.mealEndsAtMs, treat.startedAtMs + 800) - nowMs : treat.mealEndsAtMs - nowMs,
      effectProgress: progress(nowMs, treat.startedAtMs, treat.mealEndsAtMs) };
  }
  if (treat && nowMs < treat.groomEndsAtMs) {
    return { ...base, mode: 'grooming', stage: 'after-treat-grooming', gesture: 'groom',
      elapsedMs: nowMs - treat.mealEndsAtMs, nextChangeInMs: treat.groomEndsAtMs - nowMs,
      effectProgress: progress(nowMs, treat.mealEndsAtMs, treat.groomEndsAtMs) };
  }
  if (state.anger?.level === 'attack' && nowMs < state.anger.attackUntilMs) {
    return { ...base, mode: 'attack', stage: 'attack', gesture: 'pounce', affectionate: false,
      elapsedMs: nowMs - state.anger.startedAtMs, nextChangeInMs: state.anger.attackUntilMs - nowMs,
      effectProgress: progress(nowMs, state.anger.startedAtMs, state.anger.attackUntilMs) };
  }
  if (state.anger && (state.anger.level === 'attack' || nowMs >= state.anger.startedAtMs + CAT_TIMING.overstimulatedDwellMs)) {
    return { ...base, mode: 'angry', stage: 'holding-a-grudge', gesture: context.variant === 'sleep' ? 'side-eye' : 'shield', affectionate: false,
      elapsedMs: nowMs - state.anger.startedAtMs, nextChangeInMs: state.anger.calmAtMs - nowMs,
      effectProgress: progress(nowMs, state.anger.startedAtMs, state.anger.calmAtMs) };
  }
  if (pressure) return { ...base, ...pressure };
  if (inLove) {
    const effect = state.tapEffect;
    if (effect && effect.sourceMode === 'love' && nowMs < effect.endsAtMs) {
      return { ...base, mode: effect.mode, stage: effect.mode === 'playfight' ? 'affectionate-play' : 'affectionate-attention',
        gesture: effect.gesture, elapsedMs: nowMs - effect.startedAtMs,
        nextChangeInMs: Math.min(effect.endsAtMs, treat.loveEndsAtMs) - nowMs,
        effectProgress: progress(nowMs, effect.startedAtMs, effect.endsAtMs) };
    }
    return { ...base, mode: 'love', stage: state.affection >= 0.65 ? 'super-love' : 'treat-love',
      gesture: context.variant === 'sleep' ? 'sleepy-smile' : state.affection >= 0.65 ? 'knead' : ['headbutt', 'cheek-rub'][state.treatCount % 2],
      elapsedMs: nowMs - treat.groomEndsAtMs, nextChangeInMs: treat.loveEndsAtMs - nowMs,
      effectProgress: progress(nowMs, treat.groomEndsAtMs, treat.loveEndsAtMs) };
  }
  const normal = normalBehavior(state, nowMs, demoSpeed, habits);
  return { ...base, ...normal, gesture: normal.gesture ?? IDLE_GESTURE[normal.mode] ?? 'slow-blink',
    affectionate: state.affection >= 0.65 && ['happy', 'playfight', 'content'].includes(normal.mode) };
}

function stimulationPerTap(context, careStage, affection) {
  if (careStage === 'enough' || careStage === 'overstimulated' || careStage === 'recovering') return 0.18;
  if (context.sourceMode === 'eating') return 0.18;
  if (context.sourceMode === 'grooming') return 0.16;
  if (context.sourceMode === 'love') return 0.14 + affection * 0.06;
  if (context.variant === 'sleep') return 0.15;
  if (context.sourceMode === 'grumpy') return 0.15;
  if (context.sourceMode === 'waiting') return 0.09;
  if (context.variant === 'wild') return 0.11;
  return 0.10;
}

function touchGesture(context, count, affection, temperament, energy, stimulation) {
  if (context.variant === 'sleep') return count % 2 ? 'sleepy-smile' : 'slow-blink';
  if (context.sourceMode === 'love') {
    if (energy >= 0.65 || (energy >= 0.40 && stimulation >= 0.10)) return 'pounce';
    return affection >= 0.65 ? 'knead' : 'cheek-rub';
  }
  if (energy >= 0.65 || (temperament === 'playful' && energy >= 0.45)) return 'pounce';
  if (context.sourceMode === 'grumpy') return 'slow-blink';
  if (context.sourceMode === 'waiting' || temperament === 'clingy') return 'headbutt';
  return ['slow-blink', 'headbutt', 'cheek-rub'][count % 3];
}

/** A short press relieves attention need but adds context-dependent stimulation. */
export function giveAttention(state, nowMs, period, { demoSpeed = 1, habits = {}, activityMode } = {}) {
  const current = advanceState(state, nowMs, period, demoSpeed);
  const time = current.updatedAtMs;
  const context = naturalContext(current, time, demoSpeed, habits, activityMode);
  const traits = getTemperament(current.temperament);
  const gap = current.lastAttentionAtMs === null ? Infinity : Math.max(0, time - current.lastAttentionAtMs);
  const rapidMultiplier = 1 + 0.60 * clamp((4_000 - gap) / 3_000);
  const stimulation = clamp(current.stimulation + stimulationPerTap(context, current.careStage, current.affection) * traits.sensitivity * Math.max(.9, Math.min(1.12, habits.touchScale ?? 1)) * rapidMultiplier);
  const careStage = careStageFor(stimulation, current.careStage, time, current.careStageUntilMs);
  const dwellMs = ({ warning: CAT_TIMING.warningDwellMs, enough: CAT_TIMING.enoughDwellMs,
    overstimulated: CAT_TIMING.overstimulatedDwellMs })[careStage] ?? 0;
  const burstCount = Math.min(CAT_TIMING.attackTapCount, (current.touchBurst?.count ?? 0) + 1);
  const attacks = burstCount === CAT_TIMING.attackTapCount && current.touchBurst?.count !== CAT_TIMING.attackTapCount;
  let anger = current.anger;
  if (attacks) anger = angerFor('attack', context, time, period, traits, anger);
  else if (anger) anger = Object.freeze({ ...anger,
    calmAtMs: Math.max(anger.calmAtMs, time + (anger.level === 'attack' ? traits.attackAngerMs : traits.overloadAngerMs)) });
  else if (stimulation >= CARE_THRESHOLDS.overstimulated) anger = angerFor('overload', context, time, period, traits);
  const affection = Math.min(0.96, current.affection + (context.variant === 'sleep' ? 0.06 : 0.10) * traits.affectionGain * (1 - current.affection));
  const count = current.attentionCount + 1;
  const gesture = touchGesture(context, count, affection, current.temperament, current.energy, current.stimulation);
  return Object.freeze({
    ...current, lastAttentionAtMs: time, attentionCount: count,
    stimulation, affection, careStage, anger,
    careStageUntilMs: dwellMs ? Math.max(current.careStageUntilMs, time + dwellMs) : current.careStageUntilMs,
    touchBurst: Object.freeze({ count: burstCount, lastAtMs: time }),
    treat: current.treat && time < current.treat.mealEndsAtMs ? Object.freeze({ ...current.treat, disturbed: true }) : current.treat,
    recoveryContext: current.recoveryContext ?? (careStage === 'overstimulated'
      ? Object.freeze({ period, variant: context.variant }) : null),
    attentionNeed: clamp(current.attentionNeed - 0.18 * (context.variant === 'sleep' ? 0.65 : 1)),
    energy: clamp(current.energy + (context.variant === 'sleep' ? 0.02 : context.variant === 'wild' ? 0.05 : 0.03)),
    tapEffect: Object.freeze({ startedAtMs: time, endsAtMs: time + CAT_TIMING.attentionHappyMs,
      sourceMode: context.sourceMode, variant: context.variant, gesture,
      mode: gesture === 'pounce' ? 'playfight' : 'happy' }),
  });
}

/** Every completed hold gives a treat. Treats redirect behavior, never erase pressure. */
export function giveTreat(state, nowMs, period, { demoSpeed = 1, habits = {}, activityMode } = {}) {
  const current = advanceState(state, nowMs, period, demoSpeed);
  const time = current.updatedAtMs;
  const context = naturalContext(current, time, demoSpeed, habits, activityMode);
  const sourceMode = OPTIONAL_INTERACTION_MODES.has(activityMode) && context.sourceMode === activityMode
    ? activityMode : resolveBehavior(current, time, demoSpeed, habits).mode;
  const traits = getTemperament(current.temperament);
  const mealEndsAtMs = time + CAT_TIMING.eatingMs;
  const groomEndsAtMs = mealEndsAtMs + CAT_TIMING.groomingMs;
  const startStyle = ['grumpy', 'angry', 'attack'].includes(sourceMode) ? 'protective'
    : current.treat && time < current.treat.groomEndsAtMs ? 'tube-grab'
      : current.treat && time >= current.treat.groomEndsAtMs ? 'affectionate'
        : context.variant === 'sleep' ? 'sleepy' : 'eager';
  return Object.freeze({
    ...current, treatCount: current.treatCount + 1, tapEffect: null, touchBurst: null,
    affection: Math.min(0.96, current.affection + 0.32 * traits.affectionGain * (1 - current.affection)),
    attentionNeed: clamp(current.attentionNeed - 0.22), energy: clamp(current.energy - 0.02),
    treat: Object.freeze({ startedAtMs: time, mealEndsAtMs, groomEndsAtMs,
      loveEndsAtMs: groomEndsAtMs + LOVE_DURATION[context.variant], period,
      sourceMode, startStyle, variant: context.variant, returnMode: RETURN_MODE[context.variant], disturbed: false, calmApplied: false }),
  });
}

/**
 * Resolve and retain state. Progress fields are normalized or null. Pressure is
 * still visible through overloadWarning while eating or grooming takes priority.
 * Schedule transitions retain care values and active treat deadlines.
 */
export function resolveCatState(state, nowMs, period, { demoSpeed = 1, attentionScale = 1, habits = {} } = {}) {
  if (!Number.isFinite(attentionScale) || attentionScale <= 0 || attentionScale > 1) throw new RangeError('Invalid attention scale.');
  const current = advanceState(state, nowMs, period, demoSpeed, attentionScale, Math.max(-.2, Math.min(.2, habits.energyBias || 0)));
  const time = current.updatedAtMs;
  const behavior = resolveBehavior(current, time, demoSpeed, habits);
  const animationOrigin = behavior.mode === 'attack' ? current.anger.startedAtMs
    : behavior.mode === 'angry' ? current.anger.level === 'attack' ? current.anger.attackUntilMs
      : current.anger.startedAtMs + CAT_TIMING.overstimulatedDwellMs : current.createdAtMs;
  const animationElapsed = Math.max(0, time - animationOrigin);
  return Object.freeze({
    state: current, ...behavior,
    phase: (animationElapsed % ANIMATION_CYCLE_MS[behavior.mode]) / ANIMATION_CYCLE_MS[behavior.mode],
    period, temperament: current.temperament, careStage: current.careStage,
    energy: current.energy, attentionNeed: current.attentionNeed, stimulation: current.stimulation, affection: current.affection,
    angerLevel: current.anger?.level ?? null, angerRemainingMs: current.anger ? Math.max(0, current.anger.calmAtMs - time) : 0,
    attentionAgeMs: current.lastAttentionAtMs === null ? null : time - current.lastAttentionAtMs,
    attentionCount: current.attentionCount, treatCount: current.treatCount,
  });
}
