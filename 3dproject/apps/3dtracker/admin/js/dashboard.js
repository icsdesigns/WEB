'use strict';
/* ================================================
   dashboard.js — Panel principal de pedidos
   ================================================ */

let apiConfig  = null;
let allOrders  = [];
let searchTerm = '';

// ── API helper ────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${apiConfig.baseUrl}${path}`;
  const res  = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiConfig.apiKey,
      ...(options.headers || {})
    }
  });
  const json = await res.json();
  if (!res.ok) {
    let msg = json.error;
    if (!msg && json.errors && Array.isArray(json.errors)) {
      msg = json.errors.map(e => e.msg).join('; ');
    }
    throw new Error(msg || `Error ${res.status}`);
  }
  return json.data;
}

// ── Toast ─────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

// ── Formatear fecha ───────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ── Estado del pedido ─────────────────────────
// Mismas categorías que Pedidos de 3DCalc (activo / pendiente / finalizado / rechazado), definidas en
// firebase/order-states.js. El estado vive en orders/{código}.calc_status y lo comparten ambas apps.
const ST = window.DPOrderStates;
let showAll = { finalizado: false, rechazado: false };   // como «Ver todos» de 3DCalc: finalizados y rechazados muestran 3
const FIN_N = 3;

function getOrderStatus(order) {
  const k = ST.keyOf(order);
  return { key: k, label: ST.INFO[k].label, css: ST.INFO[k].css };
}

// Reclasifica un pedido: lo escribe en Firestore y 3DCalc lo aplica al recibirlo.
async function setOrderState(code, key) {
  const o = allOrders.find(x => x.order_code === code || x.id === code);
  if (!o || !ST.INFO[key] || ST.keyOf(o) === key) { renderTable(filterOrders(searchTerm)); return; }
  const campos = { calc_status: key, calc_synced_at: Date.now() };
  if (key === 'activo' && !o.activated_at) campos.activated_at = new Date().toISOString();
  try {
    await window.DPCloud.updateOrder(o.id, campos);
    Object.assign(o, campos);
    showToast('Pedido ' + o.order_code + ' → ' + ST.INFO[key].label.toLowerCase(), 'success');
  } catch (e) {
    showToast('No se pudo cambiar el estado: ' + (e.message || e), 'error');
  }
  updateStats(allOrders);
  renderTable(filterOrders(searchTerm));
}
window.setOrderState = setOrderState;
window.toggleGroup = function (k) { showAll[k] = !showAll[k]; renderTable(filterOrders(searchTerm)); };

// ── Días que lleva activo ─────────────────────
// Cuenta desde que se activó el pedido en 3DTracker hasta que se completan
// todas las etapas (a partir de ahí el número queda congelado).
function activeDaysLabel(order){
  // Pendientes o rechazados en 3DCalc: aún no han empezado, no cuentan días.
  if (!order.activated_at && (order.calc_status === 'pendiente' || order.calc_status === 'rechazado')) return '—';
  const ini = order.activated_at || order.created_at;
  if (!ini) return '—';
  const desde = new Date(ini);
  if (isNaN(desde)) return '—';
  const steps = Array.isArray(order.order_steps) ? order.order_steps : null;
  let fin = null;
  if (steps && steps.length && typeof steps[0] === 'object' && 'status' in steps[0]) {
    const todas = steps.every(s => s.status === 'done');
    if (todas) {
      const ts = steps.map(s => new Date(s.completed_at || s.updated_at || 0).getTime()).filter(Boolean);
      if (ts.length) fin = new Date(Math.max(...ts));
    }
  }
  const hasta = fin || new Date();
  const dias = Math.max(0, Math.round((hasta - desde) / 86400000));
  return dias + (fin ? ' (fin)' : '');
}

