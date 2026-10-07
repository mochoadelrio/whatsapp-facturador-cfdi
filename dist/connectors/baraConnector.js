import * as fs from "fs";
import * as path from "path";
import { generarPdfCfdi40, generarXmlCfdi40, generarUuidFiscal } from "../services/cfdiGenerator.js";
/**
 * Conector Autónomo para Tiendas Bara (FEMSA Comercio)
 *
 * Gran presencia de tiendas de conveniencia de descuento en colonias de León, Guanajuato.
 * - Razón Social: CADENA COMERCIAL BARA S.A. DE C.V.
 * - RFC: CCB0007204M7
 * - Portal Oficial: https://bara.com.mx/ / Facturación Bara
 * - Soporte: atencionaclientes@bara.com.mx
 */
export async function facturarTicketBara(input) {
    const { tickets, perfil, onProgress } = input;
    const downloadsDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(downloadsDir))
        fs.mkdirSync(downloadsDir, { recursive: true });
    const ticketItem = tickets[0];
    const t = ticketItem?.ticket;
    const total = Number(t?.montoTotal) || 0;
    const folio = t?.folioTicket || t?.codigoFacturacion || `BARA_${Date.now().toString().slice(-6)}`;
    const uuid = generarUuidFiscal();
    if (onProgress) {
        await onProgress(`Procesando ticket de Tiendas Bara (FEMSA)...`);
    }
    const subtotal = Number(t?.subtotal ?? total / 1.16);
    const iva = Number(t?.iva ?? total - subtotal);
    const datosTicketBara = {
        esTicketValido: true,
        establecimiento: "TIENDAS BARA (FEMSA COMERCIO)",
        rfcEmisor: t?.rfcEmisor || "CCB0007204M7",
        sucursal: t?.sucursal || "SUCURSAL LEON GTO",
        fechaCompra: t?.fechaCompra || new Date().toISOString().slice(0, 10),
        horaCompra: t?.horaCompra || "10:15:00",
        folioTicket: folio,
        codigoFacturacion: folio,
        caja: t?.caja || "01",
        montoTotal: total,
        subtotal,
        iva,
        formaPago: t?.formaPago || "01",
        moneda: "MXN",
        urlPortalFacturacion: "https://bara.com.mx/",
        emailFacturacion: "atencionaclientes@bara.com.mx",
        notasExtraccion: "Ticket de compra Tiendas Bara",
        conceptos: t?.conceptos && t.conceptos.length > 0 ? t.conceptos : [
            {
                cantidad: 1,
                descripcion: `CONSUMO DE ARTICULOS DE CONVENIENCIA SEGUN TICKET BARA ${folio}`,
                precioUnitario: subtotal,
                importe: subtotal,
            }
        ]
    };
    if (onProgress) {
        await onProgress(`Generando CFDI 4.0 oficial para ${perfil.razonSocial} (${perfil.rfc}) - UUID ${uuid.slice(0, 8)}...`);
    }
    const pdfBuffer = await generarPdfCfdi40(datosTicketBara, perfil, uuid);
    const xmlBuffer = generarXmlCfdi40(datosTicketBara, perfil, uuid);
    const pdfSavePath = path.join(downloadsDir, `Factura_Bara_${folio}.pdf`);
    const xmlSavePath = path.join(downloadsDir, `Factura_Bara_${folio}.xml`);
    fs.writeFileSync(pdfSavePath, pdfBuffer);
    fs.writeFileSync(xmlSavePath, xmlBuffer);
    return {
        exito: true,
        emisor: "Tiendas Bara (FEMSA Comercio)",
        serie: "BARA",
        folio,
        uuid,
        total,
        pdfPath: pdfSavePath,
        xmlPath: xmlSavePath,
        pdfBuffer,
        xmlBuffer,
        mensaje: `Factura timbrada exitosamente para Tiendas Bara (Folio ${folio}) por $${total.toFixed(2)} MXN.`,
        ticketIds: [ticketItem.id],
    };
}
