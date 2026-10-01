import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";

/**
 * Conector autónomo para Costco México (Costco Wholesale México, S.A. de C.V.).
 * Portal oficial: https://www3.costco.com.mx/facturacion
 */
export async function facturarTicketCostco(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const ticketItem = tickets[0];
  const ticket = ticketItem?.ticket;
  const total = Number(ticket?.montoTotal) || 0;

  // Extraer número de ticket / orden y total
  const ticketNumber = (ticket?.folioTicket || ticket?.codigoFacturacion || "").replace(/\D/g, "");
  const totalStr = total.toFixed(2);
  const emailDestino = perfil.email || "facturacion@cliente.com";

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

    // Interceptar descargas o respuestas de API con PDF/XML
    page.on("response", async (res) => {
      const u = res.url().toLowerCase();
      if (u.includes(".pdf") || (u.includes("descarga") && res.headers()["content-type"]?.includes("pdf"))) {
        try {
          pdfBuffer = await res.body();
        } catch {}
      }
      if (u.includes(".xml") || (u.includes("descarga") && res.headers()["content-type"]?.includes("xml"))) {
        try {
          xmlBuffer = await res.body();
        } catch {}
      }
    });

    if (onProgress) await onProgress(`Accediendo al portal de facturación oficial de Costco México...`);
    await page.goto("https://www3.costco.com.mx/facturacion", {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForTimeout(2000);

    if (onProgress) await onProgress(`Ingresando Ticket #${ticketNumber} y Monto \$${totalStr}...`);

    // Paso 1: Llenar Ticket, Monto y RFC
    await page.fill("#ticket", ticketNumber);
    await page.dispatchEvent("#ticket", "input");
    await page.dispatchEvent("#ticket", "change");

    await page.fill("#monto", totalStr);
    await page.dispatchEvent("#monto", "input");
    await page.dispatchEvent("#monto", "change");

    await page.fill("#rfc", perfil.rfc.trim().toUpperCase());
    await page.dispatchEvent("#rfc", "input");
    await page.dispatchEvent("#rfc", "change");
    await page.dispatchEvent("#rfc", "blur");

    await page.waitForTimeout(1000);

    // Clic en Continuar
    const btnContinuar = page.locator('button:has-text("Continuar"), #btnEnviar').first();
    if (await btnContinuar.isVisible()) {
      await btnContinuar.click();
    }

    await page.waitForTimeout(3000);

    // Verificar si hay errores del portal
    const errorAlert = await page.locator('.alert-danger, .has-error, .invalid-feedback, div[role="alert"]').allTextContents();
    const errorMsg = errorAlert.map(e => e.trim()).filter(Boolean).join(" | ");

    if (errorMsg && (errorMsg.includes("no encontrado") || errorMsg.includes("no válido") || errorMsg.includes("agotado"))) {
      await browser.close();
      return {
        exito: false,
        emisor: "Costco Wholesale México",
        total,
        mensaje: `Costco indicó: ${errorMsg}`,
        ticketIds: [ticketItem.id],
      };
    }

    // Paso 2: Datos fiscales si solicita completar campos
    if (await page.locator("#razonSocial").isVisible()) {
      if (onProgress) await onProgress(`Completando datos fiscales de ${perfil.razonSocial}...`);
      await page.fill("#razonSocial", perfil.razonSocial.trim().toUpperCase());
      await page.dispatchEvent("#razonSocial", "change");
    }

    if (await page.locator("#codigoPostal").isVisible()) {
      await page.fill("#codigoPostal", perfil.codigoPostal.trim());
      await page.dispatchEvent("#codigoPostal", "change");
    }

    if (await page.locator("#correo").isVisible()) {
      await page.fill("#correo", emailDestino);
      await page.dispatchEvent("#correo", "change");
    }

    if (await page.locator("#correoConfirmacion").isVisible()) {
      await page.fill("#correoConfirmacion", emailDestino);
      await page.dispatchEvent("#correoConfirmacion", "change");
    }

    // Seleccionar Régimen Fiscal si está disponible
    if (await page.locator("#regimenFiscal").isVisible()) {
      const regOptions = await page.$$eval("#regimenFiscal option", opts =>
        opts.map(o => (o as HTMLOptionElement).value)
      );
      const matchingReg = regOptions.find(o => o.includes(perfil.regimenFiscal) || o === perfil.regimenFiscal);
      if (matchingReg) {
        await page.selectOption("#regimenFiscal", matchingReg);
      } else if (regOptions.length > 1) {
        await page.selectOption("#regimenFiscal", { index: 1 });
      }
    }

    // Seleccionar Uso de CFDI si está disponible
    if (await page.locator("#usoCFDI").isVisible()) {
      const usoOptions = await page.$$eval("#usoCFDI option", opts =>
        opts.map(o => (o as HTMLOptionElement).value)
      );
      const matchingUso = usoOptions.find(o => o.includes(perfil.usoCfdi) || o === perfil.usoCfdi);
      if (matchingUso) {
        await page.selectOption("#usoCFDI", matchingUso);
      } else if (usoOptions.length > 1) {
        await page.selectOption("#usoCFDI", { index: 1 });
      }
    }

    // Clic en Solicitar / Facturar
    const btnSolicitar = page.locator('button:has-text("Solicitar"), button:has-text("Facturar")').first();
    if (await btnSolicitar.isVisible()) {
      if (onProgress) await onProgress(`Enviando solicitud de factura a Costco...`);
      await btnSolicitar.click();
      await page.waitForTimeout(6000);
    }

    // Buscar botones de descarga de PDF / XML si aparecen en pantalla
    const pdfBtn = page.locator('button:has-text("PDF"), a:has-text("PDF"), a[href*=".pdf"]').first();
    if (await pdfBtn.isVisible().catch(() => false)) {
      try {
        await pdfBtn.click();
        await page.waitForTimeout(2000);
      } catch {}
    }

    const xmlBtn = page.locator('button:has-text("XML"), a:has-text("XML"), a[href*=".xml"]').first();
    if (await xmlBtn.isVisible().catch(() => false)) {
      try {
        await xmlBtn.click();
        await page.waitForTimeout(2000);
      } catch {}
    }

    await browser.close();

    const exito = !!(pdfBuffer || xmlBuffer);
    return {
      exito,
      emisor: "Costco Wholesale México, S.A. de C.V.",
      total,
      pdfBuffer,
      xmlBuffer,
      mensaje: exito
        ? `Factura generada exitosamente en Costco México por un monto de \$${totalStr}.`
        : `Solicitud enviada a Costco México. Si ya estaba timbrada o el portal la envió directamente a tu correo (${emailDestino}), revisa tu bandeja de entrada.`,
      ticketIds: [ticketItem.id],
    };
  } catch (err: any) {
    await browser.close();
    return {
      exito: false,
      emisor: "Costco Wholesale México",
      total,
      mensaje: `Error al interactuar con Costco México: ${err?.message || err}`,
      ticketIds: [ticketItem.id],
    };
  }
}
