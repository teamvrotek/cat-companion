import { ACTION_UUID, SAVE_INTERVAL_MS } from './config.js';
import { createSession } from './session.js';
import { createPressController } from './lib/press.js';
import { queueKeyImage, cancelKeyImage, KEY_IMAGE_INTERVAL_MS } from './lib/image-rate.js';
import { MODES, renderButton, createButtonRenderer } from './lib/renderer.js';
import { registerResources } from './resources.js';
import { createSocial, restoreSocial, serializeSocial, advanceSocial, companyAttentionScale, socialPlayReady,
  startSocialPair, socialPartnerScore, cancelSocialPair, recordSocialTreat, socialFrame, SOCIAL_PLAY_ATTENTION_RELIEF } from './lib/social.js';

const TICK_MS = KEY_IMAGE_INTERVAL_MS;
const STALE_PRESS_MS = 2_000;
const HIDDEN_CACHE_LIMIT = 128;
const DESCRIPTIONS = Object.freeze({
  watching: 'Something very important might move.',
  stretching: 'A full-body stretch. No hurry.',
  stalking: 'The hunt is mostly imaginary.',
  greeting: 'A familiar face. A little hello.',
  'grooming-together': 'You missed a spot.',
  'resting-together': 'Quiet company.',
  biscuits: 'Making biscuits. Very serious paw work.',
  mischief: 'A little nudge, a very long stare, perhaps a paw wash. The object is getting closer to the edge.',
  'mischief-sulk': 'You stopped the fun before it really began. This cat is sulking.',
  disappointed: 'You caught it. An impressive save and a deeply disappointed cat.',
  'food-sulk': 'No place at dinner. Add another shared bowl for every four cats, or give this cat its own bowl.',
  saved: 'Caught it! The object survives. The cat has mixed feelings.',
  innocent: 'A completely innocent face. Very convincing.',
  outside: 'Out wandering. Tap for a brief status. Your cat returns on its own schedule.',
  'door-out': 'Scratching to go outside. Press and release to open the door.',
  'door-in': 'Back from an adventure. Press and release to let your cat in.',
  'playing-together': 'Playing with another cat. You have been temporarily excused.',
  squabbling: 'Play got a little too exciting. A brief disagreement, then some space.',
  jealous: 'That cat got a Churu. This cat noticed. Apparently fairness matters now.',
  'social-grumpy': 'Still sulking after a small disagreement with the other cat.',
  asleep: 'A quiet nap. A gentle press gives a little attention.',
  sleepy: 'Drowsy and ready to settle down again.',
  content: 'Relaxed and enjoying your company.',
  happy: 'Enjoying that little bit of attention.',
  waiting: 'Looking for some company.',
  grumpy: 'Would appreciate a little attention.',
  zoomies: 'Full of energy and ready to play.',
  settling: 'Catching a breath before the next adventure.',
  playfight: 'Playing with you. Watch for signs that it is enough.',
  attack: 'The warnings were ignored. Claws out. Stop tapping and give this cat space.',
  angry: 'Still mad. Quiet time helps, and an undisturbed treat may earn some forgiveness.',
  eating: 'Enjoying a treat.',
  guarding: 'Keeping the treat close. Give this cat a little room.',
  grooming: 'One paw, the other paw, then the tail. This could take a while.',
  'bowl-eating': 'Having a little meal. The food bowl empties as your cat eats.',
  full: 'Very full. A thorough wash and a nap seem appropriate.',
  puking: 'Too many treats. A little mess, then a quick clean-up. Give the Churu a rest.',
  hungry: 'The bowl has been empty for a while. This face would like you to fix that.',
  litter: 'A private moment. Please respect the pixels.',
  'dirty-litter': 'The litter box needs cleaning. Your cat has noticed.',
  love: 'Feeling affectionate after a treat.',
  warning: 'Getting worked up. Slower attention will help.',
  enough: 'That is enough for now. Let this cat have some quiet.',
  overstimulated: 'Too much attention. A quiet pause helps it recover.',
  recovering: 'Settling down gradually. A little space helps.',
  annoyed: 'The nap was interrupted.',
});
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

