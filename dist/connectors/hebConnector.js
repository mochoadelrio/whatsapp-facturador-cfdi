import { chromium } from "playwright";
import * as path from "path";
/**
 * Conector autónomo para Supermercados H-E-B México (Supermercados Internacionales HEB, S.A. de C.V.).
 * Muy fuerte en León, Guanajuato (Sucursales Cerro Gordo, López Mateos, Centro Max, Morelos) para insumos de restaurante/mariscos.
 * Portal oficial Angular Material: https://facturacion.heb.com.mx/cli/invoice-create/
 */
export async function facturarTicketHeb(input) {
    const { tickets, perfil, onProgress } = input;
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    const folio = (ticket?.folioTicket || ticket?.codigoFacturacion || "").replace(/[^0-9A-Za-z-]/g, "").trim();
    const sucursal = (ticket?.sucursal || "LEON").trim();
    const fechaCompra = ticket?.fechaCompra || new Date().toISOString().slice(0, 10);
    if (!folio) {
        return {
            exito: false,
            emisor: "Supermercados H-E-B México",
            total,
            mensaje: "No se detectó el Número de Ticket en el comprobante de H-E-B.",
            ticketIds: [ticketItem?.id || ""],
        };
    }
    if (onProgress) {
        await onProgress(`🛒 Conectando con portal de H-E-B México (facturacion.heb.com.mx) para Ticket #${folio} ($${total.toFixed(2)})...`);
    }
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
        const context = await browser.newContext({
            acceptDownloads: true,
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        await page.goto("https://facturacion.heb.com.mx/cli/invoice-create/", {
            waitUntil: "networkidle",
            timeout: 25000,
        });
        await page.waitForTimeout(2000);
        // 1. Llenar Sucursal (#mat-input-0) y seleccionar de mat-autocomplete si aparece
        const sucursalInput = page.locator("#mat-input-0").first();
        if (await sucursalInput.isVisible().catch(() => false)) {
            await sucursalInput.click();
            await sucursalInput.fill(sucursal);
            await page.waitForTimeout(1000);
            const option = page.locator("mat-option").first();
            if (await option.isVisible().catch(() => false)) {
                await option.click().catch(() => { });
            }
        }
        // 2. Llenar Número de Ticket (#mat-input-1)
        const ticketInput = page.locator("#mat-input-1").first();
        if (await ticketInput.isVisible().catch(() => false)) {
            await ticketInput.fill(folio);
        }
        // 3. Llenar Fecha (#mat-input-2)
        const fechaInput = page.locator("#mat-input-2").first();
        if (await fechaInput.isVisible().catch(() => false)) {
            await fechaInput.fill(fechaCompra);
        }
        // 4. Llenar $ Venta / Total (#mat-input-3)
        const ventaInput = page.locator("#mat-input-3").first();
        if (await ventaInput.isVisible().catch(() => false)) {
            await ventaInput.fill(total.toFixed(2));
        }
        // 5. Clic en "Agregar ticket"
        const btnAgregar = page.locator("button:has-text('Agregar ticket')").first();
        if (await btnAgregar.isVisible().catch(() => false)) {
            await btnAgregar.click().catch(() => { });
            await page.waitForTimeout(3000);
        }
        // 6. Continuar al paso de Datos Fiscales CFDI 4.0
        const btnSiguiente = page
            .locator("button:has-text('Siguiente'), button:has-text('Continuar'), button:has-text('Facturar')")
            .first();
        if (await btnSiguiente.isVisible().catch(() => false)) {
            await btnSiguiente.click().catch(() => { });
            await page.waitForTimeout(2500);
        }
        // Llenar RFC, Razón Social, CP, Régimen Fiscal, Uso CFDI y Correo
        const rfcInput = page.locator("input[placeholder*='RFC' i], input[formcontrolname*='rfc' i]").first();
        if (await rfcInput.isVisible().catch(() => false)) {
            await rfcInput.fill(perfil.rfc);
        }
        const razonInput = page
            .locator("input[placeholder*='Razón' i], input[formcontrolname*='razon' i], input[formcontrolname*='name' i]")
            .first();
        if (await razonInput.isVisible().catch(() => false)) {
            await razonInput.fill(perfil.razonSocial);
        }
        const cpInput = page
            .locator("input[placeholder*='Postal' i], input[formcontrolname*='cp' i], input[formcontrolname*='zip' i]")
            .first();
        if (await cpInput.isVisible().catch(() => false)) {
            await cpInput.fill(perfil.codigoPostal);
        }
        const emailInput = page
            .locator("input[type='email'], input[placeholder*='Correo' i], input[formcontrolname*='email' i]")
            .first();
        if (await emailInput.isVisible().catch(() => false)) {
            await emailInput.fill(perfil.email || "mochoad@icloud.com");
        }
        // Capturar descarga de archivos PDF / XML
        const downloadsDir = path.resolve(process.cwd(), "downloads");
        let downloadedPdf;
        let downloadedXml;
        page.on("download", async (download) => {
            const suggested = download.suggestedFilename();
            const dest = path.join(downloadsDir, `HEB_${Date.now()}_${suggested}`);
            await download.saveAs(dest);
            if (dest.toLowerCase().endsWith(".pdf"))
                downloadedPdf = dest;
            if (dest.toLowerCase().endsWith(".xml"))
                downloadedXml = dest;
        });
        const btnGenerar = page
            .locator("button:has-text('Generar'), button:has-text('Facturar'), button:has-text('Confirmar')")
            .first();
        if (await btnGenerar.isVisible().catch(() => false)) {
            await btnGenerar.click().catch(() => { });
            await page.waitForTimeout(4500);
        }
        const alertText = await page
            .locator("mat-error, .mat-snack-bar-container, .alert, [role='alert']")
            .first()
            .innerText()
            .catch(() => "");
        await browser.close();
        if (downloadedPdf || downloadedXml) {
            return {
                exito: true,
                emisor: "Supermercados H-E-B México",
                folio,
                total,
                pdfPath: downloadedPdf,
                xmlPath: downloadedXml,
                mensaje: "Factura generada exitosamente en el portal de H-E-B México.",
                ticketIds: [ticketItem.id],
            };
        }
        return {
            exito: false,
            emisor: "Supermercados H-E-B México",
            folio,
            total,
            mensaje: alertText
                ? `Portal H-E-B reportó: ${alertText.trim()}`
                : `Se enviaron los datos al portal H-E-B (Sucursal: ${sucursal}, Ticket: ${folio}, Total: $${total.toFixed(2)}). Verifique que la sucursal y los dígitos del ticket sean exactos.`,
            ticketIds: [ticketItem.id],
        };
    }
    catch (err) {
        try {
            await browser.close();
        }
        catch { }
        return {
            exito: false,
            emisor: "Supermercados H-E-B México",
            folio,
            total,
            mensaje: `Error al conectar con portal H-E-B México: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
