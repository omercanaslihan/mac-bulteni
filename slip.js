// Kupon çubuğu: seçimler "+" ile eklenir, ekranın altında toplam oran ve tutma ihtimali görünür.
(function (root) {
  'use strict';
  const KEY = 'mb_slip';
  let legs = []; try { legs = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { legs = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(legs)); } catch (e) { } };
  const same = (a, b) => a.i == b.i && a.k === b.k && String(a.s ?? '') === String(b.s ?? '') && a.n === b.n;
  const $ = id => document.getElementById(id);
  const fx = (v, d = 2) => v.toFixed(d).replace('.', ',');
  let note = '', noteT = null, isOpen = false;
  function flash(t) { note = t; clearTimeout(noteT); noteT = setTimeout(() => { note = ''; update(); }, 3500); }

  function has(i, k, s, n) { return legs.some(L => same(L, { i, k, s, n })); }
  function toggle(L) {
    const ix = legs.findIndex(x => same(x, L));
    if (ix >= 0) legs.splice(ix, 1);
    else { const m = legs.findIndex(x => x.i == L.i); if (m >= 0) { legs[m] = L; flash('Aynı maçtan tek seçim olur; önceki seçim değiştirildi.'); } else legs.push(L); }
    save(); update();
  }
  function set(arr) { legs = arr.slice(); save(); update(); }
  function clear() { legs = []; save(); update(); }
  function open() { isOpen = true; update(); }

  function calc() {
    const A = root.__app; if (!A) return null;
    const R = legs.map(L => ({ L, r: A.resolveLeg(L) }));
    const ok = R.filter(x => x.r), now = Date.now() / 1000;
    const started = ok.filter(x => x.r.e.d <= now + 60);
    const live = ok.filter(x => x.r.e.d > now + 60);
    const O = ok.reduce((t, x) => t * x.r.o[1], 1);
    const P = ok.every(x => x.r.p != null) ? ok.reduce((t, x) => t * x.r.p, 1) : null;
    const F = ok.every(x => x.r.po != null) ? ok.reduce((t, x) => t * x.r.po, 1) : null;
    const mbc = Math.max(0, ...ok.map(x => +x.r.mbc || 0));
    return { R, ok, started, live, O, P, F, mbc, missing: R.length - ok.length };
  }

  function update() {
    const bar = $('slip'); if (!bar) return;
    // "+" düğmelerinin durumu
    document.querySelectorAll('button.add').forEach(b => { const on = has(b.dataset.e, b.dataset.k, b.dataset.s, b.dataset.n); b.classList.toggle('on', on); b.textContent = on ? '✓' : '+'; b.setAttribute('aria-pressed', on); });
    const c = calc();
    if (!legs.length || !c) { bar.hidden = true; document.body.classList.remove('has-slip'); return; }
    bar.hidden = false; document.body.classList.add('has-slip');
    const A = root.__app;
    $('slipSum').innerHTML = `<b>Kupon</b> · ${c.ok.length} maç · oran <b>${fx(c.O)}</b>${c.P != null ? ` · tutma <b>%${fx(c.P * 100, 1)}</b>` : ''}${note ? `<span class="slip-note">${note}</span>` : ''}`;
    $('slipBar').setAttribute('aria-expanded', isOpen);
    const body = $('slipBody'); body.hidden = !isOpen; if (!isOpen) return;
    const warn = [];
    if (c.missing) warn.push(`${c.missing} seçim artık bültende yok (oran kapanmış ya da maç başlamış); hesaba katılmadı.`);
    if (c.started.length) warn.push(`${c.started.length} maç başlamış; iddaa'da artık maç öncesi oynanamaz.`);
    if (c.mbc > c.ok.length) warn.push(`Bu kupon iddaa'da oynanamaz: en yüksek MBS ${c.mbc}, kuponda ${c.ok.length} maç var. ${c.mbc - c.ok.length} maç daha ekle.`);
    const ev = c.P != null ? c.P * c.O - 1 : null;
    body.innerHTML = `
      <div class="slip-list">${c.R.map(({ L, r }, j) => r ? `<div class="slip-leg${r.e.d <= Date.now() / 1000 + 60 ? ' gone' : ''}"><div class="sl-m"><span class="tag">${A.fT.format(new Date(r.e.d * 1000))} · ${r.e.cn}</span><br>${r.e.h} – ${r.e.a}<br><b>${r.lab}</b></div><div class="sl-n"><b>${fx(r.o[1])}</b><br><span class="tag">${r.p != null ? A.pct(r.p) : '–'}${r.mbc ? ' · MBS ' + r.mbc : ''}</span></div><button type="button" class="sl-x" data-j="${j}" aria-label="Çıkar">×</button></div>`
        : `<div class="slip-leg gone"><div class="sl-m">${L.lab || 'Seçim'} <span class="tag">bültende yok</span></div><div class="sl-n"></div><button type="button" class="sl-x" data-j="${j}" aria-label="Çıkar">×</button></div>`).join('')}</div>
      ${warn.length ? `<p class="slip-warn">${warn.join('<br>')}</p>` : ''}
      <div class="slip-tot"><div><b>${fx(c.O)}</b>toplam oran</div>${c.P != null ? `<div><b>%${fx(c.P * 100, 1)}</b>tutma ihtimali</div>` : ''}${c.F != null ? `<div><b>%${fx(c.F * 100, 1)}</b>iddaa fiyatına göre</div>` : ''}${ev != null ? `<div><b class="${ev >= 0 ? 'ok' : 'no'}">${ev >= 0 ? '+' : ''}${Math.round(ev * 100)}%</b>beklenen değer</div>` : ''}</div>
      <p class="slip-hint">Tutma ihtimali her seçimin temkinli olasılığının (bizim tahmin ile iddaa'nın kendi fiyatından düşük olanı) çarpımı; seçimler bağımsız varsayılır. Aynı maçtan tek seçim alınır.</p>
      <div class="slip-act"><button type="button" id="slipSave"${c.live.length && !c.started.length ? '' : ' disabled'}>Performansa kaydet</button><button type="button" id="slipClear">Temizle</button><span id="slipMsg" class="tag"></span></div>`;
  }

  document.addEventListener('click', async ev => {
    const a = ev.target.closest('button.add');
    if (a) { ev.preventDefault(); toggle({ i: +a.dataset.e, k: a.dataset.k, s: a.dataset.s, n: a.dataset.n }); return; }
    if (ev.target.closest('#slipBar')) { isOpen = !isOpen; update(); return; }
    const x = ev.target.closest('.sl-x'); if (x) { legs.splice(+x.dataset.j, 1); save(); update(); return; }
    if (ev.target.id === 'slipClear') { clear(); return; }
    if (ev.target.id === 'slipSave') { const c = calc(); if (!c || !c.ok.length || !root.TRK) return;
      const L = c.ok.map(({ L, r }) => ({ i: r.e.i, k: r.k, s: r.s, n: r.o[0], h: r.e.h, a: r.e.a, d: r.e.d, odd: r.o[1], p: r.p, lab: r.lab }));
      await TRK.saveCoupon(L, c.O, c.P); const m = $('slipMsg'); if (m) m.textContent = 'Kaydedildi. Sonuç Performans sekmesinde "Kuponlarım" satırında.'; }
  });

  root.SLIP = { has, toggle, set, clear, open, update, legs: () => legs.slice() };
})(window);
