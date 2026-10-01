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
    precioMensual: 299,
    ticketsIncluidos: 40,
    costoTicketExtra: 5,
    ticketsUsadosMes: 1,
    periodoMes: obtenerMesActual(),
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
    const mesActual = obtenerMesActual();
    const periodoMes = perfil.periodoMes || mesActual;
    const ticketsUsadosMes = periodoMes === mesActual ? Number(perfil.ticketsUsadosMes ?? 0) : 0;
    return {
        ...perfil,
        precioMensual: perfil.precioMensual ?? 299,
        ticketsIncluidos: perfil.ticketsIncluidos ?? 40,
        costoTicketExtra: perfil.costoTicketExtra ?? 5,
        ticketsUsadosMes,
        periodoMes: mesActual,
    };
}
export function obtenerPerfilFiscal(jid) {
    asegurarDirectorio();
    try {
        const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
        const perfiles = JSON.parse(raw);
        if (perfiles[jid]) {
            return {
                perfil: normalizarPerfilConPlan(perfiles[jid]),
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
export function formatearResumenPlan(perfil) {
    const p = normalizarPerfilConPlan(perfil);
    const usados = p.ticketsUsadosMes ?? 0;
    const incluidos = p.ticketsIncluidos ?? 40;
    const precioBase = p.precioMensual ?? 299;
    const costoExtra = p.costoTicketExtra ?? 5;
    const restantes = Math.max(0, incluidos - usados);
    const extras = Math.max(0, usados - incluidos);
    const cargoExtra = extras * costoExtra;
    const totalMes = precioBase + cargoExtra;
    if (extras > 0) {
        return `📊 *Tu Plan Mensual ($${precioBase} MXN / ${incluidos} tickets):*\n• *Tickets facturados este mes:* ${usados} / ${incluidos}\n• *Tickets adicionales:* ${extras} (+$${cargoExtra} MXN a $${costoExtra} c/u)\n• *Total acumulado del mes:* $${totalMes} MXN`;
    }
    return `📊 *Tu Plan Mensual ($${precioBase} MXN / ${incluidos} tickets):*\n• *Tickets facturados este mes:* ${usados} de ${incluidos} (${restantes} disponibles)\n• *Ticket adicional (después de ${incluidos}):* $${costoExtra}.00 MXN c/u`;
}
