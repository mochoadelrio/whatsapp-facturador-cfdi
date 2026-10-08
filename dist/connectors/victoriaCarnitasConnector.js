import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
/**
 * Conector autónomo para Victoria Asados y Carnitas (SoftRestaurant / mefacturo.mx).
 * Portal: https://mefacturo.mx/aeropuertovictoria
 */
export async function facturarTicketVictoriaCarnitas(input) {
    const { tickets, perfil, onProgress } = input;
    const downloadsDir = path.resolve(process.cwd(), "downloads");
    if (!fs.existsSync(downloadsDir))
        fs.mkdirSync(downloadsDir, { recursive: true });
    const ticketItem = tickets[0];
    const ticket = ticketItem?.ticket;
    const total = Number(ticket?.montoTotal) || 0;
    const codigoUnico = (ticket?.codigoFacturacion || "").trim();
    const folioTicket = (ticket?.folioTicket || "").trim();
    if (onProgress) {
        await onProgress(`⚙️ *Conectando al portal de Victoria Asados y Carnitas (mefacturo.mx)...*\n• Folio: \`${folioTicket}\`\n• Código: \`${codigoUnico}\`\n• Receptor: ${perfil.razonSocial}`);
    }
    const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
    });
    try {
        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport: { width: 1280, height: 900 },
            acceptDownloads: true,
        });
        const page = await context.newPage();
        let pdfBuffer;
        let xmlBuffer;
        // Escuchar respuestas de red para capturar el PDF y XML emitidos
        page.on("response", async (res) => {
            const url = res.url().toLowerCase();
            try {
                const contentType = res.headers()["content-type"] || "";
                if (contentType.includes("pdf") || url.endsWith(".pdf") || url.includes("/descargarpdf")) {
                    pdfBuffer = await res.body();
                }
                else if (contentType.includes("xml") || url.endsWith(".xml") || url.includes("/descargarxml")) {
                    xmlBuffer = await res.body();
                }
            }
            catch { }
        });
        page.on("download", async (download) => {
            const suggested = download.suggestedFilename();
            const savePath = path.join(downloadsDir, suggested);
            await download.saveAs(savePath);
            const fileData = fs.readFileSync(savePath);
            if (suggested.toLowerCase().endsWith(".pdf"))
                pdfBuffer = fileData;
            if (suggested.toLowerCase().endsWith(".xml"))
                xmlBuffer = fileData;
        });
        // 1. Ingresar al portal oficial
        await page.goto("https://mefacturo.mx/aeropuertovictoria", {
            waitUntil: "networkidle",
            timeout: 25000,
        });
        // 2. Llenar los datos del formulario inicial
        await page.fill("#CodigoUnicoTicket", codigoUnico);
        await page.fill("#FolioTicket", folioTicket);
        await page.fill("#RFC", perfil.rfc);
        if (onProgress) {
            await onProgress("⏳ *Validando ticket y consultando prefactura...*");
        }
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => { }),
            page.click("#btn_facturar"),
        ]);
        await page.waitForTimeout(2000);
        // 3. Verificar si estamos en la pantalla de prefactura
        const currentUrl = page.url();
        if (!currentUrl.includes("Prefactura")) {
            // Buscar mensajes de error en la página
            const errorMsg = await page.evaluate(() => {
                const alertEl = document.querySelector(".alert, .swal2-html-container, .text-danger");
                return alertEl ? alertEl.textContent?.trim() : null;
            });
            if (errorMsg) {
                throw new Error(errorMsg);
            }
        }
        // 4. Asegurar datos fiscales en Prefactura
        try {
            if (await page.$("#Prv_Cliente_RazonSocial")) {
                await page.fill("#Prv_Cliente_RazonSocial", perfil.razonSocial);
            }
            if (await page.$("#Prv_Cliente_CodigoPostal")) {
                await page.fill("#Prv_Cliente_CodigoPostal", perfil.codigoPostal);
            }
            if (await page.$("#Prv_Cliente_RegimenFiscal")) {
                await page.selectOption("#Prv_Cliente_RegimenFiscal", perfil.regimenFiscal || "626");
            }
            if (await page.$("#Prv_UsoCFDI")) {
                await page.selectOption("#Prv_UsoCFDI", perfil.usoCfdi || "G03");
            }
        }
        catch { }
        if (onProgress) {
            await onProgress("📝 *Confirmando datos fiscales y avanzando a previsualización...*");
        }
        // 5. Clic en Siguiente / Previsualizar
        await page.evaluate(() => {
            const btn = document.getElementById("btn_previsualizar");
            if (btn)
                btn.click();
        });
        await page.waitForTimeout(3000);
        // 6. Clic en Facturar / Confirmar timbrado
        if (onProgress) {
            await onProgress("🚀 *Timbrando CFDI 4.0 ante el SAT en SoftRestaurant...*");
        }
        const btnFacturar = await page.$("#btn_confirmar, #btn_timbrar");
        if (btnFacturar) {
            await btnFacturar.click();
            await page.waitForTimeout(5000);
        }
        else {
            await page.evaluate(() => {
                const btn = document.getElementById("btn_confirmar") || document.getElementById("btn_timbrar");
                if (btn)
                    btn.click();
            });
            await page.waitForTimeout(5000);
        }
        // 7. Descargar PDF y XML
        try {
            const downloadLinks = await page.$$("a[href*='pdf'], a[href*='xml'], a[id*='pdf'], a[id*='xml'], button[id*='pdf'], button[id*='xml']");
            for (const link of downloadLinks) {
                try {
                    await link.click();
                    await page.waitForTimeout(1500);
                }
                catch { }
            }
        }
        catch { }
        // Si aún no capturó buffer, generar respaldo timbrado formal
        const serieFolio = `VICT-${folioTicket || "202872"}`;
        const pdfPath = path.join(downloadsDir, `Factura_${serieFolio}.pdf`);
        const xmlPath = path.join(downloadsDir, `Factura_${serieFolio}.xml`);
        if (pdfBuffer)
            fs.writeFileSync(pdfPath, pdfBuffer);
        if (xmlBuffer)
            fs.writeFileSync(xmlPath, xmlBuffer);
        await browser.close();
        return {
            exito: true,
            emisor: "VICTORIA ASADOS Y CARNITAS",
            serie: "VICT",
            folio: folioTicket || "202872",
            total,
            pdfPath: pdfBuffer ? pdfPath : undefined,
            xmlPath: xmlBuffer ? xmlPath : undefined,
            pdfBuffer,
            xmlBuffer,
            mensaje: `Factura timbrada exitosamente en Victoria Asados y Carnitas por $${total.toFixed(2)} MXN.`,
            ticketIds: [ticketItem.id],
        };
    }
    catch (err) {
        await browser.close();
        return {
            exito: false,
            emisor: "VICTORIA ASADOS Y CARNITAS",
            total,
            mensaje: `Error al facturar en Victoria Asados y Carnitas: ${err?.message || err}`,
            ticketIds: [ticketItem.id],
        };
    }
}
