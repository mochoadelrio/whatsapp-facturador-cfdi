import makeWASocket, { Browsers, DisconnectReason, downloadMediaMessage, useMultiFileAuthState, } from "@whiskeysockets/baileys";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { analizarArchivoRecibido } from "../services/geminiExtractor.js";
import { procesarFacturacionTicket } from "../services/invoicingAgent.js";
import { activarPlanCliente, ajustarConsumoTicket, cambiarInicioSuscripcionAHoy, formatearResumenPlan, guardarPerfilFiscal, marcarAvisoBajoSaldo, marcarAvisoVencimiento, obtenerListaClientesUnicos, obtenerPerfilFiscal, obtenerTodosLosPerfiles, recargarTicketsExtra, registrarConsumoTicket, renovarPlanCliente, verificarEstadoPlan, } from "../storage/profiles.js";
import { validarCepBanxico, DATOS_BANCARIOS_OFICIALES, } from "../services/banxicoValidator.js";
import { encolarTicketEnLote } from "../services/batchQueue.js";
const require = createRequire(import.meta.url);
const QRCodeVendor = require("qrcode-terminal/vendor/QRCode");
const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");
// Registro de IDs y contenido de mensajes enviados por el propio bot
const mensajesEnviadosPorBot = new Set();
const almacenMensajesEnviados = new Map();
const mensajesProcesados = new Set();
let notificacionInicialEnviada = false;
// Lista de números/JIDs de clientes y administradores autorizados
const clientesAutorizados = new Set([
    "4773929593",
    "5214773929593",
    "524773929593",
    "16922322174194",
    "4775907888",
    "5214775907888",
    "524775907888",
    "140974432981152",
]);
// Mapa de usuarios LID -> PN canónico para evitar sesiones Signal divididas (Bad MAC)
const LID_A_PN_MAP = {
    "16922322174194": "5214773929593",
    "140974432981152": "5214775907888",
    "524775907888": "5214775907888",
};
function canonicalizarSessionKey(id) {
    const dotIdx = id.indexOf(".");
    const userPart = dotIdx >= 0 ? id.slice(0, dotIdx) : id;
    const suffix = dotIdx >= 0 ? id.slice(dotIdx) : "";
    const canonicalUser = LID_A_PN_MAP[userPart] || userPart;
    return `${canonicalUser}${suffix}`;
}
function normalizarJidEnvio(jid) {
    if (jid.endsWith("@lid")) {
        return jid;
    }
    const userPart = jid.split("@")[0]?.split(":")[0] || "";
    if (userPart === "16922322174194" || userPart === "5214773929593") {
        return "5214773929593@s.whatsapp.net";
    }
    return jid;
}
function podarSesionesCerradas(recordObj) {
    if (!recordObj || typeof recordObj !== "object" || !recordObj._sessions) {
        return recordObj;
    }
    const entries = Object.entries(recordObj._sessions);
    if (entries.length === 0)
        return recordObj;
    // Ordenar todas las sesiones de la más reciente a la más antigua
    entries.sort((a, b) => {
        const aTime = Math.max(Number(a[1]?.indexInfo?.used) || 0, Number(a[1]?.indexInfo?.created) || 0);
        const bTime = Math.max(Number(b[1]?.indexInfo?.used) || 0, Number(b[1]?.indexInfo?.created) || 0);
        return bTime - aTime;
    });
    const abiertas = entries.filter(([, s]) => s?.indexInfo?.closed === -1);
    const cerradas = entries.filter(([, s]) => s?.indexInfo?.closed !== -1);
    // Si hay más de 1 sesión abierta, conservar únicamente la más reciente como abierta
    // para que record.getOpenSession() siempre tome la sesión activa real
    if (abiertas.length > 1) {
        for (let i = 1; i < abiertas.length; i++) {
            const [k, s] = abiertas[i];
            const closedCopy = {
                ...s,
                indexInfo: {
                    ...s.indexInfo,
                    closed: Number(s?.indexInfo?.used) || Date.now(),
                },
            };
            cerradas.unshift([k, closedCopy]);
        }
        abiertas.length = 1;
    }
    const cerradasRecientes = cerradas.slice(0, 4);
    const nuevasSesiones = {};
    for (const [k, v] of [...abiertas, ...cerradasRecientes]) {
        nuevasSesiones[k] = v;
    }
    return { ...recordObj, _sessions: nuevasSesiones };
}
function unificarSesionesPnLidEnDisco(authFolder) {
    try {
        const dirPath = path.resolve(process.cwd(), authFolder);
        if (!fs.existsSync(dirPath))
            return;
        const files = fs.readdirSync(dirPath);
        for (const [lidUser, pnUser] of Object.entries(LID_A_PN_MAP)) {
            if (lidUser === pnUser)
                continue;
            const prefix = `session-${lidUser}.`;
            for (const file of files) {
                if (!file.startsWith(prefix) || !file.endsWith(".json"))
                    continue;
                const suffix = file.slice(prefix.length); // ej. "0.json"
                const lidFilePath = path.join(dirPath, file);
                const pnFilePath = path.join(dirPath, `session-${pnUser}.${suffix}`);
                try {
                    const lidRaw = JSON.parse(fs.readFileSync(lidFilePath, "utf-8"));
                    let pnRaw = null;
                    if (fs.existsSync(pnFilePath)) {
                        pnRaw = JSON.parse(fs.readFileSync(pnFilePath, "utf-8"));
                    }
                    const lidClean = podarSesionesCerradas(lidRaw);
                    const pnClean = pnRaw ? podarSesionesCerradas(pnRaw) : null;
                    const mergedSessions = {
                        ...(lidClean?._sessions || {}),
                        ...(pnClean?._sessions || {}),
                    };
                    const merged = podarSesionesCerradas({
                        _sessions: mergedSessions,
                        version: pnClean?.version || lidClean?.version || "v1",
                    });
                    fs.writeFileSync(pnFilePath, JSON.stringify(merged), "utf-8");
                    fs.writeFileSync(lidFilePath, JSON.stringify(merged), "utf-8");
                }
                catch { }
            }
        }
        // Normalizar todos los archivos session-*.json para asegurar máximo 1 sesión abierta
        for (const file of fs.readdirSync(dirPath)) {
            if (!file.startsWith("session-") || !file.endsWith(".json"))
                continue;
            const fullPath = path.join(dirPath, file);
            try {
                const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
                const clean = podarSesionesCerradas(raw);
                fs.writeFileSync(fullPath, JSON.stringify(clean), "utf-8");
            }
            catch { }
        }
    }
    catch (e) {
        console.warn("Aviso limpiando sesiones Signal:", e?.message || e);
    }
}
export function formatearFormaPagoSat(clave, ultimosDigitos) {
    const c = (clave || "01").trim();
    const digitosTxt = ultimosDigitos ? ` (Terminación *${ultimosDigitos}*)` : "";
    switch (c) {
        case "01":
            return "01 - Efectivo 💵";
        case "04":
            return `04 - Tarjeta de Crédito 💳${digitosTxt}`;
        case "28":
            return `28 - Tarjeta de Débito 💳${digitosTxt}`;
        case "03":
            return "03 - Transferencia Electrónica 🏦";
        default:
            return `${c} (SAT)${digitosTxt}`;
    }
}
// Cola secuencial estricta para evitar colisiones de cifrado Signal (Bad MAC) en Baileys
let colaEnvio = Promise.resolve();
async function enviarMensajeBot(sock, jid, content) {
    const targetJid = normalizarJidEnvio(jid);
    const tarea = colaEnvio.then(async () => {
        try {
            // 1. Simular presencia humana de escritura ('composing') para evitar filtros anti-bot
            try {
                if (typeof sock.sendPresenceUpdate === "function") {
                    await sock.sendPresenceUpdate("composing", targetJid);
                }
            }
            catch { }
            // 2. Pausa natural humana (600ms a 1100ms)
            const delayHumano = Math.floor(Math.random() * 500) + 600;
            await new Promise((r) => setTimeout(r, delayHumano));
            const sent = await Promise.race([
                sock.sendMessage(targetJid, content),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout enviando mensaje WA")), 15000)),
            ]);
            // 3. Pausar estado de presencia
            try {
                if (typeof sock.sendPresenceUpdate === "function") {
                    await sock.sendPresenceUpdate("paused", targetJid);
                }
            }
            catch { }
            const msgId = sent?.key?.id;
            if (msgId) {
                mensajesEnviadosPorBot.add(msgId);
                if (sent?.message) {
                    almacenMensajesEnviados.set(msgId, sent.message);
                }
            }
            console.log(`📤 Mensaje enviado a ${targetJid} (id: ${msgId})`);
            return sent;
        }
        catch (err) {
            console.warn(`⚠️ Aviso al enviar mensaje a ${targetJid}:`, err?.message || err);
            return null;
        }
    });
    colaEnvio = tarea.catch(() => { });
    return tarea;
}
function guardarQrSvg(qrString) {
    const qrObj = new QRCodeVendor(-1, QRErrorCorrectLevel.L);
    qrObj.addData(qrString);
    qrObj.make();
    const count = qrObj.getModuleCount();
    const margin = 4;
    const size = count + margin * 2;
    let rects = "";
    for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
            if (qrObj.modules[r][c]) {
                rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="#000"/>`;
            }
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="240" height="240" class="rounded-lg shadow"><rect width="100%" height="100%" fill="#fff"/>${rects}</svg>`;
    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir))
        fs.mkdirSync(dataDir, { recursive: true });
    const svgPath = path.join(dataDir, "qr_actual.svg");
    fs.writeFileSync(svgPath, svg, "utf-8");
    const artifactHtmlPath = "/Users/manuel8a/.gemini/antigravity/brain/48b5ed8e-d3ac-45e3-8150-affefcef87ff/qr_whatsapp.html";
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="8" />
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3">
  <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-5">
    <div class="bg-white p-2 rounded-xl border border-[var(--border)] shrink-0">
      ${svg}
    </div>
    <div class="space-y-2 text-xs">
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
        <span>🟢 Bot Activo — Esperando Escaneo QR</span>
      </div>
      <h3 class="text-base font-bold">Conecta tu WhatsApp para probar el Bot</h3>
      <ol class="list-decimal list-inside space-y-1 text-[var(--muted-foreground)]">
        <li>Abre <b>WhatsApp</b> en tu teléfono.</li>
        <li>Ve a <b>Configuración</b> (o menú ⋮) → <b>Dispositivos vinculados</b>.</li>
        <li>Toca <b>Vincular un dispositivo</b> y apunta tu cámara a este código QR.</li>
        <li>Una vez conectado, abre tu propio chat (<i>"Mensajes contigo mismo"</i>) y envía <code>/ayuda</code>, tu <b>Constancia (PDF o foto)</b> o la <b>foto de un ticket</b>.</li>
      </ol>
      <p class="text-[11px] text-[var(--muted-foreground)] opacity-75">Actualizado: ${new Date().toLocaleTimeString()}</p>
    </div>
  </div>
