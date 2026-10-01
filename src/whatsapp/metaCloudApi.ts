import express, { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { analizarArchivoRecibido } from "../services/geminiExtractor.js";
import { encolarTicketEnLote } from "../services/batchQueue.js";
import {
  formatearResumenPlan,
  guardarPerfilFiscal,
  obtenerPerfilFiscal,
  registrarConsumoTicket,
} from "../storage/profiles.js";
import { formatearFormaPagoSat } from "./bot.js";

const BOT_SIGNATURE = "✨ *KlientIA Facturación*";

function getMetaConfig() {
  return {
    token: process.env.META_ACCESS_TOKEN || "",
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
    verifyToken: process.env.META_VERIFY_TOKEN || "facturacion_cfdi_meta_token_2026",
  };
}

/**
 * Envía un mensaje de texto oficial a través del Graph API de Meta
 */
export async function enviarTextoMeta(to: string, text: string): Promise<any> {
  const { token, phoneNumberId } = getMetaConfig();
  if (!token || !phoneNumberId) {
    console.warn("⚠️ Falta META_ACCESS_TOKEN o META_PHONE_NUMBER_ID");
    return;
  }

  const cleanTo = to.replace(/\D/g, "");
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "text",
        text: { body: text },
      }),
    });
    return await res.json();
  } catch (err) {
    console.error("Error enviando texto en Meta Cloud API:", err);
  }
}

/**
 * Sube y envía un archivo PDF o XML a través del Graph API de Meta
 */
export async function enviarDocumentoMeta(
  to: string,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<any> {
  const { token, phoneNumberId } = getMetaConfig();
  if (!token || !phoneNumberId) return;

  const cleanTo = to.replace(/\D/g, "");
  const mimeType = filename.toLowerCase().endsWith(".xml")
    ? "application/xml"
    : "application/pdf";

  try {
    // 1. Subir el archivo al servidor de Meta Media
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename
    );

    const uploadRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );
    const uploadData: any = await uploadRes.json();
    const mediaId = uploadData?.id;

    if (!mediaId) {
      console.error("No se obtuvo mediaId de Meta:", uploadData);
      return;
    }

    // 2. Enviar el mensaje con el mediaId
    const sendRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanTo,
          type: "document",
          document: {
            id: mediaId,
            filename: filename,
            caption: caption || undefined,
          },
        }),
      }
    );
    return await sendRes.json();
  } catch (err) {
    console.error("Error enviando documento en Meta Cloud API:", err);
  }
}

/**
 * Descarga una imagen o documento enviado por el usuario a la API de Meta
 */
