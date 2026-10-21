import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export interface ConceptoFactura {
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  claveProdServ?: string;
  claveUnidad?: string;
  unidad?: string;
  tasaIva?: number; // default 0.16
}

export interface ReceptorFactura {
  rfc: string;
  nombre: string;
  codigoPostal: string;
  regimenFiscal: string;
  usoCfdi?: string;
}

export interface SolicitudEmision {
  receptor: ReceptorFactura;
  conceptos: ConceptoFactura[];
  formaPago?: string; // "01", "03", "04", etc. Default "03"
  metodoPago?: "PUE" | "PPD"; // Default "PUE"
  serie?: string;
  folio?: string;
}

export interface ResultadoEmision {
  exito: boolean;
  uuid?: string;
  serie?: string;
  folio?: string;
  fechaTimbrado?: string;
  subtotal: number;
  iva: number;
  total: number;
  emisorRfc: string;
  receptorRfc: string;
  xmlTimbrado?: string;
  xmlPath?: string;
  pdfPath?: string;
  pdfBuffer?: Buffer;
  xmlBuffer?: Buffer;
  error?: string;
  incidencias?: any[];
}

// Configuración de Finkok y Certificados
const FINKOK_USERNAME = process.env.FINKOK_USERNAME || "m.ochoa.delrio@gmail.com";
const FINKOK_PASSWORD = process.env.FINKOK_PASSWORD || "Modr1988-+";
const FINKOK_ENV = (process.env.FINKOK_ENV || "DEMO").toUpperCase();

export interface EmisorConfig {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  lugarExpedicion: string;
  cerPath: string;
  keyPath: string;
  csdPassword: string;
  ambiente: "DEMO" | "PROD";
}

const CONFIG_PATH = path.resolve(process.cwd(), "data", "emisor_config.json");

export function obtenerEmisorConfig(): EmisorConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      const cerPath = path.resolve(process.cwd(), "certs", data.cerFile || `${data.rfc}.cer`);
      const keyPath = path.resolve(process.cwd(), "certs", data.keyFile || `${data.rfc}.key`);
      if (fs.existsSync(cerPath) && fs.existsSync(keyPath) && data.csdPassword) {
        return {
          rfc: data.rfc,
          nombre: data.nombre,
          regimenFiscal: data.regimenFiscal || "626",
          lugarExpedicion: data.lugarExpedicion || "37545",
          cerPath,
          keyPath,
          csdPassword: data.csdPassword,
          ambiente: data.ambiente === "PROD" ? "PROD" : "DEMO",
        };
      }
    }
  } catch (err) {
    console.warn("Aviso al leer emisor_config.json:", err);
  }

  // Por defecto usar certificados de prueba
  return {
    rfc: "EKU9003173C9",
    nombre: "ESCUELA KEMPER URGATE",
    regimenFiscal: "601",
    lugarExpedicion: "20928",
    cerPath: path.resolve(process.cwd(), "certs", "EKU9003173C9.cer"),
    keyPath: path.resolve(process.cwd(), "certs", "EKU9003173C9.key"),
    csdPassword: "12345678a",
    ambiente: FINKOK_ENV === "PROD" || FINKOK_ENV === "PRODUCCION" ? "PROD" : "DEMO",
  };
}

export function guardarEmisorConfig(config: {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  lugarExpedicion: string;
  cerFile: string;
  keyFile: string;
  csdPassword: string;
  ambiente?: "DEMO" | "PROD";
}): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function obtenerEndpointSoap(ambiente: "DEMO" | "PROD"): string {
  return ambiente === "PROD"
    ? "https://facturacion.finkok.com/servicios/soap/stamp"
    : "https://demo-facturacion.finkok.com/servicios/soap/stamp";
}

/**
 * Limpia la Razón Social conforme a las reglas estrictas de CFDI 4.0:
 * En mayúsculas y sin régimen societario (S.A. de C.V., S. de R.L., etc.)
 */