</body>
</html>`;
    try {
        fs.writeFileSync(artifactHtmlPath, html, "utf-8");
    }
    catch { }
    return svg;
}
const BOT_SIGNATURE = "✨ *KlientIA Facturación*";
let currentSock = null;
let reconnectingTimeout = null;
let estadoMotorBot = "RUNNING";
let ultimaConexionStatus = "connecting";
let ultimoQrSvg = "";
let intentosReconexionConsecutivos = 0;
export function obtenerEstadoMotorBot() {
    const uptimeSec = Math.floor(process.uptime());
    const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const myIdNum = currentSock?.user?.id?.split(":")[0]?.split("@")[0] || null;
    return {
        motor: estadoMotorBot,
        conexionWa: ultimaConexionStatus,
        usuarioConectado: myIdNum,
        nombreConectado: currentSock?.user?.name || "KlientIA Facturación",
        qrCodeSvg: ultimoQrSvg,
        uptimeSec,
        memoriaMb: memMb,
        horaServidor: new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" }),
    };
}
export async function encenderMotorBot() {
    estadoMotorBot = "RUNNING";
    if (!currentSock || ultimaConexionStatus === "close") {
        await iniciarBotWhatsApp();
    }
    return { ok: true, mensaje: "Motor encendido y escuchando tickets correctamente." };
}
export function pausarMotorBot() {
    estadoMotorBot = "PAUSED";
    return { ok: true, mensaje: "Motor del bot pausado. No se procesarán tickets hasta reactivarlo." };
}
/**
 * Envía directamente por WhatsApp los archivos PDF y XML de una factura recién generada a un cliente.
 */
export async function enviarFacturaDirectaCliente(params) {
    if (!currentSock || ultimaConexionStatus !== "open") {
        return { ok: false, mensaje: "WhatsApp no está conectado en este momento en el servidor." };
    }
    const rawTarget = params.targetJidOrPhone.trim();
    const jid = rawTarget.includes("@")
        ? rawTarget
        : `${rawTarget.replace(/\D/g, "")}@s.whatsapp.net`;
    const targetJid = normalizarJidEnvio(jid);
    const emisor = params.emisor || "Proveedor";
    const folio = params.folio || "Oficial";
    const uuid = params.uuid || "Validado ante SAT";
    const total = params.total ? `$${params.total.toFixed(2)} MXN` : "";
    const receptor = params.receptorNombre
        ? `${params.receptorNombre}${params.receptorRfc ? ` (\`${params.receptorRfc}\`)` : ""}`
        : "Cliente";
    let enviado = false;
    // 1. Enviar PDF
    if (params.pdfPath && fs.existsSync(params.pdfPath)) {
        const pdfBuffer = fs.readFileSync(params.pdfPath);
        await enviarMensajeBot(currentSock, targetJid, {
            document: pdfBuffer,
            mimetype: "application/pdf",
            fileName: `Factura_${folio.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
            caption: `🤖 *KlientIA Facturación Automática*
📄 *Factura CFDI 4.0 Oficial (PDF)*
• *Emisor:* ${emisor}
• *Folio:* ${folio}
• *UUID SAT:* \`${uuid}\`${total ? `\n• *Total:* ${total}` : ""}
• *Receptor:* ${receptor}

_Tu conector ha sido configurado y tu factura se ha emitido y entregado con éxito._`,
        });
        enviado = true;
    }
    // 2. Enviar XML
    if (params.xmlPath && fs.existsSync(params.xmlPath)) {
        const xmlBuffer = fs.readFileSync(params.xmlPath);
        await enviarMensajeBot(currentSock, targetJid, {
            document: xmlBuffer,
            mimetype: "application/xml",
            fileName: `Factura_${folio.replace(/[^a-zA-Z0-9_-]/g, "_")}.xml`,
            caption: `🤖 *KlientIA Facturación Automática*
🗂️ *Comprobante Fiscal Digital XML CFDI 4.0 Oficial*
• *Emisor:* ${emisor}
• *UUID SAT:* \`${uuid}\``,
        });
        enviado = true;
    }
    if (!enviado) {
        return { ok: false, mensaje: "No se encontraron los archivos PDF ni XML para enviar." };
    }
    return { ok: true, mensaje: `Factura (PDF y XML) enviada exitosamente a ${targetJid}.` };
}
export async function reiniciarMotorBot() {
    estadoMotorBot = "RUNNING";
    if (reconnectingTimeout)
        clearTimeout(reconnectingTimeout);
    await iniciarBotWhatsApp();
    return { ok: true, mensaje: "Motor reiniciado exitosamente." };
}
export async function desvincularSesionWhatsApp() {
    if (reconnectingTimeout)
        clearTimeout(reconnectingTimeout);
    if (currentSock) {
        try {
            await currentSock.logout();
        }
        catch { }
        try {
            currentSock.ev.removeAllListeners();
            currentSock.end(undefined);
        }
        catch { }
        currentSock = null;
    }
    ultimaConexionStatus = "connecting";
    ultimoQrSvg = "";
    const authFolder = process.env.AUTH_FOLDER || "auth_whatsapp";
    const dirPath = path.resolve(process.cwd(), authFolder);
    if (fs.existsSync(dirPath)) {
        try {
            for (const f of fs.readdirSync(dirPath)) {
                try {
                    fs.unlinkSync(path.join(dirPath, f));
                }
                catch { }
            }
        }
        catch { }
    }
    setTimeout(() => {
        iniciarBotWhatsApp();
    }, 1000);
    return { ok: true, mensaje: "Sesión desvinculada exitosamente. Escanea el nuevo código QR para conectar el nuevo número." };
}
export async function verificarAvisosVencimientoProactivos(sock) {
    if (!sock || ultimaConexionStatus !== "open")
        return;
    try {
        const clientes = obtenerListaClientesUnicos();
        const hoyStr = new Date().toISOString().slice(0, 10);
        const msHoy = new Date(hoyStr).getTime();
        for (const cliente of clientes) {
            if (!cliente.fechaFinPlan)
                continue;
            if (cliente.estadoPlan !== "ACTIVO" && cliente.estadoPlan !== "AGOTADO")
                continue;
            const msFin = new Date(cliente.fechaFinPlan).getTime();
            const diasRestantes = Math.ceil((msFin - msHoy) / (1000 * 60 * 60 * 24));
            // Avisar con 2 días de anticipación al vencimiento
            if (diasRestantes === 2) {
                if (cliente.avisoVencimientoEnviadoParaFecha === cliente.fechaFinPlan) {
                    continue; // Ya notificado para este ciclo
                }
                const targetJid = cliente.jids?.find((j) => !j.startsWith("cliente_") && j.includes("@s.whatsapp.net")) ||
                    (cliente.telefono ? `${cliente.telefono.replace(/\D/g, "")}@s.whatsapp.net` : null);
                if (!targetJid)
                    continue;
                const ticketsRestantes = Math.max(0, (cliente.ticketsIncluidos ?? 40) - (cliente.ticketsUsadosMes ?? 0));
                let mensaje = `${BOT_SIGNATURE}
🔔 *Recordatorio de Renovación de Suscripción*

Hola *${cliente.razonSocial}*, te recordamos que tu periodo mensual de facturación vence en *2 días* (el *${cliente.fechaFinPlan}*).

📊 *Estado actual:*
• *Plan:* ${cliente.paqueteNombre || "Plan Mensual"}
• *Folios restantes:* *${ticketsRestantes} tickets* disponibles

Te ofrecemos la opción de realizar el pago de tu renovación hoy mismo para continuar facturando sin ninguna interrupción.

📦 *Paquetes de Renovación (Vigencia de 30 días):*
1️⃣ *Plan Básico (20 tickets):* \$179 MXN
2️⃣ *Plan Pro (40 tickets):* \$299 MXN ⭐
3️⃣ *Plan Negocio (80 tickets):* \$499 MXN
4️⃣ *Plan Empresa (100 tickets):* \$599 MXN

💳 *Datos bancarios para transferencia SPEI:*
• *Beneficiario:* ${DATOS_BANCARIOS_OFICIALES.beneficiario}
• *Cuenta CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Institución:* ${DATOS_BANCARIOS_OFICIALES.institucion}
• *Concepto:* \`Renovacion ${cliente.rfc}\`

📅 *Regla de Vigencia:*
Tu nueva suscripción iniciará **al concluir tu periodo actual** (a partir del ${cliente.fechaFinPlan}), por lo que no pierdes ningún día de tu mes vigente.`;
                if (ticketsRestantes === 0) {
                    mensaje += `\n\n⚠️ *Folios agotados:* Como actualmente ya no tienes folios disponibles, si decides no comprar folios extras (\$5.00 c/u) y deseas que tus nuevos 30 días inicien **a partir de hoy**, indícalo al enviar tu comprobante respondiendo *"INICIAR HOY"*.`;
                }
                else {
                    mensaje += `\n\n📲 *Para renovar:* Realiza tu transferencia y envía aquí tu comprobante; validaremos el estatus ante el CEP de Banxico y acreditaremos tus folios automáticamente.`;
                }
                await enviarMensajeBot(sock, targetJid, { text: mensaje });
                marcarAvisoVencimiento(cliente.rfc, cliente.fechaFinPlan);
                console.log(`🔔 [Aviso 2 días] Notificación enviada a ${cliente.rfc} (${targetJid})`);
            }
        }
    }
    catch (err) {
        console.warn("Aviso al verificar vencimientos proactivos:", err?.message || err);
    }
}
export async function iniciarBotWhatsApp() {
    if (currentSock) {
        try {
            currentSock.ev.removeAllListeners();
            currentSock.end(undefined);
        }
        catch { }
        currentSock = null;
    }
    const authFolder = process.env.AUTH_FOLDER || "auth_whatsapp";
    unificarSesionesPnLidEnDisco(authFolder);
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    // Envolver state.keys para que LID y PN usen siempre la misma clave de sesión Signal
    if (!state.keys.__wrappedSignal) {
        state.keys.__wrappedSignal = true;
        const origGet = state.keys.get.bind(state.keys);
        const origSet = state.keys.set.bind(state.keys);
        state.keys.get = async (type, ids) => {
            if (type !== "session") {
                return origGet(type, ids);
            }
            const mappedIds = Array.from(new Set(ids.map(canonicalizarSessionKey)));
            const res = await origGet(type, mappedIds);
            const out = {};
            for (const id of ids) {
                const cId = canonicalizarSessionKey(id);
                if (res[cId]) {
                    out[id] = podarSesionesCerradas(res[cId]);
                }
            }
            return out;
        };
        state.keys.set = async (data) => {
            if (data?.session) {
                const newSess = {};
                for (const [id, val] of Object.entries(data.session)) {
                    const cId = canonicalizarSessionKey(id);
                    const clean = val ? podarSesionesCerradas(val) : val;
                    newSess[cId] = clean;
                    newSess[id] = clean;
                }
                data = { ...data, session: newSess };
            }
            return origSet(data);
        };
    }
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Chrome"),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        maxMsgRetryCount: 3,
        getMessage: async (key) => {
            if (key?.id && almacenMensajesEnviados.has(key.id)) {
                return almacenMensajesEnviados.get(key.id);
            }
            return undefined;
        },
    });
    currentSock = sock;
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            ultimoQrSvg = guardarQrSvg(qr);
            ultimaConexionStatus = "connecting";
            console.log("\n========================================================");
            console.log("📱 ESCANEA ESTE CÓDIGO QR DESDE TU WHATSAPP O EL PANEL WEB:");
            console.log("   (Configuración -> Dispositivos vinculados -> Vincular)");
            console.log("========================================================\n");
            qrcode.generate(qr, { small: true });
        }
        if (connection === "close") {
            ultimaConexionStatus = "close";
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isFatalAuth = statusCode === DisconnectReason.loggedOut || statusCode === 403 || statusCode === 401;
            const shouldReconnect = !isFatalAuth;
            console.log(`⚠️ Conexión cerrada (código ${statusCode}). Reconectando: ${shouldReconnect}`);
            if (shouldReconnect) {
                if (reconnectingTimeout)
                    clearTimeout(reconnectingTimeout);
                intentosReconexionConsecutivos++;
                // Protección anti-bucle: si hay más de 6 fallos seguidos, pausar intentos para proteger el número
                if (intentosReconexionConsecutivos > 6) {
                    console.warn("⚠️ Múltiples fallos consecutivos de conexión (>6). Pausando reconexión automática para proteger el número.");
                    return;
                }
                // Backoff exponencial suave con variación aleatoria (jitter): 5s, 8s, 15s, 25s, 35s...
                const baseDelay = Math.min(35000, 3000 * Math.pow(1.6, Math.min(intentosReconexionConsecutivos, 5)));
                const jitter = Math.floor(Math.random() * 2000);
                const delay = Math.round(baseDelay + jitter);
                console.log(`⏳ Esperando ${Math.round(delay / 1000)}s antes de reconectar limpiamente (intento #${intentosReconexionConsecutivos})...`);
                reconnectingTimeout = setTimeout(() => iniciarBotWhatsApp(), delay);
            }
            else {
                console.log("❌ Sesión cerrada o rechazada (403/401/loggedOut). Limpiando auth_whatsapp para generar nuevo código QR...");
                intentosReconexionConsecutivos = 0;
                const authFolder = process.env.AUTH_FOLDER || "auth_whatsapp";
                const dirPath = path.resolve(process.cwd(), authFolder);
                if (fs.existsSync(dirPath)) {
                    try {
                        for (const f of fs.readdirSync(dirPath)) {
                            try {
                                fs.unlinkSync(path.join(dirPath, f));
                            }
                            catch { }
                        }
                    }
                    catch { }
                }
                if (reconnectingTimeout)
                    clearTimeout(reconnectingTimeout);
                reconnectingTimeout = setTimeout(() => iniciarBotWhatsApp(), 2500);
            }
        }
        else if (connection === "open") {
            ultimaConexionStatus = "open";
            ultimoQrSvg = "";
            intentosReconexionConsecutivos = 0;
            console.log("\n✅ ¡Bot de Facturación conectado exitosamente a WhatsApp!");
            console.log("   ID Usuario:", sock.user?.id, "| LID:", sock.user?.lid);
            console.log("💡 Número Bot activo: +52 56 2339 3840 | Administrador: +52 477 392 9593\n");
            // Al conectar, notificar al admin Manuel y al bot
            if (!notificacionInicialEnviada) {
                notificacionInicialEnviada = true;
                const myIdNum = sock.user?.id?.split(":")[0]?.split("@")[0] || "5215623393840";
                const selfPnJid = `${myIdNum}@s.whatsapp.net`;
                const adminJid = "5214773929593@s.whatsapp.net";
                setTimeout(async () => {
                    // Enviar confirmación al teléfono de Manuel
                    await enviarMensajeBot(sock, adminJid, {
                        text: `${BOT_SIGNATURE}
🟢 *¡KlientIA Facturación Conectado con Éxito!*
📱 *Número Oficial del Bot:* +52 56 2339 3840

Ya estoy 100% en línea listo para recibir tickets y comandos desde tu WhatsApp.`,
                    });
                    await enviarMensajeBot(sock, selfPnJid, {
                        text: `${BOT_SIGNATURE}
🟢 *¡KlientIA Facturación Conectado y Actualizado!*

📖 *Listado Completo de Comandos:*

⚡ *Diagnóstico del Bot:*
• \`/status\` o \`/ping\` — Verifica conexión, memoria y conectores activos.

📊 *Control de Clientes, Planes y Folios:*
• \`/clientes\` o \`/reporte\` — Lista de clientes, folios usados y vigencia.
• \`/saldo <RFC o Teléfono>\` — Consulta los tickets y vigencia de un cliente (ej. \`/saldo VAMC9112056Q2\`).
• \`/ajustar-tickets <RFC> <cantidad>\` — Fija manualmente los tickets usados de un cliente.
• \`/activar-plan <RFC> <20|40|80|100>\` — Activa un plan por 30 días manualmente.
• \`/autorizar <10 dígitos>\` — Registra el celular de un nuevo cliente.

💳 *Paquetes y Pagos SPEI Banxico:*
• \`/planes\` o \`/paquetes\` — Muestra los paquetes (20, 40, 80, 100 tickets) y tu CLABE de Mercado Pago W.
• *Enviar captura de transferencia* — Valida el CEP en Banxico y activa el plan o recarga en automático.

🏢 *Datos Fiscales:*
• \`/perfil\` — Muestra los datos fiscales registrados.
• *Enviar Constancia SAT (PDF o foto)* — Da de alta al cliente y le envía los paquetes a elegir.

✨ *Marca y Ayuda:*
• \`/logo\` — Envía el logotipo oficial de KlientIA.
• \`/comandos\` — Vuelve a mostrar esta guía cuando la necesites.`,
                    });
                }, 2500);
            }
            try {
                const artifactHtmlPath = "/Users/manuel8a/.gemini/antigravity/brain/48b5ed8e-d3ac-45e3-8150-affefcef87ff/qr_whatsapp.html";
                fs.writeFileSync(artifactHtmlPath, `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script></head><body class="bg-transparent text-[var(--foreground)] p-4"><div class="bg-[var(--card)] border border-emerald-500/40 rounded-xl p-5 text-center space-y-2"><div class="text-2xl">✅</div><h3 class="font-bold text-base text-emerald-400">¡WhatsApp Conectado Exitosamente!</h3><p class="text-xs text-[var(--muted-foreground)]">Envía en tu chat <b>"Mensajes contigo mismo"</b> el PDF/foto de tu Constancia o la foto de cualquier ticket de compra.</p></div></body></html>`, "utf-8");
            }
            catch { }
            // Verificación proactiva de avisos de renovación (2 días antes de vencer)
            setTimeout(() => {
                verificarAvisosVencimientoProactivos(sock);
            }, 12000);
            // Revisar periódicamente cada 2 horas
            setInterval(() => {
                verificarAvisosVencimientoProactivos(sock);
            }, 2 * 60 * 60 * 1000);
            // Procesador de outbox para envíos directos sin reiniciar el bot
            const outboxDir = path.resolve(process.cwd(), "data", "outbox");
            if (!fs.existsSync(outboxDir))
                fs.mkdirSync(outboxDir, { recursive: true });
            setInterval(async () => {
                try {
                    if (!fs.existsSync(outboxDir))
                        return;
                    const files = fs.readdirSync(outboxDir).filter((f) => f.endsWith(".json"));
                    for (const f of files) {
                        const filePath = path.join(outboxDir, f);
                        try {
                            const raw = fs.readFileSync(filePath, "utf-8");
                            fs.unlinkSync(filePath);
                            const data = JSON.parse(raw);
                            if (data?.jid && data?.content) {
                                console.log(`📬 [Outbox] Enviando mensaje a ${data.jid}...`);
                                if (data.content.document && typeof data.content.document === "string" && fs.existsSync(data.content.document)) {
                                    data.content.document = fs.readFileSync(data.content.document);
                                }
                                await enviarMensajeBot(sock, data.jid, data.content);
                            }
                        }
                        catch (err) {
                            console.warn(`Aviso en outbox (${f}):`, err?.message || err);
                        }
                    }
                }
                catch { }
            }, 1000);
        }
    });
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify" && type !== "append")
            return;
        for (const msg of messages) {
            try {
                await manejarMensajeEntrante(sock, msg);
            }
            catch (err) {
                console.error("Error procesando mensaje:", err);
            }
        }
    });
    sock.ev.on("messaging-history.set", async ({ messages }) => {
        if (!Array.isArray(messages) || messages.length === 0)
            return;
        console.log(`📚 Historial recibido (${messages.length} mensajes sincronizados en segundo plano).`);
        // Registrar IDs en mensajesProcesados para no volver a responder mensajes viejos del teléfono
        for (const msg of messages) {
            if (msg?.key?.id) {
                mensajesProcesados.add(msg.key.id);
            }
        }
    });
}
const botStartTimeSec = Math.floor(Date.now() / 1000);
const PROCESSED_FILE_PATH = path.resolve(process.cwd(), "data", "mensajes_procesados.json");
try {
    if (fs.existsSync(PROCESSED_FILE_PATH)) {
        const ids = JSON.parse(fs.readFileSync(PROCESSED_FILE_PATH, "utf-8"));
        if (Array.isArray(ids)) {
            for (const id of ids)
                mensajesProcesados.add(String(id));
        }
    }
}
catch { }
function marcarMensajeProcesado(id) {
    mensajesProcesados.add(id);
    try {
        const dir = path.dirname(PROCESSED_FILE_PATH);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        const recientes = Array.from(mensajesProcesados).slice(-500);
        fs.writeFileSync(PROCESSED_FILE_PATH, JSON.stringify(recientes), "utf-8");
    }
    catch { }
}
function obtenerTimestampSegundos(ts) {
    if (!ts)
        return 0;
    if (typeof ts === "number")
        return ts;
    if (typeof ts.toNumber === "function")
        return ts.toNumber();
    if (typeof ts.low === "number")
        return ts.low >>> 0;
    return Number(ts) || 0;
}
function desenvolverMensaje(message) {
    if (!message)
        return null;
    if (message.deviceSentMessage?.message) {
        return desenvolverMensaje(message.deviceSentMessage.message);
    }
    if (message.ephemeralMessage?.message) {
        return desenvolverMensaje(message.ephemeralMessage.message);
    }
    if (message.viewOnceMessage?.message) {
        return desenvolverMensaje(message.viewOnceMessage.message);
    }
    if (message.viewOnceMessageV2?.message) {
        return desenvolverMensaje(message.viewOnceMessageV2.message);
    }
    if (message.viewOnceMessageV2Extension?.message) {
        return desenvolverMensaje(message.viewOnceMessageV2Extension.message);
    }
    if (message.documentWithCaptionMessage?.message) {
        return desenvolverMensaje(message.documentWithCaptionMessage.message);
    }
    if (message.associatedChildMessage?.message) {
        return desenvolverMensaje(message.associatedChildMessage.message);
    }
    if (message.editedMessage?.message) {
        return desenvolverMensaje(message.editedMessage.message);
    }
    return message;
}
async function manejarMensajeEntrante(sock, msg) {
    if (!msg.key?.id)
        return;
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) {
        return;
    }
    if (!msg.message) {
        console.log("⚠️ Stanza sin descifrar / vacía en chat:", {
            remoteJid,
            id: msg.key.id,
            stubType: msg.messageStubType,
            stubParams: msg.messageStubParameters,
        });
        return;
    }
    // Ignorar mensajes ya procesados o enviados por el propio bot
    if (mensajesEnviadosPorBot.has(msg.key.id) ||
        mensajesProcesados.has(msg.key.id)) {
        return;
    }
    // Identificar si es el chat consigo mismo ("Mensajes contigo mismo") o un cliente autorizado
    const myIdNum = sock.user?.id?.split(":")[0]?.split("@")[0];
    const myLidNum = sock.user?.lid?.split(":")[0]?.split("@")[0];
    const isSelfChat = Boolean((myIdNum && remoteJid.startsWith(myIdNum)) ||
        (myLidNum && remoteJid.startsWith(myLidNum)));
    const remNum = remoteJid.split("@")[0]?.replace(/\D/g, "") || "";
    const senderPn = String(msg.key?.senderPn || msg.key?.remoteJidAlt || "")
        .split("@")[0]
        ?.replace(/\D/g, "");
    const pushNameLower = String(msg.pushName || "").toLowerCase();
    const isCristhianByName = pushNameLower.includes("cristhian") ||
        pushNameLower.includes("cristian") ||
        pushNameLower.includes("valdivia");
    if (isCristhianByName && remNum) {
        clientesAutorizados.add(remNum);
    }
    const isAuthorizedClient = isCristhianByName ||
        Array.from(clientesAutorizados).some((num) => (remNum && (remNum.endsWith(num) || num.endsWith(remNum))) ||
            (senderPn && (senderPn.endsWith(num) || num.endsWith(senderPn))));
    // Ventana de tiempo: para clientes autorizados permitir recuperar tickets de las últimas 2 horas
    const msgTime = obtenerTimestampSegundos(msg.messageTimestamp);
    const ventanaSegundos = isAuthorizedClient && !isSelfChat ? 7200 : 30;
    if (msgTime > 0 && msgTime < botStartTimeSec - ventanaSegundos) {
        return;
    }
    const contenido = desenvolverMensaje(msg.message);
    if (!contenido)
        return;
    const texto = contenido.conversation ||
        contenido.extendedTextMessage?.text ||
        contenido.imageMessage?.caption ||
        contenido.documentMessage?.caption ||
        "";
    if (texto.includes(BOT_SIGNATURE)) {
        marcarMensajeProcesado(msg.key.id);
        return;
    }
    // Si el mensaje fue enviado por el propio bot (fromMe) sin ser un ticket con imagen en self-chat, ignorar
    if (msg.key.fromMe && !isSelfChat) {
        marcarMensajeProcesado(msg.key.id);
        return;
    }
    const imageMsg = contenido.imageMessage;
    const docMsg = contenido.documentMessage;
    const tieneImagen = Boolean(imageMsg);
    const tieneDocumento = Boolean(docMsg);
    const textoLimpio = texto.trim();
    console.log("🔎 Mensaje 1-a-1 detectado:", {
        remoteJid,
        pushName: msg.pushName,
        fromMe: msg.key.fromMe,
        isSelfChat,
        isAuthorizedClient,
        tieneImagen,
        tieneDocumento,
        texto: textoLimpio.slice(0, 50),
    });
    if (!tieneImagen && !tieneDocumento && !textoLimpio) {
        return;
    }
    marcarMensajeProcesado(msg.key.id);
    // La respuesta siempre se envía directamente al usuario que escribió (remoteJid)
    const replyJid = remoteJid;
    const perfilKey = remoteJid;
    console.log("📩 Procesando mensaje:", {
        remoteJid,
        senderPn,
        replyJid,
        tieneImagen,
        tieneDocumento,
        texto: textoLimpio.slice(0, 60),
    });
    // Control de Pausa del Motor desde WhatsApp
    if (textoLimpio.toLowerCase() === "/pausar") {
        estadoMotorBot = "PAUSED";
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}\n⏸️ *Motor de Facturación Pausado*\n\nEl bot ahora ignorará temporalmente el procesamiento de tickets hasta que uses \`/encender\` o lo actives desde el panel de administración web.`,
        });
        return;
    }
    if (textoLimpio.toLowerCase() === "/encender" || textoLimpio.toLowerCase() === "/reanudar") {
        estadoMotorBot = "RUNNING";
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}\n▶️ *Motor de Facturación Encendido*\n\nEl bot está 100% activo y procesando tickets en tiempo real.`,
        });
        return;
    }
    if (estadoMotorBot === "PAUSED") {
        const esComandoAdmin = textoLimpio.startsWith("/") ||
            textoLimpio.toLowerCase() === "ping" ||
            textoLimpio.toLowerCase() === "status" ||
            textoLimpio.toLowerCase() === "comandos";
        if (!esComandoAdmin) {
            if (tieneImagen || tieneDocumento) {
                await enviarMensajeBot(sock, replyJid, {
                    text: `${BOT_SIGNATURE}
