import express from "express";
import * as path from "path";
import * as fs from "fs";
import { obtenerListaClientesUnicos, crearOActualizarCliente, activarPlanCliente, ajustarConsumoTicket, eliminarClientePorRfc, } from "../storage/profiles.js";
import { obtenerEstadoMotorBot, encenderMotorBot, pausarMotorBot, reiniciarMotorBot, desvincularSesionWhatsApp, enviarFacturaDirectaCliente, } from "../whatsapp/bot.js";
import { obtenerSolicitudesConectores, actualizarEstadoSolicitudConector, } from "../storage/connectorRequests.js";
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || process.env.ADMIN_PASSWORD || "klientia2026";
export function iniciarAdminServer(port = 3000) {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    // Servir logo y recursos estáticos
    const assetsDir = path.resolve(process.cwd(), "assets");
    app.use("/assets", express.static(assetsDir));
    app.get("/favicon.ico", (req, res) => {
        res.sendFile(path.resolve(assetsDir, "favicon.ico"));
    });
    // Middleware opcional de autenticación simple por PIN/token
    function requireAuth(req, res, next) {
        const pin = req.headers["x-admin-pin"] || req.query.pin;
        if (!DEFAULT_ADMIN_PIN || pin === DEFAULT_ADMIN_PIN) {
            next();
            return;
        }
        res.status(401).json({ error: "PIN de administrador no válido" });
    }
    // Auth check
    app.post("/api/auth/login", (req, res) => {
        const { pin } = req.body;
        if (pin === DEFAULT_ADMIN_PIN) {
            res.json({ ok: true, token: DEFAULT_ADMIN_PIN });
        }
        else {
            res.status(401).json({ ok: false, error: "PIN incorrecto" });
        }
    });
    // Estado del motor y métricas del bot
    app.get("/api/status", requireAuth, (req, res) => {
        const estadoMotor = obtenerEstadoMotorBot();
        const clientes = obtenerListaClientesUnicos();
        const planesActivos = clientes.filter((c) => c.estadoPlan === "ACTIVO").length;
        const ticketsMes = clientes.reduce((acc, c) => acc + (c.ticketsUsadosMes || 0), 0);
        res.json({
            ...estadoMotor,
            totalClientes: clientes.length,
            planesActivos,
            ticketsFacturadosMes: ticketsMes,
        });
    });
    // Control del motor del bot
    app.post("/api/motor/start", requireAuth, async (req, res) => {
        try {
            const result = await encenderMotorBot();
            res.json(result);
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e?.message || e });
        }
    });
    app.post("/api/motor/pause", requireAuth, (req, res) => {
        try {
            const result = pausarMotorBot();
            res.json(result);
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e?.message || e });
        }
    });
    app.post("/api/motor/restart", requireAuth, async (req, res) => {
        try {
            const result = await reiniciarMotorBot();
            res.json(result);
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e?.message || e });
        }
    });
    app.post("/api/motor/unlink", requireAuth, async (req, res) => {
        try {
            const result = await desvincularSesionWhatsApp();
            res.json(result);
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e?.message || e });
        }
    });
    // Código QR actual de WhatsApp si requiere vinculación
    app.get("/api/qr", requireAuth, (req, res) => {
        const { qrCodeSvg, conexionWa } = obtenerEstadoMotorBot();
        res.json({
            conexionWa,
            qrSvg: qrCodeSvg || null,
        });
    });
    // Listar clientes únicos
    app.get("/api/clients", requireAuth, (req, res) => {
        try {
            const clientes = obtenerListaClientesUnicos();
            res.json({ clientes });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    // Crear o actualizar cliente
    app.post("/api/clients", requireAuth, (req, res) => {
        try {
            const { rfc, razonSocial, codigoPostal, regimenFiscal, usoCfdi, email, telefono, paqueteTickets, } = req.body;
            if (!rfc || !razonSocial || !codigoPostal) {
                res.status(400).json({ error: "RFC, Razón Social y Código Postal son obligatorios" });
                return;
            }
            const ticketsNum = Number(paqueteTickets) || 40;
            const hoy = new Date().toISOString().slice(0, 10);
            const fin = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const nuevo = crearOActualizarCliente({
                rfc,
                razonSocial,
                codigoPostal,
                regimenFiscal: regimenFiscal || "626",
                usoCfdi: usoCfdi || "G03",
                email: email || "",
                telefono: telefono || "",
                ticketsIncluidos: ticketsNum,
                ticketsUsadosMes: 0,
                precioMensual: ticketsNum === 20 ? 179 : ticketsNum === 40 ? 299 : ticketsNum === 80 ? 499 : 599,
                paqueteNombre: `Plan (${ticketsNum} tickets)`,
                fechaInicioPlan: hoy,
                fechaFinPlan: fin,
                estadoPlan: "ACTIVO",
            }, telefono);
            res.json({ ok: true, cliente: nuevo });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    // Activar o cambiar plan de un cliente
    app.post("/api/clients/:rfc/plan", requireAuth, (req, res) => {
        try {
            const rfc = String(req.params.rfc);
            const { tickets, diasVigencia, claveCep } = req.body;
            const numTickets = Number(tickets) || 40;
            const dias = Number(diasVigencia) || 30;
            const actualizado = activarPlanCliente(rfc, numTickets, claveCep, dias);
            if (!actualizado) {
                res.status(404).json({ error: "Cliente no encontrado con ese RFC" });
                return;
            }
            res.json({ ok: true, cliente: actualizado });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    // Ajustar tickets consumidos
    app.post("/api/clients/:rfc/adjust", requireAuth, (req, res) => {
        try {
            const rfc = String(req.params.rfc);
            const { ticketsUsados } = req.body;
            const cantidad = Number(ticketsUsados);
            if (isNaN(cantidad)) {
                res.status(400).json({ error: "Cantidad de tickets no válida" });
                return;
            }
            const actualizado = ajustarConsumoTicket(rfc, cantidad);
            if (!actualizado) {
                res.status(404).json({ error: "Cliente no encontrado con ese RFC" });
                return;
            }
            res.json({ ok: true, cliente: actualizado });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    // Eliminar cliente
    app.delete("/api/clients/:rfc", requireAuth, (req, res) => {
        try {
            const rfc = String(req.params.rfc);
            const ok = eliminarClientePorRfc(rfc);
            res.json({ ok });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    // Listar facturas generadas en downloads/
    app.get("/api/invoices", requireAuth, (req, res) => {
        try {
            const downloadsDir = path.resolve(process.cwd(), "downloads");
            if (!fs.existsSync(downloadsDir)) {
                res.json({ invoices: [] });
                return;
            }
            const files = fs.readdirSync(downloadsDir);
            const facturas = [];
            const ahora = new Date();
            const mesActual = ahora.getMonth();
            const anioActual = ahora.getFullYear();
            for (const f of files) {
                if (!f.endsWith(".pdf") && !f.endsWith(".xml"))
                    continue;
                const filePath = path.join(downloadsDir, f);
                const stat = fs.statSync(filePath);
                // Mostrar únicamente las facturas correspondientes al mes vigente
                const fechaArchivo = new Date(stat.mtime);
                if (fechaArchivo.getMonth() !== mesActual || fechaArchivo.getFullYear() !== anioActual) {
                    continue;
                }
                facturas.push({
                    nombre: f,
                    tipo: f.endsWith(".pdf") ? "pdf" : "xml",
                    tamanoKb: Math.round(stat.size / 1024),
                    fechaModificacion: stat.mtime.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }),
                    urlDescarga: `/api/invoices/download/${encodeURIComponent(f)}`,
                    ...{ mtimeMs: stat.mtimeMs },
                });
            }
            // Ordenar más recientes primero
            facturas.sort((a, b) => b.mtimeMs - a.mtimeMs);
            res.json({ invoices: facturas });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    // Descarga directa de archivos XML y PDF
    app.get("/api/invoices/download/:filename", (req, res) => {
        const filename = path.basename(String(req.params.filename));
        const filePath = path.resolve(process.cwd(), "downloads", filename);
        if (!fs.existsSync(filePath)) {
            res.status(404).send("Archivo no encontrado");
            return;
        }
        res.download(filePath, filename);
    });
    // Solicitudes de nuevos conectores de proveedores
    app.get("/api/connectors/requests", requireAuth, (req, res) => {
        try {
            const solicitudes = obtenerSolicitudesConectores();
            res.json({ solicitudes });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    app.post("/api/connectors/requests/:id/status", requireAuth, (req, res) => {
        try {
            const id = String(req.params.id);
            const { estado } = req.body;
            if (!["PENDIENTE", "EN_DESARROLLO", "INSTALADO"].includes(estado)) {
                res.status(400).json({ error: "Estado no válido" });
                return;
            }
            const ok = actualizarEstadoSolicitudConector(id, estado);
            res.json({ ok });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || e });
        }
    });
    // Enviar factura (PDF y XML) directamente por WhatsApp al cliente
    app.post("/api/invoices/send-to-client", requireAuth, async (req, res) => {
        try {
            const { targetJidOrPhone, pdfFilename, xmlFilename, emisor, total, folio, uuid, receptorNombre, receptorRfc, } = req.body;
            if (!targetJidOrPhone) {
                res.status(400).json({ error: "Falta el número o JID de WhatsApp del cliente destino." });
                return;
            }
            const downloadsDir = path.resolve(process.cwd(), "downloads");
            const pdfPath = pdfFilename ? path.join(downloadsDir, path.basename(pdfFilename)) : undefined;
            const xmlPath = xmlFilename ? path.join(downloadsDir, path.basename(xmlFilename)) : undefined;
            const resultado = await enviarFacturaDirectaCliente({
                targetJidOrPhone,
                pdfPath,
                xmlPath,
                emisor: emisor || "Proveedor",
                total: total ? Number(total) : undefined,
                folio: folio || "Oficial",
                uuid: uuid || "Validado ante SAT",
                receptorNombre,
                receptorRfc,
            });
            res.json(resultado);
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e?.message || e });
        }
    });
    // HTML Principal del Panel Administrativo
    app.use((req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(generarHtmlPanelAdmin());
    });
    const server = app.listen(port, "0.0.0.0", () => {
        console.log(`\n========================================================`);
        console.log(`🎛️  PANEL DE ADMINISTRACIÓN WEB KLIENTIA DISPONIBLE:`);
        console.log(`    Local:   http://localhost:${port}`);
        console.log(`    Red:     http://0.0.0.0:${port}`);
        console.log(`    PIN Defecto: ${DEFAULT_ADMIN_PIN}`);
        console.log(`========================================================\n`);
    });
    return app;
}
function generarHtmlPanelAdmin() {
    return `<!DOCTYPE html>
<html lang="es" class="h-full bg-slate-950 text-slate-100">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KlientIA Facturación - Panel de Control</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon_32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon.png" />
  <link rel="shortcut icon" href="/assets/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    code, .font-mono { font-family: 'JetBrains Mono', monospace; }
    .badge-pulse { animation: pulseGlow 2s infinite; }
    @keyframes pulseGlow {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.75; transform: scale(1.05); }
    }
  </style>
</head>
<body class="min-h-full flex flex-col bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">

  <!-- Modal de Login PIN -->
  <div id="loginModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center space-y-5">
      <div class="flex justify-center items-center py-1">
        <img src="/assets/logo_klientia.png" alt="KlientIA Facturación" class="h-24 w-auto mx-auto object-contain drop-shadow-xl" />
      </div>
      <div>
        <p class="text-xs text-slate-400 font-medium">Panel de Control & Motor de Autofacturación CFDI 4.0</p>
      </div>
      <div class="space-y-3">
        <label class="block text-xs font-semibold text-slate-300 text-left">PIN de Acceso Administrador</label>
        <input type="password" id="inputPin" placeholder="Introduce tu PIN" class="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center text-lg tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <p id="loginError" class="text-xs text-rose-400 hidden">PIN incorrecto. Inténtalo de nuevo.</p>
      </div>
      <button onclick="intentarLogin()" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 font-bold text-white shadow-lg shadow-emerald-500/20 transition-all">
        Ingresar al Panel
      </button>
    </div>
  </div>

  <!-- Navbar -->
  <header class="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-lg sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="relative flex items-center justify-center w-11 h-11 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-md p-1 group hover:border-emerald-500/50 transition">
          <img src="/assets/klientia_icon.png" alt="KlientIA" class="w-full h-full object-contain drop-shadow" />
        </div>
        <div>
          <h1 class="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
            Klient<span class="text-emerald-400">IA</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">Facturación</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">v2.0 CFDI 4.0</span>
          </h1>
          <p class="text-[11px] text-slate-400">Panel Central de Clientes y Motor RPA</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <nav class="hidden md:flex items-center gap-1 mr-2 text-xs font-semibold">
          <a href="#seccion-clientes" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition">Clientes & Planes</a>
          <a href="#listaFacturas" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition">Facturas</a>
          <a href="#badgeTotalSolicitudes" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition">Conectores</a>
        </nav>

        <!-- Indicador de conexión -->
        <div id="waBadge" class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border bg-slate-800 border-slate-700 text-slate-300">
          <span class="w-2 h-2 rounded-full bg-slate-500"></span>
          <span id="waText">Conectando...</span>
        </div>

        <button onclick="cerrarSesion()" title="Cerrar sesión" class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition text-xs flex items-center gap-1 border border-transparent hover:border-slate-700">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          <span class="hidden md:inline">Salir</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Contenedor Principal -->
  <main class="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">

    <!-- Card Principal: Control del Motor del Bot -->
    <div class="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/60 p-6 sm:p-8 shadow-xl">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="space-y-3">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border" id="motorPill">
            <span class="w-2.5 h-2.5 rounded-full badge-pulse" id="motorDot"></span>
            <span id="motorStatusText">Cargando estado...</span>
          </div>
          <h2 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Motor de Facturación Automática</h2>
          <p class="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Escucha mensajes en WhatsApp, extrae tickets con <b>Gemini Flash</b> y timbra CFDI 4.0 con <b>Playwright</b> en OXXO, Sam's, Costco, AutoZone, H-E-B, Chedraui, Soriana, G500 y Casetas.
          </p>
          <div class="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
            <span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> <span id="uptimeText">Uptime: --</span></span>
            <span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg> <span id="ramText">RAM: --</span></span>
            <span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg> <span id="waUserText">WA: --</span></span>
          </div>
        </div>

        <!-- Botones de Acción del Motor -->
        <div class="flex flex-wrap items-center gap-3 shrink-0">
          <button id="btnStart" onclick="controlarMotor('start')" class="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/25 transition transform active:scale-95">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
            Encender Motor
          </button>

          <button id="btnPause" onclick="controlarMotor('pause')" class="flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 font-bold text-sm transition transform active:scale-95">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
            Pausar Motor
          </button>

          <button onclick="controlarMotor('restart')" title="Reiniciar sesión WhatsApp" class="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition transform active:scale-95">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Reiniciar
          </button>

          <button id="btnVerQr" onclick="toggleQrModal()" class="hidden items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-bold text-sm transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
            Escanear QR
          </button>

          <button onclick="desvincularNumeroWhatsApp()" title="Desvincular para conectar otro número" class="flex items-center gap-2 px-3.5 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-xs transition transform active:scale-95">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
            Cambiar Número
          </button>
        </div>
      </div>

      <!-- Banner de Código QR (Desplegable si no está conectado) -->
      <div id="qrSection" class="hidden mt-6 pt-6 border-t border-slate-800 bg-slate-950/60 rounded-2xl p-6">
        <div class="flex flex-col sm:flex-row items-center gap-6">
          <div id="qrContainer" class="bg-white p-3 rounded-2xl shadow-xl shrink-0 flex items-center justify-center min-w-[200px] min-h-[200px]">
            <p class="text-slate-800 text-xs font-semibold">Generando QR...</p>
          </div>
          <div class="space-y-2 text-center sm:text-left">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              📱 Vincula tu WhatsApp al Bot
            </h3>
            <ol class="text-xs text-slate-300 space-y-1 list-decimal list-inside">
              <li>Abre <b>WhatsApp</b> en tu celular.</li>
              <li>Ve a <b>Ajustes</b> o Menú ⋮ ➡️ <b>Dispositivos vinculados</b>.</li>
              <li>Toca <b>Vincular un dispositivo</b> y apunta la cámara a este código QR.</li>
              <li>¡Listo! El bot quedará conectado en la nube y listo para recibir tickets.</li>
            </ol>
            <p class="text-[11px] text-emerald-400 font-medium pt-1">Este código se refresca automáticamente cada 10 segundos.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tarjetas de Métricas -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">Total Clientes</span>
          <span class="p-2 rounded-xl bg-blue-500/10 text-blue-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg></span>
        </div>
        <p class="text-2xl font-black text-white mt-2" id="metricClientes">--</p>
        <p class="text-[11px] text-slate-400 mt-1">Perfiles fiscales en sistema</p>
      </div>

      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">Planes Activos</span>
          <span class="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span>
        </div>
        <p class="text-2xl font-black text-white mt-2" id="metricPlanes">--</p>
        <p class="text-[11px] text-emerald-400 mt-1">Con vigencia de 30 días vigente</p>
      </div>

      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">Tickets Consumidos</span>
          <span class="p-2 rounded-xl bg-amber-500/10 text-amber-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"></path></svg></span>
        </div>
        <p class="text-2xl font-black text-white mt-2" id="metricTickets">--</p>
        <p class="text-[11px] text-slate-400 mt-1">Folios procesados este periodo</p>
      </div>

      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">Validación Banxico CEP</span>
          <span class="p-2 rounded-xl bg-teal-500/10 text-teal-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span>
        </div>
        <p class="text-2xl font-black text-white mt-2">Mercado Pago</p>
        <p class="text-[11px] text-slate-400 mt-1">Receptor: 722969020307804434</p>
      </div>
    </div>

    <!-- Sección de Clientes y Planes -->
    <div id="seccion-clientes" class="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 space-y-6 scroll-mt-20">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="text-xl font-extrabold text-white">Clientes & Planes Activos</h3>
          <p class="text-xs text-slate-400">Administra folios, vigencias, datos fiscales y números autorizados.</p>
        </div>
        <div class="flex items-center gap-3">
          <input type="text" id="busquedaCliente" oninput="filtrarClientes()" placeholder="Buscar por RFC, nombre o tel..." class="px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 w-48 sm:w-64" />
          <button onclick="abrirModalNuevoCliente()" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5 shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            Nuevo Cliente
          </button>
        </div>
      </div>

      <!-- Tabla de Clientes -->
      <div class="overflow-x-auto rounded-2xl border border-slate-800">
        <table class="w-full text-left text-sm text-slate-300">
          <thead class="bg-slate-900 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th class="py-3.5 px-4">Cliente / Razón Social</th>
              <th class="py-3.5 px-4">RFC & Régimen</th>
              <th class="py-3.5 px-4">WhatsApp</th>
              <th class="py-3.5 px-4">Plan & Folios</th>
              <th class="py-3.5 px-4">Vigencia (30 días)</th>
              <th class="py-3.5 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody id="tablaClientesBody" class="divide-y divide-slate-800/60 font-normal">
            <tr><td colspan="6" class="text-center py-8 text-xs text-slate-500">Cargando clientes...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Sección de Facturas Descargadas -->
    <div class="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-bold text-white">Facturas Recientes (XML & PDF)</h3>
          <p class="text-xs text-slate-400">Descarga directa de comprobantes fiscales timbrados en el servidor.</p>
        </div>
        <button onclick="cargarFacturas()" class="text-xs text-slate-400 hover:text-white flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Actualizar
        </button>
      </div>

      <div id="listaFacturas" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <p class="text-xs text-slate-500 col-span-3">Cargando archivos...</p>
      </div>
    </div>

    <!-- Sección de Solicitudes de Conectores (Proveedores Pendientes) -->
    <div class="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-bold text-white">Solicitudes de Nuevos Conectores</h3>
            <span id="badgeTotalSolicitudes" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">0</span>
          </div>
          <p class="text-xs text-slate-400">Proveedores y comercios solicitados por clientes que aún no tienen conector instalado.</p>
        </div>
        <button onclick="cargarSolicitudesConectores()" class="text-xs text-slate-400 hover:text-white flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Actualizar
        </button>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 font-semibold">
            <tr>
              <th class="py-3 px-4">Comercio / Proveedor</th>
              <th class="py-3 px-4">RFC Emisor</th>
              <th class="py-3 px-4">Cliente Solicitante</th>
              <th class="py-3 px-4 text-center">Peticiones</th>
              <th class="py-3 px-4">Portal / Folio</th>
              <th class="py-3 px-4 text-center">Estado</th>
              <th class="py-3 px-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody id="tablaSolicitudesBody" class="divide-y divide-slate-800/60 font-normal">
            <tr><td colspan="7" class="text-center py-6 text-xs text-slate-500">Cargando solicitudes...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <!-- Modal: Activar Plan -->
  <div id="modalPlan" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold text-white">Activar o Cambiar Plan</h3>
        <button onclick="cerrarModalPlan()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <p class="text-xs text-slate-400" id="modalPlanClienteText">Cliente: --</p>

      <div class="space-y-3">
        <label class="block text-xs font-semibold text-slate-300">Seleccionar Paquete (30 días de vigencia)</label>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <label class="border border-slate-700 bg-slate-800/60 p-3 rounded-xl cursor-pointer hover:border-emerald-500">
            <input type="radio" name="planRadio" value="20" class="mr-1.5" /> <b>20 tickets</b> ($179)
          </label>
          <label class="border border-slate-700 bg-slate-800/60 p-3 rounded-xl cursor-pointer hover:border-emerald-500">
            <input type="radio" name="planRadio" value="40" checked class="mr-1.5" /> <b>40 tickets</b> ($299)
          </label>
          <label class="border border-slate-700 bg-slate-800/60 p-3 rounded-xl cursor-pointer hover:border-emerald-500">
            <input type="radio" name="planRadio" value="80" class="mr-1.5" /> <b>80 tickets</b> ($499)
          </label>
          <label class="border border-slate-700 bg-slate-800/60 p-3 rounded-xl cursor-pointer hover:border-emerald-500">
            <input type="radio" name="planRadio" value="100" class="mr-1.5" /> <b>100 tickets</b> ($599)
          </label>
        </div>

        <div class="pt-2">
          <label class="block text-xs font-semibold text-slate-300">Días de Vigencia</label>
          <input type="number" id="inputDiasPlan" value="30" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white" />
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button onclick="cerrarModalPlan()" class="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700">Cancelar</button>
        <button onclick="guardarActivacionPlan()" class="px-5 py-2 rounded-xl bg-emerald-500 text-xs font-bold text-slate-950 hover:bg-emerald-400">Activar Plan</button>
      </div>
    </div>
  </div>

  <!-- Modal: Ajustar Folios -->
  <div id="modalAjustar" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold text-white">Ajustar Tickets Usados</h3>
        <button onclick="cerrarModalAjustar()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <p class="text-xs text-slate-400" id="modalAjustarText">Cliente: --</p>

      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">Tickets Usados en este Periodo</label>
        <input type="number" id="inputAjustarTickets" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white" />
        <p class="text-[11px] text-slate-400 mt-1">Ejemplo: Escribe 16 para Cristhian.</p>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button onclick="cerrarModalAjustar()" class="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700">Cancelar</button>
        <button onclick="guardarAjusteTickets()" class="px-5 py-2 rounded-xl bg-amber-500 text-xs font-bold text-slate-950 hover:bg-amber-400">Fijar Conteo</button>
      </div>
    </div>
  </div>

  <!-- Modal: Nuevo Cliente / Editar Cliente -->
  <div id="modalCliente" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold text-white" id="modalClienteTitle">Registrar Nuevo Cliente</h3>
        <button onclick="cerrarModalCliente()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="sm:col-span-2">
          <label class="block font-semibold text-slate-300 mb-1">Razón Social / Nombre Completo *</label>
          <input type="text" id="cliRazon" placeholder="CRISTHIAN VALDIVIA MARTINEZ" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white uppercase" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">RFC (con Homoclave) *</label>
          <input type="text" id="cliRfc" placeholder="VAMC9112056Q2" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono uppercase" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Código Postal *</label>
          <input type="text" id="cliCp" placeholder="37545" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Régimen Fiscal (SAT)</label>
          <input type="text" id="cliRegimen" placeholder="626 (RESICO)" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Uso de CFDI</label>
          <input type="text" id="cliUso" placeholder="G03" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Teléfono WhatsApp</label>
          <input type="text" id="cliTel" placeholder="+5214775907888" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Correo Electrónico</label>
          <input type="email" id="cliEmail" placeholder="cliente@ejemplo.com" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white" />
        </div>

        <div class="sm:col-span-2">
          <label class="block font-semibold text-slate-300 mb-1">Paquete Inicial</label>
          <select id="cliPaquete" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white">
            <option value="20">Plan Básico (20 tickets) - $179 MXN</option>
            <option value="40" selected>Plan Pro (40 tickets) - $299 MXN</option>
            <option value="80">Plan Negocio (80 tickets) - $499 MXN</option>
            <option value="100">Plan Empresa (100 tickets) - $599 MXN</option>
          </select>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button onclick="cerrarModalCliente()" class="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700">Cancelar</button>
        <button onclick="guardarClienteForm()" class="px-5 py-2 rounded-xl bg-emerald-500 text-xs font-bold text-slate-950 hover:bg-emerald-400">Guardar Cliente</button>
      </div>
    </div>
  </div>

  <!-- Modal: Enviar Factura a Cliente por WhatsApp -->
  <div id="modalEnviarFactura" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold text-white flex items-center gap-2">
          <span>📲 Enviar Factura al Cliente</span>
        </h3>
        <button onclick="cerrarModalEnviarFactura()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <p class="text-xs text-slate-400">Entrega de PDF y XML oficial vía WhatsApp una vez instalado el conector.</p>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-slate-300 mb-1">Destinatario / Cliente</label>
          <select id="envioClienteSelect" onchange="actualizarDestinoSeleccionado()" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white">
            <option value="">-- Seleccionar de clientes registrados --</option>
          </select>
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Número o WhatsApp destino *</label>
          <input type="text" id="envioTelefono" placeholder="+5214775907888" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Archivo PDF (downloads/)</label>
          <input type="text" id="envioPdf" placeholder="Factura_IWAVX_243004.pdf" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono" />
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">Archivo XML (downloads/)</label>
          <input type="text" id="envioXml" placeholder="Factura_IWAVX_243004.xml" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-semibold text-slate-300 mb-1">Emisor</label>
            <input type="text" id="envioEmisor" placeholder="Walmart México" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white" />
          </div>
          <div>
            <label class="block font-semibold text-slate-300 mb-1">Total MXN</label>
            <input type="number" step="0.01" id="envioTotal" placeholder="207.00" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white" />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button onclick="cerrarModalEnviarFactura()" class="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700">Cancelar</button>
        <button id="btnConfirmarEnvio" onclick="confirmarEnviarFactura()" class="px-5 py-2 rounded-xl bg-emerald-500 text-xs font-bold text-slate-950 hover:bg-emerald-400 flex items-center gap-1.5">
          <span>Enviar PDF & XML</span>
        </button>
      </div>
    </div>
  </div>

  <footer class="border-t border-slate-900 py-6 text-center text-xs text-slate-400">
    KlientIA Facturación &copy; 2026 — Desarrollado por Manuel Ochoa del Río
  </footer>

  <script>
    let adminToken = localStorage.getItem("klientia_admin_pin") || "";
    let todosClientes = [];
    let rfcSeleccionado = "";

    function getHeaders() {
      return {
        "Content-Type": "application/json",
        "x-admin-pin": adminToken
      };
    }

    async function verificarAuth() {
      if (!adminToken) {
        document.getElementById("loginModal").classList.remove("hidden");
        return;
      }
      try {
        const res = await fetch("/api/status", { headers: getHeaders() });
        if (res.status === 401) {
          localStorage.removeItem("klientia_admin_pin");
          adminToken = "";
          document.getElementById("loginModal").classList.remove("hidden");
        } else {
          document.getElementById("loginModal").classList.add("hidden");
          iniciarActualizacionPeriodica();
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function intentarLogin() {
      const pin = document.getElementById("inputPin").value.trim();
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (data.ok) {
          adminToken = pin;
          localStorage.setItem("klientia_admin_pin", pin);
          document.getElementById("loginModal").classList.add("hidden");
          iniciarActualizacionPeriodica();
        } else {
          document.getElementById("loginError").classList.remove("hidden");
        }
      } catch (e) {
        document.getElementById("loginError").classList.remove("hidden");
      }
    }

    function cerrarSesion() {
      localStorage.removeItem("klientia_admin_pin");
      window.location.reload();
    }

    async function cargarEstado() {
      try {
        const res = await fetch("/api/status", { headers: getHeaders() });
        if (!res.ok) return;
        const data = await res.json();

        // Actualizar Card Motor
        const motorPill = document.getElementById("motorPill");
        const motorDot = document.getElementById("motorDot");
        const motorStatusText = document.getElementById("motorStatusText");

        if (data.motor === "RUNNING") {
          motorPill.className = "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
          motorDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 badge-pulse";
          motorStatusText.innerText = "🟢 MOTOR ENCENDIDO (Activo)";
        } else {
          motorPill.className = "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border bg-amber-500/10 border-amber-500/30 text-amber-400";
          motorDot.className = "w-2.5 h-2.5 rounded-full bg-amber-400";
          motorStatusText.innerText = "⏸️ MOTOR EN PAUSA";
        }

        // WhatsApp Badge
        const waBadge = document.getElementById("waBadge");
        const waText = document.getElementById("waText");
        const btnVerQr = document.getElementById("btnVerQr");

        if (data.conexionWa === "open") {
          waBadge.className = "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
          waBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Conectado: ' + (data.usuarioConectado || "WhatsApp");
          btnVerQr.classList.add("hidden");
          document.getElementById("qrSection").classList.add("hidden");
        } else {
          waBadge.className = "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border bg-amber-500/10 border-amber-500/30 text-amber-400";
          waBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Requiere Escaneo QR';
          btnVerQr.classList.remove("hidden");
          if (data.qrCodeSvg) {
            document.getElementById("qrContainer").innerHTML = data.qrCodeSvg;
          }
        }

        // Métricas
        document.getElementById("metricClientes").innerText = data.totalClientes ?? "--";
        document.getElementById("metricPlanes").innerText = data.planesActivos ?? "--";
        document.getElementById("metricTickets").innerText = data.ticketsFacturadosMes ?? "--";
        document.getElementById("uptimeText").innerText = "Uptime: " + Math.floor(data.uptimeSec / 60) + "m";
        document.getElementById("ramText").innerText = "RAM: " + data.memoriaMb + " MB";
        document.getElementById("waUserText").innerText = data.usuarioConectado ? ("+" + data.usuarioConectado) : "Sin vincular";

      } catch (e) {
        console.error(e);
      }
    }

    async function controlarMotor(accion) {
      try {
        const res = await fetch("/api/motor/" + accion, {
          method: "POST",
          headers: getHeaders()
        });
        const data = await res.json();
        cargarEstado();
      } catch (e) {
        alert("Error al controlar motor: " + e.message);
      }
    }

    function toggleQrModal() {
      const qrSec = document.getElementById("qrSection");
      qrSec.classList.toggle("hidden");
    }

    async function desvincularNumeroWhatsApp() {
      if (!confirm("¿Deseas desvincular el número actual de WhatsApp para conectar uno nuevo?\\n\\nAl confirmar, se cerrará la sesión actual y aparecerá un nuevo código QR para escanear con tu nuevo número de teléfono.")) return;
      try {
        const res = await fetch("/api/motor/unlink", {
          method: "POST",
          headers: getHeaders()
        });
        const data = await res.json();
        alert(data.mensaje || "Sesión desvinculada. Escanea el nuevo código QR con tu nuevo número.");
        document.getElementById("qrSection").classList.remove("hidden");
        cargarEstado();
      } catch (e) {
        alert("Error al desvincular: " + e.message);
      }
    }

    async function cargarClientes() {
      try {
        const res = await fetch("/api/clients", { headers: getHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        todosClientes = data.clientes || [];
        renderizarTablaClientes(todosClientes);
      } catch (e) {
        console.error(e);
      }
    }

    function renderizarTablaClientes(clientes) {
      const tbody = document.getElementById("tablaClientesBody");
      if (clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-xs text-slate-400">No se encontraron clientes registrados.</td></tr>';
        return;
      }

      tbody.innerHTML = clientes.map(c => {
        const incluidos = c.ticketsIncluidos || 40;
        const usados = c.ticketsUsadosMes || 0;
        const restantes = c.ticketsRestantes ?? Math.max(0, incluidos - usados);
        const porcentaje = Math.min(100, Math.round((usados / incluidos) * 100));

        let colorProgreso = "bg-emerald-500";
        if (porcentaje >= 90) colorProgreso = "bg-rose-500";
        else if (porcentaje >= 70) colorProgreso = "bg-amber-500";

        let badgeEstado = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ACTIVO</span>';
        if (c.estadoPlan === "VENCIDO") {
          badgeEstado = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">VENCIDO</span>';
        } else if (c.estadoPlan === "AGOTADO" || restantes === 0) {
          badgeEstado = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">AGOTADO</span>';
        }

        const telLink = c.telefono ? ('<a href="https://wa.me/' + c.telefono.replace(/\\D/g, '') + '" target="_blank" class="text-emerald-400 hover:underline flex items-center gap-1 font-mono text-xs">' + c.telefono + '</a>') : '<span class="text-slate-500">Sin registrar</span>';

        return '<tr class="hover:bg-slate-900/60 transition">' +
          '<td class="py-4 px-4">' +
            '<div class="font-bold text-white text-sm">' + c.razonSocial + '</div>' +
            '<div class="text-[11px] text-slate-400 mt-0.5">' + (c.email || "Sin correo") + '</div>' +
          '</td>' +
          '<td class="py-4 px-4">' +
            '<span class="font-mono text-xs font-semibold text-slate-200">' + c.rfc + '</span>' +
            '<div class="text-[10px] text-slate-400 mt-0.5">C.P. ' + c.codigoPostal + ' | Rég. ' + c.regimenFiscal + '</div>' +
          '</td>' +
          '<td class="py-4 px-4">' + telLink + '</td>' +
          '<td class="py-4 px-4">' +
            '<div class="flex items-center justify-between text-xs mb-1">' +
              '<span class="font-bold text-white">' + c.paqueteNombre + '</span>' +
              '<span class="text-[11px] font-semibold text-slate-300">' + usados + ' / ' + incluidos + '</span>' +
            '</div>' +
            '<div class="w-36 bg-slate-800 rounded-full h-1.5 overflow-hidden">' +
              '<div class="' + colorProgreso + ' h-1.5 rounded-full" style="width: ' + porcentaje + '%"></div>' +
            '</div>' +
            '<div class="text-[10px] text-slate-400 mt-1">' + restantes + ' folios disponibles</div>' +
          '</td>' +
          '<td class="py-4 px-4">' +
            badgeEstado +
            '<div class="text-[11px] text-slate-300 mt-1">' + (c.fechaFinPlan ? ('Vence: ' + c.fechaFinPlan) : 'Sin límite') + '</div>' +
            (c.diasRestantes !== undefined ? ('<div class="text-[10px] text-slate-400">' + c.diasRestantes + ' días restantes</div>') : '') +
          '</td>' +
          '<td class="py-4 px-4 text-right space-x-1 whitespace-nowrap">' +
            '<button data-rfc="' + c.rfc + '" onclick="abrirModalPlan(this.dataset.rfc)" title="Cambiar o Renovar Plan" class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold border border-emerald-500/20">⚡ Plan</button>' +
            '<button data-rfc="' + c.rfc + '" data-usados="' + usados + '" onclick="abrirModalAjustar(this.dataset.rfc, Number(this.dataset.usados))" title="Fijar tickets usados" class="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold border border-amber-500/20">🔢 Folios</button>' +
            '<button data-rfc="' + c.rfc + '" onclick="eliminarCliente(this.dataset.rfc)" title="Eliminar Cliente" class="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold border border-rose-500/20">🗑️</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function filtrarClientes() {
      const q = document.getElementById("busquedaCliente").value.toLowerCase();
      const filtrados = todosClientes.filter(c =>
        c.rfc.toLowerCase().includes(q) ||
        c.razonSocial.toLowerCase().includes(q) ||
        (c.telefono && c.telefono.includes(q))
      );
      renderizarTablaClientes(filtrados);
    }

    // Modal Plan
    function abrirModalPlan(rfc) {
      rfcSeleccionado = rfc;
      const c = todosClientes.find(x => x.rfc === rfc);
      document.getElementById("modalPlanClienteText").innerText = "Cliente: " + (c ? c.razonSocial : rfc);
      document.getElementById("modalPlan").classList.remove("hidden");
      document.getElementById("modalPlan").classList.add("flex");
    }
    function cerrarModalPlan() {
      document.getElementById("modalPlan").classList.add("hidden");
      document.getElementById("modalPlan").classList.remove("flex");
    }
    async function guardarActivacionPlan() {
      const radios = document.getElementsByName("planRadio");
      let tickets = 40;
      for (const r of radios) { if (r.checked) tickets = Number(r.value); }
      const dias = Number(document.getElementById("inputDiasPlan").value) || 30;

      try {
        const res = await fetch("/api/clients/" + encodeURIComponent(rfcSeleccionado) + "/plan", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ tickets, diasVigencia: dias })
        });
        cerrarModalPlan();
        cargarClientes();
        cargarEstado();
      } catch (e) {
        alert("Error al activar plan: " + e.message);
      }
    }

    // Modal Ajustar Folios
    function abrirModalAjustar(rfc, usadosActuales) {
      rfcSeleccionado = rfc;
      const c = todosClientes.find(x => x.rfc === rfc);
      document.getElementById("modalAjustarText").innerText = "Cliente: " + (c ? c.razonSocial : rfc);
      document.getElementById("inputAjustarTickets").value = usadosActuales;
      document.getElementById("modalAjustar").classList.remove("hidden");
      document.getElementById("modalAjustar").classList.add("flex");
    }
    function cerrarModalAjustar() {
      document.getElementById("modalAjustar").classList.add("hidden");
      document.getElementById("modalAjustar").classList.remove("flex");
    }
    async function guardarAjusteTickets() {
      const cantidad = Number(document.getElementById("inputAjustarTickets").value);
      try {
        const res = await fetch("/api/clients/" + encodeURIComponent(rfcSeleccionado) + "/adjust", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ ticketsUsados: cantidad })
        });
        cerrarModalAjustar();
        cargarClientes();
        cargarEstado();
      } catch (e) {
        alert("Error al ajustar folios: " + e.message);
      }
    }

    // Modal Nuevo Cliente
    function abrirModalNuevoCliente() {
      document.getElementById("cliRazon").value = "";
      document.getElementById("cliRfc").value = "";
      document.getElementById("cliCp").value = "";
      document.getElementById("cliRegimen").value = "626";
      document.getElementById("cliUso").value = "G03";
      document.getElementById("cliTel").value = "";
      document.getElementById("cliEmail").value = "";
      document.getElementById("modalCliente").classList.remove("hidden");
      document.getElementById("modalCliente").classList.add("flex");
    }
    function cerrarModalCliente() {
      document.getElementById("modalCliente").classList.add("hidden");
      document.getElementById("modalCliente").classList.remove("flex");
    }
    async function guardarClienteForm() {
      const payload = {
        razonSocial: document.getElementById("cliRazon").value.trim(),
        rfc: document.getElementById("cliRfc").value.trim(),
        codigoPostal: document.getElementById("cliCp").value.trim(),
        regimenFiscal: document.getElementById("cliRegimen").value.trim(),
        usoCfdi: document.getElementById("cliUso").value.trim(),
        telefono: document.getElementById("cliTel").value.trim(),
        email: document.getElementById("cliEmail").value.trim(),
        paqueteTickets: Number(document.getElementById("cliPaquete").value)
      };

      if (!payload.rfc || !payload.razonSocial || !payload.codigoPostal) {
        alert("RFC, Razón Social y Código Postal son requeridos");
        return;
      }

      try {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          cerrarModalCliente();
          cargarClientes();
          cargarEstado();
        } else {
          alert(data.error || "Error al guardar");
        }
      } catch (e) {
        alert("Error: " + e.message);
      }
    }

    // Eliminar Cliente
    async function eliminarCliente(rfc) {
      if (!confirm("¿Seguro que deseas eliminar este cliente (" + rfc + ")?")) return;
      try {
        await fetch("/api/clients/" + encodeURIComponent(rfc), {
          method: "DELETE",
          headers: getHeaders()
        });
        cargarClientes();
        cargarEstado();
      } catch (e) {
        alert("Error: " + e.message);
      }
    }

    // Cargar Facturas Recientes
    async function cargarFacturas() {
      try {
        const res = await fetch("/api/invoices", { headers: getHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const lista = document.getElementById("listaFacturas");
        const invoices = data.invoices || [];

        if (invoices.length === 0) {
          lista.innerHTML = '<p class="text-xs text-slate-500 col-span-3">No hay facturas descargadas aún en downloads/.</p>';
          return;
        }

        lista.innerHTML = invoices.slice(0, 12).map(f => {
          const esPdf = f.tipo === "pdf";
          const icon = esPdf ? '📄' : '📋';
          const counterpartName = esPdf ? f.nombre.replace(/\.pdf$/i, '.xml') : f.nombre.replace(/\.xml$/i, '.pdf');
          const hasXml = esPdf && invoices.some(x => x.nombre.toLowerCase() === counterpartName.toLowerCase());

          return '<div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 flex items-center justify-between gap-3 hover:border-slate-700 transition">' +
            '<div class="flex items-center gap-3 overflow-hidden">' +
              '<span class="text-xl shrink-0">' + icon + '</span>' +
              '<div class="overflow-hidden">' +
                '<p class="text-xs font-bold text-white truncate" title="' + f.nombre + '">' + f.nombre + '</p>' +
                '<p class="text-[10px] text-slate-400">' + f.tamanoKb + ' KB • ' + f.fechaModificacion + '</p>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 shrink-0">' +
              '<button data-nombre="' + encodeURIComponent(f.nombre) + '" data-counterpart="' + encodeURIComponent(esPdf ? counterpartName : '') + '" onclick="abrirModalEnviarFactura(decodeURIComponent(this.dataset.nombre), decodeURIComponent(this.dataset.counterpart))" class="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs border border-emerald-500/30" title="Enviar PDF & XML al Cliente vía WhatsApp">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>' +
              '</button>' +
              '<a href="' + f.urlDescarga + '" download class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700" title="Descargar">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>' +
              '</a>' +
            '</div>' +
          '</div>';
        }).join('');
      } catch (e) {
        console.error(e);
      }
    }

    // Modal Enviar Factura a Cliente
    function abrirModalEnviarFactura(filename, counterpartName) {
      const select = document.getElementById("envioClienteSelect");
      select.innerHTML = '<option value="">-- Seleccionar de clientes registrados --</option>' +
        todosClientes.map(c => '<option value="' + c.rfc + '" data-tel="' + (c.telefono || '') + '" data-razon="' + c.razonSocial + '">' + c.razonSocial + ' (' + c.rfc + ')' + '</option>').join('');

      const esPdf = filename.toLowerCase().endsWith('.pdf');
      document.getElementById("envioPdf").value = esPdf ? filename : (counterpartName || '');
      document.getElementById("envioXml").value = !esPdf ? filename : (counterpartName || '');

      // Autodetectar emisor si el archivo tiene pista
      if (filename.toLowerCase().includes("walmart")) {
        document.getElementById("envioEmisor").value = "Walmart México";
      } else if (filename.toLowerCase().includes("pepsico")) {
        document.getElementById("envioEmisor").value = "Comercializadora PepsiCo México";
      } else if (filename.toLowerCase().includes("propimex")) {
        document.getElementById("envioEmisor").value = "Propimex (Coca-Cola FEMSA)";
      } else {
        document.getElementById("envioEmisor").value = "Proveedor";
      }

      document.getElementById("modalEnviarFactura").classList.remove("hidden");
      document.getElementById("modalEnviarFactura").classList.add("flex");
    }

    function cerrarModalEnviarFactura() {
      document.getElementById("modalEnviarFactura").classList.add("hidden");
      document.getElementById("modalEnviarFactura").classList.remove("flex");
    }

    function actualizarDestinoSeleccionado() {
      const select = document.getElementById("envioClienteSelect");
      const rfc = select.value;
      const cliente = todosClientes.find(c => c.rfc === rfc);
      if (cliente) {
        document.getElementById("envioTelefono").value = cliente.telefono || "";
      }
    }

    async function confirmarEnviarFactura() {
      const tel = document.getElementById("envioTelefono").value.trim();
      const pdf = document.getElementById("envioPdf").value.trim();
      const xml = document.getElementById("envioXml").value.trim();
      const emisor = document.getElementById("envioEmisor").value.trim();
      const total = document.getElementById("envioTotal").value.trim();
      const select = document.getElementById("envioClienteSelect");
      const rfc = select.value;
      const cliente = todosClientes.find(c => c.rfc === rfc);

      if (!tel) {
        alert("Por favor indica el teléfono o JID de WhatsApp del cliente.");
        return;
      }

      const btn = document.getElementById("btnConfirmarEnvio");
      btn.innerText = "Enviando por WhatsApp...";
      btn.disabled = true;

      try {
        const res = await fetch("/api/invoices/send-to-client", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            targetJidOrPhone: tel,
            pdfFilename: pdf,
            xmlFilename: xml,
            emisor: emisor || "Proveedor",
            total: total ? Number(total) : undefined,
            receptorNombre: cliente?.razonSocial,
            receptorRfc: cliente?.rfc,
          })
        });
        const data = await res.json();
        if (data.ok) {
          alert("✅ Factura (PDF y XML) enviada exitosamente por WhatsApp al cliente.");
          cerrarModalEnviarFactura();
        } else {
          alert("❌ Error: " + (data.mensaje || data.error || "No se pudo enviar"));
        }
      } catch (e) {
        alert("Error de red: " + e.message);
      } finally {
        btn.innerText = "Enviar PDF & XML";
        btn.disabled = false;
      }
    }

    // Cargar Solicitudes de Conectores
    async function cargarSolicitudesConectores() {
      try {
        const res = await fetch("/api/connectors/requests", { headers: getHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const tbody = document.getElementById("tablaSolicitudesBody");
        const badge = document.getElementById("badgeTotalSolicitudes");
        const solicitudes = data.solicitudes || [];

        badge.innerText = solicitudes.length;

        if (solicitudes.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-xs text-slate-500">No hay solicitudes de conectores pendientes. Cuando un cliente envíe un ticket de un proveedor nuevo, aparecerá aquí.</td></tr>';
          return;
        }

        tbody.innerHTML = solicitudes.map(s => {
          const badgeColor = s.estado === "INSTALADO" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                             s.estado === "EN_DESARROLLO" ? "bg-sky-500/10 text-sky-400 border-sky-500/30" :
                             "bg-amber-500/10 text-amber-400 border-amber-500/30";

          return '<tr class="hover:bg-slate-900/40 transition">' +
            '<td class="py-3 px-4 font-bold text-white">' + s.comercio + '</td>' +
            '<td class="py-3 px-4 font-mono text-[11px] text-slate-400">' + (s.rfcEmisor || "Sin RFC") + '</td>' +
            '<td class="py-3 px-4 text-slate-300">' + (s.clienteNombre || "Cliente") + '<br/><span class="text-[10px] text-slate-500">' + (s.solicitadoPorJid || "") + '</span></td>' +
            '<td class="py-3 px-4 text-center font-bold text-amber-400">' + (s.conteo || 1) + '</td>' +
            '<td class="py-3 px-4 text-[11px] text-slate-400">' + (s.urlPortal ? '<a href="' + s.urlPortal + '" target="_blank" class="text-emerald-400 underline">Portal</a>' : 'Sin URL') + (s.folioTicket ? ' • ' + s.folioTicket : '') + '</td>' +
            '<td class="py-3 px-4 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ' + badgeColor + '">' + s.estado + '</span></td>' +
            '<td class="py-3 px-4 text-right space-x-1 whitespace-nowrap">' +
              (s.estado !== "EN_DESARROLLO" && s.estado !== "INSTALADO" ? '<button data-id="' + s.id + '" data-estado="EN_DESARROLLO" onclick="cambiarEstadoSolicitud(this.dataset.id, this.dataset.estado)" class="px-2 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[10px] font-semibold border border-sky-500/30">En Desarrollo</button>' : '') +
              (s.estado !== "INSTALADO" ? '<button data-id="' + s.id + '" data-estado="INSTALADO" onclick="cambiarEstadoSolicitud(this.dataset.id, this.dataset.estado)" class="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-semibold border border-emerald-500/30">Instalado</button>' : '') +
              '<button data-comercio="' + encodeURIComponent(s.comercio || '') + '" data-jid="' + encodeURIComponent(s.solicitadoPorJid || '') + '" data-total="' + encodeURIComponent(s.totalTicket || '') + '" data-nombre="' + encodeURIComponent(s.clienteNombre || '') + '" onclick="prepararEnvioDesdeSolicitud(decodeURIComponent(this.dataset.comercio), decodeURIComponent(this.dataset.jid), decodeURIComponent(this.dataset.total), decodeURIComponent(this.dataset.nombre))" class="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-semibold border border-emerald-500/30" title="Enviar PDF y XML al Cliente">📤 Enviar</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      } catch (e) {
        console.error(e);
      }
    }

    function prepararEnvioDesdeSolicitud(comercio, telefono, total, razonSocial) {
      abrirModalEnviarFactura('', '');
      if (comercio) document.getElementById("envioEmisor").value = comercio;
      if (telefono) document.getElementById("envioTelefono").value = telefono;
      if (total) document.getElementById("envioTotal").value = total;

      // Buscar si coincide con algún cliente
      const select = document.getElementById("envioClienteSelect");
      if (razonSocial) {
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].text.toLowerCase().includes(razonSocial.toLowerCase())) {
            select.selectedIndex = i;
            break;
          }
        }
      }
    }

    async function cambiarEstadoSolicitud(id, estado) {
      try {
        const res = await fetch("/api/connectors/requests/" + encodeURIComponent(id) + "/status", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ estado })
        });
        const data = await res.json();
        if (data.ok) {
          cargarSolicitudesConectores();
        } else {
          alert("Error: " + (data.error || "No se pudo actualizar"));
        }
      } catch (e) {
        alert("Error de red");
      }
    }

    function iniciarActualizacionPeriodica() {
      cargarEstado();
      cargarClientes();
      cargarFacturas();
      cargarSolicitudesConectores();
      setInterval(cargarEstado, 5000);
      setInterval(cargarClientes, 15000);
      setInterval(cargarSolicitudesConectores, 15000);
    }

    // Inicializar
    verificarAuth();
  </script>
</body>
</html>`;
}
