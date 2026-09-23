import { CATS, createResourceRenderer } from './lib/renderer.js';
import { createPressController } from './lib/press.js';
import { FOOD_LOW_LEVEL, LITTER_CAPACITY, SHARED_CAT_ID } from './lib/care-constants.js';
import { LITTER_HOLD_MS, getCleanedOpacity } from './lib/care-feedback.js';
import { cancelKeyImage, queueKeyImage } from './lib/image-rate.js';

export const RESOURCE_ACTIONS = Object.freeze({ food: 'com.teamvrotek.catattention.food', litter: 'com.teamvrotek.catattention.litter' });
const identity = settings => typeof settings?.catId === 'string' && settings.catId.length <= 256 ? settings.catId : '';
const sameDevice = (first, second) => first.device?.id === second.device?.id;
// Page membership survives device suspension; only visible entries may run.
const present = entry => entry.present ?? entry.visible;
const HIDDEN_RESOURCE_LIMIT = 128;

/** Companion keys share their selected cat's saved supplies and visible routine. */
export function registerResources(streamDeck, SingletonAction, { cats, now, monotonic, saveCat, renderCat, statusCat, checkClock, deviceAvailable = () => true }) {
  const entries = new Map();
  const actions = {};
  const bindings = new Map(), groups = new Map(), invitations = new Map(), assignedFood = new Map();
  let advancing = false;
  let disposed = false;
  let cacheSequence = 0;
  const report = error => streamDeck.logger.error('Cat Companion key:', error?.message || String(error));
  const safe = promise => Promise.resolve(promise).catch(report);
  const available = entry => [...cats.values()].filter(cat => present(cat) && sameDevice(cat.action, entry.action));
  const linked = entry => {
    if (entry.catId === SHARED_CAT_ID) return entry.visible ? available(entry)[0] || null : null;
    const cat = cats.get(entry.catId);
    return cat?.visible && entry.visible && sameDevice(cat.action, entry.action) ? cat : null;
  };
  const eating = cat => ['bowl-eating', 'bowl-nibble'].includes(cat.session.routine.activity?.kind);
  const groupKey = entry => `${entry.action.device?.id}:${entry.kind}${entry.kind === 'food' ? `:${entry.action.id}` : ''}`;
  const sharedGroup = entry => groups.get(groupKey(entry));
  const poolOf = entry => entry.catId === SHARED_CAT_ID ? sharedGroup(entry)?.pool : null;
  const targets = entry => {
    if (!present(entry)) return [];
    if (entry.catId === SHARED_CAT_ID) return entry.kind === 'food' ? available(entry).filter(cat => assignedFood.get(cat.action.id) === poolOf(entry)) : available(entry);
    const cat = cats.get(entry.catId);
    return cat && present(cat) && sameDevice(cat.action, entry.action) ? [cat] : [];
  };
  function pruneHidden() {
    const hidden = [...entries.values()].filter(entry => !present(entry)).sort((a, b) => a.cacheOrder - b.cacheOrder);
    let excess = hidden.length - HIDDEN_RESOURCE_LIMIT;
    for (const entry of hidden) {
      if (excess <= 0) break;
      if (!entry.saved || entry.savePending || entry.saving || entry.rendering || entry.operationCount) continue;
      cancelKeyImage(entry);
      entries.delete(entry.action.id);
      excess--;
    }
  }
  function validPool(value) {
    return value && value.schema === 1 && typeof value.id === 'string' && value.id.length <= 256
      && Number.isSafeInteger(value.revision) && value.revision >= 0
      && Number.isFinite(value.level) && value.level >= 0 && value.level <= 1
      && Number.isInteger(value.soil) && value.soil >= 0 && value.soil <= LITTER_CAPACITY
      && Number.isFinite(value.emptyForMs) && value.emptyForMs >= 0;
  }
  function loadPool(entry, settings) {
    if (!validPool(settings?.pool)) return;
    const value = { ...settings.pool };
    if (!entry.pool || entry.pool.id !== value.id || value.revision > entry.pool.revision) entry.pool = value;
  }
  function touch(pool) { pool.revision = Math.min(Number.MAX_SAFE_INTEGER, pool.revision + 1); }
  function binding(cat) {
    if (!bindings.has(cat.action.id)) bindings.set(cat.action.id, { food: null, litter: null, privateFood: null, privateSoil: null, forcedFood: null, deferredLitter: null });
    return bindings.get(cat.action.id);
  }
  function bind(cat, kind, pool) {
    const item = binding(cat);
    if (kind === 'litter' && item.deferredLitter !== pool) item.deferredLitter = null;
    if (item[kind] === pool) return;
    // A private visit belongs to the private box it started in. Finish it before
    // joining a shared box, without occupying or soiling both boxes at once.
    if (kind === 'litter' && pool && !item.litter && cat.session.routine.activity?.kind === 'litter') {
      item.deferredLitter = pool;
      return;
    }
    if (kind === 'litter') item.deferredLitter = null;
    if (item[kind]) {
      cat.session.projectSupplies(kind === 'food' ? { foodLevel: item.privateFood.level, foodEmptyForMs: item.privateFood.emptyForMs } : { litterSoil: item.privateSoil });
    }
    if (pool) {
      const routine = cat.session.routine;
      if (kind === 'food') item.privateFood = { level: routine.food.level, emptyForMs: routine.food.emptyForMs };
      else item.privateSoil = routine.litter.soil;
      cat.session.projectSupplies(kind === 'food' ? { foodLevel: pool.level, foodEmptyForMs: pool.emptyForMs } : { litterSoil: pool.soil });
    }
    item[kind] = pool;
  }
  function preferred(cat, kind) {
    if ([...entries.values()].some(entry => present(entry) && entry.kind === kind && entry.catId === cat.action.id && sameDevice(entry.action, cat.action))) return null;
    return kind === 'food' ? assignedFood.get(cat.action.id) || null : groups.get(`${cat.action.device?.id}:${kind}`)?.pool || null;
  }
  function routeInvitations() {
    for (const cat of cats.values()) {
      const item = binding(cat), invite = invitations.get(cat.action.id);
      const group = [...groups.values()].find(group => group.pool === assignedFood.get(cat.action.id));
      if (invite && (!present(cat) || group?.pool !== invite)) invitations.delete(cat.action.id);
      else if (invite && cat.visible && cat.session.atHome && !eating(cat)) {
        bind(cat, 'food', invite); item.forcedFood = invite;
        cat.session.inviteFood(cat.session.routine.updatedAtMs); invitations.delete(cat.action.id);
      }
      if (item.forcedFood && (!present(cat) || group?.pool !== item.forcedFood
        || (cat.session.routine.food.freshMealAtMs === null && !cat.session.routine.activity?.freshFood))) {
        item.forcedFood = null; bind(cat, 'food', present(cat) ? preferred(cat, 'food') : null);
      }
      if (item.deferredLitter) {
        const target = present(cat) ? preferred(cat, 'litter') : null;
        if (target !== item.deferredLitter || cat.session.routine.activity?.kind !== 'litter') bind(cat, 'litter', target);
      }
    }
  }
  function reserveLitter(active, elapsedMs = 0) {
    for (const cat of active) if (!cat.session.atHome) cat.session.setLitterAccess(false);
    active = active.filter(cat => cat.session.atHome);
    const occupied = new Map();
    for (const cat of active) {
      const pool = binding(cat).litter;
      if (pool && cat.session.routine.activity?.kind === 'litter' && !occupied.has(pool)) occupied.set(pool, cat.action.id);
    }
    for (const cat of active) {
      const pool = binding(cat).litter;
      if (pool && !occupied.has(pool) && cat.session.routine.litter.nextAtMs <= cat.session.routine.litter.clockMs + elapsedMs) occupied.set(pool, cat.action.id);
      cat.session.setLitterAccess(!pool || occupied.get(pool) === cat.action.id);
    }
  }
  /** Advance physical pools once, then project their result onto every cat. */
  function advance(time = now(), { paused = false } = {}) {
    if (advancing || disposed) return;
    advancing = true;
    try {
      const active = [...cats.values()].filter(cat => cat.visible);
      if (!active.length) return;
      let cursor = Math.min(...active.map(cat => cat.session.routine.updatedAtMs));
      if (paused || time < cursor || time - cursor > 60_000) {
        for (const cat of active) cat.session.advance(time, { paused: true });
        return;
      }
      // A short common step makes competing diners share the last mouthful.
      const shared = [...groups.values()].some(group => group.entries.length);
      for (let pass = 0; pass < 602 && (cursor < time || pass === 0); pass++) {
        routeInvitations();
        const end = Math.min(time, cursor + (shared ? 100 : 60_000));
        reserveLitter(active, end - cursor);
        const changes = [];
        for (const cat of active) {
          const item = binding(cat);
          if (item.food) cat.session.projectSupplies({ foodLevel: item.food.level, foodEmptyForMs: item.food.emptyForMs });
          if (item.litter) cat.session.projectSupplies({ litterSoil: item.litter.soil });
          const checkpoint = cat.session.checkpoint();
          const oldFood = cat.session.routine.food.level, oldSoil = cat.session.routine.litter.soil;
          cat.session.advance(Math.max(end, cat.session.routine.updatedAtMs));
          changes.push({ cat, item, checkpoint, consumed: Math.max(0, oldFood - cat.session.routine.food.level), visits: Math.max(0, cat.session.routine.litter.soil - oldSoil) });
        }
        const foodPools = new Set(changes.filter(change => change.cat.session.atHome).map(change => change.item.food).filter(Boolean));
        for (const pool of foodPools) {
          const diners = changes.filter(change => change.item.food === pool);
          const requested = diners.reduce((sum, change) => sum + change.consumed, 0);
          if (requested > pool.level + 1e-10) {
            for (const change of diners) {
              const allowance = pool.level * change.consumed / requested;
              change.cat.session.restoreCheckpoint(change.checkpoint);
              change.cat.session.projectSupplies({ foodLevel: allowance });
              change.cat.session.advance(Math.max(end, change.cat.session.routine.updatedAtMs));
              change.consumed = Math.max(0, allowance - change.cat.session.routine.food.level);
              change.visits = Math.max(0, change.cat.session.routine.litter.soil - change.checkpoint.routine.litter.soil);
            }
          }
          const consumed = diners.reduce((sum, change) => sum + change.consumed, 0);
          const wasEmpty = pool.level <= 1e-9;
          pool.level = Math.max(0, Math.round((pool.level - consumed) * 1e12) / 1e12);
          if (pool.level < 1e-9) pool.level = 0;
          pool.emptyForMs = pool.level ? 0 : wasEmpty ? pool.emptyForMs + Math.max(0, end - cursor) : 0;
          if (consumed > 0 || wasEmpty && end > cursor) touch(pool);
        }
        for (const change of changes) if (change.item.litter && change.visits) {
          change.item.litter.soil = Math.min(LITTER_CAPACITY, change.item.litter.soil + change.visits); touch(change.item.litter);
        }
        for (const cat of active) {
          const item = binding(cat);
          if (item.food) cat.session.projectSupplies({ foodLevel: item.food.level, foodEmptyForMs: item.food.emptyForMs });
          if (item.litter) cat.session.projectSupplies({ litterSoil: item.litter.soil });
        }
        cursor = end;
        if (cursor >= time) break;
      }
      routeInvitations();
    } finally { advancing = false; }
  }
  function serializeCat(cat) {
    const value = cat.session.serialize(), item = binding(cat);
    if (item.food) Object.assign(value.routine.state.food, { level: item.privateFood.level, emptyForMs: item.privateFood.emptyForMs });
    if (item.litter) value.routine.state.litter.soil = item.privateSoil;
    return value;
  }
  function cancel(entry) {
    entry.pressed = false;
    entry.press?.cancel();
    entry.feedbackStartedAt = null;
    entry.feedbackGeneration = (entry.feedbackGeneration || 0) + 1;
  }
  function save(entry) {
    entry.savePending = true;
    const next = (entry.saving || Promise.resolve()).catch(() => {}).then(async () => {
      if (!entry.savePending) return;
      entry.savePending = false;
      const settings = { catId: entry.catId, autoLinked: entry.autoLinked, ...(entry.pool ? { pool: { ...entry.pool } } : {}) };
      entry.ownWrites.add(JSON.stringify(settings));
      if (entry.ownWrites.size > 32) entry.ownWrites.delete(entry.ownWrites.values().next().value);
      try { await entry.action.setSettings(settings); entry.saved = true; entry.poolSavedRevision = settings.pool?.revision; entry.poolSavedAt = monotonic(); }
      catch (error) { entry.savePending = true; throw error; }
    });
    entry.saving = next;
    next.finally(() => { if (entry.saving === next) entry.saving = null; pruneHidden(); }).catch(() => {});
    return next;
  }
  function frame(entry) {
    const candidates = targets(entry);
    const cat = candidates.find(candidate => candidate.visible && candidate.session.atHome && (entry.kind === 'food' ? eating(candidate) && binding(candidate).food === poolOf(entry) : candidate.session.routine.activity?.kind === 'litter' && binding(candidate).litter === poolOf(entry))) || candidates[0];
    const result = cat?.session.frame();
    const supply = result?.companions?.[entry.kind];
    const pool = poolOf(entry);
    const ownBinding = cat ? binding(cat) : null;
    const usingPool = !cat || (pool ? ownBinding[entry.kind] === pool : ownBinding[entry.kind] === null);
    const privateFood = !pool && ownBinding?.food ? ownBinding.privateFood : null;
    const privateSoil = !pool && ownBinding?.litter ? ownBinding.privateSoil : null;
    return { kind: entry.kind, active: Boolean(cat), cat: cat?.session.config.cat || 'ginger',
      level: pool?.level ?? privateFood?.level ?? supply?.level ?? 1, soil: pool?.soil ?? privateSoil ?? supply?.soil ?? 0, eating: usingPool && supply?.eating || false,
      diners: candidates.filter(candidate => candidate.visible && candidate.session.atHome && eating(candidate) && binding(candidate).food === pool).map(candidate => { const pose = candidate.session.frame(); return { id: candidate.action.id, cat: candidate.session.config.cat, pose: pose.diningPose, phase: candidate.session.config.animate ? pose.phase : .18 }; }),
      capacity: entry.kind === 'food' ? 4 : null, diningPose: result?.diningPose, litterPose: result?.litterPose,
      using: usingPool && supply?.using || false, shared: Boolean(pool), catCount: candidates.length, progress: supply?.progress || 0,
      holdProgress: cat ? entry.press?.snapshot.progress || 0 : 0,
      cleaning: Boolean(cat && entry.press?.snapshot.active),
      cleanedOpacity: cat && entry.feedbackStartedAt !== null && entry.feedbackStartedAt !== undefined ? getCleanedOpacity(monotonic() - entry.feedbackStartedAt) : 0,
      phase: cat?.session.config.animate === false ? .18 : result?.phase || 0 };
  }
  function render(entry) {
    if (!entry.visible || disposed) return Promise.resolve();
    entry.artwork ??= createResourceRenderer();
    return queueKeyImage(entry, entry.artwork(frame(entry)), {
      now: monotonic, write: image => entry.action.setImage(image), active: () => entry.visible && !disposed, onError: report,
    });
  }
  async function status(entry, requestId, saved = false) {
    if (disposed || !entry.visible || streamDeck.ui.action?.id !== entry.action.id) return;
    advance();
    const cat = linked(entry);
    const result = frame(entry);
    entry.artwork ??= createResourceRenderer();
    const candidates = available(entry).map(candidate => ({ id: candidate.action.id,
      name: candidate.session.config.name || CATS.find(coat => coat.id === candidate.session.config.cat)?.label || 'Cat',
      cat: candidate.session.config.cat }));
    await streamDeck.ui.sendToPropertyInspector({ type: 'status', kind: entry.kind, settings: { catId: entry.catId },
      cats: candidates, resource: result, linkedName: entry.catId === SHARED_CAT_ID ? entry.kind === 'food' ? `${targets(entry).length} / 4 places assigned` : `Shared with ${targets(entry).length} cats` : cat?.session.config.name || '',
      preview: entry.artwork(result), ...(saved ? { saved: true } : {}), ...(requestId === undefined ? {} : { requestId }) });
  }
  function refresh(time = now()) {
    if (disposed) return;
    advance(time);
    const previousGroups = new Map(groups);
    groups.clear();
    for (const entry of entries.values()) if (present(entry) && entry.catId === SHARED_CAT_ID) {
      const key = groupKey(entry);
      if (!groups.has(key)) groups.set(key, { entries: [], pool: null });
      groups.get(key).entries.push(entry);
    }
    for (const [key, group] of groups) {
      const previous = previousGroups.get(key);
      const activePool = previous?.entries.some(entry => group.entries.includes(entry)) ? previous.pool : null;
      const saved = group.entries.map(entry => entry.pool).filter(Boolean);
      const id = activePool?.id ?? [...saved].sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
      // Revisions describe one pool's history. A returning key must not replace
      // an active bowl or box with a higher revision from an unrelated pool.
      const old = [activePool, ...saved].filter(pool => pool?.id === id).sort((a, b) => b.revision - a.revision)[0];
      const first = group.entries[0];
      const candidate = available(first)[0];
      group.pool = old || { schema: 1, id: first.action.id, revision: 0,
        level: candidate?.session.routine.food.level ?? 1, soil: candidate?.session.routine.litter.soil ?? 0, emptyForMs: 0 };
      for (const entry of group.entries) {
        const changed = entry.pool !== group.pool;
        entry.pool = group.pool;
        if (changed) safe(save(entry));
      }
    }
    assignedFood.clear();
    const foodGroups = [...groups.values()].filter(group => group.entries[0].kind === 'food').sort((a,b) => a.entries[0].action.id.localeCompare(b.entries[0].action.id));
    for (const group of foodGroups) {
      const privateBowl = cat => [...entries.values()].some(entry => present(entry) && entry.kind === 'food' && entry.catId === cat.action.id && sameDevice(entry.action,cat.action));
      const roster = available(group.entries[0]).filter(cat => !assignedFood.has(cat.action.id))
        .sort((a,b) => Number(privateBowl(a))-Number(privateBowl(b)) || a.action.id.localeCompare(b.action.id)).slice(0,4);
      for (const cat of roster) assignedFood.set(cat.action.id,group.pool);
    }
    for (const entry of entries.values()) if (present(entry)) {
      const candidates = available(entry);
      if (entry.autoLinked && candidates.length > 1) { entry.catId = ''; entry.autoLinked = false; safe(save(entry)); }
      if (!entry.catId && candidates.length === 1) { entry.catId = candidates[0].action.id; entry.autoLinked = true; safe(save(entry)); }
      const resolvedId = targets(entry).map(cat => cat.action.id).join(':') || null;
      if (entry.lastLinkedId !== resolvedId) cancel(entry);
      entry.lastLinkedId = resolvedId;
    }
    const presence = new Map();
    for (const cat of cats.values()) {
      const item = binding(cat), active = { food: false, litter: false };
      for (const entry of entries.values()) if (present(entry) && targets(entry).includes(cat)) active[entry.kind] = true;
      for (const kind of ['food', 'litter']) bind(cat, kind, present(cat) ? kind === 'food' && item.forcedFood ? item.forcedFood : preferred(cat, kind) : null);
      cat.session.setFoodExcluded(present(cat) && !active.food && foodGroups.some(group => sameDevice(group.entries[0].action,cat.action)));
      presence.set(cat, active);
    }
    // Reserve the shared box before enabling a due cat's routine. Enabling
    // companions can start a visit immediately at the current logical time.
    reserveLitter([...cats.values()].filter(cat => cat.visible));
    const changedCats = [];
    for (const [cat, active] of presence) {
      const changed = cat.companionPresence?.food !== active.food || cat.companionPresence?.litter !== active.litter;
      if (!cat.visible) cat.session.advance(time, { paused: true });
      cat.session.setCompanions(active, time); cat.companionPresence = active;
      if (changed) changedCats.push(cat);
    }
    routeInvitations();
    for (const cat of changedCats) { safe(saveCat(cat)); safe(renderCat(cat)); safe(statusCat(cat)); }
  }
  async function sync(entry, requestId) {
    refresh();
    await Promise.all([save(entry), ...[...entries.values()].filter(item => item.visible).map(render)]);
    await status(entry, requestId, true);
  }
  async function guard(entry, operation, requestId, userAction = false) {
    entry.operationCount = (entry.operationCount || 0) + 1;
    try { await operation(); }
    catch (error) {
      report(error);
      if (userAction) await safe(Promise.resolve().then(() => entry.action.showAlert?.()));
      if (streamDeck.ui.action?.id === entry.action.id) await safe(streamDeck.ui.sendToPropertyInspector({ type: 'error', message: error.message || 'This key could not be updated.', requestId }));
    }
    finally { entry.operationCount--; pruneHidden(); }
  }
  async function useResource(entry) {
    const time = now();
    advance(time);
    const selected = targets(entry), cat = selected[0];
    if (!cat || disposed) return;
    const generation = entry.feedbackGeneration, pool = poolOf(entry);
    if (pool) {
      if (entry.kind === 'food') {
        const low = pool.level <= FOOD_LOW_LEVEL;
        pool.level = 1; pool.emptyForMs = 0; touch(pool);
        for (const candidate of selected) {
          if (binding(candidate).food === pool) candidate.session.projectSupplies({ foodLevel: 1, foodEmptyForMs: 0 });
          if (low && candidate.visible && candidate.session.atHome && !eating(candidate)) invitations.set(candidate.action.id, pool);
          else if (low && candidate.visible && candidate.session.atHome && binding(candidate).food !== pool) invitations.set(candidate.action.id, pool);
        }
        routeInvitations();
      } else { pool.soil = 0; touch(pool); for (const candidate of selected) if (binding(candidate).litter === pool) candidate.session.projectSupplies({ litterSoil: 0 }); }
    } else {
      const item = binding(cat);
      if (entry.kind === 'food' && item.food) {
        item.privateFood.level = 1; item.privateFood.emptyForMs = 0;
      } else if (entry.kind === 'litter' && item.litter) item.privateSoil = 0;
      else cat.session[entry.kind === 'food' ? 'refill' : 'cleanLitter'](time);
    }
    const updates = Promise.all([...selected.map(renderCat), ...[...entries.values()].filter(item => item.visible).map(render)]);
    const saves = [...selected.map(saveCat), ...(pool ? sharedGroup(entry).entries.map(save) : [])];
    await Promise.all([updates, ...saves]);
    if (entry.kind === 'litter' && entry.visible && linked(entry) === cat && entry.feedbackGeneration === generation) { entry.feedbackStartedAt = monotonic(); await render(entry); }
    await Promise.all(selected.map(candidate => statusCat(candidate)));
    await status(entry);
  }
  function startCleaning(entry) {
    entry.lastInteraction = guard(entry, () => useResource(entry), undefined, true);
    safe(entry.lastInteraction);
  }
  for (const [kind, manifestId] of Object.entries(RESOURCE_ACTIONS)) {
    class CompanionKey extends SingletonAction {
      constructor() { super(); this.manifestId = manifestId; }
      async onWillAppear(ev) {
        if (disposed || (ev.action.isKey && !ev.action.isKey())) return;
        let entry = entries.get(ev.action.id);
        if (!entry) {
          entry = { kind, action: ev.action, catId: identity(ev.payload.settings), autoLinked: ev.payload.settings?.autoLinked === true, settingsGeneration: 0, ownWrites: new Set(), image: '', nextImage: null, lastInteraction: Promise.resolve() };
          if (kind === 'litter') entry.press = createPressController({ holdMs: LITTER_HOLD_MS, onHold: () => startCleaning(entry) });
          entries.set(ev.action.id, entry);
        }
        else if (!entry.ownWrites.has(JSON.stringify(ev.payload.settings))) { entry.catId = identity(ev.payload.settings); entry.autoLinked = ev.payload.settings?.autoLinked === true; }
        entry.settingsGeneration++;
        entry.cacheOrder = ++cacheSequence;
        loadPool(entry, ev.payload.settings);
        entry.action = ev.action; entry.present = true; entry.visible = deviceAvailable(ev.action); entry.image = ''; cancel(entry);
        await guard(entry, () => sync(entry));
      }
      async onWillDisappear(ev) {
        const entry = entries.get(ev.action.id); if (!entry) return;
        const time = now();
        advance(time); entry.present = false; entry.visible = false; entry.cacheOrder = ++cacheSequence; cancel(entry); cancelKeyImage(entry);
        refresh(time); await guard(entry, () => save(entry));
      }
      async onDidReceiveSettings(ev) {
        const entry = entries.get(ev.action.id); if (!entry || disposed || entry.ownWrites.has(JSON.stringify(ev.payload.settings))) return;
        advance(); entry.settingsGeneration++; loadPool(entry, ev.payload.settings);
        entry.catId = identity(ev.payload.settings); entry.autoLinked = ev.payload.settings?.autoLinked === true; cancel(entry);
        await guard(entry, () => sync(entry));
      }
      onKeyDown(ev) {
        checkClock();
        const entry = entries.get(ev.action.id);
        if (!entry?.visible || !linked(entry) || disposed) return;
        if (kind === 'litter') {
          if (entry.press.snapshot.active) return;
          cancel(entry);
          entry.press.start(monotonic(), 'key');
          safe(render(entry));
        } else entry.pressed = true;
      }
      async onKeyUp(ev) {
        checkClock();
        const entry = entries.get(ev.action.id); if (!entry?.visible || disposed) return;
        if (kind === 'litter') {
          entry.press.release(monotonic(), 'key');
          await entry.lastInteraction;
          await guard(entry, async () => { await render(entry); await status(entry); });
          return;
        }
        if (!entry.pressed) return;
        entry.pressed = false;
        await guard(entry, () => useResource(entry), undefined, true);
      }
      async onPropertyInspectorDidAppear(ev) { const entry = entries.get(ev.action.id); if (entry) await guard(entry, () => status(entry)); }
      async onSendToPlugin(ev) {
        const entry = entries.get(ev.action.id); if (!entry || disposed || !ev.payload) return;
        const requestId = ['string', 'number'].includes(typeof ev.payload.requestId) ? ev.payload.requestId : undefined;
        await guard(entry, async () => {
          if (ev.payload.type === 'getStatus') { await status(entry, requestId); return; }
          if (ev.payload.type !== 'updateSettings') return;
          const patch = ev.payload.settings;
          if (!patch || Object.keys(patch).some(key => key !== 'catId') || typeof patch.catId !== 'string' || patch.catId.length > 256) throw new RangeError('Choose a cat for this key.');
          if (patch.catId && patch.catId !== SHARED_CAT_ID && patch.catId !== entry.catId && !available(entry).some(cat => cat.action.id === patch.catId)) throw new RangeError('Choose a cat visible on this Stream Deck.');
          advance();
          const previous = { catId: entry.catId, autoLinked: entry.autoLinked };
          const generation = ++entry.settingsGeneration;
          entry.catId = patch.catId; entry.autoLinked = false; cancel(entry);
          try { await sync(entry, requestId); }
          catch (error) { if (entry.settingsGeneration === generation) { Object.assign(entry, previous); refresh(); } throw error; }
        }, requestId);
      }
    }
    actions[kind] = new CompanionKey(); streamDeck.actions.registerAction(actions[kind]);
  }
  return { entries, actions, refresh, advance, serializeCat,
    tick(sendStatus = false) { advance(); for (const entry of entries.values()) if (entry.visible) { entry.press?.update(monotonic()); safe(render(entry)); if (sendStatus) { safe(status(entry)); if (entry.pool && entry.pool.revision !== entry.poolSavedRevision && monotonic() - (entry.poolSavedAt || 0) >= 20_000) safe(save(entry)); } } pruneHidden(); },
    forgetCat(id) { bindings.delete(id); invitations.delete(id); },
    cancelPresses() { for (const entry of entries.values()) cancel(entry); },
    disconnect(deviceId, time = now()) { for (const entry of entries.values()) if (entry.action.device?.id === deviceId) { entry.visible = false; cancel(entry); cancelKeyImage(entry); safe(save(entry)); } refresh(time); },
    resume(deviceId, currentAction) {
      for (const entry of entries.values()) {
        if (!present(entry) || entry.visible || entry.action.device?.id !== deviceId) continue;
        const action = currentAction(entry, RESOURCE_ACTIONS[entry.kind]);
        cancel(entry); cancelKeyImage(entry);
        if (!action) { entry.present = false; entry.cacheOrder = ++cacheSequence; continue; }
        entry.action = action; entry.visible = true; entry.image = '';
      }
    },
    async flush() { await Promise.allSettled([...entries.values()].flatMap(entry => [entry.saving, entry.rendering, entry.lastInteraction]).filter(Boolean)); },
    async dispose() { for (const entry of entries.values()) if (entry.pool) safe(save(entry)); disposed = true; for (const entry of entries.values()) { entry.visible = false; cancel(entry); cancelKeyImage(entry); } await this.flush(); },
  };
}