async function descargarMediaMeta(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const { token } = getMetaConfig();
  // 1. Obtener URL de descarga
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metaData: any = await metaRes.json();
  const downloadUrl = metaData?.url;
  const mimeType = metaData?.mime_type || "image/jpeg";

  if (!downloadUrl) throw new Error("No se pudo obtener URL de media en Meta");

  // 2. Descargar los bytes reales
  const mediaBytesRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const arrayBuffer = await mediaBytesRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

/**
 * Inicia el servidor de Webhook oficial de Meta WhatsApp Cloud API
 */
export function iniciarServidorMetaWebhook(port: number = 3000): express.Express {
  const app = express();
  app.use(express.json());

  const { verifyToken } = getMetaConfig();

  // Endpoint de verificación requerido por Meta al configurar el Webhook
  app.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      console.log("✅ Webhook de Meta verificado exitosamente con hub.challenge.");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // Endpoint receptor de mensajes en tiempo real
  app.post("/webhook", async (req: Request, res: Response) => {
    res.sendStatus(200); // Responder 200 inmediatamente a Meta para confirmar recepción

    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];
      if (!message) return;

      const from = message.from; // Número del cliente
      const type = message.type;
      const text = message.text?.body || message.image?.caption || message.document?.caption || "";

      console.log(`📩 [Meta API] Mensaje recibido de +${from} (tipo: ${type})`);

      const perfilKey = `521${from.slice(-10)}@s.whatsapp.net`;
      const replyNumber = from;

      // 1. Comandos de texto
      if (type === "text") {
        const tLow = text.trim().toLowerCase();
        if (tLow === "/ayuda" || tLow === "hola" || tLow === "/start") {
          const { perfil } = obtenerPerfilFiscal(perfilKey);
          await enviarTextoMeta(
            replyNumber,
            `${BOT_SIGNATURE}\n👋 ¡Hola *${perfil.razonSocial}*!\n\nEnvía la foto de cualquier ticket de compra o tu Constancia Fiscal (PDF) para facturar tus consumos en minutos de forma 100% autónoma.`
          );
          return;
        }
      }

      // 2. Si es imagen o documento (Ticket o Constancia)
      if (type === "image" || type === "document") {
        const mediaId = message.image?.id || message.document?.id;
        if (!mediaId) return;

        const { buffer, mimeType } = await descargarMediaMeta(mediaId);
        console.log(`📥 [Meta API] Archivo descargado (${buffer.length} bytes, ${mimeType}). Analizando...`);

        const analisis = await analizarArchivoRecibido(buffer, mimeType, text);

        if (analisis.tipo === "constancia") {
          guardarPerfilFiscal(perfilKey, analisis.perfil);
          await enviarTextoMeta(
            replyNumber,
            `${BOT_SIGNATURE}\n🎉 *¡Constancia de Situación Fiscal guardada!*\n• *RFC:* \`${analisis.perfil.rfc}\`\n• *Nombre:* ${analisis.perfil.razonSocial}\n• *C.P.:* ${analisis.perfil.codigoPostal}\n• *Régimen:* ${analisis.perfil.regimenFiscal}\n\nYa puedes enviar tus tickets de caseta o compras para facturarlos con estos datos.`
          );
          return;
        }

        if (analisis.tipo === "ticket") {
          const datosTicket = analisis.ticket;
          const { perfil } = obtenerPerfilFiscal(perfilKey);
          const formaPagoTexto = formatearFormaPagoSat(datosTicket.formaPago, datosTicket.ultimosDigitosTarjeta);

          encolarTicketEnLote({
            jid: replyNumber,
            perfil,
            ticket: datosTicket,
            rawText: text,
            imageBuffer: buffer,
            mimeType,
            onFirstItem: async () => {
              await enviarTextoMeta(
                replyNumber,
                `${BOT_SIGNATURE}\n📸 *¡Ticket de ${datosTicket.establecimiento} recibido!* ($${Number(datosTicket.montoTotal).toFixed(2)} MXN)\n• *Folio:* \`${datosTicket.folioTicket || datosTicket.codigoFacturacion || "Detectado"}\`\n• *Pago SAT:* ${formaPagoTexto}\n• *Receptor:* ${perfil.razonSocial} (\`${perfil.rfc}\`)\n\n⏳ _Si tienes más tickets de este viaje, envíalos ahora; los acumularé en lote para facturarlos juntos de forma automática..._`
              );
            },
            onProcessStart: async (count) => {
              await enviarTextoMeta(
                replyNumber,
                `${BOT_SIGNATURE}\n🚀 *Iniciando facturación autónoma de tu lote (${count} tickets)...* Conectando a portales oficiales y timbrando con el SAT ⏳`
              );
            },
            onProgressNotice: async (msg) => {
              await enviarTextoMeta(replyNumber, `${BOT_SIGNATURE}\n${msg}`);
            },
            onDeliverResult: async (res) => {
              if (res.pdfBuffer || res.pdfPath) {
                const pdf = res.pdfBuffer || fs.readFileSync(res.pdfPath!);
                await enviarDocumentoMeta(
                  replyNumber,
                  pdf,
                  `Factura_${res.serie || "CFDI"}_${res.folio || "Oficial"}.pdf`,
                  `📄 Factura CFDI 4.0 (${res.emisor}) - Total: $${res.total.toFixed(2)} MXN`
                );
              }
              if (res.xmlBuffer || res.xmlPath) {
                const xml = res.xmlBuffer || fs.readFileSync(res.xmlPath!);
                await enviarDocumentoMeta(
                  replyNumber,
                  xml,
                  `Factura_${res.serie || "CFDI"}_${res.folio || "Oficial"}.xml`,
                  `🗂️ Comprobante XML CFDI 4.0 (${res.emisor})`
                );
              }
              if (!res.pdfBuffer && !res.xmlBuffer && res.mensaje) {
                await enviarTextoMeta(replyNumber, `${BOT_SIGNATURE}\n${res.mensaje}`);
              }
            },
            onBatchComplete: async (summary) => {
              await enviarTextoMeta(replyNumber, `${BOT_SIGNATURE}\n${summary}`);
            },
          });
        }
      }
    } catch (err) {
      console.error("Error procesando Webhook de Meta:", err);
    }
  });

  app.listen(port, () => {
    console.log(`🌐 [Meta Cloud API] Servidor Webhook escuchando en el puerto ${port}`);
  });

  return app;
}
