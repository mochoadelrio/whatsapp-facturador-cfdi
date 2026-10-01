import { chromium } from "playwright";
import { DatosFiscales, DatosTicket, ResultadoFacturacion } from "../types.js";
import { mapearFormularioPortalConIA } from "./geminiExtractor.js";
import {
  generarPdfCfdi40,
  generarUuidFiscal,
  generarXmlCfdi40,
} from "./cfdiGenerator.js";

/**
 * Orquesta la facturación del ticket:
 * 1. Si el ticket tiene URL de portal y el modo es "real" o "hibrido", abre Playwright,
 *    analiza los campos del portal con Gemini 3.8 Flash, los llena automáticamente y toma captura.
 * 2. Genera/entrega los archivos PDF y XML para que el usuario los reciba directamente en su WhatsApp.
 */
export async function procesarFacturacionTicket(
  ticket: DatosTicket,
  perfil: DatosFiscales
): Promise<ResultadoFacturacion> {
  const modoConfig = (process.env.MODO_FACTURACION || "hibrido").toLowerCase();
  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";

  const nombreLimpio = (ticket.establecimiento || "Ticket")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 20);
  const folioLimpio = (ticket.folioTicket || ticket.codigoFacturacion || "SN")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  const nombreArchivoBase = `Factura_${nombreLimpio}_${folioLimpio}`;

  let capturaPortalBuffer: Buffer | undefined;
  let resumenPortal = "";

  // Intentar navegación automatizada en el portal web si hay URL y no estamos en modo solo demo
  if (ticket.urlPortalFacturacion && modoConfig !== "demo") {
    try {
      let url = ticket.urlPortalFacturacion.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }

      console.log(`🌐 Abriendo portal de facturación con Playwright: ${url}`);
      const browser = await chromium.launch({ headless });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2500);

      // Extraer inputs, selects y botones visibles en el portal de facturación
      const elementosInteractivos = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll("input, select, textarea, button, a.btn")
        );
        return els
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .slice(0, 40)
          .map((el, idx) => {
            const id = el.id ? `#${el.id}` : "";
            const name = el.getAttribute("name")
              ? `[name="${el.getAttribute("name")}"]`
              : "";
            const placeholder = el.getAttribute("placeholder") || "";
            const type = el.getAttribute("type") || el.tagName.toLowerCase();
            const text = (el.textContent || "").trim().slice(0, 50);
            const label =
              el.id && document.querySelector(`label[for="${el.id}"]`)
                ? document
                    .querySelector(`label[for="${el.id}"]`)
                    ?.textContent?.trim()
                : "";

            return {
              index: idx,
              tag: el.tagName.toLowerCase(),
              type,
              selectorSugerido:
                id || name || `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`,
              placeholder,
              label,
              text,
            };
          });
      });

      if (elementosInteractivos.length > 0) {
        const planIA = await mapearFormularioPortalConIA(
          JSON.stringify(elementosInteractivos, null, 2),
          ticket,
          perfil
        );

        let camposLlenados = 0;
        for (const acc of planIA.acciones) {
          try {
            if (acc.accion === "fill" && acc.valor) {
              await page.locator(acc.selector).first().fill(acc.valor, { timeout: 3000 });
              camposLlenados++;
            } else if (acc.accion === "select" && acc.valor) {
              await page
                .locator(acc.selector)
                .first()
                .selectOption(acc.valor, { timeout: 3000 });
              camposLlenados++;
            }
          } catch {
            // Continuar si un selector específico del portal requiere interacción previa
          }
        }

        resumenPortal = `🌐 *Portal visitado:* ${url}\n🤖 *Agente Playwright:* Detectó ${elementosInteractivos.length} controles y pre-llenó ${camposLlenados} campos automáticamente (${planIA.explicacion}).`;
      } else {
        resumenPortal = `🌐 *Portal visitado:* ${url} (El portal usa iframe/captcha o requiere validación adicional).`;
      }

      capturaPortalBuffer = await page.screenshot({ fullPage: false });
      await browser.close();
    } catch (err: any) {
      console.warn("⚠️ Aviso al navegar al portal con Playwright:", err?.message || err);
      resumenPortal = `⚠️ *Portal (${ticket.urlPortalFacturacion}):* No se pudo completar la conexión directa (${
        err?.message?.slice(0, 80) || "Tiempo de espera agotado"
      }).`;
    }
  }

  // Generar los archivos CFDI 4.0 (PDF y XML) con los datos extraídos del ticket y del receptor
  const uuid = generarUuidFiscal();
  const pdfBuffer = await generarPdfCfdi40(ticket, perfil, uuid);
  const xmlBuffer = generarXmlCfdi40(ticket, perfil, uuid);

  return {
    exito: true,
    modo: ticket.urlPortalFacturacion && modoConfig === "real" ? "portal_real" : "simulacion_cfdi",
    uuid,
    mensaje:
      resumenPortal ||
      "✅ Datos extraídos del ticket con Gemini 3.8 Flash y factura CFDI 4.0 generada.",
    pdfBuffer,
    xmlBuffer,
    capturaPortalBuffer,
    nombreArchivoBase,
  };
}
