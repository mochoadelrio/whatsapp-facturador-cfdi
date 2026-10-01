const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to network requests / responses
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('facturacion') || url.includes('ticket') || url.includes('solicitud')) {
      try {
        const text = await res.text();
        console.log(`[HTTP ${res.status()}] ${url.slice(0, 100)} => ${text.slice(0, 200)}`);
      } catch (e) {}
    }
  });

  page.on('dialog', async dialog => {
    console.log('Dialog appeared:', dialog.type(), dialog.message());
    await dialog.accept();
  });

  console.log('Navigating to https://redviacorta.mx/es/factura...');
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle', timeout: 60000 });

  console.log('Filling ticket data...');
  // UID from ticket: 39090448475016909065
  // Total: 60.00
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_ticket', '39090448475016909065');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_tickettotal', '60.00');

  console.log('Clicking Agregar...');
  await page.click('#Agregar');

  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'rco_after_agregar.png' });
  console.log('Screenshot saved to rco_after_agregar.png');

  // Check table or alerts
  const tableText = await page.evaluate(() => {
    const table = document.querySelector('table');
    return table ? table.innerText : 'No table';
  });
  console.log('Table content:\n', tableText);

  const alerts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.alert, .toast, .modal, .error, .success, [role="alert"]'))
      .map(e => e.innerText.trim())
      .filter(Boolean);
  });
  console.log('Alerts:', alerts);

  await browser.close();
})().catch(e => console.error(e));
