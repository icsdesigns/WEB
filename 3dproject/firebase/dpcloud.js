// ============================================================
//  DPCloud  —  Capa de nube compartida de 3DProject (Firebase)
// ------------------------------------------------------------
//  Inicializa Firebase (Authentication + Firestore) y expone
//  una API sencilla en  window.DPCloud  para que TODAS las apps
//  del ecosistema la usen sin saber nada de Firebase.
//
//  No necesitas editar este archivo. Solo rellena
//  firebase-config.js siguiendo la guía.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, orderBy, where, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, FIREBASE_LISTO } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// "ready" se resuelve cuando Firebase ha restaurado la sesión
// (así currentUser() ya es fiable antes de pedir datos).
const ready = new Promise((resolve) => {
  setPersistence(auth, browserLocalPersistence).catch(() => {}).then(() => {
    const unsub = onAuthStateChanged(auth, () => { unsub(); resolve(); });
  });
});

// ── utilidades ──
function genCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return "3DP-" + s;
}
function ts(v) {
  try { return v && v.toDate ? v.toDate().toISOString() : (v || null); }
  catch (e) { return null; }
}
async function _steps(code) {
  const snap = await getDocs(query(collection(db, "orders", code, "steps"), orderBy("order_index", "asc")));
  return snap.docs.map(d => ({ id: d.id, order_id: code, ...d.data(), updated_at: ts(d.data().updated_at) }));
}

// ── PEDIDOS (colección "orders"; el ID del documento ES el código) ──
async function listOrders() {
  const snap = await getDocs(query(collection(db, "orders"), orderBy("created_at", "desc")));
  const orders = snap.docs.map(d => ({ id: d.id, ...d.data(), created_at: ts(d.data().created_at) }));
  // Adjuntar etapas para que el panel muestre el estado real.
  await Promise.all(orders.map(async o => { try { o.order_steps = await _steps(o.id); } catch (e) { o.order_steps = []; } }));
  return orders;
}
async function createOrder({ customer_email, customer_name, description, order_code }) {
  const code = order_code || genCode();
  await setDoc(doc(db, "orders", code), {
    order_code: code,
    customer_email: customer_email || "",
    customer_name:  customer_name  || "",
    description:    description     || "",
    created_at: serverTimestamp()
  });
  return { id: code, order_code: code, customer_email, customer_name, description };
}
// Actualiza campos sueltos del pedido (lo usa 3DCalc para sincronizar su estado).
async function updateOrder(code, fields) {
  if (!code) return;
  await updateDoc(doc(db, "orders", code), { ...fields, updated_at: serverTimestamp() });
}
async function getOrderById(code) { return getOrderByCode(code); }
async function getOrderByCode(code) {
  const d = await getDoc(doc(db, "orders", code));
  if (!d.exists()) return null;
  return { id: d.id, ...d.data(), created_at: ts(d.data().created_at), order_steps: await _steps(code) };
}
async function addStep(code, { step_name, order_index }) {
  await addDoc(collection(db, "orders", code, "steps"), {
    step_name, order_index: Number.isFinite(order_index) ? order_index : 0,
    status: "pending", created_at: serverTimestamp(), updated_at: serverTimestamp()
  });
}
async function setStepStatus(code, stepId, status) {
  await updateDoc(doc(db, "orders", code, "steps", stepId), { status, updated_at: serverTimestamp() });
}
async function updateStep(code, stepId, fields) {
  await updateDoc(doc(db, "orders", code, "steps", stepId), { ...fields, updated_at: serverTimestamp() });
}
async function deleteStep(code, stepId) {
  await deleteDoc(doc(db, "orders", code, "steps", stepId));
}
async function deleteOrder(code) {
  try { const snap = await getDocs(collection(db, "orders", code, "steps")); await Promise.all(snap.docs.map(d => deleteDoc(d.ref))); } catch (e) {}
  await deleteDoc(doc(db, "orders", code));
}

