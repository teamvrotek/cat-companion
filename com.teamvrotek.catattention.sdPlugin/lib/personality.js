// Saved individual habits. Optional activities never own care or supply clocks.
const MINUTE = 60_000;
const TRAITS = ['curiosity', 'playfulness', 'sociability', 'sensitivity', 'persistence', 'comfort', 'patience', 'roaming'];
const CENTRES = {
  chill: [.4, .35, .55, .3, .35, .8, .8, .4],
  clingy: [.5, .5, .85, .5, .7, .7, .45, .35],
  playful: [.8, .85, .65, .35, .75, .4, .4, .7],
  sensitive: [.4, .4, .4, .85, .5, .6, .65, .4],
};
const EPISODES = ['watching', 'stretching', 'stalking', 'grooming', 'settling', 'zoomies'];
const GESTURES = ['slow-blink', 'headbutt', 'cheek-rub', 'knead', 'sleepy-smile', 'pounce'];
const MICRO = ['still', 'blink', 'glance', 'ear', 'peek'];
const clamp = n => Math.max(0, Math.min(1, n));
const finite = (n, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(n) && n >= 0 && n <= max;
const record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const uint = n => Number.isInteger(n) && finite(n, 0xffffffff);
const clone = s => ({ ...s, episode: s.episode && { ...s.episode }, micro: { ...s.micro } });
const traitCache = new WeakMap(), habitCache = new WeakMap();
const PLAYING = new Set(['zoomies', 'playfight', 'playing-together', 'stalking', 'mischief']);
const RESTING = new Set(['asleep', 'sleepy', 'full', 'settling', 'biscuits', 'resting-together']);
function draw(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 0x100000000; }
function between(s, a, b) { return a + Math.round(draw(s) * (b - a)); }
function choose(s, choices) {
  let ticket = draw(s) * choices.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of choices) { ticket -= weight; if (ticket < 0) return value; }
  return choices.at(-1)[0];
}
// Pure sequence sampling: a saved style seed defines every beat of a scene.
function sample(seed, slot) {
  let n = (seed ^ Math.imul(slot + 1, 0x9e3779b9)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 0x100000000;
}

export function createPersonality(now, seed = Math.floor(Math.random() * 0x100000000)) {
  const s = { seed: seed >>> 0, identity: seed >>> 0, updatedAtMs: now, clockMs: 0, traits: {},
    boredom: .2, reserve: .65, comfort: 0, caution: 0, nextInMs: 0, quietMs: 0,
    lastGesture: null, recent: [], episode: null, lastMode: null, styleSeed: 0,
    micro: { kind: 'still', startedAtMs: 0, endsAtMs: 1, direction: 1 } };
  for (const trait of TRAITS) s.traits[trait] = draw(s);
  Object.freeze(s.traits);
  s.styleSeed = s.seed;
  s.nextInMs = between(s, 3 * MINUTE, 7 * MINUTE);
  s.micro.endsAtMs = between(s, 8_000, 25_000);
  return s;
}

export function effectivePersonality(s, temperament = 'chill') {
  const cacheable = Object.isFrozen(s.traits);
  const previous = cacheable && habitCache.get(s);
  if (previous && previous.temperament === temperament && previous.traits === s.traits
    && previous.value.boredom === s.boredom && previous.value.caution === s.caution
    && previous.value.reassurance === s.comfort && previous.reserve === s.reserve) return previous.value;
  let traits = cacheable && traitCache.get(s.traits);
  if (!traits || traits.temperament !== temperament) {
    const centre = CENTRES[temperament] || CENTRES.chill;
    traits = { temperament, value: Object.fromEntries(TRAITS.map((name, i) => [name, clamp(centre[i] + (s.traits[name] - .5) * .32)])) };
    if (cacheable) traitCache.set(s.traits, traits);
  }
  const value = Object.freeze({ ...traits.value, boredom: s.boredom, caution: s.caution, reassurance: s.comfort,
    touchScale: .92 + s.traits.sensitivity * .16 + s.caution * .04,
    sleepScale: .90 + s.traits.comfort * .20,
    playScale: .90 + s.traits.playfulness * .20,
    energyBias: (s.reserve - .65) * .28 });
  if (cacheable) habitCache.set(s, { temperament, traits: s.traits, reserve: s.reserve, value });
  return value;
}

function beginEpisode(s, kind, durationMs) {
  s.episode = { kind, elapsedMs: 0, durationMs };
  s.recent = [...s.recent, kind].slice(-3);
  s.nextInMs = between(s, 4 * MINUTE, 10 * MINUTE);
}

export function advancePersonality(input, now, { paused = false, held = false, home = true, safe = false,
  mode = 'content', period = 'evening', temperament = 'chill', company = false, stressed = false } = {}) {
  const s = clone(input), gap = now - s.updatedAtMs;
  s.updatedAtMs = now;
  if (paused || gap < 0 || gap > MINUTE) return s;
  const end = s.clockMs + (held ? 0 : gap);
  const p = effectivePersonality(s, temperament);
  if (stressed) s.caution = Math.max(s.caution, .8);
  if (mode !== s.lastMode) {
    const previous = s.lastMode;
    s.lastMode = mode; s.styleSeed = Math.floor(draw(s) * 0x100000000);
    if (['litter', 'biscuits', 'playing-together', 'squabbling', 'mischief', 'outside'].includes(previous)) s.quietMs = between(s, 30_000, 90_000);
    // A rare post-tray sprint is a comic flourish, never an extra litter visit.
    if (previous === 'litter' && safe && home && period !== 'day' && draw(s) < .08) beginEpisode(s, 'zoomies', between(s, 4_000, 8_000));
    if (previous === 'biscuits' && safe && draw(s) < .4) beginEpisode(s, 'settling', between(s, 8_000, 16_000));
  }
  if (!home || !safe) s.episode = null;
  const rate = .8 + p.curiosity * .4;
  // Process episode, opportunity and micro-movement boundaries in time order.
  // Their shared random stream must not depend on the frequency of updates.
  for (let boundary = 0; boundary < 128; boundary++) {
    if (s.episode && s.episode.elapsedMs >= s.episode.durationMs - 1e-7) {
      const kind = s.episode.kind; s.episode = null;
      if (kind === 'stalking') beginEpisode(s, 'zoomies', between(s, 4_000, 9_000));
      else if (kind === 'zoomies') beginEpisode(s, 'settling', between(s, 8_000, 16_000));
      else s.quietMs = between(s, 30_000, 90_000);
    }
    if (s.quietMs < 1e-7) s.quietMs = 0;
    const available = safe && home && !held && !s.episode && !s.quietMs && !RESTING.has(mode);
    if (available && s.nextInMs < 1e-7) {
      const choices = [['watching', .5 + p.curiosity], ['stretching', .5], ['grooming', .4 + p.comfort],
        ['stalking', p.playfulness * s.boredom * s.reserve * 3 * (period === 'day' ? 0 : 1)]];
      const kind = choose(s, choices.map(([key, weight]) => [key, weight * (s.recent.includes(key) ? .25 : 1)]));
      beginEpisode(s, kind, between(s, kind === 'grooming' ? 10_000 : 4_000, kind === 'watching' ? 18_000 : kind === 'grooming' ? 25_000 : 8_000));
    }
    if (s.clockMs >= s.micro.endsAtMs) {
      const start = s.micro.endsAtMs;
      const kind = s.micro.kind !== 'still' ? 'still' : choose(s, [['blink', 2], ['glance', p.curiosity], ['ear', 1], ['peek', .4]]);
      s.micro = { kind, startedAtMs: start, endsAtMs: start + between(s, kind === 'still' ? 7_000 : 600, kind === 'still' ? 24_000 : 1_800), direction: draw(s) < .5 ? -1 : 1 };
    }
    if (s.clockMs >= end) break;
    const counting = available && !s.episode;
    const dt = Math.min(end - s.clockMs, s.micro.endsAtMs - s.clockMs,
      s.episode ? s.episode.durationMs - s.episode.elapsedMs : Infinity,
      s.quietMs || Infinity, counting ? s.nextInMs / rate : Infinity);
    const activeMode = s.episode?.kind || mode, minutes = dt / MINUTE;
    const playing = PLAYING.has(activeMode), resting = RESTING.has(activeMode);
    s.reserve = clamp(s.reserve + minutes * (!home ? -.005 : playing ? -.08 : resting ? .025 : .002));
    s.boredom = clamp(s.boredom + minutes * (!home ? -.035 : playing ? -.15 : resting ? -.01 : company ? .006 : .014));
    s.comfort = clamp(s.comfort - minutes / 12);
    if (!stressed) s.caution = clamp(s.caution - minutes / 8);
    s.quietMs = Math.max(0, s.quietMs - dt);
    if (counting) s.nextInMs = Math.max(0, s.nextInMs - dt * rate);
    if (s.episode) s.episode.elapsedMs += dt;
    s.clockMs = Math.min(end, s.clockMs + dt);
  }
  return s;
}

/** Interaction memory is bounded and fades during visible time. Every press still counts. */
export function rememberInteraction(input, kind, care) {
  const s = clone(input), p = effectivePersonality(s, care.temperament);
  s.episode = null; s.quietMs = Math.max(s.quietMs, 30_000);
  const welcome = !care.anger && care.careStage === 'normal';
  if (!welcome) { s.caution = Math.max(s.caution, .8); return { personality: s, gesture: null }; }
  s.comfort = clamp(s.comfort + (kind === 'treat' ? .3 : .15));
  s.boredom = clamp(s.boredom - (kind === 'treat' ? .08 : .04));
  if (kind !== 'attention') return { personality: s, gesture: null };
  const sleepy = care.tapEffect?.variant === 'sleep';
  const choices = sleepy ? [['sleepy-smile', 1], ['slow-blink', 1]] : [
    ['slow-blink', .4 + p.patience + s.caution], ['headbutt', .3 + p.sociability * 2 + p.reassurance * .3],
    ['cheek-rub', .4 + p.comfort + p.reassurance * .4], ['knead', care.affection * p.comfort * (1 + p.reassurance)],
    ['pounce', (care.energy >= .6 || care.temperament === 'playful' && care.energy >= .45) ? p.playfulness * (1 - s.caution) : 0],
  ];
  const gesture = choose(s, choices.map(([key, weight]) => [key, weight * (key === s.lastGesture ? .3 : 1)]));
  s.lastGesture = gesture;
  return { personality: s, gesture };
}

export function rememberCompany(input, kind = 'play') {
  const s = clone(input);
  s.boredom = clamp(s.boredom - (kind === 'play' ? .2 : .08));
  s.reserve = clamp(s.reserve - (kind === 'play' ? .06 : 0));
  s.comfort = clamp(s.comfort + .1); s.quietMs = Math.max(s.quietMs, 45_000);
  return s;
}

/** Read-only pose selection. Repeated frame calls cannot consume random numbers. */
export function personalityFrame(s, frame, { animate = true, temperament = 'chill' } = {}) {
  const p = effectivePersonality(s, temperament);
  const beatMs = 3_500 + s.traits.patience * 2_500;
  let result = { ...frame, boredom: s.boredom, activityEnergy: s.reserve };
  if (s.episode && !frame.routineMode && !frame.adventureMode && !frame.biscuitMode) result = {
    ...result, mode: s.episode.kind, personalityMode: true, elapsedMs: s.episode.elapsedMs,
    effectProgress: s.episode.elapsedMs / s.episode.durationMs, phase: s.episode.elapsedMs % 3_000 / 3_000,
  };
  const elapsed = Number.isFinite(result.elapsedMs) ? result.elapsedMs : s.clockMs;
  const slot = Math.floor(elapsed / beatMs), draw = sample(s.styleSeed, slot);
  const beat = elapsed % beatMs / beatMs;
  const mode = result.mode;
  if (mode === 'grooming') {
    result.groomPart = ['left-paw', 'right-paw', 'tail'][Math.floor(draw * 3)];
    result.groomPause = draw > .82 && beat > .5;
  }
  if (mode === 'biscuits') result.biscuitsScene = { ...frame.biscuitsScene,
    rhythm: p.comfort > .7 ? 'slow' : p.playfulness > .75 ? 'happy' : frame.biscuitsScene?.rhythm,
    pause: draw > .62 && beat > .55, wash: draw > .85 && beat > .55 };
  if (mode === 'bowl-eating') result.diningPose = draw > .78 && beat > .65 ? 'watch' : elapsed < 800 && p.patience > .5 ? 'sniff' : 'eat';
  if (mode === 'litter') result.litterPose = frame.effectProgress < .13 ? 'inspect' : frame.effectProgress < .26 ? 'dig' : frame.effectProgress > .84 ? 'cover' : 'use';
  if (mode === 'eating' && !result.overloadWarning && elapsed < 550 && p.patience > .5) result.treatStyle = 'sniff';
  if (mode === 'love') result.gesture = s.lastGesture && s.lastGesture !== 'pounce' ? s.lastGesture : p.sociability > .65 ? 'headbutt' : 'cheek-rub';
  const micro = s.micro, progress = clamp((s.clockMs - micro.startedAtMs) / (micro.endsAtMs - micro.startedAtMs));
  result.micro = { kind: micro.kind, amount: Math.sin(progress * Math.PI), direction: micro.direction };
  if (!animate) {
    result.phase = .18; result.micro = null; result.groomPause = false; result.groomPart = 'right-paw';
    result.diningPose = 'eat'; result.litterPose = 'use';
    if (result.treatStyle === 'sniff') result.treatStyle = 'eager';
    if (result.personalityMode) result.effectProgress = .4;
    if (mode === 'biscuits') result.biscuitsScene = { time: 0, rhythm: 'steady', pause: false, wash: false };
  }
  return result;
}

export function restorePersonality(payload, now) {
  const fail = () => { throw new RangeError('Invalid saved cat personality.'); };
  if (!record(payload) || payload.schema !== 1 || !record(payload.state)) fail();
  const r = payload.state;
  for (const key of ['seed', 'identity', 'styleSeed']) if (!uint(r[key])) fail();
  for (const key of ['updatedAtMs', 'clockMs']) if (!finite(r[key])) fail();
  for (const key of ['boredom', 'reserve', 'comfort', 'caution']) if (!finite(r[key], 1)) fail();
  if (!record(r.traits) || TRAITS.some(key => !finite(r.traits[key], 1)) || !finite(r.nextInMs, 10 * MINUTE)
    || !finite(r.quietMs, 90_000) || ![null, ...GESTURES].includes(r.lastGesture)
    || !(r.lastMode === null || typeof r.lastMode === 'string' && /^[a-z-]{1,32}$/.test(r.lastMode))
    || !Array.isArray(r.recent) || r.recent.length > 3 || r.recent.some(key => !EPISODES.includes(key))) fail();
  if (r.episode && (!record(r.episode) || !EPISODES.includes(r.episode.kind) || !finite(r.episode.durationMs, 25_000)
    || r.episode.durationMs < 1 || !finite(r.episode.elapsedMs, r.episode.durationMs - 1))) fail();
  const m = r.micro;
  if (!record(m) || !MICRO.includes(m.kind) || ![-1, 1].includes(m.direction) || !finite(m.startedAtMs)
    || m.startedAtMs > r.clockMs || !finite(m.endsAtMs) || m.endsAtMs <= r.clockMs || m.endsAtMs - m.startedAtMs > 25_000) fail();
  const fields = ['seed', 'identity', 'clockMs', 'boredom', 'reserve', 'comfort', 'caution', 'nextInMs', 'quietMs', 'lastGesture', 'lastMode', 'styleSeed'];
  return { ...Object.fromEntries(fields.map(key => [key, r[key]])), updatedAtMs: now,
    traits: Object.freeze(Object.fromEntries(TRAITS.map(key => [key, r.traits[key]]))), recent: [...r.recent],
    episode: r.episode ? { kind: r.episode.kind, elapsedMs: r.episode.elapsedMs, durationMs: r.episode.durationMs } : null,
    micro: { kind: m.kind, direction: m.direction, startedAtMs: m.startedAtMs, endsAtMs: m.endsAtMs } };
}
