// Logica del gioco: badge, punti, rarità. Nessuna dipendenza dall'interfaccia.
export const MAX = 1000000, N = MAX + 1;
export const TIERS = ['Spazzatura', 'Comune', 'Non comune', 'Raro', 'Epico', 'Anomalia', 'Mitico'];
export const fmt = n => Math.round(n).toLocaleString('it-IT');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- Matematica ---------- */
const comp = new Uint8Array(MAX + 3); comp[0] = comp[1] = 1;
for (let i = 2; i * i <= MAX + 2; i++) if (!comp[i]) for (let j = i * i; j <= MAX + 2; j += i) comp[j] = 1;
const isPrime = n => !comp[n];
const isSq = x => { const r = Math.round(Math.sqrt(x)); return r * r === x; };
const setOf = gen => { const s = new Set(); gen(s); return s; };
const CUBES = setOf(s => { for (let i = 0; i * i * i <= MAX; i++) s.add(i * i * i); });
const FIB = setOf(s => { let a = 0, b = 1; while (a <= MAX) { s.add(a); [a, b] = [b, a + b]; } });
const POW2 = setOf(s => { for (let p = 1; p <= MAX; p *= 2) s.add(p); });
const FACT = setOf(s => { let f = 1; for (let i = 1; f <= MAX; i++) { s.add(f); f *= i + 1; } });
const PERFECT = new Set([6, 28, 496, 8128]);
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const STROBO = { '0': '0', '1': '1', '6': '9', '8': '8', '9': '6' };

/* Indici delle cifre da evidenziare */
const rng = (a, b) => { const o = []; for (let i = a; i < b; i++) o.push(i); return o; };
const ALL = s => rng(0, s.length);
const LAST = (s, k) => rng(Math.max(0, s.length - k), s.length);
const has = (s, t) => { const k = s.indexOf(t); return k < 0 ? null : rng(k, k + t.length); };
const yes = (c, v) => c ? v : null;
function sameRuns(s, len) { // tutte le sequenze massimali di cifre uguali lunghe almeno len
  const out = []; let st = 0;
  for (let i = 1; i <= s.length; i++) if (i === s.length || s[i] !== s[st]) { if (i - st >= len) out.push(rng(st, i)); st = i; }
  return out;
}
function stepRun(s, len) { // cifre consecutive in salita o discesa (es. 345, 987)
  for (const dir of [1, -1]) {
    let st = 0;
    for (let i = 1; i <= s.length; i++) if (i === s.length || s.charCodeAt(i) - s.charCodeAt(i - 1) !== dir) { if (i - st >= len) return rng(st, i); st = i; }
  }
  return null;
}
function validDate(s6) {
  const d = +s6.slice(0, 2), m = +s6.slice(2, 4), y = +s6.slice(4);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= (m === 2 && y % 4 === 0 ? 29 : DIM[m - 1]);
}
function monotone(s, dir) { if (s.length < 3) return false; for (let i = 1; i < s.length; i++) if ((s.charCodeAt(i) - s.charCodeAt(i - 1)) * dir <= 0) return false; return true; }
function digitCount(s) { const c = new Array(10).fill(0); for (let i = 0; i < s.length; i++) c[s.charCodeAt(i) - 48]++; return c; }

