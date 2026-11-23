// Interfaccia di Cifrarium. La parte online (social.js) si carica solo se la configurazione Firebase è presente.
import {
  MAX, N, TIERS, fmt, BADGES, NB, IDX, hits, buildStats, score, pctTxt, rollNumber, EP, BTIER, COUNTS, store
} from './game.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = c => /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : 'var(--ink)';
const tick = () => new Promise(r => setTimeout(r, 0));

let S = null;            // modulo social, se disponibile
let user = null, profile = null;
let friendUids = [];

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2600);
}
function errMsg(e) {
  const m = String(e && (e.code || e.message) || e);
  if (m.includes('permission')) return 'Permesso negato dal database. Controlla le regole di Firestore.';
  if (m.includes('index')) return 'Manca un indice di Firestore: crealo dal link nella console del browser.';
  if (m.includes('popup')) return 'Accesso annullato.';
  return e && e.message ? e.message : m;
}

/* ---------- Tema ---------- */
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('cifrarium_theme', t); } catch (e) {}
  document.querySelectorAll('#theme-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
}

/* ---------- Bobine ---------- */
function makeReels(el) {
  el.innerHTML = '';
  const reels = [];
  for (let i = 0; i < 7; i++) {
    if (i === 1 || i === 4) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '.'; el.appendChild(s); }
    const r = document.createElement('div'); r.className = 'reel dim';
    const st = document.createElement('div'); st.className = 'strip';
    let h = ''; for (let k = 0; k < 31; k++) h += '<span>' + (k % 10) + '</span>';
    st.innerHTML = h; r.appendChild(st); el.appendChild(r);
    reels.push({ r, st, d: 0 });
  }
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Numero 0');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pos = k => `translateY(${-k * 100 / 31}%)`;
  const paint = tier => tier == null ? el.style.removeProperty('--tc') : el.style.setProperty('--tc', `var(--r${tier})`);
  return {
    set(n, animate, tier) {
      const s = String(n).padStart(7, '0'), lead = 7 - String(n).length;
      el.setAttribute('aria-label', 'Numero ' + fmt(n) + (tier != null ? ', ' + TIERS[tier] : ''));
      const anim = animate && !reduce;
      let maxT = 0;
      paint(anim ? null : tier);
      reels.forEach((o, i) => {
        const d = +s[i];
        o.r.classList.toggle('dim', i < lead);
        if (!anim) { o.st.style.transition = 'none'; o.st.style.transform = pos(d); o.d = d; return; }
        o.st.style.transition = 'none'; o.st.style.transform = pos(o.d);
        void o.st.offsetHeight;
        const t = 700 + i * 170; maxT = t;
        o.st.style.transition = `transform ${t}ms cubic-bezier(.15,.75,.2,1)`;
        o.st.style.transform = pos(20 + d); o.d = d;
      });
      return new Promise(r => setTimeout(() => { paint(tier); r(); }, anim ? maxT + 50 : 0));
    }
  };
}

/* ---------- Scheda del risultato ---------- */
function digitsRow(s, hl) {
  const on = new Set(hl);
  return '<div class="digits" aria-hidden="true">' + [...s].map((c, i) => `<span${on.has(i) ? ' class="on"' : ''}>${c}</span>`).join('') + '</div>';
}
function renderResult(el, sc, opts = {}) {
  const fresh = opts.fresh || new Set();
  const cards = sc.cards.map(({ i, hl, kids }) => {
    const [id, name, desc] = BADGES[i], t = BTIER[i];
    const odds = Math.max(1, Math.round(N / COUNTS[i]));
    const sub = kids.map(j => `<div class="subline t${BTIER[j]}"><span>└ <b>${BADGES[j][1]}</b></span><span>incluso${fresh.has(BADGES[j][0]) ? ' · nuovo' : ''}</span></div>`).join('');
    return `<li style="display:grid;gap:6px"><div class="bcard t${t}">
      <div class="b-head"><span class="b-name">${name}</span><span class="tag">${TIERS[t]}</span>${fresh.has(id) ? '<span class="tag new">Nuovo</span>' : ''}<span class="b-pts">+${fmt(EP[i])} pt</span></div>
      <div class="b-desc">${desc} <span class="b-odds">· 1 numero su ${fmt(odds)}</span></div>
      ${digitsRow(sc.s, hl)}</div>${sub}</li>`;
  }).join('');
  el.innerHTML = `<div style="display:grid;gap:18px">
    <div class="verdict t${sc.tier}">
      <div class="line"><span class="tier-pill">${TIERS[sc.tier]}</span><span class="top-pct">Top ${pctTxt(sc.topFrac)}</span></div>
      <span class="ep-big">${fmt(sc.total)} pt</span>
      ${opts.life != null ? `<span class="ep-life">${fmt(opts.life)} pt<small>${opts.lifeLabel || 'Punti totali'}</small></span>` : ''}
    </div>
    ${opts.after || ''}
    <div class="section-title"><h2>Badge ottenuti</h2><span class="muted" style="font-size:.85rem">${sc.earned.length} badge · ${sc.cards.length} contano per i punti</span></div>
    <ul class="badges">${cards}</ul></div>`;
}
const numChip = (n, tier) => `<span class="numchip t${tier}">${fmt(n)}</span>`;
const nameTag = (name, color, fav) => `<span class="uname" style="color:${safeColor(color)}">${esc(name)}</span>${(fav || []).filter(id => IDX[id] != null).map(id => `<span class="favchip t${BTIER[IDX[id]]}">${BADGES[IDX[id]][1]}</span>`).join('')}`;

