import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";

/**
 * Conector autónomo para Estaciones de Servicio G500 Network.
 * Portal oficial: https://g500network.com/facturacion-en-linea/
 */
export async function facturarTicketG500(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const ticketItem = tickets[0];
  const ticket = ticketItem?.ticket;
  const total = Number(ticket?.montoTotal) || 0;
  const totalStr = total.toFixed(2);

  // Extraer datos del ticket
  const folio = (ticket?.folioTicket || ticket?.codigoFacturacion || "").replace(/\D/g, "");
  const webId = (ticket?.codigoFacturacion || ticket?.caja || "").trim();
  const permisoCre = (ticket?.sucursal || "").match(/PL\/\d+\/EXP\/ES\/\d+/i)?.[0] || "";
  const portalUrl = ticket?.urlPortalFacturacion || "https://g500network.com/facturacion-en-linea/";

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    let pdfBuffer: Buffer | undefined;
    let xmlBuffer: Buffer | undefined;

    page.on("download", async (download) => {
      const filename = download.suggestedFilename();
      const savePath = path.join(downloadsDir, filename);
      await download.saveAs(savePath);
      if (filename.endsWith(".pdf")) pdfBuffer = fs.readFileSync(savePath);
      if (filename.endsWith(".xml")) xmlBuffer = fs.readFileSync(savePath);
    });

    // Interceptar descargas de CFDI
    page.on("response", async (res) => {
      const u = res.url().toLowerCase();
      if (u.includes(".pdf") || (u.includes("factura") && res.headers()["content-type"]?.includes("pdf"))) {
        try {
          pdfBuffer = await res.body();
        } catch {}
      }
      if (u.includes(".xml") || (u.includes("factura") && res.headers()["content-type"]?.includes("xml"))) {
        try {
          xmlBuffer = await res.body();
        } catch {}
      }
    });

    if (onProgress) await onProgress(`Accediendo al sistema de facturación G500...`);

    // Si el ticket trae URL directa (ej. ControlGas, estación específica)
    if (portalUrl && !portalUrl.includes("g500network.com")) {
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(2000);

      // Llenar folios típicos de ControlGas / GasManager
      if (await page.locator('input[name*="folio"], #folio, #Folio').first().isVisible().catch(() => false)) {
        await page.locator('input[name*="folio"], #folio, #Folio').first().fill(folio);
      }
      if (webId && (await page.locator('input[name*="webid"], input[name*="codigo"], #webid, #WebId').first().isVisible().catch(() => false))) {
        await page.locator('input[name*="webid"], input[name*="codigo"], #webid, #WebId').first().fill(webId);
      }
    } else {
      // Usar el portal central de G500
      await page.goto("https://g500network.com/facturacion-en-linea/", {
        waitUntil: "domcontentloaded",
        timeout: 35000,
      });
      await page.waitForTimeout(2000);

      if (permisoCre && (await page.locator("#form-field-field_b43e803").isVisible())) {
        if (onProgress) await onProgress(`Buscando estación con Permiso CRE ${permisoCre}...`);
        await page.fill("#form-field-field_b43e803", permisoCre);
        await page.click("#btn-facturar");
        await page.waitForTimeout(3000);
      }
    }

    await browser.close();

    const exito = !!(pdfBuffer || xmlBuffer);
    return {
      exito,
      emisor: `G500 Network (${permisoCre || "Estación de Servicio"})`,
      total,
      pdfBuffer,
      xmlBuffer,
      mensaje: exito
        ? `Factura G500 emitida exitosamente por un total de \$${totalStr}.`
        : `Ticket #${folio} de G500 procesado. ${permisoCre ? `Permiso CRE: ${permisoCre}. ` : ""}Portal de la estación: ${portalUrl}`,
      ticketIds: [ticketItem.id],
    };
  } catch (err: any) {
    await browser.close();
    return {
      exito: false,
      emisor: "G500 Network",
      total,
      mensaje: `Error en conector G500: ${err?.message || err}`,
      ticketIds: [ticketItem.id],
    };
  }
}
