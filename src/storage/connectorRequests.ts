import * as fs from "fs";
import * as path from "path";

export interface SolicitudConector {
  id: string;
  comercio: string;
  rfcEmisor?: string | null;
  urlPortal?: string | null;
  fechaSolicitud: string;
  solicitadoPorJid?: string;
  clienteNombre?: string;
  totalTicket?: number;
  folioTicket?: string | null;
  estado: "PENDIENTE" | "EN_DESARROLLO" | "INSTALADO";
  conteo: number;
}

const FILE_PATH = path.resolve(process.cwd(), "data", "solicitudes_conectores.json");

function leerSolicitudes(): SolicitudConector[] {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function guardarSolicitudes(items: SolicitudConector[]): void {
  try {
    const dir = path.dirname(FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("[Storage] Error guardando solicitudes de conectores:", err);
  }
}

/**
 * Registra o incrementa la solicitud de un conector nuevo desde un ticket no soportado.
 */
export function registrarSolicitudConector(params: {
  comercio: string;
  rfcEmisor?: string | null;
  urlPortal?: string | null;
  solicitadoPorJid?: string;
  clienteNombre?: string;
  totalTicket?: number;
  folioTicket?: string | null;
}): SolicitudConector {
  const items = leerSolicitudes();
  const nombreLimpio = (params.comercio || "Comercio Desconocido").trim().toUpperCase();

  const existente = items.find(
    (s) =>
      s.comercio.toUpperCase() === nombreLimpio ||
      (params.rfcEmisor && s.rfcEmisor && s.rfcEmisor.toUpperCase() === params.rfcEmisor.toUpperCase())
  );

  if (existente) {
    existente.conteo = (existente.conteo || 1) + 1;
    existente.fechaSolicitud = new Date().toISOString();
    if (params.urlPortal && !existente.urlPortal) existente.urlPortal = params.urlPortal;
    if (params.rfcEmisor && !existente.rfcEmisor) existente.rfcEmisor = params.rfcEmisor;
    guardarSolicitudes(items);
    return existente;
  }

  const nueva: SolicitudConector = {
    id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    comercio: nombreLimpio,
    rfcEmisor: params.rfcEmisor || null,
    urlPortal: params.urlPortal || null,
    fechaSolicitud: new Date().toISOString(),
    solicitadoPorJid: params.solicitadoPorJid,
    clienteNombre: params.clienteNombre,
    totalTicket: params.totalTicket,
    folioTicket: params.folioTicket,
    estado: "PENDIENTE",
    conteo: 1,
  };

  items.unshift(nueva);
  guardarSolicitudes(items);
  return nueva;
}

export function obtenerSolicitudesConectores(): SolicitudConector[] {
  return leerSolicitudes();
}

export function actualizarEstadoSolicitudConector(
  id: string,
  estado: "PENDIENTE" | "EN_DESARROLLO" | "INSTALADO"
): boolean {
  const items = leerSolicitudes();
  const index = items.findIndex((s) => s.id === id);
  if (index === -1) return false;
  items[index].estado = estado;
  guardarSolicitudes(items);
  return true;
}
