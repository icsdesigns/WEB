// Script para cargar y mostrar materiales desde filamentos.json
document.addEventListener('DOMContentLoaded', async function() {
    // Navbar siempre visible (anclada)

    // Cargar materiales si estamos en la página de materiales
    const materialesGrid = document.getElementById('materialesGrid');
    if (materialesGrid) {
        try {
            const response = await fetch('../data/filamentos.json');
            const data = await response.json();
            const filamentos = Array.isArray(data.filamentos) ? data.filamentos : [];
            void filamentos;
        } catch (error) {
            console.error('Error cargando materiales:', error);
        }
    }
    function generateContactURLs(productName, category) {
        const whatsappMessage = `¡Hola! Me gustaría obtener más información acerca de ${productName}.`;
        const emailSubject = `Consulta sobre ${productName}`;
        const emailBody = `¡Hola!%0D%0A%0D%0AMe gustaría obtener más información acerca de ${productName}.%0D%0A%0D%0AGracias.`;

        return {
            whatsapp: `https://wa.me/34644070487?text=${encodeURIComponent(whatsappMessage)}`,
            email: `https://mail.google.com/mail/?view=cm&fs=1&to=silab3d@gmail.com&su=${encodeURIComponent(emailSubject)}&body=${emailBody}`
        };
    }

    const buyButtons = document.querySelectorAll('[data-product]');
    const modal = document.getElementById('quoteContactModal');
    const closeModal = document.querySelector('.quote-contact-modal-close');
    const modalWhatsApp = document.getElementById('quoteModalWhatsApp');
    const modalEmail = document.getElementById('quoteModalEmail');

    // Abrir configurador o modal según el producto
    if (buyButtons.length > 0) {
        buyButtons.forEach(button => {
            button.addEventListener('click', function() {
                const productName = this.getAttribute('data-product');
                const category = this.getAttribute('data-category');

                if (productName === 'Palomitera de Yoshi') {
                    openPalomiteraRequestFlow();
                    return;
                }

                if (shouldRedirectToConfigurator(productName)) {
                    const configuratorURL = new URL('/configura-tu-proyecto/', window.location.origin);

                    if (productName) {
                        configuratorURL.searchParams.set('producto', productName);
                    }

                    if (category) {
                        configuratorURL.searchParams.set('categoria', category);
                    }

                    window.location.href = configuratorURL.toString();
                    return;
                }

                const urls = generateContactURLs(productName, category);

                if (modalWhatsApp) {
                    modalWhatsApp.href = urls.whatsapp;
                }
                if (modalEmail) {
                    modalEmail.href = urls.email;
                }

                if (modal) {
                    modal.classList.add('active');
                }
            });
        });
    }

    if (closeModal) {
        closeModal.addEventListener('click', function() {
            if (modal) {
                modal.classList.remove('active');
            }
        });
    }

    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }

    // Cerrar modal con tecla Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (modal && modal.classList.contains('active')) modal.classList.remove('active');
            if (libraryModal && libraryModal.classList.contains('active')) libraryModal.classList.remove('active');
        }
    });

    // Modal Bibliotecas 3D
    const libraryModal = document.getElementById('libraryModal');
    const btnExplorar = document.getElementById('btnExplorarBibliotecas');
    const libraryModalClose = document.getElementById('libraryModalClose');

    if (btnExplorar && libraryModal) {
        btnExplorar.addEventListener('click', function() {
            libraryModal.classList.add('active');
        });
    }
    if (libraryModalClose) {
        libraryModalClose.addEventListener('click', function() {
            libraryModal.classList.remove('active');
        });
    }
    if (libraryModal) {
        libraryModal.addEventListener('click', function(e) {
            if (e.target === libraryModal) libraryModal.classList.remove('active');
        });
    }
    const quoteFormModal = document.getElementById('quoteFormModal');
    const quoteContactModal = document.getElementById('quoteContactModal');
    const quoteForm = document.getElementById('quoteForm');
    const quoteModalClose = document.querySelector('.quote-modal-close');
    const quoteContactModalClose = document.querySelector('.quote-contact-modal-close');
    const btnPresupuesto = document.querySelector('.btn-presupuesto');
    const quoteModalWhatsApp = document.getElementById('quoteModalWhatsApp');
    const quoteModalEmail = document.getElementById('quoteModalEmail');

    // Abrir modal de formulario al hacer clic en "Solicita tu presupuesto"
    if (btnPresupuesto && quoteFormModal && btnPresupuesto.getAttribute('href') === '#') {
        btnPresupuesto.addEventListener('click', function(e) {
            e.preventDefault();
            quoteFormModal.classList.add('active');
        });
    }

    // Abrir modal desde el botón móvil del menú hamburguesa
    const btnPresupuestoMobile = document.getElementById('btnPresupuestoMobile');
    if (btnPresupuestoMobile && quoteFormModal && btnPresupuestoMobile.getAttribute('href') === '#') {
        btnPresupuestoMobile.addEventListener('click', function(e) {
            e.preventDefault();
            quoteFormModal.classList.add('active');
            // Cerrar menú hamburguesa
            const hamburgerMenu = document.getElementById('hamburgerMenu');
            const mobileMenu = document.getElementById('mobileMenu');
            if (hamburgerMenu && mobileMenu) {
                hamburgerMenu.classList.remove('active');
                mobileMenu.classList.remove('active');
            }
        });
    }

    // Cerrar modales
    if (quoteModalClose) {
        quoteModalClose.addEventListener('click', function() {
            quoteFormModal.classList.remove('active');
        });
    }

    if (quoteContactModalClose) {
        quoteContactModalClose.addEventListener('click', function() {
            quoteContactModal.classList.remove('active');
        });
    }

    // Cerrar modales al hacer clic fuera
    if (quoteFormModal) {
        quoteFormModal.addEventListener('click', function(e) {
            if (e.target === quoteFormModal) {
                quoteFormModal.classList.remove('active');
            }
        });
    }

    if (quoteContactModal) {
        quoteContactModal.addEventListener('click', function(e) {
            if (e.target === quoteContactModal) {
                quoteContactModal.classList.remove('active');
            }
        });
    }

    // Manejar envío del formulario
    if (quoteForm) {
        quoteForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Obtener datos del formulario
            const customerName = document.getElementById('customerName').value;
            const customerContact = document.getElementById('customerContact').value;
            const projectName = document.getElementById('projectName').value;
            const projectDescription = document.getElementById('projectDescription').value;

            // Generar mensajes personalizados para WhatsApp
            const whatsappMessage = `¡Hola!

Mi nombre es *${customerName}*. Me gustaría solicitar un presupuesto para el siguiente proyecto:

- *Nombre del Proyecto:*
${projectName}

- *Descripción:*
${projectDescription}

- *Datos de Contacto:*
${customerContact}

Quedo a la espera de respuesta. ¡Muchas gracias!`;
            
            // Generar mensajes personalizados para Email
            const emailSubject = `Solicitud de Presupuesto - ${projectName}`;
            const emailBody = `¡Hola!%0D%0A%0D%0AMi nombre es ${customerName}. Me gustaría solicitar un presupuesto para el siguiente proyecto:%0D%0A%0D%0A━━━━━━━━━━━━━━━━━━━━━━━━━━%0D%0A%0D%0A- NOMBRE DEL PROYECTO:%0D%0A${projectName}%0D%0A%0D%0A- DESCRIPCIÓN:%0D%0A${projectDescription}%0D%0A%0D%0A- DATOS DE CONTACTO:%0D%0A${customerContact}%0D%0A%0D%0A━━━━━━━━━━━━━━━━━━━━━━━━━━%0D%0A%0D%0AQuedo a la espera de respuesta.%0D%0A%0D%0A¡Muchas gracias!%0D%0A%0D%0A${customerName}`;

            // Actualizar URLs
            const whatsappURL = `https://wa.me/34644070487?text=${encodeURIComponent(whatsappMessage)}`;
            const emailURL = `https://mail.google.com/mail/?view=cm&fs=1&to=silab3d@gmail.com&su=${encodeURIComponent(emailSubject)}&body=${emailBody}`;
            
            quoteModalWhatsApp.href = whatsappURL;
            quoteModalEmail.href = emailURL;

            // Agregar event listeners para los clics
            quoteModalWhatsApp.onclick = function(e) {
                e.preventDefault();
                window.open(whatsappURL, '_blank');
                quoteContactModal.classList.remove('active');
            };

            quoteModalEmail.onclick = function(e) {
                e.preventDefault();
                window.open(emailURL, '_blank');
                quoteContactModal.classList.remove('active');
            };

            // Cambiar al modal de opciones de contacto
            quoteFormModal.classList.remove('active');
            quoteContactModal.classList.add('active');
        });
    }

    // Cerrar modales con tecla Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (quoteFormModal && quoteFormModal.classList.contains('active')) {
                quoteFormModal.classList.remove('active');
            }
            if (quoteContactModal && quoteContactModal.classList.contains('active')) {
                quoteContactModal.classList.remove('active');
            }
        }
    });

    // Sistema de Pop-up de Términos y Condiciones
    const termsPopup = document.getElementById('termsPopup');
    const acceptTermsBtn = document.getElementById('acceptTerms');
    const rejectTermsBtn = document.getElementById('rejectTerms');

    // Popup promocional Palomitera
    const isIndexPage = window.location.pathname === '/' || window.location.pathname.toLowerCase().endsWith('/index.html') || window.location.pathname.toLowerCase().endsWith('/indexv2.html');
    // Rutas absolutas: con las URLs limpias (sin /pages/ ni .html) funcionan
    // igual sea cual sea la profundidad de la página actual.
    const imagePrefix = '/img/';
    let palomiteraFlowReady = false;
    let palomiteraRequestModal = null;
    let palomiteraContactModal = null;
    let palomiteraRequestForm = null;
    let palomiteraRequestCloseBtn = null;
    let palomiteraContactCloseBtn = null;
    let palomiteraRequestColorButtons = [];
    let palomiteraRequestColorSections = null;
    let palomiteraRequestSelectedColor = null;
    let palomiteraRequestName = null;
    let palomiteraRequestModel = null;
    let palomiteraContactWhatsApp = null;
    let palomiteraContactEmail = null;
    let palomiteraCatalogCache = null;
    let palomiteraActiveColorGroup = 'pla-basico';
    let palomiteraPrevBodyOverflow = '';
    let palomiteraPrevHtmlOverflow = '';
    let palomiteraPrevBodyPosition = '';
    let palomiteraPrevBodyTop = '';
    let palomiteraPrevBodyWidth = '';
    let palomiteraPrevBodyPaddingRight = '';
    let palomiteraScrollTop = 0;
    let palomiteraScrollBlocker = null;

    function suppressPalomiteraPopupForMinutes(minutes) {
        try {
            const until = Date.now() + (minutes || 20) * 60 * 1000;
            localStorage.setItem('got_popup_suppress_until', String(until));
        } catch (e) {
            // ignore storage errors
        }
    }

    function shouldShowPalomiteraPopup() {
        // Solo mostrar en la página de index
        if (!isIndexPage) return false;
        
        try {
            const suppressUntil = Number(localStorage.getItem('got_popup_suppress_until') || 0);
            if (Date.now() < suppressUntil) return false;
        } catch (e) {}
        return true; // show on index page when not suppressed
    }

    async function loadPalomiteraCatalog() {
        if (palomiteraCatalogCache) {
            return palomiteraCatalogCache;
        }

        try {
            const catalogPath = '/data/filamentos.json';
            const response = await fetch(catalogPath, { cache: 'no-store' });
            if (!response.ok) {
                palomiteraCatalogCache = { 'pla-basico': [], 'pla-premium': [] };
                return palomiteraCatalogCache;
            }

            const data = await response.json();
            const filamentos = Array.isArray(data.filamentos) ? data.filamentos : [];
            const catalog = { 'pla-basico': [], 'pla-premium': [] };

            filamentos.forEach((material) => {
                if (!material || String(material.nombre || '').toUpperCase() !== 'PLA') {
                    return;
                }

                const colors = Array.isArray(material.colores) ? material.colores : [];
                colors.forEach((color) => {
                    const normalized = normalizePalomiteraColor(color);
                    if (normalized.isPremium) {
                        catalog['pla-premium'].push(normalized);
                    } else {
                        catalog['pla-basico'].push(normalized);
                    }
                });
            });

            palomiteraCatalogCache = catalog;
            return palomiteraCatalogCache;
        } catch (error) {
            palomiteraCatalogCache = { 'pla-basico': [], 'pla-premium': [] };
            return palomiteraCatalogCache;
        }
    }

    function normalizePalomiteraColor(color) {
        const name = String(color && color.nombre ? color.nombre : 'Color');
        const rawHex = color && color.hex;
        const hexList = Array.isArray(rawHex) ? rawHex : [rawHex || '#cccccc'];
        const isPremium = Boolean(color && color.premium) || hexList.length > 1 || /(silk|marble|marmol|mármol|seda)/i.test(name);
        const swatch = hexList.length > 1 ? 'linear-gradient(135deg, ' + hexList.join(', ') + ')' : hexList[0];

        return {
            id: slugify(name + '-' + hexList.join('-')),
            name: name,
            swatch: swatch,
            isPremium: isPremium,
            offer: Boolean(color && color.offer)
        };
    }

    function slugify(value) {
        return String(value)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function createPalomiteraRequestModal() {
        // Create wrapper element that will act as the overlay (the preview expects an element with id 'overlay')
        const wrapper = document.createElement('div');
        wrapper.id = 'overlay';
        wrapper.className = 'modal-overlay palomitera-request-modal';
        wrapper.innerHTML = '<div class="modal" style="min-height:120px;display:flex;align-items:center;justify-content:center;padding:24px;background:#fff;border-radius:12px;">Cargando...</div>';
        document.body.appendChild(wrapper);
        palomiteraRequestModal = wrapper;

                // Inline the preview modal (embedded at build time) to avoid fetch issues on file://
                if (!document.getElementById('palomitera-preview-styles')) {
                        const s = document.createElement('style');
                        s.id = 'palomitera-preview-styles';
                        s.textContent = `:root {
            --primary:       #BC556D;
            --primary-dark:  #B7516B;
            --primary-light: #F2D6DC;
            --dark:          #2F2F2F;
            --darker:        #1A1A1A;
            --white:         #FFFFFF;
            --gray-text:     #6B7280;
            --radius:        18px;
            --radius-sm:     12px;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Outfit', sans-serif;
            background:
                radial-gradient(circle at 18% 22%, rgba(188,85,109,0.18) 0%, transparent 50%),
                radial-gradient(circle at 82% 78%, rgba(242,214,220,0.4) 0%, transparent 50%),
                #f4eef0;
            min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
            padding: 24px;
        }

        @keyframes fadeInUp {
            from { opacity:0; transform:translateY(32px) scale(0.97); }
            to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes slideInRight {
            from { opacity:0; transform:translateX(40px); }
            to   { opacity:1; transform:translateX(0); }
        }
        @keyframes slideOutLeft {
            from { opacity:1; transform:translateX(0); }
            to   { opacity:0; transform:translateX(-40px); }
        }
        @keyframes float {
            0%,100% { transform: translateY(0) scale(1.0); }
            50%      { transform: translateY(-10px) scale(1.0); }
        }
        @keyframes pulse-dot {
            0%,100% { box-shadow:0 0 0 0 rgba(255,255,255,0.5); }
            50%      { box-shadow:0 0 0 6px rgba(255,255,255,0); }
        }
        @keyframes checkPop {
            0%   { transform:scale(0) rotate(-15deg); }
            70%  { transform:scale(1.25) rotate(5deg); }
            100% { transform:scale(1) rotate(0); }
        }
        .modal-overlay {
            position:fixed; inset:0;
            background:rgba(20,10,12,0.62);
            backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
            display:flex; align-items:center; justify-content:center;
            padding:20px; z-index:99999;
            overflow:hidden;
            isolation:isolate;
            overscroll-behavior:contain;
        }
        .modal {
            background:var(--white);
            border-radius:28px;
            width:100%; max-width:640px; max-height:calc(100dvh - 40px);
            overflow:hidden;
            position:relative;
            animation: fadeInUp 0.45s cubic-bezier(0.16,1,0.3,1) both;
            box-shadow: 0 40px 100px rgba(0,0,0,0.28), 0 0 0 1px rgba(188,85,109,0.12);
            display:flex; flex-direction:column;
        }
        .modal-close { position:absolute; top:16px; right:16px; width:34px; height:34px; border-radius:50%; background:rgba(255,255,255,0.2); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1rem; color:rgba(255,255,255,0.85); transition:all 0.25s; z-index:10; }
        .modal-hero { background: linear-gradient(145deg, #2b1620 0%, #3c1a28 50%, #5a2535 100%); padding:0; position:relative; overflow:hidden; flex-shrink:0; }
        .modal-hero::before { content:''; position:absolute; inset:0; background-image: radial-gradient(circle, rgba(188,85,109,0.18) 1.4px, transparent 1.4px); background-size:20px 20px; opacity:0.8; }
        .modal-hero::after { content:''; position:absolute; right:-46px; top:-52px; width:180px; height:180px; border-radius:50%; background:radial-gradient(circle at center, rgba(188,85,109,0.34) 0%, rgba(188,85,109,0.07) 62%, transparent 72%); }
        .modal-hero-inner { display:block; position:relative; z-index:1; padding:34px 34px 28px; }
        .modal-hero-text { max-width:100%; padding:0; }
        .modal-badge { display:inline-flex; align-items:center; gap:7px; background:rgba(188,85,109,0.3); color:rgba(255,255,255,0.94); padding:5px 14px; border-radius:50px; font-size:0.69rem; font-weight:700; letter-spacing:0.095em; text-transform:uppercase; margin-bottom:16px; border:1px solid rgba(188,85,109,0.45); }
        .badge-dot { width:6px; height:6px; border-radius:50%; background:var(--primary-light); animation:pulse-dot 2s infinite; }
        .modal-hero-title { font-size:clamp(1.3rem,2.7vw,1.95rem); font-weight:900; color:#fff; letter-spacing:-0.04em; line-height:1.12; margin-bottom:14px; white-space:normal; }
        .modal-hero-sub { font-size:clamp(0.84rem,1.05vw,0.95rem); color:rgba(255,255,255,0.75); line-height:1.6; max-width:100%; white-space:normal; }
        .modal-hero-text.single-line .modal-hero-title,
        .modal-hero-text.single-line .modal-hero-sub { white-space:nowrap; }
        .modal-hero-sub strong { color:rgba(255,255,255,0.88); font-weight:600; }
        .modal-hero-wave { display:block; width:100%; height:22px; background:var(--white); clip-path:ellipse(58% 100% at 50% 100%); }
        .modal-body-wrap { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; position:relative; overscroll-behavior:contain; }
        .step { padding:6px 36px 32px; }
        .step.hidden { display:none; }
        .step.leaving { animation:slideOutLeft 0.28s ease forwards; }
        .step.entering { animation:slideInRight 0.35s ease both; }
        .config-label { font-size:0.7rem; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:var(--primary); margin:26px 0 12px; display:flex; align-items:center; gap:8px; }
        .config-label::after { content:''; flex:1; height:1px; background:linear-gradient(90deg, var(--primary-light), transparent); }
        .size-cards { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .size-card { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px 14px 18px; border:2px solid #EDE0E3; border-radius:var(--radius); cursor:pointer; background:#FDFCFC; transition:all 0.28s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; user-select:none; }
        .size-card::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--primary), var(--primary-dark)); transform:scaleX(0); transform-origin:left; transition:transform 0.3s; }
        .size-card:hover::after, .size-card.selected::after { transform:scaleX(1); }
        .size-card:hover { border-color:rgba(188,85,109,0.4); background:var(--primary-light); transform:translateY(-3px); box-shadow:0 10px 28px rgba(188,85,109,0.18); }
        .size-card.selected { border-color:var(--primary); background:var(--primary-light); box-shadow:0 0 0 4px rgba(188,85,109,0.12), 0 8px 24px rgba(188,85,109,0.2); }
        .size-card.selected::before { content:'✓'; position:absolute; top:9px; right:11px; width:20px; height:20px; border-radius:50%; background:var(--primary); color:#fff; font-size:0.65rem; font-weight:900; display:flex; align-items:center; justify-content:center; animation:checkPop 0.3s ease both; }
        .size-emoji { font-size:1.9rem; line-height:1; }
        .size-name  { font-size:0.9rem; font-weight:800; color:var(--dark); }
        .size-dims  { font-size:0.72rem; color:var(--gray-text); text-align:center; line-height:1.4; }
        .toggle-cards { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .toggle-card { display:flex; flex-direction:column; align-items:center; gap:7px; padding:18px 12px; border:2px solid #EDE0E3; border-radius:var(--radius); cursor:pointer; background:#FDFCFC; transition:all 0.28s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; user-select:none; text-align:center; }
        .toggle-card::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--primary), var(--primary-dark)); transform:scaleX(0); transform-origin:left; transition:transform 0.3s; }
        .toggle-card:hover::after, .toggle-card.selected::after { transform:scaleX(1); }
        .toggle-card:hover { border-color:rgba(188,85,109,0.4); background:var(--primary-light); transform:translateY(-2px); box-shadow:0 8px 22px rgba(188,85,109,0.16); }
        .toggle-card.selected { border-color:var(--primary); background:var(--primary-light); box-shadow:0 0 0 4px rgba(188,85,109,0.1), 0 6px 18px rgba(188,85,109,0.18); }
        .toggle-card.selected::before { content:'✓'; position:absolute; top:8px; right:10px; width:18px; height:18px; border-radius:50%; background:var(--primary); color:#fff; font-size:0.6rem; font-weight:900; display:flex; align-items:center; justify-content:center; animation:checkPop 0.3s ease both; }
        .toggle-icon  { font-size:1.7rem; line-height:1; }
        .toggle-name  { font-size:0.875rem; font-weight:800; color:var(--dark); }
        .toggle-desc  { font-size:0.71rem; color:var(--gray-text); line-height:1.35; }
        .color-select-trigger { width:100%; display:flex; align-items:center; gap:12px; padding:13px 16px; border:2px solid #EDE0E3; border-radius:var(--radius-sm); background:#FDFCFC; cursor:pointer; transition:border-color 0.25s, box-shadow 0.25s; user-select:none; }
        .color-select-trigger:hover, .color-select-trigger.open { border-color:var(--primary); box-shadow:0 0 0 4px rgba(188,85,109,0.1); background:var(--white); }
        .color-select-swatch { width:26px; height:26px; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,0.18); flex-shrink:0; transition:transform 0.2s; }
        .color-select-trigger:hover .color-select-swatch { transform:scale(1.12); }
        .color-select-text { flex:1; font-size:0.95rem; font-weight:600; color:var(--dark); }
        .color-select-chevron { font-size:0.72rem; color:var(--gray-text); transition:transform 0.28s; }
        .color-select-trigger.open .color-select-chevron { transform:rotate(180deg); }
        .color-dropdown { position:absolute; left:0; right:0; background:var(--white); border:2px solid rgba(188,85,109,0.2); border-radius:var(--radius-sm); box-shadow:0 16px 48px rgba(0,0,0,0.14); z-index:50; display:none; animation:fadeInUp 0.22s ease; }
        .color-dropdown-wrap { position:relative; }
        .color-dropdown.open { display:block; }
        .color-dropdown-group { padding:10px 10px 6px; }
        .color-dropdown-group-label { font-size:0.66rem; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:var(--primary); padding:4px 8px 8px; display:block; }
        .color-dropdown-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
        .color-opt { display:flex; flex-direction:column; align-items:center; gap:5px; padding:10px 6px; border-radius:10px; cursor:pointer; transition:background 0.2s, transform 0.2s; border:2px solid transparent; }
        .color-opt:hover { background:var(--primary-light); transform:translateY(-2px); }
        .color-opt.selected { border-color:var(--primary); background:var(--primary-light); }
        .color-opt-circle { width:36px; height:36px; border-radius:50%; box-shadow:0 2px 8px rgba(0,0,0,0.16); transition:transform 0.2s; }
        .color-opt:hover .color-opt-circle { transform:scale(1.08); }
        .color-opt-name { font-size:0.67rem; font-weight:600; color:var(--dark); text-align:center; line-height:1.2; }
        .color-dropdown-divider { height:1px; background:var(--primary-light); margin:4px 10px; }
        .qty-row { display:flex; align-items:center; background:#FDFCFC; border:2px solid #EDE0E3; border-radius:var(--radius-sm); overflow:hidden; width:fit-content; }
        .qty-btn { width:46px; height:48px; display:flex; align-items:center; justify-content:center; background:none; border:none; cursor:pointer; font-size:1.3rem; color:var(--gray-text); transition:all 0.2s; font-family:inherit; }
        .qty-btn:hover { background:var(--primary-light); color:var(--primary); }
        .qty-btn:disabled { opacity:0.35; cursor:not-allowed; }
        .qty-divider { width:1px; height:28px; background:#EDE0E3; flex-shrink:0; }
        .qty-val { min-width:52px; text-align:center; font-size:1.1rem; font-weight:800; color:var(--dark); padding:0 4px; }
        .summary-strip { background:var(--primary-light); border:1.5px solid rgba(188,85,109,0.22); border-radius:var(--radius); padding:16px 20px; margin-top:28px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .summary-chips { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .summary-chip { display:inline-flex; align-items:center; gap:6px; background:var(--white); color:var(--dark); padding:5px 12px; border-radius:50px; font-size:0.78rem; font-weight:700; border:1px solid rgba(188,85,109,0.2); }
        .summary-chip-dot { width:10px; height:10px; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.18); flex-shrink:0; }
        .btn-next { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:16px; border-radius:50px; border:none; background:linear-gradient(135deg, var(--primary), var(--primary-dark)); color:#fff; font-family:'Outfit',sans-serif; font-size:1rem; font-weight:800; cursor:pointer; transition:all 0.3s; box-shadow:0 6px 24px rgba(188,85,109,0.38); margin-top:22px; position:relative; overflow:hidden; }
        .btn-next::after { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition:left 0.55s; }
        .btn-next:hover::after { left:100%; }
        .btn-next:hover { transform:translateY(-2px); box-shadow:0 12px 34px rgba(188,85,109,0.52); }
        .btn-next-arrow { transition:transform 0.3s; }
        .btn-next:hover .btn-next-arrow { transform:translateX(5px); }
        .contact-header { text-align:center; padding-top:10px; margin-bottom:8px; }
        .contact-icon-big { font-size:3rem; margin-bottom:14px; display:block; }
        .contact-title { font-size:1.45rem; font-weight:900; color:var(--dark); letter-spacing:-0.03em; margin-bottom:10px; }
        .contact-subtitle { font-size:0.9rem; color:var(--gray-text); line-height:1.6; }
        .contact-summary { background:var(--primary-light); border:1.5px solid rgba(188,85,109,0.22); border-radius:var(--radius); padding:14px 18px; margin:20px 0; display:flex; flex-wrap:wrap; gap:8px; }
        .contact-btns { display:flex; flex-direction:column; gap:12px; }
        .btn-wa { display:flex; align-items:center; justify-content:center; gap:12px; padding:16px 24px; border-radius:50px; border:none; background:#25D366; color:#fff; font-family:'Outfit',sans-serif; font-size:1rem; font-weight:800; cursor:pointer; transition:all 0.3s; box-shadow:0 6px 22px rgba(37,211,102,0.38); position:relative; overflow:hidden; }
        .btn-wa::after { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition:left 0.55s; }
        .btn-wa:hover::after { left:100%; }
        .btn-wa:hover { transform:translateY(-2px); box-shadow:0 12px 32px rgba(37,211,102,0.5); }
        .btn-email { display:flex; align-items:center; justify-content:center; gap:12px; padding:16px 24px; border-radius:50px; border:none; background:linear-gradient(135deg, var(--primary), var(--primary-dark)); color:#fff; font-family:'Outfit',sans-serif; font-size:1rem; font-weight:800; cursor:pointer; transition:all 0.3s; box-shadow:0 6px 22px rgba(188,85,109,0.38); position:relative; overflow:hidden; }
        .btn-email::after { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition:left 0.55s; }
        .btn-email:hover::after { left:100%; }
        .btn-email:hover { transform:translateY(-2px); box-shadow:0 12px 32px rgba(188,85,109,0.52); }
        .btn-icon { font-size:1.15rem; }
        .btn-back { display:flex; align-items:center; justify-content:center; gap:7px; width:fit-content; margin:16px auto 0; padding:10px 22px; border-radius:50px; background:transparent; border:1.5px solid #EDE0E3; color:var(--gray-text); font-family:'Outfit',sans-serif; font-size:0.875rem; font-weight:700; cursor:pointer; transition:all 0.25s; }
        .btn-back:hover { border-color:var(--primary); color:var(--primary); background:var(--primary-light); }
        .modal-disclaimer { text-align:center; font-size:0.77rem; color:#bbb; margin-top:14px; line-height:1.5; }
        @media(max-width:560px){ .modal-overlay { align-items:flex-start; padding:10px; } .modal { max-height:calc(100dvh - 20px); border-radius:20px; } .modal-hero-inner { padding:24px 22px 18px; } .modal-hero-text { padding:0; } .modal-badge { margin-bottom:12px; } .modal-hero-title { font-size:clamp(1.32rem,6vw,1.6rem); margin-bottom:10px; } .modal-hero-sub { font-size:0.83rem; line-height:1.5; max-width:32ch; } .modal-hero-wave { height:18px; } .step { padding:4px 22px 28px; } .color-dropdown-grid { grid-template-columns:repeat(3,1fr); } }
`;
                        document.head.appendChild(s);
                }

                // Insert modal markup directly (overlay + modal content)
                wrapper.innerHTML = `
<div class="modal" id="modal">

        <button class="modal-close" id="btnClose" aria-label="Cerrar">✕</button>

        <div class="modal-hero">
            <div class="modal-hero-inner">

                <div class="modal-hero-text">
                    <div class="modal-badge"><span class="badge-dot"></span>Producto especial</div>
                    <h2 class="modal-hero-title">Encarga tu Palomitera de Yoshi</h2>
                    <p class="modal-hero-sub">
                        Personaliza tu <strong>tamaño, color y acabado</strong>.
                        ¡No te quedes sin la tuya!
                    </p>
                </div>

            </div>

            <div class="modal-hero-wave"></div>
        </div>

        <div class="modal-body-wrap">

            <div class="step" id="step1">

                <div class="config-label">Tamaño</div>
                <div class="size-cards">
                    <div class="size-card selected" data-size="L">
                        <div class="size-emoji">🦕</div>
                        <div class="size-name">Grande</div>
                        <div class="size-dims">25 cm</div>
                    </div>
                    <div class="size-card" data-size="S">
                        <div class="size-emoji">🧸</div>
                        <div class="size-name">Pequeño</div>
                        <div class="size-dims">15 cm</div>
                    </div>
                </div>

                <div class="config-label">Montaje</div>
                <div id="assemblyGroup" class="toggle-cards">
                    <div class="toggle-card selected" data-assembly="montada"><div class="toggle-name">Montada</div><div class="toggle-desc">Lista para usar</div></div>
                    <div class="toggle-card" data-assembly="sin-montar"><div class="toggle-name">Sin montar</div><div class="toggle-desc">Para montaje en casa</div></div>
                </div>

                <div class="config-label">Entrega</div>
                <div id="deliveryGroup" class="toggle-cards">
                    <div class="toggle-card selected" data-delivery="persona"><div class="toggle-name">Recoger</div><div class="toggle-desc">En persona (Salamanca)</div></div>
                    <div class="toggle-card" data-delivery="envio"><div class="toggle-name">Enviar</div><div class="toggle-desc">Envío a domicilio</div></div>
                </div>

                <div class="config-label">Color</div>
                <div class="color-dropdown-wrap" style="position:relative; padding-bottom:10px;">
                    <button id="colorTrigger" class="color-select-trigger">
                        <div id="triggerSwatch" class="color-select-swatch" style="background:#2ecc71"></div>
                        <div id="triggerText" class="color-select-text">Verde Yoshi</div>
                        <div class="color-select-chevron">▾</div>
                    </button>

                    <div id="colorDropdown" class="color-dropdown">
                        <div class="color-dropdown-group">
                            <div class="color-dropdown-group-label">Cargando colores del catálogo...</div>
                        </div>
                    </div>
                </div>

                <div style="height:12px"></div>

                <div class="config-label">Cantidad</div>
                <div class="qty-row">
                    <button class="qty-btn" id="qtyDown">−</button>
                    <div class="qty-divider"></div>
                    <div class="qty-val" id="qtyVal">1</div>
                    <div class="qty-divider"></div>
                    <button class="qty-btn" id="qtyUp">+</button>
                </div>

                <div class="summary-strip">
                    <div class="summary-chips">
                        <div class="summary-chip">Tamaño: <strong id="sumSize">Grande</strong></div>
                        <div class="summary-chip">Color: <strong id="sumColor">Verde Yoshi</strong></div>
                        <div class="summary-chip">Cantidad: <strong id="sumQty">1</strong></div>
                    </div>
                </div>

                <button class="btn-next" id="btnNext">Siguiente <span class="btn-next-arrow">→</span></button>

            </div>

            <div class="step hidden" id="step2">

                <div class="contact-header">
                    <span class="contact-icon-big">🎉</span>
                    <h2 class="contact-title">¡Casi listo!</h2>
                    <p class="contact-subtitle">Elige cómo quieres enviarnos tu pedido.<br>Recibirás un mensaje con todos los detalles.</p>
                </div>

                <div class="contact-summary" id="contactSummary"></div>

                <div class="contact-btns">
                    <button class="btn-wa" id="btnWa"><span class="btn-icon">📱</span>Enviar por WhatsApp</button>
                    <button class="btn-email" id="btnEmail"><span class="btn-icon">📧</span>Enviar por Email</button>
                </div>

                <button class="btn-back" id="btnBack">← Modificar pedido</button>

                <p class="modal-disclaimer">Al pulsar serás redirigido a tu app con todos los detalles del pedido ya escritos.</p>

            </div>

        </div>

    </div>`;

                // Wire the modal directly so we avoid runtime errors from generated script text.
                const modal = wrapper.querySelector('#modal');
                const step1 = wrapper.querySelector('#step1');
                const step2 = wrapper.querySelector('#step2');
                const qtyDown = wrapper.querySelector('#qtyDown');
                const qtyUp = wrapper.querySelector('#qtyUp');
                const qtyVal = wrapper.querySelector('#qtyVal');
                const sumSize = wrapper.querySelector('#sumSize');
                const sumColor = wrapper.querySelector('#sumColor');
                const sumQty = wrapper.querySelector('#sumQty');
                const contactSummary = wrapper.querySelector('#contactSummary');
                const btnClose = wrapper.querySelector('#btnClose');
                const btnNext = wrapper.querySelector('#btnNext');
                const btnBack = wrapper.querySelector('#btnBack');
                const btnWa = wrapper.querySelector('#btnWa');
                const btnEmail = wrapper.querySelector('#btnEmail');
                const colorTrigger = wrapper.querySelector('#colorTrigger');
                const colorDropdown = wrapper.querySelector('#colorDropdown');
                const triggerSwatch = wrapper.querySelector('#triggerSwatch');
                const triggerText = wrapper.querySelector('#triggerText');

                const state = {
                    sizeName: 'Grande',
                    assembly: 'montada',
                    delivery: 'persona',
                    color: '#2ecc71',
                    colorName: 'Verde Yoshi',
                    qty: 1
                };

                function assemblyLabel() {
                    return state.assembly === 'montada' ? 'Montada' : 'Sin montar';
                }

                function deliveryLabel() {
                    return state.delivery === 'persona' ? 'Recoger' : 'Envío';
                }

                function updateSummary() {
                    if (sumSize) sumSize.textContent = state.sizeName;
                    if (sumColor) sumColor.textContent = state.colorName;
                    if (sumQty) sumQty.textContent = String(state.qty);
                    if (qtyVal) qtyVal.textContent = String(state.qty);
                    if (triggerSwatch) triggerSwatch.style.background = state.color;
                    if (triggerText) triggerText.textContent = state.colorName;
                }

                function buildMessage() {
                    return encodeURIComponent(
                        'Hola, me gustaría encargar una Palomitera de Yoshi con los siguientes detalles:\n\n' +
                        'Tamaño: ' + state.sizeName + '\n' +
                        'Color: ' + state.colorName + '\n' +
                        'Montaje: ' + assemblyLabel() + '\n' +
                        'Entrega: ' + (state.delivery === 'persona' ? 'Recogida en persona (Salamanca)' : 'Envío a domicilio') + '\n' +
                        'Cantidad: ' + state.qty + ' unidad' + (state.qty > 1 ? 'es' : '') + '\n\n' +
                        'Gracias.'
                    );
                }

                function renderCatalogColorDropdown() {
                    if (!colorDropdown) {
                        return;
                    }

                    const basicColors = (palomiteraCatalogCache && palomiteraCatalogCache['pla-basico']) || [];
                    const premiumColors = (palomiteraCatalogCache && palomiteraCatalogCache['pla-premium']) || [];
                    const allColors = basicColors.concat(premiumColors);

                    if (!allColors.length) {
                        colorDropdown.innerHTML = `
                            <div class="color-dropdown-group">
                                <div class="color-dropdown-group-label">No hay colores disponibles</div>
                            </div>
                        `;
                        return;
                    }

                    const currentColorExists = allColors.some(function (color) {
                        return color.name === state.colorName && color.swatch === state.color;
                    });

                    if (!currentColorExists) {
                        state.color = allColors[0].swatch;
                        state.colorName = allColors[0].name;
                    }

                    function renderGroup(title, colors) {
                        if (!colors.length) {
                            return '';
                        }

                        return `
                            <div class="color-dropdown-group">
                                <div class="color-dropdown-group-label">${escapeHtml(title)}</div>
                                <div class="color-dropdown-grid">
                                    ${colors.map(function (color) {
                                        const isSelected = color.name === state.colorName && color.swatch === state.color;
                                        return `
                                            <div class="color-opt${isSelected ? ' selected' : ''}" data-color="${escapeHtml(color.swatch)}" data-name="${escapeHtml(color.name)}">
                                                <div class="color-opt-circle" style="background:${escapeHtml(color.swatch)}"></div>
                                                <div class="color-opt-name">${escapeHtml(color.name)}</div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }

                    const showDivider = basicColors.length && premiumColors.length;
                    colorDropdown.innerHTML = `${renderGroup('PLA Básico', basicColors)}${showDivider ? '<div class="color-dropdown-divider"></div>' : ''}${renderGroup('PLA Premium', premiumColors)}`;
                    updateSummary();
                }

                function goToStep2() {
                    if (!contactSummary) return;

                    contactSummary.innerHTML = [
                        '<span class="summary-chip">Tamaño: ' + state.sizeName + '</span>',
                        '<span class="summary-chip"><span class="summary-chip-dot" style="background:' + state.color + '"></span> ' + state.colorName + '</span>',
                        '<span class="summary-chip">' + assemblyLabel() + '</span>',
                        '<span class="summary-chip">' + deliveryLabel() + '</span>',
                        '<span class="summary-chip">Cantidad: ' + state.qty + ' ud.</span>'
                    ].join('');

                    if (step1 && step2) {
                        step1.classList.add('hidden');
                        step2.classList.remove('hidden');
                    }
                }

                function goToStep1() {
                    if (step1 && step2) {
                        step2.classList.add('hidden');
                        step1.classList.remove('hidden');
                    }
                }

                if (btnClose) {
                    btnClose.addEventListener('click', function () {
                        // Suppress popup for 20 minutes when user explicitly closes the form
                        suppressPalomiteraPopupForMinutes(20);
                        hidePalomiteraRequestModal();
                        window.location.reload();
                    });
                }

                if (modal) {
                    modal.addEventListener('click', function (event) {
                        if (event.target === modal) {
                            hidePalomiteraRequestModal();
                        }
                    });
                }

                // Dynamically adjust modal height to fit within the visible viewport
                (function setupModalSizing() {
                    function adjustHeroTextWrapping() {
                        var heroText = wrapper.querySelector('.modal-hero-text');
                        var titleEl = wrapper.querySelector('.modal-hero-title');
                        var subEl = wrapper.querySelector('.modal-hero-sub');
                        if (!heroText || !titleEl || !subEl) {
                            return;
                        }

                        // Try one-line mode first; if content overflows, fallback to natural wrapping.
                        heroText.classList.add('single-line');
                        var titleFits = titleEl.scrollWidth <= (titleEl.clientWidth + 1);
                        var subFits = subEl.scrollWidth <= (subEl.clientWidth + 1);
                        if (!(titleFits && subFits)) {
                            heroText.classList.remove('single-line');
                        }
                    }

                    function adjustModalHeight() {
                        try {
                            var margin = 40; // overall margin from viewport edges
                            var max = Math.max(320, window.innerHeight - margin);
                            modal.style.maxHeight = max + 'px';
                            modal.style.margin = '20px auto';

                            var hero = wrapper.querySelector('.modal-hero');
                            var bodyWrap = wrapper.querySelector('.modal-body-wrap');
                            if (hero && bodyWrap) {
                                var heroRect = hero.getBoundingClientRect();
                                var heroH = Math.ceil(heroRect.height || 0);
                                var available = Math.max(160, max - heroH - 32);
                                bodyWrap.style.maxHeight = available + 'px';
                            }

                            // Keep the form vertically centered; overlay itself handles scroll when needed.
                            wrapper.style.alignItems = 'center';
                            wrapper.style.paddingTop = '20px';
                            wrapper.style.paddingBottom = '20px';

                            adjustHeroTextWrapping();
                        } catch (e) {
                            // fail silently
                        }
                    }

                    // run initially and on resize/orientation change
                    adjustModalHeight();
                    window.addEventListener('resize', adjustModalHeight);
                    window.addEventListener('orientationchange', adjustModalHeight);

                    // store handler so it can be removed when modal is hidden
                    wrapper._palomiteraAdjust = adjustModalHeight;
                })();

                if (btnNext) btnNext.addEventListener('click', goToStep2);
                if (btnBack) btnBack.addEventListener('click', goToStep1);
                if (qtyDown) {
                    qtyDown.addEventListener('click', function () {
                        if (state.qty > 1) {
                            state.qty -= 1;
                            updateSummary();
                        }
                    });
                }
                if (qtyUp) {
                    qtyUp.addEventListener('click', function () {
                        state.qty += 1;
                        updateSummary();
                    });
                }
                if (btnWa) {
                    btnWa.addEventListener('click', function () {
                        window.open('https://wa.me/34644070487?text=' + buildMessage(), '_blank');
                    });
                }
                if (btnEmail) {
                    btnEmail.addEventListener('click', function () {
                        const subject = encodeURIComponent('Pedido – Palomitera de Yoshi');
                        window.open('https://mail.google.com/mail/?view=cm&fs=1&to=silab3d@gmail.com&su=' + subject + '&body=' + buildMessage(), '_blank');
                    });
                }
                if (colorTrigger && colorDropdown) {
                    colorTrigger.addEventListener('click', function () {
                        colorDropdown.classList.toggle('open');
                        colorTrigger.classList.toggle('open');
                    });

                    colorDropdown.addEventListener('click', function (event) {
                        const opt = event.target.closest('.color-opt');
                        if (!opt) {
                            return;
                        }

                        event.stopPropagation();
                        state.color = opt.getAttribute('data-color') || state.color;
                        state.colorName = opt.getAttribute('data-name') || state.colorName;
                        renderCatalogColorDropdown();
                        colorDropdown.classList.remove('open');
                        colorTrigger.classList.remove('open');
                    });

                    loadPalomiteraCatalog().then(function () {
                        renderCatalogColorDropdown();
                    });
                }

                wrapper.querySelectorAll('.size-card').forEach(function (card) {
                    card.addEventListener('click', function () {
                        wrapper.querySelectorAll('.size-card').forEach(function (item) {
                            item.classList.remove('selected');
                        });
                        card.classList.add('selected');
                        state.sizeName = card.querySelector('.size-name').textContent;
                        updateSummary();
                    });
                });

                wrapper.querySelectorAll('#assemblyGroup .toggle-card').forEach(function (card) {
                    card.addEventListener('click', function () {
                        wrapper.querySelectorAll('#assemblyGroup .toggle-card').forEach(function (item) {
                            item.classList.remove('selected');
                        });
                        card.classList.add('selected');
                        state.assembly = card.getAttribute('data-assembly') || state.assembly;
                        updateSummary();
                    });
                });

                wrapper.querySelectorAll('#deliveryGroup .toggle-card').forEach(function (card) {
                    card.addEventListener('click', function () {
                        wrapper.querySelectorAll('#deliveryGroup .toggle-card').forEach(function (item) {
                            item.classList.remove('selected');
                        });
                        card.classList.add('selected');
                        state.delivery = card.getAttribute('data-delivery') || state.delivery;
                        updateSummary();
                    });
                });

                document.addEventListener('click', function (event) {
                    if (!event.target.closest || !event.target.closest('.color-dropdown-wrap')) {
                        if (colorDropdown) colorDropdown.classList.remove('open');
                        if (colorTrigger) colorTrigger.classList.remove('open');
                    }
                });

                updateSummary();

        return wrapper;
    }

    function createPalomiteraContactModal() {
        const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
        const wrapper = document.createElement('div');
        wrapper.id = 'palomiteraContactModal';
        wrapper.className = 'quote-modal palomitera-contact-modal';

        wrapper.innerHTML = `
            <div class="quote-modal-content palomitera-contact-content">
                <span class="quote-contact-modal-close" id="palomiteraContactClose" aria-label="Cerrar ventana">&times;</span>
                <h2 class="palomitera-contact-title">Elige cómo prefieres contactar</h2>
                <p class="palomitera-contact-subtitle">Enviaremos tu solicitud con el nombre, modelo y color seleccionado.</p>
                <div class="contact-options-grid palomitera-contact-grid">
                    <a id="palomiteraContactWhatsApp" href="#" target="_blank" class="contact-option-card">
                        <div class="contact-option-icon">📱</div>
                        <h3>WhatsApp</h3>
                        <p>Respuesta inmediata</p>
                    </a>
                    ${isMobileViewport ? '' : `
                    <a id="palomiteraContactEmail" href="#" target="_blank" class="contact-option-card">
                        <div class="contact-option-icon">📧</div>
                        <h3>Email</h3>
                        <p>Comunicación formal</p>
                    </a>`}
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);
        palomiteraContactModal = wrapper;
        palomiteraContactCloseBtn = document.getElementById('palomiteraContactClose');
        palomiteraContactWhatsApp = document.getElementById('palomiteraContactWhatsApp');
        palomiteraContactEmail = document.getElementById('palomiteraContactEmail');

        if (palomiteraContactCloseBtn) {
            palomiteraContactCloseBtn.addEventListener('click', hidePalomiteraContactModal);
        }

        if (palomiteraContactModal) {
            palomiteraContactModal.addEventListener('click', function(e) {
                if (e.target === palomiteraContactModal) {
                    hidePalomiteraContactModal();
                }
            });
        }

        return wrapper;
    }

    function renderPalomiteraColorCatalog() {
        if (!palomiteraRequestColorSections || !palomiteraCatalogCache) {
            return;
        }

        const colors = palomiteraCatalogCache[palomiteraActiveColorGroup] || [];
        if (!colors.length) {
            palomiteraRequestColorSections.innerHTML = `
                <div class="project-color-group">
                    <p style="color: #9ca3af; font-size: 0.9rem; margin: 0;">No hay colores disponibles en este momento.</p>
                </div>
            `;
            return;
        }

        palomiteraRequestColorSections.innerHTML = `
            <div class="project-color-group">
                <div class="project-color-options">
                    ${colors.map((color) => `
                        <label class="project-color-option">
                            <input type="radio" class="color-checkbox" name="palomiteraColorChoice" value="${escapeHtml(color.id)}" data-color-label="${escapeHtml(color.name)}" data-color-swatch="${escapeHtml(color.swatch)}">
                            <div class="color-option-ui">
                                <span class="project-color-swatch" style="background:${escapeHtml(color.swatch)};"></span>
                                <span class="project-color-name" title="${escapeHtml(color.name)}">${escapeHtml(color.name)}</span>
                                ${color.offer ? '<span class="color-offer-badge">Oferta</span>' : ''}
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;

        const selectedRadio = palomiteraRequestColorSections.querySelector('input[name="palomiteraColorChoice"]:checked');
        palomiteraRequestSelectedColor.value = selectedRadio ? selectedRadio.getAttribute('data-color-label') || '' : '';

        palomiteraRequestColorSections.querySelectorAll('input[name="palomiteraColorChoice"]').forEach((input) => {
            input.addEventListener('change', function () {
                palomiteraRequestSelectedColor.value = this.getAttribute('data-color-label') || '';
                palomiteraRequestColorSections.classList.remove('error');
            });
        });
    }

    function showPalomiteraRequestModal() {
        if (!palomiteraRequestModal) {
            createPalomiteraRequestModal();
        }

        // Do not touch the document layout; only block background scrolling while the modal is visible.
        if (!palomiteraScrollBlocker) {
            palomiteraScrollBlocker = function (event) {
                if (!palomiteraRequestModal || !palomiteraRequestModal.classList.contains('active')) {
                    return;
                }

                const insideModalBody = event.target && event.target.closest && event.target.closest('.modal-body-wrap');
                if (!insideModalBody) {
                    event.preventDefault();
                }
            };

            document.addEventListener('wheel', palomiteraScrollBlocker, { passive: false });
            document.addEventListener('touchmove', palomiteraScrollBlocker, { passive: false });
        }

        palomiteraRequestModal.style.display = 'flex';
        palomiteraRequestModal.classList.add('active');
        loadPalomiteraCatalog().then(() => {
            renderPalomiteraColorCatalog();
        });
    }

    function hidePalomiteraRequestModal() {
        if (palomiteraRequestModal) {
            // remove dynamic sizing listeners if present
            try {
                if (palomiteraRequestModal._palomiteraAdjust) {
                    window.removeEventListener('resize', palomiteraRequestModal._palomiteraAdjust);
                    window.removeEventListener('orientationchange', palomiteraRequestModal._palomiteraAdjust);
                    delete palomiteraRequestModal._palomiteraAdjust;
                }
            } catch (e) {}

            if (palomiteraScrollBlocker) {
                document.removeEventListener('wheel', palomiteraScrollBlocker, { passive: false });
                document.removeEventListener('touchmove', palomiteraScrollBlocker, { passive: false });
                palomiteraScrollBlocker = null;
            }

            palomiteraRequestModal.style.display = 'none';
            palomiteraRequestModal.classList.remove('active');
        }
    }

    function showPalomiteraContactModal() {
        if (!palomiteraContactModal) {
            createPalomiteraContactModal();
        }

        palomiteraContactModal.style.display = 'flex';
        palomiteraContactModal.classList.add('active');
    }

    function hidePalomiteraContactModal() {
        if (palomiteraContactModal) {
            palomiteraContactModal.style.display = 'none';
            palomiteraContactModal.classList.remove('active');
        }
    }

    function openPalomiteraContactOptions(payload) {
        const whatsappMessage = `¡Hola! Me gustaría encargar una ${payload.productName} personalizada.\n\n- Nombre: ${payload.customerName}\n- Modelo: ${payload.model}\n- Color: ${payload.color}\n\n¿Podéis darme más información?`;
        const emailSubject = `Consulta sobre ${payload.productName}`;
        const emailBody = `¡Hola!%0D%0A%0D%0AMe gustaría encargar una ${payload.productName} personalizada.%0D%0A%0D%0A- Nombre: ${payload.customerName}%0D%0A- Modelo: ${payload.model}%0D%0A- Color: ${payload.color}%0D%0A%0D%0A¿Podéis darme más información?`;

        const whatsappURL = `https://wa.me/34644070487?text=${encodeURIComponent(whatsappMessage)}`;
        const emailURL = `https://mail.google.com/mail/?view=cm&fs=1&to=silab3d@gmail.com&su=${encodeURIComponent(emailSubject)}&body=${emailBody}`;

        if (!palomiteraContactModal) {
            createPalomiteraContactModal();
        }

        if (palomiteraContactWhatsApp) {
            palomiteraContactWhatsApp.href = whatsappURL;
            palomiteraContactWhatsApp.onclick = function(e) {
                e.preventDefault();
                window.open(whatsappURL, '_blank');
                hidePalomiteraContactModal();
            };
        }

        if (palomiteraContactEmail) {
            palomiteraContactEmail.href = emailURL;
            palomiteraContactEmail.onclick = function(e) {
                e.preventDefault();
                window.open(emailURL, '_blank');
                hidePalomiteraContactModal();
            };
        }

        showPalomiteraContactModal();
    }

    function openPalomiteraRequestFlow() {
        const activePalomiteraPopup = document.getElementById('palomiteraPopup');
        if (activePalomiteraPopup) {
            activePalomiteraPopup.classList.remove('show');
        }
        // Redirigir a la página del formulario de los cuadros de Juego de Tronos
        window.location.href = '/cuadros-juego-de-tronos/';
    }

    function createPalomiteraPopup() {
        const wrapper = document.createElement('div');
        wrapper.id = 'palomiteraPopup';
        wrapper.className = 'palomitera-popup-overlay';
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'true');
        wrapper.setAttribute('aria-labelledby', 'palomiteraPopupTitle');

        wrapper.innerHTML = `
            <div class="palomitera-popup-modal">
                <button type="button" class="palomitera-popup-close" id="palomiteraPopupClose" aria-label="Cerrar ventana">&times;</button>
                <div class="palomitera-popup-head">
                    <span class="palomitera-popup-chip">Novedad</span>
                    <h2 id="palomiteraPopupTitle" class="palomitera-popup-title">Cuadros bicolor Juego de Tronos</h2>
                </div>
                <div class="palomitera-carousel" id="palomiteraCarousel">
                    <img src="${imagePrefix}Cuadros-GOT-1.webp" alt="Cuadros bicolor de Juego de Tronos" class="palomitera-slide active" loading="eager" decoding="async">
                    <img src="${imagePrefix}Cuadros-GOT-2.webp" alt="Colección de cuadros de las casas de Juego de Tronos" class="palomitera-slide" loading="eager" decoding="async">
                </div>
                <p class="palomitera-popup-description">Hazte con los emblemas de las <strong>grandes casas de Poniente</strong>. ¡Elige tus <strong>casas favoritas</strong> y colecciónalos!</p>
                <button type="button" class="palomitera-popup-cta" id="palomiteraPopupCTA">Lo quiero</button>
            </div>
        `;

        document.body.appendChild(wrapper);

        // Asegurar que el botón CTA tenga un listener ligado directamente al wrapper
        const wrapperCTA = wrapper.querySelector('#palomiteraPopupCTA');
        if (wrapperCTA) {
            wrapperCTA.addEventListener('click', function() {
                openPalomiteraRequestFlow();
            });
        }

        return wrapper;
    }

    if (isIndexPage) {
        const palomiteraAutoShow = shouldShowPalomiteraPopup();
        const palomiteraPopup = createPalomiteraPopup();
        const palomiteraCloseBtn = document.getElementById('palomiteraPopupClose');
        const palomiteraCTA = document.getElementById('palomiteraPopupCTA');
        const palomiteraSlides = palomiteraPopup.querySelectorAll('.palomitera-slide');
        let palomiteraSlideIndex = 0;
        let palomiteraIntervalId = null;
        const palomiteraProductName = 'Cuadros bicolor Juego de Tronos';
        const palomiteraWhatsAppURL = `https://wa.me/34644070487?text=${encodeURIComponent(`¡Hola! Me gustaría encargar una ${palomiteraProductName} personalizada. ¿Podéis darme más información?`)}`;
        const palomiteraEmailURL = `https://mail.google.com/mail/?view=cm&fs=1&to=silab3d@gmail.com&su=${encodeURIComponent(`Consulta sobre ${palomiteraProductName}`)}&body=${encodeURIComponent(`¡Hola!\n\nMe gustaría encargar una ${palomiteraProductName} personalizada. ¿Podéis darme más información?\n\nGracias.`)}`;

        function showPalomiteraSlide(nextIndex) {
            palomiteraSlides.forEach((slide, index) => {
                slide.classList.toggle('active', index === nextIndex);
            });
        }

        function closePalomiteraPopup() {
            palomiteraPopup.classList.remove('show');
            if (palomiteraIntervalId) {
                clearInterval(palomiteraIntervalId);
                palomiteraIntervalId = null;
            }
            // Se cierre como se cierre (×, clic fuera, Escape), queda minimizado en el icono
            showPalomiteraMinIcon();
        }

        function startPalomiteraCarousel() {
            if (palomiteraSlides.length > 1 && !palomiteraIntervalId) {
                palomiteraIntervalId = setInterval(() => {
                    palomiteraSlideIndex = (palomiteraSlideIndex + 1) % palomiteraSlides.length;
                    showPalomiteraSlide(palomiteraSlideIndex);
                }, 2000);
            }
        }

        // ── Icono minimizado (cara de Yoshi) en la esquina inferior derecha ──
        let palomiteraMinIcon = null;

        function showPalomiteraMinIcon() {
            if (!palomiteraMinIcon) {
                palomiteraMinIcon = document.createElement('button');
                palomiteraMinIcon.type = 'button';
                palomiteraMinIcon.id = 'palomiteraMinIcon';
                palomiteraMinIcon.className = 'palomitera-min-icon';
                palomiteraMinIcon.title = 'Cuadros bicolor Juego de Tronos';
                palomiteraMinIcon.setAttribute('aria-label', 'Ver novedad: Cuadros bicolor Juego de Tronos');
                palomiteraMinIcon.innerHTML = `
                    <svg viewBox="0 0 64 64" aria-hidden="true">
                        <path d="M10 44 L14 22 L24 33 L32 16 L40 33 L50 22 L54 44 Z" fill="#e8b93c" stroke="#8a6712" stroke-width="1.4" stroke-linejoin="round"/>
                        <rect x="10" y="44" width="44" height="6" rx="2" fill="#e8b93c" stroke="#8a6712" stroke-width="1.4"/>
                        <circle cx="14" cy="20" r="2.6" fill="#e8b93c" stroke="#8a6712" stroke-width="1.2"/>
                        <circle cx="32" cy="14" r="2.8" fill="#e8b93c" stroke="#8a6712" stroke-width="1.2"/>
                        <circle cx="50" cy="20" r="2.6" fill="#e8b93c" stroke="#8a6712" stroke-width="1.2"/>
                        <circle cx="32" cy="40" r="2.4" fill="#a5262d"/>
                    </svg>`;
                palomiteraMinIcon.addEventListener('click', function() {
                    hidePalomiteraMinIcon();
                    palomiteraPopup.classList.add('show');
                    startPalomiteraCarousel();
                });
                document.body.appendChild(palomiteraMinIcon);
            }
            palomiteraMinIcon.classList.add('visible');
        }

        function hidePalomiteraMinIcon() {
            if (palomiteraMinIcon) palomiteraMinIcon.classList.remove('visible');
        }

        if (palomiteraAutoShow) {
            startPalomiteraCarousel();
            setTimeout(() => {
                palomiteraPopup.classList.add('show');
            }, 5000);
        } else {
            // Popup suprimido (cerrado hace poco): queda minimizado en el icono
            showPalomiteraMinIcon();
        }

        if (palomiteraCloseBtn) {
            palomiteraCloseBtn.addEventListener('click', function() {
                // Suppress popup for 20 minutes when user explicitly closes it
                suppressPalomiteraPopupForMinutes(20);
                closePalomiteraPopup();
            });
        }

        document.addEventListener('click', function(e) {
            const clickedGroupButton = e.target.closest('.palomitera-color-group-button');
            if (clickedGroupButton && palomiteraRequestModal && palomiteraRequestModal.classList.contains('active')) {
                palomiteraActiveColorGroup = clickedGroupButton.getAttribute('data-color-group') || 'pla-basico';
                palomiteraRequestColorButtons.forEach((button) => button.classList.toggle('active', button === clickedGroupButton));
                if (palomiteraRequestColorSections) {
                    palomiteraRequestColorSections.classList.remove('error');
                }
                renderPalomiteraColorCatalog();
            }
        });

        palomiteraPopup.addEventListener('click', function(e) {
            if (e.target === palomiteraPopup) {
                closePalomiteraPopup();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && palomiteraPopup.classList.contains('show')) {
                closePalomiteraPopup();
            }
            if (e.key === 'Escape' && palomiteraRequestModal && palomiteraRequestModal.classList.contains('active')) {
                hidePalomiteraRequestModal();
            }
            if (e.key === 'Escape' && palomiteraContactModal && palomiteraContactModal.classList.contains('active')) {
                hidePalomiteraContactModal();
            }
        });
    }

    // Verificar si el usuario ya aceptó los términos
    if (termsPopup) {
        const termsAccepted = localStorage.getItem('termsAccepted');
        
        if (!termsAccepted) {
            // Mostrar el popup después de un pequeño delay
            setTimeout(() => {
                termsPopup.classList.add('show');
            }, 1000);
        }

        // Manejar clic en Aceptar
        if (acceptTermsBtn) {
            acceptTermsBtn.addEventListener('click', function() {
                localStorage.setItem('termsAccepted', 'true');
                termsPopup.classList.remove('show');
            });
        }

        // Manejar clic en Rechazar
        if (rejectTermsBtn) {
            rejectTermsBtn.addEventListener('click', function() {
                // Cerrar la ventana o redirigir
                window.close();
                // Si window.close() no funciona (navegadores modernos), redirigir a una página en blanco
                setTimeout(() => {
                    window.location.href = 'about:blank';
                }, 100);
            });
        }
    }

    // Menú móvil: gestionado por el script en línea de cada página (clase .open).
    // Se elimina el antiguo manejador basado en .active para evitar conflictos.
});
