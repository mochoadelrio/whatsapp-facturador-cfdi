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
    ticketsUsadosMes: 16,
    fechaInicioPlan: "2026-09-30",
    fechaFinPlan: "2026-10-30",
    estadoPlan: "ACTIVO",
    periodoMes: "2026-09",
};
function asegurarDirectorio() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROFILES_FILE)) {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify({}, null, 2), "utf-8");
    }
}
export function normalizarPerfilConPlan(perfil) {
    const esCristhian = perfil.rfc?.toUpperCase() === "VAMC9112056Q2";
    const usadosRaw = Number(perfil.ticketsUsadosMes ?? (esCristhian ? 16 : 0));
    // Si era el valor viejo por defecto (1) de Cristhian sin fechaInicioPlan, sincronizar a 16
    const ticketsUsadosMes = esCristhian && !perfil.fechaInicioPlan && usadosRaw <= 1 ? 16 : usadosRaw;
    return {
        ...perfil,
        paqueteNombre: perfil.paqueteNombre || `Plan Pro (${perfil.ticketsIncluidos ?? 40} tickets)`,
        precioMensual: perfil.precioMensual ?? 299,
        ticketsIncluidos: perfil.ticketsIncluidos ?? 40,
        costoTicketExtra: perfil.costoTicketExtra ?? 5,
        ticketsUsadosMes,
        fechaInicioPlan: perfil.fechaInicioPlan || (esCristhian ? "2026-09-30" : undefined),
        fechaFinPlan: perfil.fechaFinPlan || (esCristhian ? "2026-10-30" : undefined),
        estadoPlan: perfil.estadoPlan || "ACTIVO",
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
            key.includes(query)) {
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
export function activarPlanCliente(busqueda, tickets, claveCep, diasVigencia = 30) {
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
        nombre: `Plan Personalizado (${tickets} tickets)`,
        precio: tickets === 20 ? 179 : tickets === 40 ? 299 : tickets === 80 ? 499 : tickets === 100 ? 599 : tickets * 5,
    };
    let matchRfc = null;
    for (const [key, p] of Object.entries(perfiles)) {
        if (p.rfc?.toUpperCase().includes(query) ||
            p.razonSocial?.toUpperCase().includes(query) ||
            (p.telefono && p.telefono.includes(query)) ||
            key.includes(query)) {
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
                precioMensual: infoPaquete.precio,
                paqueteNombre: infoPaquete.nombre,
                fechaInicioPlan: hoyStr,
                fechaFinPlan: finStr,
                estadoPlan: "ACTIVO",
                ultimoCepValidado: claveCep || perfiles[key].ultimoCepValidado,
            };
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado;
}
export function recargarTicketsExtra(busqueda, monto) {
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
            key.includes(query)) {
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
            };
            perfilActualizado = perfiles[key];
        }
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(perfiles, null, 2), "utf-8");
    return perfilActualizado ? { perfil: perfilActualizado, ticketsAgregados } : null;
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
    const usados = p.ticketsUsadosMes ?? 0;
    const incluidos = p.ticketsIncluidos ?? 40;
    const precioBase = p.precioMensual ?? 299;
    const costoExtra = p.costoTicketExtra ?? 5;
    const nombrePaquete = p.paqueteNombre || `Plan (${incluidos} tickets)`;
    const restantes = Math.max(0, incluidos - usados);
    const hoy = new Date().toISOString().slice(0, 10);
    let textoVigencia = "";
    if (p.fechaFinPlan) {
        const msHoy = new Date(hoy).getTime();
        const msFin = new Date(p.fechaFinPlan).getTime();
        const dias = Math.max(0, Math.ceil((msFin - msHoy) / (1000 * 60 * 60 * 24)));
        textoVigencia = `\n• *Vigencia de 30 días:* Hasta el ${p.fechaFinPlan} (${dias} día(s) restante(s))`;
    }
    if (p.estadoPlan === "PENDIENTE_PAGO") {
        return `📦 *Estado de Cuenta:* ⚠️ *Pendiente de Activación / Pago*\n• *Paquete seleccionado:* ${nombrePaquete} (\$${precioBase} MXN)\n• *Para activar:* Realiza tu transferencia SPEI a Mercado Pago W y envía aquí la captura.`;
    }
    if (restantes === 0) {
        return `📊 *${nombrePaquete} (\$${precioBase} MXN):*\n• *Tickets facturados:* ${usados} de ${incluidos} (0 disponibles) ⚠️ *FOLIOS AGOTADOS*${textoVigencia}\n• *Recarga de folios:* Cada ticket adicional cuesta \$${costoExtra}.00 MXN. Realiza tu transferencia de recarga para continuar.`;
    }
    return `📊 *${nombrePaquete} (\$${precioBase} MXN):*\n• *Tickets facturados:* ${usados} de ${incluidos} (*${restantes} disponibles*)${textoVigencia}\n• *Tickets adicionales:* \$${costoExtra}.00 MXN c/u (con recarga prepagada).`;
}
