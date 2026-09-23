import { LITTER_CAPACITY, FOOD_LOW_LEVEL, SHARED_CAT_ID } from '../lib/care-constants.js';

const ACTIONS = Object.freeze({ food: 'com.teamvrotek.catattention.food', litter: 'com.teamvrotek.catattention.litter' });
const LINKS = Object.freeze({ github: 'https://github.com/teamvrotek', instagram: 'https://www.instagram.com/teamvrotek/' });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
export function resourceMessage(kind, context, payload) {
  if (!Object.hasOwn(ACTIONS, kind)) throw new RangeError('Unknown care key.');
  return { event: 'sendToPlugin', context, action: ACTIONS[kind], payload };
}
function initialize() {
  const $ = id => document.getElementById(id);
  const links = [...document.querySelectorAll('[data-link]')];
  let socket, poll, timeout, context = '', actionContext = '', kind = 'food', ready = false, pending = null, sequence = 0, generation = 0;
  const send = payload => { if (socket?.readyState !== WebSocket.OPEN) return false; socket.send(JSON.stringify(resourceMessage(kind, context, payload))); return true; };
  const error = text => { $('message').textContent = text; $('message').hidden = !text; };
  const controls = () => { $('linked-cat').disabled = !ready || Boolean(pending); for (const link of links) link.disabled = socket?.readyState !== WebSocket.OPEN; };
  function describe() {
    const food = kind === 'food';
    $('status-title').textContent = food ? 'Food bowl' : 'Litter box';
    $('instructions').textContent = food ? 'Click to refill instantly. At a quarter full or less, fresh food attracts every cat using this bowl.' : 'Hold for 3 seconds, then release to clean the litter box. Releasing early cancels.';
    $('care-note').textContent = food ? 'Each shared bowl has four places and its own food. Twelve cats need three bowls, or individual bowls. Cats without a place sulk. Outdoor cats keep their place while away. Food and litter needs pause outside or when their keys leave the page.' : 'Litter care is optional. Your cat only needs cleaning while its linked litter box key is visible. Changing pages pauses that need. A dirty box earns a grumpy face, never illness or death.';
  }
  function render(payload) {
    if (!record(payload.settings) || !Array.isArray(payload.cats) || !record(payload.resource)) return;
    if (payload.kind !== kind) return;
    const matching = pending && payload.requestId === pending && payload.saved === true;
    if (matching) { pending = null; clearTimeout(timeout); error(''); }
    ready = true;
    if (!pending) {
      const selected = typeof payload.settings.catId === 'string' ? payload.settings.catId : '';
      const choices = payload.cats.filter(cat => typeof cat.id === 'string' && typeof cat.name === 'string');
      const duplicateNames = new Set(choices.filter((cat, i) => choices.some((other, j) => i !== j && other.name === cat.name)).map(cat => cat.name));
      const options = [new Option(choices.length ? 'Choose a cat' : 'Add a cat on this page', ''), new Option('All cats on this page', SHARED_CAT_ID)];
      for (const cat of choices) options.push(new Option(duplicateNames.has(cat.name) ? `${cat.name} (${cat.id.slice(-6)})` : cat.name, cat.id));
      if (selected && selected !== SHARED_CAT_ID && !choices.some(cat => cat.id === selected)) options.push(new Option('Linked cat is on another page', selected));
      const signature = JSON.stringify(options.map(option => [option.text, option.value]));
      if ($('linked-cat').dataset.options !== signature) { $('linked-cat').replaceChildren(...options); $('linked-cat').dataset.options = signature; }
      $('linked-cat').value = selected;
    }
    const care = payload.resource;
    const holding = kind === 'litter' && care.active && care.cleaning === true;
    const cleaned = kind === 'litter' && care.active && Number(care.cleanedOpacity) > 0;
    const holdPercent = Math.round(Math.max(0, Math.min(1, Number(care.holdProgress) || 0)) * 100);
    const readyToClean = holding && Number(care.holdProgress) >= 1;
    $('preview-label').textContent = payload.linkedName || (care.active ? 'Linked cat' : 'Waiting for cat');
    $('status-title').textContent = kind === 'food' ? 'Food bowl' : readyToClean ? 'Ready to clean' : holding ? 'Keep holding' : cleaned ? 'Cleaned' : 'Litter box';
    $('status-description').textContent = !care.active ? 'Add or select a cat on this page to start this routine.' : kind === 'food' ? care.eating ? care.shared ? `${care.diners?.length || 1} cats are eating from this four-place bowl.` : 'Your cat is eating. The bowl and cat are sharing this meal.' : care.level <= 0 ? care.shared ? 'The bowl is empty. A refill calls the cats assigned to this bowl.' : 'The bowl is empty. Refill it and your cat will come for fresh food.' : care.level <= FOOD_LOW_LEVEL ? care.shared ? 'Almost empty. A refill will attract this bowl’s cats for a fresh meal.' : 'Almost empty. A refill will attract your cat for a fresh meal.' : 'Ready for your cat’s next little meal.' : readyToClean ? 'Release the key to clean the litter box.' : holding ? 'Keep holding until the bar fills, then release to clean. Releasing early cancels.' : cleaned ? 'The green check confirms the litter box has been cleaned.' : care.using ? 'Occupied. Please respect the pixels.' : care.soil >= LITTER_CAPACITY ? 'Your cat has some opinions about the mess. Hold for 3 seconds, then release to clean.' : care.soil ? 'A little housekeeping would be appreciated.' : 'Clean and ready for a private visit.';
    $('status-counters').textContent = !care.active ? 'Care paused' : kind === 'food' ? `${Math.round(Math.max(0, Math.min(1, care.level)) * 100)}% full` : readyToClean ? 'Release to clean' : holding ? `${holdPercent}% held` : cleaned ? 'Cleaning complete' : `${care.soil} / ${LITTER_CAPACITY} visits before a grumpy reminder`;
    if (typeof payload.preview === 'string' && payload.preview.startsWith('data:image/svg+xml,')) { $('key-preview').src = payload.preview; $('key-preview').hidden = false; $('preview-loading').hidden = true; }
    controls();
  }
  $('linked-cat').addEventListener('change', () => {
    if (!ready || pending) return;
    pending = `cat-care-${generation}-${++sequence}`;
    if (!send({ type: 'updateSettings', settings: { catId: $('linked-cat').value }, requestId: pending })) { pending = null; ready = false; error('This selection has not been saved. Select the key again to reconnect.'); }
    else timeout = setTimeout(() => { send({ type: 'getStatus' }); error('Waiting for this selection to be saved. Keep the key selected.'); }, 8000);
    controls();
  });
  for (const link of links) link.addEventListener('click', () => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: 'openUrl', payload: { url: LINKS[link.dataset.link] } })); });
  window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, info, actionInfo) => {
    clearInterval(poll); clearTimeout(timeout); if (socket) { socket.onclose = null; socket.onerror = null; socket.close(); }
    generation++; ready = false; pending = null; error('');
    let action;
    try {
      action = JSON.parse(actionInfo); kind = Object.keys(ACTIONS).find(key => ACTIONS[key] === action.action);
      if (!kind || !/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535 || typeof uuid !== 'string' || !uuid || typeof registerEvent !== 'string') throw new Error('Invalid connection.');
    } catch { error('This care key could not be loaded. Select it again in Stream Deck.'); controls(); return; }
    context = uuid; actionContext = typeof action.context === 'string' ? action.context : ''; describe();
    const current = new WebSocket(`ws://127.0.0.1:${port}`); socket = current;
    current.onopen = () => { if (socket !== current) return; current.send(JSON.stringify({ event: registerEvent, uuid })); send({ type: 'getStatus' }); poll = setInterval(() => send({ type: 'getStatus' }), 5000); controls(); };
    current.onmessage = event => {
      if (socket !== current) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (!record(message) || (message.context && message.context !== context && message.context !== actionContext)) return;
      if (message.event === 'didReceiveSettings') { send({ type: 'getStatus' }); return; }
      if (message.event !== 'sendToPropertyInspector' || !record(message.payload)) return;
      if (message.payload.type === 'status') render(message.payload);
      else if (message.payload.type === 'error') { if (message.payload.requestId === pending) { pending = null; clearTimeout(timeout); } error(message.payload.message || 'The selection could not be saved.'); controls(); }
    };
    const disconnect = () => { if (socket !== current) return; clearInterval(poll); clearTimeout(timeout); ready = false; pending = null; error('Stream Deck disconnected. Select this key again to reconnect.'); controls(); };
    current.onclose = disconnect; current.onerror = disconnect; controls();
  };
  window.addEventListener('pagehide', () => { clearInterval(poll); clearTimeout(timeout); socket?.close(); });
  kind = new URLSearchParams(window.location.search).get('kind') === 'litter' ? 'litter' : 'food'; describe(); controls();
}
if (typeof document !== 'undefined') initialize();
