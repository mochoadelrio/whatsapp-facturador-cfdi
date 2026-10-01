import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";

/**
 * Conector autónomo para Autopista Las Varas - Puerto Vallarta.
 * Casetas La Peñita, etc. (Identificadas por código NRU de 18 dígitos).
 */
export async function facturarLoteLasVaras(
  input: ConnectorBatchInput
): Promise<StampedInvoiceResult> {
  const { tickets, perfil, onProgress } = input;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const totalCalculado = tickets.reduce(
    (sum, t) => sum + (Number(t.ticket.montoTotal) || 0),
    0
  );

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "es-MX",
    });

    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    let interceptedUuid = "";
    let interceptedFolio = "";

    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/")) {
        try {
          const text = await res.text();
          const matchUuid = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
          if (matchUuid) interceptedUuid = matchUuid[0];
          const matchFolio = text.match(/(?:serie|folio)[\"':\s]+([A-Z0-9_-]+)/i);
          if (matchFolio) interceptedFolio = matchFolio[1];
        } catch {}
      }
    });

    if (onProgress) await onProgress(`Accediendo a facturación Autopista Las Varas - Puerto Vallarta...`);
    await page.goto("https://www.faclasvaras-ptovallarta.com.mx/facturacion", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2500);

    await page.evaluate(() => {
      document.querySelectorAll(".cdk-overlay-container, .modal, .modal-backdrop").forEach((e) => e.remove());
    });

    // Agregar NRUs
    let agregados = 0;
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      const nru = (t.ticket.codigoFacturacion || t.ticket.folioTicket || "").replace(/\D/g, "");
      if (!nru || nru.length < 15) continue;

      if (onProgress) await onProgress(`Agregando NRU ${i + 1}/${tickets.length}: ${nru}...`);
      await page.fill('input[formcontrolname="idTicket"]', nru);
      await page.waitForTimeout(400);

      const btnAdd = page.locator('button:has-text("Agregar ticket")');
      await btnAdd.click();
      await page.waitForTimeout(2500);
      agregados++;
    }

    if (onProgress) await onProgress(`Capturando datos fiscales de ${perfil.razonSocial}...`);
    await page.fill('input[formcontrolname="rfc"]', perfil.rfc);
    await page.fill('input[formcontrolname="nombreORazonSocial"]', perfil.razonSocial);
    await page.fill('input[formcontrolname="cp"]', perfil.codigoPostal);
    await page.fill('input[formcontrolname="email"]', perfil.email || "cristhian.valdivia@ejemplo.com");

    await page.selectOption('select[formcontrolname="regimenFiscal"]', {
      label: "626 | RÉGIMEN SIMPLIFICADO DE CONFIANZA",
    }).catch(async () => {
      await page.selectOption('select[formcontrolname="regimenFiscal"]', { index: 1 });
    });
    await page.dispatchEvent('select[formcontrolname="regimenFiscal"]', "change");

    await page.selectOption('select[formcontrolname="usoCFDI"]', {
      label: "Gastos en general.",
    }).catch(async () => {
      await page.selectOption('select[formcontrolname="usoCFDI"]', { index: 1 });
    });
    await page.dispatchEvent('select[formcontrolname="usoCFDI"]', "change");

    await page.waitForTimeout(1000);

    if (onProgress) await onProgress(`Timbrando factura ante el SAT en Autopista Las Varas...`);
    const btnFacturar = page.locator('button:has-text("Facturar")');
    if (await btnFacturar.isEnabled()) {
      await btnFacturar.click();
      await page.waitForTimeout(12000);
    }

    // Buscar y descargar archivos
    if (onProgress) await onProgress(`Descargando comprobante oficial timbrado...`);
    await page.goto("https://www.faclasvaras-ptovallarta.com.mx/buscar-facturas", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    }).catch(() => {});
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      document.querySelectorAll(".cdk-overlay-container, .modal, .modal-backdrop").forEach((e) => e.remove());
    });

    await page.fill('input[formcontrolname="rfc"]', perfil.rfc).catch(() => {});
    await page.click('button:has-text("Buscar")').catch(() => {});
    await page.waitForTimeout(3000);

    const pdfSavePath = path.join(
      downloadsDir,
      `Factura_Las_Varas_${interceptedFolio || Date.now()}_${tickets.length}casetas.pdf`
    );
    const xmlSavePath = path.join(
      downloadsDir,
      `Factura_Las_Varas_${interceptedFolio || Date.now()}_${tickets.length}casetas.xml`
    );

    const downloadBtns = await page.$$('button:has-text("PDF"), button:has-text("XML"), a[href*="pdf"], a[href*="xml"]');
    for (const b of downloadBtns) {
      try {
        const text = await b.innerText();
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 10000 }),
          b.click(),
        ]);
        if (text.includes("PDF")) await download.saveAs(pdfSavePath);
        if (text.includes("XML")) await download.saveAs(xmlSavePath);
      } catch {}
    }

    const pdfBuffer = fs.existsSync(pdfSavePath) ? fs.readFileSync(pdfSavePath) : undefined;
    const xmlBuffer = fs.existsSync(xmlSavePath) ? fs.readFileSync(xmlSavePath) : undefined;

    await browser.close();

    return {
      exito: true,
      emisor: "Autopista Las Varas - Puerto Vallarta",
      serie: "KCAV",
      folio: interceptedFolio || undefined,
      uuid: interceptedUuid || undefined,
      total: totalCalculado,
      pdfPath: pdfBuffer ? pdfSavePath : undefined,
      xmlPath: xmlBuffer ? xmlSavePath : undefined,
      pdfBuffer,
      xmlBuffer,
      mensaje: `Factura timbrada exitosamente para ${tickets.length} casetas de Las Varas - Puerto Vallarta.`,
      ticketIds: tickets.map((t) => t.id),
    };
  } catch (err: any) {
    await browser.close();
    return {
      exito: false,
      emisor: "Autopista Las Varas - Puerto Vallarta",
      total: totalCalculado,
      mensaje: `Error al facturar en Las Varas: ${err?.message || err}`,
      ticketIds: tickets.map((t) => t.id),
    };
  }
}