export function limpiarRazonSocialCfdi40(nombre: string, rfc: string): string {
  if (!nombre) return "";
  let clean = nombre.toUpperCase().trim();
  if (rfc.toUpperCase() === "XAXX010101000") return "PUBLICO EN GENERAL";
  if (rfc.toUpperCase() === "XEXX010101000") return "EXTRANJERO";

  // Eliminar terminaciones societarias comunes
  const suffixes = [
    /\s+S\.?A\.?\s+DE\s+C\.?V\.?$/i,
    /\s+S\.?A\.?P\.?I\.?\s+DE\s+C\.?V\.?$/i,
    /\s+S\.?A\.?P\.?I\.?$/i,
    /\s+S\.?A\.?$/i,
    /\s+S\.?C\.?$/i,
    /\s+S\.?C\.?L\.?$/i,
    /\s+S\.?C\.?S\.?$/i,
    /\s+S\.? DE\s+R\.?L\.?\s+DE\s+C\.?V\.?$/i,
    /\s+S\.? DE\s+R\.?L\.?$/i,
    /\s+S\.?A\.?S\.?\s+DE\s+C\.?V\.?$/i,
    /\s+S\.?A\.?S\.?$/i,
  ];

  for (const regex of suffixes) {
    clean = clean.replace(regex, "").trim();
  }
  return clean.replace(/[,.]/g, "").trim();
}

/**
 * Carga el Certificado y Llave Privada en formato DER/PEM
 */
function cargarCsd(emisor: EmisorConfig) {
  if (!fs.existsSync(emisor.cerPath) || !fs.existsSync(emisor.keyPath)) {
    throw new Error(`Archivos CSD no encontrados en ${emisor.cerPath} o ${emisor.keyPath}`);
  }
  const cerDer = fs.readFileSync(emisor.cerPath);
  const keyDer = fs.readFileSync(emisor.keyPath);

  const x509 = new crypto.X509Certificate(cerDer);
  const serialHex = x509.serialNumber;
  let noCertificado = Buffer.from(serialHex, "hex").toString("ascii");
  if (noCertificado.length !== 20) {
    noCertificado = "30001000000500003416";
  }

  const privateKey = crypto.createPrivateKey({
    key: keyDer,
    format: "der",
    type: "pkcs8",
    passphrase: emisor.csdPassword,
  });

  const certificadoB64 = cerDer.toString("base64");
  return { privateKey, noCertificado, certificadoB64, cerDer };
}

/**
 * Construye la Cadena Original para CFDI 4.0 conforme a la secuencia del Anexo 20
 */
function generarCadenaOriginal40(params: {
  version: string;
  serie: string;
  folio: string;
  fecha: string;
  formaPago: string;
  noCertificado: string;
  subtotal: string;
  moneda: string;
  total: string;
  tipoDeComprobante: string;
  exportacion: string;
  metodoPago: string;
  lugarExpedicion: string;
  emisorRfc: string;
  emisorNombre: string;
  emisorRegimen: string;
  receptorRfc: string;
  receptorNombre: string;
  receptorCp: string;
  receptorRegimen: string;
  receptorUsoCfdi: string;
  conceptos: Array<{
    claveProdServ: string;
    cantidad: string;
    claveUnidad: string;
    unidad: string;
    descripcion: string;
    valorUnitario: string;
    importe: string;
    objetoImp: string;
    baseIva: string;
    impuestoIva: string;
    tipoFactorIva: string;
    tasaIva: string;
    importeIva: string;
  }>;
  totalIva: string;
}): string {
  const campos: string[] = [
    params.version,
    params.serie,
    params.folio,
    params.fecha,
    params.formaPago,
    params.noCertificado,
    params.subtotal,
    params.moneda,
    params.total,
    params.tipoDeComprobante,
    params.exportacion,
    params.metodoPago,
    params.lugarExpedicion,
    params.emisorRfc,
    params.emisorNombre,
    params.emisorRegimen,
    params.receptorRfc,
    params.receptorNombre,
    params.receptorCp,
    params.receptorRegimen,
    params.receptorUsoCfdi,
  ];

  for (const c of params.conceptos) {
    campos.push(
      c.claveProdServ,
      c.cantidad,
      c.claveUnidad,
      c.unidad,
      c.descripcion,
      c.valorUnitario,
      c.importe,
      c.objetoImp,
      c.baseIva,
      c.impuestoIva,
      c.tipoFactorIva,
      c.tasaIva,
      c.importeIva
    );
  }

  // Traslado Global: Base | Impuesto | TipoFactor | TasaOCuota | Importe | TotalImpuestosTrasladados
  campos.push(
    params.subtotal,
    "002",
    "Tasa",
    "0.160000",
    params.totalIva,
    params.totalIva
  );
  return `||${campos.join("|")}||`;
}

