import * as fs from "fs";
import * as path from "path";
const DATA_DIR = path.resolve(process.cwd(), "data");
const PROFILES_FILE = path.join(DATA_DIR, "perfiles_fiscales.json");
function obtenerMesActual() {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
}
const PERFIL_DEFAULT = {
    rfc: "VAMC9112056Q2",
    razonSocial: "CRISTHIAN VALDIVIA MARTINEZ",
    codigoPostal: "37545",
    regimenFiscal: "626",
    usoCfdi: "G03",
    email: "cristhian.valdivia@ejemplo.com",
    telefono: "+5214775907888",
    paqueteNombre: "Plan Pro (40 tickets)",
    precioMensual: 299,
    ticketsIncluidos: 40,
    costoTicketExtra: 5,
    ticketsUsadosMes: 33,
    fechaInicioPlan: "2026-09-30",
    fechaFinPlan: "2026-10-30",
    estadoPlan: "ACTIVO",
    periodoMes: "2026-10",
};
function asegurarDirectorio() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROFILES_FILE) || fs.readFileSync(PROFILES_FILE, "utf-8").trim() === "{}" || !fs.readFileSync(PROFILES_FILE, "utf-8").trim()) {
        const defaultData = {
            "5214773929593@s.whatsapp.net": { ...PERFIL_DEFAULT, ticketsUsadosMes: 33 },
            "16922322174194@lid": { ...PERFIL_DEFAULT, ticketsUsadosMes: 33 },
            "5214775907888@s.whatsapp.net": { ...PERFIL_DEFAULT, ticketsUsadosMes: 33 },
            "524775907888@s.whatsapp.net": { ...PERFIL_DEFAULT, ticketsUsadosMes: 33 },
            "140974432981152@lid": { ...PERFIL_DEFAULT, ticketsUsadosMes: 33 }
        };
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
    }
}
export function normalizarPerfilConPlan(perfil) {
    const esCristhian = perfil.rfc?.toUpperCase() === "VAMC9112056Q2";
    const usadosRaw = Number(perfil.ticketsUsadosMes ?? (esCristhian ? 33 : 0));
    // Si era el valor viejo por defecto (1) de Cristhian sin fechaInicioPlan, sincronizar a 33
    const ticketsUsadosMes = esCristhian && !perfil.fechaInicioPlan && usadosRaw <= 1 ? 33 : usadosRaw;
    return {
        ...perfil,
        paqueteNombre: perfil.paqueteNombre || `Plan Pro (${perfil.ticketsIncluidos ?? 40} tickets)`,
        precioMensual: perfil.precioMensual ?? 299,
        ticketsIncluidos: perfil.ticketsIncluidos ?? 40,
        costoTicketExtra: perfil.costoTicketExtra ?? 5,
        ticketsUsadosMes,
        timbresIngresosIncluidos: perfil.timbresIngresosIncluidos ?? 50,
        timbresIngresosUsadosMes: perfil.timbresIngresosUsadosMes ?? 0,
        timbresIngresosExtraDisponibles: perfil.timbresIngresosExtraDisponibles ?? 0,
        costoTimbreExtra: perfil.costoTimbreExtra ?? 5,
        personalizacion: {
            serie: perfil.personalizacion?.serie || "A",
            ultimoFolio: perfil.personalizacion?.ultimoFolio ?? 100,
            colorTema: perfil.personalizacion?.colorTema || "#0284c7",
            logoPath: perfil.personalizacion?.logoPath,
            pieDePagina: perfil.personalizacion?.pieDePagina || "Gracias por su preferencia",
        },
        fechaInicioPlan: perfil.fechaInicioPlan || (esCristhian ? "2026-09-30" : undefined),
        fechaFinPlan: perfil.fechaFinPlan || (esCristhian ? "2026-10-30" : undefined),
        estadoPlan: perfil.estadoPlan || "ACTIVO",
        avisoBajoSaldoEnviado: perfil.avisoBajoSaldoEnviado ?? false,
        avisoVencimientoEnviadoParaFecha: perfil.avisoVencimientoEnviadoParaFecha,
        renovacionPendienteConfirmacion: perfil.renovacionPendienteConfirmacion ?? false,
    };
}
export function obtenerPerfilFiscal(jid) {
    asegurarDirectorio();
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        const perfiles = JSON.parse(raw);
        if (perfiles[jid]) {
            const norm = normalizarPerfilConPlan(perfiles[jid]);
            // Persistir la migración si aún no tenía fechaInicioPlan
            if (!perfiles[jid].fechaInicioPlan && norm.fechaInicioPlan) {
                perfiles[jid] = norm;
                fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
            }
            return {
                perfil: norm,
                esDefault: false,
            };
        }
    }
    catch (err) {
        console.error("Error leyendo perfiles fiscales:", err);
    }
    return { perfil: normalizarPerfilConPlan(PERFIL_DEFAULT), esDefault: true };
}
export function obtenerTodosLosPerfiles() {
    asegurarDirectorio();
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        const perfiles = JSON.parse(raw);
        const resultado = {};
        for (const [k, v] of Object.entries(perfiles)) {
            resultado[k] = normalizarPerfilConPlan(v);
        }
        return resultado;
    }
    catch {
        return {};
    }
}
export function guardarPerfilFiscal(jid, perfil) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const previo = perfiles[jid];
    const normalizado = normalizarPerfilConPlan({
        ...previo,
        ...perfil,
        rfc: perfil.rfc.trim().toUpperCase(),
        razonSocial: perfil.razonSocial.trim().toUpperCase(),
        codigoPostal: perfil.codigoPostal.trim(),
        regimenFiscal: perfil.regimenFiscal.trim(),
        usoCfdi: perfil.usoCfdi.trim().toUpperCase(),
        email: perfil.email.trim().toLowerCase(),
    });
    perfiles[jid] = normalizado;
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
}
export function registrarConsumoTicket(jid, rfcObjetivo) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const base = normalizarPerfilConPlan(perfiles[jid] || PERFIL_DEFAULT);
    const rfc = (rfcObjetivo || base.rfc).toUpperCase();
    const mesActual = obtenerMesActual();
    const nuevoConteo = (base.ticketsUsadosMes ?? 0) + 1;
    const actualizado = {
        ...base,
        ticketsUsadosMes: nuevoConteo,
        periodoMes: mesActual,
    };
    perfiles[jid] = actualizado;
    // Sincronizar el contador para todas las llaves que pertenezcan al mismo RFC del cliente
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === rfc) {
            perfiles[key] = {
                ...normalizarPerfilConPlan(perfiles[key]),
                ticketsUsadosMes: nuevoConteo,
                periodoMes: mesActual,
            };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return actualizado;
}
export function ajustarConsumoTicket(busqueda, cantidad) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const query = busqueda.trim().toUpperCase();
    const mesActual = obtenerMesActual();
    let matchRfc = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase().includes(query) ||
            p.razonSocial?.toUpperCase().includes(query) ||
            (p.telefono && p.telefono.includes(query)) ||
            key.toUpperCase().includes(query) ||
            key.includes(busqueda.trim())) {
            matchRfc = p.rfc.toUpperCase();
            break;
        }
    }
    if (!matchRfc)
        return null;
    let perfilActualizado = null;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === matchRfc) {
            perfiles[key] = {
                ...normalizarPerfilConPlan(perfiles[key]),
                ticketsUsadosMes: cantidad,
                periodoMes: mesActual,
            };
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado;
}
export const PAQUETES = {
    20: { nombre: "Plan Básico (20 tickets)", tickets: 20, precio: 179 },
    40: { nombre: "Plan Pro (40 tickets)", tickets: 40, precio: 299 },
    80: { nombre: "Plan Negocio (80 tickets)", tickets: 80, precio: 499 },
    100: { nombre: "Plan Empresa (100 tickets)", tickets: 100, precio: 599 },
};
export function sumarDias(fechaStr, dias) {
    const d = new Date(fechaStr + "T12:00:00Z");
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
}
export function activarPlanCliente(busqueda, tickets, claveCep, diasVigencia = 30, opcionesExtra) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const query = busqueda.trim().toUpperCase();
    const hoyStr = new Date().toISOString().slice(0, 10);
    const finStr = sumarDias(hoyStr, diasVigencia);
    const infoPaquete = PAQUETES[tickets] || {
        nombre: opcionesExtra?.paqueteNombre || `Plan Personalizado (${tickets} tickets)`,
        precio: opcionesExtra?.precio ||
            (tickets === 20 ? 179 : tickets === 40 ? 299 : tickets === 80 ? 499 : tickets === 100 ? 599 : tickets * 5),
    };
    let matchRfc = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase().includes(query) ||
            p.razonSocial?.toUpperCase().includes(query) ||
            (p.telefono && p.telefono.includes(query)) ||
            key.toUpperCase().includes(query) ||
            key.includes(busqueda.trim())) {
            matchRfc = p.rfc.toUpperCase();
            break;
        }
    }
    if (!matchRfc)
        return null;
    let perfilActualizado = null;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === matchRfc) {
            perfiles[key] = {
                ...perfiles[key],
                ticketsIncluidos: tickets,
                ticketsUsadosMes: 0,
                timbresIngresosIncluidos: opcionesExtra?.timbresIngresos !== undefined
                    ? opcionesExtra.timbresIngresos
                    : (perfiles[key].timbresIngresosIncluidos ?? 50),
                timbresIngresosUsadosMes: 0,
                precioMensual: opcionesExtra?.precio || infoPaquete.precio,
                paqueteNombre: opcionesExtra?.paqueteNombre || infoPaquete.nombre,
                fechaInicioPlan: hoyStr,
                fechaFinPlan: finStr,
                estadoPlan: "ACTIVO",
                ultimoCepValidado: claveCep || perfiles[key].ultimoCepValidado,
                avisoBajoSaldoEnviado: false,
                avisoVencimientoEnviadoParaFecha: undefined,
            };
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado;
}
export function marcarAvisoBajoSaldo(rfcOrQuery, enviado) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        perfiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
    }
    catch {
        return;
    }
    const query = rfcOrQuery.trim().toUpperCase();
    for (const k of Object.keys(perfiles)) {
        if (perfiles[k]?.rfc?.toUpperCase() === query ||
            perfiles[k]?.telefono?.includes(query) ||
            k.toUpperCase().includes(query) ||
            k.includes(rfcOrQuery.trim())) {
            perfiles[k] = { ...perfiles[k], avisoBajoSaldoEnviado: enviado };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
}
export function marcarAvisoVencimiento(rfcOrQuery, fechaFin) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        perfiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
    }
    catch {
        return;
    }
    const query = rfcOrQuery.trim().toUpperCase();
    for (const k of Object.keys(perfiles)) {
        if (perfiles[k]?.rfc?.toUpperCase() === query ||
            perfiles[k]?.telefono?.includes(query) ||
            k.toUpperCase().includes(query) ||
            k.includes(rfcOrQuery.trim())) {
            perfiles[k] = { ...perfiles[k], avisoVencimientoEnviadoParaFecha: fechaFin };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
}
export function recargarTicketsExtra(busqueda, monto, claveCep) {
    const ticketsAgregados = Math.floor(monto / 5);
    if (ticketsAgregados <= 0)
        return null;
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const query = busqueda.trim().toUpperCase();
    let matchRfc = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase().includes(query) ||
            p.razonSocial?.toUpperCase().includes(query) ||
            (p.telefono && p.telefono.includes(query)) ||
            key.toUpperCase().includes(query) ||
            key.includes(busqueda.trim())) {
            matchRfc = p.rfc.toUpperCase();
            break;
        }
    }
    if (!matchRfc)
        return null;
    let perfilActualizado = null;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === matchRfc) {
            const prev = perfiles[key];
            const nuevosIncluidos = (prev.ticketsIncluidos || 40) + ticketsAgregados;
            perfiles[key] = {
                ...prev,
                ticketsIncluidos: nuevosIncluidos,
                estadoPlan: "ACTIVO",
                avisoBajoSaldoEnviado: false,
                ultimoCepValidado: claveCep || prev.ultimoCepValidado,
            };
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado ? { perfil: perfilActualizado, ticketsAgregados } : null;
}
/**
 * Registra formalmente una solicitud de recarga de folios extras (mínimo 10 folios a $5.00 MXN c/u).
 */
