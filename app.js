// 1. DICCIONARIO DE ENRUTAMIENTO POR REGIÓN
const ENDPOINTS_REGIONALES = {
    "CO": "https://script.google.com/macros/s/AKfycbyK5gnxiYeq1GbKn8plrEIHclCvbvHf72GiOUH7bYcMGsfezRvi-V8ZcpCWLlAQU3NJ/exec",
    "NC": "https://script.google.com/macros/s/AKfycbxm0ZMOjBm-8GQ2Jm8tM0OSf5r4BgV8J_p2a7ISxmnstm6lTUmejNvGi68wJs1lM1ad/exec",
    "No": "https://script.google.com/macros/s/AKfycbx4ocDFD6RxmCWZZ-N-fDhqu-3_pYGs02JF_h4p5aQUg5UEjbzLCEGAvlpkqejweqTq/exec",
    "PO": "https://script.google.com/macros/s/AKfycbzTuNV4BAV6XsbPq6rUZF10-0F2qyXC52JVbiFQ27m8ucoUBe_1eSGJmnHbyFPDkk1mWA/exec",
    "Ss": "https://script.google.com/macros/s/AKfycby4JJI4eIxAhFxU3M-FFPC4aP7BzvirbqQwy2WeYXFLIYJrCk_r28e7J0sNaH8yXDCH/exec"
};

// URL del Script conectado a Base_Central_Cuestionario_EOTS (para leer catálogo de folios)
const URL_CATALOGO_CENTRAL = "https://script.google.com/macros/s/AKfycbyyzE4zDAMz4qWNUUxmFdLZ5zCZmdwFllKML-grfPTudWkDFTcttqPYJAn3aPsVarTR/exec";

// 2. MAPEO EXACTO DE ESTADOS A REGIONES
const MAPA_ESTADO_REGION = {
    "CIUDAD DE MEXICO": "CO", "MEXICO": "CO", "ESTADO DE MEXICO": "CO", "MORELOS": "CO", "PUEBLA": "CO", "TLAXCALA": "CO",
    "COAHUILA": "NC", "COAHUILA DE ZARAGOZA": "NC", "HIDALGO": "NC", "NUEVO LEON": "NC", "NUEVO LEÓN": "NC", "QUERETARO": "NC", "QUERÉTARO": "NC", "SAN LUIS POTOSI": "NC", "SAN LUIS POTOSÍ": "NC", "TAMAULIPAS": "NC", "VERACRUZ": "NC",
    "AGUASCALIENTES": "No", "BAJA CALIFORNIA": "No", "BAJA CALIFORNIA SUR": "No", "CHIHUAHUA": "No", "DURANGO": "No", "SINALOA": "No", "SONORA": "No", "ZACATECAS": "No",
    "COLIMA": "PO", "GUANAJUATO": "PO", "GUERRERO": "PO", "JALISCO": "PO", "MICHOACAN": "PO", "MICHOACAN DE OCAMPO": "PO", "MICHOACÁN DE OCAMPO": "PO", "MICHOACÁN": "PO", "NAYARIT": "PO",
    "CAMPECHE": "Ss", "CHIAPAS": "Ss", "OAXACA": "Ss", "QUINTANA ROO": "Ss", "TABASCO": "Ss", "YUCATAN": "Ss", "YUCATÁN": "Ss"
};

const LISTA_ESTADOS_OFICIAL = [
    "AGUASCALIENTES", "BAJA CALIFORNIA", "BAJA CALIFORNIA SUR", "CAMPECHE", "CHIAPAS", "CHIHUAHUA",
    "CIUDAD DE MEXICO", "COAHUILA", "COLIMA", "DURANGO", "ESTADO DE MEXICO", "GUANAJUATO",
    "GUERRERO", "HIDALGO", "JALISCO", "MICHOACAN", "MORELOS", "NAYARIT", "NUEVO LEON",
    "OAXACA", "PUEBLA", "QUERETARO", "QUINTANA ROO", "SAN LUIS POTOSI", "SINALOA", "SONORA",
    "TABASCO", "TAMAULIPAS", "TLAXCALA", "VERACRUZ", "YUCATAN", "ZACATECAS"
];