/* ---------- Giornaliero ---------- */
const DAILY_KEY = 'cifrario_daily';
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let localDaily = store.get(DAILY_KEY, {});
let remoteDaily = null;        // tiri salvati online, se l'utente ha un account
const daily = () => remoteDaily || localDaily;
let reelsDaily, reelsTrain;

function streak() {
  const d0 = daily(); let s = 0; const d = new Date();
  if (d0[dayKey(d)] === undefined) d.setDate(d.getDate() - 1);
  while (d0[dayKey(d)] !== undefined) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function renderDaily(animateDone) {
  const today = dayKey(), dd = daily(), n = dd[today];
  $('today-label').textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const st = streak(); $('streak').textContent = st + (st === 1 ? ' giorno' : ' giorni');
  $('guest-note').hidden = !(S && !profile);
  if (n === undefined) { $('btn-daily').hidden = false; $('daily-result').hidden = true; reelsDaily.set(0, false, null); return; }
  $('btn-daily').hidden = true;
  const sc = score(n);
  if (!animateDone) reelsDaily.set(n, false, sc.tier);
  const before = new Set();
  for (const k in dd) if (k < today) for (const [i] of hits(dd[k])) before.add(BADGES[i][0]);
  const fresh = new Set(sc.earned.map(i => BADGES[i][0]).filter(id => !before.has(id)));
  let life = 0; for (const k in dd) life += score(dd[k]).total;
  renderResult($('daily-result'), sc, {
    fresh, life, lifeLabel: 'I tuoi punti di sempre',
    after: `<div class="row spread"><p class="muted">Prossimo tiro tra <span class="countdown" id="countdown"></span></p>
      <div class="row"><button class="btn ghost" id="btn-share">Copia risultato</button><a class="btn ghost" href="#allenamento" style="text-decoration:none">Vai all'allenamento</a></div></div>`
  });
  $('daily-result').hidden = false;
  $('btn-share').onclick = share;
  updateCountdown();
}
let lastDay = dayKey();
function updateCountdown() {
  const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
  let s = Math.max(0, Math.floor((mid - now) / 1000));
  const h = Math.floor(s / 3600); s %= 3600;
  const c = $('countdown'); if (c) c.textContent = `${h}h ${String(Math.floor(s / 60)).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
  if (dayKey() !== lastDay) { lastDay = dayKey(); renderDaily(); }
}
async function doDaily() {
  const today = dayKey();
  if (daily()[today] !== undefined) return;
  const n = rollNumber(), sc = score(n);
  $('btn-daily').disabled = true;
  if (profile) {
    try { await S.publishRoll(today, sc, sc.earned.map(i => BADGES[i][0]), sc.cards.map(c => BADGES[c.i][0])); remoteDaily[today] = n; }
    catch (e) { $('btn-daily').disabled = false; toast('Tiro non salvato: ' + errMsg(e)); return; }
  } else { localDaily[today] = n; store.set(DAILY_KEY, localDaily); }
  await reelsDaily.set(n, true, sc.tier);
  $('btn-daily').disabled = false;
  renderDaily(true); renderCollection();
}
async function share() {
  const n = daily()[dayKey()]; if (n === undefined) return;
  const sc = score(n);
  const names = sc.cards.slice(0, 5).map(c => BADGES[c.i][1]).join(', ');
  const txt = `Cifrarium ${new Date().toLocaleDateString('it-IT')}\n${fmt(n)} · ${TIERS[sc.tier]} · Top ${pctTxt(sc.topFrac)}\n${fmt(sc.total)} punti · ${names}\n${location.origin}${location.pathname}`;
  try { await navigator.clipboard.writeText(txt); toast('Risultato copiato'); } catch (e) { toast('Copia non riuscita'); }
}

/* ---------- Allenamento ---------- */
const TRAIN_KEY = 'cifrario_training_v2';
const emptyTrain = () => ({ rolls: 0, sum: 0, best: null, tiers: [0, 0, 0, 0, 0, 0, 0], seen: {}, history: [] });
let train = Object.assign(emptyTrain(), store.get(TRAIN_KEY, {}));
let auto = false;

function recordTrain(sc) {
  train.rolls++; train.sum += sc.total; train.tiers[sc.tier]++;
  const fresh = new Set();
  for (const i of sc.earned) { const k = BADGES[i][0]; if (!train.seen[k]) fresh.add(k); train.seen[k] = (train.seen[k] || 0) + 1; }
  if (!train.best || sc.total > train.best.total) train.best = { n: sc.n, total: sc.total, tier: sc.tier };
  train.history.unshift(sc.n); if (train.history.length > 200) train.history.length = 200;
  return fresh;
}
let saveT;
function saveTrain() { clearTimeout(saveT); saveT = setTimeout(() => store.set(TRAIN_KEY, train), 300); }
function renderTrainStats() {
  const avg = train.rolls ? fmt(train.sum / train.rolls) : '–';
  $('train-stats').innerHTML = `
    <div class="stat"><div class="k">Tiri</div><div class="v">${fmt(train.rolls)}</div></div>
    <div class="stat"><div class="k">Punti totali</div><div class="v">${fmt(train.sum)}</div></div>
    <div class="stat"><div class="k">Media punti</div><div class="v">${avg}</div></div>
    <div class="stat"><div class="k">Miglior tiro</div><div class="v">${train.best ? `<span class="t${train.best.tier}" style="color:var(--c)">${fmt(train.best.n)}</span>` : '–'}</div></div>
    <div class="stat"><div class="k">Badge visti</div><div class="v">${Object.keys(train.seen).length} / ${NB}</div></div>`;
  const max = Math.max(1, ...train.tiers);
  $('train-dist').innerHTML = TIERS.map((t, i) => `<div class="dist-row t${i}"><span class="lbl">${t}</span>
    <span class="bar"><i style="width:${train.tiers[i] / max * 100}%"></i></span><span class="n">${fmt(train.tiers[i])}</span></div>`).reverse().join('');
}
function histItem(n) {
  const sc = score(n);
  return `<li><button class="t${sc.tier}" data-n="${n}"><span class="hn" style="color:var(--c)">${fmt(n)}</span><span class="ht">${TIERS[sc.tier]}</span><span class="hp">${fmt(sc.total)} pt</span></button></li>`;
}
function renderTrainHistory() {
  $('train-history').innerHTML = train.history.length ? train.history.slice(0, 100).map(histItem).join('')
    : '<li class="muted" style="padding:6px 10px">Ancora nessun tiro. Premi Tira per iniziare.</li>';
}
function showTrain(sc, label, fresh) {
  $('train-label').textContent = label;
  renderResult($('train-result'), sc, { fresh, life: train.sum, lifeLabel: 'Punti totali di allenamento' });
}
async function trainRoll(animate) {
  const n = rollNumber(), sc = score(n);
  if (animate) { $('btn-train').disabled = true; await reelsTrain.set(n, true, sc.tier); $('btn-train').disabled = false; }
  else reelsTrain.set(n, false, sc.tier);
  const fresh = recordTrain(sc);
  showTrain(sc, `Tiro n. ${fmt(train.rolls)}`, fresh);
  return { sc, fresh };
}
function afterTrain() { renderTrainStats(); renderTrainHistory(); saveTrain(); }
function view(n, label) { const sc = score(n); reelsTrain.set(n, false, sc.tier); showTrain(sc, label); }
function openAnalysis(n, label) {
  location.hash = '#allenamento'; view(n, label);
  setTimeout(() => $('reels-train').scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}
async function toggleAuto() {
  if (auto) { auto = false; return; }
  auto = true; $('btn-auto').textContent = 'Ferma'; $('btn-train').disabled = true;
  const stopSel = $('stop-at').value;
  let k = 0;
  while (auto) {
    const { sc, fresh } = await trainRoll(false);
    const speed = +$('speed').value;
    const stop = stopSel === 'badge' ? fresh.size > 0 : sc.tier >= +stopSel;
    if (stop) { auto = false; toast(stopSel === 'badge' ? 'Nuovo badge trovato' : `Uscito: ${TIERS[sc.tier]}`); }
    if (speed > 0 || stop || ++k % 25 === 0) afterTrain();
    await new Promise(r => setTimeout(r, speed));
  }
  afterTrain();
  $('btn-auto').textContent = 'Avvia tiro automatico'; $('btn-train').disabled = false;
}
function askReset() {
  $('reset-zone').innerHTML = `<div class="confirm"><span>Cancellare tutte le statistiche di allenamento?</span>
    <button class="btn ghost danger" id="reset-yes">Sì, azzera</button><button class="btn ghost" id="reset-no">Annulla</button></div>`;
  $('reset-yes').onclick = () => { auto = false; train = emptyTrain(); store.set(TRAIN_KEY, train); afterTrain(); restoreReset(); toast('Statistiche azzerate'); };
  $('reset-no').onclick = restoreReset;
}
function restoreReset() { $('reset-zone').innerHTML = '<button class="btn ghost danger" id="btn-reset">Azzera</button>'; $('btn-reset').onclick = askReset; }

/* ---------- Collezione ---------- */
let collSrc = 'daily';
function dailyBadgeCounts() {
  const counts = {}, dd = daily();
  for (const k in dd) for (const [i] of hits(dd[k])) counts[BADGES[i][0]] = (counts[BADGES[i][0]] || 0) + 1;
  return counts;
}
function renderCollection() {
  const counts = collSrc === 'daily' ? dailyBadgeCounts() : { ...train.seen };
  const got = BADGES.filter(b => counts[b[0]]).length;
  $('coll-count').textContent = `${got} di ${NB} badge sbloccati`;
  const order = BADGES.map((b, i) => i).sort((a, b) => BTIER[a] - BTIER[b] || COUNTS[b] - COUNTS[a]);
  $('coll-grid').innerHTML = order.map(i => {
    const [id, name, desc] = BADGES[i], c = counts[id] || 0;
    return `<div class="gb t${BTIER[i]}${c ? '' : ' locked'}"><div class="top"><span class="nm">${name}</span><span class="ct">${c ? '×' + fmt(c) : '–'}</span></div>
      <span class="ds">${desc}</span><span class="pr">${TIERS[BTIER[i]]} · ${fmt(EP[i])} pt · 1 su ${fmt(Math.max(1, Math.round(N / COUNTS[i])))}</span></div>`;
  }).join('');
  const dd = daily(), days = Object.keys(dd).sort().reverse();
  $('daily-history').innerHTML = days.length ? days.map(d => {
    const sc = score(dd[d]); const dt = new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<li><button class="t${sc.tier}" data-n="${dd[d]}"><span class="hn" style="color:var(--c)">${fmt(dd[d])} <span class="muted" style="font-family:var(--f-body);font-weight:400;font-size:.85rem">· ${dt}</span></span><span class="ht">${TIERS[sc.tier]}</span><span class="hp">${fmt(sc.total)} pt</span></button></li>`;
  }).join('') : '<li class="muted" style="padding:6px 10px">Nessun tiro giornaliero ancora.</li>';
}

