const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  console.log('--- Iniciando facturación Walmart México (Unidad Vía Alta) ---');
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
    if (url.includes('/api/') || url.includes('.pdf') || url.includes('.xml') || url.includes('factura')) {
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.gif') && !url.includes('.woff')) {
        try {
          const t = await res.text();
          console.log(`[API Response] ${res.status()} ${url}`);
          if (t.length < 500) console.log('  ->', t);
        } catch(e) {}
      }
    }
  });

  page.on('dialog', async d => {
    console.log('[Dialog]:', d.message());
    await d.accept();
  });

  console.log('Paso 1: Entrando a portal Walmart...');
  await page.goto('https://facturacion-clientes.walmart.com', { waitUntil: 'networkidle' });
  if (await page.isVisible('#popup_btn_accept')) {
    await page.click('#popup_btn_accept');
    await page.waitForTimeout(500);
  }

  console.log('Paso 2: Navegando a captura de ticket...');
  await page.click('#banner_cta_link');
  await page.waitForSelector('#membershipOrRFC', { timeout: 15000 });

  console.log('Paso 3: Llenando datos del ticket (TC 965463762351480703998, TR 03957)...');
  await page.fill('#membershipOrRFC', 'VAMC9112056Q2');
  await page.fill('#postalCode', '37545');
  await page.fill('#ticketNumber', '965463762351480703998');
  await page.fill('#transactionNumber', '03957');
  await page.waitForTimeout(1000);

  console.log('Paso 4: Enviando ticket...');
  await page.click('#form_btn_accept');

  await page.waitForURL('**/address*', { timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log('Paso 5: Llenando datos fiscales en /address...');
  await page.fill('input[name="Razón Social"]', 'CRISTHIAN VALDIVIA MARTINEZ');
  await page.fill('input[name="email"]', 'cristhian.valdivia@ejemplo.com');

  console.log('Seleccionando Régimen 626...');
  await page.selectOption('select[name="Régimen Fiscal"]', '626');
  await page.dispatchEvent('select[name="Régimen Fiscal"]', 'change');

  console.log('Esperando catálogo de Uso CFDI...');
  await page.waitForResponse(r => r.url().includes('GetCatalogoUsoCfdi'), { timeout: 10000 });
  await page.waitForTimeout(1000);

  console.log('Seleccionando Uso CFDI G03...');
  await page.selectOption('select[name="Uso Factura"]', 'G03');
  await page.dispatchEvent('select[name="Uso Factura"]', 'change');
  await page.waitForTimeout(1000);

  console.log('Paso 6: Revisando si hay popup y dando clic en Aceptar...');
  await page.waitForTimeout(1000);
  
  // Si hay popup, ver su texto y cerrarlo
  const popupVisible = await page.isVisible('#popup_overlay');
  console.log('¿Popup visible en /address?', popupVisible);
  if (popupVisible) {
    const popupText = await page.evaluate(() => document.getElementById('popup_overlay')?.innerText);
    console.log('Texto del popup:', popupText);
    if (await page.isVisible('#popup_btn_accept')) {
      await page.click('#popup_btn_accept');
      await page.waitForTimeout(1000);
    }
  }

  // Si sigue el overlay en el DOM, removerlo para que no intercepte
  await page.evaluate(() => {
    document.querySelectorAll('#popup_overlay, .modal-backdrop').forEach(el => el.remove());
  });

  console.log('Dando clic en #form_btn_accept...');
  await page.click('#form_btn_accept', { force: true });
  await page.waitForTimeout(5000);

  console.log('Paso 7: Confirmando modal de verificación de datos...');
  await page.waitForSelector('#dynamic_modal_primary_btn', { timeout: 10000 });
  await page.click('#dynamic_modal_primary_btn');
  console.log('Clic en Continuar (#dynamic_modal_primary_btn) realizado. Esperando timbrado...');

  await page.waitForTimeout(10000);
  console.log('URL tras confirmar:', page.url());
  const postConfirmText = await page.evaluate(() => document.body.innerText);
  console.log('Contenido tras confirmar:\n', postConfirmText.slice(0, 1500));

  await page.screenshot({ path: 'scratch/walmart_final_screen.png', fullPage: true });

  // Buscar enlaces o botones para descargar PDF y XML
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button')).map(el => ({
      text: el.innerText.trim(),
      href: el.href || el.getAttribute('href') || '',
      id: el.id,
      name: el.name
    })).filter(x => x.text || x.href);
  });
  console.log('Enlaces y botones tras timbrado:', links);

  await browser.close();
  console.log('Script finalizado.');
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
