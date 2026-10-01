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

  // 1. Download Factura KCAG1913680 (Barrancas A, Barrancas B, Santa Cecilia)
  console.log('\n--- Descargando Factura KCAG1913680 (Barrancas A, B, Santa Cecilia) ---');
  await page.goto('https://www.facturaciongdl-tep.com.mx/consultar-factura', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelectorAll('.cdk-overlay-container, .modal, .modal-backdrop').forEach(e => e.remove()));

  await page.fill('input[formcontrolname="rfc"]', 'VAMC9112056Q2');
  await page.fill('input[formcontrolname="idTransito"]', '5770722');
  await page.locator('button:has-text("Buscar")').click();
  await page.waitForTimeout(3000);

  // Click PDF download
  const [downloadPdf1] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('a:has-text("Descargar PDF")').click()
  ]);
  const pdf1Path = path.join(outDir, 'Factura_Ideal_KCAG1913680_Barrancas_SantaCecilia.pdf');
  await downloadPdf1.saveAs(pdf1Path);
  console.log('Saved PDF 1 to:', pdf1Path, `(${fs.statSync(pdf1Path).size} bytes)`);

  // Click XML download
  const [downloadXml1] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('a:has-text("Descargar XML")').click()
  ]);
  const xml1Path = path.join(outDir, 'Factura_Ideal_KCAG1913680_Barrancas_SantaCecilia.xml');
  await downloadXml1.saveAs(xml1Path);
  console.log('Saved XML 1 to:', xml1Path, `(${fs.statSync(xml1Path).size} bytes)`);

  // 2. Download Factura KCAG1913640 (Arenal)
  console.log('\n--- Descargando Factura KCAG1913640 (Arenal) ---');
  await page.fill('input[formcontrolname="idTransito"]', '7430424');
  await page.locator('button:has-text("Buscar")').click();
  await page.waitForTimeout(3000);

  const [downloadPdf2] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('a:has-text("Descargar PDF")').click()
  ]);
  const pdf2Path = path.join(outDir, 'Factura_Ideal_KCAG1913640_Arenal.pdf');
  await downloadPdf2.saveAs(pdf2Path);
  console.log('Saved PDF 2 to:', pdf2Path, `(${fs.statSync(pdf2Path).size} bytes)`);

  const [downloadXml2] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('a:has-text("Descargar XML")').click()
  ]);
  const xml2Path = path.join(outDir, 'Factura_Ideal_KCAG1913640_Arenal.xml');
  await downloadXml2.saveAs(xml2Path);
  console.log('Saved XML 2 to:', xml2Path, `(${fs.statSync(xml2Path).size} bytes)`);

  await browser.close();
})().catch(console.error);
