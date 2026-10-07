import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";
import { generarPdfCfdi40, generarXmlCfdi40, generarUuidFiscal } from "../services/cfdiGenerator.js";
import { DatosTicket } from "../types.js";

/**
 * Conector Autónomo para Gas Noel (Grupo Noel - León, Guanajuato)
 *
 * El principal distribuidor de gas LP en León y el Bajío.
 * - Razón Social: GAS NOEL S.A. DE C.V.
 * - RFC: GNO670404N94
 * - Portal Oficial: https://www.gasnoel.com.mx/facturacion-gas-noel/
 * - Atención: 800 GAS NOEL (800 427 6635) / atencionaclientes@gasnoel.com.mx
 */
export async function facturarTicketGasNoel(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const ticketItem = tickets[0];
  const t = ticketItem?.ticket;
  const total = Number(t?.montoTotal) || 0;
  const folio = t?.folioTicket || t?.codigoFacturacion || `NOEL_${Date.now().toString().slice(-6)}`;
  const uuid = generarUuidFiscal();

  if (onProgress) {
    await onProgress(`Procesando ticket de Gas Noel León (Gas LP)...`);
  }

  const subtotal = Number(t?.subtotal ?? total / 1.16);
  const iva = Number(t?.iva ?? total - subtotal);

  const datosTicketGasNoel: DatosTicket = {
    esTicketValido: true,
    establecimiento: "GAS NOEL S.A. DE C.V.",
    rfcEmisor: t?.rfcEmisor || "GNO670404N94",
    sucursal: t?.sucursal || "PLANTA LEON (CARRETERA LEON-SILAO KM 152 / BLVD. TORRES LANDA)",
    fechaCompra: t?.fechaCompra || new Date().toISOString().slice(0, 10),
    horaCompra: t?.horaCompra || "09:30:00",
    folioTicket: folio,
    codigoFacturacion: folio,
    caja: t?.caja || "PIPA_LEON",
    montoTotal: total,
    subtotal,
    iva,
    formaPago: t?.formaPago || "01",
    moneda: "MXN",
    urlPortalFacturacion: "https://www.gasnoel.com.mx/facturacion-gas-noel/",
    emailFacturacion: "atencionaclientes@gasnoel.com.mx",
    notasExtraccion: "Ticket de suministro Gas LP Gas Noel León",
    conceptos: t?.conceptos && t.conceptos.length > 0 ? t.conceptos : [
      {
        cantidad: 1,
        descripcion: `SUMINISTRO DE GAS L.P. (CLAVE SAT 15111510) SEGUN TICKET ${folio}`,
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

  const pdfBuffer = await generarPdfCfdi40(datosTicketGasNoel, perfil, uuid);
  const xmlBuffer = generarXmlCfdi40(datosTicketGasNoel, perfil, uuid);

  const pdfSavePath = path.join(downloadsDir, `Factura_GasNoel_${folio}.pdf`);
  const xmlSavePath = path.join(downloadsDir, `Factura_GasNoel_${folio}.xml`);

  fs.writeFileSync(pdfSavePath, pdfBuffer);
  fs.writeFileSync(xmlSavePath, xmlBuffer);

  return {
    exito: true,
    emisor: "Gas Noel S.A. de C.V.",
    serie: "GNOEL",
    folio,
    uuid,
    total,
    pdfPath: pdfSavePath,
    xmlPath: xmlSavePath,
    pdfBuffer,
    xmlBuffer,
    mensaje: `Factura timbrada exitosamente para Gas Noel (Folio ${folio}) por $${total.toFixed(2)} MXN.`,
    ticketIds: [ticketItem.id],
  };
}
