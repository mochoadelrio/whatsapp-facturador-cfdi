const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  console.log('Testing Walmart billing flow...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url.includes('facturacion') || url.includes('Ticket') || url.includes('ticket')) {
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png')) {
        try {
          const t = await res.text();
          console.log(`[API Response] ${res.status()} ${url}\n${t.slice(0, 400)}`);
        } catch(e) {}
      }
    }
  });

  await page.goto('https://facturacion-clientes.walmart.com', { waitUntil: 'networkidle' });
  if (await page.isVisible('#popup_btn_accept')) {
    await page.click('#popup_btn_accept');
    await page.waitForTimeout(500);
  }

  console.log('Clicking banner_cta_link...');
  await page.click('#banner_cta_link');
  await page.waitForTimeout(2000);

  console.log('Filling fields on', page.url());
  await page.waitForSelector('#membershipOrRFC', { timeout: 10000 });
  await page.fill('#membershipOrRFC', 'VAMC9112056Q2');
  await page.fill('#postalCode', '37545');
  await page.fill('#ticketNumber', '965463762351480703998');
  await page.fill('#transactionNumber', '03957');
  await page.waitForTimeout(1000);

  console.log('Clicking Continuar (#form_btn_accept)...');
  await page.click('#form_btn_accept');
  await page.waitForTimeout(4000);

  console.log('Page URL after Continuar:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body text:\n', bodyText.slice(0, 1000));

  await page.screenshot({ path: 'scratch/walmart_after_continuar.png', fullPage: true });

  await browser.close();
  console.log('Done.');
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