⏸️ *Motor de Facturación en Pausa*

El servicio de procesamiento de tickets se encuentra temporalmente en pausa desde el panel de administración.

Tu comprobante ha sido recibido y será procesado en cuanto el motor sea encendido nuevamente (puedes reactivarlo escribiendo \`/encender\` o desde el panel web).`,
                });
            }
            return;
        }
    }
    // Comando /bienvenida para enviar mensaje de alta directamente a Cristhian (+5214775907888)
    if (textoLimpio.toLowerCase() === "/bienvenida") {
        const { perfil } = obtenerPerfilFiscal("5214775907888@s.whatsapp.net");
        let targetJid = "5214775907888@s.whatsapp.net";
        try {
            const res = await sock.onWhatsApp("5214775907888");
            if (Array.isArray(res) && res[0]?.jid) {
                targetJid = res[0].jid;
            }
        }
        catch { }
        await enviarMensajeBot(sock, targetJid, {
            text: `${BOT_SIGNATURE}\n👋 ¡Hola *${perfil.razonSocial}*!\n\nTu cuenta de facturación automática CFDI 4.0 ya está activa con tus datos fiscales:\n• *RFC:* \`${perfil.rfc}\`\n• *Código Postal:* ${perfil.codigoPostal}\n• *Régimen Fiscal:* ${perfil.regimenFiscal} (RESICO)\n• *Uso de CFDI:* ${perfil.usoCfdi}\n\n${formatearResumenPlan(perfil)}\n\n📸 *¿Cómo facturar?* Solo envía por este chat la **foto de cualquier ticket de compra** y recibirás tu factura en **PDF y XML** en segundos.\n\nEscribe \`/plan\` o \`/perfil\` cuando quieras consultar tus tickets disponibles del mes.`,
        });
        if (replyJid !== targetJid) {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n✅ Mensaje de bienvenida enviado al WhatsApp de *${perfil.razonSocial}* (\`+52 1 477 590 7888\`).`,
            });
        }
        return;
    }
    // Comando /autorizar <numero> para permitir que un cliente escriba desde su propio celular
    if (textoLimpio.toLowerCase().startsWith("/autorizar ")) {
        const numLimpio = textoLimpio.slice(11).replace(/\D/g, "");
        if (numLimpio.length >= 10) {
            clientesAutorizados.add(numLimpio.slice(-10));
            const { perfil } = obtenerPerfilFiscal(perfilKey);
            guardarPerfilFiscal(`521${numLimpio.slice(-10)}@s.whatsapp.net`, perfil);
            guardarPerfilFiscal(`52${numLimpio.slice(-10)}@s.whatsapp.net`, perfil);
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n✅ *Cliente autorizado:* \`${numLimpio.slice(-10)}\`\n\nYa pre-cargué los datos fiscales de *${perfil.razonSocial}* (\`${perfil.rfc}\`) para ese número. Si esa persona te escribe a tu WhatsApp o te manda la foto de un ticket, el bot le responderá automáticamente con su factura PDF y XML.`,
            });
            return;
        }
    }
    // 0.9 Comando /comandos o /menu
    if (textoLimpio.toLowerCase() === "/comandos" ||
        textoLimpio.toLowerCase() === "comandos" ||
        textoLimpio.toLowerCase() === "/menu" ||
        textoLimpio.toLowerCase() === "menu") {
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}
📖 *Listado Completo de Comandos:*