export function registrarSolicitudRecarga(jid, cantidad, tipo = "FOLIOS") {
    asegurarDirectorio();
    let perfiles = {};
    try {
        perfiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
    }
    catch {
        perfiles = {};
    }
    const base = normalizarPerfilConPlan(perfiles[jid] || PERFIL_DEFAULT);
    const rfc = base.rfc.toUpperCase();
    const monto = cantidad * 5;
    const solicitud = {
        tipo,
        cantidad,
        monto,
        fecha: new Date().toISOString(),
    };
    const actualizado = {
        ...base,
        solicitudRecarga: solicitud,
    };
    perfiles[jid] = actualizado;
    for (const k of Object.keys(perfiles)) {
        if (perfiles[k]?.rfc?.toUpperCase() === rfc) {
            perfiles[k] = { ...normalizarPerfilConPlan(perfiles[k]), solicitudRecarga: solicitud };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return { perfil: actualizado, cantidad, monto };
}
/**
 * Acredita folios adicionales ($5.00 MXN c/u, mínimo 10 folios) tras pago liquidado y verificado en Banxico.
 */
export function recargarFoliosExtras(busqueda, monto, tipoPreferido = "AUTO", claveCep) {
    const foliosAgregados = Math.floor(monto / 5);
    if (foliosAgregados <= 0)
        return null;
    asegurarDirectorio();
    let perfiles = {};
    try {
        perfiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
    }
    catch {
        perfiles = {};
    }
    const query = busqueda.trim().toUpperCase();
    let matchRfc = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase().includes(query) ||
            p.razonSocial?.toUpperCase().includes(query) ||
            (p.telefono && p.telefono.includes(query)) ||
            key.toUpperCase().includes(query) ||
            key.includes(busqueda.trim())) {
            matchRfc = p.rfc.toUpperCase();
            break;
        }
    }
    if (!matchRfc)
        return null;
    const base = normalizarPerfilConPlan(Object.values(perfiles).find((p) => p.rfc?.toUpperCase() === matchRfc) || PERFIL_DEFAULT);
    let tipoRecarga = "GASTOS";
    if (tipoPreferido === "INGRESOS") {
        tipoRecarga = "INGRESOS";
    }
    else if (tipoPreferido === "GASTOS") {
        tipoRecarga = "GASTOS";
    }
    else if (base.solicitudRecarga?.tipo === "INGRESOS") {
        tipoRecarga = "INGRESOS";
    }
    else if (base.solicitudRecarga?.tipo === "GASTOS") {
        tipoRecarga = "GASTOS";
    }
    else if ((base.timbresIngresosIncluidos ?? 0) > 0 && (base.ticketsIncluidos ?? 0) === 0) {
        tipoRecarga = "INGRESOS";
    }
    else {
        tipoRecarga = "GASTOS";
    }
    let perfilActualizado = null;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === matchRfc) {
            const prev = normalizarPerfilConPlan(perfiles[key]);
            if (tipoRecarga === "INGRESOS") {
                perfiles[key] = {
                    ...prev,
                    timbresIngresosExtraDisponibles: (prev.timbresIngresosExtraDisponibles ?? 0) + foliosAgregados,
                    estadoPlan: "ACTIVO",
                    ultimoCepValidado: claveCep || prev.ultimoCepValidado,
                    solicitudRecarga: undefined,
                };
            }
            else {
                perfiles[key] = {
                    ...prev,
                    ticketsIncluidos: (prev.ticketsIncluidos || 40) + foliosAgregados,
                    estadoPlan: "ACTIVO",
                    avisoBajoSaldoEnviado: false,
                    ultimoCepValidado: claveCep || prev.ultimoCepValidado,
                    solicitudRecarga: undefined,
                };
            }
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado ? { perfil: perfilActualizado, foliosAgregados, tipoRecarga, monto } : null;
}
export function renovarPlanCliente(busqueda, tickets, claveCep, forzarInicioInmediato = false, opcionesExtra) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        perfiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
    }
    catch {
        perfiles = {};
    }
    const query = busqueda.trim().toUpperCase();
    let matchRfc = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase().includes(query) ||
            p.razonSocial?.toUpperCase().includes(query) ||
            (p.telefono && p.telefono.includes(query)) ||
            key.toUpperCase().includes(query) ||
            key.includes(busqueda.trim())) {
            matchRfc = p.rfc.toUpperCase();
            break;
        }
    }
    if (!matchRfc)
        return null;
    const prevEntry = Object.values(perfiles).find((p) => p.rfc?.toUpperCase() === matchRfc);
    if (!prevEntry)
        return null;
    const base = normalizarPerfilConPlan(prevEntry);
    const hoyStr = new Date().toISOString().slice(0, 10);
    const infoPaquete = PAQUETES[tickets] || {
        nombre: opcionesExtra?.paqueteNombre || `Plan Personalizado (${tickets} tickets)`,
        precio: opcionesExtra?.precio ||
            (tickets === 20 ? 179 : tickets === 40 ? 299 : tickets === 80 ? 499 : tickets === 100 ? 599 : tickets * 5),
    };
    let modo = "EXTENSION_CONCATENADA";
    let fechaInicio = hoyStr;
    let fechaFin = sumarDias(hoyStr, 30);
    let ticketsIncluidos = tickets;
    let ticketsUsadosMes = 0;
    const fechaFinActual = base.fechaFinPlan;
    let diasRestantes = 0;
    if (fechaFinActual) {
        const msHoy = new Date(hoyStr).getTime();
        const msFin = new Date(fechaFinActual).getTime();
        diasRestantes = Math.ceil((msFin - msHoy) / (1000 * 60 * 60 * 24));
    }
    if (fechaFinActual && diasRestantes > 0 && !forzarInicioInmediato) {
        modo = "EXTENSION_CONCATENADA";
        fechaInicio = base.fechaInicioPlan || hoyStr;
        fechaFin = sumarDias(fechaFinActual, 30);
        ticketsIncluidos = (base.ticketsIncluidos || 40) + tickets;
        ticketsUsadosMes = base.ticketsUsadosMes || 0;
    }
    else {
        modo = "INICIO_INMEDIATO";
        fechaInicio = hoyStr;
        fechaFin = sumarDias(hoyStr, 30);
        ticketsIncluidos = tickets;
        ticketsUsadosMes = 0;
    }
    let perfilActualizado = null;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === matchRfc) {
            perfiles[key] = {
                ...perfiles[key],
                paqueteNombre: opcionesExtra?.paqueteNombre || infoPaquete.nombre,
                precioMensual: opcionesExtra?.precio || infoPaquete.precio,
                ticketsIncluidos,
                ticketsUsadosMes,
                timbresIngresosIncluidos: opcionesExtra?.timbresIngresos !== undefined
                    ? opcionesExtra.timbresIngresos
                    : (perfiles[key].timbresIngresosIncluidos ?? 50),
                timbresIngresosUsadosMes: 0,
                fechaInicioPlan: fechaInicio,
                fechaFinPlan: fechaFin,
                estadoPlan: "ACTIVO",
                ultimoCepValidado: claveCep || perfiles[key].ultimoCepValidado,
                avisoBajoSaldoEnviado: false,
                avisoVencimientoEnviadoParaFecha: undefined,
                renovacionPendienteConfirmacion: modo === "EXTENSION_CONCATENADA" && (base.ticketsIncluidos ?? 40) - (base.ticketsUsadosMes ?? 0) <= 0,
            };
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado
        ? {
            perfil: perfilActualizado,
            modo,
            fechaInicio,
            fechaFin,
            ticketsTotal: ticketsIncluidos,
        }
        : null;
}
export function cambiarInicioSuscripcionAHoy(busqueda) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        perfiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
    }
    catch {
        return null;
    }
    const query = busqueda.trim().toUpperCase();
    let matchRfc = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase().includes(query) ||
            p.razonSocial?.toUpperCase().includes(query) ||
            (p.telefono && p.telefono.includes(query)) ||
            key.toUpperCase().includes(query) ||
            key.includes(busqueda.trim())) {
            matchRfc = p.rfc.toUpperCase();
            break;
        }
    }
    if (!matchRfc)
        return null;
    const hoyStr = new Date().toISOString().slice(0, 10);
    const finStr = sumarDias(hoyStr, 30);
    let perfilActualizado = null;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === matchRfc) {
            perfiles[key] = {
                ...perfiles[key],
                fechaInicioPlan: hoyStr,
                fechaFinPlan: finStr,
                ticketsUsadosMes: 0,
                estadoPlan: "ACTIVO",
                avisoBajoSaldoEnviado: false,
                renovacionPendienteConfirmacion: false,
            };
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado;
}
export function verificarEstadoPlan(perfil) {
    const p = normalizarPerfilConPlan(perfil);
    const usados = p.ticketsUsadosMes ?? 0;
    const incluidos = p.ticketsIncluidos ?? 40;
    const restantes = Math.max(0, incluidos - usados);
    if (p.estadoPlan === "PENDIENTE_PAGO") {
        return {
            puedeFacturar: false,
            motivo: "PENDIENTE_PAGO",
            mensaje: "Tu cuenta aún no tiene un plan activo. Por favor selecciona y transfiere tu paquete para comenzar.",
            ticketsRestantes: 0,
        };
    }
    if (p.fechaFinPlan) {
        const hoy = new Date().toISOString().slice(0, 10);
        const msHoy = new Date(hoy).getTime();
        const msFin = new Date(p.fechaFinPlan).getTime();
        const dias = Math.ceil((msFin - msHoy) / (1000 * 60 * 60 * 24));
        if (dias < 0) {
            return {
                puedeFacturar: false,
                motivo: "VENCIDO",
                mensaje: `Tu plan venció el día ${p.fechaFinPlan}. Para renovar tu vigencia por 30 días adicionales, envía tu transferencia a Mercado Pago W.`,
                diasRestantes: 0,
                ticketsRestantes: restantes,
            };
        }
        if (restantes <= 0) {
            return {
                puedeFacturar: false,
                motivo: "AGOTADO",
                mensaje: `Has agotado tus ${incluidos} tickets incluidos en este periodo (vigente hasta el ${p.fechaFinPlan}). Cada ticket adicional cuesta \$5.00 MXN; realiza una transferencia de recarga para continuar.`,
                diasRestantes: dias,
                ticketsRestantes: 0,
            };
        }
        return {
            puedeFacturar: true,
            diasRestantes: dias,
            ticketsRestantes: restantes,
        };
    }
    if (restantes <= 0) {
        return {
            puedeFacturar: false,
            motivo: "AGOTADO",
            mensaje: `Has alcanzado el límite de ${incluidos} tickets de tu paquete.`,
            ticketsRestantes: 0,
        };
    }
    return { puedeFacturar: true, ticketsRestantes: restantes };
}
export function formatearResumenPlan(perfil) {
    const p = normalizarPerfilConPlan(perfil);
    const ticketsUsados = p.ticketsUsadosMes ?? 0;
    const ticketsIncluidos = p.ticketsIncluidos ?? 40;
    const ticketsRestantes = Math.max(0, ticketsIncluidos - ticketsUsados);
    const timbresUsados = p.timbresIngresosUsadosMes ?? 0;
    const timbresIncluidos = p.timbresIngresosIncluidos ?? 50;
    const timbresExtras = p.timbresIngresosExtraDisponibles ?? 0;
    const timbresRestantes = Math.max(0, (timbresIncluidos + timbresExtras) - timbresUsados);
    const precioBase = p.precioMensual ?? 299;
    const nombrePaquete = p.paqueteNombre || `Plan Profesional (\$${precioBase} MXN)`;
    const hoy = new Date().toISOString().slice(0, 10);
    let textoVigencia = "";
    if (p.fechaFinPlan) {
        const msHoy = new Date(hoy).getTime();
        const msFin = new Date(p.fechaFinPlan).getTime();
        const dias = Math.max(0, Math.ceil((msFin - msHoy) / (1000 * 60 * 60 * 24)));
        textoVigencia = `\n📅 *Vigencia de 30 días:* Hasta el ${p.fechaFinPlan} (${dias} día(s) restante(s))`;
    }
    if (p.estadoPlan === "PENDIENTE_PAGO") {
        return `📦 *Estado de Cuenta:* ⚠️ *Pendiente de Activación / Pago*\n• *Paquete:* ${nombrePaquete}\n• *Para activar:* Realiza tu transferencia SPEI y envía aquí el comprobante.`;
    }
    const serie = p.personalizacion?.serie || "A";
    const folioActual = p.personalizacion?.ultimoFolio ?? 100;
    const sigFolio = folioActual + 1;
    const colorTema = p.personalizacion?.colorTema || "#0284c7";
    const tieneLogo = p.personalizacion?.logoPath ? "✅ Cargado" : "⚙️ Estándar";
    return `📊 *${nombrePaquete}*${textoVigencia}

📥 *Módulo Gastos (Tickets Deducibles con RPA):*
• *Tickets usados este mes:* ${ticketsUsados} de ${ticketsIncluidos} (*${ticketsRestantes} disponibles*)
• *Costo ticket extra:* \$${p.costoTicketExtra ?? 5}.00 MXN

📤 *Módulo Ingresos (Facturas Emitidas a Clientes CFDI 4.0):*
• *Timbres emitidos este mes:* ${timbresUsados} de ${timbresIncluidos} ${timbresExtras > 0 ? `(+${timbresExtras} extras)` : ""}
• *Timbres disponibles:* *${timbresRestantes}* ${timbresRestantes === 0 ? "⚠️ *AGOTADOS*" : "disponibles"}
• *Serie y Próximo Folio:* Serie *${serie}* (próximo: *${serie}-${sigFolio}*)
• *Personalización PDF:* Color \`${colorTema}\` | Logo: ${tieneLogo}
• *Costo timbre extra:* \$${p.costoTimbreExtra ?? 3.50} MXN`;
}
export function obtenerListaClientesUnicos() {
    asegurarDirectorio();
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        const perfiles = JSON.parse(raw);
        const grupos = new Map();
        for (const [jid, p] of Object.entries(perfiles)) {
            const norm = normalizarPerfilConPlan(p);
            const rfc = (norm.rfc || "SIN_RFC").toUpperCase();
            if (!grupos.has(rfc)) {
                grupos.set(rfc, { perfil: norm, jids: [jid] });
            }
            else {
                const item = grupos.get(rfc);
                item.jids.push(jid);
                // Mantener la versión más completa si existe
                if (norm.fechaInicioPlan && !item.perfil.fechaInicioPlan) {
                    item.perfil = norm;
                }
            }
        }
        const hoy = new Date().toISOString().slice(0, 10);
        const msHoy = new Date(hoy).getTime();
        const lista = [];
        for (const [, { perfil, jids }] of grupos.entries()) {
            const p = normalizarPerfilConPlan(perfil);
            const incluidos = p.ticketsIncluidos ?? 40;
            const usados = p.ticketsUsadosMes ?? 0;
            const restantes = Math.max(0, incluidos - usados);
            const timbresIncluidos = p.timbresIngresosIncluidos ?? 50;
            const timbresUsados = p.timbresIngresosUsadosMes ?? 0;
            const timbresExtras = p.timbresIngresosExtraDisponibles ?? 0;
            const timbresRestantes = Math.max(0, (timbresIncluidos + timbresExtras) - timbresUsados);
            let dias = 30;
            let estado = p.estadoPlan || "ACTIVO";
            if (p.fechaFinPlan) {
                const msFin = new Date(p.fechaFinPlan).getTime();
                dias = Math.ceil((msFin - msHoy) / (1000 * 60 * 60 * 24));
                if (dias < 0) {
                    estado = "VENCIDO";
                }
                else if (restantes === 0 && timbresRestantes === 0) {
                    estado = "AGOTADO";
                }
            }
            lista.push({
                ...p,
                estadoPlan: estado,
                ticketsRestantes: restantes,
                timbresRestantes,
                diasRestantes: Math.max(0, dias),
                jids,
            });
        }
        return lista;
    }
    catch (err) {
        console.error("Error al obtener lista de clientes únicos:", err);
        return [];
    }
}
export function crearOActualizarCliente(perfil, telefono) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const telLimpio = (telefono || perfil.telefono || "").replace(/\D/g, "");
    const num10 = telLimpio.slice(-10);
    const rfcClean = perfil.rfc.trim().toUpperCase();
    const norm = normalizarPerfilConPlan({
        ...perfil,
        rfc: rfcClean,
        razonSocial: perfil.razonSocial.trim().toUpperCase(),
        codigoPostal: perfil.codigoPostal.trim(),
        regimenFiscal: perfil.regimenFiscal.trim(),
        usoCfdi: (perfil.usoCfdi || "G03").trim().toUpperCase(),
        email: (perfil.email || "").trim().toLowerCase(),
        telefono: num10 ? `+521${num10}` : perfil.telefono,
    });
    // Guardar en todas las llaves existentes con este RFC
    let actualizado = false;
    for (const k of Object.keys(perfiles)) {
        if (perfiles[k]?.rfc?.toUpperCase() === rfcClean) {
            perfiles[k] = { ...perfiles[k], ...norm };
            actualizado = true;
        }
    }
    // Si tiene número de teléfono, asegurar sus llaves WhatsApp
    if (num10) {
        const jid1 = `521${num10}@s.whatsapp.net`;
        const jid2 = `52${num10}@s.whatsapp.net`;
        perfiles[jid1] = { ...(perfiles[jid1] || {}), ...norm };
        perfiles[jid2] = { ...(perfiles[jid2] || {}), ...norm };
        actualizado = true;
    }
    // Si no tenía ninguna llave, crear una por defecto con su RFC
    if (!actualizado) {
        perfiles[`cliente_${rfcClean}`] = norm;
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return norm;
}
export function eliminarClientePorRfc(rfc) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        return false;
    }
    const target = rfc.trim().toUpperCase();
    let eliminado = false;
    for (const k of Object.keys(perfiles)) {
        if (perfiles[k]?.rfc?.toUpperCase() === target) {
            delete perfiles[k];
            eliminado = true;
        }
    }
    if (eliminado) {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    }
    return eliminado;
}
/**
 * Registra el consumo de un timbre fiscal de ingreso emitido a un cliente
 * e incrementa el último folio consecutivo en su personalización.
 */
