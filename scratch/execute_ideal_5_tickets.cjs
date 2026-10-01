const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const payload5 = {
  idsTicket: [
    "51115770722202609210413023320", // Barrancas Sentido A $320
    "5112976921202609251405235320", // Barrancas Sentido B $320
    "40520275072026092515204122308", // Santa Cecilia $308
    "3256430785202609251541042122",  // Chapala $122
    "4475471610202609251605332398"   // La Laja $98
  ],
  cliente: {
    email: "cristhian.valdivia@ejemplo.com",
    nombreORazonSocial: "CRISTHIAN VALDIVIA MARTINEZ",
    cp: "37545",
    rfc: "VAMC9112056Q2",
    regimenFiscal: "626",
    usoCFDI: "G03",
    emailAdicional: null
  },
  emailAdicional: null
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'es-MX',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  console.log('Navegando a https://www.facturaciongdl-tep.com.mx/facturacion...');
  await page.goto('https://www.facturaciongdl-tep.com.mx/facturacion', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('Enviando solicitud de timbrado para las 5 casetas restantes ($1,168.00 MXN)...');
  const stampResult = await page.evaluate(async (data) => {
    try {
      const res = await fetch('https://www.facturaciongdl-tep.com.mx/api/tickets/CAG/facturas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify(data)
      });
      const status = res.status;
      let body = '';
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      return { status, body };
    } catch (err) {
      return { error: err.message };
    }
  }, payload5);

  console.log('Resultado del timbrado de las 5 casetas:\n', JSON.stringify(stampResult, null, 2));

  await browser.close();
})().catch(console.error);
