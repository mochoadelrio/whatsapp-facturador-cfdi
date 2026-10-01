import { chromium } from "playwright";
import * as path from "path";
import { GoogleGenAI } from "@google/genai";
/**
 * Conector autónomo para Tiendas Chedraui / Selecto Chedraui (Tiendas Chedraui, S.A. de C.V.).
 * Muy fuerte en León, Guanajuato (Chedraui Poliforum, Torres Landa, San Juan Bosco) para compra de
 * mariscos, pescados, verduras, tostadas, salsas y abarrotes.
 * Portal oficial: https://www.masfacturaweb.com.mx/Chedraui/
 */
export async function facturarTicketChedraui(input) {
    const { tickets, perfil, onProgress } = input;
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    const folio = (ticket?.codigoFacturacion || ticket?.folioTicket || "").replace(/[^0-9]/g, "").trim();
    if (!folio) {
        return {
            exito: false,
            emisor: "Tiendas Chedraui",
            total,
            mensaje: "No se detectó el Número de Ticket numérico en el comprobante de Chedraui.",
            ticketIds: [ticketItem?.id || ""],
        };
    }
    if (onProgress) {
        await onProgress(`🛒 Conectando con portal de Tiendas Chedraui (masfacturaweb.com.mx/Chedraui) para Ticket #${folio} ($${total.toFixed(2)})...`);
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
        await page.goto("https://www.masfacturaweb.com.mx/Chedraui/", {
            waitUntil: "domcontentloaded",
            timeout: 25000,
        });
        await page.waitForTimeout(1500);
        // 1. Abrir formulario de Crear Factura (#imbCrearFactura)
        await page.evaluate(() => {
            const btnClose = document.getElementById("btnClose");
            if (btnClose)
                btnClose.click();
            const imbCrear = document.getElementById("imbCrearFactura");
            if (imbCrear)
                imbCrear.click();
        });
        await page.waitForTimeout(2500);
        // 2. Separar RFC en base y homoclave (últimos 3 caracteres)
        const rfcClean = perfil.rfc.trim().toUpperCase();
        const rfcBase = rfcClean.slice(0, -3);
        const homoclave = rfcClean.slice(-3);
        const txtRfc = page.locator("#txtRFC").first();
        const txtHomo = page.locator("#txtHomoCve").first();
        const txtTicket = page.locator("#txtNumTicket").first();
        if (await txtRfc.isVisible().catch(() => false)) {
            await txtRfc.fill(rfcBase);
        }
        if (await txtHomo.isVisible().catch(() => false)) {
            await txtHomo.fill(homoclave);
        }
        if (await txtTicket.isVisible().catch(() => false)) {
            await txtTicket.fill(folio);
        }
        // 3. Resolver Captcha (#txtCodigo) con Gemini Vision si está presente
        const txtCodigo = page.locator("#txtCodigo").first();
        if (await txtCodigo.isVisible().catch(() => false)) {
            const captchaImg = page.locator("img[src*='Captcha' i], #imgCaptcha, #Image1").first();
            if ((await captchaImg.isVisible().catch(() => false)) && process.env.GEMINI_API_KEY) {
                const imgBuf = await captchaImg.screenshot();
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const resp = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: [
                        {
                            inlineData: {
                                mimeType: "image/png",
                                data: imgBuf.toString("base64"),
                            },
                        },
                        {
                            text: "Devuelve únicamente los caracteres exactos de este captcha (letras y números sin espacios).",
                        },
                    ],
                });
                const code = (resp.text || "").replace(/\s+/g, "").trim();
                if (code) {
                    await txtCodigo.fill(code);
                }
            }
        }
        // 4. Avanzar al siguiente paso (#imgSiguiente)
        await page.evaluate(() => {
            const next = document.getElementById("imgSiguiente");
            if (next)
                next.click();
        });
        await page.waitForTimeout(3500);
        // 5. Llenar datos fiscales CFDI 4.0 si el portal los solicita
        const razonInput = page.locator("input[name*='Razon' i], input[id*='Razon' i], input[id*='Nombre' i]").first();
        if (await razonInput.isVisible().catch(() => false)) {
            await razonInput.fill(perfil.razonSocial);
        }
        const cpInput = page.locator("input[name*='CP' i], input[id*='CP' i], input[id*='Postal' i]").first();
        if (await cpInput.isVisible().catch(() => false)) {
            await cpInput.fill(perfil.codigoPostal);
        }
        const emailInput = page.locator("input[name*='Correo' i], input[id*='Correo' i], input[id*='Mail' i]").first();
        if (await emailInput.isVisible().catch(() => false)) {
            await emailInput.fill(perfil.email || "mochoad@icloud.com");
        }
        // Capturar descargas de PDF y XML
        const downloadsDir = path.resolve(process.cwd(), "downloads");
        let downloadedPdf;
        let downloadedXml;
        page.on("download", async (download) => {
            const suggested = download.suggestedFilename();
            const dest = path.join(downloadsDir, `CHEDRAUI_${Date.now()}_${suggested}`);
            await download.saveAs(dest);
            if (dest.toLowerCase().endsWith(".pdf"))
                downloadedPdf = dest;
            if (dest.toLowerCase().endsWith(".xml"))
                downloadedXml = dest;
        });
        const btnTimbrar = page
            .locator("input[id*='Facturar' i], input[id*='Generar' i], input[id*='Timbrar' i], button:has-text('Facturar')")
            .first();
        if (await btnTimbrar.isVisible().catch(() => false)) {
            await btnTimbrar.click().catch(() => { });
            await page.waitForTimeout(4500);
        }
        await browser.close();
        if (downloadedPdf || downloadedXml) {
            return {
                exito: true,
                emisor: "Tiendas Chedraui",
                folio,
                total,
                pdfPath: downloadedPdf,
                xmlPath: downloadedXml,
                mensaje: "Factura generada exitosamente en el portal de Tiendas Chedraui.",
                ticketIds: [ticketItem.id],
            };
        }
        return {
            exito: false,
            emisor: "Tiendas Chedraui",
            folio,
            total,
            mensaje: `Se enviaron los datos al portal de Chedraui (RFC: ${rfcBase}-${homoclave}, Ticket: ${folio}). Verifique que el ticket tenga al menos 1 hora de emitido y que el número de ticket sea exacto.`,
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
            emisor: "Tiendas Chedraui",
            folio,
            total,
            mensaje: `Error al conectar con portal Chedraui: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