// ── Renderizar tabla ──────────────────────────
function renderTable(orders) {
  const tbody     = document.getElementById('orders-tbody');
  const table     = document.getElementById('orders-table');
  const emptyEl   = document.getElementById('table-empty');
  const loadingEl = document.getElementById('table-loading');

  loadingEl.style.display = 'none';

  if (!orders || orders.length === 0) {
    table.style.display   = 'none';
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display  = 'none';
  table.style.display    = '';

  const stateSelect = (order, status) => `<select class="state-sel" style="color:${ST.INFO[status.key].color}" onclick="event.stopPropagation()" onchange="setOrderState('${escapeHtml(order.order_code)}', this.value)">${
    ST.KEYS.map(k => `<option value="${k}"${k === status.key ? ' selected' : ''}>${ST.INFO[k].label}</option>`).join('')}</select>`;
  const rowHtml = order => {
    const status = getOrderStatus(order);
    const stepsArr = order.order_steps;
    const count = Array.isArray(stepsArr) ? (stepsArr[0]?.count ?? stepsArr.length) : 0;

    return `
      <tr data-id="${order.id}" data-code="${order.order_code}">
        <td data-label="Código"><span class="code-cell">${escapeHtml(order.order_code)}</span></td>
        <td data-label="Cliente">${escapeHtml(order.customer_name || '—')}</td>
        <td data-label="Descripción" style="color:var(--text-secondary);">${escapeHtml(order.description || '—')}</td>
        <td data-label="Pasos" style="color:var(--text-secondary);">${count}</td>
        <td data-label="Días activo" style="color:var(--text-secondary);">${activeDaysLabel(order)}</td>
        <td data-label="Estado">${stateSelect(order, status)}</td>
        <td data-label="Fecha de creación" style="color:var(--text-muted);">${formatDate(order.created_at)}</td>
        <td data-label="" style="text-align:center;width:46px"><button class="ord-del" title="Eliminar pedido" onclick="event.stopPropagation();deleteOrderUI('${order.id}','${escapeHtml(order.order_code)}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg></button></td>
      </tr>`;
  };
  // Secciones en el mismo orden y con las mismas categorías que Pedidos de 3DCalc
  let html = '';
  ST.KEYS.forEach(k => {
    const list = orders.filter(o => ST.keyOf(o) === k);
    if (!list.length) return;
    const limited = (k === 'finalizado' || k === 'rechazado') && list.length > FIN_N;
    const shown = limited && !showAll[k] ? list.slice(0, FIN_N) : list;
    html += `<tr class="grp-row"><td colspan="8"><div class="grp-h"><i style="background:${ST.INFO[k].color}"></i>${ST.INFO[k].plural} <span class="grp-n">(${list.length})</span>${
      limited ? `<button class="grp-more" onclick="event.stopPropagation();toggleGroup('${k}')">${showAll[k] ? 'Ver menos' : 'Ver todos'}</button>` : ''}</div></td></tr>`;
    html += shown.map(rowHtml).join('');
  });
  tbody.innerHTML = html;

  // Click en fila → navegar al detalle
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', async () => {
      await window.electronAPI.setSharedData({
        orderId:   row.dataset.id,
        orderCode: row.dataset.code
      });
      await window.electronAPI.navigate('order-detail');
    });
  });
}

// ── Actualizar stats ──────────────────────────
function updateStats(orders) {
  const n = {}; ST.KEYS.forEach(k => n[k] = 0);
  (orders || []).forEach(o => { n[ST.keyOf(o)]++; });
  ST.KEYS.forEach(k => { document.getElementById('stat-' + k).textContent = n[k]; });
}

// ── Filtrar pedidos ───────────────────────────
function filterOrders(term) {
  if (!term) return allOrders;
  const q = term.toLowerCase();
  return allOrders.filter(o =>
    o.order_code.toLowerCase().includes(q) ||
    (o.customer_email || '').toLowerCase().includes(q) ||
    (o.description || '').toLowerCase().includes(q) ||
    (o.customer_name  || '').toLowerCase().includes(q)
  );
}