/**
 * Genera el XML sellado listo para enviar a Finkok
 */
function construirXmlSellado(
  solicitud: SolicitudEmision,
  csd: ReturnType<typeof cargarCsd>,
  emisor: EmisorConfig
) {
  const serie = solicitud.serie || "WA";
  const folio = solicitud.folio || Math.floor(10000 + Math.random() * 90000).toString();

  // Fecha en formato oficial SAT (America/Mexico_City) restando 2 minutos para evitar error de desfase con el PAC
  const d = new Date(Date.now() - 2 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const fechaIso = `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;

  let subtotalNum = 0;
  let totalIvaNum = 0;

  const conceptosFormateados = solicitud.conceptos.map((c) => {
    const cant = c.cantidad || 1;
    const vu = Number(c.valorUnitario || 0);
    const imp = cant * vu;
    const tasa = c.tasaIva ?? 0.16;
    const ivaCon = imp * tasa;

    subtotalNum += imp;
    totalIvaNum += ivaCon;

    return {
      claveProdServ: c.claveProdServ || "84111506",
      cantidad: cant.toFixed(2),
      claveUnidad: c.claveUnidad || "E48",
      unidad: c.unidad || "Servicio",
      descripcion: c.descripcion.replace(/[<>&"']/g, "").trim(),
      valorUnitario: vu.toFixed(2),
      importe: imp.toFixed(2),
      objetoImp: "02",
      baseIva: imp.toFixed(2),
      impuestoIva: "002",
      tipoFactorIva: "Tasa",
      tasaIva: tasa.toFixed(6),
      importeIva: ivaCon.toFixed(2),
    };
  });

  const totalNum = subtotalNum + totalIvaNum;
  const subtotalStr = subtotalNum.toFixed(2);
  const totalIvaStr = totalIvaNum.toFixed(2);
  const totalStr = totalNum.toFixed(2);

  const emisorNombreLimpio = limpiarRazonSocialCfdi40(
    emisor.nombre,
    emisor.rfc
  );
  const receptorNombreLimpio = limpiarRazonSocialCfdi40(
    solicitud.receptor.nombre,
    solicitud.receptor.rfc
  );

  const cadenaOriginal = generarCadenaOriginal40({
    version: "4.0",
    serie,
    folio,
    fecha: fechaIso,
    formaPago: solicitud.formaPago || "03",
    noCertificado: csd.noCertificado,
    subtotal: subtotalStr,
    moneda: "MXN",
    total: totalStr,
    tipoDeComprobante: "I",
    exportacion: "01",
    metodoPago: solicitud.metodoPago || "PUE",
    lugarExpedicion: emisor.lugarExpedicion,
    emisorRfc: emisor.rfc,
    emisorNombre: emisorNombreLimpio,
    emisorRegimen: emisor.regimenFiscal,
    receptorRfc: solicitud.receptor.rfc.toUpperCase().trim(),
    receptorNombre: receptorNombreLimpio,
    receptorCp: solicitud.receptor.codigoPostal.trim(),
    receptorRegimen: solicitud.receptor.regimenFiscal.trim(),
    receptorUsoCfdi: solicitud.receptor.usoCfdi || "G03",
    conceptos: conceptosFormateados,
    totalIva: totalIvaStr,
  });

  // Firmar con RSA-SHA256
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(cadenaOriginal, "utf-8");
  const selloB64 = signer.sign(csd.privateKey, "base64");

  // Construir XML final
  const conceptosXml = conceptosFormateados
    .map(
      (c) => `    <cfdi:Concepto ClaveProdServ="${c.claveProdServ}" Cantidad="${c.cantidad}" ClaveUnidad="${c.claveUnidad}" Unidad="${c.unidad}" Descripcion="${c.descripcion}" ValorUnitario="${c.valorUnitario}" Importe="${c.importe}" ObjetoImp="${c.objetoImp}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${c.baseIva}" Impuesto="${c.impuestoIva}" TipoFactor="${c.tipoFactorIva}" TasaOCuota="${c.tasaIva}" Importe="${c.importeIva}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`
    )
    .join("\n");

  const xmlSinTimbrar = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="4.0" Serie="${serie}" Folio="${folio}" Fecha="${fechaIso}" Sello="${selloB64}" FormaPago="${solicitud.formaPago || "03"}" NoCertificado="${csd.noCertificado}" Certificado="${csd.certificadoB64}" SubTotal="${subtotalStr}" Moneda="MXN" Total="${totalStr}" TipoDeComprobante="I" Exportacion="01" MetodoPago="${solicitud.metodoPago || "PUE"}" LugarExpedicion="${emisor.lugarExpedicion}" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd">
  <cfdi:Emisor Rfc="${emisor.rfc}" Nombre="${emisorNombreLimpio}" RegimenFiscal="${emisor.regimenFiscal}"/>
  <cfdi:Receptor Rfc="${solicitud.receptor.rfc.toUpperCase().trim()}" Nombre="${receptorNombreLimpio}" DomicilioFiscalReceptor="${solicitud.receptor.codigoPostal.trim()}" RegimenFiscalReceptor="${solicitud.receptor.regimenFiscal.trim()}" UsoCFDI="${solicitud.receptor.usoCfdi || "G03"}"/>
  <cfdi:Conceptos>
${conceptosXml}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${totalIvaStr}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotalStr}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${totalIvaStr}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>`;

  return {
    xmlSinTimbrar,
    serie,
    folio,
    subtotal: subtotalNum,
    iva: totalIvaNum,
    total: totalNum,
    cadenaOriginal,
    selloB64,
  };
}

/**
 * Consume el Web Service SOAP de Finkok para timbrar el XML
 */
async function timbrarXmlSoap(xmlSinTimbrar: string, endpointSoap: string): Promise<{
  exito: boolean;
  uuid?: string;
  xmlTimbrado?: string;
  fechaTimbrado?: string;
  selloSat?: string;
  noCertificadoSat?: string;
  error?: string;
  incidencias?: any[];
}> {
  const xmlB64 = Buffer.from(xmlSinTimbrar, "utf-8").toString("base64");
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:stam="http://facturacion.finkok.com/stamp">
   <soapenv:Header/>
   <soapenv:Body>
      <stam:stamp>
         <stam:xml>${xmlB64}</stam:xml>
         <stam:username>${FINKOK_USERNAME}</stam:username>
         <stam:password>${FINKOK_PASSWORD}</stam:password>
      </stam:stamp>
   </soapenv:Body>
</soapenv:Envelope>`;

  const resp = await fetch(endpointSoap, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "stamp",
    },
    body: soapEnvelope,
  });

  const responseText = await resp.text();

  // Extraer valores del XML devuelto
  const uuidMatch = responseText.match(/<(?:\w+:)?UUID>([^<]+)<\/(?:\w+:)?UUID>/i);
  const xmlMatch = responseText.match(/<(?:\w+:)?xml>([^<]+)<\/(?:\w+:)?xml>/i);
  const fechaMatch = responseText.match(/<(?:\w+:)?Fecha>([^<]+)<\/(?:\w+:)?Fecha>/i);
  const sealMatch = responseText.match(/<(?:\w+:)?SatSeal>([^<]+)<\/(?:\w+:)?SatSeal>/i);
  const noCertMatch = responseText.match(/<(?:\w+:)?NoCertificadoSAT>([^<]+)<\/(?:\w+:)?NoCertificadoSAT>/i);
  const faultMatch = responseText.match(/<faultstring>([^<]+)<\/faultstring>/i);

  const uuid = uuidMatch ? uuidMatch[1].trim() : undefined;
  let xmlTimbrado = xmlMatch ? xmlMatch[1].trim() : undefined;

  // Si xmlTimbrado viene con entidades escapadas (&lt; &gt;)
  if (xmlTimbrado && xmlTimbrado.includes("&lt;")) {
    xmlTimbrado = xmlTimbrado
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  if (uuid && xmlTimbrado) {
    return {
      exito: true,
      uuid,
      xmlTimbrado,
      fechaTimbrado: fechaMatch ? fechaMatch[1].trim() : undefined,
      selloSat: sealMatch ? sealMatch[1].trim() : undefined,
      noCertificadoSat: noCertMatch ? noCertMatch[1].trim() : undefined,
    };
  }

  // Extraer incidencias si hubo error
  const incidencias: string[] = [];
  const incRegex = /<(?:\w+:)?MensajeIncidencia>([^<]+)<\/(?:\w+:)?MensajeIncidencia>/gi;
  let m: RegExpExecArray | null;
  while ((m = incRegex.exec(responseText)) !== null) {
    incidencias.push(m[1].trim());
  }

  const errorMsg =
    incidencias.join(" | ") ||
    (faultMatch ? faultMatch[1].trim() : "Error desconocido al timbrar en Finkok");

  return {
    exito: false,
    error: errorMsg,
    incidencias,
  };
}

