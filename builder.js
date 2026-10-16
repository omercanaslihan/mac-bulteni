// Maç Bülteni motoru: iddaa ham verisinden bülten satırlarını üretir.
// Tarayıcıda (window.BLD) ve Node'da (doğrulama için) çalışır.
(function (root) {
  'use strict';
  const LG = []; { let s = 0; LG.push(0); for (let k = 1; k <= 200; k++) { s += Math.log(k); LG.push(s); } }
  const lgam = k => LG[k] ?? 0;
  const pois = (m, K) => { const o = []; m = Math.max(m, 1e-9); for (let k = 0; k <= K; k++) o.push(Math.exp(-m + k * Math.log(m) - lgam(k))); const s = o.reduce((a, b) => a + b, 0); return o.map(x => x / s); };
  function nbPmf(m, phi, K) { const out = []; if (phi <= 1.0001) { for (let k = 0; k <= K; k++) out.push(Math.exp(-m + k * Math.log(m) - lgam(k))); return out; }
    const r = m / (phi - 1), p = r / (r + m); let lg = 0; for (let k = 0; k <= K; k++) { if (k > 0) lg += Math.log(k - 1 + r) - Math.log(k); out.push(Math.exp(lg + r * Math.log(p) + k * Math.log(1 - p))); } return out; }
  const nb = (m, phi, K) => { const o = nbPmf(Math.max(m, 0.05), phi, K); const s = o.reduce((a, b) => a + b, 0); return o.map(x => x / s); };
  const ge = (pmf, k) => { let s = 0; for (let i = Math.max(0, k); i < pmf.length; i++) s += pmf[i]; return s; };
  function diffProbs(pa, pb) { let w = 0, d = 0, l = 0; for (let i = 0; i < pa.length; i++) for (let j = 0; j < pb.length; j++) { const p = pa[i] * pb[j]; if (i > j) w += p; else if (i === j) d += p; else l += p; } return [w, d, l]; }
  function handi(pa, pb, h) { let w = 0; for (let i = 0; i < pa.length; i++) for (let j = 0; j < pb.length; j++) if (i + h > j) w += pa[i] * pb[j]; return w; }

  // Power-method devig: p_i ∝ (1/o_i)^k, Σ=1
  function devig(odds) { const inv = odds.map(o => 1 / o); let lo = 0.5, hi = 3; for (let i = 0; i < 60; i++) { const k = (lo + hi) / 2; const s = inv.reduce((t, p) => t + Math.pow(p, k), 0); if (s > 1) lo = k; else hi = k; }
    const k = (lo + hi) / 2; const p = inv.map(x => Math.pow(x, k)); const s = p.reduce((a, b) => a + b, 0); return p.map(x => x / s); }

  function fast(l, u) { const a = pois(l, 10), b = pois(u, 10); let H = 0, A = 0, O = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const v = a[i] * b[j]; if (i > j) H += v; else if (j > i) A += v; if (i + j > 2) O += v; } return { H, A, O }; }
  function implied(pH, pA, pO) { const err = (l, u) => { const s = fast(l, u); let e = (s.H - pH) ** 2 + (s.A - pA) ** 2; if (pO != null) e += (s.O - pO) ** 2; return e; };
    let best = [1.4, 1.1], be = 1e9; for (let l = 0.2; l <= 4.6; l += 0.2) for (let u = 0.2; u <= 4.6; u += 0.2) { const e = err(l, u); if (e < be) { be = e; best = [l, u]; } }
    let [l, u] = best, st = 0.1; for (let it = 0; it < 40; it++) { let mv = false; for (const [dl, du] of [[st, 0], [-st, 0], [0, st], [0, -st]]) { const nl = l + dl, nu = u + du; if (nl < 0.05 || nu < 0.05) continue; const e = err(nl, nu); if (e < be) { be = e; l = nl; u = nu; mv = true; } } if (!mv) st /= 2; if (st < 1e-4) break; }
    return { lam: l, mu: u, err: Math.sqrt(be) }; }

  // Joint first-half / second-half goal states: [hHT, aHT, h2H, a2H, p]
  function goalStates(lam, mu, ht) { const K = 7; const a1 = pois(lam * ht, K), b1 = pois(mu * ht, K), a2 = pois(lam * (1 - ht), K), b2 = pois(mu * (1 - ht), K); const S = [];
    for (let i = 0; i <= K; i++) for (let j = 0; j <= K; j++) { const p1 = a1[i] * b1[j]; if (p1 < 1e-7) continue; for (let k = 0; k <= K; k++) for (let l = 0; l <= K; l++) { const p = p1 * a2[k] * b2[l]; if (p < 1e-8) continue; S.push([i, j, k, l, p]); } }
    const t = S.reduce((s, x) => s + x[4], 0); S.forEach(x => x[4] /= t); return S; }

  const r3 = (a, b) => a > b ? '1' : a === b ? '0' : '2';
  const YES = n => n === 'Evet' || n === 'Var' ? true : n === 'Hayır' || n === 'Yok' ? false : undefined;
  const ou = (v, n, s) => n === 'Üst' ? v > s : n === 'Alt' ? v < s : undefined;
  const dc = (r, n) => n === '1 ve 0' ? r !== '2' : n === '0 ve 2' ? r !== '1' : n === '1 ve 2' ? r !== '0' : undefined;
  const yn = (cond, n) => { const y = YES(n); return y === undefined ? undefined : (y ? cond : !cond); };
  const both = (a, b, n) => { const p = n.split(' ve '); if (p.length !== 2) return undefined; const x = a(p[0]), y = b(p[1]); return x === undefined || y === undefined ? undefined : x && y; };
  const score = (n, h, a) => { const m = n.match(/^(\d+)[:-](\d+)$/); return m ? (+m[1] === h && +m[2] === a) : undefined; };

  // Does outcome n of market key (line s) happen in state st? true/false, or undefined if unknown outcome.
  function goalPred(key, n, s, st, HC) {
    const [i, j, k, l] = st, H = i + k, A = j + l, T = H + A, R = r3(H, A), R1 = r3(i, j);
    switch (key) {
      case '1_1': return ['0', '1', '2'].includes(n) ? R === n : undefined;
      case '2_92': return dc(R, n);
      case '2_77': return dc(R1, n);
      case '2_100': { const h = HC * (+s); return ['0', '1', '2'].includes(n) ? r3(H + h, A) === n : undefined; }
      case '2_101': return ou(T, n, +s);
      case '2_603': return ou(H, n, +s);
      case '2_604': return ou(A, n, +s);
      case '2_60': return ou(i + j, n, +s);
      case '2_722': return ou(i, n, +s);
      case '2_723': return ou(j, n, +s);
      case '2_7': return both(x => R === x, x => ou(T, x, +s), n);
      case '2_724': return both(x => R1 === x, x => ou(i + j, x, +s), n);
      case '2_89': return yn(H > 0 && A > 0, n);
      case '2_720': return yn(i > 0 && j > 0, n);
      case '2_821': return yn(k > 0 && l > 0, n);
      case '2_91': return n === 'Tek' ? T % 2 === 1 : n === 'Çift' ? T % 2 === 0 : undefined;
      case '2_719': return n === 'Tek' ? (i + j) % 2 === 1 : n === 'Çift' ? (i + j) % 2 === 0 : undefined;
      case '2_88': return ['0', '1', '2'].includes(n) ? R1 === n : undefined;
      case '2_36': return ['0', '1', '2'].includes(n) ? r3(k, l) === n : undefined;
      case '2_698': return both(x => R === x, x => YES(x) === undefined ? undefined : YES(x) === (H > 0 && A > 0), n);
      case '2_699': return both(x => R1 === x, x => YES(x) === undefined ? undefined : YES(x) === (i > 0 && j > 0), n);
      case '2_700': return both(x => ou(T, x, +s), x => YES(x) === undefined ? undefined : YES(x) === (H > 0 && A > 0), n);
      case '2_4': { const m = n.match(/^(\d+)(?:-(\d+))?(\+)? gol$/); if (!m) return undefined; return m[3] ? T >= +m[1] : (T >= +m[1] && T <= +(m[2] ?? m[1])); }
      case '2_6': { const a = i + j, b = k + l; return n === '1.' ? a > b : n === '2.' ? b > a : n === 'Eşit' ? a === b : undefined; }
      case '2_84': return n === '1.' ? i > k : n === '2.' ? k > i : n === 'Eşit' ? i === k : undefined;
      case '2_85': return n === '1.' ? j > l : n === '2.' ? l > j : n === 'Eşit' ? j === l : undefined;
      case '2_729': return yn(i + j <= 1 && k + l <= 1, n);
      case '2_730': return yn(i + j >= 2 && k + l >= 2, n);
      case '2_861': return yn(i > 0 && k > 0, n);
      case '2_862': return yn(j > 0 && l > 0, n);
      case '2_866': { const p = n.split(' / '); if (p.length !== 2) return undefined; const a = YES(p[0]), b = YES(p[1]); if (a === undefined || b === undefined) return undefined; return a === (i > 0 && j > 0) && b === (k > 0 && l > 0); }
      case '2_86': return score(n, H, A);
      case '2_717': return score(n, i, j);
      case '2_718': { const m = n.match(/^(\d+)-(\d+) (\d+)-(\d+)$/); return m ? (+m[1] === i && +m[2] === j && +m[3] === H && +m[4] === A) : undefined; }
      case '2_90': { const p = n.split('/'); return p.length === 2 ? R1 === p[0] && R === p[1] : undefined; }
      case '2_11': { if (n === '0') return H === A; const m = n.match(/^(Ev|Dep) (\d+)(\+)?$/); if (!m) return undefined; const d = m[1] === 'Ev' ? H - A : A - H; return m[3] ? d >= +m[2] : d === +m[2]; }
      case '2_69': return yn(i > j && k > l, n);
      case '2_72': return yn(j > i && l > k, n);
      case '2_727': return yn(i > j || k > l, n);
      case '2_728': return yn(j > i || l > k, n);
      case '2_643': return yn(H > A && A === 0, n);
      case '2_644': return yn(A > H && H === 0, n);
    }
    return undefined;
  }
  const GOALKEYS = new Set(['1_1', '2_92', '2_77', '2_100', '2_101', '2_603', '2_604', '2_60', '2_722', '2_723', '2_7', '2_724', '2_89', '2_720', '2_821', '2_91', '2_719', '2_88', '2_36', '2_698', '2_699', '2_700', '2_4', '2_6', '2_84', '2_85', '2_729', '2_730', '2_861', '2_862', '2_866', '2_86', '2_717', '2_718', '2_90', '2_11', '2_69', '2_72', '2_727', '2_728', '2_643', '2_644']);
  function goalProb(key, n, s, states, HC) { let p = 0; for (const st of states) { const v = goalPred(key, n, s, st, HC); if (v === undefined) return null; if (v) p += st[4]; } return p; }

  // First-half share of goals from the İY markets
  function fitHT(lam, mu, mk) { const iy = mk.find(m => m[0] === '2_88'); const iyou = mk.filter(m => m[0] === '2_60' && m[2].length === 2 && m[2].every(o => o[1] > 1.01));
    const tgt = []; if (iy && iy[2].length === 3 && iy[2].every(o => o[1] > 1.01)) { const p = devig(iy[2].map(o => o[1])); iy[2].forEach((o, x) => tgt.push(['r', o[0], p[x]])); }
    // Backtest-matched: İY sonucu alone; İY 1,5 alt/üst only when İY sonucu is missing
    if (!tgt.length) for (const m of iyou) { if (+m[1] !== 1.5) continue; const p = devig(m[2].map(o => o[1])); m[2].forEach((o, x) => { if (o[0] === 'Üst') tgt.push(['o', +m[1], p[x]]); }); }
    if (!tgt.length) return 0.44; let best = 0.44, be = 1e9;
    for (let ht = 0.30; ht <= 0.60001; ht += 0.01) { const a = pois(lam * ht, 10), b = pois(mu * ht, 10); let e = 0;
      for (const [t, n, p] of tgt) { let q = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const v = a[i] * b[j]; if (t === 'r' ? r3(i, j) === n : i + j > n) q += v; } e += (q - p) ** 2; }
      if (e < be) { be = e; best = +ht.toFixed(2); } }
    return best; }

  const norm = s => String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(fc|sk|ac|as|afc|cf|sc|fk|ssc|us|rc|ogc|vfb|vfl|tsg|1\.|ca|cd|ud|rcd|sd|jk|bk|ss|calcio|club|de|kulubu|a s)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // iddaa Türkçe/kısa adları → SofaScore adlarındaki kelimeler
  const ALIAS = { marsilya: 'marseille', monchengladbach: 'gladbach', 'm gladbach': 'gladbach', santander: 'racing', rennes: 'rennais', munih: 'munchen', lyon: 'lyonnais', monako: 'monaco', 'sporting gijon': 'gijon', 'paris sg': 'paris saint germain', psg: 'paris saint germain', 'athletic bilbao': 'athletic', 'man united': 'manchester united', 'man city': 'manchester city', wolves: 'wolverhampton', 'nottingham': 'nottingham forest', 'istanbul basaksehir': 'basaksehir', 'kasimpasa': 'kasimpasa', 'amedspor': 'amed sportif', 'erokspor': 'esenler erokspor' };
  const alias = n => { for (const [k, v] of Object.entries(ALIAS)) n = n.replace(new RegExp('\\b' + k + '\\b', 'g'), v); return n.replace(/\s+/g, ' ').trim(); };
  function matchTeam(T, name) { const n = alias(norm(name)); let best = null, bs = 0;
    for (const [id, tn] of Object.entries(T || {})) { const m = alias(norm(tn)); let s = 0; if (m === n) s = 10; else { const a = n.split(' ').filter(w => w.length > 2), b = m.split(' ').filter(w => w.length > 2); for (const w of b) if (a.some(x => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))) s += 1; }
      if (s > bs) { bs = s; best = [+id, tn]; } } return bs > 0 ? best : null; }

  function rates(model, home, away) { const a = model.a, d = model.d; if (!(home in a) || !(away in a)) return null; return { lam: Math.exp(model.c + model.h + a[home] - d[away]), mu: Math.exp(model.c + a[away] - d[home]) }; }

  // Stats-model probabilities for a big-league match (port of the notebook compute())
  function modelProbs(M, lgk, hid, aid, hName, aName, mk) {
    const X = M.X[lgk]; const Ph = M.PHI, ADJ = M.ADJ, HC = 1, CC = 1; const PHX = 1.15;
    const gr = rates(X.goals, hid, aid); if (!gr) return null; const sh = gr.lam / (gr.lam + gr.mu);
    const rate = (mod, k) => { const r = rates(mod, hid, aid); if (!r) return null; if (ADJ[k]) { const [a, b] = ADJ[k]; return [r.lam * Math.exp(a + b * (sh - 0.5)), r.mu * Math.exp(a + b * (0.5 - sh))]; } if (Ph[k]) return [r.lam * Ph[k].bias, r.mu * Ph[k].bias]; return [r.lam, r.mu]; };
    const mean = { sh: rate(X.sh, 'sh'), sot: rate(X.sot, 'sot'), co: rate(X.co, 'co'), fo: rate(X.fo, 'fo'), off: rate(X.off, 'off'), yc: rate(X.yc, 'yc') };
    const states = goalStates(gr.lam, gr.mu, X.ht); const K = 40;
    const co = mean.co, cH = nb(co[0], Ph.co.phiTeam, K), cA = nb(co[1], Ph.co.phiTeam, K), cT = nb(co[0] + co[1], Ph.co.phiTotal, 60);
    const cH1 = nb(co[0] * X.coHT, Ph.co.phiTeam, K), cA1 = nb(co[1] * X.coHT, Ph.co.phiTeam, K), cT1 = nb((co[0] + co[1]) * X.coHT, Ph.co.phiTotal, K);
    const yc = mean.yc; const yT = nb(yc[0] + yc[1], PHX, K), yT1 = nb((yc[0] + yc[1]) * X.ycHT, PHX, K), yH = nb(yc[0], PHX, K), yA = nb(yc[1], PHX, K);
    const ouP = (pmf, n, s) => n === 'Üst' ? ge(pmf, Math.floor(+s) + 1) : n === 'Alt' ? 1 - ge(pmf, Math.floor(+s) + 1) : null;
    const parity = (pmf, n) => { let o = 0; for (let i = 1; i < pmf.length; i += 2) o += pmf[i]; return n === 'Tek' ? o : n === 'Çift' ? 1 - o : null; };
    const rng = (pmf, n) => { const m = n.match(/^(\d+)-(\d+)$/); if (m) { let s = 0; for (let i = +m[1]; i <= +m[2]; i++) s += pmf[i] || 0; return s; } const m2 = n.match(/^(\d+)\+$/); return m2 ? ge(pmf, +m2[1]) : null; };
    const who3 = (pa, pb, n) => { const [w, dd, l] = diffProbs(pa, pb); return n === '1' ? w : n === '0' ? dd : n === '2' ? l : null; };
    const plus = (st, phT, phTot, n) => { const m = n.match(/^(.*) (\d+)\+$/); if (!m || m[1].startsWith('İY ')) return null; const who = m[1], k = +m[2]; const v = mean[st]; if (!v) return null;
      const mm = who === 'Toplam' ? v[0] + v[1] : who === hName ? v[0] : who === aName ? v[1] : null; if (mm == null) return null; return ge(nb(mm, who === 'Toplam' ? phTot : phT, 90), k); };
    const P = {};
    for (const [key, s, os] of mk) { const row = P[key + '|' + s] = {};
      for (const [n] of os) { let p = null;
        if (GOALKEYS.has(key)) p = goalProb(key, n, s, states, HC);
        else switch (key) {
          case '2_48': p = ouP(cT, n, s); break; case '2_822': p = ouP(cH, n, s); break; case '2_823': p = ouP(cA, n, s); break; case '2_49': p = ouP(cT1, n, s); break;
          case '2_67': case '2_68': p = rng(key === '2_67' ? cT : cT1, n); break; case '2_737': p = parity(cT, n); break;
          case '2_52': p = who3(cH, cA, n); break; case '2_53': p = who3(cH1, cA1, n); break;
          case '2_863': case '2_864': { const h = CC * (+s); const w = handi(key === '2_863' ? cH : cH1, key === '2_863' ? cA : cA1, h); p = n === '1' ? w : n === '2' ? 1 - w : null; break; }
          case '2_56': { const p0 = cT[0]; const f = co[0] / (co[0] + co[1]); p = n === 'Olmaz' ? p0 : n === '1' ? (1 - p0) * f : n === '2' ? (1 - p0) * (1 - f) : null; break; }
          case '2_912': p = plus('sh', Ph.sh.phiTeam, Ph.sh.phiTotal, n); break; case '2_913': p = plus('sot', Ph.sot.phiTeam, Ph.sot.phiTotal, n); break;
          case '2_914': p = plus('fo', PHX, PHX, n); break; case '2_915': p = plus('off', PHX, PHX, n); break;
          case '2_658': p = ouP(yT, n, s); break; case '2_865': p = ouP(yT1, n, s); break; case '2_824': p = who3(yH, yA, n); break;
        }
        row[n] = p == null || !isFinite(p) ? null : +p.toFixed(4); } }
    const r1 = v => v ? [+v[0].toFixed(1), +v[1].toFixed(1)] : null;
    return { P, states, xg: [+gr.lam.toFixed(2), +gr.mu.toFixed(2)], mean: { sh: r1(mean.sh), sot: r1(mean.sot), co: r1(mean.co), fo: r1(mean.fo), off: r1(mean.off), yc: r1(mean.yc) } };
  }

  // Maç sonu skor dağılımı: 'h:a' → olasılık
  function scoreDist(states) { const D = {}; for (const [i, j, k, l, p] of states) { const key = (i + k) + ':' + (j + l); D[key] = (D[key] || 0) + p; } return D; }
  // En olası 3 skor: piyasadan çıkarılan gol beklentisi (+ büyük liglerde %25 model, + iddaa skor pazarı varsa %50)
  // Dixon–Coles düşük skor düzeltmesi (rho=-0,1): 0–0 ve 1–1 bağımsız Poisson'da az çıkıyor.
  // Geri test (2.817 maç): beraberlik %22,8→%24,9 (gerçek %26,1), 3 skor isabeti %33,7→%35,0, skor log-loss 2,8749→2,8734.
  const DC_RHO = -0.1;
  function dcAdjust(D, lam, mu) { if (!D || !(lam > 0) || !(mu > 0)) return D; const r = DC_RHO; const f = { '0:0': 1 - lam * mu * r, '0:1': 1 + lam * r, '1:0': 1 + mu * r, '1:1': 1 - r };
    const out = {}; let T = 0; for (const [k, p] of Object.entries(D)) { const v = p * (f[k] ?? 1); out[k] = v; T += v; } for (const k in out) out[k] /= T; return out; }
  function topScores(mkt, mod, mk) { const D = {}; const add = (src, w) => { for (const [k, p] of Object.entries(src)) D[k] = (D[k] || 0) + w * p; };
    let wM = 1; if (mod) { add(mod, 0.25); wM = 0.75; }
    const cs = mk.find(m => m[0] === '2_86' && m[2].length >= 10 && m[2].every(o => o[1] > 1.01));
    if (cs && mkt) { const pr = devig(cs[2].map(o => o[1])); const S = {}; cs[2].forEach((o, x) => { if (/^\d+:\d+$/.test(o[0])) S[o[0]] = pr[x]; }); add(mkt, wM * 0.5); add(S, wM * 0.5); }
    else if (mkt) add(mkt, wM); else if (mod) add(mod, 0.75);
    return Object.entries(D).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, p]) => [k, +p.toFixed(3)]); }

  // raw: iddaa event {i, ci, d, hn, an, m:[{t, st, sov, o:[{n, odd}]}]}
  function buildEvent(raw, M, cn) {
    const mk = []; for (const m of raw.m || []) { const os = (m.o || []).filter(o => o.n != null && o.odd != null).map(o => [String(o.n), +o.odd]); if (!os.length) continue;
      const s = m.sov == null || m.sov === '' ? null : (isNaN(+m.sov) ? m.sov : +m.sov); mk.push([m.t + '_' + m.st, s, os, m.mbc ?? raw.mbc ?? null]); }
    const ci = raw.ci, lgk = M.BIG[ci] || null;
    const e = { i: raw.i, ci, cn: cn || M.comps[ci] || '?', d: raw.d, h: raw.hn, a: raw.an, big: lgk ? 1 : 0, few: 0, xg: null, mx: 0, mean: null, m: [] };
    if (lgk) e.lgk = lgk;
    // market-implied goal expectation
    let states = null; const ms = mk.find(m => m[0] === '1_1' && m[2].length === 3 && m[2].every(o => o[1] > 1.01)), au = mk.find(m => m[0] === '2_101' && m[1] === 2.5 && m[2].length === 2 && m[2].every(o => o[1] > 1.01));
    if (ms && au) { const pm = devig(ms[2].map(o => o[1])); const P = {}; ms[2].forEach((o, x) => P[o[0]] = pm[x]); const pa = devig(au[2].map(o => o[1])); const pO = pa[au[2].findIndex(o => o[0] === 'Üst')];
      if (P['1'] != null && P['2'] != null && pO != null) { const f = implied(P['1'], P['2'], pO); const ht = fitHT(f.lam, f.mu, mk); states = goalStates(f.lam, f.mu, ht); e.mx = 1; e.xg = [+f.lam.toFixed(2), +f.mu.toFixed(2)]; e.fit = [+f.lam.toFixed(3), +f.mu.toFixed(3), ht]; } }
    let MP = null;
    if (lgk && M.X[lgk]) { const T = M.TEAMS[lgk]; const h = matchTeam(T, raw.hn), a = matchTeam(T, raw.an);
      if (h && a && h[0] !== a[0]) { MP = modelProbs(M, lgk, h[0], a[0], raw.hn, raw.an, mk); if (MP) { e.xg = MP.xg; e.mean = MP.mean; const C = M.cnt[lgk] || {}; e.few = ((C[h[0]] || 0) < 10 || (C[a[0]] || 0) < 10) ? 1 : 0; e.hid = h[0]; e.aid = a[0]; } }
      if (!MP) e.big = 0; }
    if (states || MP) e.cs = topScores(states ? dcAdjust(scoreDist(states), e.fit && e.fit[0], e.fit && e.fit[1]) : null, MP ? dcAdjust(scoreDist(MP.states), MP.xg[0], MP.xg[1]) : null, mk);
    for (const [key, s, os, mbc] of mk) { const row = [key, s, [], mbc]; const mrow = MP ? MP.P[key + '|' + s] : null;
      for (const [n, odd] of os) { const fp = states && odd > 1.01 && GOALKEYS.has(key) ? goalProb(key, n, s, states, 1) : null;
        row[2].push([n, odd, mrow ? (mrow[n] ?? null) : null, fp == null ? null : +fp.toFixed(4)]); }
      e.m.push(row); }
    return e;
  }

  // İki takım adının benzerliği (0 = alakasız, 10 = aynı)
  function simName(x, y) { const a = alias(norm(x)), b = alias(norm(y)); if (!a || !b) return 0; if (a === b) return 10;
    const A = a.split(' ').filter(w => w.length > 2), B = b.split(' ').filter(w => w.length > 2); let s = 0;
    for (const w of B) if (A.some(v => v.startsWith(w.slice(0, 5)) || w.startsWith(v.slice(0, 5)))) s += 1; return s; }
  root.BLD = { simName, buildEvent, devig, implied, goalStates, goalProb, goalPred, fitHT, matchTeam, norm, modelProbs, GOALKEYS };
})(typeof window !== 'undefined' ? window : globalThis);