// ── FEEDBACK ──
async function listFeedback() {
  const snap = await getDocs(query(collection(db, "feedback"), orderBy("created", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function addFeedback(d) {
  const ref = await addDoc(collection(db, "feedback"), {
    app: d.app, type: d.type, title: d.title, detail: d.detail || "",
    status: "active", created: Date.now()
  });
  return ref.id;
}
async function updateFeedback(id, d) { await updateDoc(doc(db, "feedback", id), d); }
async function deleteFeedback(id)    { await deleteDoc(doc(db, "feedback", id)); }

// ── REAUTENTICACIÓN ──
// Comprueba la contraseña del usuario que tiene la sesión abierta SIN cambiar de sesión
// (se usa para confirmar cambios delicados, p. ej. la Configuración de 3DCalc).
// Resuelve {ok:true} si es correcta; si no, {ok:false, code, message}. Los invitados
// (sesión anónima, sin email) no pueden reautenticarse: devuelve code 'no-email'.
async function reauth(password) {
  const u = auth.currentUser;
  if (!u) return { ok: false, code: "no-user", message: "No hay ninguna sesión abierta." };
  if (!u.email) return { ok: false, code: "no-email", message: "Esta sesión no tiene correo (invitado): no se puede confirmar con contraseña." };
  if (!password) return { ok: false, code: "empty", message: "Escribe la contraseña." };
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, String(password)));
    return { ok: true };
  } catch (e) {
    const c = (e && e.code) || "error";
    const wrong = (c === "auth/wrong-password" || c === "auth/invalid-credential" || c === "auth/invalid-login-credentials");
    return { ok: false, code: c, message: wrong ? "Contraseña incorrecta." : (c === "auth/too-many-requests" ? "Demasiados intentos: espera un momento y vuelve a probar." : "No se pudo comprobar la contraseña (" + c + ").") };
  }
}

// ── ESTADO DE APPS (PrintFlow, 3DPlanner…) por usuario ──
async function loadState(appKey) {
  const u = auth.currentUser; if (!u) return null;
  const d = await getDoc(doc(db, "users", u.uid, "appState", appKey));
  return d.exists() ? d.data().data : null;
}
async function saveState(appKey, data, updated) {
  const u = auth.currentUser; if (!u) { console.warn("[DPCloud] saveState sin sesión:", appKey); return; }
  let clean; try { clean = JSON.parse(JSON.stringify(data)); } catch (e) { clean = data; }
  await setDoc(doc(db, "users", u.uid, "appState", appKey), { data: clean, updated: updated || Date.now() });
}
// Escucha en vivo del estado de una app (sincroniza entre dispositivos al instante)
function watchState(appKey, cb) {
  const u = auth.currentUser; if (!u) return function(){};
  try {
    return onSnapshot(doc(db, "users", u.uid, "appState", appKey),
      (snap) => { cb(snap.exists() ? snap.data() : null); },
      (err) => { console.warn("watchState " + appKey, err && err.message); });
  } catch (e) { return function(){}; }
}

// ── PLANTILLAS de etapas (colección "presets") ──
async function listPresets() {
  const snap = await getDocs(query(collection(db, "presets"), orderBy("created", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function createPreset({ name, steps }) {
  const ref = await addDoc(collection(db, "presets"), { name: name, steps: steps || [], created: Date.now() });
  return ref.id;
}
async function deletePreset(id) { await deleteDoc(doc(db, "presets", id)); }

// ── Escuchas en vivo de colecciones (sincronización instantánea) ──
function watchOrders(cb) {
  const u = auth.currentUser; if (!u) return function(){};
  try { return onSnapshot(query(collection(db, "orders"), orderBy("created_at", "desc")),
    () => cb(), (err) => console.warn("watchOrders", err && err.message)); }
  catch (e) { return function(){}; }
}
function watchFeedback(cb) {
  const u = auth.currentUser; if (!u) return function(){};
  try { return onSnapshot(query(collection(db, "feedback"), orderBy("created", "desc")),
    () => cb(), (err) => console.warn("watchFeedback", err && err.message)); }
  catch (e) { return function(){}; }
}
function watchOrderByCode(code, cb) {
  try {
    const u1 = onSnapshot(doc(db, "orders", code), () => cb(), () => {});
    const u2 = onSnapshot(collection(db, "orders", code, "steps"), () => cb(), () => {});
    return function(){ try{u1();}catch(e){} try{u2();}catch(e){} };
  } catch (e) { return function(){}; }
}

// ── SOLICITUDES WEB (colección "pedidos_web") ──
// «Solicitar presupuesto» de la web crea un documento por solicitud (id = localizador sin «#»).
// 3DCalc los escucha mientras importado == false y, tras guardarlos como pedido, los marca importados.
// Solo con sesión de verdad: un invitado (anónimo) no escucha (las reglas exigen sesión).
function watchWebOrders(cb, onErr) {
  const u = auth.currentUser; if (!u || u.isAnonymous) return function(){};
  try {
    return onSnapshot(query(collection(db, "pedidos_web"), where("importado", "==", false)),
      (snap) => { cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => { console.warn("watchWebOrders", err && err.message); if (onErr) { try { onErr(err); } catch (e) {} } });
  } catch (e) { return function(){}; }
}
async function markWebOrderImported(id) {
  if (!id) return;
  await updateDoc(doc(db, "pedidos_web", id), { importado: true, importado_en: serverTimestamp() });
}

window.DPCloud = {
  ready, configured: FIREBASE_LISTO,
  login:  (email, pwd) => signInWithEmailAndPassword(auth, email, pwd),
  loginGuest: () => signInAnonymously(auth),
  logout: () => signOut(auth),
  onAuth: (cb) => onAuthStateChanged(auth, cb),
  currentUser: () => auth.currentUser,
  reauth,
  listOrders, createOrder, updateOrder, getOrderById, getOrderByCode,
  addStep, setStepStatus, updateStep, deleteStep, deleteOrder,
  listFeedback, addFeedback, updateFeedback, deleteFeedback,
  loadState, saveState, watchState, watchOrders, watchFeedback, watchOrderByCode,
  listPresets, createPreset, deletePreset,
  watchWebOrders, markWebOrderImported
};
window.dispatchEvent(new Event("dpcloud-ready"));