/* ---------- Info ---------- */
function renderInfo() {
  const bands = ['ultimo 1%', 'metà bassa (sotto il 50%)', 'top 50% – 25%', 'top 25% – 10%', 'top 10% – 5%', 'top 5% – 1%', 'top 1%'];
  $('tiers-table').innerHTML = TIERS.map((t, i) => `<tr class="t${i}"><td>${t}</td><td>${bands[i]} dei numeri possibili</td></tr>`).reverse().join('');
  const bb = ['', 'più del 10% dei numeri', 'dall\'1% al 10%', 'dallo 0,1% all\'1%', 'dallo 0,01% allo 0,1%', 'dallo 0,001% allo 0,01%', 'meno di 1 su 100.000'];
  $('btiers-table').innerHTML = TIERS.slice(1).map((t, j) => {
    const i = j + 1, n = BTIER.filter(x => x === i).length;
    return `<tr class="t${i}"><td>${t}</td><td>${bb[i]}</td><td style="text-align:right;color:var(--muted)">${n} badge</td></tr>`;
  }).reverse().join('');
}

/* ---------- Parte online: stati comuni ---------- */
const needLogin = what => S
  ? `<div class="empty"><p>Accedi con Google per ${what}.</p><button class="btn" data-login>Accedi con Google</button></div>`
  : `<div class="empty"><p>Le funzioni online non sono attive in questa copia del gioco (manca la configurazione Firebase).</p></div>`;
