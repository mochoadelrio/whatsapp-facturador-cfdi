const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('dialog', async d => {
    console.log('Dialog:', d.type(), d.message());
    await d.accept();
  });

  console.log('Navigating to peajeclic...');
  await page.goto('https://facturacionjalacompostela.com/peajeclic/#no-back-button', { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  // Close modals
  await page.evaluate(() => {
    document.querySelectorAll('.modal, .close, .close2, .close3').forEach(el => el.click());
  });

  console.log('Filling row 1...');
  await page.fill('#tblAppendGrid_Folio_1', '02392552');
  await page.fill('#tblAppendGrid_Fecha_1', '25/09/2026');
  await page.fill('#tblAppendGrid_Hora_1', '12');
  await page.fill('#tblAppendGrid_Minuto_1', '16');
  await page.fill('#tblAppendGrid_Segundo_1', '45');
  await page.selectOption('#tblAppendGrid_Pago_1', 'Efectivo');
  await page.fill('#tblAppendGrid_Total_1', '214.00');

  console.log('Adding row 2...');
  await page.evaluate(() => {
    $('#tblAppendGrid').appendGrid('appendRow', 1);
  });
  await page.waitForTimeout(500);

  console.log('Filling row 2...');
  await page.fill('#tblAppendGrid_Folio_2', '04267017');
  await page.fill('#tblAppendGrid_Fecha_2', '21/09/2026');
  await page.fill('#tblAppendGrid_Hora_2', '04');
  await page.fill('#tblAppendGrid_Minuto_2', '13');
  await page.fill('#tblAppendGrid_Segundo_2', '09');
  await page.selectOption('#tblAppendGrid_Pago_2', 'Efectivo');
  await page.fill('#tblAppendGrid_Total_2', '214.00');

  console.log('Clicking comprobar...');
  await page.click('#comprobar');
  await page.waitForTimeout(3000);

  console.log('Submitting form...');
  const navPromise = page.waitForNavigation({ waitUntil: 'load' });
  await page.click('#enviar');
  await navPromise;

  console.log('Arrived at:', page.url());
  const html = await page.content();
  fs.writeFileSync('scratch/procesar33.html', html);
  console.log('Saved scratch/procesar33.html, length:', html.length);

  await browser.close();
  console.log('Done.');
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