/* Badge: [id, nome, descrizione, test → indici evidenziati o null, badge che include] */
const DIGIT_NAMES = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
const BADGES = [
  ['pari', 'Pari', 'Divisibile per 2: l\'ultima cifra è pari.', (n, s) => yes(n % 2 === 0, LAST(s, 1))],
  ['dispari', 'Dispari', 'Non divisibile per 2: l\'ultima cifra è dispari.', (n, s) => yes(n % 2 === 1, LAST(s, 1))],
  ['cinque', 'Multiplo di 5', 'Finisce con 0 o 5.', (n, s) => yes(n % 5 === 0, LAST(s, 1))],
  ['tondo', 'Cifra tonda', 'Finisce con 0.', (n, s) => yes(n > 0 && n % 10 === 0, LAST(s, 1)), ['cinque', 'pari']],
  ['cento', 'Centinaio esatto', 'Finisce con 00.', (n, s) => yes(n > 0 && n % 100 === 0, LAST(s, 2)), ['tondo']],
  ['mille', 'Migliaio esatto', 'Finisce con 000.', (n, s) => yes(n > 0 && n % 1000 === 0, LAST(s, 3)), ['cento']],
  ['nove', 'Radice nove', 'Sommando le cifre più volte si arriva a 9.', (n, s) => yes(n > 0 && n % 9 === 0, ALL(s))],
  ['harshad', 'Harshad', 'Divisibile per la somma delle sue cifre.', (n, s, s6, ds) => yes(n > 0 && n % ds === 0, ALL(s))],
  ['blackjack', 'Blackjack', 'La somma delle cifre fa esattamente 21.', (n, s, s6, ds) => yes(ds === 21, ALL(s))],
  ['primo', 'Primo', 'Divisibile solo per 1 e per sé stesso.', (n, s) => yes(isPrime(n), ALL(s))],
  ['gemello', 'Primo gemello', 'È primo, e anche il numero 2 più su o 2 più giù è primo.', (n, s) => yes(isPrime(n) && ((n >= 2 && isPrime(n - 2)) || isPrime(n + 2)), ALL(s)), ['primo']],
  ['quadrato', 'Quadrato perfetto', 'È un numero moltiplicato per sé stesso (k × k).', (n, s) => yes(isSq(n), ALL(s))],
  ['cubo', 'Cubo perfetto', 'È k × k × k.', (n, s) => yes(CUBES.has(n), ALL(s))],
  ['triangolare', 'Triangolare', 'È la somma 1 + 2 + 3 + … + k.', (n, s) => yes(isSq(8 * n + 1), ALL(s))],
  ['fibonacci', 'Fibonacci', 'Fa parte della successione 1, 1, 2, 3, 5, 8, 13…', (n, s) => yes(FIB.has(n), ALL(s))],
  ['pot2', 'Potenza di 2', 'È 2 moltiplicato per sé stesso un certo numero di volte.', (n, s) => yes(POW2.has(n), ALL(s))],
  ['fattoriale', 'Fattoriale', 'È 1 × 2 × 3 × … × k.', (n, s) => yes(FACT.has(n), ALL(s))],
  ['perfetto', 'Numero perfetto', 'È uguale alla somma dei suoi divisori.', (n, s) => yes(PERFECT.has(n), ALL(s))],
  ['narciso', 'Narcisista', 'È uguale alla somma delle sue cifre elevate al numero di cifre.', (n, s) => {
    if (n < 10) return null; let t = 0; const L = s.length; for (const c of s) t += (+c) ** L; return yes(t === n, ALL(s)); }],
  ['palindromo', 'Palindromo', 'Si legge uguale da sinistra e da destra.', (n, s) => yes(s.length > 1 && s === [...s].reverse().join(''), ALL(s))],
  ['specchio', 'Specchio', 'Le prime tre cifre si ripetono uguali (abc abc).', (n, s) => yes(s.length === 6 && s.slice(0, 3) === s.slice(3), ALL(s))],
  ['capovolto', 'Capovolgibile', 'Girando il numero di 180° si legge uguale.', (n, s) => {
    if (s.length < 2) return null; let r = ''; for (let i = s.length - 1; i >= 0; i--) { const m = STROBO[s[i]]; if (!m) return null; r += m; } return yes(r === s, ALL(s)); }],
  ['mono', 'Monocromo', 'Tutte le cifre sono uguali.', (n, s) => yes(s.length > 1 && sameRuns(s, s.length).length === 1, ALL(s)), ['palindromo', 'cinquina', 'poker', 'tris', 'doppietta']],
  ['ripetuta', 'Ripetizione', 'Almeno una cifra compare due volte, anche lontana.', (n, s) => {
    const c = digitCount(s); for (let d = 0; d < 10; d++) if (c[d] >= 2) return ALL(s).filter(i => +s[i] === d); return null; }],
  ['doppietta', 'Doppietta', 'Due cifre uguali una accanto all\'altra.', (n, s) => { const r = sameRuns(s, 2); return r.length ? r[0] : null; }, ['ripetuta']],
  ['doppiacoppia', 'Doppia coppia', 'Due gruppi separati di cifre uguali vicine.', (n, s) => { const r = sameRuns(s, 2); return r.length >= 2 ? r.flat() : null; }, ['doppietta']],
  ['tris', 'Tris', 'Tre cifre uguali di fila.', (n, s) => { const r = sameRuns(s, 3); return r.length ? r[0] : null; }, ['doppietta']],
  ['full', 'Full', 'Tre cifre uguali di fila più un\'altra coppia vicina.', (n, s) => {
    const r = sameRuns(s, 2); return r.length >= 2 && r.some(x => x.length >= 3) ? r.flat() : null; }, ['tris', 'doppiacoppia']],
  ['poker', 'Poker', 'Quattro cifre uguali di fila.', (n, s) => { const r = sameRuns(s, 4); return r.length ? r[0] : null; }, ['tris']],
  ['cinquina', 'Cinquina', 'Cinque cifre uguali di fila.', (n, s) => { const r = sameRuns(s, 5); return r.length ? r[0] : null; }, ['poker']],
  ['doppioasso', 'Doppio asso', 'Esattamente due 1 e nessun\'altra cifra ripetuta.', (n, s) => {
    const c = digitCount(s); if (c[1] !== 2) return null; for (let d = 0; d < 10; d++) if (d !== 1 && c[d] > 1) return null;
    return ALL(s).filter(i => s[i] === '1'); }, ['ripetuta']],
  ['diverse', 'Tutte diverse', 'Sei cifre e nessuna si ripete.', (n, s) => yes(s.length === 6 && new Set(s).size === 6, ALL(s))],
  ['vicini', 'Vicini di casa', 'Due cifre vicine che differiscono di 1 (es. 45 o 98).', (n, s) => stepRun(s, 2)],
  ['scala3', 'Scaletta', 'Tre cifre consecutive di fila (es. 345 o 987).', (n, s) => stepRun(s, 3), ['vicini']],
  ['scala4', 'Scala', 'Quattro cifre consecutive di fila.', (n, s) => stepRun(s, 4), ['scala3']],
  ['scala5', 'Scala lunga', 'Cinque cifre consecutive di fila.', (n, s) => stepRun(s, 5), ['scala4']],
  ['scala6', 'Scala reale', 'Sei cifre consecutive di fila (es. 123456).', (n, s) => stepRun(s, 6), ['scala5']],
  ['salita', 'In salita', 'Ogni cifra è più grande di quella prima.', (n, s) => yes(monotone(s, 1), ALL(s))],
  ['discesa', 'In discesa', 'Ogni cifra è più piccola di quella prima.', (n, s) => yes(monotone(s, -1), ALL(s))],
  ['partbassa', 'Partenza bassa', 'La prima cifra è più piccola dell\'ultima.', (n, s) => yes(s.length > 1 && s[0] < s[s.length - 1], [0, s.length - 1])],
  ['partalta', 'Partenza alta', 'La prima cifra è più grande dell\'ultima.', (n, s) => yes(s.length > 1 && s[0] > s[s.length - 1], [0, s.length - 1])],
  ['solopari', 'Solo pari', 'Tutte le cifre sono pari.', (n, s) => yes(s.length > 1 && /^[02468]+$/.test(s), ALL(s))],
  ['solodispari', 'Solo dispari', 'Tutte le cifre sono dispari.', (n, s) => yes(s.length > 1 && /^[13579]+$/.test(s), ALL(s))],
  ['alte', 'Alta quota', 'Tutte le cifre vanno da 5 a 9.', (n, s) => yes(s.length > 1 && /^[5-9]+$/.test(s), ALL(s))],
  ['basse', 'Bassa marea', 'Tutte le cifre vanno da 0 a 4.', (n, s) => yes(s.length > 1 && /^[0-4]+$/.test(s), ALL(s))],
  ['binario', 'Binario', 'Scritto solo con 0 e 1.', (n, s) => yes(n > 1 && /^[01]+$/.test(s), ALL(s))],
  ['senzazeri', 'Senza zeri', 'Sei cifre e nessuno zero.', (n, s) => yes(s.length === 6 && s.indexOf('0') < 0, ALL(s))],
  ['seicifre', 'Sei cifre', 'Ha esattamente sei cifre.', (n, s) => yes(s.length === 6, ALL(s))],
  ['cinquecifre', 'Cinque cifre', 'Ha esattamente cinque cifre.', (n, s) => yes(s.length === 5, ALL(s))],
  ['quattrocifre', 'Quattro cifre', 'Ha esattamente quattro cifre.', (n, s) => yes(s.length === 4, ALL(s))],
  ['basso', 'Rasoterra', 'È minore di 1.000.', (n, s) => yes(n < 1000, ALL(s))],
  ['data', 'Calendario', 'Si legge come una data GG/MM/AA.', (n, s, s6) => yes(validDate(s6), ALL(s))],
  ['orario', 'Orologio', 'Si legge come un orario HH:MM:SS.', (n, s, s6) => yes(+s6.slice(0, 2) < 24 && +s6.slice(2, 4) < 60 && +s6.slice(4) < 60, ALL(s))],
  ...DIGIT_NAMES.map((nm, d) => [`solo${d}`, `Un solo ${d}`, `Contiene esattamente un ${d}.`, (n, s) => {
    const k = s.indexOf(String(d)); return k >= 0 && s.indexOf(String(d), k + 1) < 0 ? [k] : null; }]),
  ['tredici', 'Tredici', 'Contiene 13.', (n, s) => has(s, '13')],
  ['diciassette', 'Diciassette', 'Contiene 17, il numero sfortunato all\'italiana.', (n, s) => has(s, '17')],
  ['risposta', 'La Risposta', 'Contiene 42, la risposta a tutto.', (n, s) => has(s, '42')],
  ['nice', 'Nice', 'Contiene 69.', (n, s) => has(s, '69')],
  ['emergenza', 'Emergenza', 'Contiene 112, il numero unico di emergenza.', (n, s) => has(s, '112')],
  ['soccorso', 'Pronto soccorso', 'Contiene 118.', (n, s) => has(s, '118')],
  ['errore', 'Errore 404', 'Contiene 404: pagina non trovata.', (n, s) => has(s, '404')],
  ['erba', 'Quattro e venti', 'Contiene 420.', (n, s) => has(s, '420')],
  ['bestia', 'Numero della bestia', 'Contiene 666.', (n, s) => has(s, '666')],
  ['jackpot', 'Jackpot', 'Contiene 777.', (n, s) => has(s, '777')],
  ['leet', 'Leet', 'Contiene 1337.', (n, s) => has(s, '1337')],
  ['unita', 'Unità d\'Italia', 'Contiene 1861.', (n, s) => has(s, '1861')],
  ['pi', 'Pi greco', 'Contiene 3141, l\'inizio di π.', (n, s) => has(s, '3141')],
  ['eulero', 'Eulero', 'Contiene 2718, l\'inizio di e.', (n, s) => has(s, '2718')],
  ['aureo', 'Sezione aurea', 'Contiene 1618, l\'inizio di φ.', (n, s) => has(s, '1618')],
  ['zero', 'Zero assoluto', 'Esattamente 0.', (n, s) => yes(n === 0, ALL(s)), ['pari', 'basso', 'solo0']],
  ['milione', 'Il Milione', 'Esattamente 1.000.000, il numero più alto.', (n, s) => yes(n === MAX, ALL(s)), ['mille', 'cinquina', 'binario']],
];
const NB = BADGES.length;
const IDX = Object.fromEntries(BADGES.map((b, i) => [b[0], i]));
/* Chiusura transitiva: quali badge sono "inclusi" in ciascun badge */
const CL = BADGES.map((b, i) => {
  const seen = new Set(), stack = [...(b[4] || [])].map(id => IDX[id]);
  while (stack.length) { const j = stack.pop(); if (seen.has(j)) continue; seen.add(j); for (const id of BADGES[j][4] || []) stack.push(IDX[id]); }
  return seen;
});