⚡ *Diagnóstico del Bot:*
• \`/status\` o \`/ping\` — Verifica conexión, memoria y conectores activos.

📊 *Control de Clientes, Planes y Folios:*
• \`/clientes\` o \`/reporte\` — Lista de clientes, folios usados y vigencia.
• \`/saldo <RFC o Teléfono>\` — Consulta los tickets y vigencia de un cliente (ej. \`/saldo VAMC9112056Q2\`).
• \`/ajustar-tickets <RFC> <cantidad>\` — Fija manualmente los tickets usados de un cliente.
• \`/activar-plan <RFC> <20|40|80|100>\` — Activa un plan por 30 días manualmente.
• \`/autorizar <10 dígitos>\` — Registra el celular de un nuevo cliente.

💳 *Paquetes y Pagos SPEI Banxico:*
• \`/planes\` o \`/paquetes\` — Muestra los paquetes (20, 40, 80, 100 tickets) y tu CLABE de Mercado Pago W.
• *Enviar captura de transferencia* — Valida el CEP en Banxico y activa el plan o recarga en automático.

🏢 *Datos Fiscales:*
• \`/perfil\` — Muestra los datos fiscales registrados.
• *Enviar Constancia SAT (PDF o foto)* — Da de alta al cliente y le envía los paquetes a elegir.

✨ *Marca y Ayuda:*
• \`/logo\` — Envía el logotipo oficial de KlientIA.
• \`/ayuda\` — Guía para tomar fotos de tickets exitosamente.`,
        });
        return;
    }
    // 1. Comando /ayuda, /pasos o hola
    if (textoLimpio.toLowerCase() === "/ayuda" ||
        textoLimpio.toLowerCase() === "/pasos" ||
        textoLimpio.toLowerCase() === "pasos" ||
        textoLimpio.toLowerCase() === "/start" ||
        textoLimpio.toLowerCase() === "hola") {
        const { perfil } = obtenerPerfilFiscal(perfilKey);
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}
👋 ¡Hola *${perfil.razonSocial}*! Aquí tienes los *pasos para facturar tus tickets exitosamente*:

1️⃣ *Toma una foto clara y completa de tu ticket* 📸
• Asegúrate de que se vea de arriba a abajo: *comercio, fecha, total, folio / código de facturación* y la página web o QR al final del ticket.

2️⃣ *Envía el ticket dentro del mismo mes de compra* 🗓️
• De preferencia envíalo el *mismo día de tu compra* para evitar cierres de portal del comercio.

3️⃣ *Indica cómo pagaste (Efectivo o Tarjeta)* 💵💳
• Si ya viene impreso en el ticket, lo detectamos automáticamente.
• Si no aparece, escríbelo en el comentario de la foto o en un mensaje: *"Efectivo"*, *"Débito 1234"* o *"Crédito 5678"* (con los últimos 4 dígitos de tu tarjeta).

4️⃣ *Recibe tus archivos CFDI 4.0 (PDF + XML)* 📄✅
• Tus facturas se emiten con tu RFC \`${perfil.rfc}\` (C.P. \`${perfil.codigoPostal}\` | Régimen \`${perfil.regimenFiscal}\` | Uso \`${perfil.usoCfdi}\`).

${formatearResumenPlan(perfil)}

⚙️ *Comandos disponibles:*
• \`/status\` o \`/ping\` — Verificar que el bot esté conectado y activo.
• \`/clientes\` o \`/reporte\` — Ver el consumo de tickets de todos los clientes.
• \`/saldo\` o \`/plan\` — Ver tus tickets consumidos y disponibles del mes.
• \`/perfil\` — Ver tus datos fiscales actuales.`,
        });
        return;
    }
    // 1.2 Comando /status, /ping o /estado (Healthcheck del bot en la nube)
    if (textoLimpio.toLowerCase() === "/status" ||
        textoLimpio.toLowerCase() === "/ping" ||
        textoLimpio.toLowerCase() === "/estado" ||
        textoLimpio.toLowerCase() === "ping") {
        const uptimeSec = Math.floor(process.uptime());
        const horas = Math.floor(uptimeSec / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);
        const segs = uptimeSec % 60;
        const tiempoActivo = `${horas}h ${mins}m ${segs}s`;
        const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const ahora = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}
🟢 *¡Bot 100% Operativo y Conectado!*

