/* ============================================================
   SILAB 3D · Reseñas de Google (sin terceros)
   Lee las reseñas directamente de la API oficial de Google
   (Places API New) y las pinta en #googleReviews.
   Configuración en la página:  window.SILAB_GOOGLE_REVIEWS = {...}
   Requiere una clave de Google Cloud con "Maps JavaScript API"
   y "Places API (New)" habilitadas (y facturación activada).
   Nota: la API de Google devuelve un máximo de 5 reseñas.
   ============================================================ */
(function () {
  var cfg = window.SILAB_GOOGLE_REVIEWS || {};
  var wrap = document.getElementById('googleReviews');
  if (!wrap) return;

  function status(msg) { wrap.innerHTML = '<p class="gr-status">' + msg + '</p>'; }

  if (!cfg.apiKey || String(cfg.apiKey).indexOf('PEGA_AQUI') === 0) {
    status('Configura tu clave de Google Maps API (window.SILAB_GOOGLE_REVIEWS.apiKey) para ver las reseñas.');
    return;
  }

  // Cargador oficial de Google Maps JS (bootstrap)
  (g => { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement("script")); e.set("libraries", [...r] + ""); for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]); e.set("callback", c + ".maps." + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + " could not load.")); a.nonce = m.querySelector("script[nonce]")?.nonce || ""; m.head.append(a) })); d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)) })({ key: cfg.apiKey, v: "weekly" });

  function stars(rating, cls) {
    var full = Math.round(rating || 0), s = '';
    for (var i = 1; i <= 5; i++) s += '<span class="gr-star' + (i <= full ? '' : ' off') + '">★</span>';
    return '<div class="gr-stars' + (cls ? ' ' + cls : '') + '">' + s + '</div>';
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(place) {
    var reviews = place.reviews || [];
    var header = '<div class="gr-summary">' +
        '<div class="gr-score">' + (place.rating ? place.rating.toFixed(1) : '–') + '</div>' +
        '<div class="gr-summary-info">' + stars(place.rating) +
          '<div class="gr-count">' + (place.userRatingCount || 0) + ' reseñas en Google</div>' +
        '</div></div>';
    var cards;
    if (!reviews.length) {
      cards = '<p class="gr-status">Aún no hay reseñas para mostrar.</p>';
    } else {
      cards = '<div class="gr-grid">' + reviews.map(function (rv) {
        var a = rv.authorAttribution || {};
        var photo = a.photoURI
          ? '<img class="gr-avatar" src="' + esc(a.photoURI) + '" alt="" referrerpolicy="no-referrer" width="44" height="44">'
          : '<div class="gr-avatar gr-avatar-ph">' + esc((a.displayName || '?').charAt(0)) + '</div>';
        var txt = rv.text ? '<p class="gr-text">' + esc(rv.text) + '</p>' : '';
        return '<article class="gr-card">' +
            '<div class="gr-card-head">' + photo +
              '<div><div class="gr-author">' + esc(a.displayName || 'Usuario de Google') + '</div>' +
              '<div class="gr-when">' + esc(rv.relativePublishTimeDescription || '') + '</div></div>' +
            '</div>' + stars(rv.rating, 'sm') + txt +
          '</article>';
      }).join('') + '</div>';
    }
    wrap.innerHTML = header + cards;
  }

  async function init(Place) {
    try {
      var place;
      if (cfg.placeId) {
        place = new Place({ id: cfg.placeId });
      } else {
        var res = await Place.searchByText({ textQuery: cfg.placeQuery || 'SILAB 3D', fields: ['id'], maxResultCount: 1 });
        if (!res.places || !res.places.length) {
          status('No se encontró el negocio en Google. Revisa placeQuery o usa placeId.');
          return;
        }
        place = res.places[0];
      }
      await place.fetchFields({ fields: ['displayName', 'rating', 'userRatingCount', 'reviews', 'googleMapsURI'] });
      render(place);
    } catch (e) {
      console.error('Google Reviews:', e);
      status('No se pudieron cargar las reseñas. Revisa la clave/API en Google Cloud y la consola del navegador.');
    }
  }

  status('Cargando reseñas de Google…');
  google.maps.importLibrary('places')
    .then(function (lib) { init(lib.Place); })
    .catch(function (e) { console.error(e); status('No se pudo cargar Google Maps. Revisa la clave de API.'); });
})();