/**
 * Genera la representación impresa en PDF con PDFKit y Código QR CBB del SAT
 */
async function generarPdfFacturaIngreso(params: {
  uuid: string;
  serie: string;
  folio: string;
  fechaTimbrado: string;
  selloSat: string;
  noCertificadoSat: string;
  emisor: {
    rfc: string;
    nombre: string;
    regimenFiscal: string;
    lugarExpedicion: string;
  };
  receptor: ReceptorFactura;
  conceptos: ConceptoFactura[];
  subtotal: number;
  iva: number;
  total: number;
  formaPago: string;
  metodoPago: string;
}): Promise<Buffer> {
  const qrUrl = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${params.uuid}&re=${params.emisor.rfc}&rr=${params.receptor.rfc}&tt=${params.total.toFixed(2)}&fe=${params.selloSat.slice(-8)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 120 });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 40 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Encabezado
    doc
      .fontSize(16)
      .fillColor("#0f172a")
      .text("FACTURA ELECTRÓNICA (CFDI 4.0)", { align: "right" });
    doc
      .fontSize(9)
      .fillColor("#475569")
      .text(`Folio Fiscal (UUID): ${params.uuid}`, { align: "right" })
      .text(`Serie y Folio: ${params.serie} - ${params.folio}`, { align: "right" })
      .text(`Fecha Timbrado: ${params.fechaTimbrado}`, { align: "right" });

    doc.moveDown(0.5);

    // Datos del Emisor
    doc
      .fontSize(13)
      .fillColor("#0284c7")
      .text(params.emisor.nombre, 40, 50);
    doc
      .fontSize(9)
      .fillColor("#334155")
      .text(`RFC: ${params.emisor.rfc}   |   Régimen Fiscal: ${params.emisor.regimenFiscal}`)
      .text(`Lugar de Expedición: ${params.emisor.lugarExpedicion}   |   Efecto: I - Ingreso   |   Moneda: MXN`);

    doc.moveDown(1);

    // Caja del Receptor
    const topReceptor = doc.y;
    doc
      .rect(40, topReceptor, 532, 60)
      .fillAndStroke("#f8fafc", "#cbd5e1");

    doc
      .fillColor("#0f172a")
      .fontSize(10)
      .text("DATOS DEL CLIENTE / RECEPTOR", 50, topReceptor + 8);
    doc
      .fontSize(9)
      .fillColor("#334155")
      .text(`Razón Social: ${params.receptor.nombre.toUpperCase()}`, 50, topReceptor + 22)
      .text(
        `RFC: ${params.receptor.rfc.toUpperCase()}   |   C.P.: ${params.receptor.codigoPostal}   |   Régimen: ${params.receptor.regimenFiscal}   |   Uso CFDI: ${params.receptor.usoCfdi || "G03"}`,
        50,
        topReceptor + 36
      );

    doc.y = topReceptor + 75;

    // Tabla de Conceptos
    doc
      .rect(40, doc.y, 532, 20)
      .fill("#0284c7");

    const tableY = doc.y + 5;
    doc
      .fillColor("#ffffff")
      .fontSize(9)
      .text("CANT.", 50, tableY)
      .text("CLAVE", 90, tableY)
      .text("DESCRIPCIÓN DEL CONCEPTO", 150, tableY)
      .text("P. UNITARIO", 410, tableY, { width: 70, align: "right" })
      .text("IMPORTE", 490, tableY, { width: 70, align: "right" });

    doc.y = tableY + 20;
    doc.fillColor("#1e293b");

    for (const c of params.conceptos) {
      const cant = c.cantidad || 1;
      const vu = c.valorUnitario || 0;
      const imp = cant * vu;
      const currY = doc.y;

      doc
        .fontSize(8.5)
        .text(cant.toString(), 50, currY)
        .text(c.claveProdServ || "84111506", 90, currY)
        .text(c.descripcion, 150, currY, { width: 250 })
        .text(`$${vu.toFixed(2)}`, 410, currY, { width: 70, align: "right" })
        .text(`$${imp.toFixed(2)}`, 490, currY, { width: 70, align: "right" });

      doc.y = currY + 18;
    }

    doc.moveDown(0.8);

    // Totales
    const totalesY = doc.y;
    doc
      .fontSize(9)
      .text("Subtotal:", 380, totalesY)
      .text(`$${params.subtotal.toFixed(2)} MXN`, 470, totalesY, { width: 90, align: "right" })
      .text("IVA Trasladado (16%):", 380, totalesY + 15)
      .text(`$${params.iva.toFixed(2)} MXN`, 470, totalesY + 15, { width: 90, align: "right" })
      .fontSize(11)
      .fillColor("#0284c7")
      .text("TOTAL:", 380, totalesY + 32)
      .text(`$${params.total.toFixed(2)} MXN`, 470, totalesY + 32, { width: 90, align: "right" });

    doc.fillColor("#334155");

    // QR y Cadenas Fiscales
    const bottomY = totalesY + 65;
    doc.image(qrBuffer, 40, bottomY, { width: 95 });

    doc
      .fontSize(7.5)
      .text("CADENA ORIGINAL DEL COMPLEMENTO DE CERTIFICACIÓN DIGITAL DEL SAT:", 145, bottomY)
      .fillColor("#64748b")
      .text(`||1.1|${params.uuid}|${params.fechaTimbrado}|CVD110412TF6|${params.selloSat.slice(0, 40)}...|${params.noCertificadoSat}||`, 145, bottomY + 12, { width: 425 })
      .fillColor("#334155")
      .text("SELLO DIGITAL DEL SAT:", 145, bottomY + 35)
      .fillColor("#64748b")
      .text(params.selloSat, 145, bottomY + 45, { width: 425 });

    doc.end();
  });
}

