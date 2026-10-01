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

  console.log('Navigating to https://www.facturaciongdl-tep.com.mx...');
  await page.goto('https://www.facturaciongdl-tep.com.mx', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Check dialog buttons
  const dialogInfo = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('.cdk-overlay-container, .modal, mat-dialog-container'));
    const buttons = dialogs.flatMap(d => Array.from(d.querySelectorAll('button'))).map(b => b.innerText.trim());
    return { count: dialogs.length, buttons };
  });
  console.log('Dialog info on load:', dialogInfo);

  // Click any button that accepts or closes the dialog
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('mat-dialog-container button, .modal button, .btn-close, .close'));
    for (const b of btns) {
      if (b.innerText.includes('Aceptar') || b.innerText.includes('Continuar') || b.innerText.includes('Entendido') || b.innerText.includes('Cerrar') || b.innerText.includes('×')) {
        b.click();
      }
    }
  });
  await page.waitForTimeout(1000);

  // If overlay still exists, remove it
  await page.evaluate(() => {
    document.querySelectorAll('.cdk-overlay-container, .modal-backdrop, .modal').forEach(e => e.remove());
  });
  await page.waitForTimeout(1000);

  console.log('Clicking Facturar button via evaluate (direct click)...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Facturar'));
    if (btn) btn.click();
  });

  await page.waitForTimeout(3000);

  // Again check if a new dialog opened
  const newDialogs = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('mat-dialog-container button, .modal button, .btn-close, .close'));
    return btns.map(b => b.innerText.trim());
  });
  console.log('Dialog buttons after Facturar:', newDialogs);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('mat-dialog-container button, .modal button, .btn-close, .close'));
    for (const b of btns) {
      if (b.innerText.includes('Aceptar') || b.innerText.includes('Continuar') || b.innerText.includes('Entendido') || b.innerText.includes('Cerrar') || b.innerText.includes('×')) {
        b.click();
      }
    }
  });
  await page.waitForTimeout(2000);

  // Remove overlay again if needed
  await page.evaluate(() => {
    document.querySelectorAll('.cdk-overlay-backdrop, .modal-backdrop').forEach(e => e.remove());
  });

  console.log('Current URL:', page.url());
  await page.screenshot({ path: 'ideal_step2_clean.png', fullPage: true });

  const text = await page.evaluate(() => document.body.innerText);
  console.log('Body text snippet:\n', text.slice(0, 1500));

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, mat-select, button')).map(el => ({
      tag: el.tagName,
      type: el.type,
      id: el.id,
      name: el.name,
      placeholder: el.placeholder,
      text: el.innerText.trim()
    })).filter(x => x.text || x.name || x.id || x.placeholder);
  });
  console.log('Interactive elements count:', inputs.length);
  console.log('Interactive elements:\n', JSON.stringify(inputs, null, 2));

  await browser.close();
})().catch(console.error);
