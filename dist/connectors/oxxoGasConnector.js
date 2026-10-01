import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
/**
 * Conector autónomo para OXXO Gas (Servicios Gasolineros de México, S.A. de C.V.).
 * Portal oficial: https://facturacion.oxxogas.com
 */
export async function facturarTicketOxxoGas(input) {
    const { tickets, perfil, onProgress } = input;
    const downloadsDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(downloadsDir))
        fs.mkdirSync(downloadsDir, { recursive: true });
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    // Extraer folio de ticket y total
    const folio = (ticket?.folioTicket || ticket?.codigoFacturacion || "").replace(/\D/g, "");
    const totalStr = total.toFixed(2);
    const rfc = perfil.rfc.trim().toUpperCase();
    const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
    });
    try {
        const context = await browser.newContext({
            acceptDownloads: true,
            ignoreHTTPSErrors: true,
            viewport: { width: 1280, height: 900 },
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        let pdfBuffer;
        let xmlBuffer;
        page.on("download", async (download) => {
            const filename = download.suggestedFilename();
            const savePath = path.join(downloadsDir, filename);
            await download.saveAs(savePath);
            if (filename.endsWith(".pdf"))
                pdfBuffer = fs.readFileSync(savePath);
            if (filename.endsWith(".xml"))
                xmlBuffer = fs.readFileSync(savePath);
        });
        if (onProgress)
            await onProgress(`Accediendo al portal oficial de facturación OXXO GAS...`);
        await page.goto("https://facturacion.oxxogas.com/imprimir", {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });
        await page.waitForTimeout(1500);
        if (onProgress)
            await onProgress(`Consultando Folio #${folio} y Total \$${totalStr} para RFC ${rfc}...`);
        // Llenar campos de búsqueda directa
        if (await page.locator("#rfc").isVisible()) {
            await page.fill("#rfc", rfc);
        }
        if (await page.locator("#folio").isVisible()) {
            await page.fill("#folio", folio);
        }
        if (await page.locator("#total").isVisible()) {
            await page.fill("#total", totalStr);
        }
        // Seleccionar descarga PDF
        if (await page.locator("#archivo_pdf").isVisible()) {
            await page.check("#archivo_pdf");
        }
        // Clic en DESCARGAR FACTURA
        if (await page.locator("#descargar_documento").isVisible()) {
            await page.click("#descargar_documento");
            await page.waitForTimeout(4000);
        }
        // Si obtuvo PDF, intentar obtener XML seleccionando el radio de xml
        if (pdfBuffer && (await page.locator("#archivo_xml").isVisible())) {
            await page.check("#archivo_xml");
            await page.click("#descargar_documento");
            await page.waitForTimeout(3000);
        }
        // Revisar si hubo mensaje de error en la página
        const errorText = await page.evaluate(() => {
            const el = document.querySelector(".alert, .error, .toast, .swal2-html-container");
            return el ? el.textContent?.trim() : "";
        });
        await browser.close();
        const exito = !!(pdfBuffer || xmlBuffer);
        return {
            exito,
            emisor: "Servicios Gasolineros de México, S.A. de C.V. (OXXO GAS)",
            total,
            pdfBuffer,
            xmlBuffer,
            mensaje: exito
                ? `Factura OXXO GAS descargada exitosamente por un total de \$${totalStr}.`
                : errorText
                    ? `OXXO GAS reportó: ${errorText}`
                    : `El ticket #${folio} de OXXO GAS fue procesado en el portal. Si la carga requiere asociación previa de cuenta corporativa FEMSA, te llegará también al correo registrado.`,
            ticketIds: [ticketItem.id],
        };
    }
    catch (err) {
        await browser.close();
        return {
            exito: false,
            emisor: "OXXO GAS",
            total,
            mensaje: `Error en conector OXXO GAS: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
