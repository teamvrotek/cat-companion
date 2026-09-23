// Independent opportunities and animations. These clocks never replace cat care.
const MINUTE = 60_000;
export const OUTDOOR_OPTIONS = Object.freeze({ indoor: 'Indoor only', flap: 'Cat flap', door: 'Open the door for me' });
export const ADVENTURE_TIMING = Object.freeze({ departureMs: 2_000, returnMs: 2_000, catchMs: 900, fallMs: 1_200, savedMs: 2_400, feedbackMs: 2_000, mouseMs: 4_600 });
const clone = value => JSON.parse(JSON.stringify(value));
const finite = (n, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(n) && n >= 0 && n <= max;
const clamp = n => Math.max(0, Math.min(1, n));
function random(state) { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 0x100000000; }
function between(state, lo, hi) { return Math.round(lo + random(state) * (hi - lo)); }
function opportunity(state) { return between(state, 45 * MINUTE, 120 * MINUTE); }
export function createAdventures(now, seed = Math.floor(Math.random() * 0x100000000)) {
  const state = { seed: seed >>> 0, updatedAtMs: now, clockMs: 0, nextMischiefMs: 0, nextOutsideMs: 0, mischief: null, outside: null, effect: null, feedbackUntilMs: 0 };
  state.nextMischiefMs = opportunity(state); state.nextOutsideMs = opportunity(state);
  return state;
}

/** Build a complete seeded sequence so restarts cannot reroll the next push. */
export function makeMischief(state, habits) {
  const prop = random(state) < (habits ? .45 + habits.comfort * .35 : .65) ? 'mug' : 'plant';
  const steps = [];
  let x = 82;
  const add = (kind, lo, hi, extra = {}) => {
    const patience = habits && ['look-human', 'look-item', 'wash-left', 'wash-right', 'balance'].includes(kind) ? .85 + (habits.patience ?? .5) * .3 : 1;
    steps.push({ kind, durationMs: Math.round(between(state, lo, hi) * patience), from: x, to: x, ...extra });
  };
  add('look-item', 1_800, 5_000);
  const nudges = habits ? Math.max(3, Math.min(5, Math.round(3 + habits.persistence + random(state)))) : between(state, 3, 5);
  for (let i = 0; i < nudges; i++) {
    const next = 82 + (i + 1) * 27 / nudges;
    add('nudge', 800, 2_400, { to: next }); x = next;
    add('look-human', 4_000, random(state) < .25 ? 40_000 : 15_000);
    if (random(state) < .7) {
      const washes = between(state, 1, 3);
      for (let j = 0; j < washes; j++) add(j % 2 ? 'wash-left' : 'wash-right', 3_000, 9_000);
      add('look-human', 2_000, 8_000);
    }
    add('look-item', 800, 4_000);
    if (i === nudges - 1 || random(state) < .45) add('balance', 3_000, 15_000);
  }
  if (habits && random(state) < .14 * (1 - habits.persistence)) return { prop, steps, elapsedMs: 0, ending: 'grooming', abandoned: true };
  add('poise', 650, 1_200);
  add('push', 450, 850, { to: 122 }); x = 122;
  add('fall', ADVENTURE_TIMING.fallMs, ADVENTURE_TIMING.fallMs);
  return { prop, steps, elapsedMs: 0, ending: ['grooming', 'innocent', 'content', 'zoomies'][between(state, 0, 3)] };
}
export const mischiefDuration = event => event.steps.reduce((sum, step) => sum + step.durationMs, 0);
export function mischiefPose(event) {
  let elapsed = event.elapsedMs;
  for (const step of event.steps) {
    if (elapsed < step.durationMs) return { ...step, progress: clamp(elapsed / step.durationMs), elapsedMs: elapsed, prop: event.prop };
    elapsed -= step.durationMs;
  }
  return { kind: 'finished', progress: 1, elapsedMs: elapsed, prop: event.prop };
}
export const isHome = state => !state.outside || state.outside.kind === 'waiting-out';
export const adventureBusy = state => Boolean(state.outside || state.mischief);

function startTrip(state, habits) {
  // Most trips are short. A small number last several hours, without danger.
  const draw = Math.max(0, Math.min(.999, random(state) + (habits ? (habits.roaming - .5) * .18 : 0)));
  const durationMs = draw < .55 ? between(state, 10, 45) * MINUTE : draw < .92 ? between(state, 45, 120) * MINUTE : between(state, 120, 360) * MINUTE;
  const mouseAtMs = durationMs > 60 * MINUTE && random(state) < .14 ? between(state, 45 * MINUTE, durationMs - 5 * MINUTE) : null;
  state.outside = { kind: 'leaving', elapsedMs: 0, durationMs, returnAtMs: state.updatedAtMs + ADVENTURE_TIMING.departureMs + durationMs, mouseAtMs, mouseSeen: false, mouseElapsedMs: null };
  state.mischief = null;
}
function returnHome(state, habits) {
  state.outside = null; state.nextOutsideMs = opportunity(state);
  if (habits) state.effect = { kind: 'returned', prop: 'mug', ending: random(state) < habits.comfort ? 'grooming' : 'content', elapsedMs: 0, durationMs: between(state, 5_000, 12_000) };
}

function doorBeat(state, kind) {
  const ranges = { sit: [4_000, 15_000], wash: [3_500, 7_000], scratch: [1_400, 2_600], frantic: [2_200, 4_000] };
  return { kind, elapsedMs: 0, durationMs: between(state, ...ranges[kind]) };
}
function advanceDoor(state, dt) {
  const trip = state.outside;
  if (!trip.door) trip.door = doorBeat(state, 'scratch');
  trip.door.elapsedMs += dt;
  // Every burst ends with a real pause. Paw washing and frantic bursts are
  // separate choices, rather than a continuous scratching loop.
  for (let i = 0; trip.door.elapsedMs >= trip.door.durationMs && i < 32; i++) {
    const remaining = trip.door.elapsedMs - trip.door.durationMs;
    const previous = trip.door.kind, draw = random(state);
    const next = previous === 'scratch' || previous === 'frantic' ? 'sit'
      : previous === 'wash' ? (draw < .16 ? 'frantic' : 'scratch')
      : draw < .3 ? 'wash' : draw < .44 ? 'frantic' : 'scratch';
    trip.door = doorBeat(state, next);
    trip.door.elapsedMs = remaining;
  }
}

export function advanceAdventures(input, now, { outdoor = 'indoor', paused = false, held = false, eligible = false, continueMischief = eligible, doorAvailable = eligible, allowMischief = true, needsAttention = true, habits } = {}) {
  const state = clone(input), gap = now - state.updatedAtMs;
  const dt = paused || gap < 0 || gap > MINUTE ? 0 : gap;
  if (gap < 0 && state.outside) state.outside.returnAtMs = now + Math.min(state.outside.durationMs, Math.max(0, state.outside.returnAtMs - state.updatedAtMs));
  state.updatedAtMs = now; state.clockMs += dt;
  if (outdoor === 'indoor' && state.outside) returnHome(state);
  if (state.effect) { state.effect.elapsedMs += dt; if (state.effect.elapsedMs >= state.effect.durationMs) state.effect = null; }
  if (state.outside) {
    const trip = state.outside;
    if (trip.kind === 'waiting-out') {
      if (outdoor === 'flap' && doorAvailable && !held && !paused) startTrip(state, habits);
      else if (!paused && !held && doorAvailable) advanceDoor(state, dt);
    }
    else if (trip.kind === 'waiting-in') {
      if (outdoor === 'flap') { trip.kind = 'returning'; trip.elapsedMs = 0; delete trip.door; }
      else if (!paused && !held) advanceDoor(state, dt);
    }
    else if (trip.kind === 'leaving') {
      trip.elapsedMs += dt;
      if (trip.elapsedMs >= ADVENTURE_TIMING.departureMs || now >= trip.returnAtMs) { trip.kind = 'away'; trip.elapsedMs = 0; }
    } else if (trip.kind === 'away') {
      trip.elapsedMs = Math.min(trip.durationMs, Math.max(trip.elapsedMs, trip.durationMs - (trip.returnAtMs - now)));
      if (trip.mouseElapsedMs !== null) { trip.mouseElapsedMs += dt; if (trip.mouseElapsedMs >= ADVENTURE_TIMING.mouseMs) trip.mouseElapsedMs = null; }
      if (!paused && !trip.mouseSeen && trip.mouseAtMs !== null && trip.elapsedMs >= trip.mouseAtMs) {
        trip.mouseSeen = true;
        // Do not play an old sighting after an offline interval.
        if (gap >= 0 && gap <= MINUTE && trip.elapsedMs - trip.mouseAtMs < MINUTE) trip.mouseElapsedMs = 0;
      }
      if (now >= trip.returnAtMs) { trip.kind = outdoor === 'door' ? 'waiting-in' : 'returning'; trip.elapsedMs = 0; trip.mouseElapsedMs = null; if (trip.kind === 'waiting-in') advanceDoor(state, 0); }
    } else if (trip.kind === 'returning') {
      trip.elapsedMs += dt;
      if (trip.elapsedMs >= ADVENTURE_TIMING.returnMs || gap > MINUTE) returnHome(state, habits);
    }
    return state;
  }
  if (state.mischief) {
    if (!held && continueMischief) state.mischief.elapsedMs += dt;
    const event = state.mischief, duration = mischiefDuration(event);
    if (event.elapsedMs >= duration) {
      state.effect = { kind: event.abandoned ? 'abandoned' : 'fallen', prop: event.prop, ending: event.ending, elapsedMs: 0, durationMs: between(state, 18_000, 40_000) };
      state.mischief = null; state.nextMischiefMs = opportunity(state);
    }
    return state;
  }
  if (!eligible || held || paused || state.effect) return state;
  if (outdoor !== 'indoor') {
    state.nextOutsideMs = Math.max(0, state.nextOutsideMs - dt);
    if (state.nextOutsideMs === 0) {
      if (outdoor === 'flap') startTrip(state, habits);
      else { state.outside = { kind: 'waiting-out', elapsedMs: 0, durationMs: 0, returnAtMs: now, mouseAtMs: null, mouseSeen: false, mouseElapsedMs: null }; advanceDoor(state, 0); }
      return state;
    }
  }
  if (needsAttention) state.nextMischiefMs = Math.max(0, state.nextMischiefMs - dt);
  if (!state.nextMischiefMs && allowMischief) state.mischief = makeMischief(state, habits);
  return state;
}

/** Returns whether the interaction was consumed by a door or an absent cat. */
export function interactAdventure(input, kind, outdoor, eligible = true, habits) {
  const state = clone(input);
  if (state.outside) {
    if (state.outside.kind === 'waiting-out') {
      if (!eligible) return { state, consumed: false };
      startTrip(state, habits);
    }
    else if (state.outside.kind === 'waiting-in') { state.outside.kind = 'returning'; state.outside.elapsedMs = 0; delete state.outside.door; }
    else state.feedbackUntilMs = state.clockMs + ADVENTURE_TIMING.feedbackMs;
    return { state, consumed: true };
  }
  if (state.mischief) {
    const event = state.mischief, pose = mischiefPose(event);
    const outcome = kind === 'treat' ? null : pose.kind === 'fall' ? (pose.elapsedMs <= ADVENTURE_TIMING.catchMs ? 'saved' : null)
      : ['poise', 'push'].includes(pose.kind) ? null : 'sulk';
    state.effect = outcome ? { kind: outcome, prop: event.prop, elapsedMs: 0, durationMs: outcome === 'saved' ? between(state, 20_000, 40_000) : between(state, 60_000, 150_000) } : null;
    state.mischief = null;
    state.nextMischiefMs = opportunity(state);
  } else if (kind === 'treat' || ['fallen', 'abandoned', 'returned'].includes(state.effect?.kind)) state.effect = null;
  state.nextMischiefMs = Math.max(state.nextMischiefMs, 30 * MINUTE);
  return { state, consumed: false };
}

export function adventureFrame(state) {
  if (state.outside) return { adventureMode: 'outside', mode: state.outside.kind === 'waiting-out' ? 'door-out' : state.outside.kind === 'waiting-in' ? 'door-in' : 'outside', outdoorScene: { ...state.outside, feedback: state.feedbackUntilMs > state.clockMs } };
  if (state.mischief) return { adventureMode: 'mischief', mode: 'mischief', phase: state.mischief.elapsedMs % 3_000 / 3_000, mischiefScene: mischiefPose(state.mischief) };
  const effect = state.effect;
  if (effect?.kind === 'saved') return effect.elapsedMs < ADVENTURE_TIMING.savedMs
    ? { adventureMode: 'saved', mode: 'saved', savedProp: effect.prop, effectProgress: effect.elapsedMs / ADVENTURE_TIMING.savedMs }
    : { adventureMode: 'disappointed', mode: 'disappointed' };
  if (effect?.kind === 'sulk') return { adventureMode: 'mischief-sulk', mode: 'mischief-sulk' };
  if (['abandoned', 'returned'].includes(effect?.kind)) return { adventureMode: effect.kind, mode: effect.ending, groomPart: effect.elapsedMs % 8_000 < 4_000 ? 'right-paw' : 'left-paw' };
  if (effect?.kind === 'fallen') return { adventureMode: 'mischief-after', mode: effect.elapsedMs < 5_000 ? 'happy' : effect.ending, groomPart: effect.elapsedMs % 8_000 < 4_000 ? 'right-paw' : 'left-paw' };
  return null;
}

export function restoreAdventures(payload, now) {
  if (!payload) return createAdventures(now);
  const state = clone(payload.state);
  const fail = () => { throw new RangeError('Invalid saved cat adventures.'); };
  if (payload.schema !== 1 || !state || !Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff) fail();
  for (const field of ['updatedAtMs', 'clockMs', 'feedbackUntilMs']) if (!finite(state[field])) fail();
  for (const field of ['nextMischiefMs', 'nextOutsideMs']) if (!finite(state[field], 120 * MINUTE)) fail();
  if (state.mischief) {
    const event = state.mischief;
    if (event.abandoned !== undefined && typeof event.abandoned !== 'boolean') fail();
    if (!['mug', 'plant'].includes(event.prop) || !['grooming', 'innocent', 'content', 'zoomies'].includes(event.ending) || !Array.isArray(event.steps) || event.steps.length < 3 || event.steps.length > 64 || !finite(event.elapsedMs, 20 * MINUTE)) fail();
    for (const step of event.steps) if (!['look-item', 'look-human', 'nudge', 'balance', 'wash-left', 'wash-right', 'poise', 'push', 'fall'].includes(step.kind) || !finite(step.durationMs, MINUTE) || step.durationMs < 1 || !finite(step.from, 144) || !finite(step.to, 144)) fail();
    if (event.elapsedMs > mischiefDuration(event) || mischiefDuration(event) > 20 * MINUTE) fail();
  }
  if (state.outside) {
    const trip = state.outside;
    if (!['waiting-out', 'leaving', 'away', 'waiting-in', 'returning'].includes(trip.kind) || !finite(trip.elapsedMs, 360 * MINUTE) || !finite(trip.durationMs, 360 * MINUTE) || !finite(trip.returnAtMs) || typeof trip.mouseSeen !== 'boolean' || trip.mouseAtMs !== null && !finite(trip.mouseAtMs, 360 * MINUTE) || trip.mouseElapsedMs !== null && !finite(trip.mouseElapsedMs, ADVENTURE_TIMING.mouseMs)) fail();
    if (trip.returnAtMs > state.updatedAtMs + 360 * MINUTE + ADVENTURE_TIMING.departureMs) fail();
    if (trip.door && (!['waiting-out', 'waiting-in'].includes(trip.kind) || !['sit','wash','scratch','frantic'].includes(trip.door.kind)
      || !finite(trip.door.durationMs, 15_000) || trip.door.durationMs < 1 || !finite(trip.door.elapsedMs, trip.door.durationMs))) fail();
  }
  if (state.effect && (!['sulk', 'saved', 'fallen', 'abandoned', 'returned'].includes(state.effect.kind) || !['mug', 'plant'].includes(state.effect.prop) || !finite(state.effect.elapsedMs, 150_000) || !finite(state.effect.durationMs, 150_000) || state.effect.durationMs < 1 || ['fallen', 'abandoned', 'returned'].includes(state.effect.kind) && !['grooming', 'innocent', 'content', 'zoomies'].includes(state.effect.ending))) fail();
  // Resume animations at the saved frame. Advance an existing outing by wall time.
  if (now < state.updatedAtMs && state.outside) state.outside.returnAtMs = now + Math.min(state.outside.durationMs, Math.max(0, state.outside.returnAtMs - state.updatedAtMs));
  state.updatedAtMs = now;
  const fields = (value, names) => Object.fromEntries(names.map(name => [name, value[name]]));
  const clean = fields(state, ['seed','updatedAtMs','clockMs','nextMischiefMs','nextOutsideMs','feedbackUntilMs']);
  clean.mischief = state.mischief ? { ...fields(state.mischief,['prop','elapsedMs','ending']), ...(state.mischief.abandoned ? { abandoned: true } : {}), steps: state.mischief.steps.map(step => fields(step,['kind','durationMs','from','to'])) } : null;
  clean.outside = state.outside ? fields(state.outside,['kind','elapsedMs','durationMs','returnAtMs','mouseAtMs','mouseSeen','mouseElapsedMs']) : null;
  if (clean.outside && state.outside.door) clean.outside.door = fields(state.outside.door, ['kind','elapsedMs','durationMs']);
  clean.effect = state.effect ? fields(state.effect, ['fallen', 'abandoned', 'returned'].includes(state.effect.kind) ? ['kind','prop','elapsedMs','durationMs','ending'] : ['kind','prop','elapsedMs','durationMs']) : null;
  return clean;
}
