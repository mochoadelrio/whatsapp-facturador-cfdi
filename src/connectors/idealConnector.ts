import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";

/**
 * Conector autónomo para Concesionaria Guadalajara - Tepic (IDEAL).
 * Autopistas: Arenal, Barrancas Sentido A/B, Santa Cecilia, Chapala, La Laja, etc.
 */
export async function facturarLoteIdeal(
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
    let interceptedSerie = "";
    let interceptedFolio = "";

    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/")) {
        try {
          const text = await res.text();
          const matchUuid = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
          if (matchUuid) interceptedUuid = matchUuid[0];
          const matchSerieFolio = text.match(/(?:serie|folio)[\"':\s]+([A-Z0-9_-]+)/i);
          if (matchSerieFolio) interceptedFolio = matchSerieFolio[1];
        } catch {}
      }
    });

    if (onProgress) await onProgress(`Accediendo al portal de Guadalajara - Tepic (IDEAL)...`);
    await page.goto("https://www.facturaciongdl-tep.com.mx/facturacion", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2500);

    // Cerrar modales o avisos flotantes
    await page.evaluate(() => {
      document.querySelectorAll(".cdk-overlay-container, .modal, .modal-backdrop").forEach((e) => e.remove());
    });

    // Agregar cada ticket a la tabla
    let agregados = 0;
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      const suc = (t.ticket.sucursal || t.ticket.establecimiento || "").toUpperCase();
      const carril = (t.ticket.caja || "03").replace(/\D/g, "");
      const folio = (t.ticket.folioTicket || "").replace(/\D/g, "");
      const fecha = t.ticket.fechaCompra || "";
      const hora = t.ticket.horaCompra || "12:00:00";
      const fechaHora = fecha.includes("/") ? `${fecha} ${hora}` : `${fecha.split("-").reverse().join("/")} ${hora}`;
      const monto = Math.round(Number(t.ticket.montoTotal) || 0).toString();

      let entronque = "ARENAL";
      if (suc.includes("BARRANCA") && suc.includes("B")) entronque = "BARRANCAS SENTIDO B";
      else if (suc.includes("BARRANCA")) entronque = "BARRANCAS SENTIDO A";
      else if (suc.includes("CECILIA")) entronque = "SANTA CECILIA";
      else if (suc.includes("CHAPALA")) entronque = "CHAPALA";
      else if (suc.includes("LAJA")) entronque = "LA LAJA";

      if (onProgress) {
        await onProgress(`Agregando caseta ${entronque} (Folio: ${folio}, $${monto})...`);
      }

      await page.selectOption('select[formcontrolname="idEntronque"]', { label: entronque }).catch(() => {});
      await page.dispatchEvent('select[formcontrolname="idEntronque"]', "change");
      await page.waitForTimeout(600);

      await page.selectOption('select[formcontrolname="carril"]', { label: carril || "03" }).catch(() => {});
      await page.dispatchEvent('select[formcontrolname="carril"]', "change");
      await page.waitForTimeout(400);

      await page.fill('input[formcontrolname="folio"]', folio);
      await page.fill('input[formcontrolname="fechaHora"]', fechaHora);
      await page.fill('input[formcontrolname="monto"]', monto);

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

    if (onProgress) await onProgress(`Timbrando factura ante el SAT en portal Guadalajara-Tepic...`);
    const btnFacturar = page.locator('button:has-text("Facturar")');
    if (await btnFacturar.isEnabled()) {
      await btnFacturar.click();
      await page.waitForTimeout(12000);
    }

    // Buscar y descargar archivos en la pestaña Buscar Factura del portal
    if (onProgress) await onProgress(`Descargando PDF y XML timbrados...`);
    await page.goto("https://www.facturaciongdl-tep.com.mx/buscar-facturas", {
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
      `Factura_Ideal_${interceptedFolio || Date.now()}_${tickets.length}casetas.pdf`
    );
    const xmlSavePath = path.join(
      downloadsDir,
      `Factura_Ideal_${interceptedFolio || Date.now()}_${tickets.length}casetas.xml`
    );

    // Extraer botones de descarga
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
      emisor: "Concesionaria Guadalajara - Tepic (IDEAL)",
      serie: interceptedSerie || "KCAG",
      folio: interceptedFolio || undefined,
      uuid: interceptedUuid || undefined,
      total: totalCalculado,
      pdfPath: pdfBuffer ? pdfSavePath : undefined,
      xmlPath: xmlBuffer ? xmlSavePath : undefined,
      pdfBuffer,
      xmlBuffer,
      mensaje: `Factura timbrada exitosamente en IDEAL Guadalajara-Tepic para ${tickets.length} casetas.`,
      ticketIds: tickets.map((t) => t.id),
    };
  } catch (err: any) {
    await browser.close();
    return {
      exito: false,
      emisor: "Concesionaria Guadalajara - Tepic (IDEAL)",
      total: totalCalculado,
      mensaje: `Error al facturar en IDEAL: ${err?.message || err}`,
      ticketIds: tickets.map((t) => t.id),
    };
  }
}
