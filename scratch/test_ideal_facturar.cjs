const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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

  page.on('request', r => {
    if (r.url().includes('/api/') || r.method() === 'POST') {
      console.log(`[REQ ${r.method()}] ${r.url()}:`, r.postData()?.slice(0, 300));
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/')) {
      try {
        const text = await res.text();
        console.log(`[RES ${res.status()}] ${url}: ${text.slice(0, 300)}`);
      } catch {}
    }
  });

  console.log('Navegando a facturación Guadalajara-Tepic...');
  await page.goto('https://www.facturaciongdl-tep.com.mx/facturacion', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    document.querySelectorAll('.cdk-overlay-container, .modal, .modal-backdrop').forEach(e => e.remove());
  });

  // Ticket Arenal
  console.log('Agregando ticket Arenal...');
  await page.selectOption('select[formcontrolname="idEntronque"]', { label: 'ARENAL' });
  await page.dispatchEvent('select[formcontrolname="idEntronque"]', 'change');
  await page.waitForTimeout(1000);

  await page.selectOption('select[formcontrolname="carril"]', { label: '03' });
  await page.dispatchEvent('select[formcontrolname="carril"]', 'change');
  await page.waitForTimeout(500);

  await page.fill('input[formcontrolname="folio"]', '7430424');
  await page.fill('input[formcontrolname="fechaHora"]', '21/09/2026 03:38:35');
  await page.fill('input[formcontrolname="monto"]', '214');

  await page.locator('button:has-text("Agregar ticket")').click();
  await page.waitForTimeout(3000);

  // Fill fiscal data
  console.log('Llenando datos fiscales...');
  await page.fill('input[formcontrolname="rfc"]', 'VAMC9112056Q2');
  await page.fill('input[formcontrolname="nombreORazonSocial"]', 'CRISTHIAN VALDIVIA MARTINEZ');
  await page.fill('input[formcontrolname="cp"]', '37545');
  await page.fill('input[formcontrolname="email"]', 'cristhian.valdivia@ejemplo.com');

  await page.selectOption('select[formcontrolname="regimenFiscal"]', { label: '626 | RÉGIMEN SIMPLIFICADO DE CONFIANZA' });
  await page.dispatchEvent('select[formcontrolname="regimenFiscal"]', 'change');

  await page.selectOption('select[formcontrolname="usoCFDI"]', { label: 'Gastos en general.' });
  await page.dispatchEvent('select[formcontrolname="usoCFDI"]', 'change');
  await page.waitForTimeout(1000);

  const btnFacturar = page.locator('button:has-text("Facturar")');
  console.log('Facturar habilitado:', await btnFacturar.isEnabled());

  console.log('Clic en Facturar...');
  await btnFacturar.click();
  await page.waitForTimeout(15000);

  await page.screenshot({ path: 'ideal_stamped_test.png', fullPage: true });

  await browser.close();
})().catch(console.error);
