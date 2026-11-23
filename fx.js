// Effetti speciali: esplosioni di cifre, scosse, lampi, cuori, cifre fluttuanti sullo sfondo.
// Tutto si spegne se il sistema chiede di ridurre il movimento.
export const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#ffb437';
const tierColor = t => css(`--r${t}`);

/* ---------- Tela per le particelle, sopra a tutto ---------- */
let cv, cx, parts = [], running = false;
function ensureCanvas() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.className = 'fx-layer';
  document.body.appendChild(cv);
  cx = cv.getContext('2d');
  const fit = () => { const d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; cx.setTransform(d, 0, 0, d, 0, 0); };
  fit(); addEventListener('resize', fit);
}
function loop() {
  if (!parts.length) { running = false; cx.clearRect(0, 0, cv.width, cv.height); return; }
  running = true;
  cx.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();
  parts = parts.filter(p => now - p.born < p.life);
  for (const p of parts) {
    const k = (now - p.born) / p.life;
    p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx; p.y += p.vy; p.rot += p.spin;
    cx.save();
    cx.globalAlpha = Math.max(0, 1 - k * k);
    cx.translate(p.x, p.y); cx.rotate(p.rot);
    cx.fillStyle = p.color;
    if (p.kind === 'digit') { cx.font = `600 ${p.size}px "IBM Plex Mono", monospace`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(p.ch, 0, 0); }
    else if (p.kind === 'heart') { cx.font = `${p.size}px system-ui, sans-serif`; cx.textAlign = 'center'; cx.fillText('♥', 0, 0); }
    else if (p.kind === 'spark') { cx.fillRect(-p.size / 2, -p.size / 6, p.size, p.size / 3); }
    else { cx.beginPath(); cx.arc(0, 0, p.size / 2, 0, Math.PI * 2); cx.fill(); }
    cx.restore();
  }
  requestAnimationFrame(loop);
}
function emit(list) {
  if (calm) return;
  ensureCanvas();
  parts.push(...list);
  if (parts.length > 900) parts.splice(0, parts.length - 900);
  if (!running) requestAnimationFrame(loop);
}
const rnd = (a, b) => a + Math.random() * (b - a);

/** Esplosione di cifre e scintille dal centro di un elemento. tier 0–6 decide colore e quantità. */
export function burst(el, tier, digits = '0123456789') {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const n = [6, 10, 18, 30, 55, 85, 140][tier] || 12;
  const colors = tier >= 6 ? ['#ff4d6d', '#ffb437', '#ffe14d', '#3fc27e', '#5a9bff', '#b57bff'] : [tierColor(tier), '#ffffff', tierColor(tier)];
  const power = 3 + tier * 1.4, now = performance.now(), list = [];
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(power * .4, power * 1.6);
    const kind = i % 3 === 0 ? 'digit' : i % 3 === 1 ? 'spark' : 'dot';
    list.push({
      kind, ch: digits[Math.floor(Math.random() * digits.length)], x: x + rnd(-r.width / 3, r.width / 3), y: y + rnd(-10, 10),
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - rnd(1, 3), g: .16, drag: .985, rot: rnd(0, 6), spin: rnd(-.25, .25),
      size: kind === 'digit' ? rnd(14, 26 + tier * 2) : rnd(4, 9), color: colors[i % colors.length], born: now, life: rnd(900, 1500 + tier * 180)
    });
  }
  emit(list);
}

/** Pioggia di cifre dall'alto, per i tiri Mitici. */
export function rain(tier) {
  const now = performance.now(), list = [];
  const colors = ['#ff4d6d', '#ffb437', '#ffe14d', '#3fc27e', '#5a9bff', '#b57bff'];
  for (let i = 0; i < 120; i++) list.push({
    kind: i % 2 ? 'digit' : 'spark', ch: String(i % 10), x: rnd(0, innerWidth), y: rnd(-200, -10),
    vx: rnd(-1, 1), vy: rnd(2, 6), g: .05, drag: .995, rot: rnd(0, 6), spin: rnd(-.1, .1),
    size: i % 2 ? rnd(16, 30) : rnd(5, 10), color: tier >= 6 ? colors[i % colors.length] : tierColor(tier), born: now + rnd(0, 400), life: rnd(2200, 3400)
  });
  emit(list);
}