// ── Cargar pedidos ────────────────────────────
async function loadOrders() {
  document.getElementById('table-loading').style.display = '';
  document.getElementById('orders-table').style.display  = 'none';
  document.getElementById('table-empty').style.display   = 'none';

  try {
    allOrders = await window.DPCloud.listOrders();
    await autoPurgeCompleted();
    updateStats(allOrders);
    renderTable(filterOrders(searchTerm));
  } catch (err) {
    document.getElementById('table-loading').style.display = 'none';
    showToast(`Error al cargar pedidos: ${err.message}`, 'error');
  }
}

// ── Borrado manual + autopurgado de completados (>30 días) ──
function _orderCompletedAt(o){
  var s=o.order_steps; if(!Array.isArray(s)||!s.length)return null;
  if(!s.every(function(x){return x.status==='done';}))return null;
  var t=0; s.forEach(function(x){ var dd=x.updated_at?new Date(x.updated_at).getTime():0; if(dd>t)t=dd; }); return t||null;
}
async function autoPurgeCompleted(){
  try{
    if(!(window.DPCloud&&window.DPCloud.deleteOrder))return;
    var cutoff=Date.now()-30*24*3600*1000, del=[];
    (allOrders||[]).forEach(function(o){ var c=_orderCompletedAt(o); if(c && c<cutoff) del.push(o); });
    if(!del.length)return;
    await Promise.all(del.map(function(o){ return window.DPCloud.deleteOrder(o.id).catch(function(){}); }));
    var rm={}; del.forEach(function(o){rm[o.id]=1;});
    allOrders=allOrders.filter(function(o){return !rm[o.id];});
  }catch(e){}
}
window.deleteOrderUI=async function(id,code){
  if(!confirm('¿Eliminar el pedido '+code+'? Esta acción no se puede deshacer.'))return;
  try{ await window.DPCloud.deleteOrder(id); showToast('Pedido '+code+' eliminado','success'); loadOrders(); }
  catch(e){ showToast('No se pudo eliminar: '+(e.message||e),'error'); }
};

// ── Modal: Nuevo pedido ───────────────────────
function openNewOrderModal() {
  document.getElementById('new-order-modal').style.display = '';
  document.getElementById('new-email').focus();
}

function closeNewOrderModal() {
  document.getElementById('new-order-modal').style.display = 'none';
  document.getElementById('new-email').value        = '';
  document.getElementById('new-name').value         = '';
  document.getElementById('new-description').value  = '';
}

async function createOrder() {
  const email       = document.getElementById('new-email').value.trim();
  const name        = document.getElementById('new-name').value.trim();
  const description = document.getElementById('new-description').value.trim();
  const btn         = document.getElementById('create-order-btn');

  if (!email) {
    document.getElementById('new-email').focus();
    showToast('El email del cliente es obligatorio.', 'error');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Creando...';

  try {
    const order = await window.DPCloud.createOrder({ customer_email: email, customer_name: name, description: description });

    closeNewOrderModal();
    showToast(`✅ Pedido ${order.order_code} creado.`, 'success');
    await loadOrders();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Crear pedido';
  }
}

// ── Búsqueda en tiempo real ───────────────────
document.getElementById('search-input').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  renderTable(filterOrders(searchTerm));
});


// ── Cerrar modal al hacer clic fuera ─────────
document.getElementById('new-order-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('new-order-modal')) closeNewOrderModal();
});

// ── Init ──────────────────────────────────────
async function init() {
  apiConfig = await window.electronAPI.getApiConfig();
  await loadOrders();
  if (window.DPCloud && window.DPCloud.watchOrders) { try { window.DPCloud.watchOrders(function(){ loadOrders(); }); } catch(e){} }
}

function openWebsite() {
  if (apiConfig && apiConfig.frontendUrl) {
    window.open(apiConfig.frontendUrl, '_blank');
  }
}

init();

// Exponer funciones globales llamadas desde el HTML
window.loadOrders      = loadOrders;
window.openNewOrderModal  = openNewOrderModal;
window.closeNewOrderModal = closeNewOrderModal;
window.createOrder     = createOrder;
window.openWebsite     = openWebsite;

window.toggleSidebar = function(){ var l=document.querySelector(".app-layout"); if(l) l.classList.toggle("side-collapsed"); };