export function registrarConsumoTimbreIngreso(jid, rfcObjetivo) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const base = normalizarPerfilConPlan(perfiles[jid] || PERFIL_DEFAULT);
    const rfc = (rfcObjetivo || base.rfc).toUpperCase();
    const mesActual = obtenerMesActual();
    const nuevoConteo = (base.timbresIngresosUsadosMes ?? 0) + 1;
    const nuevoFolio = (base.personalizacion?.ultimoFolio ?? 100) + 1;
    const nuevaPersonalizacion = {
        ...base.personalizacion,
        ultimoFolio: nuevoFolio,
    };
    const actualizado = {
        ...base,
        timbresIngresosUsadosMes: nuevoConteo,
        periodoMes: mesActual,
        personalizacion: nuevaPersonalizacion,
    };
    perfiles[jid] = actualizado;
    // Sincronizar el contador y folio para todas las llaves que pertenezcan al mismo RFC
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === rfc) {
            perfiles[key] = {
                ...normalizarPerfilConPlan(perfiles[key]),
                timbresIngresosUsadosMes: nuevoConteo,
                periodoMes: mesActual,
                personalizacion: nuevaPersonalizacion,
            };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return actualizado;
}
/**
 * Consulta la serie y el próximo folio consecutivo sin incrementar en disco.
 */
