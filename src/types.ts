export interface PersonalizacionFactura {
  serie?: string; // Default "A"
  ultimoFolio?: number; // Consecutivo numérico
  colorTema?: string; // Hex color ej. "#0284c7"
  logoPath?: string; // Ruta al logo en PNG/JPG
  pieDePagina?: string; // Mensaje comercial o bancario opcional
}

export interface BovedaCsd {
  cerFile?: string; // Nombre del archivo .cer en certs/
  keyFile?: string; // Nombre del archivo .key en certs/
  csdPassword?: string;
  fechaVencimientoCsd?: string;
  noCertificado?: string;
}

export interface DatosFiscales {
  rfc: string;
  razonSocial: string;
  codigoPostal: string;
  regimenFiscal: string; // Clave SAT ej. "601", "612", "626"
  usoCfdi: string; // Clave SAT ej. "G03" (Gastos en general)
  email: string;
  telefono?: string;
  precioMensual?: number; // $179, $299, $499, $599 MXN
  paqueteNombre?: string; // "Básico (20)", "Pro (40)", "Negocio (80)", "Empresa (100)"
  periodoMes?: string; // Ej. "2026-10"
  estadoPlan?: "ACTIVO" | "PENDIENTE_PAGO" | "VENCIDO" | "AGOTADO" | "PRUEBA_GRATIS";
  fechaInicioPlan?: string; // YYYY-MM-DD
  fechaFinPlan?: string; // YYYY-MM-DD

  // 1. Bolsa de Gastos (Tickets deducibles con RPA)
  ticketsIncluidos?: number; // Ej. 40 tickets/mes
  ticketsUsadosMes?: number; // Contador del mes
  costoTicketExtra?: number; // $5 MXN por ticket adicional

  // 2. Bolsa de Ingresos (Facturación emitida a clientes con PAC Finkok)
  timbresIngresosIncluidos?: number; // Ej. 50 timbres/mes
  timbresIngresosUsadosMes?: number; // Contador de emitidas
  timbresIngresosExtraDisponibles?: number; // Bolsa prepagada acumulada
  costoTimbreExtra?: number; // $5.00 MXN por timbre adicional

  // 3. Personalización de Factura (PDF/Branding de cada cliente)
  personalizacion?: PersonalizacionFactura;

  // 4. Bóveda CSD del Emisor
  csd?: BovedaCsd;

  // Control Administrativo y Recargas
  ultimoCepValidado?: string; // Clave de rastreo Banxico
  avisoBajoSaldoEnviado?: boolean; // Alerta de 5 folios restantes enviada
  avisoVencimientoEnviadoParaFecha?: string; // Fecha de fin para la que ya se envió el aviso de 2 días
  renovacionPendienteConfirmacion?: boolean; // Si renovó con 0 folios y puede optar por inicio inmediato
  numerosAdicionales?: string[]; // Otros WhatsApps autorizados para este RFC
  subcuentasAutorizadas?: Array<{
    celular: string; // Formato numérico ej. "5214771234567"
    nombre: string; // Ej. "Chofer Juan", "Ventas Roberto"
    jid: string; // "5214771234567@s.whatsapp.net"
    fechaAlta: string; // ISO
  }>;
  solicitudRecarga?: {
    tipo: "GASTOS" | "INGRESOS" | "FOLIOS";
    cantidad: number;
    monto: number;
    fecha: string;
  };
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
