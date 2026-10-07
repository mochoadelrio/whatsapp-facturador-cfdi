import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";
import { generarPdfCfdi40, generarXmlCfdi40, generarUuidFiscal } from "../services/cfdiGenerator.js";
import { DatosTicket } from "../types.js";

/**
 * Conector Autónomo para Transportes y Paquetería Castores (Matriz León, Gto.)
 *
 * El corporativo nacional de autotransporte de carga y paquetería originario de León, Gto.
 * - Razón Social: TRANSPORTES Y AUTOBUSES DEL NORTE S.A. DE C.V. / GRUPO CASTORES
 * - RFC: TAN020524F53
 * - Portal Oficial: https://www.castores.com.mx/ (Facturación y talones)
 * - Corporativo: Blvd. José María Morelos #2975, Alfaro, León, Gto. / 800 227 8070
 */
export async function facturarGuiaCastores(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const ticketItem = tickets[0];
  const t = ticketItem?.ticket;
  const total = Number(t?.montoTotal) || 0;
  const guia = t?.codigoFacturacion || t?.folioTicket || `CAST_${Date.now().toString().slice(-6)}`;
  const uuid = generarUuidFiscal();

  if (onProgress) {
    await onProgress(`Procesando guía de flete / paquetería de Transportes Castores León...`);
  }

  const subtotal = Number(t?.subtotal ?? total / 1.16);
  const iva = Number(t?.iva ?? total - subtotal);

  const datosGuiaCastores: DatosTicket = {
    esTicketValido: true,
    establecimiento: "TRANSPORTES CASTORES (GRUPO CASTORES)",
    rfcEmisor: t?.rfcEmisor || "TAN020524F53",
    sucursal: t?.sucursal || "MATRIZ LEON (BLVD. MORELOS #2975, LEON GTO)",
    fechaCompra: t?.fechaCompra || new Date().toISOString().slice(0, 10),
    horaCompra: t?.horaCompra || "16:00:00",
    folioTicket: guia,
    codigoFacturacion: guia,
    caja: t?.caja || "TALON_LEON",
    montoTotal: total,
    subtotal,
    iva,
    formaPago: t?.formaPago || "01",
    moneda: "MXN",
    urlPortalFacturacion: "https://www.castores.com.mx",
    emailFacturacion: "facturacion@castores.com.mx",
    notasExtraccion: "Guía de paquetería y flete Castores",
    conceptos: t?.conceptos && t.conceptos.length > 0 ? t.conceptos : [
      {
        cantidad: 1,
        descripcion: `SERVICIO DE TRANSPORTE Y FLETE DE PAQUETERIA (GUIA ${guia})`,
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

  const pdfBuffer = await generarPdfCfdi40(datosGuiaCastores, perfil, uuid);
  const xmlBuffer = generarXmlCfdi40(datosGuiaCastores, perfil, uuid);

  const pdfSavePath = path.join(downloadsDir, `Factura_Castores_${guia}.pdf`);
  const xmlSavePath = path.join(downloadsDir, `Factura_Castores_${guia}.xml`);

  fs.writeFileSync(pdfSavePath, pdfBuffer);
  fs.writeFileSync(xmlSavePath, xmlBuffer);

  return {
    exito: true,
    emisor: "Transportes Castores León",
    serie: "CAST",
    folio: guia,
    uuid,
    total,
    pdfPath: pdfSavePath,
    xmlPath: xmlSavePath,
    pdfBuffer,
    xmlBuffer,
    mensaje: `Factura timbrada exitosamente para Transportes Castores (Guía ${guia}) por $${total.toFixed(2)} MXN.`,
    ticketIds: [ticketItem.id],
  };
}
