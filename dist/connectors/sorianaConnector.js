import { chromium } from "playwright";
import * as path from "path";
import { solicitarFacturaPorCorreo } from "./emailInvoiceConnector.js";
/**
 * Conector autónomo para Organización Soriana y City Club (Tiendas Soriana, S.A. de C.V.).
 * Muy utilizado en León, Guanajuato (City Club López Mateos y Soriana Híper) para compra mayorista
 * de bebidas, cervezas, abarrotes, desechables e insumos de marisquería/restaurante.
 * Portal oficial: https://www.soriana.com/facturacion-electronica.html / https://www.cityclub.com.mx
 */
export async function facturarTicketSoriana(input) {
    const { tickets, perfil, onProgress } = input;
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    const folio = (ticket?.codigoFacturacion || ticket?.folioTicket || "").replace(/[^0-9A-Za-z-]/g, "").trim();
    const esCityClub = (ticket?.establecimiento || "").toUpperCase().includes("CITY CLUB") ||
        (ticketItem?.rawText || "").toUpperCase().includes("CITY CLUB");
    const nombreComercio = esCityClub ? "City Club / Soriana" : "Organización Soriana";
    if (onProgress) {
        await onProgress(`🛒 Conectando con portal de ${nombreComercio} para facturar Ticket #${folio || "S/F"} ($${total.toFixed(2)})...`);
    }
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
    });
    try {
        const context = await browser.newContext({
            acceptDownloads: true,
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        const portalUrl = ticket?.urlPortalFacturacion && ticket.urlPortalFacturacion.startsWith("http")
            ? ticket.urlPortalFacturacion
            : "https://www.soriana.com/facturacion-electronica.html";
        await page.goto(portalUrl, {
            waitUntil: "domcontentloaded",
            timeout: 25000,
        });
        await page.waitForTimeout(2500);
        // Verificar si Cloudflare bloquea el acceso automatizado
        const isCloudflareBlocked = await page
            .locator("#cf-footer-ip-reveal, #challenge-running, text=/Verify you are human/i")
            .first()
            .isVisible()
            .catch(() => false);
        if (!isCloudflareBlocked && folio) {
            const rfcInput = page.locator("input[name*='rfc' i], input[id*='rfc' i], input[placeholder*='RFC' i]").first();
            const ticketInput = page
                .locator("input[name*='ticket' i], input[id*='ticket' i], input[name*='folio' i], input[placeholder*='Ticket' i]")
                .first();
            const montoInput = page
                .locator("input[name*='total' i], input[name*='monto' i], input[id*='total' i]")
                .first();
            if (await ticketInput.isVisible().catch(() => false)) {
                await ticketInput.fill(folio);
                if (await rfcInput.isVisible().catch(() => false))
                    await rfcInput.fill(perfil.rfc);
                if (await montoInput.isVisible().catch(() => false))
                    await montoInput.fill(total.toFixed(2));
                const downloadsDir = path.resolve(process.cwd(), "downloads");
                let downloadedPdf;
                let downloadedXml;
                page.on("download", async (download) => {
                    const suggested = download.suggestedFilename();
                    const dest = path.join(downloadsDir, `SORIANA_${Date.now()}_${suggested}`);
                    await download.saveAs(dest);
                    if (dest.toLowerCase().endsWith(".pdf"))
                        downloadedPdf = dest;
                    if (dest.toLowerCase().endsWith(".xml"))
                        downloadedXml = dest;
                });
                const btnSubmit = page
                    .locator("button:has-text('Facturar'), button:has-text('Continuar'), button:has-text('Generar'), input[type='submit']")
                    .first();
                if (await btnSubmit.isVisible().catch(() => false)) {
                    await btnSubmit.click().catch(() => { });
                    await page.waitForTimeout(4500);
                }
                if (downloadedPdf || downloadedXml) {
                    await browser.close();
                    return {
                        exito: true,
                        emisor: nombreComercio,
                        folio,
                        total,
                        pdfPath: downloadedPdf,
                        xmlPath: downloadedXml,
                        mensaje: `Factura generada exitosamente en el portal de ${nombreComercio}.`,
                        ticketIds: [ticketItem.id],
                    };
                }
            }
        }
        await browser.close();
        // Fallback por correo oficial de atención a clientes de City Club / Soriana
        const emailSoporte = esCityClub ? "ayudacityclub@soriana.com" : "ayudaclientes@soriana.com";
        const emailRes = await solicitarFacturaPorCorreo(input, emailSoporte);
        if (emailRes.exito) {
            return {
                ...emailRes,
                emisor: nombreComercio,
                folio: folio || emailRes.folio,
            };
        }
        return {
            exito: false,
            emisor: nombreComercio,
            folio,
            total,
            mensaje: `El portal de ${nombreComercio} tiene protección Cloudflare activa. Puede facturar con el Ticket #${folio} ($${total.toFixed(2)}) en ${portalUrl} o vía correo a ${emailSoporte}.`,
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
            emisor: nombreComercio,
            folio,
            total,
            mensaje: `Error al conectar con ${nombreComercio}: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
