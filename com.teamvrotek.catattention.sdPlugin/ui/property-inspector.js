import { CATS, renderButton } from '../lib/renderer.js';
import { DEFAULT_SCHEDULE, TEMPERAMENTS, validateSchedule } from '../lib/behavior.js';
import { OUTDOOR_OPTIONS } from '../lib/adventures.js';
import { APPETITES, DEFAULT_APPETITE } from '../lib/appetite.js';

export const ACTION_UUID = 'com.teamvrotek.catattention.cat';
export const DEFAULT_SETTINGS = Object.freeze({ name: '', cat: 'ginger', temperament: 'chill', appetite: DEFAULT_APPETITE, schedule: DEFAULT_SCHEDULE, animate: true, outdoor: 'indoor' });
const CONFIG_KEYS = Object.freeze(['name', 'cat', 'temperament', 'appetite', 'schedule', 'animate', 'outdoor']);
const LINKS = Object.freeze({ github: 'https://github.com/teamvrotek', instagram: 'https://www.instagram.com/teamvrotek/' });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
export const normalizeName = value => Array.from(String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, 40).join('');

export function appetiteHint(id) {
  const appetite = APPETITES[id] || APPETITES[DEFAULT_APPETITE];
  const wholeHours = appetite.litterMinMs % 3_600_000 === 0 && appetite.litterMaxMs % 3_600_000 === 0;
  const unit = wholeHours ? 3_600_000 : 60_000;
  return `Meals every ${appetite.mealMinMs / 60_000}–${appetite.mealMaxMs / 60_000} min, nibbles every ${appetite.nibbleMinMs / 60_000}–${appetite.nibbleMaxMs / 60_000} min and litter visits every ${appetite.litterMinMs / unit}–${appetite.litterMaxMs / unit} ${wholeHours ? 'h' : 'min'}. Food and treats can bring litter visits forward. Timers pause when linked care keys are hidden.`;
}

export function validatePatch(patch) {
  if (!record(patch)) throw new TypeError('Settings must be an object.');
  const output = {};
  for (const key of Object.keys(patch)) {
    if (!CONFIG_KEYS.includes(key)) throw new RangeError('Only cat settings can be changed here.');
    const value = patch[key];
    if (key === 'name') {
      if (typeof value !== 'string') throw new TypeError('A cat name must be text.');
      output.name = normalizeName(value);
    } else if (key === 'cat') {
      if (!CATS.some(cat => cat.id === value)) throw new RangeError('Choose an available cat appearance.');
      output.cat = value;
    } else if (key === 'temperament') {
      if (!Object.hasOwn(TEMPERAMENTS, value)) throw new RangeError('Choose an available temperament.');
      output.temperament = value;
    } else if (key === 'appetite') {
      if (typeof value !== 'string' || !Object.hasOwn(APPETITES, value)) throw new RangeError('Choose an available appetite.');
      output.appetite = value;
    } else if (key === 'outdoor') {
      if (typeof value !== 'string' || !Object.hasOwn(OUTDOOR_OPTIONS, value)) throw new RangeError('Choose an available outdoor option.');
      output.outdoor = value;
    } else if (key === 'schedule') {
      validateSchedule(value);
      output.schedule = Object.fromEntries(['day', 'evening', 'night'].map(period => [period, value[period]]));
    } else {
      if (typeof value !== 'boolean') throw new TypeError('Animation must be on or off.');
      output.animate = value;
    }
  }
  return output;
}

export function normalizeSettings(input, fallback = DEFAULT_SETTINGS) {
  const result = clone(fallback);
  if (!record(input)) return result;
  for (const key of CONFIG_KEYS) {
    if (!Object.hasOwn(input, key)) continue;
    try { Object.assign(result, validatePatch({ [key]: input[key] })); } catch { /* Keep the last valid setting. */ }
  }
  return result;
}

export function pluginMessage(context, payload) {
  return { event: 'sendToPlugin', context, action: ACTION_UUID, payload };
}
export function openUrlMessage(destination) {
  if (!Object.hasOwn(LINKS, destination)) throw new RangeError('Unknown VROTEK link.');
  return { event: 'openUrl', payload: { url: LINKS[destination] } };
}