export function obtenerProximoFolioIngreso(jid) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const base = normalizarPerfilConPlan(perfiles[jid] || PERFIL_DEFAULT);
    const serie = base.personalizacion?.serie || "A";
    const folioActual = base.personalizacion?.ultimoFolio ?? 100;
    return { serie, folio: folioActual + 1 };
}
/**
 * Obtiene el siguiente folio consecutivo para la serie de facturación del cliente
 * e incrementa el contador automáticamente.
 */
export function obtenerSiguienteFolioIngreso(jid) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const base = normalizarPerfilConPlan(perfiles[jid] || PERFIL_DEFAULT);
    const rfc = base.rfc.toUpperCase();
    const serie = base.personalizacion?.serie || "A";
    const folioActual = base.personalizacion?.ultimoFolio ?? 100;
    const siguienteFolio = folioActual + 1;
    // Actualizar en todos los perfiles asociados a este RFC
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === rfc) {
            const p = normalizarPerfilConPlan(perfiles[key]);
            perfiles[key] = {
                ...p,
                personalizacion: {
                    ...p.personalizacion,
                    serie,
                    ultimoFolio: siguienteFolio,
                },
            };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return { serie, folio: siguienteFolio };
}
/**
 * Actualiza la personalización visual (logo, colorTema, serie, pie de página) del cliente.
 */
