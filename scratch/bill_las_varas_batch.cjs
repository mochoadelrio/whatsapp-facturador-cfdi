const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const nrus = [
  '789991808931842074', // $74.00
  '790361109652922285'  // $74.00
];

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

  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      try {
        const text = await res.text();
        console.log(`[API ${res.status()}] ${res.url().split('?')[0].slice(-55)}: ${text.slice(0, 160)}`);
      } catch {}
    }
  });

  console.log('Navegando a facturación Las Varas - Puerto Vallarta...');
  await page.goto('https://www.faclasvaras-ptovallarta.com.mx/facturacion', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Dismiss modal
  await page.evaluate(() => {
    document.querySelectorAll('.cdk-overlay-container, .modal, .modal-backdrop').forEach(e => e.remove());
  });

  for (let i = 0; i < nrus.length; i++) {
    const nru = nrus[i];
    console.log(`\n[${i+1}/${nrus.length}] Agregando NRU: ${nru}...`);
    await page.fill('input[formcontrolname="idTicket"]', nru);
    await page.waitForTimeout(500);

    const btnAdd = page.locator('button:has-text("Agregar ticket")');
    await btnAdd.click();
    await page.waitForTimeout(3000);
  }

  // Inspect table rows
  const tableRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('mat-table mat-row, table tr')).map(r => r.innerText.replace(/\n/g, ' | '));
  });
  console.log('\n========================================');
  console.log('Tickets en la tabla actualmente (' + tableRows.length + '):\n', tableRows);
  console.log('========================================\n');

  // Fill fiscal form
  console.log('\nLlenando datos fiscales de Cristhian...');
  await page.fill('input[formcontrolname="rfc"]', 'VAMC9112056Q2');
  await page.fill('input[formcontrolname="nombreORazonSocial"]', 'CRISTHIAN VALDIVIA MARTINEZ');
  await page.fill('input[formcontrolname="cp"]', '37545');
  await page.fill('input[formcontrolname="email"]', 'cristhian.valdivia@ejemplo.com');

  await page.selectOption('select[formcontrolname="regimenFiscal"]', { label: '626 | RÉGIMEN SIMPLIFICADO DE CONFIANZA' });
  await page.dispatchEvent('select[formcontrolname="regimenFiscal"]', 'change');

  await page.selectOption('select[formcontrolname="usoCFDI"]', { label: 'Gastos en general.' });
  await page.dispatchEvent('select[formcontrolname="usoCFDI"]', 'change');

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'las_varas_ready.png', fullPage: true });

  const btnFacturar = page.locator('button:has-text("Facturar")');
  const isEnabled = await btnFacturar.isEnabled();
  console.log('Botón Facturar habilitado:', isEnabled);

  if (isEnabled) {
    console.log('Haciendo clic en Facturar...');
    await btnFacturar.click();
    await page.waitForTimeout(15000);

    await page.screenshot({ path: 'las_varas_stamped.png', fullPage: true });

    const postStampText = await page.evaluate(() => document.body.innerText);
    console.log('Texto tras facturar:\n', postStampText.slice(0, 1500));
  }

  await browser.close();
})().catch(console.error);