/**
 * Función Maestra: Construye, Sella, Timbra en Finkok y Genera PDF y XML
 */
export async function emitirFacturaIngreso(
  solicitud: SolicitudEmision
): Promise<ResultadoEmision> {
  try {
    const emisor = obtenerEmisorConfig();
    const csd = cargarCsd(emisor);
    const buildResult = construirXmlSellado(solicitud, csd, emisor);
    const soapEndpoint = obtenerEndpointSoap(emisor.ambiente);

    console.log(`📡 [Finkok] Enviando CFDI 4.0 a timbrar (${soapEndpoint})... Emisor: ${emisor.rfc}`);
    const timbrado = await timbrarXmlSoap(buildResult.xmlSinTimbrar, soapEndpoint);

    if (!timbrado.exito || !timbrado.uuid || !timbrado.xmlTimbrado) {
      return {
        exito: false,
        error: timbrado.error || "No se obtuvo UUID ni XML timbrado de Finkok",
        incidencias: timbrado.incidencias,
        subtotal: buildResult.subtotal,
        iva: buildResult.iva,
        total: buildResult.total,
        emisorRfc: emisor.rfc,
        receptorRfc: solicitud.receptor.rfc,
      };
    }

    console.log(`✅ [Finkok] Timbrado Exitoso! UUID: ${timbrado.uuid}`);

    // Guardar archivos
    const outputDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const xmlPath = path.join(outputDir, `Factura_Ingreso_${timbrado.uuid}.xml`);
    const pdfPath = path.join(outputDir, `Factura_Ingreso_${timbrado.uuid}.pdf`);

    fs.writeFileSync(xmlPath, timbrado.xmlTimbrado, "utf-8");

    const pdfBuffer = await generarPdfFacturaIngreso({
      uuid: timbrado.uuid,
      serie: buildResult.serie,
      folio: buildResult.folio,
      fechaTimbrado: timbrado.fechaTimbrado || new Date().toISOString(),
      selloSat: timbrado.selloSat || "SELLO_SAT_DEMO",
      noCertificadoSat: timbrado.noCertificadoSat || "30001000000500003456",
      emisor: {
        rfc: emisor.rfc,
        nombre: emisor.nombre,
        regimenFiscal: emisor.regimenFiscal,
        lugarExpedicion: emisor.lugarExpedicion,
      },
      receptor: solicitud.receptor,
      conceptos: solicitud.conceptos,
      subtotal: buildResult.subtotal,
      iva: buildResult.iva,
      total: buildResult.total,
      formaPago: solicitud.formaPago || "03",
      metodoPago: solicitud.metodoPago || "PUE",
    });

    fs.writeFileSync(pdfPath, pdfBuffer);

    return {
      exito: true,
      uuid: timbrado.uuid,
      serie: buildResult.serie,
      folio: buildResult.folio,
      fechaTimbrado: timbrado.fechaTimbrado,
      subtotal: buildResult.subtotal,
      iva: buildResult.iva,
      total: buildResult.total,
      emisorRfc: emisor.rfc,
      receptorRfc: solicitud.receptor.rfc,
      xmlTimbrado: timbrado.xmlTimbrado,
      xmlPath,
      pdfPath,
      pdfBuffer,
      xmlBuffer: Buffer.from(timbrado.xmlTimbrado, "utf-8"),
    };
  } catch (err: any) {
    console.error("❌ Error en emitirFacturaIngreso:", err);
    return {
      exito: false,
      error: err?.message || String(err),
      subtotal: 0,
      iva: 0,
      total: 0,
      emisorRfc: "ERROR",
      receptorRfc: solicitud.receptor.rfc,
    };
  }
}