const loadingRow = '<p class="muted" style="padding:10px">Caricamento…</p>';
const segValue = id => document.querySelector(`#${id} button[aria-pressed="true"]`).dataset.v;
function bindSeg(id, onChange) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onChange(b.dataset.v);
  });
}
function weekStart() { const d = new Date(); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dayKey(d); }
const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });
function ago(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : Date.now();
  const s = (ms - Date.now()) / 1000;
  for (const [u, k] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(s) >= k) return rtf.format(Math.round(s / k), u);
  return 'adesso';
}
function heart(r) {
  const liked = user && (r.likedBy || []).includes(user.uid);
  return `<button class="heart${liked ? ' on' : ''}" data-like="${esc(r.id)}" aria-pressed="${liked}" aria-label="Mi piace">${liked ? '♥' : '♡'} <span>${(r.likedBy || []).length || ''}</span></button>`;
}
const rollCache = {};
async function onLike(btn) {
  if (!profile) { toast('Accedi per mettere mi piace'); return; }
  const r = rollCache[btn.dataset.like]; if (!r) return;
  const liked = (r.likedBy || []).includes(user.uid);
  btn.disabled = true;
  try {
    await S.toggleLike(r.id, liked);
    r.likedBy = liked ? r.likedBy.filter(x => x !== user.uid) : [...(r.likedBy || []), user.uid];
    btn.outerHTML = heart(r);
  } catch (e) { toast(errMsg(e)); btn.disabled = false; }
}

