// iddaa bültenini kaydeder: her maçın başlama öncesi son oranları kalır.
// Çıktı: snap/YYYY-MM-DD.json (İstanbul tarihine göre, maç başlama günü)
import fs from 'node:fs';
const IDD = 'https://sportsbookv2.iddaa.com/sportsbook';
const r = await fetch(IDD + '/events?st=1&type=0&version=0', { headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0' } });
console.log('iddaa status', r.status);
if (!r.ok) { fs.writeFileSync('snap/_last_error.txt', new Date().toISOString() + ' HTTP ' + r.status + '\n'); process.exit(0); }
const j = await r.json();
const now = Date.now() / 1000;
const day = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(t * 1000));
const evs = (j.data?.events || []).filter(e => e.sid === 1 && e.d > now && e.m?.length);
console.log('events', evs.length);
const byDay = {};
for (const e of evs) { const k = day(e.d); (byDay[k] ||= []).push({ i: e.i, ci: e.ci, d: e.d, hn: e.hn, an: e.an, at: Math.round(now), m: e.m.map(m => ({ t: m.t, st: m.st, sov: m.sov, o: m.o.map(o => ({ n: o.n, odd: o.odd })) })) }); }
fs.mkdirSync('snap', { recursive: true });
const keep = new Set();
for (const [k, list] of Object.entries(byDay)) {
  const f = `snap/${k}.json`; keep.add(f);
  const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { events: [] };
  const map = new Map(old.events.map(e => [e.i, e]));
  for (const e of list) map.set(e.i, e);           // maç başlamadıysa en son oranlar
  const out = { day: k, updated: new Date().toISOString(), events: [...map.values()].sort((a, b) => a.d - b.d) };
  fs.writeFileSync(f, JSON.stringify(out));
}
// 4 günden eski dosyaları sil
for (const f of fs.readdirSync('snap')) { const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/); if (m && (Date.now() - Date.parse(m[1])) > 4 * 86400e3) fs.unlinkSync('snap/' + f); }
fs.writeFileSync('snap/index.json', JSON.stringify({ updated: new Date().toISOString(), days: fs.readdirSync('snap').filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort() }));
