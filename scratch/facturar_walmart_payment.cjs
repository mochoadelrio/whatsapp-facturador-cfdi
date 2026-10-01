const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  console.log('--- Generando Factura Walmart con Pago 28 (Tarjeta de débito) ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url.includes('.pdf') || url.includes('.xml') || url.includes('factura') || url.includes('cfdi')) {
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.gif') && !url.includes('.woff')) {
        try {
          const t = await res.text();
          console.log(`[API Response] ${res.status()} ${url}`);
          if (t.length < 1000) console.log('  ->', t);
        } catch(e) {}
      }
    }
  });

  page.on('dialog', async d => {
    console.log('[Dialog]:', d.message());
    await d.accept();
  });

  console.log('1. Home...');
  await page.goto('https://facturacion-clientes.walmart.com', { waitUntil: 'networkidle' });
  if (await page.isVisible('#popup_btn_accept')) {
    await page.click('#popup_btn_accept');
    await page.waitForTimeout(500);
  }

  console.log('2. Ticket...');
  await page.click('#banner_cta_link');
  await page.waitForSelector('#membershipOrRFC', { timeout: 15000 });
  await page.fill('#membershipOrRFC', 'VAMC9112056Q2');
  await page.fill('#postalCode', '37545');
  await page.fill('#ticketNumber', '965463762351480703998');
  await page.fill('#transactionNumber', '03957');
  await page.click('#form_btn_accept');

  console.log('3. Address...');
  await page.waitForURL('**/address*', { timeout: 15000 });
  await page.waitForTimeout(1000);

  await page.fill('input[name="Razón Social"]', 'CRISTHIAN VALDIVIA MARTINEZ');
  await page.fill('input[name="email"]', 'cristhian.valdivia@ejemplo.com');

  await page.selectOption('select[name="Régimen Fiscal"]', '626');
  await page.dispatchEvent('select[name="Régimen Fiscal"]', 'change');

  await page.waitForResponse(r => r.url().includes('GetCatalogoUsoCfdi'), { timeout: 10000 });
  await page.waitForTimeout(1000);

  await page.selectOption('select[name="Uso Factura"]', 'G03');
  await page.dispatchEvent('select[name="Uso Factura"]', 'change');
  await page.waitForTimeout(1000);

  if (await page.isVisible('#popup_overlay')) {
    if (await page.isVisible('#popup_btn_accept')) {
      await page.click('#popup_btn_accept');
      await page.waitForTimeout(1000);
    }
  }
  await page.evaluate(() => { document.querySelectorAll('#popup_overlay, .modal-backdrop').forEach(el => el.remove()); });

  await page.click('#form_btn_accept', { force: true });
  await page.waitForTimeout(2000);

  await page.waitForSelector('#dynamic_modal_primary_btn', { timeout: 10000 });
  await page.click('#dynamic_modal_primary_btn');

  console.log('4. Payment...');
  await page.waitForURL('**/payment*', { timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log('Seleccionando forma de pago 28 (Tarjeta de débito)...');
  await page.selectOption('select', '28');
  await page.dispatchEvent('select', 'change');
  await page.waitForTimeout(1000);

  console.log('Dando clic en Continuar (#form_btn_accept)...');
  await page.click('#form_btn_accept');

  console.log('Esperando timbrado o pantalla de confirmación...');
  await page.waitForTimeout(12000);

  console.log('URL actual:', page.url());
  const postPaymentText = await page.evaluate(() => document.body.innerText);
  console.log('Contenido tras pago:\n', postPaymentText.slice(0, 1500));

  await page.screenshot({ path: 'scratch/walmart_post_payment.png', fullPage: true });

  const finalElements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, input')).map(el => ({
      tag: el.tagName,
      id: el.id,
      name: el.name,
      text: el.innerText.trim(),
      href: el.href || el.getAttribute('href') || ''
    })).filter(x => x.text || x.href || x.id);
  });
  console.log('Elementos finales:', finalElements);

  await browser.close();
  console.log('Finalizado.');
})().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
