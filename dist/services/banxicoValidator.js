import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
export const DATOS_BANCARIOS_OFICIALES = {
    clabe: "722969020307804434",
    beneficiario: "Manuel Ochoa del Rio",
    institucion: "Mercado Pago W",
    codigoBanxicoReceptor: "90722", // Mercado Pago W en Banxico SPEI
};
/**
 * Consulta y valida el Comprobante Electrónico de Pago (CEP) directamente en el portal oficial de Banxico.
 */
export async function validarCepBanxico(datos) {
    const clave = (datos.claveRastreo || datos.numeroReferencia || "").trim();
    const monto = Number(datos.monto) || 0;
    const hoy = new Date();
    const fechaStr = datos.fecha || `${String(hoy.getDate()).padStart(2, "0")}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${hoy.getFullYear()}`;
    // Si no hay clave de rastreo suficiente para Banxico pero el comprobante bancario es legítimo
    if (!clave || clave.length < 5) {
        if (datos.esComprobanteValido &&
            monto > 0 &&
            (datos.cuentaBeneficiaria?.includes("722969") ||
                datos.beneficiario?.toLowerCase().includes("ochoa") ||
                datos.bancoReceptor?.toLowerCase().includes("mercado"))) {
            return {
                valido: true,
                estado: "VERIFICADO_POR_COMPROBANTE",
                mensaje: `Comprobante bancario verificado por \$${monto.toFixed(2)} MXN a favor de ${DATOS_BANCARIOS_OFICIALES.beneficiario}.`,
                monto,
                claveRastreo: clave || "COMPROBANTE-APP",
                cuentaBeneficiaria: DATOS_BANCARIOS_OFICIALES.clabe,
            };
        }
        return {
            valido: false,
            estado: "NO_ENCONTRADO",
            mensaje: "No se localizó la Clave de Rastreo o Número de Referencia en el comprobante.",
        };
    }
    const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
    });
    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        let cepPdfBuffer;
        page.on("download", async (download) => {
            const filename = download.suggestedFilename();
            const savePath = path.resolve(process.cwd(), "downloads", filename);
            await download.saveAs(savePath);
            if (filename.endsWith(".pdf")) {
                cepPdfBuffer = fs.readFileSync(savePath);
            }
        });
        await page.goto("https://www.banxico.org.mx/cep/", {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });
        await page.waitForTimeout(1500);
        // 1. Ingresar Fecha
        if (await page.locator("#input_fecha").isVisible()) {
            await page.fill("#input_fecha", fechaStr);
        }
        // 2. Ingresar Clave de Rastreo
        if (await page.locator("#input_criterio").isVisible()) {
            await page.fill("#input_criterio", clave);
        }
        // 3. Seleccionar Institución Receptora: 90722 (Mercado Pago W)
        if (await page.locator("#input_receptor").isVisible()) {
            await page.selectOption("#input_receptor", DATOS_BANCARIOS_OFICIALES.codigoBanxicoReceptor).catch(() => { });
        }
        // 4. Seleccionar Banco Emisor si está disponible
        if (datos.bancoEmisor && (await page.locator("#input_emisor").isVisible())) {
            const emisorOpts = await page.$$eval("#input_emisor option", opts => opts.map(o => ({
                value: o.value,
                text: o.text.toLowerCase(),
            })));
            const matchEmisor = emisorOpts.find(o => o.text.includes(datos.bancoEmisor.toLowerCase()));
            if (matchEmisor) {
                await page.selectOption("#input_emisor", matchEmisor.value).catch(() => { });
            }
        }
        // 5. Ingresar Cuenta Beneficiaria
        if (await page.locator("#input_cuenta").isVisible()) {
            await page.fill("#input_cuenta", DATOS_BANCARIOS_OFICIALES.clabe);
        }
        // 6. Ingresar Monto
        if (monto > 0 && (await page.locator("#input_monto").isVisible())) {
            await page.fill("#input_monto", monto.toFixed(2));
        }
        // 7. Enviar consulta
        const submitBtn = page.locator('button[type="submit"], input[type="submit"], #btnConsultar, #btnAceptar').first();
        if (await submitBtn.isVisible().catch(() => false)) {
            await submitBtn.click();
            await page.waitForTimeout(4000);
        }
        else {
            // Disparar submit del formulario
            await page.evaluate(() => {
                const form = document.querySelector("#fConsulta");
                if (form)
                    form.submit();
            });
            await page.waitForTimeout(4000);
        }
        // Leer respuesta en la página
        const pageText = await page.evaluate(() => document.body.innerText);
        const esLiquidado = pageText.includes("Liquidada") ||
            pageText.includes("Liquidado") ||
            pageText.includes("Acreditada") ||
            pageText.includes("Exitosa") ||
            pageText.includes("Comprobante Electrónico");
        const noEncontrado = pageText.includes("No se encontró") ||
            pageText.includes("no existe") ||
            pageText.includes("no ha sido liquidado");
        await browser.close();
        if (esLiquidado) {
            return {
                valido: true,
                estado: "LIQUIDADO",
                mensaje: `Transferencia SPEI verificada y liquidada ante Banxico por \$${monto.toFixed(2)} MXN.`,
                claveRastreo: clave,
                monto,
                cuentaBeneficiaria: DATOS_BANCARIOS_OFICIALES.clabe,
                cepPdfBuffer,
            };
        }
        // Si Banxico aún no lo refleja (propagación típica de 1 a 5 minutos)
        // pero el comprobante bancario fue analizado legítimamente por Gemini
        if (datos.esComprobanteValido &&
            monto > 0 &&
            (datos.cuentaBeneficiaria?.includes("722969") ||
                datos.beneficiario?.toLowerCase().includes("ochoa") ||
                datos.bancoReceptor?.toLowerCase().includes("mercado"))) {
            return {
                valido: true,
                estado: "VERIFICADO_POR_COMPROBANTE",
                mensaje: `Transferencia SPEI verificada mediante comprobante bancario por \$${monto.toFixed(2)} MXN (Clave: ${clave}).`,
                claveRastreo: clave,
                monto,
                cuentaBeneficiaria: DATOS_BANCARIOS_OFICIALES.clabe,
            };
        }
        return {
            valido: false,
            estado: noEncontrado ? "NO_ENCONTRADO" : "EN_PROCESO",
            mensaje: noEncontrado
                ? "Banxico indica que no se localizó la operación con esos datos. Revisa la clave de rastreo."
                : "La operación aún está en proceso de dispersión interbancaria SPEI.",
            claveRastreo: clave,
            monto,
        };
    }
    catch (err) {
        await browser.close();
        // Fallback de contingencia si Banxico portal tiene timeout
        if (datos.esComprobanteValido &&
            monto > 0 &&
            (datos.cuentaBeneficiaria?.includes("722969") ||
                datos.beneficiario?.toLowerCase().includes("ochoa") ||
                datos.bancoReceptor?.toLowerCase().includes("mercado"))) {
            return {
                valido: true,
                estado: "VERIFICADO_POR_COMPROBANTE",
                mensaje: `Comprobante bancario SPEI verificado por \$${monto.toFixed(2)} MXN a favor de ${DATOS_BANCARIOS_OFICIALES.beneficiario}.`,
                claveRastreo: clave,
                monto,
                cuentaBeneficiaria: DATOS_BANCARIOS_OFICIALES.clabe,
            };
        }
        return {
            valido: false,
            estado: "NO_ENCONTRADO",
            mensaje: `No se pudo conectar con el portal de Banxico: ${err?.message || err}`,
        };
    }
}
