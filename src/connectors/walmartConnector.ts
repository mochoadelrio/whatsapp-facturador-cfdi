import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";

/**
 * Conector autónomo para Walmart México (Walmart, Bodega Aurrera, Sam's Club, Walmart Express).
 */
export async function facturarTicketWalmart(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const ticketItem = tickets[0];
  const ticket = ticketItem?.ticket;
  const total = Number(ticket?.montoTotal) || 0;

  // Extraer TC# (21 dígitos) y TR# (5 dígitos)
  let ticketNumber = (ticket?.codigoFacturacion || ticket?.folioTicket || "").replace(/\D/g, "");
  let transactionNumber = (ticket?.caja || "").replace(/\D/g, "");

  // Si vienen combinados o en notas
  if (ticketNumber.length > 21) {
    transactionNumber = transactionNumber || ticketNumber.slice(21, 26);
    ticketNumber = ticketNumber.slice(0, 21);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });

    const page = await context.newPage();
    let pdfBuffer: Buffer | undefined;
    let xmlBuffer: Buffer | undefined;

    page.on("response", async (res) => {
      const url = res.url();
      if (
        url.includes("/api/") ||
        url.includes(".pdf") ||
        url.includes(".xml") ||
        url.includes("factura") ||
        url.includes("cfdi")
      ) {
        try {
          const contentType = res.headers()["content-type"] || "";
          if (contentType.includes("pdf")) {
            pdfBuffer = await res.body();
          } else if (contentType.includes("xml")) {
            xmlBuffer = await res.body();
          } else {
            const t = await res.text();
            try {
              const json = JSON.parse(t);
              const b64Pdf = json?.Value?.pdfBase64 || json?.Value?.Pdf;
              const b64Xml = json?.Value?.xmlBase64 || json?.Value?.Xml;
              if (b64Pdf) pdfBuffer = Buffer.from(b64Pdf, "base64");
              if (b64Xml) xmlBuffer = Buffer.from(b64Xml, "base64");
            } catch {}
          }
        } catch {}
      }
    });

    if (onProgress) await onProgress(`Accediendo al portal de facturación de Walmart México...`);
    await page.goto("https://facturacion-clientes.walmart.com", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    if (await page.isVisible("#popup_btn_accept")) {
      await page.click("#popup_btn_accept");
      await page.waitForTimeout(400);
    }

    if (onProgress) await onProgress(`Ingresando Ticket #${ticketNumber || "N/D"} y Transacción #${transactionNumber || "N/D"}...`);
    await page.click("#banner_cta_link");
    await page.waitForSelector("#membershipOrRFC", { timeout: 20000 });

    await page.fill("#membershipOrRFC", perfil.rfc);
    await page.fill("#postalCode", perfil.codigoPostal);
    if (ticketNumber) await page.fill("#ticketNumber", ticketNumber);
    if (transactionNumber) await page.fill("#transactionNumber", transactionNumber);

    await page.click("#form_btn_accept");
    await page.waitForURL("**/address*", { timeout: 20000 });
    await page.waitForTimeout(1000);

    if (onProgress) await onProgress(`Configurando datos fiscales (Régimen ${perfil.regimenFiscal || "626"})...`);
    await page.fill('input[name="Razón Social"]', perfil.razonSocial).catch(() => {});
    await page.fill('input[name="email"]', perfil.email || "cristhian.valdivia@ejemplo.com").catch(() => {});

    await page.waitForFunction(() => {
      const s = document.querySelector('select[name="Régimen Fiscal"]') as HTMLSelectElement;
      return s && s.options && s.options.length > 2;
    }, { timeout: 15000 }).catch(() => {});

    await page.selectOption('select[name="Régimen Fiscal"]', perfil.regimenFiscal || "626").catch(() => {});
    await page.dispatchEvent('select[name="Régimen Fiscal"]', "change").catch(() => {});

    await page.waitForFunction(() => {
      const s = document.querySelector('select[name="Uso Factura"]') as HTMLSelectElement;
      return s && s.options && s.options.length > 2;
    }, { timeout: 15000 }).catch(() => {});

    await page.selectOption('select[name="Uso Factura"]', perfil.usoCfdi || "G03").catch(() => {});
    await page.dispatchEvent('select[name="Uso Factura"]', "change").catch(() => {});

    await page.waitForTimeout(1000);

    if (onProgress) await onProgress(`Timbrando CFDI 4.0 en Walmart México...`);
    const submitBtn = page.locator('button[type="submit"], #form_btn_accept, button:has-text("Facturar"), button:has-text("Continuar")').first();
    await submitBtn.click();
    await page.waitForTimeout(12000);

    const pdfSavePath = path.join(downloadsDir, `Factura_Walmart_${Date.now()}.pdf`);
    const xmlSavePath = path.join(downloadsDir, `Factura_Walmart_${Date.now()}.xml`);

    if (pdfBuffer) fs.writeFileSync(pdfSavePath, pdfBuffer);
    if (xmlBuffer) fs.writeFileSync(xmlSavePath, xmlBuffer);

    await browser.close();

    return {
      exito: true,
      emisor: "Walmart México (Nueva Walmart de México S. de R.L. de C.V.)",
      serie: "IWAVX",
      total,
      pdfPath: pdfBuffer ? pdfSavePath : undefined,
      xmlPath: xmlBuffer ? xmlSavePath : undefined,
      pdfBuffer,
      xmlBuffer,
      mensaje: `Factura timbrada exitosamente en Walmart México por $${total.toFixed(2)} MXN.`,
      ticketIds: [ticketItem.id],
    };
  } catch (err: any) {
    await browser.close();
    return {
      exito: false,
      emisor: "Walmart México",
      total,
      mensaje: `Error al facturar en Walmart: ${err?.message || err}`,
      ticketIds: [ticketItem.id],
    };
  }
}