/** Serialize config-only patches. Acknowledgements never replace newer edits. */
export function createSettingsQueue({ send, onChange = () => {}, onError = () => {}, prefix = 'cat-pi' }) {
  let confirmed = normalizeSettings({});
  let connected = false;
  let initialized = false;
  let flight = null;
  let sequence = 0;
  const pending = new Map();
  const sentIds = new Set();
  const view = () => normalizeSettings({ ...confirmed, ...(flight?.settings || {}), ...Object.fromEntries(pending) });
  const snapshot = () => ({ settings: view(), connected, ready: connected && initialized, pending: Boolean(flight || pending.size), requestId: flight?.requestId || null });
  const emit = () => onChange(snapshot());
  const flush = () => {
    if (!connected || !initialized || flight || !pending.size) return;
    const settings = Object.fromEntries(pending);
    pending.clear();
    flight = { settings: clone(settings), requestId: `${prefix}-${++sequence}` };
    sentIds.add(flight.requestId);
    const payload = { type: 'updateSettings', settings: clone(settings), requestId: flight.requestId };
    if (send(payload) === false) {
      for (const [key, value] of Object.entries(settings)) if (!pending.has(key)) pending.set(key, value);
      flight = null; connected = false;
      onError('Stream Deck is disconnected. Your changes have not been saved.');
    }
  };
  return {
    get snapshot() { return snapshot(); },
    setConnected(value) { connected = Boolean(value); flush(); emit(); },
    stage(patch) {
      const checked = validatePatch(patch);
      const current = view();
      for (const [key, value] of Object.entries(checked)) if (!same(value, current[key])) pending.set(key, clone(value));
      flush(); emit();
    },
    accept(payload) {
      if (!record(payload) || payload.type !== 'status' || !record(payload.settings)) return false;
      const matching = flight && payload.requestId === flight.requestId;
      if (payload.requestId && sentIds.has(payload.requestId) && !matching) return false;
      confirmed = normalizeSettings(payload.settings, confirmed);
      initialized = true;
      if (matching) flight = null;
      flush(); emit();
      return true;
    },
    reject(payload) {
      if (!record(payload) || payload.type !== 'error') return;
      if (payload.requestId && sentIds.has(payload.requestId) && payload.requestId !== flight?.requestId) return;
      if (flight && payload.requestId === flight.requestId) flight = null;
      onError(typeof payload.message === 'string' && payload.message ? payload.message : 'The cat settings could not be saved.');
      flush(); emit();
    },
  };
}

