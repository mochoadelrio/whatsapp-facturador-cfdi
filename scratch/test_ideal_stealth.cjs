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

  await page.goto('https://www.facturaciongdl-tep.com.mx', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Remove modal
  await page.evaluate(() => {
    document.querySelectorAll('.modal, .modal-backdrop').forEach(m => m.remove());
  });

  console.log('Clicking button Facturar...');
  const btn = await page.$('button:has-text("Facturar")');
  if (btn) {
    await btn.click();
    await page.waitForTimeout(4000);
  }

  console.log('URL after clicking Facturar:', page.url());
  await page.screenshot({ path: 'ideal_step2.png', fullPage: true });

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea, button, mat-select')).map(el => ({
      tag: el.tagName,
      type: el.type || '',
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      text: el.innerText.trim().slice(0, 100)
    }));
  });
  console.log('Inputs in Step 2:\n', JSON.stringify(inputs, null, 2));

  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page text snippet:\n', text.slice(0, 1200));

  await browser.close();
})().catch(console.error);
