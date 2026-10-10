import * as fs from "fs";
import * as path from "path";
const FILE_PATH = path.resolve(process.cwd(), "data", "registro_auditoria_tickets.json");
export function obtenerHoraCdmx(date = new Date()) {
    const iso = date.toISOString();
    const local = date.toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
    // Obtener YYYY-MM-DD en zona horaria CDMX
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
    return { iso, local, dia: parts };
}
export function leerAuditoria() {
    try {
        if (!fs.existsSync(FILE_PATH)) {
            return preCargarHistorialExistente();
        }
        const raw = fs.readFileSync(FILE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return preCargarHistorialExistente();
        }
        return parsed;
    }
    catch (err) {
        console.error("[TicketAudit] Error al leer archivo de auditoría:", err);
        return [];
    }
}
/**
 * Si el archivo de auditoría es nuevo, precarga los tickets respaldados hoy en data/tickets_recibidos
 */
function preCargarHistorialExistente() {
    const records = [];
    try {
        const backupDir = path.resolve(process.cwd(), "data", "tickets_recibidos");
        if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir).filter((f) => f.startsWith("ticket_"));
            for (const file of files) {
                const fullPath = path.join(backupDir, file);
                const stat = fs.statSync(fullPath);
                const { iso, local, dia } = obtenerHoraCdmx(stat.mtime);
                const id = file.replace(/\.[^/.]+$/, "");
                records.push({
                    id,
                    fechaIso: iso,
                    fechaLocal: local,
                    fechaDia: dia,
                    senderJid: "5214775907888@s.whatsapp.net",
                    senderPn: "5214775907888",
                    clienteNombre: "CRISTHIAN VALDIVIA MORENO",
                    clienteRfc: "VAMC9112056Q2",
                    backupFile: fullPath,
                    fileName: file,
                    establecimiento: "RED VIA CORTA / RCO",
                    estado: "EXITO",
                    motivoError: undefined,
                });
            }
        }
        if (records.length > 0) {
            guardarAuditoria(records);
        }
    }
    catch (e) {
        console.warn("[TicketAudit] Advertencia al precargar historial:", e);
    }
    return records;
}
export function guardarAuditoria(items) {
    try {
        const dir = path.dirname(FILE_PATH);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), "utf-8");
    }
    catch (err) {
        console.error("[TicketAudit] Error guardando registro de auditoría:", err);
    }
}
export function registrarTicketAudit(item) {
    const items = leerAuditoria();
    const times = obtenerHoraCdmx();
    const record = {
        id: item.id,
        fechaIso: item.fechaIso || times.iso,
        fechaLocal: item.fechaLocal || times.local,
        fechaDia: item.fechaDia || times.dia,
        senderJid: item.senderJid,
        senderPn: item.senderPn,
        clienteNombre: item.clienteNombre,
        clienteRfc: item.clienteRfc,
        backupFile: item.backupFile,
        fileName: item.fileName,
        establecimiento: item.establecimiento,
        folio: item.folio,
        monto: item.monto,
        estado: item.estado || "PENDIENTE",
        motivoError: item.motivoError,
        uuidFactura: item.uuidFactura,
        facturaPdfPath: item.facturaPdfPath,
        facturaXmlPath: item.facturaXmlPath,
    };
    const idx = items.findIndex((r) => r.id === item.id);
    if (idx >= 0) {
        items[idx] = { ...items[idx], ...record };
    }
    else {
        items.unshift(record);
    }
    guardarAuditoria(items);
    return record;
}
export function actualizarTicketAudit(id, updates) {
    const items = leerAuditoria();
    const idx = items.findIndex((r) => r.id === id || (r.backupFile && r.backupFile.includes(id)));
    if (idx === -1)
        return null;
    items[idx] = { ...items[idx], ...updates };
    guardarAuditoria(items);
    return items[idx];
}
export function obtenerResumenHoy() {
    const items = leerAuditoria();
    const { dia } = obtenerHoraCdmx();
    const deHoy = items.filter((r) => r.fechaDia === dia);
    let totalRecibidos = deHoy.length;
    let exitosos = 0;
    let fallidos = 0;
    let pendientes = 0;
    let montoTotal = 0;
    const porCliente = {};
    for (const t of deHoy) {
        const key = t.clienteRfc || t.senderPn || t.senderJid || "DESCONOCIDO";
        if (!porCliente[key]) {
            porCliente[key] = {
                nombre: t.clienteNombre || "Cliente sin registrar",
                rfc: t.clienteRfc || "XAXX010101000",
                recibidos: 0,
                exitosos: 0,
                fallidos: 0,
                monto: 0,
            };
        }
        porCliente[key].recibidos++;
        if (t.estado === "EXITO") {
            exitosos++;
            porCliente[key].exitosos++;
            if (t.monto) {
                montoTotal += t.monto;
                porCliente[key].monto += t.monto;
            }
        }
        else if (t.estado === "ERROR" || t.estado === "NO_TICKET") {
            fallidos++;
            porCliente[key].fallidos++;
        }
        else {
            pendientes++;
        }
    }
    return {
        dia,
        totalRecibidos,
        exitosos,
        fallidos,
        pendientes,
        montoTotal,
        porCliente,
    };
}
export function obtenerTicketsFallidos(limit = 5) {
    const items = leerAuditoria();
    return items.filter((r) => r.estado === "ERROR" || r.estado === "PENDIENTE" || r.estado === "NO_TICKET").slice(0, limit);
}
export function buscarTicketPorId(query) {
    const items = leerAuditoria();
    const qLimpio = query.trim().toLowerCase();
    return items.find((r) => r.id.toLowerCase().includes(qLimpio) || (r.backupFile && r.backupFile.toLowerCase().includes(qLimpio))) || null;
}