function hits(n) {
  const s = String(n), s6 = s.length >= 6 ? s.slice(-6) : s.padStart(6, '0');
  let ds = 0; for (let i = 0; i < s.length; i++) ds += s.charCodeAt(i) - 48;
  const out = [];
  for (let i = 0; i < NB; i++) { const h = BADGES[i][3](n, s, s6, ds); if (h) out.push([i, h]); }
  return out;
}

/* ---------- Statistiche su tutti i numeri ---------- */
const STATS_KEY = 'cifrario_stats_v2';
const BIN = t => Math.floor(Math.log10(Math.max(1, t)) * 200);
let EP = [], BTIER = [], COUNTS = [], HIST = null, ABOVE = null;
function badgeTier(p) { return p > .1 ? 1 : p > .01 ? 2 : p > .001 ? 3 : p > .0001 ? 4 : p > .00001 ? 5 : 6; }
const epOf = c => c ? Math.round(100 * N / c) : 0;
function topTotal(ids, ep) {
  let t = 0;
  for (const i of ids) { let covered = false; for (const j of ids) if (j !== i && CL[j].has(i)) { covered = true; break; } if (!covered) t += ep[i]; }
  return t;
}
function finish(counts, hist) {
  COUNTS = counts; EP = counts.map(epOf); BTIER = counts.map(c => badgeTier(c / N));
  HIST = hist; ABOVE = new Float64Array(hist.length + 1);
  for (let i = hist.length - 1; i >= 0; i--) ABOVE[i] = ABOVE[i + 1] + hist[i];
}
const tick = () => new Promise(r => setTimeout(r, 0));
async function buildStats(onProgress) {
  const cached = store.get(STATS_KEY, null);
  if (cached && cached.nb === NB && cached.counts.length === NB) { finish(cached.counts, cached.hist); return; }
  const CH = 25000;
  const counts = new Array(NB).fill(0), lists = new Array(N);
  for (let a = 0; a < N; a += CH) {
    const b = Math.min(N, a + CH);
    for (let n = a; n < b; n++) { const l = hits(n).map(h => h[0]); lists[n] = l; for (const i of l) counts[i]++; }
    onProgress && onProgress(a / N * .85); await tick();
  }
  const ep = counts.map(epOf), hist = new Array(1700).fill(0);
  for (let n = 0; n < N; n++) hist[BIN(topTotal(lists[n], ep))]++;
  onProgress && onProgress(1);
  store.set(STATS_KEY, { nb: NB, counts, hist });
  finish(counts, hist);
}

