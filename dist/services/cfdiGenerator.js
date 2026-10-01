import PDFDocument from "pdfkit";
import * as crypto from "crypto";
/**
 * Genera un archivo XML con estructura CFDI 4.0 del SAT a partir de los datos extraídos del ticket
 * y el perfil fiscal del usuario receptor.
 */
export function generarXmlCfdi40(ticket, receptor, uuid) {
    const fechaIso = new Date().toISOString().split(".")[0];
    const rfcEmisor = ticket.rfcEmisor || "AAA010101AAA";
    const nombreEmisor = (ticket.establecimiento || "COMERCIO EMISOR").toUpperCase();
    const total = Number(ticket.montoTotal || 0).toFixed(2);
    const subtotal = Number(ticket.subtotal ?? Number(ticket.montoTotal) / 1.16).toFixed(2);
    const iva = Number(ticket.iva ?? Number(ticket.montoTotal) - Number(subtotal)).toFixed(2);
    const conceptosXml = ticket.conceptos && ticket.conceptos.length > 0
        ? ticket.conceptos
            .map((c) => {
            const imp = Number(c.importe || 0).toFixed(2);
            const valorUnit = Number(c.precioUnitario || imp).toFixed(2);
            const cant = Number(c.cantidad || 1);
            const desc = (c.descripcion || "CONSUMO").replace(/[<>&"']/g, "");
            return `    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="${cant}" ClaveUnidad="H87" Descripcion="${desc}" ValorUnitario="${valorUnit}" Importe="${imp}" ObjetoImp="02"/>`;
        })
            .join("\n")
        : `    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="CONSUMO SEGUN TICKET ${ticket.folioTicket || "S/N"}" ValorUnitario="${subtotal}" Importe="${subtotal}" ObjetoImp="02"/>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="WA" Folio="${ticket.folioTicket || "1001"}" Fecha="${fechaIso}" FormaPago="${ticket.formaPago || "01"}" SubTotal="${subtotal}" Moneda="${ticket.moneda || "MXN"}" Total="${total}" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="${receptor.codigoPostal}">
  <cfdi:Emisor Rfc="${rfcEmisor}" Nombre="${nombreEmisor}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptor.rfc}" Nombre="${receptor.razonSocial}" DomicilioFiscalReceptor="${receptor.codigoPostal}" RegimenFiscalReceptor="${receptor.regimenFiscal}" UsoCFDI="${receptor.usoCfdi}"/>
  <cfdi:Conceptos>
${conceptosXml}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fechaIso}" RfcProvCertif="SAT970701NN3" SelloCFD="SIMULACION_DEMO_WHATSAPP_CFDI40" NoCertificadoSAT="00001000000504465028" SelloSAT="SELLO_SAT_DEMO"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
    return Buffer.from(xml, "utf-8");
}
/**
 * Genera la representación impresa en PDF de la factura CFDI 4.0
 * con los datos reales leídos del ticket de compra y los datos fiscales del usuario.
 */
export async function generarPdfCfdi40(ticket, receptor, uuid) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "LETTER", margin: 45 });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        const total = Number(ticket.montoTotal || 0);
        const subtotal = Number(ticket.subtotal ?? total / 1.16);
        const iva = Number(ticket.iva ?? total - subtotal);
        // Encabezado
        doc
            .fontSize(16)
            .fillColor("#1a365d")
            .text("FACTURA ELECTRÓNICA (CFDI 4.0)", { align: "right" });
        doc
            .fontSize(9)
            .fillColor("#4a5568")
            .text(`Folio Fiscal (UUID): ${uuid}`, { align: "right" })
            .text(`Ticket Origen: ${ticket.folioTicket || ticket.codigoFacturacion || "S/N"}`, {
            align: "right",
        })
            .text(`Fecha de Compra: ${ticket.fechaCompra || new Date().toISOString().slice(0, 10)}`, {
            align: "right",
        });
        doc.moveDown(0.5);
        // Datos del Emisor (Extraídos del Ticket)
        doc
            .fontSize(13)
            .fillColor("#2b6cb0")
            .text((ticket.establecimiento || "ESTABLECIMIENTO EMISOR").toUpperCase(), 45, 50);
        doc
            .fontSize(9)
            .fillColor("#2d3748")
            .text(`RFC Emisor: ${ticket.rfcEmisor || "XAXX010101000"}`)
            .text(`Sucursal: ${ticket.sucursal || "Matriz"}`)
            .text(`Portal Origen: ${ticket.urlPortalFacturacion || "N/A"}`);
        doc.moveDown(1.2);
        // Caja de Receptor
        const topReceptor = doc.y;
        doc
            .rect(45, topReceptor, 522, 68)
            .fillAndStroke("#f7fafc", "#cbd5e0");
        doc
            .fillColor("#1a202c")
            .fontSize(10)
            .text("DATOS FISCALES DEL RECEPTOR (CLIENTE)", 55, topReceptor + 8);
        doc
            .fontSize(9)
            .fillColor("#2d3748")
            .text(`RFC: ${receptor.rfc}`, 55, topReceptor + 24)
            .text(`Nombre / Razón Social: ${receptor.razonSocial}`, 55, topReceptor + 38)
            .text(`C.P. Domicilio Fiscal: ${receptor.codigoPostal}   |   Régimen Fiscal: ${receptor.regimenFiscal}   |   Uso CFDI: ${receptor.usoCfdi}   |   Forma de Pago: ${ticket.formaPago || "01"}`, 55, topReceptor + 52);
        doc.y = topReceptor + 85;
        // Tabla de Conceptos
        doc
            .rect(45, doc.y, 522, 20)
            .fill("#2b6cb0");
        const tableHeaderY = doc.y + 5;
        doc
            .fillColor("#ffffff")
            .fontSize(9)
            .text("CANT.", 55, tableHeaderY)
            .text("DESCRIPCIÓN (EXTRAÍDA DEL TICKET)", 105, tableHeaderY)
            .text("P. UNITARIO", 390, tableHeaderY, { width: 80, align: "right" })
            .text("IMPORTE", 475, tableHeaderY, { width: 80, align: "right" });
        doc.y = tableHeaderY + 20;
        doc.fillColor("#2d3748");
        const conceptos = ticket.conceptos && ticket.conceptos.length > 0
            ? ticket.conceptos
            : [
                {
                    cantidad: 1,
                    descripcion: `Consumo en ${ticket.establecimiento} (Ticket #${ticket.folioTicket || "S/N"})`,
                    precioUnitario: subtotal,
                    importe: subtotal,
                },
            ];
        for (const item of conceptos) {
            const rowY = doc.y;
            doc
                .fontSize(9)
                .text(String(item.cantidad || 1), 55, rowY)
                .text(item.descripcion || "Producto", 105, rowY, { width: 275 })
                .text(`$${Number(item.precioUnitario || 0).toFixed(2)}`, 390, rowY, {
                width: 80,
                align: "right",
            })
                .text(`$${Number(item.importe || 0).toFixed(2)}`, 475, rowY, {
                width: 80,
                align: "right",
            });
            doc.moveDown(0.8);
        }
        doc.moveDown(1);
        // Totales
        const totalesY = doc.y;
        doc
            .moveTo(350, totalesY)
            .lineTo(567, totalesY)
            .strokeColor("#cbd5e0")
            .stroke();
        doc
            .fontSize(10)
            .fillColor("#2d3748")
            .text("Subtotal:", 360, totalesY + 8, { width: 100, align: "right" })
            .text(`$${subtotal.toFixed(2)} ${ticket.moneda || "MXN"}`, 465, totalesY + 8, {
            width: 95,
            align: "right",
        })
            .text("IVA (16%):", 360, totalesY + 24, { width: 100, align: "right" })
            .text(`$${iva.toFixed(2)} ${ticket.moneda || "MXN"}`, 465, totalesY + 24, {
            width: 95,
            align: "right",
        });
        doc
            .fontSize(12)
            .fillColor("#1a365d")
            .text("TOTAL:", 360, totalesY + 44, { width: 100, align: "right" })
            .text(`$${total.toFixed(2)} ${ticket.moneda || "MXN"}`, 465, totalesY + 44, {
            width: 95,
            align: "right",
        });
        // Pie de página
        doc
            .fontSize(8)
            .fillColor("#718096")
            .text("Este documento fue generado automáticamente por el Bot de Facturación vía WhatsApp con Gemini 3.8 Flash + Playwright.", 45, 700, { align: "center", width: 522 });
        doc.end();
    });
}
export function generarUuidFiscal() {
    return crypto.randomUUID().toUpperCase();
}