⚡ *Diagnóstico del Sistema:*
• *Estado:* En línea y escuchando mensajes
• *Servidor:* AWS Lightsail Cloud (Ubuntu / Docker)
• *Tiempo activo:* ${tiempoActivo}
• *Memoria RAM en uso:* ${memMb} MB
• *Hora servidor (CDMX):* ${ahora}
• *Motor de IA:* Google Gemini Flash (Multimodal)

🔌 *Conectores Oficiales Activos:*
• 🛣️ *Casetas:* RCO (Vía Corta), IDEAL (Gdl-Tepic), Las Varas, Jala-Compostela
• 🛒 *Súper y Clubes (León Gto):* H-E-B, Chedraui, Soriana, City Club, Walmart, Sam's Club, Costco, Bodega Aurrera
• 🏪 *Tiendas y Farmacias:* OXXO, Farmacias Guadalajara
• 🚗 *Refacciones y Gas:* AutoZone México, Grupo CIOSA, OXXO GAS, G500, Gas Noel
• 🍽️ *Insumos Restaurante:* El Amigo del Chef + Facturación automática por correo

Envía cualquier ticket en foto o escribe \`/clientes\` para ver tus reportes.`,
        });
        return;
    }
    // 1.3 Comando /logo o /foto (Ver o aplicar el logo oficial de KlientIA Facturación)
    if (textoLimpio.toLowerCase() === "/logo" ||
        textoLimpio.toLowerCase() === "/foto" ||
        textoLimpio.toLowerCase() === "/branding") {
        const logoPath = path.resolve(process.cwd(), "assets", "logo_klientia.jpg");
        if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            let fotoActualizada = false;
            try {
                if (sock.user?.id) {
                    await sock.updateProfilePicture(sock.user.id, logoBuffer);
                    fotoActualizada = true;
                }
            }
            catch (err) {
                console.log("Aviso Baileys profile pic:", err?.message);
            }
            try {
                await sock.updateProfileStatus("KlientIA Facturación - CFDI 4.0 con IA");
            }
            catch { }
            await enviarMensajeBot(sock, replyJid, {
                image: logoBuffer,
                caption: `${BOT_SIGNATURE}\n✨ *Logo Oficial de KlientIA Facturación*\n\n${fotoActualizada
                    ? "✅ *¡Foto de perfil y estado de WhatsApp actualizados automáticamente!*"
                    : "📱 *Descarga esta imagen y úsala como foto de perfil:* Ve a *Configuración de WhatsApp ➡️ Tu Perfil ➡️ Editar Foto.*"}`,
            });
            return;
        }
    }
    // 1.5 Comando /clientes, /reporte o /consumos (Listado de todos los clientes y tickets usados)
    if (textoLimpio.toLowerCase() === "/clientes" ||
        textoLimpio.toLowerCase() === "/reporte" ||
        textoLimpio.toLowerCase() === "/consumos") {
        const todos = obtenerTodosLosPerfiles();
        const rfcVistos = new Set();
        const listaClientes = [];
        for (const [key, p] of Object.entries(todos)) {
            const rfc = (p.rfc || "").toUpperCase();
            if (!rfc || rfcVistos.has(rfc))
                continue;
            rfcVistos.add(rfc);
            const usados = p.ticketsUsadosMes ?? 0;
            const incluidos = p.ticketsIncluidos ?? 40;
            const precioBase = p.precioMensual ?? 299;
            const costoExtra = p.costoTicketExtra ?? 5;
            const extras = Math.max(0, usados - incluidos);
            const costoTotal = precioBase + extras * costoExtra;
            listaClientes.push({
                nombre: p.razonSocial,
                rfc,
                tel: p.telefono || key.split("@")[0],
                usados,
                incluidos,
                extras,
                costoTotal,
            });
        }
        if (listaClientes.length === 0) {
            const { perfil } = obtenerPerfilFiscal(perfilKey);
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n👥 *Reporte de Clientes del Mes:*\n\n1. *${perfil.razonSocial}* (\`${perfil.rfc}\`)\n   • Consumo: *${perfil.ticketsUsadosMes ?? 0}* / ${perfil.ticketsIncluidos ?? 40} tickets\n   • Teléfono: ${perfil.telefono || "Registrado"}`,
            });
            return;
        }
        const reporteTexto = listaClientes
            .map((c, idx) => `${idx + 1}. *${c.nombre}*\n   • *RFC:* \`${c.rfc}\` | *Tel:* ${c.tel}\n   • *Tickets facturados este mes:* *${c.usados}* de ${c.incluidos}${c.extras > 0 ? ` (+${c.extras} extras)` : ""}\n   • *Total plan mes:* \$${c.costoTotal} MXN`)
            .join("\n\n");
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}\n📊 *Reporte General de Clientes y Tickets Usados:*\n\n${reporteTexto}\n\n💡 _Para ver el detalle de un cliente específico, envía:_ \`/saldo <RFC o Teléfono>\``,
        });
        return;
    }
    // 2. Comando /perfil o /plan o /saldo (con o sin parámetro de búsqueda)
    if (textoLimpio.toLowerCase().startsWith("/saldo") ||
        textoLimpio.toLowerCase().startsWith("/plan") ||
        textoLimpio.toLowerCase() === "/perfil") {
        const partes = textoLimpio.split(" ");
        const terminoBusqueda = partes.slice(1).join(" ").trim().toUpperCase();
        let perfilAMostrar = obtenerPerfilFiscal(perfilKey).perfil;
        // Si especificó un RFC, nombre o teléfono a consultar
        if (terminoBusqueda) {
            const todos = obtenerTodosLosPerfiles();
            const match = Object.values(todos).find((p) => p.rfc.toUpperCase().includes(terminoBusqueda) ||
                p.razonSocial.toUpperCase().includes(terminoBusqueda) ||
                (p.telefono && p.telefono.includes(terminoBusqueda)));
            if (match) {
                perfilAMostrar = match;
            }
            else {
                await enviarMensajeBot(sock, replyJid, {
                    text: `${BOT_SIGNATURE}\n⚠️ No se encontró ningún cliente con el término *"${terminoBusqueda}"*.\nUsa \`/clientes\` para ver la lista completa.`,
                });
                return;
            }
        }
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}
📋 *Datos Fiscales y Consumo de Tickets (CFDI 4.0):*
• *Cliente:* ${perfilAMostrar.razonSocial}
• *RFC:* \`${perfilAMostrar.rfc}\`
• *Código Postal:* ${perfilAMostrar.codigoPostal}
• *Régimen Fiscal SAT:* ${perfilAMostrar.regimenFiscal}
• *Uso de CFDI:* ${perfilAMostrar.usoCfdi}
• *Celular registrado:* ${perfilAMostrar.telefono || "+52 1 477 590 7888"}

${formatearResumenPlan(perfilAMostrar)}`,
        });
        return;
    }
    // 2.2 Comando /ajustar-tickets <RFC o Celular> <cantidad>
    if (textoLimpio.toLowerCase().startsWith("/ajustar-tickets") ||
        textoLimpio.toLowerCase().startsWith("/set-tickets") ||
        textoLimpio.toLowerCase().startsWith("/ajustar-saldo")) {
        const partes = textoLimpio.trim().split(/\s+/);
        let query = perfilKey;
        let nuevaCantidad = 0;
        if (partes.length === 2 && !isNaN(Number(partes[1]))) {
            nuevaCantidad = parseInt(partes[1], 10);
        }
        else if (partes.length >= 3 && !isNaN(Number(partes[2]))) {
            query = partes[1];
            nuevaCantidad = parseInt(partes[2], 10);
        }
        else {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n⚠️ *Uso correcto:* \`/ajustar-tickets <RFC o Teléfono> <cantidad>\`\nEjemplo: \`/ajustar-tickets VAMC9112056Q2 16\``,
            });
            return;
        }
        const actualizado = ajustarConsumoTicket(query, nuevaCantidad);
        if (actualizado) {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}
✅ *Contador de tickets actualizado con éxito:*
• *Cliente:* ${actualizado.razonSocial} (\`${actualizado.rfc}\`)
• *Tickets usados este mes:* *${actualizado.ticketsUsadosMes}* de ${actualizado.ticketsIncluidos}
• *Disponibles restantes:* *${Math.max(0, (actualizado.ticketsIncluidos || 40) - (actualizado.ticketsUsadosMes || 0))}* tickets

${formatearResumenPlan(actualizado)}`,
            });
        }
        else {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n⚠️ No se encontró al cliente *"${query}"*. Revisa \`/clientes\`.`,
            });
        }
        return;
    }
    // 2.3 Comando /planes o /paquetes (Ver paquetes y CLABE)
    if (textoLimpio.toLowerCase() === "/planes" ||
        textoLimpio.toLowerCase() === "/paquetes" ||
        textoLimpio.toLowerCase() === "planes" ||
        textoLimpio.toLowerCase() === "paquetes") {
        const { perfil } = obtenerPerfilFiscal(perfilKey);
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}
📦 *Paquetes Mensuales (Vigencia de 30 días):*

1️⃣ *Plan Básico (20 tickets):* \$179 MXN
2️⃣ *Plan Pro (40 tickets):* \$299 MXN ⭐ *(Más popular)*
3️⃣ *Plan Negocio (80 tickets):* \$499 MXN
4️⃣ *Plan Empresa (100 tickets):* \$599 MXN

➕ *Tickets adicionales:* \$5.00 MXN c/u (recarga prepagada en caso de agotar tu paquete).

🏦 *Datos para Transferencia SPEI:*
• *Institución:* ${DATOS_BANCARIOS_OFICIALES.institucion}
• *CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Beneficiario:* ${DATOS_BANCARIOS_OFICIALES.beneficiario}
• *Concepto:* \`Factura ${perfil.rfc}\`

📲 *Activación Automática:* En cuanto realices tu transferencia, envía aquí la captura o PDF de tu comprobante. Validaremos el CEP en Banxico y tus 30 días iniciarán de inmediato.`,
        });
        return;
    }
    // 2.4 Comando /activar-plan <RFC o Teléfono> <20|40|80|100>
    if (textoLimpio.toLowerCase().startsWith("/activar-plan")) {
        const partes = textoLimpio.trim().split(/\s+/);
        let query = perfilKey;
        let numTickets = 40;
        if (partes.length === 2 && !isNaN(Number(partes[1]))) {
            numTickets = parseInt(partes[1], 10);
        }
        else if (partes.length >= 3 && !isNaN(Number(partes[2]))) {
            query = partes[1];
            numTickets = parseInt(partes[2], 10);
        }
        else {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n⚠️ *Uso correcto:* \`/activar-plan <RFC o Teléfono> <20|40|80|100>\`\nEjemplo: \`/activar-plan VAMC9112056Q2 40\``,
            });
            return;
        }
        const activado = activarPlanCliente(query, numTickets, "ACTIVACION-ADMIN", 30);
        if (activado) {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}
