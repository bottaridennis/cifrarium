// Parte online: accesso Google, profili, tiri condivisi, classifiche, feed, amici.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection, query, where,
  orderBy, limit, serverTimestamp, increment, arrayUnion, arrayRemove, documentId
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = firebaseConfig.firestoreDatabaseId ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : getFirestore(app);

export let me = null;        // utente Firebase
export let profile = null;   // documento users/{uid}

const chunks = (arr, k) => { const o = []; for (let i = 0; i < arr.length; i += k) o.push(arr.slice(i, i + k)); return o; };
const pairId = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), x => CODE_CHARS[x % CODE_CHARS.length]).join('');

export function onUser(cb) {
  onAuthStateChanged(auth, async u => {
    me = u; profile = null;
    if (u) { const s = await getDoc(doc(db, 'users', u.uid)); profile = s.exists() ? s.data() : null; }
    cb(me, profile);
  });
}
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

/* ---------- Profilo ---------- */
export const validName = n => /^[A-Za-z0-9_]{3,20}$/.test(n);
export async function createProfile(username) {
  const lower = username.toLowerCase();
  const taken = await getDoc(doc(db, 'usernames', lower));
  if (taken.exists()) throw new Error('Questo nome utente è già preso.');
  const data = {
    username, usernameLower: lower, color: '#8c45d4', fav: [], friendCode: newCode(),
    lifetime: 0, rolls: 0, badges: {}, badgeCount: 0, lastDate: '', createdAt: serverTimestamp()
  };
  const b = writeBatch(db);
  b.set(doc(db, 'usernames', lower), { uid: me.uid });
  b.set(doc(db, 'users', me.uid), data);
  await b.commit();
  profile = { ...data };
  return profile;
}
export async function saveProfile(patch) {
  await updateDoc(doc(db, 'users', me.uid), patch);
  Object.assign(profile, patch);
}
export async function getProfiles(uids) {
  const out = {};
  for (const c of chunks([...new Set(uids)], 30)) {
    const s = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', c)));
    s.forEach(d => { out[d.id] = d.data(); });
  }
  return out;
}

/* ---------- Tiri ---------- */
export async function myRolls() {
  const s = await getDocs(query(collection(db, 'rolls'), where('uid', '==', me.uid)));
  const out = {}; s.forEach(d => { const r = d.data(); out[r.date] = r.n; });
  return out;
}
// sc = risultato di score(n); badgeIds = id di tutti i badge ottenuti
export async function publishRoll(date, sc, badgeIds, cardIds) {
  const rid = `${me.uid}_${date}`;
  const badges = { ...(profile.badges || {}) };
  for (const id of badgeIds) badges[id] = (badges[id] || 0) + 1;
  const b = writeBatch(db);
  b.set(doc(db, 'rolls', rid), {
    uid: me.uid, date, n: sc.n, total: sc.total, tier: sc.tier, top: sc.topFrac, cards: cardIds.slice(0, 4),
    username: profile.username, color: profile.color, fav: profile.fav || [], likedBy: [], createdAt: serverTimestamp()
  });
  const patch = { lifetime: increment(sc.total), rolls: increment(1), badgeCount: Object.keys(badges).length, lastDate: date };
  for (const id of badgeIds) patch[`badges.${id}`] = increment(1);
  b.update(doc(db, 'users', me.uid), patch);
  await b.commit();
  profile.badges = badges; profile.badgeCount = Object.keys(badges).length;
  profile.lifetime = (profile.lifetime || 0) + sc.total; profile.rolls = (profile.rolls || 0) + 1;
}
const rollList = s => { const o = []; s.forEach(d => o.push({ id: d.id, ...d.data() })); return o; };

