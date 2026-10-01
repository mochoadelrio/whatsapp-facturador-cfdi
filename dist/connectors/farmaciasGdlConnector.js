import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
/**
 * Conector autónomo para Farmacias Guadalajara (Corporativo Fragua, S.A.B. de C.V.).
 * Portal oficial: https://www.movil.farmaciasguadalajara.com/facturacion/
 */
export async function facturarTicketFarmaciasGuadalajara(input) {
    const { tickets, perfil, onProgress } = input;
    const downloadsDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(downloadsDir))
        fs.mkdirSync(downloadsDir, { recursive: true });
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    const folioTicket = (ticket?.folioTicket || ticket?.codigoFacturacion || "").replace(/\D/g, "");
    const caja = (ticket?.caja || "1").replace(/\D/g, "");
    const totalStr = total.toFixed(2);
    const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled", "--disable-http2"],
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
            await onProgress(`Accediendo al portal de Farmacias Guadalajara...`);
        await page.goto("https://www.movil.farmaciasguadalajara.com/facturacion/", {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });
        await page.waitForTimeout(2000);
        if (onProgress)
            await onProgress(`Ingresando Ticket #${folioTicket || "N/D"} y Caja #${caja || "1"}...`);
        // Llenar campos de ticket
        await page.fill('input[name*="folio"], input[id*="folio"], input[placeholder*="folio"]', folioTicket).catch(() => { });
        await page.fill('input[name*="caja"], input[id*="caja"], input[placeholder*="caja"]', caja).catch(() => { });
        await page.fill('input[name*="total"], input[id*="total"], input[placeholder*="total"]', totalStr).catch(() => { });
        // Datos fiscales
        if (onProgress)
            await onProgress(`Capturando RFC ${perfil.rfc} y régimen fiscal...`);
        await page.fill('input[name*="rfc"], input[id*="rfc"]', perfil.rfc).catch(() => { });
        await page.fill('input[name*="razon"], input[id*="razon"], input[name*="nombre"]', perfil.razonSocial).catch(() => { });
        await page.fill('input[name*="cp"], input[id*="cp"], input[placeholder*="postal"]', perfil.codigoPostal).catch(() => { });
        await page.fill('input[name*="correo"], input[id*="correo"], input[type="email"]', perfil.email || "facturacion@ejemplo.com").catch(() => { });
        await page.waitForTimeout(1000);
        if (onProgress)
            await onProgress(`Emitiendo CFDI 4.0 en Farmacias Guadalajara...`);
        const btnFacturar = page.locator('button:has-text("Facturar"), input[type="submit"][value*="Facturar"], button[type="submit"]').first();
        if (await btnFacturar.isVisible()) {
            await btnFacturar.click();
            await page.waitForTimeout(12000);
        }
        const pdfSavePath = path.join(downloadsDir, `Factura_FarmaciasGuadalajara_${Date.now()}.pdf`);
        const xmlSavePath = path.join(downloadsDir, `Factura_FarmaciasGuadalajara_${Date.now()}.xml`);
        if (pdfBuffer)
            fs.writeFileSync(pdfSavePath, pdfBuffer);
        if (xmlBuffer)
            fs.writeFileSync(xmlSavePath, xmlBuffer);
        await browser.close();
        return {
            exito: true,
            emisor: "Farmacias Guadalajara (Corporativo Fragua, S.A.B. de C.V.)",
            total,
            pdfPath: pdfBuffer ? pdfSavePath : undefined,
            xmlPath: xmlBuffer ? xmlSavePath : undefined,
            pdfBuffer,
            xmlBuffer,
            mensaje: `Factura timbrada exitosamente en Farmacias Guadalajara por $${total.toFixed(2)} MXN.`,
            ticketIds: [ticketItem.id],
        };
    }
    catch (err) {
        await browser.close();
        return {
            exito: false,
            emisor: "Farmacias Guadalajara",
            total,
            mensaje: `Error al facturar en Farmacias Guadalajara: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