function initializeInspector() {
  const $ = id => document.getElementById(id);
  const dirty = new Set();
  const coats = [];
  const schedules = Object.fromEntries(['day', 'evening', 'night'].map(period => [period, $(`${period}-start`)]));
  const inputs = [$('cat-name'), $('temperament'), $('appetite'), $('outdoor'), $('animate-cat'), ...Object.values(schedules)];
  const links = [...document.querySelectorAll('[data-link]')];
  let socket = null;
  let context = '';
  let actionContext = '';
  let pollTimer = null;
  let ackTimer = null;
  let ackId = null;
  let connectionGeneration = 0;
  let designPreview = new URLSearchParams(window.location.search).get('preview') === '1';
  let lastStatus = null;
  let resetPending = false;
  let resetRequestId = null;
  let resetSequence = 0;
  let queue;

  const writeText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const showError = message => { $('message').textContent = message; $('message').hidden = false; };
  const clearError = () => { $('message').textContent = ''; $('message').hidden = true; };
  const connected = () => socket?.readyState === WebSocket.OPEN;
  const send = payload => {
    if (!connected()) return false;
    try { socket.send(JSON.stringify(pluginMessage(context, payload))); return true; } catch { return false; }
  };
  const requestStatus = () => send({ type: 'getStatus' });
  const makeQueue = () => createSettingsQueue({ send, onChange: render, onError: showError, prefix: `cat-pi-${++connectionGeneration}` });

  function render(snapshot = queue.snapshot) {
    const settings = snapshot.settings;
    const enabled = designPreview || snapshot.ready;
    for (const input of inputs) input.disabled = !enabled;
    for (const coat of coats) {
      coat.button.disabled = !enabled;
      const selected = coat.id === settings.cat;
      if (coat.button.getAttribute('aria-pressed') !== String(selected)) coat.button.setAttribute('aria-pressed', String(selected));
    }
    if (!dirty.has('name') && document.activeElement !== $('cat-name') && $('cat-name').value !== settings.name) $('cat-name').value = settings.name;
    if (document.activeElement !== $('temperament')) $('temperament').value = settings.temperament;
    if (document.activeElement !== $('appetite')) $('appetite').value = settings.appetite;
    if (document.activeElement !== $('outdoor')) $('outdoor').value = settings.outdoor;
    if (document.activeElement !== $('animate-cat')) $('animate-cat').checked = settings.animate;
    if (!dirty.has('schedule')) for (const [period, field] of Object.entries(schedules)) if (document.activeElement !== field && field.value !== settings.schedule[period]) field.value = settings.schedule[period];
    writeText($('appearance-name'), CATS.find(cat => cat.id === settings.cat)?.label || 'Cat');
    writeText($('temperament-hint'), `${TEMPERAMENTS[settings.temperament].description} Personality is independent of appearance.`);
    writeText($('appetite-hint'), appetiteHint(settings.appetite));
    $('sample-badge').hidden = !designPreview;
    for (const link of links) link.disabled = !snapshot.connected || designPreview;
    $('reset-cat').disabled = !snapshot.ready || snapshot.pending || designPreview || resetPending;
    $('confirm-reset').disabled = $('reset-cat').disabled;
    if (!snapshot.ready) $('reset-confirm').hidden = true;
    if (snapshot.requestId !== ackId) {
      clearTimeout(ackTimer); ackId = snapshot.requestId;
      if (ackId) ackTimer = setTimeout(() => { requestStatus(); showError('This change has not been confirmed yet. Keep this key selected while Stream Deck responds.'); }, 8000);
    }
    if (designPreview) renderSample(settings);
    else if (lastStatus) renderCat(lastStatus, settings);
  }

  function renderSample(settings) {
    const source = renderButton({ cat: settings.cat, mode: 'content', phase: 0 });
    if ($('key-preview').getAttribute('src') !== source) $('key-preview').src = source;
    $('key-preview').hidden = false; $('preview-loading').hidden = true;
    writeText($('preview-label'), 'Artwork sample');
    writeText($('status-title'), settings.name || CATS.find(cat => cat.id === settings.cat)?.label || 'Cat');
    writeText($('status-description'), 'This is a local appearance sample. Live moods come from your Stream Deck key.');
    writeText($('status-counters'), 'No live care data');
  }

  function renderCat(payload, settings) {
    const cat = record(payload.cat) ? payload.cat : {};
    const online = queue.snapshot.ready;
    writeText($('preview-label'), online ? [settings.name, cat.period].filter(Boolean).join(' · ') || 'Your cat' : 'Last known state');
    writeText($('status-title'), typeof cat.label === 'string' ? cat.label : 'Your cat');
    writeText($('status-description'), online ? typeof cat.description === 'string' ? cat.description : '' : 'Stream Deck is disconnected. This state is no longer updating.');
    const pets = Number.isSafeInteger(cat.attentionCount) ? cat.attentionCount : null;
    const treats = Number.isSafeInteger(cat.treatCount) ? cat.treatCount : null;
    writeText($('status-counters'), pets === null || treats === null ? '' : `${pets} ${pets === 1 ? 'pet' : 'pets'} · ${treats} ${treats === 1 ? 'treat' : 'treats'}`);
    if (typeof payload.preview === 'string' && /^data:image\/svg\+xml(?:;[^,]*)?,/i.test(payload.preview)) {
      if ($('key-preview').getAttribute('src') !== payload.preview) $('key-preview').src = payload.preview;
      $('key-preview').hidden = false; $('preview-loading').hidden = true;
    }
  }

  function stage(patch) {
    clearError();
    try { queue.stage(patch); } catch (error) { showError(error.message); }
  }

  function commitSchedule() {
    const schedule = Object.fromEntries(Object.entries(schedules).map(([period, field]) => [period, field.value]));
    try {
      validateSchedule(schedule);
      dirty.delete('schedule'); $('schedule-error').hidden = true; $('schedule-error').textContent = '';
      for (const field of Object.values(schedules)) field.removeAttribute('aria-invalid');
      stage({ schedule });
    } catch (error) {
      dirty.add('schedule'); $('schedule-error').textContent = error.message; $('schedule-error').hidden = false;
      for (const field of Object.values(schedules)) field.setAttribute('aria-invalid', 'true');
    }
  }

  for (const cat of CATS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'coat'; button.disabled = true;
    button.setAttribute('aria-label', `Choose ${cat.label}`); button.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img'); image.width = 72; image.height = 72; image.alt = ''; image.src = renderButton({ cat: cat.id, mode: 'content', phase: 0 });
    const label = document.createElement('span'); label.textContent = cat.label; button.append(image, label);
    button.addEventListener('click', () => stage({ cat: cat.id })); $('coat-picker').append(button); coats.push({ id: cat.id, button });
  }
  for (const temperament of Object.values(TEMPERAMENTS)) $('temperament').add(new Option(temperament.label, temperament.id));
  for (const [id, label] of Object.entries(OUTDOOR_OPTIONS)) $('outdoor').add(new Option(label, id));
  for (const appetite of Object.values(APPETITES)) $('appetite').add(new Option(appetite.label, appetite.id));
  $('cat-name').addEventListener('input', () => { dirty.add('name'); stage({ name: $('cat-name').value }); });
  $('cat-name').addEventListener('blur', () => { $('cat-name').value = normalizeName($('cat-name').value); dirty.delete('name'); render(); });
  $('temperament').addEventListener('change', () => stage({ temperament: $('temperament').value }));
  $('temperament').addEventListener('blur', () => render());
  $('appetite').addEventListener('change', () => stage({ appetite: $('appetite').value }));
  $('appetite').addEventListener('blur', () => render());
  $('outdoor').addEventListener('change', () => stage({ outdoor: $('outdoor').value }));
  $('outdoor').addEventListener('blur', () => render());
  $('animate-cat').addEventListener('change', () => stage({ animate: $('animate-cat').checked }));
  $('animate-cat').addEventListener('blur', () => render());
  for (const field of Object.values(schedules)) { field.addEventListener('input', () => dirty.add('schedule')); field.addEventListener('change', commitSchedule); field.addEventListener('blur', () => { if (!dirty.has('schedule')) render(); }); }
  $('reset-cat').addEventListener('click', () => { $('reset-confirm').hidden = false; $('confirm-reset').focus(); });
  $('cancel-reset').addEventListener('click', () => { $('reset-confirm').hidden = true; $('reset-cat').focus(); });
  $('confirm-reset').addEventListener('click', () => {
    if (!queue.snapshot.ready || queue.snapshot.pending || resetPending) return;
    resetRequestId = `cat-pi-reset-${connectionGeneration}-${++resetSequence}`;
    if (send({ type: 'resetCat', requestId: resetRequestId })) { resetPending = true; $('reset-confirm').hidden = true; clearError(); render(); }
    else showError('Stream Deck is disconnected. This cat has not been reset.');
  });
  for (const link of links) link.addEventListener('click', () => { if (connected() && !designPreview) socket.send(JSON.stringify(openUrlMessage(link.dataset.link))); });

  window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, info, actionInfo) => {
    clearInterval(pollTimer); clearTimeout(ackTimer); ackId = null;
    if (socket) { socket.onclose = null; socket.onerror = null; socket.close(); }
    context = uuid; actionContext = ''; designPreview = false; lastStatus = null; resetPending = false; resetRequestId = null; dirty.clear(); clearError();
    queue = makeQueue();
    let action;
    try {
      action = JSON.parse(actionInfo);
      if (!record(action) || action.action !== ACTION_UUID || !/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535 || typeof uuid !== 'string' || !uuid || typeof registerEvent !== 'string') throw new Error('Invalid action connection.');
      actionContext = typeof action.context === 'string' ? action.context : '';
    } catch {
      showError('Stream Deck could not load this action. Select the Cat Companion key again.'); render(); return;
    }
    $('key-preview').hidden = true; $('preview-loading').hidden = false;
    writeText($('preview-label'), 'Cat Companion'); writeText($('status-title'), 'Connecting to your cat'); writeText($('status-description'), 'Loading this key’s current state.'); writeText($('status-counters'), '');
    render();
    const current = new WebSocket(`ws://127.0.0.1:${port}`); socket = current;
    current.onopen = () => {
      if (socket !== current) return;
      current.send(JSON.stringify({ event: registerEvent, uuid })); queue.setConnected(true); requestStatus(); pollTimer = setInterval(requestStatus, 5000);
    };
    current.onmessage = event => {
      if (socket !== current) return;
      let message;
      try { message = JSON.parse(event.data); } catch { showError('A response from Stream Deck could not be read.'); return; }
      if (!record(message) || (message.context && message.context !== context && message.context !== actionContext)) return;
      if (message.event === 'didReceiveSettings') { requestStatus(); return; }
      if (message.event !== 'sendToPropertyInspector' || !record(message.payload)) return;
      const payload = message.payload;
      if (payload.type === 'status') {
        const accepted = queue.accept(payload);
        if (!accepted) return;
        lastStatus = payload;
        if (resetPending && payload.requestId === resetRequestId) { resetPending = false; resetRequestId = null; }
        if (payload.requestId) clearError();
        if (typeof payload.message === 'string' && payload.message) showError(payload.message);
        render();
      } else if (payload.type === 'error') { resetPending = false; queue.reject(payload); render(); }
    };
    const disconnect = () => {
      if (socket !== current) return;
      clearInterval(pollTimer); clearTimeout(ackTimer); queue.setConnected(false);
      if (!lastStatus) { writeText($('status-title'), 'Stream Deck disconnected'); writeText($('status-description'), 'Select this key again to reconnect.'); }
    };
    current.onerror = disconnect; current.onclose = disconnect;
  };

  window.addEventListener('pagehide', () => { clearInterval(pollTimer); clearTimeout(ackTimer); socket?.close(); });
  queue = makeQueue(); render();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') initializeInspector();
