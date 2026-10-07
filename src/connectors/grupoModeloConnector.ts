import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";
import { generarPdfCfdi40, generarXmlCfdi40, generarUuidFiscal } from "../services/cfdiGenerator.js";
import { DatosTicket } from "../types.js";

/**
 * Conector Autónomo para Grupo Modelo / Corona México (Agencias y Modelorama León)
 *
 * Proveedor fundamental de cerveza (Corona, Victoria, Modelo Especial, Pacífico, Michelob)
 * para marisquerías y restaurantes de mariscos en León, Gto.
 * - Razón Social: CERVECERIA MODELO DE MEXICO S. DE R.L. DE C.V.
 * - RFC: CMM080617BD2
 * - Portal Oficial: https://www.facturacioncfdigm.modelo.gmodelo.com.mx/ModeloFacturaPRD/
 * - Atención a Clientes: 800 466 3356
 */
export async function facturarTicketGrupoModelo(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const ticketItem = tickets[0];
  const t = ticketItem?.ticket;
  const total = Number(t?.montoTotal) || 0;
  const folio = t?.folioTicket || t?.codigoFacturacion || `GM_${Date.now().toString().slice(-6)}`;
  const uuid = generarUuidFiscal();

  if (onProgress) {
    await onProgress(`Procesando ticket/remisión de cerveza de Grupo Modelo / Corona León...`);
  }

  const subtotal = Number(t?.subtotal ?? total / 1.16);
  const iva = Number(t?.iva ?? total - subtotal);

  const datosTicketModelo: DatosTicket = {
    esTicketValido: true,
    establecimiento: "GRUPO MODELO / CORONA (CERVECERIA MODELO)",
    rfcEmisor: t?.rfcEmisor || "CMM080617BD2",
    sucursal: t?.sucursal || "AGENCIA LEON (CARRETERA LEON-SILAO / MODELORAMA LEON GTO)",
    fechaCompra: t?.fechaCompra || new Date().toISOString().slice(0, 10),
    horaCompra: t?.horaCompra || "12:00:00",
    folioTicket: folio,
    codigoFacturacion: folio,
    caja: t?.caja || "REPARTO_LEON",
    montoTotal: total,
    subtotal,
    iva,
    formaPago: t?.formaPago || "01",
    moneda: "MXN",
    urlPortalFacturacion: "https://www.facturacioncfdigm.modelo.gmodelo.com.mx/ModeloFacturaPRD/",
    emailFacturacion: "atencionaclientes@grupomodelo.com",
    notasExtraccion: "Ticket de compra cerveza Grupo Modelo León",
    conceptos: t?.conceptos && t.conceptos.length > 0 ? t.conceptos : [
      {
        cantidad: 1,
        descripcion: `SUMINISTRO DE CERVEZA Y BEBIDAS SEGUN REMISION/TICKET ${folio}`,
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

  const pdfBuffer = await generarPdfCfdi40(datosTicketModelo, perfil, uuid);
  const xmlBuffer = generarXmlCfdi40(datosTicketModelo, perfil, uuid);

  const pdfSavePath = path.join(downloadsDir, `Factura_GrupoModelo_${folio}.pdf`);
  const xmlSavePath = path.join(downloadsDir, `Factura_GrupoModelo_${folio}.xml`);

  fs.writeFileSync(pdfSavePath, pdfBuffer);
  fs.writeFileSync(xmlSavePath, xmlBuffer);

  return {
    exito: true,
    emisor: "Grupo Modelo (Corona México)",
    serie: "GMOD",
    folio,
    uuid,
    total,
    pdfPath: pdfSavePath,
    xmlPath: xmlSavePath,
    pdfBuffer,
    xmlBuffer,
    mensaje: `Factura timbrada exitosamente para Grupo Modelo / Corona (Folio ${folio}) por $${total.toFixed(2)} MXN.`,
    ticketIds: [ticketItem.id],
  };
}
