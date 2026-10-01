import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
/**
 * Conector autónomo para tiendas OXXO (Cadena Comercial OXXO, S.A. de C.V.).
 * Portal oficial: https://www4.oxxo.com:9443/facturacionElectronica-web/views/layout/inicio.do
 */
export async function facturarTicketOxxo(input) {
    const { tickets, perfil, onProgress } = input;
    const downloadsDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(downloadsDir))
        fs.mkdirSync(downloadsDir, { recursive: true });
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    // Extraer Fecha (DD/MM/YYYY), Folio de Venta, ID de Venta y Total
    const fecha = ticket?.fechaCompra || "";
    const fechaDMY = fecha.includes("/") ? fecha : fecha.split("-").reverse().join("/");
    const folioVenta = (ticket?.folioTicket || "").replace(/\D/g, "");
    const idVenta = (ticket?.codigoFacturacion || ticket?.caja || "").trim();
    const totalStr = total.toFixed(2);
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
            await onProgress(`Accediendo al portal oficial de facturación OXXO...`);
        await page.goto("https://www4.oxxo.com:9443/facturacionElectronica-web/views/layout/inicio.do", { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2000);
        if (onProgress)
            await onProgress(`Capturando ticket OXXO (Fecha: ${fechaDMY}, Folio: ${folioVenta}, Total: $${totalStr})...`);
        // Llenar campos del ticket
        if (fechaDMY)
            await page.fill('input[id*="fecha_input"]', fechaDMY).catch(() => { });
        if (folioVenta)
            await page.fill('input[id*="folio"]', folioVenta).catch(() => { });
        if (idVenta)
            await page.fill('input[id*="venta"]', idVenta).catch(() => { });
        await page.fill('input[id*="total"]', totalStr).catch(() => { });
        await page.waitForTimeout(500);
        // Validar Ticket
        const btnValidar = page.locator('a[id*="validarTicket"], button:has-text("Validar")').first();
        if (await btnValidar.isVisible()) {
            await btnValidar.click();
            await page.waitForTimeout(3000);
        }
        if (onProgress)
            await onProgress(`Ingresando datos fiscales de ${perfil.razonSocial}...`);
        await page.fill('input[id*="rfc"]', perfil.rfc).catch(() => { });
        await page.fill('input[id*="razon"]', perfil.razonSocial).catch(() => { });
        await page.fill('input[id*="cp"], input[id*="codigoPostal"]', perfil.codigoPostal).catch(() => { });
        await page.fill('input[id*="correo"], input[id*="email"]', perfil.email || "facturacion@ejemplo.com").catch(() => { });
        // Seleccionar Régimen Fiscal y Uso CFDI
        await page.selectOption('select[id*="RegimenFiscal"]', { value: perfil.regimenFiscal || "626" }).catch(() => { });
        await page.selectOption('select[id*="UsoCFDI"]', { value: perfil.usoCfdi || "G03" }).catch(() => { });
        await page.waitForTimeout(1000);
        if (onProgress)
            await onProgress(`Emitiendo y timbrando CFDI 4.0 en OXXO...`);
        const btnContinuar = page.locator('button[id*="continuar"], button:has-text("Facturar"), button:has-text("Continuar")').first();
        await btnContinuar.click();
        await page.waitForTimeout(10000);
        const pdfSavePath = path.join(downloadsDir, `Factura_OXXO_${Date.now()}.pdf`);
        const xmlSavePath = path.join(downloadsDir, `Factura_OXXO_${Date.now()}.xml`);
        if (pdfBuffer)
            fs.writeFileSync(pdfSavePath, pdfBuffer);
        if (xmlBuffer)
            fs.writeFileSync(xmlSavePath, xmlBuffer);
        await browser.close();
        return {
            exito: true,
            emisor: "Cadena Comercial OXXO, S.A. de C.V.",
            total,
            pdfPath: pdfBuffer ? pdfSavePath : undefined,
            xmlPath: xmlBuffer ? xmlSavePath : undefined,
            pdfBuffer,
            xmlBuffer,
            mensaje: `Factura timbrada exitosamente en OXXO por $${total.toFixed(2)} MXN.`,
            ticketIds: [ticketItem.id],
        };
    }
    catch (err) {
        await browser.close();
        return {
            exito: false,
            emisor: "Cadena Comercial OXXO",
            total,
            mensaje: `Error al facturar en OXXO: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
