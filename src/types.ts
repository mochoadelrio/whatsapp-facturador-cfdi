export interface DatosFiscales {
  rfc: string;
  razonSocial: string;
  codigoPostal: string;
  regimenFiscal: string; // Clave SAT ej. "601", "612", "626"
  usoCfdi: string; // Clave SAT ej. "G03" (Gastos en general)
  email: string;
  telefono?: string;
  precioMensual?: number; // $179, $299, $499, $599 MXN
  ticketsIncluidos?: number; // 20, 40, 80, 100 tickets/mes
  costoTicketExtra?: number; // $5 MXN por ticket adicional
  ticketsUsadosMes?: number; // Contador del mes actual
  periodoMes?: string; // Ej. "2026-10"
  estadoPlan?: "ACTIVO" | "PENDIENTE_PAGO" | "VENCIDO" | "AGOTADO";
  fechaInicioPlan?: string; // YYYY-MM-DD
  fechaFinPlan?: string; // YYYY-MM-DD
  paqueteNombre?: string; // "Básico (20)", "Pro (40)", "Negocio (80)", "Empresa (100)"
  ultimoCepValidado?: string; // Clave de rastreo Banxico
}

export interface DatosComprobantePago {
  esComprobanteValido: boolean;
  monto: number;
  claveRastreo?: string;
  numeroReferencia?: string;
  fecha?: string;
  bancoEmisor?: string;
  bancoReceptor?: string;
  cuentaBeneficiaria?: string;
  beneficiario?: string;
  concepto?: string;
}

export interface ConceptoTicket {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

export interface DatosTicket {
  esTicketValido: boolean;
  establecimiento: string;
  rfcEmisor: string | null;
  sucursal: string | null;
  fechaCompra: string | null; // YYYY-MM-DD
  horaCompra: string | null;
  folioTicket: string | null;
  codigoFacturacion: string | null; // ID de facturación, código web, referencia o # de transacción
  caja: string | null;
  subtotal: number | null;
  iva: number | null;
  montoTotal: number;
  moneda: string;
  formaPago: string; // Clave SAT: "01" Efectivo, "04" Tarjeta de crédito, "28" Tarjeta de débito, "03" Transferencia
  ultimosDigitosTarjeta?: string | null; // Últimos 4 dígitos si fue pago con tarjeta
  urlPortalFacturacion: string | null;
  emailFacturacion: string | null;
  conceptos: ConceptoTicket[];
  notasExtraccion: string | null;
}

export interface ResultadoFacturacion {
  exito: boolean;
  modo: "portal_real" | "simulacion_cfdi";
  mensaje: string;
  uuid?: string;
  pdfBuffer?: Buffer;
  xmlBuffer?: Buffer;
  capturaPortalBuffer?: Buffer;
  nombreArchivoBase?: string;
}
