import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { ConnectorBatchInput, StampedInvoiceResult } from "./types.js";

/**
 * Conector autónomo para Autopista Jala - Compostela (PeajeClic).
 * Soporta múltiples casetas agregadas en tabla dinámica appendGrid.
 */
export async function facturarLoteJalaCompostela(
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
      ignoreHTTPSErrors: true,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();
    page.on("dialog", async (d) => {
      await d.accept().catch(() => {});
    });

    let interceptedUuid = "";
    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("uuid=") || url.includes("ObtenerPDF40.php")) {
        const match = url.match(/uuid=([0-9a-fA-F-]+)/);
        if (match) interceptedUuid = match[1];
      }
    });

    if (onProgress) await onProgress(`Accediendo al portal de Autopista Jala - Compostela...`);
    await page.goto("https://facturacionjalacompostela.com/peajeclic/#no-back-button", {
      waitUntil: "load",
      timeout: 60000,
    });
    await page.waitForTimeout(2000);

    // Cerrar avisos
    await page.evaluate(() => {
      document.querySelectorAll(".modal, .close, .close2, .close3").forEach((el: any) => el.click());
    });

    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      const rowIdx = i + 1;
      const folio = (t.ticket.folioTicket || "").padStart(8, "0");
      const fecha = t.ticket.fechaCompra || "";
      const fechaDMY = fecha.includes("/") ? fecha : fecha.split("-").reverse().join("/");
      const horaStr = t.ticket.horaCompra || "12:00:00";
      const [hh, mm, ss] = horaStr.split(":");
      const totalStr = Number(t.ticket.montoTotal).toFixed(2);

      if (i > 0) {
        await page.evaluate(() => {
          (window as any).$("#tblAppendGrid").appendGrid("appendRow", 1);
        });
        await page.waitForTimeout(500);
      }

      if (onProgress) await onProgress(`Capturando caseta ${rowIdx}/${tickets.length} (Folio: ${folio}, $${totalStr})...`);

      await page.fill(`#tblAppendGrid_Folio_${rowIdx}`, folio);
      await page.fill(`#tblAppendGrid_Fecha_${rowIdx}`, fechaDMY);
      await page.fill(`#tblAppendGrid_Hora_${rowIdx}`, hh || "12");
      await page.fill(`#tblAppendGrid_Minuto_${rowIdx}`, mm || "00");
      await page.fill(`#tblAppendGrid_Segundo_${rowIdx}`, ss || "00");
      await page.selectOption(`#tblAppendGrid_Pago_${rowIdx}`, "Efectivo").catch(() => {});
      await page.fill(`#tblAppendGrid_Total_${rowIdx}`, totalStr);
    }

    if (onProgress) await onProgress(`Validando folios en el sistema PeajeClic...`);
    await page.click("#comprobar");
    await page.waitForTimeout(3000);

    const navPromise = page.waitForNavigation({ waitUntil: "load" });
    await page.click("#enviar");
    await navPromise;
    await page.waitForTimeout(2000);

    if (onProgress) await onProgress(`Vinculando RFC ${perfil.rfc} y régimen fiscal...`);
    await page.fill("#rfc", perfil.rfc);
    await page.click("#buscar_rfc");
    await page.waitForTimeout(2500);

    const email = perfil.email || "cristhian.valdivia@ejemplo.com";
    await page.fill("#correo", email);
    await page.fill("#correo2", email);

    await page.evaluate((reg) => {
      const rf = document.querySelector("#regimen_fiscal_fisica") as HTMLSelectElement;
      if (rf) rf.value = reg;
      const ro = document.querySelector("#regimen_fiscal_oculto") as HTMLInputElement;
      if (ro) ro.value = reg;
    }, perfil.regimenFiscal || "626");

    if (onProgress) await onProgress(`Timbrando CFDI 4.0 oficial ante el SAT...`);
    await page.click("#facturar_guardar");
    await page.waitForTimeout(10000);

    const pdfSavePath = path.join(downloadsDir, `Factura_Jala_Compostela_JC_${Date.now()}.pdf`);
    const xmlSavePath = path.join(downloadsDir, `Factura_Jala_Compostela_JC_${Date.now()}.xml`);

    // Descargar PDF y XML
    const downloadUrls = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href*='ObtenerPDF'], a[href*='ObtenerXML'], a[href*='.pdf'], a[href*='.xml']"));
      return anchors.map((a: any) => a.href);
    });

    let pdfBuffer: Buffer | undefined;
    let xmlBuffer: Buffer | undefined;

    for (const u of downloadUrls) {
      if (u.includes("PDF") || u.endsWith(".pdf")) {
        const r = await page.request.get(u);
        pdfBuffer = await r.body();
        fs.writeFileSync(pdfSavePath, pdfBuffer);
      } else if (u.includes("XML") || u.endsWith(".xml")) {
        const r = await page.request.get(u);
        xmlBuffer = await r.body();
        fs.writeFileSync(xmlSavePath, xmlBuffer);
      }
    }

    await browser.close();

    return {
      exito: true,
      emisor: "Autopista Jala - Compostela",
      serie: "JC",
      uuid: interceptedUuid || undefined,
      total: totalCalculado,
      pdfPath: pdfBuffer ? pdfSavePath : undefined,
      xmlPath: xmlBuffer ? xmlSavePath : undefined,
      pdfBuffer,
      xmlBuffer,
      mensaje: `Factura timbrada exitosamente en Autopista Jala - Compostela para ${tickets.length} casetas.`,
      ticketIds: tickets.map((t) => t.id),
    };
  } catch (err: any) {
    await browser.close();
    return {
      exito: false,
      emisor: "Autopista Jala - Compostela",
      total: totalCalculado,
      mensaje: `Error al facturar en Jala - Compostela: ${err?.message || err}`,
      ticketIds: tickets.map((t) => t.id),
    };
  }
}