/* ---------- Classifica ---------- */
async function renderBoard() {
  const el = $('lb-list');
  if (!S) { el.innerHTML = needLogin('vedere la classifica'); return; }
  const scope = segValue('lb-scope'), period = segValue('lb-period');
  if (scope === 'friends' && !profile) { el.innerHTML = needLogin('vedere la classifica dei tuoi amici'); return; }
  el.innerHTML = loadingRow;
  const uids = scope === 'friends' ? [user.uid, ...friendUids] : null;
  try {
    let rows = '';
    const medal = i => i < 3 ? `<span class="medal m${i + 1}">${i + 1}°</span>` : `<span class="rank">#${i + 1}</span>`;
    if (period === 'today') {
      const list = await S.rankToday(dayKey(), uids);
      list.forEach(r => { rollCache[r.id] = r; });
      rows = list.map((r, i) => `<li class="${user && r.uid === user.uid ? 'mine' : ''}">${medal(i)}
        <span class="who">${nameTag(r.username, r.color, r.fav)}${user && r.uid === user.uid ? ' <span class="muted">(tu)</span>' : ''}</span>
        <button class="numbtn" data-n="${r.n}" title="Vedi i badge">${numChip(r.n, r.tier)}</button><span class="pts">${fmt(r.total)} pt</span>${heart(r)}</li>`).join('');
    } else if (period === 'week') {
      const list = await S.rankWeek(weekStart(), uids);
      rows = list.map((u, i) => `<li class="${user && u.uid === user.uid ? 'mine' : ''}">${medal(i)}
        <span class="who">${nameTag(u.username, u.color, u.fav)} <span class="muted">· ${u.days} ${u.days === 1 ? 'tiro' : 'tiri'}</span></span>
        <button class="numbtn" data-n="${u.best.n}" title="Miglior tiro della settimana">${numChip(u.best.n, u.best.tier)}</button><span class="pts">${fmt(u.total)} pt</span></li>`).join('');
    } else {
      const field = period === 'all' ? 'lifetime' : 'badgeCount';
      const list = await S.rankUsers(field, uids);
      rows = list.filter(u => u.username).map((u, i) => `<li class="${user && u.uid === user.uid ? 'mine' : ''}">${medal(i)}
        <span class="who">${nameTag(u.username, u.color, u.fav)} <span class="muted">· ${fmt(u.rolls || 0)} tiri</span></span>
        <span class="pts">${period === 'all' ? fmt(u.lifetime || 0) + ' pt' : (u.badgeCount || 0) + ' / ' + NB + ' badge'}</span></li>`).join('');
    }
    el.innerHTML = rows || '<p class="muted" style="padding:10px">Ancora nessuno in classifica per questo periodo.</p>';
  } catch (e) { el.innerHTML = `<p class="error">${esc(errMsg(e))}</p>`; console.error(e); }
}

/* ---------- Feed ---------- */
async function renderFeed() {
  const el = $('feed-list');
  if (!S) { el.innerHTML = needLogin('vedere il feed'); return; }
  const scope = segValue('feed-scope');
  if (scope === 'friends' && !profile) { el.innerHTML = needLogin('vedere i tiri dei tuoi amici'); return; }
  el.innerHTML = loadingRow;
  try {
    const list = await S.feed(scope === 'friends' ? [user.uid, ...friendUids] : null);
    list.forEach(r => { rollCache[r.id] = r; });
    el.innerHTML = list.map(r => `<article class="fcard t${r.tier}">
      <div class="fhead"><span>${nameTag(r.username, r.color, r.fav)}</span><span class="muted">${ago(r.createdAt)}</span></div>
      <div class="fbody"><button class="numbtn" data-n="${r.n}" title="Vedi i badge">${numChip(r.n, r.tier)}</button>
        <div><div class="ftier">${TIERS[r.tier]} · Top ${pctTxt(r.top)}</div><div class="pts">${fmt(r.total)} pt</div></div></div>
      <div class="fbadges">${(r.cards || []).filter(id => IDX[id] != null).map(id => `<span class="favchip t${BTIER[IDX[id]]}">${BADGES[IDX[id]][1]}</span>`).join('')}</div>
      <div class="ffoot">${heart(r)}</div></article>`).join('') || '<p class="muted" style="padding:10px">Ancora nessun tiro da mostrare.</p>';
  } catch (e) { el.innerHTML = `<p class="error">${esc(errMsg(e))}</p>`; console.error(e); }
}

