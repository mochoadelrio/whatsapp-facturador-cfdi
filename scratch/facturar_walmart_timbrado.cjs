const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  console.log('--- Timbrando Factura Walmart (Paso Final: invoiceSelection -> Facturar) ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true
  });
  const page = await context.newPage();

  let pdfDownloaded = false;
  let xmlDownloaded = false;

  // Interceptar descargas automáticas
  page.on('download', async download => {
    const suggestedName = download.suggestedFilename();
    console.log('[Browser Download Event]:', suggestedName);
    const savePath = path.resolve('downloads', suggestedName);
    await download.saveAs(savePath);
    console.log('Descarga guardada en:', savePath);
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url.includes('.pdf') || url.includes('.xml') || url.includes('factura') || url.includes('cfdi')) {
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.gif') && !url.includes('.woff')) {
        try {
          console.log(`[API Response] ${res.status()} ${url}`);
          const contentType = res.headers()['content-type'] || '';
          if (contentType.includes('pdf')) {
            const buf = await res.body();
            fs.writeFileSync('downloads/Factura_Walmart_ViaAlta_474MXN.pdf', buf);
            console.log('PDF de Walmart guardado directamente de API! Tamaño:', buf.length);
            pdfDownloaded = true;
          } else if (contentType.includes('xml')) {
            const buf = await res.body();
            fs.writeFileSync('downloads/Factura_Walmart_ViaAlta_474MXN.xml', buf);
            console.log('XML de Walmart guardado directamente de API! Tamaño:', buf.length);
            xmlDownloaded = true;
          } else {
            const t = await res.text();
            if (t.length < 1500) console.log('  ->', t);
            // Si la respuesta contiene base64 de PDF o XML:
            try {
              const json = JSON.parse(t);
              if (json.Value) {
                if (json.Value.pdfBase64 || json.Value.Pdf) {
                  const b64 = json.Value.pdfBase64 || json.Value.Pdf;
                  fs.writeFileSync('downloads/Factura_Walmart_ViaAlta_474MXN.pdf', Buffer.from(b64, 'base64'));
                  console.log('PDF guardado desde JSON base64!');
                }
                if (json.Value.xmlBase64 || json.Value.Xml) {
                  const b64 = json.Value.xmlBase64 || json.Value.Xml;
                  fs.writeFileSync('downloads/Factura_Walmart_ViaAlta_474MXN.xml', Buffer.from(b64, 'base64'));
                  console.log('XML guardado desde JSON base64!');
                }
              }
            } catch(e) {}
          }
        } catch(e) {}
      }
    }
  });

  console.log('1. Accediendo a portal...');
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

  console.log('Esperando que cargue el selector de Régimen Fiscal...');
  await page.waitForFunction(() => {
    const s = document.querySelector('select[name="Régimen Fiscal"]');
    return s && s.options && s.options.length > 2;
  }, { timeout: 15000 });
  await page.waitForTimeout(500);

  await page.selectOption('select[name="Régimen Fiscal"]', '626');
  await page.dispatchEvent('select[name="Régimen Fiscal"]', 'change');

  console.log('Esperando catálogo de Uso CFDI...');
  await page.waitForFunction(() => {
    const s = document.querySelector('select[name="Uso Factura"]');
    return s && s.options && s.options.length > 2;
  }, { timeout: 15000 });
  await page.waitForTimeout(500);

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

  await page.selectOption('select', '28');
  await page.dispatchEvent('select', 'change');
  await page.waitForTimeout(1000);
  await page.click('#form_btn_accept');

  console.log('5. Invoice Selection...');
  await page.waitForURL('**/invoiceSelection*', { timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log('Seleccionando opción PDF (#method_pdf_radio)...');
  await page.click('#method_pdf_radio');
  await page.waitForTimeout(1000);

  console.log('Dando clic en Facturar (#invoice_form_btn_submit)...');
  await page.click('#invoice_form_btn_submit');

  console.log('Esperando respuesta de timbrado del SAT...');
  await page.waitForTimeout(15000);

  console.log('URL final:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Texto en pantalla final:\n', bodyText.slice(0, 2000));

  await page.screenshot({ path: 'scratch/walmart_timbrado_final.png', fullPage: true });

  const finalLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button')).map(el => ({
      text: el.innerText.trim(),
      href: el.href || el.getAttribute('href') || '',
      id: el.id
    })).filter(x => x.text || x.href);
  });
  console.log('Enlaces finales:', finalLinks);

  await browser.close();
  console.log('Script finalizado con éxito.');
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