🎉 *¡Plan Activado Exitosamente por 30 Días!*
• *Cliente:* ${activado.razonSocial} (\`${activado.rfc}\`)
• *Paquete:* *${activado.paqueteNombre}*
• *Folios habilitados:* *${activado.ticketsIncluidos} tickets*
• *Fecha de inicio:* ${activado.fechaInicioPlan}
• *Fecha de vencimiento:* ${activado.fechaFinPlan}

🚀 *El cliente ya puede enviar sus tickets para facturación autónoma.*`,
            });
        }
        else {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n⚠️ No se encontró al cliente *"${query}"*. Revisa \`/clientes\`.`,
            });
        }
        return;
    }
    // 2.5 Comando /demo o /prueba o /facturar
    if (textoLimpio.toLowerCase() === "/demo" ||
        textoLimpio.toLowerCase() === "/prueba" ||
        textoLimpio.toLowerCase() === "/facturar") {
        const { perfil } = obtenerPerfilFiscal(perfilKey);
        const ticketDemo = {
            esTicketValido: true,
            establecimiento: "OXXO CADENA COMERCIAL S.A. DE C.V.",
            rfcEmisor: "CCO8605231N4",
            sucursal: "LEON GUANAJUATO",
            fechaCompra: new Date().toISOString().slice(0, 10),
            horaCompra: "14:00",
            folioTicket: "84920144",
            codigoFacturacion: "OX-9948-2210-MX",
            caja: "02",
            subtotal: 245.69,
            iva: 39.31,
            montoTotal: 285.0,
            moneda: "MXN",
            formaPago: "04",
            urlPortalFacturacion: "https://www.oxxo.com/facturacion",
            conceptos: [
                {
                    descripcion: "CAFE AMERICANO GRANDE ANDATTI 16OZ",
                    cantidad: 2,
                    precioUnitario: 38.79,
                    importe: 77.59,
                },
                {
                    descripcion: "PAQUETE INSUMOS OFICINA Y PAPELERIA",
                    cantidad: 1,
                    precioUnitario: 168.1,
                    importe: 168.1,
                },
            ],
        };
        const resultado = await procesarFacturacionTicket(ticketDemo, perfil);
        const perfilActualizado = registrarConsumoTicket(perfilKey, perfil.rfc);
        if (resultado.pdfBuffer) {
            await enviarMensajeBot(sock, replyJid, {
                document: resultado.pdfBuffer,
                mimetype: "application/pdf",
                fileName: `${resultado.nombreArchivoBase}.pdf`,
                caption: `${BOT_SIGNATURE}\n📄 *Factura CFDI 4.0 (PDF)*\n• *Receptor:* ${perfil.razonSocial} (\`${perfil.rfc}\`)\n• *C.P.:* ${perfil.codigoPostal} | *Régimen:* ${perfil.regimenFiscal}\n• *UUID:* \`${resultado.uuid}\`\n\n${formatearResumenPlan(perfilActualizado)}`,
            });
        }
        if (resultado.xmlBuffer) {
            await enviarMensajeBot(sock, replyJid, {
                document: resultado.xmlBuffer,
                mimetype: "application/xml",
                fileName: `${resultado.nombreArchivoBase}.xml`,
                caption: `${BOT_SIGNATURE}\n🗂️ *Archivo XML CFDI 4.0 (${ticketDemo.establecimiento})*`,
            });
        }
        const restantesDemo = Math.max(0, (perfilActualizado.ticketsIncluidos ?? 40) - (perfilActualizado.ticketsUsadosMes ?? 0));
        if (restantesDemo <= 5 && restantesDemo > 0 && !perfilActualizado.avisoBajoSaldoEnviado) {
            marcarAvisoBajoSaldo(perfilActualizado.rfc, true);
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}
⚠️ *Aviso de Saldo: Te quedan ${restantesDemo} folios disponibles*

Tu saldo de folios para este periodo está por agotarse (*${restantesDemo} tickets restantes*).
¿Deseas adquirir más folios para no interrumpir tu facturación automática?

💳 *Costo de folios adicionales:* \$5.00 MXN cada uno.
_Ejemplo: 10 folios = \$50 MXN | 20 folios = \$100 MXN_

🏦 *Datos para pago de folios extras (SPEI):*
• *Beneficiario:* ${DATOS_BANCARIOS_OFICIALES.beneficiario}
• *Cuenta CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Institución:* ${DATOS_BANCARIOS_OFICIALES.institucion}
• *Concepto:* \`Folios extras ${perfilActualizado.rfc}\`

📲 *Importante:* Se requiere el pago previo para liberar los folios. Al realizar tu transferencia envía tu comprobante por aquí; validaremos la liquidación en el CEP de Banxico y liberaremos tus folios de inmediato.`,
            });
        }
        return;
    }
    // 3. Comando /rfc
    if (textoLimpio.toLowerCase().startsWith("/rfc ")) {
        const partes = textoLimpio
            .slice(5)
            .split("|")
            .map((s) => s.trim());
        if (partes.length < 4) {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n❌ Formato incompleto. Usa:\n\`/rfc RFC | RAZON SOCIAL | CP | REGIMEN | USO_CFDI | EMAIL\`\n\nEjemplo:\n\`/rfc GODE561231GR8 | JUAN PEREZ LOPEZ | 06600 | 612 | G03 | juan@correo.com\``,
            });
            return;
        }
        const [rfc, razonSocial, codigoPostal, regimenFiscal, usoCfdi, email] = partes;
        const nuevoPerfil = {
            rfc,
            razonSocial,
            codigoPostal,
            regimenFiscal,
            usoCfdi: usoCfdi || "G03",
            email: email || "facturas@ejemplo.com",
        };
        guardarPerfilFiscal(perfilKey, nuevoPerfil);
        guardarPerfilFiscal(remoteJid, nuevoPerfil);
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}\n✅ *¡Perfil fiscal guardado con éxito!*\n\n• *RFC:* ${rfc.toUpperCase()}\n• *Razón Social:* ${razonSocial.toUpperCase()}\n• *C.P.:* ${codigoPostal}\n• *Régimen:* ${regimenFiscal}\n• *Uso CFDI:* ${(usoCfdi || "G03").toUpperCase()}\n\nAhora solo envíame la foto de cualquier ticket de venta para facturarlo.`,
        });
        return;
    }
    // 3.4 Confirmación de inicio inmediato de renovación si se quedaron sin folios
    if (textoLimpio.toLowerCase() === "iniciar hoy" ||
        textoLimpio.toLowerCase() === "/iniciar-hoy" ||
        textoLimpio.toLowerCase() === "iniciar ya" ||
        textoLimpio.toLowerCase() === "empezar hoy") {
        const ajustado = cambiarInicioSuscripcionAHoy(perfilKey);
        if (ajustado) {
            const restantes = Math.max(0, (ajustado.ticketsIncluidos ?? 40) - (ajustado.ticketsUsadosMes ?? 0));
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}
✅ *¡Periodo Ajustado a Inicio Inmediato!*

Conforme a tu confirmación:
• *Cliente:* ${ajustado.razonSocial} (\`${ajustado.rfc}\`)
• *Nueva fecha de inicio:* *${ajustado.fechaInicioPlan} (Hoy)*
• *Nueva fecha de vencimiento:* *${ajustado.fechaFinPlan}* (30 días de vigencia)
• *Folios disponibles:* *${restantes} tickets*

🚀 Ya puedes enviar tus tickets de compra para facturarlos de inmediato.`,
            });
        }
        else {
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n⚠️ No se encontró una suscripción renovada pendiente de confirmación para este chat. Escribe \`/plan\` para consultar tu vigencia actual.`,
            });
        }
        return;
    }
    // 3.45 Consulta o solicitud de folios extras
    const tLowQuery = textoLimpio.toLowerCase();
    if (tLowQuery === "folios extras" ||
        tLowQuery === "folio extra" ||
        tLowQuery === "folios" ||
        tLowQuery.includes("comprar folio") ||
        tLowQuery.includes("mas folio") ||
        tLowQuery.includes("más folio") ||
        tLowQuery.includes("costo de folio") ||
        tLowQuery.includes("precio de folio") ||
        tLowQuery.includes("recargar folio")) {
        const { perfil } = obtenerPerfilFiscal(perfilKey);
        await enviarMensajeBot(sock, replyJid, {
            text: `${BOT_SIGNATURE}
💳 *Folios Adicionales de Facturación*

• *Costo por folio extra:* *\$5.00 MXN* cada uno.
• Puedes recargar los folios que necesites según tu consumo:
  - 5 folios = \$25.00 MXN
  - 10 folios = \$50.00 MXN
  - 20 folios = \$100.00 MXN
  - 40 folios = \$200.00 MXN

🏦 *Datos para Transferencia SPEI:*
• *Beneficiario:* ${DATOS_BANCARIOS_OFICIALES.beneficiario}
• *Cuenta CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Institución:* ${DATOS_BANCARIOS_OFICIALES.institucion}
• *Concepto:* \`Folios extras ${perfil.rfc}\`

📲 *Importante:* Se solicita el pago previo para liberar los folios. Envía tu comprobante de pago por este chat; validaremos la liquidación en el CEP de Banxico y liberaremos tus folios de inmediato sin alterar la fecha de vencimiento de tu plan.`,
        });
        return;
    }
    // 3.5. Si el cliente escribe en texto la forma de pago ("efectivo", "tarjeta", "débito", "crédito", etc.) sin adjuntar foto
    if (!tieneDocumento && !tieneImagen && textoLimpio) {
        const tLow = textoLimpio.toLowerCase();
        const mencionaPago = tLow.includes("efectivo") ||
            tLow.includes("tarjeta") ||
            tLow.includes("debito") ||
            tLow.includes("débito") ||
            tLow.includes("credito") ||
            tLow.includes("crédito") ||
            tLow.includes("tdd") ||
            tLow.includes("tdc") ||
            tLow.includes("transferencia");
        if (mencionaPago) {
            let claveSat = "01";
            if (tLow.includes("debito") || tLow.includes("débito") || tLow.includes("tdd")) {
                claveSat = "28";
            }
            else if (tLow.includes("credito") ||
                tLow.includes("crédito") ||
                tLow.includes("tdc")) {
                claveSat = "04";
            }
            else if (tLow.includes("tarjeta")) {
                claveSat = "28"; // Por defecto débito, o se aclara en el texto
            }
            else if (tLow.includes("transferencia")) {
                claveSat = "03";
            }
            const match4 = textoLimpio.match(/\b(\d{4})\b/);
            const ultimos4 = match4 ? match4[1] : null;
            const etiquetaPago = formatearFormaPagoSat(claveSat, ultimos4);
            const { perfil } = obtenerPerfilFiscal(perfilKey);
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n✅ *¡Forma de pago registrada!*\n• *Método de pago:* ${etiquetaPago}\n\nSi aún no has enviado la foto de tu ticket, envíala por aquí; si ya la enviaste, usaremos esta forma de pago para generar tu factura CFDI 4.0.`,
            });
            const mySelfJid = myIdNum ? `${myIdNum}@s.whatsapp.net` : null;
            if (mySelfJid && !isSelfChat) {
                await enviarMensajeBot(sock, mySelfJid, {
                    text: `💳 *FORMA DE PAGO INDICADA POR EL CLIENTE*\n• *Cliente:* ${perfil.razonSocial} (\`+52 1 477 590 7888\`)\n• *Mensaje:* "${textoLimpio}"\n• *Clave SAT asignada:* ${etiquetaPago}`,
                });
            }
            return;
        }
    }
    // 4. Si envía cualquier Imagen o Documento (PDF, XML o Foto de CSF o Ticket)
    if (tieneDocumento || tieneImagen) {
        console.log("📥 Descargando archivo adjunto de WhatsApp...");
        try {
            const buffer = (await downloadMediaMessage(msg, "buffer", {}));
            const fileName = docMsg?.fileName || "";
            const mimeType = docMsg?.mimetype ||
                imageMsg?.mimetype ||
                (tieneDocumento ? "application/pdf" : "image/jpeg");
            console.log(`🤖 Archivo descargado (${buffer.length} bytes, ${mimeType}, fileName: ${fileName}). Analizando...`);
            // 4A. Si tú (en tu propio chat) subes el XML o PDF de una factura real timbrada para entregársela al cliente:
            const esXml = mimeType.includes("xml") || fileName.toLowerCase().endsWith(".xml");
            if (isSelfChat && esXml) {
                const targetJid = "5214775907888@s.whatsapp.net";
                const { perfil } = obtenerPerfilFiscal(targetJid);
                await enviarMensajeBot(sock, targetJid, {
                    document: buffer,
                    mimetype: "application/xml",
                    fileName: fileName || `Factura_${perfil.rfc}.xml`,
                    caption: `${BOT_SIGNATURE}\n🗂️ *Archivo XML CFDI 4.0 Oficial*\n• *Receptor:* ${perfil.razonSocial} (\`${perfil.rfc}\`)`,
                });
                await enviarMensajeBot(sock, replyJid, {
                    text: `${BOT_SIGNATURE}\n✅ *XML oficial entregado a ${perfil.razonSocial}* (\`+52 1 477 590 7888\`).`,
                });
                return;
            }
            const analisis = await analizarArchivoRecibido(buffer, mimeType, textoLimpio);
            console.log("✅ Resultado análisis:", JSON.stringify(analisis));
            // Si tú en tu propio chat subes un PDF que NO es constancia (es decir, es el PDF de la factura real timbrada)
            if (isSelfChat &&
                tieneDocumento &&
                mimeType.includes("pdf") &&
                analisis.tipo !== "constancia") {
                const targetJid = "5214775907888@s.whatsapp.net";
                const { perfil } = obtenerPerfilFiscal(targetJid);
                await enviarMensajeBot(sock, targetJid, {
                    document: buffer,
                    mimetype: "application/pdf",
                    fileName: fileName || `Factura_${perfil.rfc}.pdf`,
                    caption: `${BOT_SIGNATURE}\n📄 *Factura CFDI 4.0 Oficial (PDF)*\n• *Receptor:* ${perfil.razonSocial} (\`${perfil.rfc}\`)\n\n${formatearResumenPlan(perfil)}`,
                });
                await enviarMensajeBot(sock, replyJid, {
                    text: `${BOT_SIGNATURE}\n✅ *PDF de factura oficial entregado a ${perfil.razonSocial}* (\`+52 1 477 590 7888\`).`,
                });
                return;
            }
            if (analisis.tipo === "constancia") {
                const { perfil: perfilPrevio, esDefault } = obtenerPerfilFiscal(perfilKey);
                const nuevoPerfil = {
                    ...analisis.perfil,
                    estadoPlan: !esDefault && perfilPrevio.estadoPlan === "ACTIVO"
                        ? "ACTIVO"
                        : "PENDIENTE_PAGO",
                };
                guardarPerfilFiscal(perfilKey, nuevoPerfil);
                guardarPerfilFiscal(remoteJid, nuevoPerfil);
                console.log("💾 Perfil fiscal guardado para", perfilKey, nuevoPerfil);
                await enviarMensajeBot(sock, replyJid, {
                    text: `${BOT_SIGNATURE}
🎉 *¡Bienvenido a KlientIA Facturación!*
Tu Constancia de Situación Fiscal (CSF) ha sido registrada exitosamente:

• *RFC:* \`${nuevoPerfil.rfc}\`
• *Nombre / Razón Social:* ${nuevoPerfil.razonSocial}
• *Código Postal:* ${nuevoPerfil.codigoPostal}
• *Régimen Fiscal SAT:* ${nuevoPerfil.regimenFiscal}
• *Uso de CFDI:* ${nuevoPerfil.usoCfdi}

📦 *Elige el paquete mensual que deseas activar (Vigencia de 30 días):*
1️⃣ *Plan Básico (20 tickets):* \$179 MXN
2️⃣ *Plan Pro (40 tickets):* \$299 MXN ⭐ *(Recomendado)*
3️⃣ *Plan Negocio (80 tickets):* \$499 MXN
4️⃣ *Plan Empresa (100 tickets):* \$599 MXN

➕ _Nota: Si superas los tickets de tu paquete durante el mes, cada ticket adicional tiene un costo de \$5.00 MXN (mediante recarga previa)._

🏦 *Datos para Transferencia SPEI:*
• *Institución:* *${DATOS_BANCARIOS_OFICIALES.institucion}*
• *CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Beneficiario:* *${DATOS_BANCARIOS_OFICIALES.beneficiario}*
• *Concepto:* \`Factura ${nuevoPerfil.rfc}\`

📲 *Para activar tu cuenta hoy mismo:* Realiza la transferencia del paquete elegido y envíame por aquí la captura o PDF de tu comprobante bancario. Validaremos el CEP en Banxico y se habilitarán tus folios por 30 días automáticamente.`,
                });
                return;
            }
            if (analisis.tipo === "comprobante_pago") {
                const comp = analisis.comprobante;
                const { perfil } = obtenerPerfilFiscal(perfilKey);
                await enviarMensajeBot(sock, replyJid, {
                    text: `${BOT_SIGNATURE}\n🔍 *Comprobante bancario detectado (\$${Number(comp.monto).toFixed(2)} MXN).* Validando transferencia SPEI y CEP ante el Banco de México (Banxico)... ⏳`,
                });
                const validacion = await validarCepBanxico(comp);
                if (!validacion.valido) {
                    await enviarMensajeBot(sock, replyJid, {
                        text: `${BOT_SIGNATURE}
❌ *Estatus del Pago: ${validacion.estado === "NO_ENCONTRADO" ? "NO ENCONTRADO EN BANXICO" : "EN PROCESO / NO ACREDITADO"}*

• *Resultado:* ${validacion.mensaje}
• *Monto detectado:* \$${Number(comp.monto).toFixed(2)} MXN
• *Clave de Rastreo:* \`${comp.claveRastreo || "No visible"}\`

⚠️ *Solicitud de pago:* Para poder liberar tus folios o renovar tu suscripción, requerimos confirmar la liquidación en Banxico CEP. Por favor asegúrate de realizar la transferencia a:
• *Beneficiario:* ${DATOS_BANCARIOS_OFICIALES.beneficiario}
• *Cuenta CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Institución:* ${DATOS_BANCARIOS_OFICIALES.institucion}

Por favor realiza el pago correspondiente o reenvía una captura clara con la Clave de Rastreo visible para volver a validarlo.`,
                    });
                    return;
                }
                const monto = Number(comp.monto) || 0;
                if (validacion.cepPdfBuffer) {
                    await enviarMensajeBot(sock, replyJid, {
                        document: validacion.cepPdfBuffer,
                        mimetype: "application/pdf",
                        fileName: `CEP_Banxico_${validacion.claveRastreo}.pdf`,
                        caption: `${BOT_SIGNATURE}\n🏦 *Comprobante Electrónico de Pago (CEP) Oficial - Banxico*`,
                    });
                }
                // 1. Recarga de folios extras ($5.00 MXN c/u, transferencias menores a $150 o múltiplos de 5)
                const esMontoFoliosExtras = (monto >= 5 && monto < 150) || /extra|folio/i.test(textoLimpio);
                if (esMontoFoliosExtras && monto < 150) {
                    const recarga = recargarTicketsExtra(perfilKey, monto, validacion.claveRastreo);
                    if (recarga) {
                        const foliosDisponibles = Math.max(0, (recarga.perfil.ticketsIncluidos ?? 40) - (recarga.perfil.ticketsUsadosMes ?? 0));
                        await enviarMensajeBot(sock, replyJid, {
                            text: `${BOT_SIGNATURE}
✅ *Estatus del Pago: LIQUIDADO Y VERIFICADO EN BANXICO*

• *Estado SPEI:* ${validacion.estado}
• *Monto acreditado:* \$${monto.toFixed(2)} MXN
• *Clave de Rastreo:* \`${validacion.claveRastreo}\`
• *Concepto:* Recarga de folios adicionales (\$5.00 MXN c/u)
• *Folios liberados:* *+${recarga.ticketsAgregados} tickets*

📊 *Balance de Cuenta Actualizado:*
• *Cliente:* ${recarga.perfil.razonSocial} (\`${recarga.perfil.rfc}\`)
• *Folios disponibles para usar:* *${foliosDisponibles} tickets*
• *Vigencia de tu suscripción:* Hasta el ${recarga.perfil.fechaFinPlan || "N/A"} (se mantiene sin alteraciones)

📸 *¡Folios liberados exitosamente!* Ya puedes continuar enviando las fotos de tus tickets de compra.`,
                        });
                        return;
                    }
                }
                // 2. Renovación o Activación de Plan Mensual (20, 40, 80, 100 tickets)
                let ticketsActivar = 40;
                if (monto >= 550)
                    ticketsActivar = 100;
                else if (monto >= 450)
                    ticketsActivar = 80;
                else if (monto >= 250)
                    ticketsActivar = 40;
                else if (monto >= 150)
                    ticketsActivar = 20;
                const hoyStr = new Date().toISOString().slice(0, 10);
                const fechaFinActual = perfil.fechaFinPlan;
                let diasRestantes = 0;
                if (fechaFinActual) {
                    const msHoy = new Date(hoyStr).getTime();
                    const msFin = new Date(fechaFinActual).getTime();
                    diasRestantes = Math.ceil((msFin - msHoy) / (1000 * 60 * 60 * 24));
                }
                const restantesActuales = Math.max(0, (perfil.ticketsIncluidos ?? 40) - (perfil.ticketsUsadosMes ?? 0));
                const deseaInicioInmediato = /iniciar\s*hoy|hoy|inmediat|empezar\s*hoy|ahora/i.test(textoLimpio);
                // Caso A: Renovación de cliente sin folios que confirmó iniciar hoy mismo
                if (diasRestantes > 0 && restantesActuales === 0 && deseaInicioInmediato) {
                    const renovacion = renovarPlanCliente(perfilKey, ticketsActivar, validacion.claveRastreo, true);
                    await enviarMensajeBot(sock, replyJid, {
                        text: `${BOT_SIGNATURE}
🎉 *¡Pago Verificado y Plan Renovado con Inicio Inmediato!*

• *Estatus del Pago:* ✅ LIQUIDADO ANTE BANXICO (${validacion.estado})
• *Monto acreditado:* \$${monto.toFixed(2)} MXN
• *Clave de Rastreo:* \`${validacion.claveRastreo}\`
• *Cliente:* ${renovacion?.perfil.razonSocial || perfil.razonSocial} (\`${perfil.rfc}\`)
• *Paquete:* *${renovacion?.perfil.paqueteNombre}*
• *Folios liberados:* *${ticketsActivar} tickets*

📅 *Vigencia de 30 días:*
• *Inicio:* *${renovacion?.fechaInicio} (Hoy)* — _Iniciado hoy por previa confirmación al estar agotados tus folios_
• *Vencimiento:* *${renovacion?.fechaFin}*

🚀 *¡Tu facturación está habilitada!* Envía tus fotos de tickets para emitir tus facturas de inmediato.`,
                    });
                    return;
                }
                // Caso B: Renovación anticipada (la suscripción inicia al final de la actual, no hoy)
                if (diasRestantes > 0) {
                    const renovacion = renovarPlanCliente(perfilKey, ticketsActivar, validacion.claveRastreo, false);
                    const foliosTotales = Math.max(0, (renovacion?.perfil.ticketsIncluidos ?? 40) - (renovacion?.perfil.ticketsUsadosMes ?? 0));
                    let msgRenovacion = `${BOT_SIGNATURE}
🎉 *¡Pago Verificado y Renovación Programada Exitosamente!*

• *Estatus del Pago:* ✅ LIQUIDADO ANTE BANXICO (${validacion.estado})
• *Monto acreditado:* \$${monto.toFixed(2)} MXN
• *Clave de Rastreo:* \`${validacion.claveRastreo}\`
• *Cliente:* ${renovacion?.perfil.razonSocial || perfil.razonSocial} (\`${perfil.rfc}\`)
• *Paquete:* *${renovacion?.perfil.paqueteNombre}*
• *Folios liberados:* *+${ticketsActivar} tickets* (Total disponibles: *${foliosTotales} tickets*)

📅 *Regla de Vigencia:*
• *Suscripción actual:* Sigue vigente hasta el *${fechaFinActual}*
• *Nueva suscripción de 30 días:* Iniciará el *${fechaFinActual}* y vencerá el *${renovacion?.fechaFin}*`;
                    if (restantesActuales === 0) {
                        msgRenovacion += `\n\n💡 *Opción de Inicio Inmediato:* Como tus folios del periodo previo estaban en 0, si prefieres no esperar al ${fechaFinActual} y deseas que tus 30 días arranquen **a partir de hoy**, responde a este mensaje con: *"INICIAR HOY"*.`;
                    }
                    else {
                        msgRenovacion += `\n\n✨ Disfrutas de tus nuevos folios desde ahora y tu vigencia de 30 días se añade al término de tu periodo actual garantizando tu cobertura.`;
                    }
                    await enviarMensajeBot(sock, replyJid, { text: msgRenovacion });
                    return;
                }
                // Caso C: Plan nuevo o reactivación de plan vencido
                const perfilActivado = activarPlanCliente(perfil.rfc || perfilKey, ticketsActivar, validacion.claveRastreo, 30);
                await enviarMensajeBot(sock, replyJid, {
                    text: `${BOT_SIGNATURE}
🎉 *¡Pago Verificado y Plan Activado por 30 Días!*

• *Estatus del Pago:* ✅ LIQUIDADO ANTE BANXICO (${validacion.estado})
• *Monto acreditado:* \$${monto.toFixed(2)} MXN
• *Clave de Rastreo:* \`${validacion.claveRastreo}\`
• *Cliente:* ${perfilActivado?.razonSocial || perfil.razonSocial} (\`${perfil.rfc}\`)
• *Paquete Activo:* *${perfilActivado?.paqueteNombre || `Plan (${ticketsActivar} tickets)`}*
• *Folios disponibles:* *${ticketsActivar} tickets*
• *Inicio de vigencia:* ${perfilActivado?.fechaInicioPlan}
• *Vencimiento (30 días):* ${perfilActivado?.fechaFinPlan}

🚀 *¡Tu facturación autónoma está habilitada!* Envía ahora mismo la foto de tus tickets de compra o casetas.`,
                });
                return;
            }
            if (analisis.tipo === "ticket") {
                const datosTicket = analisis.ticket;
                const { perfil } = obtenerPerfilFiscal(perfilKey);
                // Verificar que su plan esté activo, dentro de los 30 días de vigencia y con folios disponibles
                const estadoPlan = verificarEstadoPlan(perfil);
                if (!estadoPlan.puedeFacturar) {
                    await enviarMensajeBot(sock, replyJid, {
                        text: `${BOT_SIGNATURE}
⚠️ *No es posible procesar este ticket en este momento:*

${estadoPlan.mensaje}

🏦 *Datos para activar o recargar tus folios:*
• *Institución:* *${DATOS_BANCARIOS_OFICIALES.institucion}*
• *CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Beneficiario:* *${DATOS_BANCARIOS_OFICIALES.beneficiario}*
• *Concepto:* \`Factura ${perfil.rfc}\`

📦 *Paquetes (30 días):*
• 20 tickets: \$179 MXN | 40 tickets: \$299 MXN
• 80 tickets: \$499 MXN | 100 tickets: \$599 MXN
• Ticket adicional (recarga): \$5.00 MXN c/u

📲 _Envía por aquí la captura de tu transferencia SPEI y tu cuenta se habilitará automáticamente._`,
                    });
                    return;
                }
                const perfilActualizado = registrarConsumoTicket(perfilKey, perfil.rfc);
                const formaPagoTexto = formatearFormaPagoSat(datosTicket.formaPago, datosTicket.ultimosDigitosTarjeta);
                encolarTicketEnLote({
                    jid: replyJid,
                    perfil,
                    ticket: datosTicket,
                    rawText: textoLimpio,
                    imageBuffer: buffer,
                    mimeType,
                    onFirstItem: async () => {
                        await enviarMensajeBot(sock, replyJid, {
                            text: `${BOT_SIGNATURE}
📸 *¡Ticket de ${datosTicket.establecimiento} recibido!* ($${Number(datosTicket.montoTotal).toFixed(2)} MXN)
• *Folio / Código:* \`${datosTicket.folioTicket || datosTicket.codigoFacturacion || "Detectado"}\`
• *Forma de Pago SAT:* ${formaPagoTexto}
• *Receptor:* ${perfil.razonSocial} (\`${perfil.rfc}\`)

⏳ _Si tienes más tickets de este viaje o mes, envíalos ahora mismo; los acumularé en lote para facturarlos juntos de forma 100% automática..._`,
                        });
                    },
                    onItemCountUpdate: async (count) => {
                        console.log(`📥 Ticket #${count} acumulado en lote para ${replyJid}`);
                    },
                    onProcessStart: async (count) => {
                        await enviarMensajeBot(sock, replyJid, {
                            text: `${BOT_SIGNATURE}
🚀 *Iniciando facturación autónoma de tu lote (${count} tickets)...*
Conectando a los portales oficiales de autofacturación y emitiendo tus CFDI 4.0 timbrados ante el SAT ⏳`,
                        });
                    },
                    onProgressNotice: async (msg) => {
                        await enviarMensajeBot(sock, replyJid, {
                            text: `${BOT_SIGNATURE}\n${msg}`,
                        });
                    },
                    onDeliverResult: async (res) => {
                        const mySelfJid = myIdNum ? `${myIdNum}@s.whatsapp.net` : null;
                        if (res.pdfBuffer || res.pdfPath) {
                            const pdfDoc = res.pdfBuffer || fs.readFileSync(res.pdfPath);
                            await enviarMensajeBot(sock, replyJid, {
                                document: pdfDoc,
                                mimetype: "application/pdf",
                                fileName: `Factura_${(res.serie || "CFDI")}_${res.folio || "Oficial"}.pdf`,
                                caption: `${BOT_SIGNATURE}
📄 *Factura CFDI 4.0 Oficial (PDF)*
• *Emisor:* ${res.emisor}
• *Folio:* ${res.serie ? `${res.serie}-` : ""}${res.folio || "Timbrado"}
• *UUID SAT:* \`${res.uuid || "Validado ante SAT"}\`
• *Total:* $${res.total.toFixed(2)} MXN
• *Receptor:* ${perfil.razonSocial} (\`${perfil.rfc}\`)`,
                            });
                            if (mySelfJid && mySelfJid !== replyJid) {
                                await enviarMensajeBot(sock, mySelfJid, {
                                    document: pdfDoc,
                                    mimetype: "application/pdf",
                                    fileName: `Factura_${(res.serie || "CFDI")}_${res.folio || "Oficial"}.pdf`,
                                    caption: `📄 Copia de factura generada para ${perfil.razonSocial} (${res.emisor})`,
                                });
                            }
                        }
                        if (res.xmlBuffer || res.xmlPath) {
                            const xmlDoc = res.xmlBuffer || fs.readFileSync(res.xmlPath);
                            await enviarMensajeBot(sock, replyJid, {
                                document: xmlDoc,
                                mimetype: "application/xml",
                                fileName: `Factura_${(res.serie || "CFDI")}_${res.folio || "Oficial"}.xml`,
                                caption: `${BOT_SIGNATURE}
🗂️ *Comprobante Fiscal Digital XML CFDI 4.0 Oficial*
• *Emisor:* ${res.emisor}
• *UUID SAT:* \`${res.uuid || "Validado ante SAT"}\``,
                            });
                            if (mySelfJid && mySelfJid !== replyJid) {
                                await enviarMensajeBot(sock, mySelfJid, {
                                    document: xmlDoc,
                                    mimetype: "application/xml",
                                    fileName: `Factura_${(res.serie || "CFDI")}_${res.folio || "Oficial"}.xml`,
                                    caption: `🗂️ Copia de XML timbrado para ${perfil.razonSocial}`,
                                });
                            }
                        }
                        if (!res.pdfBuffer && !res.xmlBuffer && res.mensaje) {
                            await enviarMensajeBot(sock, replyJid, {
                                text: `${BOT_SIGNATURE}\n${res.mensaje}`,
                            });
                            if (mySelfJid && mySelfJid !== replyJid) {
                                await enviarMensajeBot(sock, mySelfJid, {
                                    text: `🔔 *Estado de factura (${res.emisor}):*\n${res.mensaje}`,
                                });
                            }
                        }
                    },
                    onBatchComplete: async (summary) => {
                        const mySelfJid = myIdNum ? `${myIdNum}@s.whatsapp.net` : null;
                        await enviarMensajeBot(sock, replyJid, {
                            text: `${BOT_SIGNATURE}\n${summary}\n\n${formatearResumenPlan(perfilActualizado)}`,
                        });
                        if (mySelfJid && mySelfJid !== replyJid) {
                            await enviarMensajeBot(sock, mySelfJid, {
                                text: `🔔 *LOTE FINALIZADO CON ÉXITO*\n${summary}`,
                            });
                        }
                        // Alerta de 5 folios restantes
                        const { perfil: pPost } = obtenerPerfilFiscal(replyJid);
                        const restantes = Math.max(0, (pPost.ticketsIncluidos ?? 40) - (pPost.ticketsUsadosMes ?? 0));
                        if (restantes <= 5 && restantes > 0 && !pPost.avisoBajoSaldoEnviado) {
                            marcarAvisoBajoSaldo(pPost.rfc, true);
                            await enviarMensajeBot(sock, replyJid, {
                                text: `${BOT_SIGNATURE}
⚠️ *Aviso de Saldo: Te quedan ${restantes} folios disponibles*

Tu saldo de folios para este periodo está por agotarse (*${restantes} tickets restantes*).
¿Deseas adquirir más folios para no interrumpir tu facturación automática?

💳 *Costo de folios adicionales:* \$5.00 MXN cada uno.
_Ejemplo: 10 folios = \$50 MXN | 20 folios = \$100 MXN_

🏦 *Datos para pago de folios extras (SPEI):*
• *Beneficiario:* ${DATOS_BANCARIOS_OFICIALES.beneficiario}
• *Cuenta CLABE:* \`${DATOS_BANCARIOS_OFICIALES.clabe}\`
• *Institución:* ${DATOS_BANCARIOS_OFICIALES.institucion}
• *Concepto:* \`Folios extras ${pPost.rfc}\`

📲 *Importante:* Se requiere el pago previo para liberar los folios. Al realizar tu transferencia envía tu comprobante por aquí; validaremos la liquidación en el CEP de Banxico y liberaremos tus folios de inmediato.`,
                            });
                        }
                    },
                });
                return;
            }
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n⚠️ ${analisis.motivo}`,
            });
        }
        catch (error) {
            console.error("Error al procesar archivo:", error);
            await enviarMensajeBot(sock, replyJid, {
                text: `${BOT_SIGNATURE}\n❌ Error, volver a intentar.`,
            });
        }
    }
}
