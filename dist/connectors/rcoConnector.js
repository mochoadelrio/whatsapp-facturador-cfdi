import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
/**
 * Conector autónomo para Red de Carreteras de Occidente (RCO / Red Vía Corta).
 * Soporta facturación individual y por lotes (hasta 20 tickets agrupados en 1 sola factura).
 */
export async function facturarLoteRco(input) {
    const { tickets, perfil, onProgress } = input;
    const downloadsDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(downloadsDir))
        fs.mkdirSync(downloadsDir, { recursive: true });
    const totalCalculado = tickets.reduce((sum, t) => sum + (Number(t.ticket.montoTotal) || 0), 0);
    const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
    });
    try {
        const context = await browser.newContext({
            acceptDownloads: true,
            viewport: { width: 1280, height: 900 },
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        if (onProgress)
            await onProgress(`Accediendo al portal de Red Vía Corta (RCO)...`);
        await page.goto("https://redviacorta.mx/es/factura", {
            waitUntil: "networkidle",
            timeout: 60000,
        });
        // Agregar cada ticket al formulario
        let agregados = 0;
        for (let i = 0; i < tickets.length; i++) {
            const t = tickets[i];
            const uid = (t.ticket.codigoFacturacion || t.ticket.folioTicket || "").replace(/\D/g, "");
            const totalStr = Number(t.ticket.montoTotal).toFixed(2);
            if (!uid || uid.length < 15) {
                console.warn(`[RCO] UID inválido o no reconocido: ${uid}`);
                continue;
            }
            if (onProgress) {
                await onProgress(`Agregando ticket ${i + 1}/${tickets.length} (Folio: ${uid.slice(-6)}, $${totalStr})...`);
            }
            await page.fill("#_com_rco_facturacion_solicitudFacturacionPortlet_ticket", uid);
            await page.fill("#_com_rco_facturacion_solicitudFacturacionPortlet_tickettotal", totalStr);
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => { }),
                page.click("#Agregar"),
            ]);
            await page.waitForTimeout(1500);
            agregados++;
        }
        if (agregados === 0) {
            throw new Error("No se pudo agregar ningún ticket válido al portal de RCO.");
        }
        if (onProgress)
            await onProgress(`Capturando datos fiscales para ${perfil.razonSocial}...`);
        await page.fill("#_com_rco_facturacion_solicitudFacturacionPortlet_rfc", perfil.rfc);
        await page.fill("#_com_rco_facturacion_solicitudFacturacionPortlet_nombre_razon_social", perfil.razonSocial);
        await page.fill("#_com_rco_facturacion_solicitudFacturacionPortlet_cp", perfil.codigoPostal);
        // Seleccionar Régimen
        await page.selectOption("#_com_rco_facturacion_solicitudFacturacionPortlet_solicitudRegimen", perfil.regimenFiscal || "626").catch(() => { });
        await page.dispatchEvent("#_com_rco_facturacion_solicitudFacturacionPortlet_solicitudRegimen", "change");
        await page.waitForTimeout(1500);
        // Seleccionar Uso CFDI
        await page.selectOption("#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select", perfil.usoCfdi || "G03").catch(async () => {
            const opts = await page.evaluate(() => {
                const s = document.querySelector("#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select");
                return s ? Array.from(s.options).map((o) => o.value) : [];
            });
            if (opts.length > 1) {
                await page.selectOption("#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select", opts[1]);
            }
        });
        const email = perfil.email || "facturacion@ejemplo.com";
        await page.fill("#_com_rco_facturacion_solicitudFacturacionPortlet_email", email);
        await page.fill("#_com_rco_facturacion_solicitudFacturacionPortlet_email2", email);
        if (onProgress)
            await onProgress(`Timbrando factura masiva en RCO...`);
        const generateBtn = (await page.$("#_com_rco_facturacion_solicitudFacturacionPortlet_ptwy")) ||
            (await page.$('button:has-text("Generar Factura")')) ||
            (await page.$('input[type="submit"][value*="Factura"]'));
        if (generateBtn) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle", timeout: 45000 }).catch(() => { }),
                generateBtn.click(),
            ]);
        }
        await page.waitForTimeout(5000);
        // Extraer folio / serie o buscar en la pantalla de búsqueda
        const pageText = await page.evaluate(() => document.body.innerText);
        const folioMatch = pageText.match(/(?:Serie|Folio|Factura)[^\d]*([A-Z]{1,4})?\s*[-–]?\s*(\d{6,8})/i);
        const serie = folioMatch ? folioMatch[1] || "BB" : "BB";
        const folio = folioMatch ? folioMatch[2] : "";
        // Descargar archivos buscando por RFC en la sección de consulta
        if (onProgress)
            await onProgress(`Descargando comprobante oficial timbrado (PDF y XML)...`);
        await page.goto("https://redviacorta.mx/es/buscar-factura", {
            waitUntil: "networkidle",
            timeout: 30000,
        }).catch(() => { });
        await page.fill('input[name*="BuscarFacturaPortlet_rfc"]', perfil.rfc).catch(() => { });
        await page.click('button:has-text("Buscar"), input[type="submit"][value*="Buscar"]').catch(() => { });
        await page.waitForTimeout(3000);
        const pdfSavePath = path.join(downloadsDir, `Factura_RCO_${serie}${folio || Date.now()}_${tickets.length}tickets.pdf`);
        const xmlSavePath = path.join(downloadsDir, `Factura_RCO_${serie}${folio || Date.now()}_${tickets.length}tickets.xml`);
        // Localizar links de descarga
        const downloadLinks = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll("table tr"));
            for (const row of rows) {
                const text = row.innerText || "";
                const pdfLink = row.querySelector('a[href*="pdf"], a:has-text("PDF")')?.href;
                const xmlLink = row.querySelector('a[href*="xml"], a:has-text("XML")')?.href;
                if (pdfLink || xmlLink) {
                    return { text, pdfLink, xmlLink };
                }
            }
            return null;
        });
        let pdfBuffer;
        let xmlBuffer;
        if (downloadLinks?.pdfLink) {
            const resp = await page.request.get(downloadLinks.pdfLink);
            pdfBuffer = await resp.body();
            fs.writeFileSync(pdfSavePath, pdfBuffer);
        }
        if (downloadLinks?.xmlLink) {
            const resp = await page.request.get(downloadLinks.xmlLink);
            xmlBuffer = await resp.body();
            fs.writeFileSync(xmlSavePath, xmlBuffer);
        }
        await browser.close();
        return {
            exito: true,
            emisor: "Red de Carreteras de Occidente (RCO)",
            serie,
            folio: folio || undefined,
            total: totalCalculado,
            pdfPath: pdfBuffer ? pdfSavePath : undefined,
            xmlPath: xmlBuffer ? xmlSavePath : undefined,
            pdfBuffer,
            xmlBuffer,
            mensaje: `Factura timbrada exitosamente en Red Vía Corta para ${tickets.length} casetas.`,
            ticketIds: tickets.map((t) => t.id),
        };
    }
    catch (err) {
        await browser.close();
        return {
            exito: false,
            emisor: "Red de Carreteras de Occidente (RCO)",
            total: totalCalculado,
            mensaje: `Error al facturar en RCO: ${err?.message || err}`,
            ticketIds: tickets.map((t) => t.id),
        };
    }
}