/** One session and one serialized settings writer per Stream Deck action context. */
export function registerControl(streamDeck, SingletonAction, {
  now = () => Date.now(), monotonic = () => performance.now(), autoStart = true,
  setInterval: startInterval = globalThis.setInterval, clearInterval: stopInterval = globalThis.clearInterval,
  renderer = renderButton,
} = {}) {
  const entries = new Map();
  const visible = new Map();
  const disconnectedDevices = new Set();
  const deviceAvailable = action => !disconnectedDevices.has(action.device?.id);
  const subscriptions = [];
  let disposed = false;
  let lastWall = now();
  let lastMono = monotonic();
  let lastStatusAt = -Infinity;
  let inspectorChain = Promise.resolve();
  const report = (error, entry) => streamDeck.logger.error(`Cat${entry ? ` (${entry.action.id})` : ''}:`, error?.message || String(error));
  const safely = (promise, entry) => Promise.resolve(promise).catch(error => report(error, entry));
  function pruneHidden() {
    const hidden = [...entries.values()].filter(entry => !entry.present);
    const eligible = hidden.filter(entry => entry.savedSuccessfully && !entry.savePending && !entry.saving
      && !entry.rendering && !entry.interactionPending).sort((first, second) => first.hiddenAt - second.hiddenAt);
    for (const entry of eligible.slice(0, Math.max(0, hidden.length - HIDDEN_CACHE_LIMIT))) {
      cancelKeyImage(entry);
      resources.forgetCat(entry.action.id);
      entries.delete(entry.action.id);
    }
  }

  function rememberWrite(entry, payload) {
    entry.ownWrites.add(stable(payload));
    if (entry.ownWrites.size > 64) entry.ownWrites.delete(entry.ownWrites.values().next().value);
  }

  function requestSave(entry) {
    entry.savePending = true;
    entry.lastSaveRequestedAt = now();
    const previous = entry.saving ?? Promise.resolve();
    const saving = previous.catch(() => {}).then(async () => {
      if (!entry.savePending) return;
      entry.savePending = false;
      const payload = { ...resources.serializeCat(entry), social: serializeSocial(entry.social) };
      rememberWrite(entry, payload);
      try { await entry.action.setSettings(payload); entry.savedSuccessfully = true; }
      catch (error) { entry.savePending = true; entry.savedSuccessfully = false; throw error; }
    });
    entry.saving = saving;
    saving.finally(() => { if (entry.saving === saving) entry.saving = null; pruneHidden(); }).catch(() => {});
    return saving;
  }

  let updatingHousehold = false;
  let householdAt = lastWall;
  const companyCounts = new Map();
  const company = entry => [...visible.values()].filter(other => other.session.atHome && other.action.device?.id === entry.action.device?.id);
  function cancelPair(entry) {
    const partner = entries.get(entry.social.pair?.partnerId);
    entry.social = cancelSocialPair(entry.social);
    if (partner?.social.pair?.partnerId === entry.action.id) partner.social = cancelSocialPair(partner.social);
  }
  function advanceHousehold({ paused = false, time = now() } = {}) {
    if (updatingHousehold || disposed) return householdAt;
    householdAt = time;
    updatingHousehold = true;
    try {
      companyCounts.clear();
      const candidates = new Map();
      for (const entry of visible.values()) if (entry.session.atHome && !entry.social.pair && (entry.session.adventures.mischief || entry.session.adventureEligible)) {
        const device = entry.action.device?.id, current = candidates.get(device);
        if (!current || entry.session.adventures.mischief || (!current.session.adventures.mischief && entry.session.adventures.nextMischiefMs < current.session.adventures.nextMischiefMs)) candidates.set(device, entry);
      }
      for (const entry of entries.values()) entry.session.setAdventureAccess(candidates.get(entry.action.device?.id) === entry, Boolean(entry.social.pair), Boolean(entry.social.jealousy));
      for (const entry of visible.values()) {
        if (!entry.session.atHome) continue;
        const id = entry.action.device?.id;
        companyCounts.set(id, (companyCounts.get(id) || 0) + 1);
      }
      for (const entry of entries.values()) entry.session.setCompanyScale(entry.visible ? companyAttentionScale(companyCounts.get(entry.action.device?.id)) : 1);
      resources.advance(time, { paused });
      const base = new Map();
      for (const entry of entries.values()) {
        const completed = entry.social.completedPlays, activityKind = entry.social.pair?.kind || 'play';
        entry.social = advanceSocial(entry.social, time, { paused: paused || !entry.visible || !entry.session.atHome || entry.session.adventureBusy, companyCount: entry.visible ? companyCounts.get(entry.action.device?.id) : 1 });
        if (entry.social.completedPlays > completed) { entry.session.relieveAttention(SOCIAL_PLAY_ATTENTION_RELIEF); entry.session.rememberCompany(activityKind); }
        if (entry.visible) base.set(entry.action.id, entry.session.frame());
      }
      const eligible = entry => {
        const result = base.get(entry.action.id);
        return result && entry.session.atHome && !entry.session.adventureBusy && !result.adventureMode && !result.biscuitMode && !result.personalityMode && !result.foodExcluded && !result.routineMode && !entry.session.state.anger && entry.session.state.careStage === 'normal'
          && !entry.session.state.treat && !(entry.session.state.tapEffect && entry.session.state.updatedAtMs < entry.session.state.tapEffect.endsAtMs)
          && ['content', 'waiting', 'grumpy', 'zoomies', 'settling'].includes(result.mode);
      };
      for (const entry of entries.values()) if (entry.social.pair) {
        const partner = entries.get(entry.social.pair.partnerId);
        if (!entry.visible || !partner?.visible || partner.action.device?.id !== entry.action.device?.id || !eligible(entry) || !eligible(partner)) cancelPair(entry);
      }
      const ready = [...visible.values()].filter(entry => eligible(entry) && socialPlayReady(entry.social, { mode: base.get(entry.action.id).mode }));
      while (ready.length > 1) {
        const first = ready.shift();
        let index = -1, score = -Infinity;
        for (let i = 0; i < ready.length; i++) if (ready[i].action.device?.id === first.action.device?.id) {
          const value = socialPartnerScore(first.social, ready[i].action.id, first.session.habits.sociability);
          if (value > score) { score = value; index = i; }
        }
        if (index < 0) continue;
        const second = ready.splice(index, 1)[0];
        const pair = startSocialPair(first.social, second.social, first.action.id, second.action.id, { leftHabits: first.session.habits, rightHabits: second.session.habits,
          energy: (first.session.state.energy + second.session.state.energy) / 2, pressure: Math.max(first.session.state.stimulation, second.session.state.stimulation) });
        first.social = pair.left; second.social = pair.right;
        safely(requestSave(first), first); safely(requestSave(second), second);
      }
    } finally { updatingHousehold = false; }
    return time;
  }
  function frame(entry) {
    const result = entry.session.frame();
    const social = result.adventureMode || result.biscuitMode || result.personalityMode || result.foodExcluded ? null : socialFrame(entry.social, { mode: result.mode });
    const partner = entries.get(social?.socialPartnerId);
    const display = { ...result, ...social };
    return { ...display, buddyCat: partner?.session.config.cat, socialRole: partner && entry.action.id > partner.action.id ? 'right' : 'left', companyCount: companyCounts.get(entry.action.device?.id) || 1, cat: entry.session.config.cat,
      foodLevel: result.companions?.food.level,
      soil: result.companions?.litter.soil,
      phase: entry.session.config.animate ? display.phase : 0.18,
      effectProgress: entry.session.config.animate ? display.effectProgress : result.mode === 'recovering' ? 0.45 : result.mode === 'puking' ? 0.5 : null,
      animate: entry.session.config.animate,
      holdProgress: entry.session.adventures.outside ? 0 : entry.press.snapshot.progress };
  }

  function requestRender(entry) {
    if (!entry.visible || disposed) return Promise.resolve();
    return queueKeyImage(entry, entry.artwork(frame(entry)), { now: monotonic,
      write: image => entry.action.setImage(image), active: () => entry.visible && !disposed,
      onError: error => report(error, entry) });
  }

  function sendStatus(entry, requestId) {
    inspectorChain = inspectorChain.catch(error => report(error, entry)).then(async () => {
      if (disposed || !entry?.visible || streamDeck.ui.action?.id !== entry.action.id) return;
      advanceHousehold();
      const result = frame(entry);
      const nibbling = result.mealKind === 'nibble';
      const cleaningUp = result.mode === 'grooming' && result.routineReason === 'overfeeding';
      const label = nibbling ? 'Quick nibble' : MODES.find(mode => mode.id === result.mode)?.label || result.mode;
      const description = nibbling ? 'Just a few bites, then back to cat business.' : cleaningUp ? 'A quick clean-up after too many treats. This never happened.' : DESCRIPTIONS[result.mode] || 'Your cat is settling in.';
      const payload = { type: 'status', settings: entry.session.config,
        cat: { mode: result.mode, label, description,
          attentionCount: result.attentionCount, treatCount: result.treatCount, period: result.period,
          energy: result.energy, attentionNeed: result.attentionNeed, stimulation: result.stimulation,
          affection: result.affection, temperament: result.temperament, careStage: result.careStage },
        companions: result.companions, companyCount: result.companyCount,
        preview: entry.artwork(result), ...(entry.session.message ? { message: entry.session.message } : {}),
        ...(requestId === undefined ? {} : { requestId }) };
      await streamDeck.ui.sendToPropertyInspector(payload);
    });
    inspectorChain.catch(() => {});
    return inspectorChain;
  }

  function cancelPresses() { for (const entry of entries.values()) entry.press.cancel(); resources.cancelPresses(); }

  function checkClock() {
    const wall = now();
    const mono = monotonic();
    const wallGap = wall - lastWall;
    const monoGap = mono - lastMono;
    if (monoGap < 0 || monoGap > STALE_PRESS_MS || wallGap < 0 || Math.abs(wallGap - monoGap) > STALE_PRESS_MS) cancelPresses();
    if (wallGap < 0) {
      lastStatusAt = -Infinity;
      for (const entry of entries.values()) entry.lastSaveRequestedAt = Math.min(entry.lastSaveRequestedAt, wall);
    }
    lastWall = wall;
    lastMono = mono;
  }

  function interact(entry, kind) {
    if (!entry.visible || disposed) return;
    const time = advanceHousehold();
    cancelPair(entry);
    const oldTreats = entry.session.state.treatCount;
    entry.session[kind](time);
    if (kind === 'treat' && entry.session.state.treatCount > oldTreats) {
      entry.social = recordSocialTreat(entry.social, { received: true });
      for (const other of company(entry)) if (other !== entry) {
        cancelPair(other);
        other.social = recordSocialTreat(other.social, { sourceId: entry.action.id });
        safely(requestSave(other), other); safely(requestRender(other), other);
      }
    }
    entry.interactionPending = true;
    const interaction = requestSave(entry).then(() => sendStatus(entry));
    entry.lastInteraction = interaction;
    interaction.finally(() => {
      if (entry.lastInteraction === interaction) entry.interactionPending = false;
      pruneHidden();
    }).catch(() => {});
    // The release handler reports persistence failures as a user action error.
    interaction.catch(() => {});
    safely(requestRender(entry), entry);
  }

  function createEntry(action, settings, time) {
    const session = createSession(settings, time);
    let social;
    try { social = settings?.social ? restoreSocial(settings.social, time) : createSocial(time); }
    catch { social = createSocial(time); }
    const entry = { action, session, social, artwork: createButtonRenderer(renderer), present: true, visible: deviceAvailable(action), image: '', nextImage: null, rendering: null,
      savePending: false, saving: null, lastSaveRequestedAt: time, ownWrites: new Set(), lastInteraction: Promise.resolve() };
    entry.press = createPressController({ onTap: () => interact(entry, 'attention'), onHold: () => interact(entry, 'treat'), onChange: value => session.setPressed(value.active) });
    if (session.message) report(new Error(session.message), entry);
    return entry;
  }

  async function guarded(entry, operation, requestId, alert = false) {
    try { await operation(); }
    catch (error) {
      report(error, entry);
      if (alert && entry?.action.showAlert) await entry.action.showAlert().catch(error => report(error, entry));
      if (entry && streamDeck.ui.action?.id === entry.action.id) {
        await streamDeck.ui.sendToPropertyInspector({ type: 'error', message: error.message || 'The cat could not be updated.',
          ...(requestId === undefined ? {} : { requestId }) }).catch(report);
      }
    }
  }

  class CatAttention extends SingletonAction {
    constructor() { super(); this.manifestId = ACTION_UUID; }
    async onWillAppear(ev) {
      if (disposed || (ev.action.isKey && !ev.action.isKey())) return;
      const time = advanceHousehold();
      let entry = entries.get(ev.action.id);
      if (entry) {
        if (!entry.visible) { entry.session.advance(time, { paused: true }); entry.social = advanceSocial(entry.social, time, { paused: true }); }
        entry.action = ev.action;
        entry.present = true;
        entry.visible = deviceAvailable(ev.action);
        entry.image = '';
        entry.press.cancel();
        if (!entry.ownWrites.has(stable(ev.payload.settings))) entry.session.applyExternal(ev.payload.settings, time);
      } else {
        entry = createEntry(ev.action, ev.payload.settings, time);
        entries.set(ev.action.id, entry);
      }
      if (entry.visible) visible.set(ev.action.id, entry);
      else visible.delete(ev.action.id);
      resources.refresh(time);
      advanceHousehold();
      await guarded(entry, async () => { await Promise.all([requestSave(entry), requestRender(entry)]); await sendStatus(entry); });
    }
    async onWillDisappear(ev) {
      const entry = entries.get(ev.action.id);
      if (!entry) return;
      const time = advanceHousehold();
      cancelPair(entry);
      entry.press.cancel();
      entry.present = false;
      entry.visible = false;
      entry.hiddenAt = monotonic();
      cancelKeyImage(entry);
      visible.delete(ev.action.id);
      resources.refresh(time);
      entry.session.advance(time, { paused: true });
      entry.social = advanceSocial(entry.social, time, { paused: true });
      advanceHousehold();
      await guarded(entry, () => requestSave(entry));
    }
    async onDidReceiveSettings(ev) {
      const entry = entries.get(ev.action.id);
      if (!entry || disposed || entry.ownWrites.has(stable(ev.payload.settings))) return;
      await guarded(entry, async () => {
        const time = advanceHousehold();
        if (!entry.visible) { entry.session.advance(time, { paused: true }); entry.social = advanceSocial(entry.social, time, { paused: true }); }
        const before = stable(entry.session.config);
        entry.session.applyExternal(ev.payload.settings, time);
        if (before !== stable(entry.session.config)) entry.press.cancel();
        if (entry.session.message) report(new Error(entry.session.message), entry);
        await Promise.all([requestSave(entry), requestRender(entry)]);
        await sendStatus(entry);
      });
    }
    async onPropertyInspectorDidAppear(ev) {
      const entry = entries.get(ev.action.id);
      if (entry) await guarded(entry, () => sendStatus(entry));
    }
    onPropertyInspectorDidDisappear() { lastStatusAt = -Infinity; }
    onKeyDown(ev) {
      checkClock();
      const entry = visible.get(ev.action.id);
      if (!entry || disposed) return;
      advanceHousehold();
      entry.press.start(monotonic(), 'key');
      safely(requestRender(entry), entry);
    }
    async onKeyUp(ev) {
      checkClock();
      const entry = visible.get(ev.action.id);
      if (!entry || disposed) return;
      advanceHousehold();
      entry.press.release(monotonic(), 'key');
      await guarded(entry, async () => { await entry.lastInteraction; await requestRender(entry); }, undefined, true);
    }
    async onSendToPlugin(ev) {
      const entry = entries.get(ev.action.id);
      if (!entry || disposed || !ev.payload || typeof ev.payload.type !== 'string') return;
      const requestId = ['string', 'number'].includes(typeof ev.payload.requestId) ? ev.payload.requestId : undefined;
      await guarded(entry, async () => {
        const time = advanceHousehold();
        if (!entry.visible) { entry.session.advance(time, { paused: true }); entry.social = advanceSocial(entry.social, time, { paused: true }); }
        if (ev.payload.type === 'getStatus') { await sendStatus(entry, requestId); return; }
        if (ev.payload.type === 'updateSettings') {
          entry.session.updateConfig(ev.payload.settings, time);
          entry.press.cancel();
        } else if (ev.payload.type === 'resetCat') {
          entry.press.cancel();
          cancelPair(entry); entry.social = createSocial(time);
          entry.session.reset(time);
        } else return;
        await Promise.all([requestSave(entry), requestRender(entry)]);
        await sendStatus(entry, requestId);
      }, requestId, ev.payload.type !== 'getStatus');
    }
  }

  const resources = registerResources(streamDeck, SingletonAction, { cats: entries, now, monotonic, saveCat: requestSave, renderCat: requestRender, statusCat: sendStatus, checkClock, deviceAvailable });
  const action = new CatAttention();
  streamDeck.actions.registerAction(action);

  function tick() {
    if (disposed) return;
    checkClock();
    const time = advanceHousehold();
    for (const entry of visible.values()) {
      try {
        entry.press.update(monotonic());
        safely(requestRender(entry), entry);
        if (time - entry.lastSaveRequestedAt >= SAVE_INTERVAL_MS) safely(requestSave(entry), entry);
      } catch (error) { report(error, entry); }
    }
    if (time - lastStatusAt >= 1_000) {
      lastStatusAt = time;
      const selected = visible.get(streamDeck.ui.action?.id);
      if (selected) safely(sendStatus(selected), selected);
      resources.tick(true);
    } else resources.tick();
  }

  const timer = autoStart ? startInterval(tick, TICK_MS) : null;
  timer?.unref?.();
  if (streamDeck.system?.onSystemDidWakeUp) subscriptions.push(streamDeck.system.onSystemDidWakeUp(() => {
    cancelPresses();
    checkClock();
    const time = now();
    for (const entry of entries.values()) { entry.session.advance(time, { paused: true }); entry.social = advanceSocial(entry.social, time, { paused: true }); }
    lastWall = time; lastMono = monotonic(); tick();
  }));
  if (streamDeck.devices?.onDeviceDidDisconnect) subscriptions.push(streamDeck.devices.onDeviceDidDisconnect(ev => {
    if (disposed) return;
    const time = advanceHousehold();
    const deviceId = ev.device?.id ?? ev.device;
    disconnectedDevices.add(deviceId);
    for (const entry of visible.values()) if (entry.action.device?.id === deviceId) {
      cancelPair(entry); entry.press.cancel(); entry.visible = false; entry.hiddenAt = monotonic(); cancelKeyImage(entry); visible.delete(entry.action.id);
      entry.session.advance(time); safely(requestSave(entry), entry);
    }
    resources.disconnect(deviceId, time);
  }));
  if (streamDeck.devices?.onDeviceDidConnect) subscriptions.push(streamDeck.devices.onDeviceDidConnect(ev => {
    if (disposed) return;
    const deviceId = ev.device?.id ?? ev.device;
    disconnectedDevices.delete(deviceId);
    const time = advanceHousehold();
    // A session/device reconnect may not repeat willAppear. The SDK action
    // store tracks the current page, so cached off-page cats must stay hidden.
    const currentAction = (entry, manifestId) => {
      const action = streamDeck.actions.getActionById(entry.action.id);
      return action?.device?.id === deviceId && action.manifestId === manifestId && action.isKey() ? action : null;
    };
    const resumed = [];
    for (const entry of entries.values()) {
      if (!entry.present || entry.visible || entry.action.device?.id !== deviceId) continue;
      const action = currentAction(entry, ACTION_UUID);
      entry.session.advance(time, { paused: true });
      entry.social = advanceSocial(entry.social, time, { paused: true });
      entry.press.cancel();
      cancelKeyImage(entry);
      if (!action) { entry.present = false; entry.hiddenAt = monotonic(); continue; }
      entry.action = action; entry.visible = true; entry.image = '';
      visible.set(action.id, entry);
      resumed.push(entry);
    }
    // Restore the entire household before resolving shared bowls and boxes.
    resources.resume(deviceId, currentAction);
    resources.refresh(time);
    advanceHousehold({ time });
    for (const entry of resumed) {
      safely(requestSave(entry), entry); safely(requestRender(entry), entry); safely(sendStatus(entry), entry);
    }
    resources.tick(true);
  }));

  return {
    action, entries, visible, resources, tick,
    async flush() {
      for (let pass = 0; pass < 5; pass++) {
        const pending = [...entries.values()].flatMap(entry => [entry.saving, entry.rendering, entry.lastInteraction]).filter(Boolean);
        await Promise.allSettled([...pending, inspectorChain]);
        if (![...entries.values()].some(entry => entry.saving || entry.rendering)) break;
      }
      await resources.flush();
    },
    async dispose() {
      if (disposed) return;
      const time = advanceHousehold();
      disposed = true;
      if (timer !== null) stopInterval(timer);
      cancelPresses();
      for (const subscription of subscriptions) subscription?.dispose?.();
      const saves = [];
      for (const entry of entries.values()) {
        entry.session.advance(time, { paused: !entry.visible });
        entry.visible = false; cancelKeyImage(entry); saves.push(requestSave(entry));
      }
      visible.clear();
      await resources.dispose();
      await Promise.allSettled(saves);
    },
  };
}
