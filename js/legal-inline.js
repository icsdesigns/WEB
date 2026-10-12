/* Textos legales dentro del formulario: los enlaces <a data-legal href="/…/privacidad/"> abren
   una ventana con el contenido de la página legal (sin salir del formulario). Sin JS, el enlace
   funciona como un enlace normal. Reutilizable por cualquier formulario. */
(function () {
  var dlg, cuerpo, titulo, ultimo, cache = {};

  function crear() {
    dlg = document.createElement('dialog');
    dlg.className = 'legal-dlg';
    dlg.setAttribute('aria-labelledby', 'legalDlgTitulo');
    dlg.innerHTML = '<div class="legal-dlg__cab"><h2 id="legalDlgTitulo"></h2>' +
      '<button type="button" class="legal-dlg__cerrar" aria-label="Cerrar">&times;</button></div>' +
      '<div class="legal-dlg__cuerpo prose"></div>' +
      '<div class="legal-dlg__pie"><a class="legal-dlg__abrir" target="_blank" rel="noopener">Abrir en otra pestaña</a>' +
      '<button type="button" class="legal-dlg__ok">Entendido</button></div>';
    document.body.appendChild(dlg);
    cuerpo = dlg.querySelector('.legal-dlg__cuerpo');
    titulo = dlg.querySelector('h2');
    dlg.querySelector('.legal-dlg__cerrar').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('.legal-dlg__ok').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { if (ultimo) ultimo.focus(); });
  }

  function cargar(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var art = doc.querySelector('article.prose') || doc.querySelector('main');
      if (!art) throw new Error('sin contenido');
      var h1 = doc.querySelector('h1');
      return (cache[url] = { titulo: h1 ? h1.textContent.trim() : '', html: art.innerHTML });
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-legal]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || typeof HTMLDialogElement === 'undefined') return;
    e.preventDefault();
    if (!dlg) crear();
    ultimo = a;
    var url = a.getAttribute('href');
    titulo.textContent = a.getAttribute('data-titulo') || a.textContent;
    dlg.querySelector('.legal-dlg__abrir').href = url;
    cuerpo.innerHTML = '<p>Cargando…</p>';
    dlg.showModal();
    cuerpo.scrollTop = 0;
    cargar(url).then(function (d) { cuerpo.innerHTML = d.html; })
      .catch(function () { cuerpo.innerHTML = '<p>No se ha podido cargar el texto. <a href="' + url + '" target="_blank" rel="noopener">Ábrelo en otra pestaña</a>.</p>'; });
  });
})();