/**
 * Analiza texto libre en lenguaje natural de WhatsApp y extrae la intención y parámetros de facturación.
 * Soporta frases cotidianas: "factura para mi cliente", "emite una factura de ingresos", "hazme una factura", etc.
 */
export function extraerPeticionFacturaTexto(texto: string): {
  tieneIntencion: boolean;
  esDemo: boolean;
  necesitaDatos: boolean;
  cliente: string;
  rfc: string;
  monto: number;
  concepto: string;
} | null {
  const t = texto.toLowerCase().trim();

  // 1. Detectar intención
  const triggers = [
    "/emitir",
    "/facturar",
    "/factura-ingreso",
    "/facturar-cliente",
    "factura para mi cliente",
    "factura a mi cliente",
    "emite una factura de ingresos",
    "emite una factura",
    "emite factura de ingresos",
    "emite factura",
    "hazme una factura",
    "hazme factura",
    "creame una factura",
    "crear factura",
    "generame una factura",
    "generar factura",
    "factura de ingresos",
    "factura de ingreso",
    "factura de venta",
    "nueva factura",
    "quiero facturar",
    "facturarle a",
    "facturar a",
    "emitir factura",
  ];

  const tieneIntencion = triggers.some((tr) => t.includes(tr));
  if (!tieneIntencion) return null;

  const esDemo =
    t.includes("demo") ||
    t.includes("prueba") ||
    t === "/emitir-demo" ||
    t === "/facturar-demo";

  // Limpiar prefijos de comando para analizar el contenido real
  let s = texto.trim();
  const prefixes = [
    /^hazme\s+una?\s+factura\s+(?:de\s+ingresos?\s+)?(?:para\s+mi\s+cliente|a\s+mi\s+cliente|para|a)?/i,
    /^emite\s+una?\s+factura\s+(?:de\s+ingresos?\s+)?(?:para\s+mi\s+cliente|a\s+mi\s+cliente|para|a)?/i,
    /^factura\s+(?:de\s+ingresos?\s+)?(?:para\s+mi\s+cliente|a\s+mi\s+cliente|para|a)?/i,
    /^nueva\s+factura\s+(?:para|a)?/i,
    /^\/emitir\s+(?:para|a)?/i,
    /^\/facturar\s+(?:para|a)?/i,
  ];
  for (const p of prefixes) {
    if (p.test(s)) {
      s = s.replace(p, "").trim();
      break;
    }
  }

  // 2. Extraer RFC si viene
  let rfc: string | null = null;
  const matchRfc = s.match(/\b([A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3})\b/i);
  if (matchRfc) {
    rfc = matchRfc[1].toUpperCase();
  }

  // 3. Extraer Monto
  let monto: number | null = null;
  const sSinRfc = rfc ? s.replace(rfc, "RFC_TOKEN") : s;
  const matchMonto = sSinRfc.match(
    /(?:\$|\bde\s+\$|\bpor\s+\$|\bde\s+|\bpor\s+)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i
  );
  if (matchMonto) {
    const val = Number(matchMonto[1].replace(/,/g, ""));
    if (val > 0) monto = val;
  }

  // 4. Extraer Cliente
  let cliente: string | null = null;
  const clienteChunk = sSinRfc
    .split(/(?:\s+(?:de|por)\s+\$|\s+\$|\s+por\s+[0-9]|\s+de\s+[0-9])/i)[0]
    .trim();
  if (
    clienteChunk &&
    clienteChunk.length > 2 &&
    !clienteChunk.match(/^(?:demo|prueba|ingresos?|mi\s+cliente|venta)$/i)
  ) {
    cliente = clienteChunk.replace(/^(?:para|a|cliente:?)\s+/i, "").trim().toUpperCase();
  } else if (rfc) {
    cliente = rfc;
  }

  // 5. Extraer Concepto
  let concepto: string | null = null;
  const matchConcepto = sSinRfc.match(/(?:por concepto de|por|concepto:?)\s+([^$\n]+)/i);
  if (matchConcepto && matchConcepto[1].trim()) {
    let raw = matchConcepto[1].trim();
    raw = raw.replace(
      /^(?:\$?[0-9,.]+\s*(?:pesos|mxn|\+?\s*iva)?\s*(?:de\s+|por\s+)?)/i,
      ""
    );
    if (raw.trim().length > 1) concepto = raw.trim().toUpperCase();
  }

  const necesitaDatos = !esDemo && (monto === null || (!cliente && !rfc));

  return {
    tieneIntencion: true,
    esDemo,
    necesitaDatos,
    cliente: cliente || "INMOBILIARIA CVA",
    rfc: rfc || "ICV060329BY0",
    monto: monto || 1500,
    concepto: concepto || "SERVICIOS PROFESIONALES DE FACTURACION CFDI 4.0",
  };
}
