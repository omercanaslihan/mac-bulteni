// Canlı maçlar: API-Football canlı skor/dakika/istatistik + maç öncesi gol beklentisi → kalan süre olasılıkları.
// İstek bütçesi: liste 1 istek; istatistik sadece "İstatistik" denilen maç için (60 sn önbellek).
(function (root) {
  'use strict';
  const AF = 'https://v3.football.api-sports.io', IDD = 'https://sportsbookv2.iddaa.com/sportsbook';
  const $ = id => document.getElementById(id);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } } };
  const pct = p => p == null || isNaN(p) ? '–' : '%' + Math.round(p * 100);
  const fx = (v, d = 2) => v.toFixed(d).replace('.', ',');
  const LG = []; { let s = 0; LG.push(0); for (let k = 1; k <= 30; k++) { s += Math.log(k); LG.push(s); } }
  const pois = (m, K) => { const o = []; m = Math.max(m, 1e-9); for (let k = 0; k <= K; k++) o.push(Math.exp(-m + k * Math.log(m) - LG[k])); return o; };
  const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
  let fixtures = [], left = null, stats = {}, iddLive = null, iddDet = {}, busy = false, lastAt = 0, timer = null;

  // Maç öncesi kayıttan gol beklentisi (bu cihazda maç öncesi görüldüyse)
  const snapDB = () => new Promise((res, rej) => { const q = indexedDB.open('mb-snap', 1); q.onupgradeneeded = () => q.result.createObjectStore('ev', { keyPath: 'i' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  async function snaps() { try { const db = await snapDB(); return await new Promise((res, rej) => { const q = db.transaction('ev').objectStore('ev').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return []; } }

  async function afGet(path) { const key = ls.get('mb_afkey'); if (!key) throw new Error('nokey'); const r = await fetch(AF + path, { headers: { 'x-apisports-key': key } });
    const j = await r.json(); const rl = r.headers.get('x-ratelimit-requests-remaining'); if (rl != null) left = rl;
    const er = j && j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length) ? Object.values(j.errors).join(' ') : null; if (er) throw new Error(er); return j.response || []; }

  // Kalan sürenin gol payı (ilk yarı ~%45 gol)
  function remFrac(st, el, ht) { if (st === 'HT') return 1 - ht; el = Math.max(0, el || 0); if (st === '2H') el = Math.max(46, el); if (st === '1H') el = Math.min(el, 47); if (st === '1H') return ht * Math.max(0, 47 - el) / 45 + (1 - ht); if (st === '2H') return (1 - ht) * Math.max(0, 93 - el) / 45; return 0.02; }
  function statOf(T, name) { const v = (T && T.statistics || []).find(z => z.type === name); if (!v || v.value == null) return null; const n = parseFloat(String(v.value)); return isNaN(n) ? null : n; }

  function model(x) {
    const lam0 = x.pre ? x.pre[0] : 1.45, mu0 = x.pre ? x.pre[1] : 1.15, ht = x.pre ? x.pre[2] : 0.45;
    const rf = remFrac(x.st, x.el, ht), done = 1 - rf;
    let mH = 1, mA = 1, why = null; const S = stats[x.fid] && stats[x.fid].v;
    if (S && done > 0.08) { // tempo: gerçekleşen xG (ya da şuttan tahmin) / beklenen
      const xg = (T, lam) => { const e = statOf(T, 'expected_goals'); if (e != null) return { v: e, src: 'xG' }; const sot = statOf(T, 'Shots on Goal'), sh = statOf(T, 'Total Shots'); if (sot == null || sh == null) return null; return { v: 0.28 * sot + 0.04 * Math.max(0, sh - sot), src: 'şut' }; };
      const h = xg(S.H, lam0), a = xg(S.A, mu0);
      if (h && a) { const c = 1.5, eh = lam0 * done, ea = mu0 * done; mH = Math.min(1.8, Math.max(0.6, (h.v + c * eh) / ((1 + c) * eh))); mA = Math.min(1.8, Math.max(0.6, (a.v + c * ea) / ((1 + c) * ea))); why = { h: h.v, a: a.v, eh, ea, src: h.src }; }
    }
    if (S) { const rh = statOf(S.H, 'Red Cards') || 0, ra = statOf(S.A, 'Red Cards') || 0; if (rh) { mH *= Math.pow(0.7, rh); mA *= Math.pow(1.25, rh); } if (ra) { mA *= Math.pow(0.7, ra); mH *= Math.pow(1.25, ra); } }
    const lr = lam0 * rf * mH, ur = mu0 * rf * mA, gh = x.gh || 0, ga = x.ga || 0;
    const A = pois(lr, 12), B = pois(ur, 12); let H = 0, Dw = 0, Aw = 0, KG = 0; const over = {};
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) { const p = A[i] * B[j]; const fh = gh + i, fa = ga + j; if (fh > fa) H += p; else if (fh === fa) Dw += p; else Aw += p; if (fh > 0 && fa > 0) KG += p; const t = fh + fa; for (const L of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) if (t > L) over[L] = (over[L] || 0) + p; }
    const tot = lr + ur, pGoal = 1 - Math.exp(-tot);
    const tempo = (lam0 * mH + mu0 * mA) / (lam0 + mu0);
    return { lr, ur, pGoal, nextH: tot ? pGoal * lr / tot : 0, nextA: tot ? pGoal * ur / tot : 0, H, D: Dw, A: Aw, KG, over, tempo, why, rf };
  }

  // iddaa canlı oranları (adil olasılık)
  function iddFair(x, m) { const d = iddDet[x.iddI]; if (!d || !root.BLD) return {}; const out = {}; const total = (x.gh || 0) + (x.ga || 0);
    const get = (st, sov) => (d.m || []).find(z => z.t === 4 && z.st === st && (sov == null || String(z.sov) === String(sov)));
    const dv = mk => mk && mk.o && mk.o.length >= 2 && mk.o.every(o => o.odd > 1.01) ? BLD.devig(mk.o.map(o => o.odd)) : null;
    const ms = get(4); const pm = dv(ms); if (pm) ms.o.forEach((o, j) => out['ms' + o.n] = pm[j]);
    const kg = get(131); const pk = dv(kg); if (pk) kg.o.forEach((o, j) => out['kg' + o.n] = pk[j]);
    const ng = (d.m || []).find(z => z.t === 4 && z.st === 33); const pn = dv(ng); if (pn) ng.o.forEach((o, j) => out['ng' + o.n] = pn[j]);
    for (const z of (d.m || []).filter(z => z.t === 4 && z.st === 14 && z.sov != null)) { const p = dv(z); if (!p) continue; const L = +z.sov; const iU = z.o.findIndex(o => o.n === 'Üst'); if (iU < 0) continue;
      // iddaa canlı alt/üst maçın toplam golü üzerinden; çizgi mevcut golün altındaysa kalan gol sayılıyor demektir
      const fin = L > total ? L : L + total; out['ou' + fin] = p[iU]; }
    return out; }

  function card(x) { const m = model(x); const f = iddFair(x, m); const S = stats[x.fid];
    const cmp = (ours, key, lab) => `<div class="lv-p"><span>${lab}</span><b>${pct(ours)}</b>${f[key] != null ? `<i class="${Math.abs(ours - f[key]) >= 0.08 ? 'df' : ''}" title="iddaa canlı oranından adil olasılık">iddaa ${pct(f[key])}</i>` : ''}</div>`;
    const tl = m.tempo > 1.15 ? ['yüksek', 'up'] : m.tempo < 0.87 ? ['düşük', 'dn'] : ['normal', ''];
    const lines = [0.5, 1.5, 2.5, 3.5, 4.5].filter(L => L > (x.gh + x.ga) - 0.5 && L >= (x.gh + x.ga) + 0.5).slice(0, 3);
    return `<article class="lv" data-f="${x.fid}">
      <div class="lv-h"><div><span class="tag">${x.lg}</span><div class="lv-t">${x.h} <b class="num">${x.gh ?? 0}–${x.ga ?? 0}</b> ${x.a}</div></div><div class="lv-min num">${x.st === 'HT' ? 'devre' : (x.el ?? '') + "'"}</div></div>
      <div class="lv-meta">Tempo <b class="${tl[1]}">${tl[0]}</b>${m.why ? ` · ${m.why.src === 'xG' ? 'xG' : 'şut temelli xG'} ${fx(m.why.h, 1)}–${fx(m.why.a, 1)} (beklenen ${fx(m.why.eh, 1)}–${fx(m.why.ea, 1)})` : S ? '' : ' · istatistik alınmadı'}${x.pre ? '' : ' · <span title="Bu cihaz maç öncesini görmediği için lig ortalaması kullanıldı">maç öncesi verisi yok</span>'}${S && S.red ? ' · <span class="dn">kırmızı kart</span>' : ''}</div>
      <div class="lv-grid">
        ${cmp(m.pGoal, '_', 'Kalan sürede gol')}
        <div class="lv-p"><span>Sıradaki gol</span><b>${pct(m.nextH)} / ${pct(m.nextA)}</b>${f.ng1 != null ? `<i>iddaa ${pct(f.ng1)} / ${pct(f.ng2)}</i>` : ''}</div>
        ${lines.map(L => cmp(m.over[L] || 0, 'ou' + L, `Maç sonu ${String(L).replace('.', ',')} üst`)).join('')}
        ${cmp(m.KG, 'kgVar', 'KG var')}
        <div class="lv-p"><span>MS 1 / X / 2</span><b>${pct(m.H)} / ${pct(m.D)} / ${pct(m.A)}</b>${f.ms1 != null ? `<i>iddaa ${pct(f.ms1)} / ${pct(f.ms0)} / ${pct(f.ms2)}</i>` : ''}</div>
      </div>
      <div class="lv-act"><button type="button" class="lv-st" data-f="${x.fid}">${S ? 'İstatistiği yenile' : 'İstatistik getir'}</button><span class="tag">${S ? 'istatistik ' + Math.max(0, Math.round((Date.now() - S.t) / 60000)) + ' dk önce' : '1 istek'}</span></div>
    </article>`; }

  function render() { const box = $('lvList'); if (!box) return;
    const onlyB = $('lvAll') && !$('lvAll').checked; const list = fixtures.filter(x => !onlyB || x.iddI);
    $('lvMsg').textContent = !ls.get('mb_afkey') ? 'Canlı skor ve dakika için üstteki Skorlar kutusuna API-Football anahtarını gir.' : `${fixtures.length} canlı maç, ${fixtures.filter(x => x.iddI).length} tanesi iddaa bülteninde.${left != null ? ` Bugün kalan istek: ${left}.` : ''}${lastAt ? ' Son yenileme ' + new Date(lastAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + '.' : ''}`;
    box.innerHTML = list.length ? list.map(card).join('') : (fixtures.length ? '<p class="empty">Bültendeki maçlardan şu an oynanan yok. "Bülten dışı maçlar" kutusunu işaretleyebilirsin.</p>' : (ls.get('mb_afkey') ? '<p class="empty">Şu an canlı maç yok ya da liste henüz alınmadı.</p>' : ''));
  }

  async function refresh() { if (busy) return; busy = true; const btn = $('lvRef'); if (btn) btn.disabled = true;
    try { const R = await afGet('/fixtures?live=all'); const pre = new Map(); const A = root.__app;
      // maç öncesi beklenti: bu yüklemede başlamamış görülen ya da cihazdaki kayıttan
      const nowS = Date.now() / 1000; const S = (await snaps()).filter(r => r.d < nowS + 600 && r.d > nowS - 3 * 3600); const M = root.__MODEL; for (const r of S) { if (!root.BLD || !M) break; try { const b = BLD.buildEvent(r, M, ''); if (b.fit) pre.set(r.i, { h: r.hn, a: r.an, d: r.d, fit: b.fit }); } catch (e) { } }
      if (A) for (const e of A.D.events) if (e.fit && !pre.has(e.i)) pre.set(e.i, { h: e.h, a: e.a, d: e.d, fit: e.fit });
      try { const j = await (await fetch(IDD + '/events?st=1&type=1&version=0', { cache: 'no-store' })).json(); iddLive = (j.data && j.data.events) || []; } catch (e) { iddLive = []; }
      const iddList = iddLive.map(e => ({ i: e.i, h: e.hn, a: e.an, d: e.d }));
      const best = (arr, f) => { let b = null, bs = 0; for (const c of arr) { if (Math.abs(c.d - f.t) > 1800) continue; const s1 = BLD.simName(c.h, f.h), s2 = BLD.simName(c.a, f.a); const s = (s1 > 0 && s2 > 0) ? s1 + s2 + 2 : (s1 + s2 >= 2 ? s1 + s2 : 0); if (s > bs) { bs = s; b = c; } } return b; };
      const preArr = [...pre.entries()].map(([i, v]) => ({ i, ...v }));
      fixtures = R.filter(f => LIVE.has(f.fixture.status.short)).map(f => { const x = { fid: f.fixture.id, t: f.fixture.timestamp, st: f.fixture.status.short, el: f.fixture.status.elapsed, h: f.teams.home.name, a: f.teams.away.name, hid: f.teams.home.id, aid: f.teams.away.id, gh: f.goals.home, ga: f.goals.away, lg: (f.league.country ? f.league.country + ' · ' : '') + f.league.name };
        const ie = best(iddList, x); if (ie) x.iddI = ie.i; const pe = best(preArr, x); if (pe) x.pre = pe.fit; return x; })
        .sort((a, b) => (!!b.iddI - !!a.iddI) || (!!b.pre - !!a.pre) || a.lg.localeCompare(b.lg, 'tr'));
      await Promise.all(fixtures.filter(x => x.iddI).slice(0, 40).map(async x => { try { const j = await (await fetch(IDD + '/event/' + x.iddI, { cache: 'no-store' })).json(); if (j && j.data) iddDet[x.iddI] = j.data; } catch (e) { } }));
      lastAt = Date.now();
    } catch (e) { $('lvMsg').textContent = e.message === 'nokey' ? 'Canlı skor ve dakika için üstteki Skorlar kutusuna API-Football anahtarını gir.' : 'Canlı maçlar alınamadı: ' + (/fetch/i.test(e.message) ? 'API-Football\'a ulaşılamadı.' : e.message); busy = false; if (btn) btn.disabled = false; return; }
    busy = false; if (btn) btn.disabled = false; render(); }

  async function getStats(fid) { const x = fixtures.find(z => z.fid == fid); if (!x) return; const c = stats[fid]; if (c && Date.now() - c.t < 60e3) return render();
    try { const T = await afGet('/fixtures/statistics?fixture=' + fid); const H = T.find(t => t.team && t.team.id === x.hid) || T[0], A = T.find(t => t.team && t.team.id === x.aid) || T[1];
      if (H && A) stats[fid] = { t: Date.now(), v: { H, A }, red: (statOf(H, 'Red Cards') || 0) + (statOf(A, 'Red Cards') || 0) > 0 }; } catch (e) { $('lvMsg').textContent = 'İstatistik alınamadı: ' + e.message; }
    if (x.iddI) { try { const j = await (await fetch(IDD + '/event/' + x.iddI, { cache: 'no-store' })).json(); if (j && j.data) iddDet[x.iddI] = j.data; } catch (e) { } }
    render(); }

  function setAuto(on) { clearInterval(timer); timer = null; if (on) timer = setInterval(() => { if (!document.hidden && !$('canli').hidden) refresh(); }, 120e3); }

  document.addEventListener('click', ev => {
    if (ev.target.id === 'lvBtn') { const p = $('canli'); p.hidden = !p.hidden; if (!p.hidden) { if (Date.now() - lastAt > 60e3) refresh(); else render(); p.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    if (ev.target.id === 'lvRef') refresh();
    const s = ev.target.closest('.lv-st'); if (s) { s.disabled = true; getStats(s.dataset.f); }
  });
  document.addEventListener('change', ev => { if (ev.target.id === 'lvAll') render(); if (ev.target.id === 'lvAuto') setAuto(ev.target.checked); });
  root.LIVE = { refresh, render };
})(window);