// Variables Globales
let catalogoSucursales = {}; 
let urlsArchivosSubidos = {};
let archivosEnProceso = 0;
let killReasonGlobal = "";
const form = document.getElementById('formCT');
const btnSubmit = document.getElementById('btnSubmit');

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW fallo:', err));
    });
}

// Inicialización al abrir la app
window.addEventListener('load', () => {
    llenarSelectEstados();
    fijarTimestampInicio();
    cargarCatalogoSucursales();
    actualizarContadorCola();

    window.addEventListener('online', () => {
        document.getElementById('offline-alert').style.display = 'none';
        revisarPendientes();
    });
    window.addEventListener('offline', () => {
        document.getElementById('offline-alert').style.display = 'block';
    });

    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', dispararSubidaAsincrona);
    });
});

// Normalizar texto (Mayúsculas sin acentos y sin salto de cursor)
document.addEventListener('input', e => {
    if (e.target.matches('input.uppercase')) {
        const original = e.target.value;
        const limpio = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        if (original !== limpio) {
            const pos = e.target.selectionStart;
            e.target.value = limpio;
            e.target.setSelectionRange(pos, pos);
        }
    }
});

function fijarTimestampInicio() {
    const ahora = new Date().toLocaleString('es-MX').replace(/,/g, "");
    document.getElementById('timestamp').value = ahora;
    document.getElementById('bannerEstado').innerText = `Sesión iniciada: ${ahora}`;
}

function llenarSelectEstados() {
    const sel = document.getElementById('estado_ct');
    LISTA_ESTADOS_OFICIAL.forEach(edo => sel.add(new Option(edo, edo)));
}

function asignarRegionPorEstado() {
    const edo = document.getElementById('estado_ct').value.toUpperCase().trim();
    const region = MAPA_ESTADO_REGION[edo] || "CO";
    document.getElementById('region_destino').value = region;
    document.getElementById('mostrar_region').value = region;
}

