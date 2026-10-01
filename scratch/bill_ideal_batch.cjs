const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const tickets = [
  { name: 'Arenal', entronque: 'ARENAL', carril: '03', folio: '7430424', fecha: '21/09/2026 03:38:35', monto: '214' },
  { name: 'Barrancas Sentido A', entronque: 'BARRANCAS SENTIDO A', carril: '3', folio: '5770722', fecha: '21/09/2026 04:13:02', monto: '320' },
  { name: 'Barrancas Sentido B', entronque: 'BARRANCAS SENTIDO B', carril: '5', folio: '976921', fecha: '25/09/2026 14:05:23', monto: '320' },
  { name: 'Santa Cecilia', entronque: 'SANTA CECILIA', carril: '22', folio: '2027507', fecha: '25/09/2026 15:20:41', monto: '308' },
  { name: 'Chapala', entronque: 'CHAPALA', carril: '2', folio: '6430785', fecha: '25/09/2026 15:41:04', monto: '122' },
  { name: 'La Laja', entronque: 'LA LAJA', carril: '23', folio: '5471610', fecha: '25/09/2026 16:05:33', monto: '98' }
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
    const url = res.url();
    if (url.includes('/api/')) {
      try {
        const text = await res.text();
        console.log(`[API ${res.status()}] ${url.split('?')[0].slice(-55)}: ${text.slice(0, 160)}`);
      } catch {}
    }
  });

  console.log('Navegando a facturación Guadalajara-Tepic...');
  await page.goto('https://www.facturaciongdl-tep.com.mx/facturacion', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Dismiss modal
  await page.evaluate(() => {
    document.querySelectorAll('.cdk-overlay-container, .modal, .modal-backdrop').forEach(e => e.remove());
  });

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    console.log(`\n[${i+1}/${tickets.length}] Agregando caseta ${t.name} ($${t.monto})...`);

    // Select Entronque
    await page.selectOption('select[formcontrolname="idEntronque"]', { label: t.entronque });
    await page.dispatchEvent('select[formcontrolname="idEntronque"]', 'change');
    await page.waitForTimeout(1000);

    // Select Carril
    await page.selectOption('select[formcontrolname="carril"]', { label: t.carril });
    await page.dispatchEvent('select[formcontrolname="carril"]', 'change');
    await page.waitForTimeout(500);

    // Fill Folio
    await page.fill('input[formcontrolname="folio"]', t.folio);

    // Fill Fecha-Hora
    await page.fill('input[formcontrolname="fechaHora"]', t.fecha);

    // Fill Monto
    await page.fill('input[formcontrolname="monto"]', t.monto);

    await page.waitForTimeout(500);

    // Click Agregar ticket
    const btnAdd = page.locator('button:has-text("Agregar ticket")');
    await btnAdd.click();
    await page.waitForTimeout(2500);
  }

  // Inspect table rows
  const tableRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('mat-table mat-row, table tr')).map(r => r.innerText.replace(/\n/g, ' | '));
  });
  console.log('\n========================================');
  console.log('Tickets en la tabla actualmente:\n', tableRows);
  console.log('========================================\n');

  await page.screenshot({ path: 'ideal_batch_table_all.png', fullPage: true });

  // Fill fiscal form
  console.log('\nLlenando datos fiscales de Cristhian...');
  await page.fill('input[formcontrolname="rfc"]', 'VAMC9112056Q2');
  await page.fill('input[formcontrolname="nombreORazonSocial"]', 'CRISTHIAN VALDIVIA MARTINEZ');
  await page.fill('input[formcontrolname="cp"]', '37545');
  await page.fill('input[formcontrolname="email"]', 'cristhian.valdivia@ejemplo.com');

  // Select Régimen Fiscal: 626
  await page.selectOption('select[formcontrolname="regimenFiscal"]', { label: '626 | RÉGIMEN SIMPLIFICADO DE CONFIANZA' });
  await page.dispatchEvent('select[formcontrolname="regimenFiscal"]', 'change');

  // Select Uso CFDI: G03
  await page.selectOption('select[formcontrolname="usoCFDI"]', { label: 'Gastos en general.' });
  await page.dispatchEvent('select[formcontrolname="usoCFDI"]', 'change');

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'ideal_batch_fiscal_ready.png', fullPage: true });

  // Check Facturar button
  const btnFacturar = page.locator('button:has-text("Facturar")');
  const isEnabled = await btnFacturar.isEnabled();
  console.log('Botón Facturar habilitado:', isEnabled);

  if (isEnabled) {
    console.log('Haciendo clic en Facturar...');
    await btnFacturar.click();
    await page.waitForTimeout(15000);

    await page.screenshot({ path: 'ideal_batch_stamped.png', fullPage: true });

    // Look for download buttons or dialogs
    const postStampText = await page.evaluate(() => document.body.innerText);
    console.log('Texto tras facturar:\n', postStampText.slice(0, 1500));
  }

  await browser.close();
})().catch(console.error);
