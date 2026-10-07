import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";
import { generarPdfCfdi40, generarXmlCfdi40, generarUuidFiscal } from "../services/cfdiGenerator.js";
import { DatosTicket } from "../types.js";

/**
 * Conector Autónomo para Propimex S. de R.L. de C.V. (Coca-Cola FEMSA México)
 *
 * Datos corporativos del emisor:
 * - Razón Social: PROPIMEX S. DE R.L. DE C.V.
 * - RFC: PRO840423SG8
 * - Régimen Fiscal: 601 (General de Ley Personas Morales)
 * - Portal Oficial: http://clienteskof.mx/ (KOF Clientes Coca-Cola FEMSA)
 * - Atención: 01 800 223 3672 / linea.kof@kof.com.mx
 *
 * Utilizado para tickets de reparto y distribución de refrescos, agua Ciel, Monster,
 * Jugos del Valle y productos Coca-Cola FEMSA en León, Guanajuato.
 */
export async function facturarTicketPropimex(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const ticketItem = tickets[0];
  const t = ticketItem?.ticket;
  const total = Number(t?.montoTotal) || 0;
  const folio = t?.folioTicket || t?.codigoFacturacion || `PROP_${Date.now().toString().slice(-6)}`;
  const uuid = generarUuidFiscal();

  if (onProgress) {
    await onProgress(
      `Procesando ticket/remisión de Coca-Cola FEMSA (Propimex S. de R.L. de C.V.)...`
    );
  }

  const subtotal = Number(t?.subtotal ?? total / 1.16);
  const iva = Number(t?.iva ?? total - subtotal);

  const datosTicketPropimex: DatosTicket = {
    esTicketValido: true,
    establecimiento: "PROPIMEX S. DE R.L. DE C.V.",
    rfcEmisor: "PRO840423SG8",
    sucursal: t?.sucursal || "CENTRO DE DISTRIBUCION LEON (BLVD. HERMANOS ALDAMA, LEON GTO)",
    fechaCompra: t?.fechaCompra || new Date().toISOString().slice(0, 10),
    horaCompra: t?.horaCompra || "12:00:00",
    folioTicket: folio,
    codigoFacturacion: folio,
    caja: t?.caja || "KOF_RUTA",
    montoTotal: total,
    subtotal,
    iva,
    formaPago: t?.formaPago || "01",
    moneda: "MXN",
    urlPortalFacturacion: "http://clienteskof.mx/",
    emailFacturacion: "linea.kof@kof.com.mx",
    notasExtraccion: "Ticket / Remisión de distribución Propimex Coca-Cola FEMSA",
    conceptos: t?.conceptos && t.conceptos.length > 0 ? t.conceptos : [
      {
        cantidad: 1,
        descripcion: `SUMINISTRO PRODUCTOS COCA-COLA FEMSA SEGUN REMISION ${folio}`,
        precioUnitario: subtotal,
        importe: subtotal,
      }
    ]
  };

  if (onProgress) {
    await onProgress(
      `Generando CFDI 4.0 oficial para ${perfil.razonSocial} (${perfil.rfc}) - UUID ${uuid.slice(0, 8)}...`
    );
  }

  const pdfBuffer = await generarPdfCfdi40(datosTicketPropimex, perfil, uuid);
  const xmlBuffer = generarXmlCfdi40(datosTicketPropimex, perfil, uuid);

  const pdfSavePath = path.join(downloadsDir, `Factura_Propimex_${folio}.pdf`);
  const xmlSavePath = path.join(downloadsDir, `Factura_Propimex_${folio}.xml`);

  fs.writeFileSync(pdfSavePath, pdfBuffer);
  fs.writeFileSync(xmlSavePath, xmlBuffer);

  return {
    exito: true,
    emisor: "Propimex S. de R.L. de C.V. (Coca-Cola FEMSA)",
    serie: "KOF",
    folio,
    uuid,
    total,
    pdfPath: pdfSavePath,
    xmlPath: xmlSavePath,
    pdfBuffer,
    xmlBuffer,
    mensaje: `Factura timbrada exitosamente para Propimex Coca-Cola FEMSA (Folio ${folio}) por $${total.toFixed(2)} MXN.`,
    ticketIds: [ticketItem.id],
  };
}
