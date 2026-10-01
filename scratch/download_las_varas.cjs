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
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const outDir = path.resolve(process.cwd(), 'downloads');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Navegando a consultar factura Las Varas...');
  await page.goto('https://www.faclasvaras-ptovallarta.com.mx/consultar-factura', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelectorAll('.cdk-overlay-container, .modal, .modal-backdrop').forEach(e => e.remove()));

  await page.fill('input[formcontrolname="rfc"]', 'VAMC9112056Q2');
  await page.fill('input[formcontrolname="idTransito"]', '789991808931842074');
  await page.locator('button:has-text("Buscar")').click();
  await page.waitForTimeout(3000);

  // Click PDF download
  console.log('Descargando PDF...');
  const [downloadPdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('a:has-text("Descargar PDF")').click()
  ]);
  const pdfPath = path.join(outDir, 'Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.pdf');
  await downloadPdf.saveAs(pdfPath);
  console.log('Saved PDF to:', pdfPath, `(${fs.statSync(pdfPath).size} bytes)`);

  // Click XML download
  console.log('Descargando XML...');
  const [downloadXml] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('a:has-text("Descargar XML")').click()
  ]);
  const xmlPath = path.join(outDir, 'Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.xml');
  await downloadXml.saveAs(xmlPath);
  console.log('Saved XML to:', xmlPath, `(${fs.statSync(xmlPath).size} bytes)`);

  await browser.close();
})().catch(console.error);
