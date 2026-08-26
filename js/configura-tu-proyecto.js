document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('projectQuoteForm');

    /* ── Blindaje anti-reinicio ─────────────────────────────────────────────
       El formulario no tiene 'action', así que cualquier envío nativo recarga
       la página y el usuario vuelve al paso 1 con todo vacío. Esto ocurría al
       pulsar Intro en un campo si algo más arriba fallaba, o al soltar un
       archivo de referencia fuera de la zona de subida (el navegador abría el
       archivo). Se registra ANTES que nada, en fase de captura, para que siga
       activo aunque falle cualquier inicialización posterior. */
    if (form) {
        form.setAttribute('novalidate', 'novalidate');
        form.addEventListener('submit', function (ev) { ev.preventDefault(); }, true);
        form.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter') return;
            var el = ev.target;
            if (!el || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON') return;
            ev.preventDefault();   // Intro nunca envía: avanza el paso desde el manejador normal
        }, true);
    }
    ['dragover', 'drop'].forEach(function (evt) {
        window.addEventListener(evt, function (ev) {
            var dz = document.getElementById('referenceDropzone');
            if (dz && (dz === ev.target || dz.contains(ev.target))) return;  // la zona lo gestiona
            ev.preventDefault();   // fuera de la zona: no abrir el archivo ni recargar
        }, false);
    });

    const contactOptions = document.getElementById('projectContactOptions');
    const whatsappLink = document.getElementById('projectWhatsApp');
    const emailLink = document.getElementById('projectEmail');
    const formSteps = Array.from(document.querySelectorAll('[data-form-step]'));
    const nextToDetailsButton = document.getElementById('projectNextToDetails');
    const backToDetailsButton = document.getElementById('projectBackToDetails');
    const nextToColorsButton = document.getElementById('projectNextToColors');
    const showContactOptionsButton = document.getElementById('projectShowContactOptions');
    const backToProjectDetailsButton = document.getElementById('projectBackToProjectDetails');
    const backToColorsButton = document.getElementById('projectBackToColors');
    const queryParams = new URLSearchParams(window.location.search);
    const presetProductName = queryParams.get('producto');

    const colorsBoard = document.getElementById('projectColorsBoard');
    const pieceTypeSelect = document.getElementById('projectPieceType');
    const selectedColorChips = document.getElementById('projectSelectedColorChips');
    const selectionDisplay = colorsBoard ? colorsBoard.querySelector('.color-selection-display') : null;
    const selectionTitle = colorsBoard ? colorsBoard.querySelector('.selection-title') : null;
    const categoryButtons = Array.from(document.querySelectorAll('.color-material-card'));

    const colorCatalog = document.getElementById('projectColorCatalog');
    const colorCatalogSections = document.getElementById('projectColorCatalogSections');

    const catalogState = {
        'pla-basico': [],
        'pla-premium': [],
        petg: []
    };
    const allowedGroupsByPieceType = {
        resistentes: ['indeterminado', 'petg'],
        artisticas: ['indeterminado', 'pla-basico', 'pla-premium']
    };
    const selectedColorState = {};
    let activeStep = 1;
    let activePieceType = pieceTypeSelect ? pieceTypeSelect.value : '';

    if (!form || !contactOptions || !whatsappLink || !emailLink || !colorsBoard || !pieceTypeSelect || !selectedColorChips || !categoryButtons.length || !colorCatalog || !colorCatalogSections || !formSteps.length) {
        return;
    }

    if (presetProductName) {
        const projectNameField = document.getElementById('projectName');
        if (projectNameField && !projectNameField.value.trim()) {
            projectNameField.value = presetProductName;
        }
    }

    showStep(1);

    initColorCatalog();
    updateColorCounts();
    applyPieceTypeFilter();

    categoryButtons.forEach((button) => {
        button.addEventListener('click', function () {
            onColorGroupButtonClick(button);
        });
    });

    pieceTypeSelect.addEventListener('change', function () {
        activePieceType = pieceTypeSelect.value;
        applyPieceTypeFilter();
    });

    const deadlineOptions = Array.from(document.querySelectorAll('.plazo-option'));
    const deadlineDateGroup = document.getElementById('deadlineDateGroup');
    const deadlineDateInput = document.getElementById('projectDeadlineDate');

    /* Solo pueden señalarse fechas a partir de 2 días desde hoy */
    if (deadlineDateInput) {
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() + 2);
        deadlineDateInput.min = toDateInputValue(minDate);
    }

    deadlineOptions.forEach(function (option) {
        const input = option.querySelector('input[type="radio"]');
        if (!input) return;
        input.addEventListener('change', function () {
            deadlineOptions.forEach(function (opt) {
                const radio = opt.querySelector('input[type="radio"]');
                opt.classList.toggle('selected', !!(radio && radio.checked));
            });
            updateDeadlineDateVisibility();
        });
    });

    if (deadlineDateInput) {
        deadlineDateInput.addEventListener('input', function () {
            deadlineDateInput.classList.remove('input-error');
            const errorEl = document.getElementById('errDeadlineDate');
            if (errorEl) errorEl.classList.remove('show');
        });
    }

    updateDeadlineDateVisibility();

    function toDateInputValue(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return date.getFullYear() + '-' + month + '-' + day;
    }

    function isUrgentDeadline() {
        const checked = document.querySelector('input[name="projectDeadline"]:checked');
        return !!(checked && checked.value === 'urgente');
    }

    function updateDeadlineDateVisibility() {
        if (!deadlineDateGroup || !deadlineDateInput) return;

        const urgent = isUrgentDeadline();
        deadlineDateGroup.hidden = !urgent;
        deadlineDateInput.required = urgent;

        if (!urgent) {
            deadlineDateInput.value = '';
            deadlineDateInput.classList.remove('input-error');
            const errorEl = document.getElementById('errDeadlineDate');
            if (errorEl) errorEl.classList.remove('show');
        }
    }

    function getDeadlineDateLabel() {
        if (!deadlineDateInput || !deadlineDateInput.value) return '';
        const parts = deadlineDateInput.value.split('-');
        if (parts.length !== 3) return deadlineDateInput.value;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    colorCatalogSections.addEventListener('change', function (event) {
        if (event.target && event.target.matches('input[name="projectColorChoices"]')) {
            const label = event.target.closest('.catalog-color-item');
            if (label) {
                label.classList.toggle('selected', event.target.checked);
            }
            syncSelectedColorsFromRenderedInputs();
            updateSelectedBoard();
        }
    });

    selectedColorChips.addEventListener('click', function (event) {
        const removeBtn = event.target.closest('.color-chip-remove');
        if (removeBtn) {
            const colorValue = removeBtn.getAttribute('data-value');
            const checkbox = colorCatalogSections.querySelector('input[value="' + CSS.escape(colorValue) + '"]');
            if (checkbox) {
                checkbox.checked = false;
                const label = checkbox.closest('.catalog-color-item');
                if (label) label.classList.remove('selected');
                syncSelectedColorsFromRenderedInputs();
                updateSelectedBoard();
            }
        }
    });

    updateSelectedBoard();

    if (nextToDetailsButton) {
        nextToDetailsButton.addEventListener('click', function () {
            goToNextStep(1);
        });
    }

    if (backToDetailsButton) {
        backToDetailsButton.addEventListener('click', function () {
            goToPreviousStep(2);
        });
    }

    if (nextToColorsButton) {
        nextToColorsButton.addEventListener('click', function () {
            goToNextStep(2);
        });
    }

    if (backToProjectDetailsButton) {
        backToProjectDetailsButton.addEventListener('click', function () {
            goToPreviousStep(3);
        });
    }

    if (showContactOptionsButton) {
        showContactOptionsButton.addEventListener('click', function () {
            goToNextStep(3);
        });
    }

    if (backToColorsButton) {
        backToColorsButton.addEventListener('click', function () {
            contactOptions.classList.remove('active');
            showStep(3);
            const colorsSection = formSteps.find((step) => Number(step.getAttribute('data-form-step')) === 3);
            if (colorsSection) {
                colorsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    /* Un <a href="#"> devuelve en .href la URL absoluta de la página, así que la
       comprobación antigua (href === '#') nunca se cumplía y se abría una copia de
       la propia página en otra pestaña: el usuario veía el formulario reiniciado. */
    function linkReady(el) {
        var raw = el ? (el.getAttribute('href') || '') : '';
        return /^(https?:|mailto:)/i.test(raw);
    }
    /* Los enlaces se abren de forma NATIVA (target="_blank"): así nunca los bloquea el
       antipopups y, si el mensaje aún no se hubiera generado, el HTML ya apunta a
       WhatsApp y al correo. Solo nos aseguramos de que la URL sea válida. */
    [whatsappLink, emailLink].forEach(function (lnk) {
        if (!lnk) return;
        lnk.addEventListener('click', function (event) {
            if (linkReady(lnk)) return;              // destino correcto: deja navegar
            event.preventDefault();                  // destino no válido: no abrir nada
            goToNextStep(3);
        });
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        if (activeStep < 3) {
            goToNextStep(activeStep);
            return;
        }

        if (!buildContactOptions()) {
            return;
        }
    });

    // Catálogo de filamentos:
    //   1) En vivo desde Supabase → instantáneo con los cambios del admin.
    //   2) Si Supabase falla (pausa/caída) → respaldo desde data/filamentos.json
    //      (checkpoint que mantiene al día un GitHub Action cada hora).
    async function fetchFilamentos() {
        // Ruta absoluta: funciona igual sea cual sea la profundidad de la página actual.
        const localPath = '/data/filamentos.json';
        const sb = window.SILAB_SUPABASE || {};
        const sbKey = sb.anonKey || sb.key;

        if (sb.url && sbKey) {
            try {
                const url = sb.url.replace(/\/$/, '') +
                    '/rest/v1/filamentos?select=material,nombre,hex&visible=eq.true&order=material.asc,nombre.asc';
                const res = await fetch(url, {
                    headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey },
                    cache: 'no-store'
                });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows) && rows.length) {
                        const grupos = {};
                        rows.forEach(r => {
                            const principal = String(r.material || '').toUpperCase();
                            const key = principal.indexOf('PLA') === 0 ? 'PLA' : (principal.indexOf('PETG') === 0 ? 'PETG' : null);
                            if (!key) return;
                            if (!grupos[key]) grupos[key] = { nombre: key, colores: [] };
                            const color = { nombre: r.nombre, hex: r.hex || '#cccccc' };
                            if (principal === 'PLA PREMIUM') color.premium = true;
                            grupos[key].colores.push(color);
                        });
                        const filamentos = Object.keys(grupos).map(k => grupos[k]);
                        if (filamentos.length) return { filamentos };
                    }
                }
            } catch (e) { /* cae al checkpoint local */ }
        }

        try {
            const r = await fetch(localPath, { cache: 'no-store' });
            if (r && r.ok) return await r.json();
        } catch (e) {}

        return { filamentos: [] };
    }

    function showStep(stepNumber) {
        activeStep = stepNumber;
        if (typeof window.setStep === 'function') { try { window.setStep(stepNumber); } catch (e) {} }

        formSteps.forEach((step) => {
            const stepValue = Number(step.getAttribute('data-form-step'));
            step.hidden = stepValue !== stepNumber;
        });

        const isContactStep = stepNumber === 4;
        contactOptions.hidden = !isContactStep;
        contactOptions.classList.toggle('active', isContactStep);

        if (stepNumber < 4) {
            contactOptions.classList.remove('active');
        }
    }

    function goToNextStep(currentStep) {
        const currentSection = formSteps.find((step) => Number(step.getAttribute('data-form-step')) === currentStep);
        if (!currentSection || !validateStep(currentSection)) {
            return;
        }

        const nextStep = currentStep + 1;
        if (nextStep <= 3) {
            showStep(nextStep);
            const nextSection = formSteps.find((step) => Number(step.getAttribute('data-form-step')) === nextStep);
            if (nextSection) {
                nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            if (!buildContactOptions()) {
                return;
            }

            showStep(4);
            contactOptions.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function goToPreviousStep(currentStep) {
        const previousStep = currentStep - 1;
        if (previousStep < 1) {
            return;
        }

        showStep(previousStep);

        const previousSection = formSteps.find((step) => Number(step.getAttribute('data-form-step')) === previousStep);
        if (previousSection) {
            previousSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function validateStep(section) {
        const fields = Array.from(section.querySelectorAll('input, textarea, select'));
        for (const field of fields) {
            if (field.checkValidity && !field.checkValidity()) {
                field.reportValidity();
                field.focus();
                return false;
            }
        }

        return true;
    }

    function buildContactOptions() {
        const customerName = document.getElementById('projectCustomerName').value.trim();
        const customerContact = document.getElementById('projectCustomerContact').value.trim();
        const projectName = document.getElementById('projectName').value.trim();
        const projectDescription = document.getElementById('projectDescription').value.trim();
        const projectMeasures = document.getElementById('projectMeasures').value.trim();
        const deadlineInput = document.querySelector('input[name="projectDeadline"]:checked');
        const deadlineDateLabel = getDeadlineDateLabel();
        let projectDeadline = 'No especificado';
        if (deadlineInput && deadlineInput.value === 'urgente') {
            projectDeadline = deadlineDateLabel
                ? 'Urgente (fecha necesaria: ' + deadlineDateLabel + ')'
                : 'Urgente';
        } else if (deadlineInput) {
            projectDeadline = 'Flexible';
        }
        const projectReferenceFiles = document.getElementById('projectReferenceFiles').value;
        const pieceType = getPieceTypeLabel();

        const selectedGroupValues = getSelectedGroupValues();
        const selectedGroupLabels = getSelectedGroupLabels();

        const selectedColorLabels = getSelectedColorEntries().map((entry) => entry.label);

        if (!selectedGroupValues.length && !selectedColorLabels.length) {
            colorsBoard.classList.add('error');
            colorsBoard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
        }

        colorsBoard.classList.remove('error');

        const colorsSummary = buildColorsSummary(selectedGroupValues, selectedGroupLabels, selectedColorLabels);
        const referenceSummary = projectReferenceFiles === 'si'
            ? 'Si, adjunta archivos'
            : 'No (se podran solicitar mas adelante)';
        const uploadedUrls = (typeof getUploadedFileUrls === 'function') ? getUploadedFileUrls() : [];
        const filesBlock = uploadedUrls.length
            ? '\n' + uploadedUrls.map(function (u, i) { return '  ' + (i + 1) + '. ' + u; }).join('\n')
            : (projectReferenceFiles === 'si' ? '\n  (el cliente indicó que dispone de archivos)' : '');

        const whatsappMessage = '¡Hola!\n\nMi nombre es *' + customerName + '*.' +
            ' Me gustaria solicitar un presupuesto para el siguiente proyecto:\n\n' +
            '- *Tu nombre:*\n' + customerName + '\n\n' +
            '- *Telefono / Email de contacto:*\n' + customerContact + '\n\n' +
            '- *Nombre del Proyecto:*\n' + projectName + '\n\n' +
            '- *Descripcion del proyecto:*\n' + projectDescription + '\n\n' +
            '- *Medidas del proyecto:*\n' + (projectMeasures || 'No especificadas') + '\n\n' +
            '- *Plazo de tiempo deseado:*\n' + projectDeadline + '\n\n' +
            '- *Tipo de proyecto:*\n' + pieceType + '\n\n' +
            '- *Colores del proyecto:*\n' + colorsSummary + '\n\n' +
            '- *Proyecto o imagenes de referencia:*\n' + referenceSummary + filesBlock + '\n\n' +
            'Quedo a la espera de respuesta. ¡Muchas gracias!';

        const emailSubject = 'Solicitud de Presupuesto - ' + projectName;
        const emailBodyText = '¡Hola!\n\nMi nombre es ' + customerName +
            '. Me gustaria solicitar un presupuesto para el siguiente proyecto:\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '- TU NOMBRE:\n' + customerName + '\n\n' +
            '- TELEFONO / EMAIL DE CONTACTO:\n' + customerContact + '\n\n' +
            '- NOMBRE DEL PROYECTO:\n' + projectName + '\n\n' +
            '- DESCRIPCION DEL PROYECTO:\n' + projectDescription + '\n\n' +
            '- MEDIDAS DEL PROYECTO:\n' + (projectMeasures || 'No especificadas') + '\n\n' +
            '- PLAZO DE TIEMPO DESEADO:\n' + projectDeadline + '\n\n' +
            '- TIPO DE PROYECTO:\n' + pieceType + '\n\n' +
            '- COLORES DEL PROYECTO:\n' + colorsSummary + '\n\n' +
            '- PROYECTO O IMAGENES DE REFERENCIA:\n' + referenceSummary + filesBlock + '\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            'Quedo a la espera de respuesta.\n\n' +
            '¡Muchas gracias!\n\n' + customerName;

        const whatsappURL = 'https://wa.me/34644070487?text=' + encodeURIComponent(whatsappMessage);
        const emailURL = 'https://mail.google.com/mail/?view=cm&fs=1&to=silab3d@gmail.com&su=' + encodeURIComponent(emailSubject) + '&body=' + encodeURIComponent(emailBodyText);

        whatsappLink.href = whatsappURL;
        emailLink.href = emailURL;

        if (typeof notifySolicitudByEmail === 'function') {
            notifySolicitudByEmail({
                nombre: customerName,
                contacto: customerContact,
                proyecto: projectName,
                descripcion: projectDescription,
                medidas: projectMeasures || 'No especificadas',
                plazo: projectDeadline,
                fechaNecesaria: deadlineDateLabel || 'No especificada',
                tipoPieza: pieceType,
                colores: colorsSummary,
                referencia: referenceSummary,
                archivos: uploadedUrls
            });
        }

        contactOptions.classList.add('active');
        return true;
    }

    async function initColorCatalog() {
        try {
            const data = await fetchFilamentos();
            if (!data) return;
            hydrateCatalog(data);
            updateColorCounts();
        } catch (error) {
            // Si falla la carga del catalogo, el formulario sigue siendo usable.
        }
    }

    function hydrateCatalog(data) {
        const filamentos = Array.isArray(data && data.filamentos) ? data.filamentos : [];

        filamentos.forEach((material) => {
            const materialName = String(material && material.nombre ? material.nombre : '').toUpperCase();
            const colors = Array.isArray(material && material.colores) ? material.colores : [];

            if (materialName === 'PLA') {
                colors.forEach((color) => {
                    const normalized = normalizeColor(color);
                    if (normalized.isPremium) {
                        catalogState['pla-premium'].push(normalized);
                    } else {
                        catalogState['pla-basico'].push(normalized);
                    }
                });
            }

            if (materialName === 'PETG') {
                colors.forEach((color) => {
                    catalogState.petg.push(normalizeColor(color));
                });
            }
        });
    }

    function normalizeColor(color) {
        const name = String(color && color.nombre ? color.nombre : 'Color');
        const rawHex = color && color.hex;
        const hexList = Array.isArray(rawHex) ? rawHex : [rawHex || '#cccccc'];
        const isPremium = Boolean(color && color.premium) || hexList.length > 1 || /(silk|marble|marmol|mármol|seda)/i.test(name);
        const swatch = hexList.length > 1
            ? 'linear-gradient(135deg, ' + hexList.join(', ') + ')'
            : hexList[0];

        return {
            id: slugify(name + '-' + hexList.join('-')),
            name: name,
            swatch: swatch,
            isPremium: isPremium,
            offer: Boolean(color && color.offer)
        };
    }

    function updateColorCounts() {
        categoryButtons.forEach((button) => {
            const group = button.getAttribute('data-color-group');
            if (group && group !== 'indeterminado') {
                const count = (catalogState[group] || []).length;
                const countElement = button.querySelector('.card-color-count');
                if (countElement) {
                    countElement.textContent = count + ' color' + (count !== 1 ? 'es' : '');
                    countElement.setAttribute('data-count', count);
                }
            }
        });
    }

    function getAllowedColorGroups() {
        return allowedGroupsByPieceType[activePieceType] || ['indeterminado'];
    }

    function getPieceTypeLabel() {
        if (activePieceType === 'resistentes') {
            return 'Piezas resistentes';
        }

        if (activePieceType === 'artisticas') {
            return 'Piezas artísticas';
        }

        return 'Sin especificar';
    }

    function applyPieceTypeFilter() {
        const allowedGroups = getAllowedColorGroups();

        categoryButtons.forEach((button) => {
            const group = button.getAttribute('data-color-group');
            const allowed = group === 'indeterminado' || allowedGroups.includes(group);
            button.hidden = !allowed;
            button.disabled = !allowed;
            button.classList.toggle('is-disabled', !allowed);
            button.setAttribute('aria-disabled', String(!allowed));

            if (!allowed) {
                button.classList.remove('active');
            }
        });

        Object.keys(selectedColorState).forEach((value) => {
            const groupKey = value.split(':')[0];
            if (!allowedGroups.includes(groupKey)) {
                delete selectedColorState[value];
            }
        });

        if (!categoryButtons.some((button) => button.classList.contains('active') && !button.disabled)) {
            const indeterminateBtn = categoryButtons.find((item) => item.getAttribute('data-color-group') === 'indeterminado');
            if (indeterminateBtn && !indeterminateBtn.disabled) {
                indeterminateBtn.classList.add('active');
            }
        }

        renderColorCatalog();
        updateSelectedBoard();
    }

    function onColorGroupButtonClick(button) {
        const value = button.getAttribute('data-color-group');
        if (!value) {
            return;
        }

        if (button.disabled) {
            return;
        }

        if (value === 'indeterminado') {
            const isActive = button.classList.contains('active');
            categoryButtons.forEach((item) => item.classList.remove('active'));
            if (!isActive) {
                button.classList.add('active');
            }
            renderColorCatalog();
            updateSelectedBoard();
            return;
        }

        const indeterminateBtn = categoryButtons.find((item) => item.getAttribute('data-color-group') === 'indeterminado');
        if (indeterminateBtn) {
            indeterminateBtn.classList.remove('active');
        }

        const wasActive = button.classList.contains('active');
        categoryButtons.forEach((item) => {
            if (item !== indeterminateBtn) {
                item.classList.remove('active');
            }
        });

        if (!wasActive) {
            button.classList.add('active');
        }

        renderColorCatalog();
        updateSelectedBoard();
    }

    function renderColorCatalog() {
        syncSelectedColorsFromRenderedInputs();

        const selected = getSelectedGroupValues().filter((value) => value !== 'indeterminado' && getAllowedColorGroups().includes(value));

        if (!selected.length) {
            colorCatalog.hidden = true;
            colorCatalogSections.innerHTML = '';
            return;
        }

        colorCatalog.hidden = false;

        const titles = {
            'pla-basico': 'PLA Básico',
            'pla-premium': 'PLA Premium',
            petg: 'PETG'
        };

        colorCatalogSections.innerHTML = selected.map((groupKey) => {
            const colors = catalogState[groupKey] || [];

            if (!colors.length) {
                return '' +
                    '<div class="catalog-section">' +
                        '<h4 class="catalog-section-title">' + titles[groupKey] + '</h4>' +
                        '<p style="color: #9ca3af; font-size: 0.9rem;">No hay colores disponibles en este momento.</p>' +
                    '</div>';
            }

            const optionsHtml = colors.map((color) => {
                const colorValue = groupKey + ':' + color.id;
                const colorLabel = groupKey === 'petg'
                    ? color.name + ' (PETG)'
                    : color.name;
                const isSelected = selectedColorState[colorValue];
                return '' +
                    '<label class="catalog-color-item' + (isSelected ? ' selected' : '') + '">' +
                        '<input type="checkbox" style="display:none;" class="color-checkbox" name="projectColorChoices" value="' + escapeHtml(colorValue) + '" data-color-label="' + escapeHtml(colorLabel) + '" data-color-swatch="' + escapeHtml(color.swatch) + '" ' + (isSelected ? 'checked' : '') + '>' +
                        '<span class="catalog-color-circle" style="background:' + escapeHtml(color.swatch) + ';"></span>' +
                        '<span class="catalog-color-name" title="' + escapeHtml(color.name) + '">' + escapeHtml(color.name) + '</span>' +
                    '</label>';
            }).join('');

            return '' +
                '<div class="catalog-section">' +
                    '<h4 class="catalog-section-title">' + titles[groupKey] + '</h4>' +
                    '<div class="catalog-color-grid">' + optionsHtml + '</div>' +
                '</div>';
        }).join('');
    }

    function updateSelectedBoard() {
        const selectedColors = getSelectedColorEntries();

        if (!selectedColors.length) {
            if (selectionDisplay) {
                selectionDisplay.hidden = true;
            }
            if (selectionTitle) {
                selectionTitle.hidden = true;
            }
            selectedColorChips.innerHTML = '' +
                '<div class="color-chips-empty">' +
                    '<span class="empty-icon">🎯</span>' +
                    '<span class="empty-text">Selecciona colores concretos del catálogo</span>' +
                '</div>';
            return;
        }

        if (selectionDisplay) {
            selectionDisplay.hidden = false;
        }
        if (selectionTitle) {
            selectionTitle.hidden = false;
        }

        const colorChips = selectedColors.map((color) => {
            return '<span class="color-chip">' +
                '<span class="color-chip-dot" style="background:' + escapeHtml(color.swatch) + ';"></span>' +
                '<span>' + escapeHtml(color.label) + '</span>' +
                '<button type="button" class="color-chip-remove" data-value="' + escapeHtml(color.value) + '">✕</button>' +
            '</span>';
        }).join('');

        selectedColorChips.innerHTML = colorChips;
    }

    function syncSelectedColorsFromRenderedInputs() {
        const renderedInputs = Array.from(colorCatalogSections.querySelectorAll('input[name="projectColorChoices"]'));

        renderedInputs.forEach((input) => {
            const value = input.value;
            if (!value) {
                return;
            }

            if (input.checked) {
                selectedColorState[value] = {
                    value: value,
                    label: input.getAttribute('data-color-label') || 'Color',
                    swatch: input.getAttribute('data-color-swatch') || '#ffffff'
                };
                return;
            }

            delete selectedColorState[value];
        });
    }

    function getSelectedColorEntries() {
        return Object.keys(selectedColorState).map((key) => selectedColorState[key]);
    }

    function buildColorsSummary(groupValues, groupLabels, colorLabels) {
        if (groupValues.includes('indeterminado')) {
            return 'Indeterminado';
        }

        if (colorLabels.length) {
            return colorLabels.join(', ');
        }

        if (groupLabels.length) {
            return 'Categorías seleccionadas: ' + groupLabels.join(', ');
        }

        return 'Sin especificar';
    }

    function getSelectedGroupValues() {
        return categoryButtons
            .filter((button) => button.classList.contains('active') && !button.disabled)
            .map((button) => button.getAttribute('data-color-group'))
            .filter(Boolean);
    }

    function getSelectedGroupLabels() {
        return categoryButtons
            .filter((button) => button.classList.contains('active') && !button.disabled)
            .map((button) => button.querySelector('.card-title').textContent.trim());
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

    /* ============================================================
       ARCHIVOS DE REFERENCIA · subida a Supabase Storage
    ============================================================ */
    var SB_CONF = window.SILAB_SUPABASE || {};
    var sbClient = (window.supabase && SB_CONF.url && SB_CONF.anonKey)
        ? window.supabase.createClient(SB_CONF.url, SB_CONF.anonKey)
        : null;
    var referenceFiles = [];
    var referenceFileSeq = 0;
    var solicitudNotificada = false;

    var referenceSelect = document.getElementById('projectReferenceFiles');
    var referenceUpload = document.getElementById('referenceUpload');
    var referenceDropzone = document.getElementById('referenceDropzone');
    var referenceFileInput = document.getElementById('projectFiles');
    var referenceFilesListEl = document.getElementById('referenceFilesList');
    var referenceFilesTotalEl = document.getElementById('referenceFilesTotal');
    var referenceFilesError = document.getElementById('errFiles');

    var ALLOWED_EXT = ['stl', 'step', 'stp', 'obj', '3mf', 'ply', 'gltf', 'glb', 'fbx', 'amf', 'igs', 'iges', 'scad', 'zip', 'rar', '7z'];
    var MAX_FILE_BYTES = (Number(SB_CONF.maxFileMB) || 50) * 1024 * 1024;

    function getUploadedFileUrls() {
        return referenceFiles
            .filter(function (f) { return f.status === 'done' && f.url; })
            .map(function (f) { return f.url; });
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function fileExtension(name) {
        var i = String(name).lastIndexOf('.');
        return i >= 0 ? String(name).slice(i + 1).toLowerCase() : '';
    }

    function isAllowedFile(file) {
        if (file.type && file.type.indexOf('image/') === 0) return true;
        return ALLOWED_EXT.indexOf(fileExtension(file.name)) >= 0;
    }

    function iconForFile(file) {
        return (file.type && file.type.indexOf('image/') === 0) ? '🖼️' : '🧊';
    }

    function showFilesError(msg) {
        if (!referenceFilesError) return;
        referenceFilesError.textContent = msg;
        referenceFilesError.classList.add('show');
    }

    function toggleReferenceUpload() {
        if (!referenceSelect || !referenceUpload) return;
        var show = referenceSelect.value === 'si';
        referenceUpload.hidden = !show;
        if (!show) {
            referenceFiles = [];
            if (referenceFileInput) referenceFileInput.value = '';
            renderReferenceFiles();
        }
    }

    function handleSelectedFiles(fileList) {
        if (!fileList || !fileList.length) return;
        if (referenceFilesError) referenceFilesError.classList.remove('show');
        Array.prototype.forEach.call(fileList, function (file) {
            if (!isAllowedFile(file)) {
                showFilesError('“' + file.name + '” no es un tipo permitido (solo imágenes y modelos 3D).');
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                showFilesError('“' + file.name + '” supera el límite de ' + (SB_CONF.maxFileMB || 50) + ' MB.');
                return;
            }
            var exists = referenceFiles.some(function (f) { return f.file.name === file.name && f.file.size === file.size; });
            if (exists) return;
            var item = { id: 'rf' + (++referenceFileSeq), file: file, status: 'pending', url: null };
            referenceFiles.push(item);
            renderReferenceFiles();
            uploadReferenceFile(item);
        });
    }

    function removeReferenceFile(id) {
        referenceFiles = referenceFiles.filter(function (f) { return f.id !== id; });
        renderReferenceFiles();
    }

    function statusLabel(status) {
        if (status === 'uploading') return 'Subiendo…';
        if (status === 'done') return '✓ Subido';
        if (status === 'error') return '✕ Error';
        return 'En cola';
    }

    function renderReferenceFiles() {
        if (!referenceFilesListEl) return;
        referenceFilesListEl.innerHTML = referenceFiles.map(function (item) {
            return '' +
                '<div class="reference-file" data-file-id="' + item.id + '">' +
                    '<span class="reference-file-icon">' + iconForFile(item.file) + '</span>' +
                    '<div class="reference-file-info">' +
                        '<div class="reference-file-name" title="' + escapeHtml(item.file.name) + '">' + escapeHtml(item.file.name) + '</div>' +
                        '<div class="reference-file-sub">' +
                            '<span class="reference-file-meta">' + formatBytes(item.file.size) + '</span>' +
                            '<span class="reference-file-status ' + item.status + '">' + statusLabel(item.status) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="reference-file-remove" data-remove-file="' + item.id + '" aria-label="Quitar archivo">✕</button>' +
                '</div>';
        }).join('');

        if (referenceFilesTotalEl) {
            if (!referenceFiles.length) {
                referenceFilesTotalEl.textContent = 'Ningún archivo seleccionado';
            } else {
                var total = referenceFiles.reduce(function (s, f) { return s + f.file.size; }, 0);
                referenceFilesTotalEl.textContent = referenceFiles.length + ' archivo' + (referenceFiles.length !== 1 ? 's' : '') + ' · ' + formatBytes(total);
            }
        }
    }

    function slugFileName(name) {
        var ext = fileExtension(name);
        var base = ext ? name.slice(0, name.length - ext.length - 1) : name;
        base = String(base)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'archivo';
        return base + (ext ? '.' + ext : '');
    }

    async function uploadReferenceFile(item) {
        if (!sbClient) {
            item.status = 'error';
            renderReferenceFiles();
            showFilesError('No se pudo conectar con el almacenamiento. Podrás enviarlos por WhatsApp/Email.');
            return;
        }
        item.status = 'uploading';
        renderReferenceFiles();
        try {
            var bucket = SB_CONF.bucket || 'solicitudes';
            var path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + slugFileName(item.file.name);
            var up = await sbClient.storage.from(bucket).upload(path, item.file, {
                cacheControl: '3600',
                upsert: false,
                contentType: item.file.type || 'application/octet-stream'
            });
            if (up.error) throw up.error;
            var pub = sbClient.storage.from(bucket).getPublicUrl(path);
            item.url = pub && pub.data ? pub.data.publicUrl : null;
            item.status = item.url ? 'done' : 'error';
        } catch (err) {
            item.status = 'error';
            var detalle = (err && err.message) ? (' (' + err.message + ')') : '';
            console.error('Error subiendo a Supabase Storage:', err);
            showFilesError('No se pudo subir “' + item.file.name + '”' + detalle + '. Revisa el bucket/políticas de Supabase.');
        }
        renderReferenceFiles();
    }

    async function notifySolicitudByEmail(payload) {
        if (solicitudNotificada || !SB_CONF.edgeFunction) return;
        solicitudNotificada = true;
        try {
            await fetch(SB_CONF.edgeFunction, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (SB_CONF.anonKey || ''),
                    'apikey': SB_CONF.anonKey || ''
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            solicitudNotificada = false; // permite reintento si falla
        }
    }

    if (referenceSelect) {
        referenceSelect.addEventListener('change', toggleReferenceUpload);
        toggleReferenceUpload();
    }
    if (referenceFileInput) {
        referenceFileInput.addEventListener('change', function () {
            handleSelectedFiles(referenceFileInput.files);
            referenceFileInput.value = '';
        });
    }
    if (referenceDropzone) {
        ['dragenter', 'dragover'].forEach(function (evt) {
            referenceDropzone.addEventListener(evt, function (e) { e.preventDefault(); referenceDropzone.classList.add('dragover'); });
        });
        ['dragleave', 'dragend', 'drop'].forEach(function (evt) {
            referenceDropzone.addEventListener(evt, function () { referenceDropzone.classList.remove('dragover'); });
        });
        referenceDropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            if (e.dataTransfer && e.dataTransfer.files) handleSelectedFiles(e.dataTransfer.files);
        });
    }
    if (referenceFilesListEl) {
        referenceFilesListEl.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('[data-remove-file]') : null;
            if (btn) removeReferenceFile(btn.getAttribute('data-remove-file'));
        });
    }
    // Si el usuario retrocede y reedita, permitir reenviar la notificación automática.
    [backToProjectDetailsButton, backToDetailsButton, backToColorsButton].forEach(function (btn) {
        if (btn) btn.addEventListener('click', function () { solicitudNotificada = false; });
    });
    /* ── Borrador automático ────────────────────────────────────────────────
       Guarda lo escrito en el navegador del visitante para que no se pierda si
       recarga, cierra la pestaña sin querer o el móvil descarta la página.
       No se guardan archivos adjuntos ni se envía nada: es local. */
    (function () {
        var DRAFT_KEY = 'silab3d-configurador-borrador';
        var DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 días
        var draftTimer = null;

        function draftFields() {
            if (!form) return [];
            return Array.prototype.slice.call(form.querySelectorAll('input, select, textarea'))
                .filter(function (el) { return el.type !== 'file' && (el.id || el.name); });
        }
        function saveDraft() {
            try {
                var data = {};
                draftFields().forEach(function (el) {
                    var key = el.id || el.name;
                    if (el.type === 'checkbox' || el.type === 'radio') data[key] = !!el.checked;
                    else if (el.value) data[key] = el.value;
                });
                if (!Object.keys(data).length) { localStorage.removeItem(DRAFT_KEY); return; }
                localStorage.setItem(DRAFT_KEY, JSON.stringify({ ts: Date.now(), v: data }));
            } catch (e) { /* almacenamiento no disponible: se ignora */ }
        }
        function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
        function readDraft() {
            try {
                var raw = localStorage.getItem(DRAFT_KEY);
                if (!raw) return null;
                var d = JSON.parse(raw);
                if (!d || !d.v || !d.ts || (Date.now() - d.ts) > DRAFT_TTL) { clearDraft(); return null; }
                return d;
            } catch (e) { return null; }
        }
        function showRestoredNotice() {
            if (!form || document.getElementById('draftRestoredNotice')) return;
            var box = document.createElement('div');
            box.id = 'draftRestoredNotice';
            box.setAttribute('role', 'status');
            box.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 18px;padding:12px 16px;border:1px solid rgba(0,180,150,.35);background:rgba(0,180,150,.08);border-radius:12px;font-size:.92rem;color:#0E7C68';
            box.innerHTML = '<span style="flex:1;min-width:200px">Hemos recuperado los datos que habías escrito. Revisa que todo sea correcto antes de continuar.</span>';
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Empezar de cero';
            btn.style.cssText = 'border:1px solid rgba(0,180,150,.45);background:transparent;color:#0E7C68;border-radius:8px;padding:6px 14px;font:600 .85rem inherit;cursor:pointer';
            btn.addEventListener('click', function () {
                clearDraft();
                draftFields().forEach(function (el) {
                    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false; else el.value = '';
                });
                box.remove();
            });
            box.appendChild(btn);
            form.parentNode.insertBefore(box, form);
        }
        function restoreDraft() {
            var d = readDraft();
            if (!d) return;
            var restored = 0;
            draftFields().forEach(function (el) {
                var key = el.id || el.name;
                if (!(key in d.v)) return;
                var val = d.v[key];
                if (el.type === 'checkbox' || el.type === 'radio') { if (val) { el.checked = true; restored++; } }
                else if (val && !el.value) {
                    el.value = val;
                    if (el.value === val) restored++;   // los <select> ignoran opciones inexistentes
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            if (restored) showRestoredNotice();
        }

        if (form) {
            ['input', 'change'].forEach(function (evt) {
                form.addEventListener(evt, function () {
                    clearTimeout(draftTimer);
                    draftTimer = setTimeout(saveDraft, 400);
                });
            });
            window.addEventListener('pagehide', saveDraft);
            // Al enviar la solicitud, el borrador deja de hacer falta.
            [whatsappLink, emailLink].forEach(function (lnk) {
                if (lnk) lnk.addEventListener('click', function () { setTimeout(clearDraft, 0); });
            });
            // Espera un instante a que terminen las inicializaciones asíncronas (catálogo, etc.).
            setTimeout(restoreDraft, 350);
        }
    })();
});
