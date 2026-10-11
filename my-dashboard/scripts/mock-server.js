#!/usr/bin/env node
// Local-only stand-in for the backend, with SYNTHETIC inventory (no real rows, no patient IDs).
//   REACT_APP_API_URL=http://127.0.0.1:8765 npm run build && node scripts/mock-server.js
// Serves build/ on :3765 and the API on :8765 (GET /api/supplies, /inventory/availability, /requests; POST /requests).
const http = require('http');
const fs = require('fs');
const path = require('path');

const BUILD = path.resolve(__dirname, '..', 'build');
const WEB = Number(process.env.WEB_PORT || 3765);
const API = Number(process.env.API_PORT || 8765);
const DELAY = Number(process.env.API_DELAY || 0);

const TYPES = {
  'Wound Care & Bandages': ['Gauze pads 4x4', 'Adhesive bandages', 'Elastic bandage 4 in', 'Triangular bandage', 'Wound dressing, sterile', 'Medical tape 1 in', 'Hydrocolloid dressing', 'Petrolatum gauze'],
  Gloves: ['Nitrile gloves (M)', 'Nitrile gloves (L)', 'Surgical masks', 'N95 respirator', 'Isolation gown', 'Face shield', 'Shoe covers', 'Bouffant cap'],
  'Needles & Syringes': ['Syringe 3 mL', 'Syringe 5 mL', 'Syringe 10 mL', 'Needle 21G', 'Needle 25G', 'Safety needle 23G', 'Alcohol prep pads', 'Sharps container'],
  'Vitals & Home Health': ['Digital thermometer', 'Pulse oximeter', 'Blood pressure cuff', 'Glucose test strips', 'Urine test strips', 'Otoscope speculum', 'Stethoscope', 'Malaria rapid test'],
  'Airway & Oxygen': ['Nebulizer mask', 'Oxygen tubing', 'Nasal cannula', 'Peak flow meter', 'Spacer device', 'Suction catheter'],
  'Misc Surgical': ['Suture 3-0 nylon', 'Suture 4-0 vicryl', 'Scalpel blade #11', 'Scalpel blade #15', 'Surgical drape', 'Forceps, Adson', 'Needle driver', 'Hemostat'],
  'IV Supplies': ['IV catheter 20G', 'IV catheter 22G', 'IV tubing set', 'Saline flush 10 mL', 'Tourniquet', 'IV start kit', 'Extension set'],
  'Apparel (Gowns, Shoe Covers, etc.)': ['Ankle brace', 'Knee brace', 'Wrist splint', 'Cervical collar', 'Crutches, adult', 'Cast padding'],
};
const MFR = ['Acme Medical', 'Northwind Health', 'Contoso Supply', 'Globex Care', ''];
const rows = [];
let n = 2;
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
for (const [cat, names] of Object.entries(TYPES)) {
  for (const name of names) {
    for (let lot = 0; lot < 1 + Math.floor(rnd() * 3); lot += 1) {
      const r = rnd();
      rows.push({
        _sheet_row: n++, Name: name, Category: cat, Subcategory: cat, Quantity: String(r < 0.15 ? Math.floor(rnd() * 5) : 10 + Math.floor(rnd() * 400)),
        'Manufacturer Name': MFR[Math.floor(rnd() * MFR.length)], 'Lot Number': `LOT-${1000 + n}`,
        'Date of Expiration': r < 0.1 ? day(-30) : r < 0.25 ? day(45) : day(200 + Math.floor(rnd() * 700)),
        'Pallet Number': String(1 + Math.floor(rnd() * 9)), 'Box Number': String(1 + Math.floor(rnd() * 40)), Review: '', Notes: '',
      });
    }
  }
}
const avail = rows.map((r) => {
  const q = Number(r.Quantity);
  return { sheet_row: r._sheet_row, item_name: r.Name, category: r.Category, availability_status: q <= 5 ? 'Limited' : 'Available', tags: [q <= 5 ? 'Low Stock' : 'Available'], remaining: q, requesting_org: null, request_id: null };
});

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const json = (res, body, code = 200) => setTimeout(() => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...cors });
  res.end(JSON.stringify(body));
}, DELAY);
http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (p === '/api/supplies') return json(res, rows);
  if (p === '/inventory/availability') return json(res, avail);
  if (p === '/requests' && req.method === 'GET') return json(res, []);
  if (p === '/requests') return json(res, { ok: true, request_group_id: 'demo-0001', lines: 1 });
  return json(res, { detail: 'Not found' }, 404);
}).listen(API, '127.0.0.1');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let f = path.join(BUILD, req.url.split('?')[0]);
  if (!f.startsWith(BUILD) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(BUILD, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(WEB, '127.0.0.1', () => console.log(`web http://127.0.0.1:${WEB}  api http://127.0.0.1:${API}  rows ${rows.length}`));