// 3. BÚSQUEDA DE FOLIO Y AUTOCOMPLETADO
async function cargarCatalogoSucursales() {
    // 1. Intentar leer la base maestra desde IndexedDB primero
    try {
        const db = await abrirDB();
        const tx = db.transaction(STORE_CATALOGO, "readonly");
        const req = tx.objectStore(STORE_CATALOGO).get("base_maestra");
        req.onsuccess = () => {
            if (req.result && req.result.datos) {
                catalogoSucursales = req.result.datos;
                const fechaSinc = localStorage.getItem('fecha_sinc_catalogo') || "Desconocida";
                document.getElementById('bannerEstado').innerText = `Catálogo cargado. Sincronizado: ${fechaSinc} (${Object.keys(catalogoSucursales).length} folios)`;
            }
        };
    } catch (e) { console.warn("No hay catálogo local previo."); }

    // 2. Si hay internet, descargar la versión más fresca
    if (navigator.onLine && URL_CATALOGO_CENTRAL.startsWith("http")) {
        try {
            const res = await fetch(URL_CATALOGO_CENTRAL + "?action=getCatalogo", {
                method: "GET", redirect: "follow", cache: "no-store" 
            });
            if (!res.ok) throw new Error("Fallo HTTP: " + res.status);
            
            const data = await res.json();
            if (data && Object.keys(data).length > 0) {
                catalogoSucursales = data;
                const fechaSinc = new Date().toLocaleString('es-MX');
                localStorage.setItem('fecha_sinc_catalogo', fechaSinc);
                
                // Guardar el catálogo gigante en IndexedDB sin chocar con los límites
                const db = await abrirDB();
                const tx = db.transaction(STORE_CATALOGO, "readwrite");
                tx.objectStore(STORE_CATALOGO).put({ id: "base_maestra", datos: data });
                
                document.getElementById('bannerEstado').innerText = `Catálogo sincronizado hoy: ${fechaSinc} (${Object.keys(data).length} folios)`;
            }
        } catch (e) {
            console.error("Error de red al descargar catálogo:", e);
        }
    }
}
function buscarFolioSucursal() {
    const folioSuc = document.getElementById('folio_sucursal').value.trim();
    if (!folioSuc) return alert("Ingresa un Folio de Sucursal para buscar.");

    const info = catalogoSucursales[folioSuc];
    if (!info) {
        alert("⚠️ Folio no encontrado en el catálogo precargado. Verifica el número o llena los datos manualmente.");
        document.getElementById('folio_ct').readOnly = false;
        document.getElementById('direccion').readOnly = false;
        return;
    }

    if (info.revisado) {
        const confirmar = confirm(`⚠️ El folio ${folioSuc} ya fue registrado anteriormente. ¿Deseas enviar una nueva actualización?`);
        if (!confirmar) return;
    }

    document.getElementById('folio_ct').value = info.folio_ct || "";
    let edoLimpio = (info.entidad_suc || info.entidad || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    
    // Homologación de nombres largos de la base a nombres cortos de la app
    if (edoLimpio === "COAHUILA DE ZARAGOZA") edoLimpio = "COAHUILA";
    if (edoLimpio === "VERACRUZ DE IGNACIO DE LA LLAVE") edoLimpio = "VERACRUZ";
    if (edoLimpio === "MICHOACAN DE OCAMPO") edoLimpio = "MICHOACAN";
    
    const selEdo = document.getElementById('estado_ct');
    if (Array.from(selEdo.options).some(o => o.value === edoLimpio)) {
        selEdo.value = edoLimpio;
    }
    asignarRegionPorEstado();

    document.getElementById('municipio_ct').value = (info.municipio_suc || info.municipio || "").toUpperCase();
    document.getElementById('nombre_sucursal_vista').value = `${info.razon_social || ""} - ${info.sucursal || ""}`;
    document.getElementById('direccion').value = info.direccion || "SIN DIRECCION EN BASE";
    document.getElementById('latitud').value = info.lat || "";
    document.getElementById('longitud').value = info.lng || "";

    const btnMaps = document.getElementById('btnMaps');
    if (info.lat && info.lng) {
        btnMaps.href = `https://www.google.com/maps/search/?api=1&query=${info.lat},${info.lng}`;
        btnMaps.classList.remove('disabled');
    } else {
        btnMaps.href = "#";
        btnMaps.classList.add('disabled');
    }
}

// 4. LÓGICA DE KILL SWITCHES (PREGUNTAS 1, 2 Y 2.1) Y REGLA DE LA PREGUNTA 6
function evaluarFlujoCuestionario() {
    const p1 = document.getElementById('p1_riesgo').value;
    const p2 = document.getElementById('p2_informal').value;
    const boxP2_1 = document.getElementById('box_p2_1');
    const selP2_1 = document.getElementById('p2_1_continua');

    // Mostrar u ocultar 2.1
    if (p2 === "SÍ" && p1 !== "SÍ") {
        boxP2_1.style.display = "block";
        selP2_1.required = true;
    } else {
        boxP2_1.style.display = "none";
        selP2_1.required = false;
        selP2_1.value = "";
    }

    const p2_1 = selP2_1.value;
    rehabilitarPreguntas();
    killReasonGlobal = "";

    if (p1 === "SÍ") {
        killReasonGlobal = "CERRADO POR ACTIVIDADES DE RIESGO";
        aplicarCierreAutomatico(["box_p2", "box_p2_1", "box_p3", "box_p4", "box_p5"], killReasonGlobal);
    } else if (p2 === "SÍ" && p2_1 === "NO") {
        killReasonGlobal = "CERRADO POR INFORMALIDAD NO VIABLE";
        aplicarCierreAutomatico(["box_p3", "box_p4", "box_p5"], killReasonGlobal);
    }
}

function aplicarCierreAutomatico(cajasIds, motivo) {
    cajasIds.forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        box.classList.add('section-disabled');
        const sel = box.querySelector('select');
        if (sel) {
            sel.required = false;
            if (!Array.from(sel.options).some(o => o.value === motivo)) {
                sel.add(new Option(motivo, motivo));
            }
            sel.value = motivo;
        }
    });

    // Regla: Si se cierra en 1 o 2.1, la pregunta 6 se contesta automáticamente con "MALO"
    const selP6 = document.getElementById('p6_valoracion');
    selP6.value = "MALO";
    document.getElementById('box_p6').classList.add('section-disabled');
    btnSubmit.innerText = `🚨 ENVIAR REPORTE (${motivo})`;
}

