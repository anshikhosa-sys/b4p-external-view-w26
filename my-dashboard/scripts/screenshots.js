#!/usr/bin/env node
// Screenshots of key pages from a LOCAL build in headless Chrome.
//   APP_URL=http://127.0.0.1:3765/ OUT=~/b4p-repos/screenshots/ui-dev node scripts/screenshots.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CDP, launch, shutdown, sleep, assertLocal } = require('./cdp');

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:3765/').replace(/#.*$/, '');
const OUT = (process.env.OUT || path.join(os.homedir(), 'b4p-repos/screenshots/ui-dev')).replace(/^~/, os.homedir());
const PREFIX = process.env.PREFIX || '';
assertLocal(APP_URL);
fs.mkdirSync(OUT, { recursive: true });

const ev = async (cdp, expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result.value;
};
const SHOTS = [
  ['landing', '#/', 1280, 900, false],
  ['landing-full', '#/', 1280, 900, true],
  ['category-needles-and-syringes', '#/c/needles-and-syringes', 1280, 900, false],
  ['search-gloves', '#/', 1280, 900, false, 'type:glove'],
  ['request-slip', '#/c/needles-and-syringes', 1280, 900, false, 'cart'],
  ['checkout', '#/review', 1280, 900, false, 'cart'],
  ['checkout-mobile', '#/review', 390, 844, false, 'cart'],
  ['landing-mobile', '#/', 390, 844, false],
  ['category-mobile', '#/c/needles-and-syringes', 390, 844, false],
];
(async () => {
  const { chrome, profile, wsUrl } = await launch();
  const cdp = new CDP(wsUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  for (const [name, hash, w, h, full, act] of SHOTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(100);
    await cdp.send('Page.navigate', { url: APP_URL + hash });
    for (let i = 0; i < 100; i += 1) { if (await ev(cdp, '!!document.querySelector("main h1")')) break; await sleep(50); }
    await sleep(500);
    if (act && act.startsWith('type:')) {
      await ev(cdp, 'document.querySelector("input[type=search], header input").focus()');
      await cdp.send('Input.insertText', { text: act.slice(5) });
      await sleep(600);
    }
    if (act === 'cart') {
      await ev(cdp, 'location.hash="#/c/needles-and-syringes"; 0');
      await sleep(400);
      await ev(cdp, '(document.querySelectorAll("button.btn")||[]).forEach((b,i)=>{ if(/^Add/.test(b.textContent) && i<6) b.click(); }); 0');
      await sleep(300);
      await ev(cdp, `location.hash=${JSON.stringify(hash === '#/review' ? hash : '#/slip')}; 0`);
      await sleep(600);
    }
    if (full) {
      const height = await ev(cdp, 'document.documentElement.scrollHeight');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height, deviceScaleFactor: 1, mobile: false });
      await sleep(200);
    }
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `${PREFIX}${name}.png`), Buffer.from(data, 'base64'));
    console.log('saved', name);
  }
  cdp.ws.close();
  await shutdown(chrome, profile);
  process.exit(0);
})();
