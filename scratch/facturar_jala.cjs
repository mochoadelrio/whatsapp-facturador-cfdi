const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  console.log('--- Iniciando facturación Lote 4: Autopista Jala - Compostela ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  page.on('dialog', async d => {
    console.log('[Alert/Dialog]:', d.type(), d.message());
    await d.accept();
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('facturar') || url.includes('descarga') || url.includes('.pdf') || url.includes('.xml')) {
      console.log('[Response URL]:', url, 'Status:', res.status());
    }
  });

  console.log('Paso 1: Navegando a peajeclic...');
  await page.goto('https://facturacionjalacompostela.com/peajeclic/#no-back-button', { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  // Close modals
  await page.evaluate(() => {
    document.querySelectorAll('.modal, .close, .close2, .close3').forEach(el => el.click());
  });

  console.log('Paso 2: Capturando Ticket 1 (Folio 02392552, 25/09/2026 12:16:45, $214.00)...');
  await page.fill('#tblAppendGrid_Folio_1', '02392552');
  await page.fill('#tblAppendGrid_Fecha_1', '25/09/2026');
  await page.fill('#tblAppendGrid_Hora_1', '12');
  await page.fill('#tblAppendGrid_Minuto_1', '16');
  await page.fill('#tblAppendGrid_Segundo_1', '45');
  await page.selectOption('#tblAppendGrid_Pago_1', 'Efectivo');
  await page.fill('#tblAppendGrid_Total_1', '214.00');

  console.log('Paso 3: Agregando fila 2...');
  await page.evaluate(() => {
    $('#tblAppendGrid').appendGrid('appendRow', 1);
  });
  await page.waitForTimeout(500);

  console.log('Paso 4: Capturando Ticket 2 (Folio 04267017, 21/09/2026 04:13:09, $214.00)...');
  await page.fill('#tblAppendGrid_Folio_2', '04267017');
  await page.fill('#tblAppendGrid_Fecha_2', '21/09/2026');
  await page.fill('#tblAppendGrid_Hora_2', '04');
  await page.fill('#tblAppendGrid_Minuto_2', '13');
  await page.fill('#tblAppendGrid_Segundo_2', '09');
  await page.selectOption('#tblAppendGrid_Pago_2', 'Efectivo');
  await page.fill('#tblAppendGrid_Total_2', '214.00');

  console.log('Paso 5: Comprobando tickets en el sistema...');
  await page.click('#comprobar');
  await page.waitForTimeout(3000);

  console.log('Paso 6: Enviando a procesar...');
  const navPromise = page.waitForNavigation({ waitUntil: 'load' });
  await page.click('#enviar');
  await navPromise;
  await page.waitForTimeout(2000);
  console.log('En página:', page.url());

  console.log('Paso 7: Buscando RFC del cliente VAMC9112056Q2...');
  await page.fill('#rfc', 'VAMC9112056Q2');
  await page.click('#buscar_rfc');
  await page.waitForTimeout(2500);

  const clienteData = await page.evaluate(() => {
    return {
      nombre: document.querySelector('#nombre')?.value,
      uso_cfdi: document.querySelector('#uso_cfdi')?.value,
      regimen: document.querySelector('#regimen_fiscal_fisica')?.value,
      datos_cliente: document.querySelector('#datos_cliente')?.value,
      subtotal: document.querySelector('#subtotal')?.value,
      total: document.querySelector('#total')?.value
    };
  });
  console.log('Datos cargados del cliente:', clienteData);

  console.log('Paso 8: Configurando correo de destino y régimen...');
  await page.fill('#correo', 'cristhian.valdivia@ejemplo.com');
  await page.fill('#correo2', 'cristhian.valdivia@ejemplo.com');
  
  // Asegurar régimen 626
  await page.evaluate(() => {
    if (document.querySelector('#regimen_fiscal_fisica')) {
      document.querySelector('#regimen_fiscal_fisica').value = '626';
    }
    if (document.querySelector('#regimen_fiscal_oculto')) {
      document.querySelector('#regimen_fiscal_oculto').value = '626';
    }
  });

  console.log('Paso 9: Generando documento CFDI en Jala Compostela...');
  const navPromiseFactura = page.waitForNavigation({ waitUntil: 'load' }).catch(e => console.log('Nav facturar catch:', e.message));
  await page.evaluate(() => {
    validar();
  });
  await navPromiseFactura;
  await page.waitForTimeout(5000);

  console.log('URL tras facturar:', page.url());
  const finalHtml = await page.content();
  fs.writeFileSync('scratch/final_factura_jala.html', finalHtml);
  console.log('Saved scratch/final_factura_jala.html, size:', finalHtml.length);

  await page.screenshot({ path: 'scratch/factura_jala_result.png', fullPage: true });

  await browser.close();
  console.log('Proceso finalizado.');
})().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