function rehabilitarPreguntas() {
    ["box_p2", "box_p2_1", "box_p3", "box_p4", "box_p5", "box_p6"].forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        box.classList.remove('section-disabled');
        const sel = box.querySelector('select');
        if (sel && sel.id !== "p2_1_continua") {
            sel.required = true;
            // Eliminar físicamente cualquier opción que empiece con "CERRADO"
            Array.from(sel.options).forEach(opt => {
                if (opt.value.startsWith("CERRADO POR")) sel.remove(opt.index);
            });
            if (sel.value.startsWith("CERRADO POR")) sel.value = "";
        }
    });
    btnSubmit.innerText = "💾 GUARDAR Y ENVIAR CUESTIONARIO";
    validarCongruenciaP6();
}
// Regla anti-dedazos: Si P3, P4 o P5 es "NO", no permitir "EXCELENTE" en P6
function validarCongruenciaP6() {
    if (killReasonGlobal !== "") return;
    const p3 = document.getElementById('p3_habilidades').value;
    const p4 = document.getElementById('p4_vacantes').value;
    const p5 = document.getElementById('p5_condiciones').value;
    const optExcelente = document.getElementById('opt_excelente');
    const selP6 = document.getElementById('p6_valoracion');
    const aviso = document.getElementById('aviso_congruencia');

    const hayNegativa = (p3 === "NO" || p4 === "NO" || p5 === "NO");
    optExcelente.disabled = hayNegativa;

    if (hayNegativa) {
        aviso.classList.remove('d-none');
        if (selP6.value === "EXCELENTE") selP6.value = "";
    } else {
        aviso.classList.add('d-none');
    }
}

// 5. COMPRESIÓN Y SUBIDA ASÍNCRONA DE FOTOS (Calidad 0.5 / 1200px para buena legibilidad)
function comprimirImagen(file, maxWidth = 1200, quality = 0.5) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error("Error procesando imagen"));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error("Error leyendo archivo"));
        reader.readAsDataURL(file);
    });
}

async function dispararSubidaAsincrona(e) {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;

    let badge = document.getElementById(`status_${input.id}`);
    if (!badge) {
        badge = document.createElement('span');
        badge.id = `status_${input.id}`;
        input.parentNode.appendChild(badge);
    }

    badge.className = 'badge bg-warning text-dark mt-2 d-block';
    badge.innerText = '⏳ Procesando foto...';
    archivosEnProceso++;
    btnSubmit.disabled = true;

    try {
        const base64 = await comprimirImagen(file);
        const region = document.getElementById('region_destino').value || "CO";
        const endpoint = ENDPOINTS_REGIONALES[region];
        const folioSuc = document.getElementById('folio_sucursal').value || "SINFOLIO";
            const folioCt = document.getElementById('folio_ct').value || "SINFOLIOCT";
            const nombreArchivo = `${folioCt}_${folioSuc}_${input.id}.jpg`;

            if (!navigator.onLine || !endpoint.startsWith("http")) {
                urlsArchivosSubidos[input.id] = base64;
                badge.className = 'badge bg-info text-dark mt-2 d-block';
                badge.innerText = '💾 Guardada en teléfono (Offline)';
                liberarBoton();
                return;
            }

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "upload", base64: base64, filename: nombreArchivo, region: region })
            });
        const data = await res.json();

        if (data.success) {
            urlsArchivosSubidos[input.id] = data.url;
            badge.className = 'badge bg-success mt-2 d-block';
            badge.innerText = '✅ Subida a Drive con éxito';
        } else {
            urlsArchivosSubidos[input.id] = base64;
            badge.className = 'badge bg-info text-dark mt-2 d-block';
            badge.innerText = '💾 Respaldada localmente';
        }
    } catch (err) {
        urlsArchivosSubidos[input.id] = await comprimirImagen(file);
        badge.className = 'badge bg-info text-dark mt-2 d-block';
        badge.innerText = '💾 Lista para envío offline';
    }
    liberarBoton();
}

function liberarBoton() {
    archivosEnProceso = Math.max(0, archivosEnProceso - 1);
    if (archivosEnProceso === 0) btnSubmit.disabled = false;
}

// 6. ENVÍO Y BASE DE DATOS LOCAL (INDEXEDDB)
const DB_NAME = "CalificacionCT_DB";
const STORE_NAME = "cola_envios";
const STORE_CATALOGO = "catalogo_offline";

function abrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 2); // Subimos versión a 2 para agregar catálogo
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id_local" });
            }
            if (!db.objectStoreNames.contains(STORE_CATALOGO)) {
                db.createObjectStore(STORE_CATALOGO, { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function guardarOffline(payload) {
    payload.id_local = Date.now().toString();
    const db = await abrirDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(payload);
    tx.oncomplete = () => actualizarContadorCola();
}

async function actualizarContadorCola() {
    const db = await abrirDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
        const count = req.result.length;
        const badge = document.getElementById('badgeQueue');
        document.getElementById('queueCount').innerText = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    };
}

async function revisarPendientes() {
    if (!navigator.onLine) return alert("Sigues sin señal. Intenta cuando tengas conexión.");
    const db = await abrirDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();

    req.onsuccess = async () => {
        const pendientes = req.result;
        if (pendientes.length === 0) return;

        for (const item of pendientes) {
            const endpoint = ENDPOINTS_REGIONALES[item.region_destino] || ENDPOINTS_REGIONALES["CO"];
            if (!endpoint.startsWith("http")) continue;
            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ action: "submit", data: item })
                });
                const r = await res.json();
                if (r.success) {
                    const dbDel = await abrirDB();
                    const txDel = dbDel.transaction(STORE_NAME, "readwrite");
                    txDel.objectStore(STORE_NAME).delete(item.id_local);
                }
            } catch (e) { break; }
        }
        actualizarContadorCola();
    };
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (archivosEnProceso > 0) return alert("Espera a que terminen de procesarse las fotografías.");

    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return alert("⚠️ Por favor completa todos los campos y fotografías obligatorias.");
    }

    const fd = new FormData(form);
    const payload = {};
    for (const [k, v] of fd.entries()) {
        if (!(v instanceof File)) payload[k] = v;
    }

    // Asegurar que los campos deshabilitados también se envíen con su valor
    ["p2_informal", "p2_1_continua", "p3_habilidades", "p4_vacantes", "p5_condiciones", "p6_valoracion"].forEach(id => {
        payload[id] = document.getElementById(id).value || "-";
    });

    const f_ext = urlsArchivosSubidos['foto_exterior'];
    const f_int1 = urlsArchivosSubidos['foto_interior_1'];
    const f_int2 = urlsArchivosSubidos['foto_interior_2'];

    payload.foto_exterior = f_ext ? (f_ext.startsWith("http") ? `=HYPERLINK("${f_ext}", "VER_Fachada")` : f_ext) : "";
    payload.foto_interior_1 = f_int1 ? (f_int1.startsWith("http") ? `=HYPERLINK("${f_int1}", "VER_Interior1")` : f_int1) : "";
    payload.foto_interior_2 = f_int2 ? (f_int2.startsWith("http") ? `=HYPERLINK("${f_int2}", "VER_Interior2")` : f_int2) : "SIN SEGUNDA FOTO INTERIOR";

    const region = payload.region_destino || "CO";
    const endpoint = ENDPOINTS_REGIONALES[region];

    btnSubmit.disabled = true;
    btnSubmit.innerText = "⏳ GUARDANDO REGISTRO...";

    if (!navigator.onLine || !endpoint.startsWith("http")) {
        await guardarOffline(payload);
        alert("💾 Guardado en el teléfono (Modo Offline). Se subirá al recuperar conexión.");
        reiniciarFormulario();
        return;
    }

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "submit", data: payload })
        });
        const data = await res.json();
        if (data.success) {
            alert(`✅ Registro guardado exitosamente en la base regional (${region}).`);
            reiniciarFormulario();
        } else {
            throw new Error(data.message || "Error en servidor");
        }
    } catch (err) {
        await guardarOffline(payload);
        alert("⚠️ Falló la red al enviar, pero tu registro quedó respaldado en el teléfono.");
        reiniciarFormulario();
    }
});

function reiniciarFormulario() {
    form.reset();
    form.classList.remove('was-validated');
    urlsArchivosSubidos = {};
    document.querySelectorAll('span[id^="status_"]').forEach(el => el.remove());
    document.getElementById('box_p2_1').style.display = 'none';
    document.getElementById('btnMaps').classList.add('disabled');
    rehabilitarPreguntas();
    fijarTimestampInicio();
    btnSubmit.disabled = false;
}
