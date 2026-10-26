#!/usr/bin/env node
// Screenshots for the step-by-step guide (#/guide), each with a red box around what to click.
// Runs against a LOCAL dev server in headless Chrome (preview sign-in, so no real account is used):
//   node --experimental-websocket scripts/guide-shots.js            (Node 20; Node 22+ needs no flag)
// The backend must be in sample or read-only sheet mode: one picture comes from sending a request.
//   APP_URL=http://127.0.0.1:3000/ OUT=src/assets/guide/steps node scripts/guide-shots.js
const fs = require('fs');
const path = require('path');
const { CDP, launch, shutdown, sleep, assertLocal } = require('./cdp');

const APP_URL = (process.env.APP_URL || 'http://localhost:3000/').replace(/#.*$/, '');
const OUT = process.env.OUT || path.join(__dirname, '..', 'src', 'assets', 'guide', 'steps');
assertLocal(APP_URL);
fs.mkdirSync(OUT, { recursive: true });

const SESSION = { email: 'clinic@riverside.org', org: 'Riverside Community Clinic', name: 'Ana Morales' };
const W = 1280;
const H = 860;

// Helpers that run inside the page: find by text, draw the red box, hide the preview-only notice.
const PAGE_HELPERS = `
  window.__byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(text));
  window.__mark = (el, scroll = true) => {
    if (!el) throw new Error('nothing to mark');
    document.querySelectorAll('[data-shot-mark]').forEach((e) => { e.style.outline = ''; e.removeAttribute('data-shot-mark'); });
    el.setAttribute('data-shot-mark', '');
    if (scroll) el.scrollIntoView({ block: 'center' });
    el.style.outline = '4px solid #d0021b';
    el.style.outlineOffset = '4px';
    el.style.borderRadius = el.style.borderRadius || '3px';
    return true;
  };
  if (!document.getElementById('__shot-css')) {
    const s = document.createElement('style');
    s.id = '__shot-css';
    s.textContent = '.mock-note,.footer__source,.toast-region{display:none!important} *{caret-color:transparent!important}';
    document.head.appendChild(s);
  }
  true;
`;

let cdp;
const ev = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`${expression.slice(0, 80)}: ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text}`);
  return r.result.value;
};
const waitFor = async (expression, ms = 8000) => {
  for (let t = 0; t < ms; t += 100) {
    if (await ev(`!!(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${expression}`);
};
const type = async (selector, text) => {
  await ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select && e.select(); })()`);
  await cdp.send('Input.insertText', { text });
};

async function go(hash, { signedIn = false, cart = false } = {}) {
  // The dev server's error overlay (for example while an image is missing) must never be photographed.
  const overlay = 'document.querySelector("#webpack-dev-server-client-overlay")';
  await cdp.send('Page.navigate', { url: `${APP_URL}#/` });
  await sleep(300);
  await ev(`(() => {
    localStorage.removeItem('b4p.cart.v1');
    ${signedIn ? `localStorage.setItem('b4p.mock.session.v1', ${JSON.stringify(JSON.stringify(SESSION))});` : "localStorage.removeItem('b4p.mock.session.v1');"}
  })()`);
  // A new query string forces a full load, so the app reads the session just stored.
  await cdp.send('Page.navigate', { url: `${APP_URL}?shot=${Date.now()}#/c/gloves` });
  await waitFor('document.querySelector("header") && document.fonts.status === "loaded"');
  await sleep(400);
  if (cart) {
    await waitFor('document.querySelector(".btn--add")');
    await ev('document.querySelector(".btn--add").click()');
    await sleep(300);
  }
  await ev(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(900);
  if (await ev(`!!${overlay}`)) throw new Error('the dev server shows a build error; fix it, then run this again');
  await ev(PAGE_HELPERS);
}

// clip: 'header' (the top bar), 'viewport', or a selector whose box (plus padding) is kept.
async function shot(name, markExpr, clip = 'viewport', pad = 24) {
  await ev(PAGE_HELPERS);
  const whole = clip !== 'header' && clip !== 'viewport'; // a form or panel: cut from the unscrolled page
  if (whole) await ev('window.scrollTo(0, 0)');
  if (markExpr) await ev(`__mark(${markExpr}, ${!whole})`);
  await sleep(whole ? 700 : 250); // panels slide in
  // The capture clip is in page coordinates, so add the scroll position to on-screen boxes.
  const sy = await ev('window.scrollY');
  let box;
  if (clip === 'header') {
    const h = JSON.parse(await ev('JSON.stringify(document.querySelector(".header").getBoundingClientRect())'));
    box = { x: 0, y: sy, width: W, height: Math.ceil(h.bottom) + 12 };
  } else if (clip === 'viewport') {
    box = { x: 0, y: sy, width: W, height: H };
  } else {
    const r = JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(clip)}).getBoundingClientRect())`));
    const x = Math.max(0, r.left - pad);
    const y = Math.max(0, r.top - pad);
    box = { x, y: y + sy, width: Math.min(W - x, r.width + 2 * pad), height: r.height + 2 * pad };
  }
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { ...box, scale: 1 }, captureBeyondViewport: whole });
  fs.writeFileSync(path.join(OUT, `${name}.jpg`), Buffer.from(data, 'base64'));
  console.log('saved', name, `${Math.round(box.width)}x${Math.round(box.height)}`);
}

(async () => {
  // Step 8's picture sends a request. Only run where requests are kept in memory, never written anywhere.
  const API = (process.env.API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  assertLocal(API);
  const { source } = await (await fetch(`${API}/health`)).json();
  if (source !== 'sample' && source !== 'sheet-public') {
    console.error(`The server's data source is "${source}". Run it with USE_SAMPLE_DATA=1 or PUBLIC_SHEET_READ=1 first.`);
    process.exit(2);
  }
  const { chrome, profile, wsUrl } = await launch(null, `${W},${H}`);
  cdp = new CDP(wsUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  try {
    // 1. Sign in.
    await go('#/signin');
    await waitFor('document.querySelector("#auth-password")');
    await type('#auth-email', SESSION.email);
    await type('#auth-password', 'my-clinic-password');
    await shot('sign-in', '__byText("button", "Sign in")', '.auth', 32);

    // 2. Find a supply (categories; the search box is in the same picture's header).
    await go('#/supplies', { signedIn: true });
    await waitFor('document.querySelector(".landing a[href=\'#/c/gloves\']")');
    await shot('categories', 'document.querySelector(".landing a[href=\'#/c/gloves\']").closest("section")');

    // 3-5. Open a supply: its photo, + Add to list, then how many.
    await go('#/item/3', { signedIn: true });
    await waitFor('document.querySelector(".detail__photo img") && document.querySelector(".detail__photo img").complete && document.querySelector(".detail__photo img").naturalWidth > 0', 30000);
    await sleep(500);
    await shot('photo', 'document.querySelector(".detail__photo")', '.dialog__panel', 0);
    await shot('add', 'document.querySelector(".detail__action .btn--add")', '.dialog__panel', 0);
    await ev('document.querySelector(".detail__action .btn--add").click()');
    await sleep(2200);
    await shot('how-many', 'document.querySelector(".detail__action .stepper")', '.dialog__panel', 0);

    // 6-9. Your list, Review and send, Send request, the request number.
    await go('#/c/gloves', { signedIn: true, cart: true });
    await ev('location.hash = "#/slip"');
    await sleep(900);
    await shot('list-change', 'document.querySelector(".slip .stepper")', '.dialog__panel', 0);
    await shot('review-and-send', '__byText(".slip button", "Review and send")', '.dialog__panel', 0);
    await go('#/review', { signedIn: true, cart: true });
    await waitFor('__byText("button", "Send request")');
    await shot('send', '__byText("button", "Send request")');
    await ev('__byText("button", "Send request").click()'); // kept in memory only in sample / read-only sheet mode
    await waitFor('location.hash.startsWith("#/sent/")', 15000);
    await sleep(600);
    await ev(PAGE_HELPERS);
    await ev('window.scrollTo(0, 0)');
    await shot('sent', 'document.querySelector("main h1")');

    // 10. Account > My requests.
    await ev('location.hash = "#/supplies"');
    await sleep(700);
    await ev(PAGE_HELPERS);
    await ev('document.querySelector("details.acct").open = true');
    await sleep(300);
    await shot('account-menu', 'document.querySelector("a.acct__item[href=\'#/requests\']")', 'viewport');
  } finally {
    cdp.ws.close();
    await shutdown(chrome, profile);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
