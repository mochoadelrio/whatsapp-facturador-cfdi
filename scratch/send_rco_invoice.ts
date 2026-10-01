import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const pdfPath = path.resolve(process.cwd(), "downloads/Factura_Caseta_RCO_BB3751912.pdf");
  const xmlPath = path.resolve(process.cwd(), "downloads/Factura_Caseta_RCO_BB3751912.xml");

  if (!fs.existsSync(pdfPath) || !fs.existsSync(xmlPath)) {
    console.error("No se encontraron los archivos PDF o XML");
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  const xmlBuffer = fs.readFileSync(xmlPath);

  console.log(`PDF size: ${pdfBuffer.length} bytes, XML size: ${xmlBuffer.length} bytes`);

  const { state, saveCreds } = await useMultiFileAuthState("auth_whatsapp");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    syncFullHistory: false,
    connectTimeoutMs: 30000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("🟢 Conexión abierta con WhatsApp.");

      const targetCristhian = "5214775907888@s.whatsapp.net";
      const targetManuel = "5214773929593@s.whatsapp.net";

      const captionResumen = 
`✅ *¡Factura Generada y Timbrada con Éxito!* 🛣️🚗
━━━━━━━━━━━━━━━━━━━━━
🏢 *Emisor:* Red de Carreteras de Occidente (RCO)
📍 *Tramo:* León - San Francisco (Carril 10A)
🧾 *Folio:* Serie BB - 3751912
🆔 *UUID SAT:* \`367a918a-bd3c-4ecf-9476-ffb324a723dc\`
📅 *Fecha:* 2026-09-30
💵 *Subtotal:* \$51.72 MXN
📊 *IVA (16%):* \$8.28 MXN
💰 *Total:* *\$60.00 MXN*
💳 *Forma de Pago:* Efectivo (01)
━━━━━━━━━━━━━━━━━━━━━
👤 *Receptor:* CRISTHIAN VALDIVIA MARTINEZ
📋 *RFC:* VAMC9112056Q2
📍 *C.P.:* 37545 | *Régimen:* 626 (RESICO)
🎯 *Uso CFDI:* G03 (Gastos en general)
━━━━━━━━━━━━━━━━━━━━━
📎 *Te adjunto tus archivos oficiales SAT (PDF y XML).*
_Facturación 100% automatizada vía Facturador CFDI IA_ 🤖⚡`;

      try {
        console.log("Enviando mensaje y documentos a Cristhian...");
        await sock.sendMessage(targetCristhian, { text: captionResumen });
        await new Promise((r) => setTimeout(r, 1000));

        await sock.sendMessage(targetCristhian, {
          document: pdfBuffer,
          mimetype: "application/pdf",
          fileName: "Factura_Caseta_RCO_BB3751912.pdf",
        });
        await new Promise((r) => setTimeout(r, 1000));

        await sock.sendMessage(targetCristhian, {
          document: xmlBuffer,
          mimetype: "application/xml",
          fileName: "Factura_Caseta_RCO_BB3751912.xml",
        });
        console.log("✅ Factura enviada a Cristhian!");

        console.log("Enviando reporte de confirmación a Manuel...");
        await sock.sendMessage(targetManuel, {
          text: `🔔 *Factura Caseta RCO Completada y Entregada*\n\n` +
                `Se generó y envió automáticamente el CFDI 4.0 a *CRISTHIAN VALDIVIA MARTINEZ* (+5214775907888):\n` +
                `• *Caseta:* León - San Francisco (\$60.00 MXN)\n` +
                `• *Folio:* BB 3751912\n` +
                `• *UUID:* 367a918a-bd3c-4ecf-9476-ffb324a723dc\n` +
                `• *Archivos:* PDF y XML entregados en su chat.`
        });
        await new Promise((r) => setTimeout(r, 1000));

        await sock.sendMessage(targetManuel, {
          document: pdfBuffer,
          mimetype: "application/pdf",
          fileName: "Factura_Caseta_RCO_BB3751912.pdf",
        });
        await new Promise((r) => setTimeout(r, 1000));

        await sock.sendMessage(targetManuel, {
          document: xmlBuffer,
          mimetype: "application/xml",
          fileName: "Factura_Caseta_RCO_BB3751912.xml",
        });
        console.log("✅ Reporte y copia enviados a Manuel!");

      } catch (err: any) {
        console.error("Error enviando por WhatsApp:", err.message);
      } finally {
        console.log("Cerrando sesión temporal de envío...");
        sock.end(undefined);
        setTimeout(() => process.exit(0), 1500);
      }
    } else if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Conexión cerrada:", lastDisconnect?.error?.message, "reconnect:", shouldReconnect);
    }
  });
}

main().catch(console.error);
