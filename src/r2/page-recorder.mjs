// R2-L2 S1: runner-owned page recorder (design §3.2-§3.4). installR2PageRecorder is one pure init-script
// function: it references nothing outside its own body, so context.addInitScript(fn, {session}) serializes it
// unchanged. It runs after createIsolatedContext's init script and before any page script. No caller yet; no
// browser runs in offline CI. Real Chromium event order (P-1) and isTrusted under NVDA (P-2) are unmeasured.
//
// Contract:
//  - state lives in this closure; the only globals are __tabwiseR2Journal and __tabwiseR2App, both
//    non-writable and non-configurable;
//  - identity: null/document/documentElement/body -> 'body'; any other node -> '<id or tag>#<ordinal>',
//    the ordinal from a WeakMap and never reused, so a same-id clone gets a new identity;
//  - capture-phase passive window listeners: keydown, focusin, focusout (never a raw focus event), plus one
//    MutationObserver on document; t is performance.now() and active is document.activeElement's identity,
//    both taken when the event is appended;
//  - caps are on recorded events (count and serialized bytes). A miss or a clock regression drops the event,
//    counts it and sets complete:false; nothing is compacted, so the R2-L1 adapter refuses every later read;
//  - state is a pure function of DOM attributes and text, so any change to it has a MutationRecord, and the
//    read flushes takeRecords() before computing it, in one synchronous turn;
//  - page-authored data (__tabwiseR2App calls, the fixture's own __r2Events) is labelled and never scored.
// Host primitives are captured at install, so a later page patch of performance.now, JSON, structuredClone,
// takeRecords or the Document/Element/Node accessors used here does not change a read. This is not a sandbox:
// a page that patches them before install, or alters DOM data itself, is outside this guarantee.
export function installR2PageRecorder(config) {
  const w = globalThis, d = w.document;
  const session = config?.session, maxEvents = config?.maxEvents ?? 1000, maxBytes = config?.maxBytes ?? 262144;
  if (typeof session !== 'string' || !session || session.length > 128) throw new w.TypeError('tabwise recorder: invalid session');
  if (!w.Number.isSafeInteger(maxEvents) || maxEvents <= 0 || !w.Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new w.TypeError('tabwise recorder: invalid caps');
  if ('__tabwiseR2Journal' in w || '__tabwiseR2App' in w) throw new w.TypeError('tabwise recorder: already installed');
  const apply = w.Reflect.apply, define = w.Object.defineProperty, describe = w.Object.getOwnPropertyDescriptor;
  const getter = (proto, name) => {
    const get = describe(proto, name)?.get;
    if (typeof get !== 'function') throw new w.TypeError(`tabwise recorder: missing ${name} accessor`);
    return target => apply(get, target, []);
  };
  const method = (proto, name) => {
    const fn = proto?.[name];
    if (typeof fn !== 'function') throw new w.TypeError(`tabwise recorder: missing ${name}`);
    return (target, ...args) => apply(fn, target, args);
  };
  const perf = w.performance, nowFn = perf.now, now = () => apply(nowFn, perf, []);
  const clone = w.structuredClone, stringify = w.JSON.stringify, parse = w.JSON.parse, from = w.Array.from;
  const encoder = new w.TextEncoder(), encode = method(w.TextEncoder.prototype, 'encode');
  const bytes = value => encode(encoder, value).length;
  const activeOf = getter(w.Document.prototype, 'activeElement'), titleOf = getter(w.Document.prototype, 'title');
  const query = method(w.Document.prototype, 'querySelectorAll'), attribute = method(w.Element.prototype, 'getAttribute');
  const textOf = getter(w.Node.prototype, 'textContent'), take = method(w.MutationObserver.prototype, 'takeRecords');
  const DIALOGS = 'dialog[open], [role=dialog]:not([hidden]), [role=alertdialog]:not([hidden])';
  const INVALID = '[aria-invalid="true"]';
  const LIVE = '[role=alert],[role=status],[role=log],[aria-live]';
  const STATE_ENTRIES = 16, LIVE_TEXT = 512, PAGE_REPORTED_BYTES = 65536, APP_DETAIL_BYTES = 1024;

  const ordinals = new w.WeakMap();
  let ordinal = 0;
  const ident = node => {
    if (node === null || node === undefined || node === d || node === d.documentElement || node === d.body) return 'body';
    let n = ordinals.get(node);
    if (n === undefined) { n = ++ordinal; ordinals.set(node, n); }
    const name = typeof node.id === 'string' && node.id ? node.id : w.String(node.localName || node.nodeName || 'node').toLowerCase();
    return `${name}#${n}`;
  };
  const element = node => typeof node?.id === 'string' && node.id ? node.id : null;

  const events = [], reasons = [];
  let used = 0, last = 0, overflow = false, dropped = 0;
  const reason = text => { if (!reasons.includes(text)) reasons.push(text); };
  const append = (type, fields) => {
    const t = now();
    if (!(t >= last)) { reason('page clock regression'); dropped++; return; }
    if (reasons.length) { dropped++; return; }
    const event = {seq: events.length + 1, t, type, active: ident(activeOf(d)), ...fields};
    const size = bytes(stringify(event)) + 1;
    if (events.length + 1 > maxEvents || used + size > maxBytes) { overflow = true; reason('page capture overflow'); dropped++; return; }
    events.push(event); used += size; last = t;
  };
  const mutation = record => append('mutation', {target: ident(record.target), element: element(record.target),
    mutation: record.type, attribute: record.attributeName ?? null,
    added: record.addedNodes?.length ?? 0, removed: record.removedNodes?.length ?? 0});

  const options = {capture: true, passive: true};
  w.addEventListener('keydown', e => append('keydown', {key: e.key, code: e.code, location: e.location,
    shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, repeat: e.repeat, isTrusted: e.isTrusted,
    target: ident(e.target), element: element(e.target)}), options);
  for (const type of ['focusin', 'focusout']) w.addEventListener(type, e => append(type, {target: ident(e.target),
    element: element(e.target), related: ident(e.relatedTarget), isTrusted: e.isTrusted}), options);
  const observer = new w.MutationObserver(records => { for (const record of records) mutation(record); });
  observer.observe(d, {subtree: true, childList: true, attributes: true, characterData: true});

  // Any entry over its bound makes the whole state null with state_overflow:true; nothing is truncated.
  const state = () => {
    const list = selector => from(query(d, selector));
    const dialogs = list(DIALOGS), invalid = list(INVALID), live = list(LIVE);
    if (dialogs.length > STATE_ENTRIES || invalid.length > STATE_ENTRIES || live.length > STATE_ENTRIES) return null;
    const regions = [];
    for (const node of live) {
      const text = textOf(node) ?? '';
      if (text.length > LIVE_TEXT) return null;
      regions.push({target: ident(node), role: attribute(node, 'role'), aria_live: attribute(node, 'aria-live'), text});
    }
    return {dialogs: dialogs.map(ident), invalid: invalid.map(ident), live: regions};
  };
  const pageReported = () => {
    try {
      const value = w.__r2Events;
      if (value === undefined) return {value: null, overflow: false};
      const text = stringify(value);
      if (text === undefined || bytes(text) > PAGE_REPORTED_BYTES) return {value: null, overflow: true};
      return {value: parse(text), overflow: false};
    } catch { return {value: null, overflow: true}; }
  };

  define(w, '__tabwiseR2App', {enumerable: false, writable: false, configurable: false, value(name, detail) {
    if (typeof name !== 'string' || !name || name.length > 64) throw new w.TypeError('tabwise app event: invalid name');
    let text;
    try { text = stringify(detail === undefined ? null : detail); } catch { text = undefined; }
    if (typeof text !== 'string' || bytes(text) > APP_DETAIL_BYTES) throw new w.TypeError('tabwise app event: detail must be JSON within 1 KB');
    append('app', {name, detail: parse(text), source: 'page-authored'});
  }});
  define(w, '__tabwiseR2Journal', {enumerable: false, writable: false, configurable: false, value() {
    // Page-authored data is read first: any side effect of its getters is flushed by takeRecords below.
    const reported = pageReported();
    for (const record of take(observer)) mutation(record);
    const current = state(), active = ident(activeOf(d)), title = titleOf(d), url = w.location.href;
    const network = w.__tabwiseNetworkRestricted === true, t = now();
    if (!(t >= last)) reason('page clock regression'); else last = t;
    return clone({session, complete: reasons.length === 0, clock: 'page-monotonic-ms', t, active, title, url,
      state: current, state_overflow: current === null, event_count: events.length, overflow, dropped, events,
      page_reported: reported.value, page_reported_overflow: reported.overflow, reasons: [...reasons],
      network_restrictions: network});
  }});
}
