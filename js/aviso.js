/* ============================================================
   SILAB 3D · Aviso compacto de términos (páginas rediseñadas).
   Misma clave que el resto del sitio para que no reaparezca.
   ============================================================ */
(function () {
  var box = document.getElementById('termsPopup');
  if (!box) return;
  var KEY = 'silab_terms_accepted';
  var seen = null;
  try { seen = localStorage.getItem(KEY); } catch (e) {}
  if (!seen) setTimeout(function () { box.classList.add('show'); }, 1800);

  var ok = document.getElementById('acceptTerms');
  var close = document.getElementById('rejectTerms');
  if (ok) ok.addEventListener('click', function () {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    box.dataset.cerrado = '1';
    box.classList.remove('show');
  });
  if (close) close.addEventListener('click', function () { box.dataset.cerrado = '1'; box.classList.remove('show'); });
})();