function score(n) {
  const all = hits(n), earned = new Set(all.map(h => h[0]));
  const covered = new Set();
  for (const [i] of all) for (const j of CL[i]) if (earned.has(j)) covered.add(j);
  const top = all.filter(h => !covered.has(h[0])).sort((a, b) => EP[b[0]] - EP[a[0]]);
  const assigned = new Set();
  const cards = top.map(([i, hl]) => {
    const kids = [...CL[i]].filter(j => earned.has(j) && !assigned.has(j)).sort((a, b) => EP[b] - EP[a]);
    kids.forEach(j => assigned.add(j));
    return { i, hl, kids };
  });
  const total = cards.reduce((t, c) => t + EP[c.i], 0);
  const b = BIN(total);
  const topFrac = Math.max(1 / N, (ABOVE[b + 1] + HIST[b] / 2) / N);
  const tier = topFrac > .99 ? 0 : topFrac > .5 ? 1 : topFrac > .25 ? 2 : topFrac > .1 ? 3 : topFrac > .05 ? 4 : topFrac > .01 ? 5 : 6;
  return { n, s: String(n), cards, earned: [...earned], total, topFrac, tier };
}
const pctTxt = f => { const p = f * 100; return p.toLocaleString('it-IT', { maximumFractionDigits: p < 1 ? 3 : p < 10 ? 2 : 1 }) + '%'; };

/* ---------- Casualità ---------- */
function rollNumber() {
  const lim = Math.floor(4294967296 / N) * N, buf = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(buf); if (buf[0] < lim) return buf[0] % N; }
}


export { BADGES, NB, IDX, hits, buildStats, score, pctTxt, rollNumber, EP, BTIER, COUNTS, store };
