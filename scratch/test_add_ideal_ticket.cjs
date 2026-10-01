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
  await page.waitForTimeout(2000);

  // Dismiss modal
  await page.evaluate(() => {
    document.querySelectorAll('.cdk-overlay-container, .modal, .modal-backdrop').forEach(e => e.remove());
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Facturar'));
    if (btn) btn.click();
  });

  await page.waitForTimeout(3000);

  // Check entronque select options
  const entronqueOpts = await page.evaluate(() => {
    const s = document.querySelector('#mat-input-2');
    return s ? Array.from(s.options).map(o => ({ value: o.value, text: o.text })) : [];
  });
  console.log('Entronque options:', entronqueOpts);

  // Select ARENAL
  console.log('Selecting ARENAL...');
  await page.selectOption('#mat-input-2', { label: 'ARENAL' });
  await page.dispatchEvent('#mat-input-2', 'change');
  await page.waitForTimeout(2000);

  // Check carril select options now
  const carrilOpts = await page.evaluate(() => {
    const s = document.querySelector('#mat-input-3');
    return s ? Array.from(s.options).map(o => ({ value: o.value, text: o.text })) : [];
  });
  console.log('Carril options for ARENAL:', carrilOpts);

  // Check type and placeholder of date input (#mat-input-5)
  const inputDetails = await page.evaluate(() => {
    const f4 = document.querySelector('#mat-input-4');
    const f5 = document.querySelector('#mat-input-5');
    const f6 = document.querySelector('#mat-input-6');
    return {
      f4: { type: f4?.type, placeholder: f4?.placeholder, value: f4?.value },
      f5: { type: f5?.type, placeholder: f5?.placeholder, value: f5?.value },
      f6: { type: f6?.type, placeholder: f6?.placeholder, value: f6?.value },
    };
  });
  console.log('Input details:', inputDetails);

  await page.screenshot({ path: 'ideal_form_detail.png', fullPage: true });

  await browser.close();
})().catch(console.error);
