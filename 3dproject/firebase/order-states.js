'use strict';
/* Categorías de pedido compartidas por 3DCalc y 3DTracker.
   Fuente de verdad en Firestore: orders/{código}.calc_status ('pendiente' | 'activo' | 'finalizado' | 'rechazado')
   junto con calc_synced_at (ms). Gana el cambio con calc_synced_at más reciente: 3DCalc escribe al cambiar
   el estado de un pedido y 3DTracker escribe al reclasificarlo; cada app aplica lo que escribió la otra. */
(function(){
  var KEYS = ['activo', 'pendiente', 'finalizado', 'rechazado'];            // orden de las secciones, como en Pedidos de 3DCalc
  var CALC = { activo: 'Activo', pendiente: 'Pendiente', finalizado: 'Finalizado', rechazado: 'Rechazado' };
  var INFO = {
    activo:     { label: 'Activo',     plural: 'Activos',     css: 'partial',  color: '#4D9FFF' },
    pendiente:  { label: 'Pendiente',  plural: 'Pendientes',  css: 'pending',  color: '#F4B740' },
    finalizado: { label: 'Finalizado', plural: 'Finalizados', css: 'done',     color: '#34D399' },
    rechazado:  { label: 'Rechazado',  plural: 'Rechazados',  css: 'rejected', color: '#FF6B8A' }
  };
  function stepsDone(o) { var s = o && o.order_steps; return Array.isArray(s) && s.length > 0 && s.every(function(x){ return x.status === 'done'; }); }
  /* Categoría de un pedido de 3DTracker. Los de 3DCalc traen calc_status; los creados a mano en el
     tracker (sin él) se consideran activos, o finalizados si todas sus etapas están hechas. */
  function keyOf(o) {
    var s = o && o.calc_status;
    if (s === 'archivado') return 'finalizado';
    if (INFO[s]) return s;
    return stepsDone(o) ? 'finalizado' : 'activo';
  }
  window.DPOrderStates = { KEYS: KEYS, INFO: INFO, CALC: CALC, keyOf: keyOf, stepsDone: stepsDone,
    /* 'Activo' → 'activo'; null si no es una categoría válida */
    fromCalc: function(e){ for (var k in CALC) if (CALC[k] === e) return k; return null; } };
})();
