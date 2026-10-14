// Performans takibi: tahminler maç başlamadan dondurulur, skor gelince puanlanır. Kayıtlar bu cihazda (IndexedDB).
(function (root) {
  'use strict';
  const DBN = 'mb-track';
  const open = () => new Promise((res, rej) => { const q = indexedDB.open(DBN, 1); q.onupgradeneeded = () => { const s = q.result.createObjectStore('r', { keyPath: 'id' }); s.createIndex('i', 'i'); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const done = tx => new Promise(r => { tx.oncomplete = r; tx.onerror = r; tx.onabort = r; });
  async function all() { try { const db = await open(); return await new Promise((res, rej) => { const q = db.transaction('r').objectStore('r').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return []; } }

  // recs: o anki tahminler (sadece başlamamış maçlar). preIds: bu yüklemede başlamamış görülen maçlar.
  async function capture(recs, preIds) {
    try { const db = await open(); const old = new Map((await all()).map(r => [r.id, r]));
      const tx = db.transaction('r', 'readwrite'); const st = tx.objectStore('r'); const now = Math.round(Date.now() / 1000);
      const keep = new Set(recs.map(r => r.id));
      // Başlamamış maçlarda artık işaretli olmayan ★/◆ ve eski banko seçimleri silinir: değerlendirilen set = maç öncesi son görünüm
      for (const r of old.values()) if (preIds.has(r.i) && r.d > now && !keep.has(r.id)) st.delete(r.id);
      for (const r of recs) { let o = old.get(r.id); if (o && o.d <= now) continue; if (o && (o.k !== r.k || String(o.s) !== String(r.s) || o.n !== r.n)) o = null;
        r.odd0 = o ? (o.odd0 ?? o.odd) : r.odd; r.p0 = o ? (o.p0 ?? o.p) : r.p; r.at0 = o ? (o.at0 ?? o.at) : now; r.at = now; r.res = null; st.put(r); }
      await done(tx); } catch (e) { }
  }

  const FIN = new Set(['FT', 'AET', 'PEN']);
  const FTONLY = new Set(['1_1', '2_92', '2_100', '2_101', '2_603', '2_604', '2_7', '2_89', '2_91', '2_698', '2_700', '2_4', '2_86', '2_11', '2_643', '2_644']);
  const STATK = new Set(['2_912', '2_913', '2_822', '2_823', '2_48']);
  function judgeStat(r, x) { const S = x.stat; if (!S) return null;
    if (r.k === '2_912' || r.k === '2_913') { const v = r.k === '2_912' ? S.sh : S.sot; if (!v || v[0] == null) return null; const m = String(r.n).match(/^(.*) (\d+)\+$/); if (!m) return null;
      const who = m[1], k = +m[2]; const val = who === 'Toplam' ? v[0] + v[1] : who === r.h ? v[0] : who === r.a ? v[1] : null; return val == null ? null : val >= k; }
    const c = S.co; if (!c || c[0] == null) return null; const val = r.k === '2_822' ? c[0] : r.k === '2_823' ? c[1] : c[0] + c[1];
    return r.n === 'Üst' ? val > +r.s : r.n === 'Alt' ? val < +r.s : null; }
  function judge(r, x) { // x: {st, fh, fa, hh, ha, stat}
    if (!x || !FIN.has(x.st) || x.fh == null) return null;
    if (STATK.has(r.k)) return judgeStat(r, x);
    if (r.t === 'cs') return r.cs.some(c => c[0] === x.fh + ':' + x.fa);
    if (r.t === 'ms') return x.fh > x.fa ? 0 : x.fh === x.fa ? 1 : 2;
    if (!root.BLD || !BLD.GOALKEYS.has(r.k)) return null;
    let st = null; if (x.hh != null && x.ha != null) st = [x.hh, x.ha, x.fh - x.hh, x.fa - x.ha]; else if (FTONLY.has(r.k)) st = [0, 0, x.fh, x.fa]; if (!st) return null;
    const v = BLD.goalPred(r.k, r.n, r.s, st, 1); return v === undefined ? null : v;
  }
  // results: Map maçId → skor nesnesi
  async function settle(results) {
    try { const db = await open(); const rs = await all(); const tx = db.transaction('r', 'readwrite'); const st = tx.objectStore('r'); let n = 0;
      for (const r of rs) { if (r.res != null || r.t !== 'kupon') continue; let all = true, lost = false;
        for (const l of r.legs) { const x = results.get(l.i); const v = x ? judge(l, x) : null; if (v === false) lost = true; else if (v !== true) all = false; }
        if (lost || all) { r.res = !lost; r.settledAt = Math.round(Date.now() / 1000); st.put(r); n++; } }
      for (const r of rs) { if (r.res != null || r.t === 'kupon') continue; const x = results.get(r.i); if (!x) continue; const v = judge(r, x); if (v == null) { if (FIN.has(x.st) && !(STATK.has(r.k) && !x.stat)) { r.res = 'na'; r.sc = x.fh + ':' + x.fa; st.put(r); } continue; }
        r.res = v; r.sc = x.fh + ':' + x.fa; r.settledAt = Math.round(Date.now() / 1000); st.put(r); n++; }
      await done(tx); return n; } catch (e) { return 0; }
  }
  function needStat(r) { return STATK.has(r.k) && r.res == null; }
  async function saveCoupon(legs, odd, p) { try { const db = await open(); const tx = db.transaction('r', 'readwrite'); const now = Math.round(Date.now() / 1000);
      const d = Math.max(...legs.map(l => l.d)); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Math.min(...legs.map(l => l.d)) * 1000));
      tx.objectStore('r').put({ id: 'kupon|' + now + '|' + Math.random().toString(36).slice(2, 7), t: 'kupon', i: null, d, day, legs, lab: legs.length + ' maç: ' + legs.map(l => l.lab).join(' + '), cn: '', h: '', a: '', big: legs.some(l => l.big) ? 1 : 0, p: p ?? null, fp: null, odd, odd0: odd, at: now, at0: now, res: null });
      await done(tx); } catch (e) { } }
  async function pending() { const now = Date.now() / 1000; const out = []; for (const r of await all()) { if (r.res != null || r.d > now - 2.5 * 3600 || r.d < now - 10 * 86400) continue; if (r.t === 'kupon') { for (const l of r.legs) if (l.d < now - 2.5 * 3600) out.push({ i: l.i, d: l.d, h: l.h, a: l.a }); } else out.push(r); } return out; }

  // ---------- Görünüm ----------
  const pct = p => p == null || isNaN(p) ? '–' : '%' + (p * 100).toFixed(1).replace('.', ',');
  const sg = x => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',');
  const ll = (p, y) => -Math.log(Math.min(0.995, Math.max(0.005, y ? p : 1 - p)));
  function stats(rs) { const S = rs.filter(r => r.res === true || r.res === false); const n = S.length; if (!n) return { n: 0 };
    const w = S.filter(r => r.res).length, exp = S.reduce((t, r) => t + r.p, 0) / n, u = S.reduce((t, r) => t + (r.res ? r.odd - 1 : -1), 0);
    const F = S.filter(r => r.fp != null); const llU = F.length ? F.reduce((t, r) => t + ll(r.p, r.res), 0) / F.length : null, llM = F.length ? F.reduce((t, r) => t + ll(r.fp, r.res), 0) / F.length : null;
    const M = rs.filter(r => r.odd0 && r.odd && r.odd0 !== r.odd); const mv = rs.length ? rs.reduce((t, r) => t + (r.odd0 / r.odd - 1), 0) / rs.length : 0;
    return { n, w, hit: w / n, exp, u, roi: u / n, llU, llM, nF: F.length, mv, nMv: M.length, odd: S.reduce((t, r) => t + r.odd, 0) / n }; }
  function msStats(rs) { const S = rs.filter(r => typeof r.res === 'number'); if (!S.length) return null; let a = 0, b = 0, ha = 0, hb = 0;
    for (const r of S) { a -= Math.log(Math.max(1e-3, r.pm[r.res])); b -= Math.log(Math.max(1e-3, r.pf[r.res])); ha += r.pm.indexOf(Math.max(...r.pm)) === r.res; hb += r.pf.indexOf(Math.max(...r.pf)) === r.res; }
    return { n: S.length, llU: a / S.length, llM: b / S.length, hitU: ha / S.length, hitM: hb / S.length }; }

  function curve(rs) { const S = rs.filter(r => r.res === true || r.res === false).sort((a, b) => a.d - b.d); if (S.length < 2) return '';
    let c = 0; const pts = S.map(r => (c += r.res ? r.odd - 1 : -1)); const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts); const W = 640, H = 170, L = 40, R = 10, T = 12, B = 22;
    const x = k => L + (W - L - R) * k / (pts.length - 1), y = v => T + (H - T - B) * (hi - v) / Math.max(1e-9, hi - lo);
    const step = Math.max(1, Math.ceil((hi - lo) / 4)); let g = ''; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${v === 0 ? 1.5 : 1}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const d = 'M' + pts.map((v, k) => x(k).toFixed(1) + ',' + y(v).toFixed(1)).join('L'); const e = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Birikimli banko sonucu">${g}<path d="${d}" fill="none" stroke="var(--model)" stroke-width="2"/><circle cx="${x(pts.length - 1)}" cy="${y(e)}" r="3.5" fill="var(--model)"/><text x="${x(pts.length - 1) - 6}" y="${y(e) - 8}" text-anchor="end" style="fill:var(--ink);font-weight:600">${sg(e)}</text><text x="${L}" y="${H - 6}">${S.length} banko</text></svg>`; }

  let scopeBig = false;
  async function render(el) {
    const A = await all(); const rs = scopeBig ? A.filter(r => r.big) : A;
    const by = t => rs.filter(r => r.t === t);
    const first = A.length ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(Math.min(...A.map(r => r.at0 || r.at)) * 1000)) : null;
    const nowS = Date.now() / 1000, nOpen = new Set(rs.filter(r => r.res == null && r.d > nowS).map(r => r.i)).size, wait = new Set(rs.filter(r => r.res == null && r.d <= nowS).map(r => r.i)).size;
    const row = (name, t, note) => { const s = stats(by(t)); if (!s.n) return `<tr><td>${name}</td><td class="n">0</td><td colspan="6" class="na">Henüz sonuçlanan yok${note ? ' · ' + note : ''}</td></tr>`;
      return `<tr><td>${name}</td><td class="n">${s.n}</td><td class="n">${pct(s.exp)}</td><td class="n"><b>${pct(s.hit)}</b></td><td class="n">${t === 'cs' ? '–' : s.odd.toFixed(2)}</td><td class="n ${t === 'cs' ? '' : s.u >= 0 ? 'ok' : 'no'}">${t === 'cs' ? '–' : sg(s.u)}</td><td class="n">${s.llU != null ? `${s.llU.toFixed(3)} / ${s.llM.toFixed(3)}` : '–'}</td><td class="n">${t === 'cs' ? '–' : (s.mv >= 0 ? '+' : '') + (100 * s.mv).toFixed(1).replace('.', ',') + '%'}</td></tr>`; };
    const ms = msStats(by('ms'));
    const B = by('banko'); const bands = [[0, .6], [.6, .65], [.65, .7], [.7, .75], [.75, .8], [.8, 1.01]].map(([lo, hi]) => { const s = stats(B.filter(r => r.p >= lo && r.p < hi)); return { lo, hi, ...s }; }).filter(b => b.n);
    const days = {}; for (const r of B) if (r.res === true || r.res === false) (days[r.day] ||= []).push(r);
    const C = by('cs'); const csDay = {}; for (const r of C) if (r.res === true || r.res === false) (csDay[r.day] ||= []).push(r);
    const dayRows = Object.keys(days).sort().reverse().map(k => { const s = stats(days[k]); const c = csDay[k] || []; return `<tr><td>${new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(k + 'T12:00:00Z'))}</td><td class="n">${s.n}</td><td class="n">${pct(s.exp)}</td><td class="n"><b>${pct(s.hit)}</b></td><td class="n ${s.u >= 0 ? 'ok' : 'no'}">${sg(s.u)}</td><td class="n">${c.length ? c.filter(r => r.res).length + '/' + c.length : '–'}</td></tr>`; }).join('');
    el.innerHTML = `
      <div class="pf-head"><p>${first ? `Kayıt ${first} tarihinden beri bu cihazda tutuluyor.` : 'Henüz kayıt yok: uygulama her açıldığında başlamamış maçların tahminleri kaydedilir.'} ${nOpen} maç henüz başlamadı, ${wait} maçın sonucu bekleniyor. Şut ve korner, maç bitince API-Football istatistiğinden puanlanır (büyük 7 lig).</p>
        <div class="chips" role="group" aria-label="Kapsam"><button type="button" data-pf="all" aria-pressed="${!scopeBig}">Tüm ligler</button><button type="button" data-pf="big" aria-pressed="${scopeBig}">Büyük 7 lig</button></div></div>
      <div class="tbl"><table><thead><tr><th>Tahmin</th><th class="n">Sonuçlanan</th><th class="n">Beklenen</th><th class="n">Tuttu</th><th class="n">Ort. oran</th><th class="n">Birim</th><th class="n" title="Bizim olasılık / iddaa adil olasılığı. Küçük olan daha isabetli.">Log-loss biz / piyasa</th><th class="n" title="Seçtiğimiz oran ilk görüldüğünden maç saatine kadar ne kadar düştü. Artı = piyasa bizim yönümüze geldi.">Oran hareketi</th></tr></thead><tbody>
        ${row('Kuponlarım', 'kupon', 'alttaki kupondan kaydedilenler')}${row('Banko (1,30+)', 'banko')}${row('<span class="st">★</span> Model (şut)', 'star', 'maç istatistiği bekleniyor')}${row('<span class="di">◆</span> Piyasa', 'dia')}${row('Skor (3 skordan biri)', 'cs')}${row('Şut modeli (bütün çizgiler)', 'sut', 'büyük 7 lig')}${row('Korner modeli (bütün çizgiler)', 'kor', 'büyük 7 lig')}
      </tbody></table></div>
      <p class="pf-note">${ms ? `<b>Piyasayı geçiyor muyuz? (büyük 7 lig, MS, ${ms.n} maç)</b> En olası sonuç bizde ${pct(ms.hitU)}, iddaa'da ${pct(ms.hitM)} tuttu. Log-loss bizde ${ms.llU.toFixed(4)}, iddaa'da ${ms.llM.toFixed(4)} (küçük olan daha isabetli; ${ms.llU < ms.llM ? 'şu an biz öndeyiz' : 'şu an piyasa önde'}). Anlamlı fark için birkaç yüz maç gerekir.` : '<b>Piyasayı geçiyor muyuz?</b> Büyük 7 ligde MS tahminimiz ile iddaa\'nın adil olasılığı her maçta karşılaştırılacak; ilk maçlar bitince burada görünür.'}</p>
      <div class="pf-grid">
        <div><h3>Banko kalibrasyonu</h3>${bands.length ? `<div class="tbl"><table><thead><tr><th>Olasılık</th><th class="n">Banko</th><th class="n">Beklenen</th><th class="n">Tuttu</th><th class="n">Birim</th></tr></thead><tbody>${bands.map(b => `<tr><td>${b.lo === 0 ? '%60 altı' : b.hi > 1 ? '%80+' : `%${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}`}</td><td class="n">${b.n}</td><td class="n">${pct(b.exp)}</td><td class="n"><b>${pct(b.hit)}</b></td><td class="n ${b.u >= 0 ? 'ok' : 'no'}">${sg(b.u)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="na">Sonuçlanan banko yok.</p>'}</div>
        <div><h3>Birikimli banko sonucu (1 birim, iddaa oranı)</h3>${curve(B) || '<p class="na">En az iki sonuçlanan banko gerekiyor.</p>'}</div>
      </div>
      ${dayRows ? `<h3>Gün gün</h3><div class="tbl"><table><thead><tr><th>Gün</th><th class="n">Banko</th><th class="n">Beklenen</th><th class="n">Tuttu</th><th class="n">Birim</th><th class="n">Skor tuttu</th></tr></thead><tbody>${dayRows}</tbody></table></div>` : ''}
      <div class="pf-foot"><button type="button" id="pfCsv">CSV indir</button><span class="na">Bütün kayıtlar (Excel'de açılır). Kayıtlar sadece bu cihazda; tarayıcı verisini silersen gider.</span></div>`;
    el.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { scopeBig = b.dataset.pf === 'big'; render(el); });
    el.querySelector('#pfCsv').onclick = async () => { const R = await all(); const cols = ['day', 'cn', 'h', 'a', 't', 'lab', 'p', 'fp', 'odd0', 'odd', 'res', 'sc', 'big'];
      const esc = v => { v = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const csv = '﻿' + ['gün;lig;ev;deplasman;tür;tahmin;olasılık;piyasa;ilk oran;son oran;sonuç;skor;büyük lig'].concat(R.filter(r => r.t !== 'ms').sort((a, b) => a.d - b.d).map(r => cols.map(c => esc(c === 'res' ? (r.res === true ? 'tuttu' : r.res === false ? 'yattı' : '') : r[c])).join(';'))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'mac-bulteni-takip.csv'; document.body.appendChild(a); a.click(); a.remove(); };
  }
  root.TRK = { capture, settle, pending, all, render, judge, needStat, STATK, saveCoupon };
})(window);
