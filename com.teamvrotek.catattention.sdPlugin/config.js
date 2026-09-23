import { DEFAULT_SCHEDULE, TEMPERAMENTS, validateSchedule } from './lib/behavior.js';
import { APPETITES, DEFAULT_APPETITE } from './lib/appetite.js';
import { OUTDOOR_OPTIONS } from './lib/adventures.js';
import { CATS } from './lib/renderer.js';

export const ACTION_UUID = 'com.teamvrotek.catattention.cat';
export const CARE_SCHEMA = 1;
export const SAVE_INTERVAL_MS = 20_000;
export const DEFAULT_CONFIG = Object.freeze({ name: '', cat: 'ginger', temperament: 'chill', appetite: DEFAULT_APPETITE, schedule: DEFAULT_SCHEDULE, animate: true, outdoor: 'indoor' });
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const normalizeName = value => Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, 40).join('');

/** Normalize only public configuration. Care is never accepted through a PI patch. */
export function normalizeConfig(input, base = DEFAULT_CONFIG, { strict = false } = {}) {
  const source = isRecord(input) ? input : {};
  const next = { ...base, schedule: { ...base.schedule } };
  const issues = [];
  const reject = message => { if (strict) throw new RangeError(message); issues.push(message); };
  if (!isRecord(input) && input !== undefined) reject('Settings must be an object.');
  if (Object.hasOwn(source, 'name')) {
    if (typeof source.name === 'string') next.name = normalizeName(source.name);
    else reject('Cat name must be text.');
  }
  if (Object.hasOwn(source, 'cat')) {
    if (CATS.some(cat => cat.id === source.cat)) next.cat = source.cat;
    else reject('Choose a listed cat appearance.');
  }
  if (Object.hasOwn(source, 'temperament')) {
    if (Object.hasOwn(TEMPERAMENTS, source.temperament)) next.temperament = source.temperament;
    else reject('Choose a listed temperament.');
  }
  if (Object.hasOwn(source, 'appetite')) {
    if (typeof source.appetite === 'string' && Object.hasOwn(APPETITES, source.appetite)) next.appetite = source.appetite;
    else reject('Choose a listed appetite.');
  }
  if (Object.hasOwn(source, 'outdoor')) {
    if (typeof source.outdoor === 'string' && Object.hasOwn(OUTDOOR_OPTIONS, source.outdoor)) next.outdoor = source.outdoor;
    else reject('Choose indoor only, a cat flap or a door.');
  }
  if (Object.hasOwn(source, 'animate')) {
    if (typeof source.animate === 'boolean') next.animate = source.animate;
    else reject('Animate must be on or off.');
  }
  if (Object.hasOwn(source, 'schedule')) {
    try {
      if (!isRecord(source.schedule)) throw new RangeError('Schedule must contain valid local times.');
      const schedule = Object.fromEntries(['day', 'evening', 'night'].map(period => [period, source.schedule[period] ?? base.schedule[period]]));
      validateSchedule(schedule);
      next.schedule = schedule;
    } catch (error) { reject(error.message); }
  }
  return { config: Object.freeze({ ...next, schedule: Object.freeze(next.schedule) }), issues };
}