/** Cuoricini che volano via da un pulsante. */
export function hearts(el) {
  const r = el.getBoundingClientRect(), now = performance.now(), list = [];
  for (let i = 0; i < 12; i++) list.push({
    kind: 'heart', x: r.left + r.width / 2, y: r.top + r.height / 2, vx: rnd(-2.5, 2.5), vy: rnd(-5, -2), g: .08, drag: .98,
    rot: rnd(-.4, .4), spin: rnd(-.05, .05), size: rnd(12, 22), color: i % 3 ? css('--r5') : '#ff8fab', born: now, life: rnd(700, 1200)
  });
  emit(list);
}

/** Scossa della pagina. */
export function shake(strength = 1) {
  if (calm) return;
  const el = document.querySelector('.wrap');
  el.style.setProperty('--shake', strength);
  el.classList.remove('shaking'); void el.offsetWidth; el.classList.add('shaking');
  setTimeout(() => el.classList.remove('shaking'), 650);
}

/** Lampo a tutto schermo. */
export function flash(color = '#ffffff') {
  if (calm) return;
  const f = document.createElement('div');
  f.className = 'fx-flash'; f.style.background = color;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

/** Reazione completa a un tiro: dipende da quanto è raro. */
export function celebrate(reelsEl, tier) {
  if (calm) return;
  const logo = document.querySelector('.brand .logo');
  if (logo) { logo.classList.remove('spin'); void logo.offsetWidth; logo.classList.add('spin'); }
  reelsEl.classList.remove('mythic', 'hot');
  if (tier >= 2) burst(reelsEl, tier);
  if (tier >= 4) reelsEl.classList.add('hot');
  if (tier >= 5) shake(tier === 6 ? 1.6 : 1);
  if (tier >= 6) { flash('#fff4d6'); reelsEl.classList.add('mythic'); setTimeout(() => rain(tier), 250); }
}

/* ---------- Cifre fluttuanti sullo sfondo ---------- */
export function ambient() {
  if (calm) return;
  const c = document.createElement('canvas');
  c.className = 'fx-bg'; c.setAttribute('aria-hidden', 'true');
  document.body.prepend(c);
  const g = c.getContext('2d');
  let W, H, items = [];
  const fit = () => {
    const d = devicePixelRatio || 1; W = innerWidth; H = innerHeight;
    c.width = W * d; c.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
    const n = Math.round(W * H / 28000);
    items = Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(0, H), v: rnd(.12, .45), s: rnd(12, 34), ch: String(Math.floor(rnd(0, 10))), a: rnd(.03, .09), w: rnd(0, 6) }));
  };
  fit(); addEventListener('resize', fit);
  const step = t => {
    if (!document.hidden) {
      g.clearRect(0, 0, W, H);
      g.fillStyle = css('--accent');
      g.textAlign = 'center';
      for (const it of items) {
        it.y -= it.v; if (it.y < -40) { it.y = H + 40; it.x = rnd(0, W); it.ch = String(Math.floor(rnd(0, 10))); }
        g.globalAlpha = it.a;
        g.font = `600 ${it.s}px "IBM Plex Mono", monospace`;
        g.fillText(it.ch, it.x + Math.sin(t / 1800 + it.w) * 12, it.y);
      }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Inclinazione 3D delle carte sotto il mouse ---------- */
export function tilt(selector) {
  if (calm || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', e => {
    const card = e.target.closest(selector); if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - .5) * -12}deg`);
    card.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - .5) * 14}deg`);
    card.style.setProperty('--mx', `${(e.clientX - r.left) / r.width * 100}%`);
  });
  document.addEventListener('pointerout', e => {
    const card = e.target.closest(selector);
    if (card && !card.contains(e.relatedTarget)) { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); }
  });
}
