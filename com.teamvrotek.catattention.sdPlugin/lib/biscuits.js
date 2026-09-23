// Independent, active-time kneading episodes. Cat care always keeps priority.
const MINUTE = 60_000;
export const BISCUIT_TIMING = Object.freeze({ continuousGapMs: MINUTE, cooldownMs: 8 * MINUTE,
  offerCooldownMs: MINUTE, pendingMs: 2 * MINUTE, minDurationMs: 20_000, maxDurationMs: 45_000 });
const T = BISCUIT_TIMING;
const clone = state => ({ ...state, active: state.active && { ...state.active }, pending: state.pending && { ...state.pending } });
const finite = (value, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(value) && value >= 0 && value <= max;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rhythms = ['slow', 'steady', 'happy'];
function random(state) { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 0x100000000; }
function between(state, min, max) { return Math.round(min + random(state) * (max - min)); }
function resetOpportunity(state) { state.nextInMs = between(state, 12 * MINUTE, 25 * MINUTE); }

export function createBiscuits(now, seed = Math.floor(Math.random() * 0x100000000)) {
  const state = { seed: seed >>> 0, updatedAtMs: now, nextInMs: 0, cooldownMs: 0, offerCooldownMs: 0, active: null, pending: null };
  state.nextInMs = between(state, 2 * MINUTE, 6 * MINUTE);
  return state;
}

/** A tap or treat ends kneading. Occasionally it queues a new, later session. */
export function offerBiscuits(input, kind, { welcome = false, waitMs = 0 } = {}) {
  const state = clone(input);
  if (state.active) {
    state.active = null; state.pending = null; state.cooldownMs = T.cooldownMs; resetOpportunity(state);
  }
  if (!welcome) { state.pending = null; return state; }
  if (state.cooldownMs || state.offerCooldownMs || state.pending) return state;
  state.offerCooldownMs = T.offerCooldownMs;
  if (random(state) < (kind === 'treat' ? .55 : .30)) {
    state.pending = { waitMs: Math.min(MINUTE, Math.max(0, waitMs)) + between(state, 400, 1_200), remainingMs: T.pendingMs };
  }
  return state;
}

export function advanceBiscuits(input, now, { paused = false, held = false, safe = false, relaxed = false,
  period = 'evening', temperament = 'chill', affection = 0 } = {}) {
  const state = clone(input), gap = now - state.updatedAtMs;
  state.updatedAtMs = now;
  // Page changes, restarts and clock corrections cannot bake an unseen batch.
  if (paused || gap < 0 || gap > T.continuousGapMs) return state;
  state.cooldownMs = Math.max(0, state.cooldownMs - gap);
  state.offerCooldownMs = Math.max(0, state.offerCooldownMs - gap);
  if (state.pending) {
    state.pending.waitMs = Math.max(0, state.pending.waitMs - gap);
    state.pending.remainingMs -= gap;
    if (state.pending.remainingMs <= 0) state.pending = null;
  }
  if (state.active) {
    if (safe && !held) state.active.elapsedMs += gap;
    if (!safe || state.active.elapsedMs >= state.active.durationMs) {
      state.active = null; state.cooldownMs = T.cooldownMs; resetOpportunity(state);
    }
    return state;
  }
  if (!safe || held || state.cooldownMs) return state;
  if (relaxed) state.nextInMs = Math.max(0, state.nextInMs - gap);
  const rewarded = state.pending && state.pending.waitMs === 0;
  if (!rewarded && (!relaxed || state.nextInMs > 0)) return state;
  const draw = random(state);
  const rhythm = period === 'day' ? (draw < .8 ? 'slow' : 'steady')
    : draw < (temperament === 'playful' || affection >= .35 ? .65 : .25) ? 'happy' : 'steady';
  state.active = { elapsedMs: 0, durationMs: between(state, T.minDurationMs, T.maxDurationMs), rhythm };
  state.pending = null;
  return state;
}

export function biscuitFrame(state) {
  if (!state.active) return null;
  return { mode: 'biscuits', biscuitMode: true, stage: 'making-biscuits',
    biscuitsScene: { time: state.active.elapsedMs / 1_000, rhythm: state.active.rhythm },
    elapsedMs: state.active.elapsedMs, nextChangeInMs: state.active.durationMs - state.active.elapsedMs };
}

/** Old saves acquire this optional state without touching care or other routines. */
export function restoreBiscuits(payload, now) {
  const fail = () => { throw new RangeError('Invalid saved biscuit routine.'); };
  if (!record(payload) || payload.schema !== 1 || !record(payload.state)) fail();
  const raw = payload.state;
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff || !finite(raw.updatedAtMs)
    || !finite(raw.nextInMs, 25 * MINUTE) || !finite(raw.cooldownMs, T.cooldownMs)
    || !finite(raw.offerCooldownMs, T.offerCooldownMs)) fail();
  let active = null, pending = null;
  if (raw.active !== null) {
    const item = raw.active;
    if (!record(item) || !rhythms.includes(item.rhythm) || !finite(item.durationMs, T.maxDurationMs)
      || item.durationMs < T.minDurationMs || !finite(item.elapsedMs, item.durationMs) || item.elapsedMs === item.durationMs) fail();
    active = { elapsedMs: item.elapsedMs, durationMs: item.durationMs, rhythm: item.rhythm };
  }
  if (raw.pending !== null) {
    const item = raw.pending;
    if (!record(item) || active || !finite(item.waitMs, MINUTE + 1_200)
      || !finite(item.remainingMs, T.pendingMs) || !item.remainingMs) fail();
    pending = { waitMs: item.waitMs, remainingMs: item.remainingMs };
  }
  return { seed: raw.seed, updatedAtMs: now, nextInMs: raw.nextInMs,
    cooldownMs: raw.cooldownMs, offerCooldownMs: raw.offerCooldownMs, active, pending };
}
