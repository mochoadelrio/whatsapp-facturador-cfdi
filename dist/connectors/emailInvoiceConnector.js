import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";
/**
 * Conector autónomo para comercios que requieren solicitud de factura por correo electrónico.
 * Funciona de forma agnóstica:
 * - Si está en un servidor Cloud (Linux/Docker) o hay SMTP configurado: usa nodemailer SMTP directo.
 * - Si está en macOS sin SMTP configurado: usa Apple Mail automáticamente vía AppleScript.
 */
export async function solicitarFacturaPorCorreo(input, emailDestino) {
    const { tickets, perfil, onProgress } = input;
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    const folio = ticket?.folioTicket || ticket?.codigoFacturacion || "S/F";
    const comercio = ticket?.establecimiento || "Establecimiento";
    const constanciaPath = path.resolve(process.cwd(), "downloads", "Datos requeridos CFDI.pdf");
    const ticketPath = ticketItem?.imagePath || "";
    if (onProgress) {
        await onProgress(`Preparando solicitud formal por correo para ${comercio} (${emailDestino})...`);
    }
    const subject = `Solicitud de Factura CFDI 4.0 - Ticket ${folio} - ${perfil.rfc}`;
    const body = `Estimado Departamento de Facturación / ${comercio},

Por medio del presente correo solicito amablemente la emisión de la factura electrónica (CFDI 4.0) correspondiente a nuestro consumo/compra realizada.

Datos del Comprobante:
- Establecimiento / Sucursal: ${comercio} ${ticket?.sucursal ? `(${ticket.sucursal})` : ""}
- Folio / Ticket: ${folio}
- Fecha: ${ticket?.fechaCompra || new Date().toISOString().slice(0, 10)} ${ticket?.horaCompra || ""}
- Importe Total: $${total.toFixed(2)} MXN
- Forma de Pago SAT: ${ticket?.formaPago || "01"} (${ticket?.formaPago === "28" ? "Tarjeta de débito" : ticket?.formaPago === "04" ? "Tarjeta de crédito" : "Efectivo"})

Datos Fiscales del Receptor:
- RFC: ${perfil.rfc}
- Nombre / Razón Social: ${perfil.razonSocial}
- Código Postal (Domicilio Fiscal): ${perfil.codigoPostal}
- Régimen Fiscal: ${perfil.regimenFiscal || "626"} (RESICO)
- Uso de CFDI: ${perfil.usoCfdi || "G03"}
- Correos para recepción de archivos (XML y PDF):
  ${perfil.email || "cristhian.valdivia@ejemplo.com"}
  ${process.env.SMTP_USER || "mochoad@icloud.com"}

Se anexan al presente correo la fotografía del ticket de compra y la Constancia de Situación Fiscal actualizada en formato PDF.

Agradezco de antemano su pronta atención y confirmación de emisión.

Atentamente,
${perfil.razonSocial}`;
    const attachments = [];
    if (ticketPath && fs.existsSync(ticketPath)) {
        attachments.push({
            filename: `Ticket_${folio}.jpg`,
            path: ticketPath,
        });
    }
    if (fs.existsSync(constanciaPath)) {
        attachments.push({
            filename: `Constancia_Situacion_Fiscal_${perfil.rfc}.pdf`,
            path: constanciaPath,
        });
    }
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    // 1. Si hay credenciales SMTP o no estamos en macOS, usar Nodemailer
    if (smtpHost && smtpUser && smtpPass) {
        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === "true",
                auth: { user: smtpUser, pass: smtpPass },
            });
            await transporter.sendMail({
                from: `"${perfil.razonSocial}" <${smtpUser}>`,
                to: emailDestino,
                cc: perfil.email || undefined,
                subject,
                text: body,
                attachments,
            });
            if (onProgress) {
                await onProgress(`Correo formal enviado vía SMTP a ${emailDestino} con adjuntos.`);
            }
            return {
                exito: true,
                emisor: comercio,
                folio,
                total,
                mensaje: `✉️ Solicitud de factura enviada por correo (SMTP) a ${emailDestino}. Adjuntos: Ticket y Constancia Fiscal en PDF.`,
                ticketIds: [ticketItem.id],
            };
        }
        catch (err) {
            console.warn("Fallo envío SMTP, intentando fallback:", err?.message || err);
        }
    }
    // 2. Si estamos en macOS (entorno local de desarrollo o Mac Mini servidor), usar Apple Mail
    if (process.platform === "darwin") {
        try {
            let script = `tell application "Mail"\n`;
            script += `  set newMsg to make new outgoing message with properties {subject:${JSON.stringify(subject)}, content:${JSON.stringify(body + "\n\n")}, visible:false}\n`;
            script += `  tell newMsg\n`;
            script += `    make new to recipient at end of to recipients with properties {address:${JSON.stringify(emailDestino)}}\n`;
            if (perfil.email) {
                script += `    make new cc recipient at end of cc recipients with properties {address:${JSON.stringify(perfil.email)}}\n`;
            }
            if (ticketPath && fs.existsSync(ticketPath)) {
                script += `    set ticketAlias to POSIX file "${ticketPath}" as alias\n`;
                script += `    make new attachment with properties {file name:ticketAlias} at after the last paragraph\n`;
            }
            if (fs.existsSync(constanciaPath)) {
                script += `    set constanciaAlias to POSIX file "${constanciaPath}" as alias\n`;
                script += `    make new attachment with properties {file name:constanciaAlias} at after the last paragraph\n`;
            }
            script += `    send\n`;
            script += `  end tell\n`;
            script += `  check for new mail\n`;
            script += `end tell\n`;
            const tmpScriptPath = path.resolve(process.cwd(), "data", `mail_${Date.now()}.scpt`);
            fs.writeFileSync(tmpScriptPath, script, "utf-8");
            execSync(`osascript "${tmpScriptPath}"`);
            try {
                fs.unlinkSync(tmpScriptPath);
            }
            catch { }
            if (onProgress) {
                await onProgress(`Correo formal enviado a ${emailDestino} con ticket y Constancia fiscal adjuntos.`);
            }
            return {
                exito: true,
                emisor: comercio,
                folio,
                total,
                mensaje: `✉️ Solicitud de factura enviada por correo a ${emailDestino}. Se adjuntaron la fotografía del ticket y la Constancia Fiscal en PDF.`,
                ticketIds: [ticketItem.id],
            };
        }
        catch (err) {
            return {
                exito: false,
                emisor: comercio,
                total,
                mensaje: `No se pudo enviar el correo automático: ${err?.message || err}`,
                ticketIds: [ticketItem.id],
            };
        }
    }
    return {
        exito: false,
        emisor: comercio,
        total,
        mensaje: `En servidor Cloud se requiere configurar SMTP_HOST, SMTP_USER y SMTP_PASS en .env para el envío de correos.`,
        ticketIds: [ticketItem.id],
    };
}
