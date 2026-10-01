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

  // Select ARENAL
  await page.selectOption('select[formcontrolname="idEntronque"]', { label: 'ARENAL' });
  await page.dispatchEvent('select[formcontrolname="idEntronque"]', 'change');
  await page.waitForTimeout(1000);

  // Select Carril 03
  await page.selectOption('select[formcontrolname="carril"]', { label: '03' });
  await page.dispatchEvent('select[formcontrolname="carril"]', 'change');

  // Fill folio
  await page.fill('input[formcontrolname="folio"]', '7430424');

  // Fill fechaHora: Ticket says: Fecha: 21/09/2026 Hora: 03:38:35
  await page.fill('input[formcontrolname="fechaHora"]', '21/09/2026 03:38:35');

  // Fill monto
  await page.fill('input[formcontrolname="monto"]', '214');

  await page.waitForTimeout(1000);

  const formState = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Agregar ticket'));
    const fDate = document.querySelector('input[formcontrolname="fechaHora"]');
    return {
      dateValue: fDate?.value,
      dateClass: fDate?.className,
      btnDisabled: btn?.disabled,
      errors: Array.from(document.querySelectorAll('mat-error')).map(e => e.innerText.trim())
    };
  });
  console.log('Form state with 21/09/2026 03:38:35:', formState);

  // Click agregar ticket
  const btn = page.locator('button:has-text("Agregar ticket")');
  await btn.click();
  await page.waitForTimeout(3000);

  const afterClick = await page.evaluate(() => {
    return {
      tableRows: Array.from(document.querySelectorAll('table tr')).map(r => r.innerText.trim()),
      alerts: Array.from(document.querySelectorAll('.alert, mat-error, .snack-bar, .cdk-overlay-container')).map(e => e.innerText.trim()).filter(Boolean)
    };
  });
  console.log('After click result:\n', afterClick);

  await page.screenshot({ path: 'ideal_add_result.png', fullPage: true });

  await browser.close();
})().catch(console.error);
