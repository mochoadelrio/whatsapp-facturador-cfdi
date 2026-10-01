import { chromium } from "playwright";
import * as path from "path";
import { solicitarFacturaPorCorreo } from "./emailInvoiceConnector.js";
/**
 * Conector autónomo para AutoZone de México (AutoZone, S. de R.L. de C.V.).
 * Portal oficial: https://www.autozone.com.mx/lp/factura-electronica
 * Requiere: Folio de 16 dígitos (debajo del código de barras), Fecha de compra, Monto total y Datos Fiscales CFDI 4.0.
 * Si el portal presenta bloqueo anti-bot (DataDome) o requiere validación manual, ejecuta fallback automático
 * enviando el ticket + Constancia de Situación Fiscal en PDF a facturaelectronica@autozone.com.
 */
export async function facturarTicketAutoZone(input) {
    const { tickets, perfil, onProgress } = input;
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    // En AutoZone el folio suele ser de 16 dígitos numéricos debajo del código de barras
    const rawFolio = (ticket?.codigoFacturacion || ticket?.folioTicket || "").replace(/[^0-9A-Za-z]/g, "").trim();
    const fechaCompra = ticket?.fechaCompra || new Date().toISOString().slice(0, 10);
    if (onProgress) {
        await onProgress(`🚗 Conectando con portal de AutoZone México para facturar Ticket #${rawFolio || "S/F"} ($${total.toFixed(2)})...`);
    }
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
    });
    try {
        const context = await browser.newContext({
            acceptDownloads: true,
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();
        const portalUrl = ticket?.urlPortalFacturacion && ticket.urlPortalFacturacion.startsWith("http")
            ? ticket.urlPortalFacturacion
            : "https://www.autozone.com.mx/lp/factura-electronica";
        await page.goto(portalUrl, {
            waitUntil: "domcontentloaded",
            timeout: 25000,
        });
        await page.waitForTimeout(3000);
        // Verificar si DataDome / Captcha bloquea el portal web
        const frames = page.frames().map((f) => f.url());
        const hasDataDome = frames.some((u) => u.includes("captcha-delivery.com") || u.includes("datadome"));
        if (!hasDataDome && rawFolio) {
            // Buscar enlace o iframe de facturación dentro de la página de AutoZone
            const linkFacturar = page.locator("a[href*='factura'], button:has-text('Solicita tu factura'), a:has-text('Solicita tu factura')").first();
            if (await linkFacturar.isVisible().catch(() => false)) {
                await linkFacturar.click().catch(() => { });
                await page.waitForTimeout(2500);
            }
            // Intentar llenar campos de ticket (16 dígitos), fecha, monto y RFC
            const rfcInput = page.locator("input[name*='rfc' i], input[id*='rfc' i], input[placeholder*='RFC' i]").first();
            const ticketInput = page
                .locator("input[name*='ticket' i], input[id*='ticket' i], input[name*='folio' i], input[placeholder*='16' i], input[placeholder*='ticket' i]")
                .first();
            const montoInput = page
                .locator("input[name*='monto' i], input[name*='total' i], input[id*='total' i], input[placeholder*='Total' i]")
                .first();
            if (await ticketInput.isVisible().catch(() => false)) {
                await ticketInput.fill(rawFolio);
                if (await rfcInput.isVisible().catch(() => false)) {
                    await rfcInput.fill(perfil.rfc);
                }
                if (await montoInput.isVisible().catch(() => false)) {
                    await montoInput.fill(total.toFixed(2));
                }
                const btnBuscar = page
                    .locator("button:has-text('Buscar'), button:has-text('Continuar'), button:has-text('Siguiente'), input[type='submit']")
                    .first();
                if (await btnBuscar.isVisible().catch(() => false)) {
                    await btnBuscar.click().catch(() => { });
                    await page.waitForTimeout(3500);
                }
                // Llenar datos fiscales CFDI 4.0 si aparecen
                const razonInput = page.locator("input[name*='razon' i], input[name*='nombre' i], input[id*='razon' i]").first();
                if (await razonInput.isVisible().catch(() => false)) {
                    await razonInput.fill(perfil.razonSocial);
                }
                const cpInput = page.locator("input[name*='cp' i], input[name*='postal' i], input[id*='cp' i]").first();
                if (await cpInput.isVisible().catch(() => false)) {
                    await cpInput.fill(perfil.codigoPostal);
                }
                const emailInput = page.locator("input[type='email'], input[name*='correo' i], input[name*='mail' i]").first();
                if (await emailInput.isVisible().catch(() => false)) {
                    await emailInput.fill(perfil.email || "mochoad@icloud.com");
                }
                // Capturar posible descarga
                const downloadsDir = path.resolve(process.cwd(), "downloads");
                let downloadedPdf;
                let downloadedXml;
                page.on("download", async (download) => {
                    const suggested = download.suggestedFilename();
                    const dest = path.join(downloadsDir, `AUTOZONE_${Date.now()}_${suggested}`);
                    await download.saveAs(dest);
                    if (dest.toLowerCase().endsWith(".pdf"))
                        downloadedPdf = dest;
                    if (dest.toLowerCase().endsWith(".xml"))
                        downloadedXml = dest;
                });
                const btnFacturar = page
                    .locator("button:has-text('Facturar'), button:has-text('Generar Factura'), button:has-text('Timbrar')")
                    .first();
                if (await btnFacturar.isVisible().catch(() => false)) {
                    await btnFacturar.click().catch(() => { });
                    await page.waitForTimeout(4500);
                }
                if (downloadedPdf || downloadedXml) {
                    await browser.close();
                    return {
                        exito: true,
                        emisor: "AutoZone de México",
                        folio: rawFolio,
                        total,
                        pdfPath: downloadedPdf,
                        xmlPath: downloadedXml,
                        mensaje: "Factura generada exitosamente en el portal de AutoZone México.",
                        ticketIds: [ticketItem.id],
                    };
                }
            }
        }
        await browser.close();
        // Fallback garantizado: Solicitud oficial por correo a facturaelectronica@autozone.com adjuntando foto del ticket y CSF en PDF
        if (onProgress) {
            await onProgress(`✉️ El portal web de AutoZone requiere verificación antibot o atención directa. Enviando solicitud automática con Ticket + CSF a facturaelectronica@autozone.com...`);
        }
        const emailRes = await solicitarFacturaPorCorreo(input, "facturaelectronica@autozone.com");
        if (emailRes.exito) {
            return {
                ...emailRes,
                emisor: "AutoZone de México",
                folio: rawFolio || emailRes.folio,
            };
        }
        return {
            exito: false,
            emisor: "AutoZone de México",
            folio: rawFolio,
            total,
            mensaje: `AutoZone: Para facturar en el portal (${portalUrl}) se requiere el folio de 16 dígitos debajo del código de barras (${rawFolio || "no detectado"}), fecha (${fechaCompra}) y monto ($${total.toFixed(2)}), o enviar ticket y CSF a facturaelectronica@autozone.com.`,
            ticketIds: [ticketItem.id],
        };
    }
    catch (err) {
        try {
            await browser.close();
        }
        catch { }
        // Intentar fallback por correo ante cualquier error de red en el portal
        try {
            const emailRes = await solicitarFacturaPorCorreo(input, "facturaelectronica@autozone.com");
            if (emailRes.exito) {
                return {
                    ...emailRes,
                    emisor: "AutoZone de México",
                };
            }
        }
        catch { }
        return {
            exito: false,
            emisor: "AutoZone de México",
            folio: rawFolio,
            total,
            mensaje: `Error al conectar con AutoZone México: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