export function actualizarPersonalizacionCliente(jid, cambios) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const base = normalizarPerfilConPlan(perfiles[jid] || PERFIL_DEFAULT);
    const rfc = base.rfc.toUpperCase();
    const personalizacionNueva = {
        ...base.personalizacion,
        ...cambios,
    };
    const actualizado = {
        ...base,
        personalizacion: personalizacionNueva,
    };
    perfiles[jid] = actualizado;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === rfc) {
            perfiles[key] = {
                ...normalizarPerfilConPlan(perfiles[key]),
                personalizacion: personalizacionNueva,
            };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return actualizado;
}
/**
 * Recarga timbres de ingreso a un cliente (por RFC o teléfono).
 */
export function recargarTimbresIngreso(busqueda, cantidad) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        return null;
    }
    const query = busqueda.trim().toUpperCase();
    let rfcEncontrado = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase() === query ||
            key.includes(query) ||
            p.telefono?.includes(query)) {
            rfcEncontrado = p.rfc.toUpperCase();
            break;
        }
    }
    if (!rfcEncontrado)
        return null;
    let perfilActualizado = null;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === rfcEncontrado) {
            const p = normalizarPerfilConPlan(perfiles[key]);
            const prevExtras = p.timbresIngresosExtraDisponibles ?? 0;
            perfiles[key] = {
                ...p,
                timbresIngresosExtraDisponibles: prevExtras + cantidad,
            };
            perfilActualizado = perfiles[key];
        }
    }
    if (perfilActualizado) {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    }
    return perfilActualizado;
}
/**
 * Guarda y activa la Bóveda CSD del cliente para emisión de facturas oficiales.
 */
export function guardarCsdCliente(jid, csd) {
    asegurarDirectorio();
    let perfiles = {};
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        perfiles = JSON.parse(raw);
    }
    catch {
        perfiles = {};
    }
    const base = normalizarPerfilConPlan(perfiles[jid] || PERFIL_DEFAULT);
    const rfc = base.rfc.toUpperCase();
    const actualizado = {
        ...base,
        csd,
    };
    perfiles[jid] = actualizado;
    for (const key of Object.keys(perfiles)) {
        if (perfiles[key]?.rfc?.toUpperCase() === rfc) {
            perfiles[key] = {
                ...normalizarPerfilConPlan(perfiles[key]),
                csd,
            };
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return actualizado;
}