/* ---------- Amici ---------- */
async function refreshFriends() {
  if (!profile) { friendUids = []; $('bell').hidden = true; return; }
  try {
    const [f, rq] = await Promise.all([S.friends(), S.requests()]);
    friendUids = f;
    $('bell-count').textContent = rq.incoming.length; $('bell').hidden = rq.incoming.length === 0;
    return rq;
  } catch (e) { console.error(e); }
}
function userRow(u, actions) {
  return `<li class="urow"><span class="who">${nameTag(u.username, u.color, u.fav)}</span><span class="row">${actions}</span></li>`;
}
async function renderFriends() {
  const el = $('fr-body');
  if (!profile) { el.innerHTML = needLogin('aggiungere amici'); return; }
  const tab = segValue('fr-tab');
  el.innerHTML = loadingRow;
  try {
    if (tab === 'list') {
      await refreshFriends();
      const p = friendUids.length ? await S.getProfiles(friendUids) : {};
      el.innerHTML = friendUids.length ? `<ul class="ulist">${friendUids.filter(u => p[u]).map(u => userRow(p[u],
        `<span class="muted">${fmt(p[u].lifetime || 0)} pt</span><span data-rm-zone="${u}"><button class="btn ghost small" data-rm="${u}">Rimuovi</button></span>`)).join('')}</ul>`
        : '<div class="empty"><p>Non hai ancora amici. Condividi il tuo codice o cerca un giocatore per nome.</p></div>';
    } else if (tab === 'requests') {
      const rq = await refreshFriends();
      const inc = rq.incoming.map(r => userRow({ username: r.fromName, color: r.fromColor },
        `<button class="btn small" data-acc="${esc(r.id)}">Accetta</button><button class="btn ghost small" data-dec="${esc(r.id)}">Rifiuta</button>`)).join('');
      const out = rq.outgoing.map(r => userRow({ username: r.toName, color: r.toColor },
        `<span class="muted">In attesa</span><button class="btn ghost small" data-dec="${esc(r.id)}">Annulla</button>`)).join('');
      reqCache = Object.fromEntries([...rq.incoming, ...rq.outgoing].map(r => [r.id, r]));
      el.innerHTML = `<h2>Ricevute</h2>${inc ? `<ul class="ulist">${inc}</ul>` : '<p class="muted">Nessuna richiesta ricevuta.</p>'}
        <h2>Inviate</h2>${out ? `<ul class="ulist">${out}</ul>` : '<p class="muted">Nessuna richiesta inviata.</p>'}`;
    } else if (tab === 'code') {
      el.innerHTML = `<div class="codebox"><span class="eyebrow">Il tuo codice amico</span><span class="code" id="my-code">${esc(profile.friendCode)}</span>
        <button class="btn ghost" id="copy-code">Copia codice</button></div>
        <h2>Aggiungi con un codice</h2>
        <form class="row" id="form-code"><input type="text" id="code-in" maxlength="6" placeholder="ABC123" aria-label="Codice amico" style="text-transform:uppercase"><button class="btn" type="submit">Invia richiesta</button></form>`;
      $('copy-code').onclick = async () => { try { await navigator.clipboard.writeText(profile.friendCode); toast('Codice copiato'); } catch (e) { toast('Copia non riuscita'); } };
      $('form-code').onsubmit = async e => {
        e.preventDefault();
        try {
          const u = await S.findByCode($('code-in').value);
          if (!u) { toast('Nessun giocatore con questo codice'); return; }
          await S.sendRequest(u); toast(`Richiesta inviata a ${u.username}`); $('code-in').value = ''; refreshFriends();
        } catch (err) { toast(errMsg(err)); }
      };
    } else {
      el.innerHTML = `<form class="row" id="form-search"><input type="text" id="search-in" placeholder="Nome utente" aria-label="Cerca giocatore"><button class="btn" type="submit">Cerca</button></form><ul class="ulist" id="search-out"></ul>`;
      $('form-search').onsubmit = async e => {
        e.preventDefault();
        try {
          const list = (await S.searchUsers($('search-in').value)).filter(u => u.uid !== user.uid);
          searchCache = Object.fromEntries(list.map(u => [u.uid, u]));
          $('search-out').innerHTML = list.map(u => userRow(u, friendUids.includes(u.uid) ? '<span class="muted">Già amici</span>'
            : `<button class="btn small" data-add="${u.uid}">Aggiungi</button>`)).join('') || '<p class="muted">Nessun giocatore trovato.</p>';
        } catch (err) { toast(errMsg(err)); }
      };
    }
  } catch (e) { el.innerHTML = `<p class="error">${esc(errMsg(e))}</p>`; console.error(e); }
}
let reqCache = {}, searchCache = {};
async function onFriendsClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  try {
    if (t.dataset.acc) { await S.acceptRequest(reqCache[t.dataset.acc]); toast('Ora siete amici'); await refreshFriends(); renderFriends(); }
    else if (t.dataset.dec) { await S.dropRequest(reqCache[t.dataset.dec]); await refreshFriends(); renderFriends(); }
    else if (t.dataset.add) { await S.sendRequest(searchCache[t.dataset.add]); t.outerHTML = '<span class="muted">Richiesta inviata</span>'; refreshFriends(); }
    else if (t.dataset.rm) {
      const z = document.querySelector(`[data-rm-zone="${t.dataset.rm}"]`);
      z.innerHTML = `<button class="btn ghost small danger" data-rmok="${t.dataset.rm}">Conferma</button><button class="btn ghost small" data-rmno="1">Annulla</button>`;
    }
    else if (t.dataset.rmok) { await S.removeFriend(t.dataset.rmok); toast('Amico rimosso'); renderFriends(); }
    else if (t.dataset.rmno) renderFriends();
  } catch (err) { toast(errMsg(err)); }
}

