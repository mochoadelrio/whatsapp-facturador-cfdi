const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'es-MX',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await page.goto('https://www.facturaciongdl-tep.com.mx/facturacion', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    document.querySelectorAll('.cdk-overlay-container, .modal, .modal-backdrop').forEach(e => e.remove());
  });

  const fields = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, mat-select, textarea')).map(el => ({
      tag: el.tagName,
      id: el.id,
      name: el.name,
      formControlName: el.getAttribute('formcontrolname'),
      placeholder: el.getAttribute('placeholder'),
      type: el.getAttribute('type'),
      classes: el.className
    }));
  });

  console.log('Form controls found:\n', JSON.stringify(fields, null, 2));

  await browser.close();
})().catch(console.error);
