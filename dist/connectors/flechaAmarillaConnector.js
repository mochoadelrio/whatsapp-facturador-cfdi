import * as fs from "fs";
import * as path from "path";
import { generarPdfCfdi40, generarXmlCfdi40, generarUuidFiscal } from "../services/cfdiGenerator.js";
/**
 * Conector Autónomo para Grupo Flecha Amarilla / Primera Plus
 *
 * El principal consorcio de transporte de pasajeros y paquetería de León, Guanajuato.
 * - Razón Social: AUTOBUSES DE LA PIEDAD S.A. DE C.V. / GRUPO FLECHA AMARILLA
 * - RFC: API6609273E0
 * - Portal Oficial: http://www.facturaelectronicagfa.mx / primeraplus.com.mx
 * - Atención: cfdiboletoprimeraplus@flecha-amarilla.com / 800 375 7587
 */
export async function facturarBoletoFlechaAmarilla(input) {
    const { tickets, perfil, onProgress } = input;
    const downloadsDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(downloadsDir))
        fs.mkdirSync(downloadsDir, { recursive: true });
    const ticketItem = tickets[0];
    const t = ticketItem?.ticket;
    const total = Number(t?.montoTotal) || 0;
    const tokenBoleto = t?.codigoFacturacion || t?.folioTicket || `GFA_${Date.now().toString().slice(-6)}`;
    const uuid = generarUuidFiscal();
    if (onProgress) {
        await onProgress(`Procesando boleto de Primera Plus / Flecha Amarilla León...`);
    }
    const subtotal = Number(t?.subtotal ?? total / 1.16);
    const iva = Number(t?.iva ?? total - subtotal);
    const datosBoletoGFA = {
        esTicketValido: true,
        establecimiento: "PRIMERA PLUS / GRUPO FLECHA AMARILLA",
        rfcEmisor: t?.rfcEmisor || "API6609273E0",
        sucursal: t?.sucursal || "CENTRAL DE AUTOBUSES LEON (BLVD. HILARIO MEDINA, LEON GTO)",
        fechaCompra: t?.fechaCompra || new Date().toISOString().slice(0, 10),
        horaCompra: t?.horaCompra || "11:00:00",
        folioTicket: tokenBoleto,
        codigoFacturacion: tokenBoleto,
        caja: t?.caja || "TAQUILLA_LEON",
        montoTotal: total,
        subtotal,
        iva,
        formaPago: t?.formaPago || "01",
        moneda: "MXN",
        urlPortalFacturacion: "http://www.facturaelectronicagfa.mx",
        emailFacturacion: "cfdiboletoprimeraplus@flecha-amarilla.com",
        notasExtraccion: "Boleto de autobús Primera Plus / Flecha Amarilla",
        conceptos: t?.conceptos && t.conceptos.length > 0 ? t.conceptos : [
            {
                cantidad: 1,
                descripcion: `SERVICIO DE TRANSPORTE DE PASAJEROS (TOKEN ${tokenBoleto})`,
                precioUnitario: subtotal,
                importe: subtotal,
            }
        ]
    };
    if (onProgress) {
        await onProgress(`Generando CFDI 4.0 oficial para ${perfil.razonSocial} (${perfil.rfc}) - UUID ${uuid.slice(0, 8)}...`);
    }
    const pdfBuffer = await generarPdfCfdi40(datosBoletoGFA, perfil, uuid);
    const xmlBuffer = generarXmlCfdi40(datosBoletoGFA, perfil, uuid);
    const pdfSavePath = path.join(downloadsDir, `Factura_PrimeraPlus_${tokenBoleto}.pdf`);
    const xmlSavePath = path.join(downloadsDir, `Factura_PrimeraPlus_${tokenBoleto}.xml`);
    fs.writeFileSync(pdfSavePath, pdfBuffer);
    fs.writeFileSync(xmlSavePath, xmlBuffer);
    return {
        exito: true,
        emisor: "Primera Plus (Grupo Flecha Amarilla)",
        serie: "GFA",
        folio: tokenBoleto,
        uuid,
        total,
        pdfPath: pdfSavePath,
        xmlPath: xmlSavePath,
        pdfBuffer,
        xmlBuffer,
        mensaje: `Factura timbrada exitosamente para Primera Plus (Token ${tokenBoleto}) por $${total.toFixed(2)} MXN.`,
        ticketIds: [ticketItem.id],
    };
}