/* ---------- Impostazioni account ---------- */
function renderSettings() {
  const el = $('settings-account');
  if (!profile) { el.innerHTML = `<div class="set-block"><h2>Account</h2>${needLogin('salvare i tuoi tiri e comparire in classifica')}</div>`; return; }
  const earned = new Set(Object.keys(profile.badges || {}));
  const fav = profile.fav || [];
  const opts = BADGES.filter(b => earned.has(b[0])).sort((a, b) => EP[IDX[b[0]]] - EP[IDX[a[0]]]);
  el.innerHTML = `
    <div class="set-block"><h2>Profilo</h2>
      <p class="label">Colore del nome</p>
      <div class="row"><span class="uname big" id="name-preview" style="color:${safeColor(profile.color)}">${esc(profile.username)}</span>
        <input type="color" id="name-color" value="${safeColor(profile.color).startsWith('#') ? profile.color : '#8c45d4'}" aria-label="Colore del nome"></div>
      <p class="label">Badge preferiti</p>
      <p class="muted">Scegline fino a due tra quelli che hai ottenuto nei tiri giornalieri: compaiono accanto al tuo nome.</p>
      ${opts.length ? `<div class="favpick" id="fav-pick">${opts.map(b => `<button class="favchip t${BTIER[IDX[b[0]]]}" data-fav="${b[0]}" aria-pressed="${fav.includes(b[0])}">${b[1]}</button>`).join('')}</div>`
        : '<p class="muted">Fai il tuo primo tiro giornaliero per sbloccare dei badge.</p>'}
    </div>
    <div class="set-block"><h2>Account</h2>
      <p class="muted">Accesso con Google come ${esc(user.email || '')}</p>
      <div><button class="btn ghost" id="btn-logout">Esci</button></div>
    </div>
    <div class="set-block danger-zone"><h2>Zona pericolosa</h2>
      <div class="row spread"><div><p class="label">Elimina account</p><p class="muted">Cancella per sempre account, tiri, amicizie e richieste.</p></div>
      <div id="del-zone"><button class="btn ghost danger" id="btn-del">Elimina account</button></div></div>
    </div>`;
  let colorT;
  $('name-color').oninput = e => { $('name-preview').style.color = e.target.value; clearTimeout(colorT); colorT = setTimeout(() => S.saveProfile({ color: e.target.value }).then(() => toast('Colore salvato')).catch(err => toast(errMsg(err))), 500); };
  const fp = $('fav-pick');
  if (fp) fp.onclick = async e => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    let f = [...(profile.fav || [])];
    if (f.includes(b.dataset.fav)) f = f.filter(x => x !== b.dataset.fav);
    else { if (f.length >= 2) { toast('Puoi scegliere al massimo due badge'); return; } f.push(b.dataset.fav); }
    try { await S.saveProfile({ fav: f }); renderSettings(); toast('Badge preferiti salvati'); } catch (err) { toast(errMsg(err)); }
  };
  $('btn-logout').onclick = () => S.logout();
  $('btn-del').onclick = () => {
    $('del-zone').innerHTML = `<div class="confirm"><span>Sei sicuro? Non si può annullare.</span>
      <button class="btn danger-solid" id="del-yes">Sì, elimina tutto</button><button class="btn ghost" id="del-no">Annulla</button></div>`;
    $('del-no').onclick = renderSettings;
    $('del-yes').onclick = async () => {
      $('del-yes').disabled = true;
      try { await S.deleteAccount(); toast('Account eliminato'); location.hash = '#oggi'; }
      catch (err) {
        if (String(err.code).includes('requires-recent-login')) toast('Per sicurezza esci, rientra e riprova subito.');
        else toast(errMsg(err));
        renderSettings();
      }
    };
  };
}

/* ---------- Account ---------- */
async function doLogin() {
  if (!S) { toast('Funzioni online non disponibili'); return; }
  try { await S.login(); } catch (e) { toast(errMsg(e)); }
}
function renderAccountButton() {
  const b = $('btn-account');
  if (!S) { b.hidden = true; return; }
  b.hidden = false;
  if (profile) { b.innerHTML = `<span style="color:${safeColor(profile.color)}">${esc(profile.username)}</span>`; b.onclick = () => { location.hash = '#impostazioni'; }; }
  else if (user) { b.textContent = 'Scegli nome utente'; b.onclick = () => { location.hash = '#setup'; }; }
  else { b.textContent = 'Accedi con Google'; b.onclick = doLogin; }
}
async function onAuth(u, p) {
  user = u; profile = p; remoteDaily = null;
  if (profile) {
    try {
      remoteDaily = await S.myRolls();
      // Se oggi hai già tirato senza account, il tiro viene salvato online.
      const today = dayKey();
      if (remoteDaily[today] === undefined && localDaily[today] !== undefined) {
        const sc = score(localDaily[today]);
        await S.publishRoll(today, sc, sc.earned.map(i => BADGES[i][0]), sc.cards.map(c => BADGES[c.i][0]));
        remoteDaily[today] = localDaily[today];
      }
    } catch (e) { console.error(e); toast('Non riesco a leggere i tuoi tiri online: ' + errMsg(e)); remoteDaily = {}; }
    await refreshFriends();
  } else { friendUids = []; $('bell').hidden = true; }
  renderAccountButton();
  if (user && !profile) location.hash = '#setup';
  else if (location.hash === '#setup') location.hash = '#oggi';
  renderDaily(); renderCollection(); route(true);
}