export async function rankToday(date, uids) {
  if (uids) {
    let o = [];
    for (const c of chunks(uids, 30)) o = o.concat(rollList(await getDocs(query(collection(db, 'rolls'), where('date', '==', date), where('uid', 'in', c)))));
    return o.sort((a, b) => b.total - a.total);
  }
  return rollList(await getDocs(query(collection(db, 'rolls'), where('date', '==', date), orderBy('total', 'desc'), limit(100))));
}
export async function rankWeek(fromDate, uids) {
  let rolls = [];
  if (uids) for (const c of chunks(uids, 30)) rolls = rolls.concat(rollList(await getDocs(query(collection(db, 'rolls'), where('uid', 'in', c), where('date', '>=', fromDate)))));
  else rolls = rollList(await getDocs(query(collection(db, 'rolls'), where('date', '>=', fromDate), limit(3000))));
  const by = {};
  for (const r of rolls) {
    const u = by[r.uid] || (by[r.uid] = { uid: r.uid, username: r.username, color: r.color, fav: r.fav, total: 0, days: 0, best: null });
    u.total += r.total; u.days++;
    if (!u.best || r.total > u.best.total) u.best = r;
  }
  return Object.values(by).sort((a, b) => b.total - a.total).slice(0, 100);
}
export async function rankUsers(field, uids) {
  if (uids) { const p = await getProfiles(uids); return Object.entries(p).map(([uid, d]) => ({ uid, ...d })).sort((a, b) => (b[field] || 0) - (a[field] || 0)); }
  const s = await getDocs(query(collection(db, 'users'), orderBy(field, 'desc'), limit(100)));
  const o = []; s.forEach(d => o.push({ uid: d.id, ...d.data() })); return o;
}
export async function feed(uids) {
  if (uids) {
    let o = [];
    for (const c of chunks(uids, 30)) o = o.concat(rollList(await getDocs(query(collection(db, 'rolls'), where('uid', 'in', c), orderBy('createdAt', 'desc'), limit(60)))));
    return o.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 60);
  }
  return rollList(await getDocs(query(collection(db, 'rolls'), orderBy('createdAt', 'desc'), limit(60))));
}
export async function toggleLike(rid, liked) {
  await updateDoc(doc(db, 'rolls', rid), { likedBy: liked ? arrayRemove(me.uid) : arrayUnion(me.uid) });
}

/* ---------- Amici ---------- */
export async function friends() {
  const s = await getDocs(query(collection(db, 'friendships'), where('members', 'array-contains', me.uid)));
  const o = []; s.forEach(d => o.push(d.data().members.find(x => x !== me.uid)));
  return o;
}
export async function requests() {
  const [inc, out] = await Promise.all([
    getDocs(query(collection(db, 'friendRequests'), where('to', '==', me.uid))),
    getDocs(query(collection(db, 'friendRequests'), where('from', '==', me.uid)))
  ]);
  return { incoming: rollList(inc), outgoing: rollList(out) };
}
export async function findByCode(code) {
  const s = await getDocs(query(collection(db, 'users'), where('friendCode', '==', code.toUpperCase().trim()), limit(1)));
  let o = null; s.forEach(d => { o = { uid: d.id, ...d.data() }; }); return o;
}
export async function searchUsers(text) {
  const t = text.toLowerCase().trim(); if (!t) return [];
  const s = await getDocs(query(collection(db, 'users'), orderBy('usernameLower'), where('usernameLower', '>=', t), where('usernameLower', '<=', t + ''), limit(20)));
  const o = []; s.forEach(d => o.push({ uid: d.id, ...d.data() })); return o;
}
export async function sendRequest(to) {
  if (to.uid === me.uid) throw new Error('Non puoi aggiungere te stesso.');
  const back = await getDoc(doc(db, 'friendRequests', `${to.uid}_${me.uid}`));
  if (back.exists()) return acceptRequest(back.data());
  await setDoc(doc(db, 'friendRequests', `${me.uid}_${to.uid}`), {
    from: me.uid, to: to.uid, fromName: profile.username, fromColor: profile.color, toName: to.username, toColor: to.color || '', createdAt: serverTimestamp()
  });
}
export async function acceptRequest(r) {
  const b = writeBatch(db);
  b.set(doc(db, 'friendships', pairId(r.from, r.to)), { members: [r.from, r.to], createdAt: serverTimestamp() });
  b.delete(doc(db, 'friendRequests', `${r.from}_${r.to}`));
  await b.commit();
}
export const dropRequest = r => deleteDoc(doc(db, 'friendRequests', `${r.from}_${r.to}`));
export const removeFriend = uid => deleteDoc(doc(db, 'friendships', pairId(uid, me.uid)));

/* ---------- Eliminazione account ---------- */
export async function deleteAccount() {
  const uid = me.uid;
  const [rolls, fr, rq1, rq2] = await Promise.all([
    getDocs(query(collection(db, 'rolls'), where('uid', '==', uid))),
    getDocs(query(collection(db, 'friendships'), where('members', 'array-contains', uid))),
    getDocs(query(collection(db, 'friendRequests'), where('to', '==', uid))),
    getDocs(query(collection(db, 'friendRequests'), where('from', '==', uid)))
  ]);
  const refs = [];
  [rolls, fr, rq1, rq2].forEach(s => s.forEach(d => refs.push(d.ref)));
  if (profile) refs.push(doc(db, 'usernames', profile.usernameLower));
  refs.push(doc(db, 'users', uid));
  for (const c of chunks(refs, 400)) { const b = writeBatch(db); c.forEach(r => b.delete(r)); await b.commit(); }
  await deleteUser(me);
}