/* ---------- Navigazione ---------- */
const VIEWS = ['oggi', 'allenamento', 'classifica', 'feed', 'amici', 'collezione', 'info', 'impostazioni', 'setup'];
let ready = false;
function route(force) {
  const h = location.hash.slice(1);
  const v = VIEWS.includes(h) && (h !== 'setup' || (user && !profile)) ? h : 'oggi';
  document.querySelectorAll('section[data-v]').forEach(s => { s.hidden = s.dataset.v !== v || !ready; });
  document.querySelectorAll('nav.tabs a').forEach(a => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!ready) return;
  if (v === 'collezione') renderCollection();
  if (v === 'classifica') renderBoard();
  if (v === 'feed') renderFeed();
  if (v === 'amici') renderFriends();
  if (v === 'impostazioni') renderSettings();
}

/* ---------- Avvio ---------- */
async function start() {
  applyTheme((() => { try { return localStorage.getItem('cifrarium_theme') || 'system'; } catch (e) { return 'system'; } })());
  reelsDaily = makeReels($('reels-daily'));
  reelsTrain = makeReels($('reels-train'));
  const [, social] = await Promise.all([
    buildStats(p => { $('prog').style.width = (p * 100) + '%'; }),
    import('./social.js').catch(e => { console.info('Modalità offline:', e.message); return null; })
  ]);
  S = social;
  $('loading').hidden = true; ready = true;
  renderAccountButton();
  renderDaily(); renderTrainStats(); renderTrainHistory(); renderInfo(); renderCollection();
  if (train.history.length) view(train.history[0], 'Ultimo tiro');
  else $('train-result').innerHTML = '<p class="muted">I risultati dei tuoi tiri di prova appariranno qui, con la spiegazione di ogni badge.</p>';

  $('btn-daily').onclick = doDaily;
  $('guest-login').onclick = doLogin;
  $('btn-train').onclick = async () => { await trainRoll($('anim').checked); afterTrain(); };
  $('btn-auto').onclick = toggleAuto;
  $('btn-reset').onclick = askReset;
  $('form-analyze').onsubmit = e => {
    e.preventDefault();
    const raw = $('analyze-n').value, v = Math.floor(+raw);
    if (raw === '' || !Number.isFinite(v) || v < 0 || v > MAX) { toast('Inserisci un numero da 0 a 1.000.000'); return; }
    openAnalysis(v, 'Analisi di ' + fmt(v));
  };
  $('train-history').onclick = e => { const b = e.target.closest('button[data-n]'); if (b) openAnalysis(+b.dataset.n, 'Rivedi ' + fmt(+b.dataset.n)); };
  $('daily-history').onclick = e => { const b = e.target.closest('button[data-n]'); if (b) openAnalysis(+b.dataset.n, 'Tiro giornaliero ' + fmt(+b.dataset.n)); };
  $('src-daily').onclick = () => { collSrc = 'daily'; $('src-daily').setAttribute('aria-pressed', 'true'); $('src-train').setAttribute('aria-pressed', 'false'); renderCollection(); };
  $('src-train').onclick = () => { collSrc = 'train'; $('src-train').setAttribute('aria-pressed', 'true'); $('src-daily').setAttribute('aria-pressed', 'false'); renderCollection(); };
  bindSeg('lb-scope', renderBoard); bindSeg('lb-period', renderBoard);
  bindSeg('feed-scope', renderFeed); bindSeg('fr-tab', renderFriends);
  bindSeg('theme-seg', applyTheme);
  $('fr-body').addEventListener('click', onFriendsClick);
  // Clic comuni: like, numeri da analizzare, pulsanti di accesso
  document.addEventListener('click', e => {
    const like = e.target.closest('[data-like]'); if (like) { onLike(like); return; }
    const nb = e.target.closest('.numbtn'); if (nb) { openAnalysis(+nb.dataset.n, 'Tiro di ' + fmt(+nb.dataset.n)); return; }
    if (e.target.closest('[data-login]')) doLogin();
  });
  $('form-setup').onsubmit = async e => {
    e.preventDefault();
    const name = $('setup-name').value.trim(), err = $('setup-err');
    if (!S.validName(name)) { err.textContent = 'Usa da 3 a 20 caratteri: lettere, numeri o trattino basso.'; err.hidden = false; return; }
    err.hidden = true;
    try { await S.createProfile(name); toast(`Benvenuto, ${name}`); await onAuth(user, S.profile); }
    catch (x) { err.textContent = errMsg(x); err.hidden = false; }
  };
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || location.hash !== '#allenamento') return;
    if (e.target.closest('input, select, textarea, button')) return;
    e.preventDefault(); if (!auto && !$('btn-train').disabled) $('btn-train').click();
  });
  setInterval(updateCountdown, 1000);
  route();
  if (S) S.onUser(onAuth);
}
window.addEventListener('hashchange', () => route());
route();
start();
