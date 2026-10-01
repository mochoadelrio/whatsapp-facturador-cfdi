const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true
  });
  const page = await context.newPage();

  // Capture downloads
  const downloads = [];
  page.on('download', async download => {
    const suggestedFilename = download.suggestedFilename();
    const savePath = path.resolve(process.cwd(), 'downloads', suggestedFilename);
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    await download.saveAs(savePath);
    console.log(`[DOWNLOAD] Saved ${suggestedFilename} to ${savePath}`);
    downloads.push({ filename: suggestedFilename, path: savePath });
  });

  page.on('dialog', async dialog => {
    console.log('Dialog:', dialog.type(), dialog.message());
    await dialog.accept();
  });

  console.log('1. Navigating to https://redviacorta.mx/es/factura...');
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle', timeout: 60000 });

  console.log('2. Adding ticket 39090448475016909065 ($60.00)...');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_ticket', '39090448475016909065');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_tickettotal', '60.00');
  
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
    page.click('#Agregar')
  ]);

  console.log('3. Ticket added! Checking table...');
  const tableContent = await page.evaluate(() => {
    const table = document.querySelector('table');
    return table ? table.innerText : '';
  });
  console.log('Table snippet:', tableContent.slice(0, 300));

  console.log('4. Filling fiscal details...');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_rfc', 'VAMC9112056Q2');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_nombre_razon_social', 'CRISTHIAN VALDIVIA MARTINEZ');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_cp', '37545');

  console.log('5. Selecting Regimen Fiscal 626...');
  // Look at select options for regimen
  const regimenOptions = await page.evaluate(() => {
    const sel = document.querySelector('#_com_rco_facturacion_solicitudFacturacionPortlet_solicitudRegimen');
    return Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
  });
  console.log('Regimen options:', regimenOptions);

  // Find option matching 626
  const opt626 = regimenOptions.find(o => o.value === '626' || o.text.includes('626'));
  if (opt626) {
    await page.selectOption('#_com_rco_facturacion_solicitudFacturacionPortlet_solicitudRegimen', opt626.value);
  }

  // Trigger change event if needed
  await page.dispatchEvent('#_com_rco_facturacion_solicitudFacturacionPortlet_solicitudRegimen', 'change');
  await page.waitForTimeout(2000);

  // Inspect CFDI options
  const cfdiOptions = await page.evaluate(() => {
    const sel = document.querySelector('#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select');
    return Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
  });
  console.log('CFDI options after selecting regimen:', cfdiOptions);

  // Find option matching G03
  const optG03 = cfdiOptions.find(o => o.value === 'G03' || o.text.includes('G03') || o.text.includes('Gastos en general'));
  if (optG03) {
    console.log('Selecting CFDI option:', optG03);
    await page.selectOption('#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select', optG03.value);
  } else if (cfdiOptions.length > 1) {
    console.log('Fallback: selecting first available non-empty CFDI option:', cfdiOptions[1]);
    await page.selectOption('#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select', cfdiOptions[1].value);
  }

  console.log('6. Filling email...');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_email', 'cristhian.valdivia@ejemplo.com');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_email2', 'cristhian.valdivia@ejemplo.com');

  await page.screenshot({ path: 'rco_before_generate.png' });
  console.log('Screenshot saved to rco_before_generate.png');

  console.log('7. Clicking Generar Factura...');
  // Find Generar Factura button
  const generateBtn = await page.$('#_com_rco_facturacion_solicitudFacturacionPortlet_ptwy') ||
                     await page.$('button:has-text("Generar Factura")') ||
                     await page.$('input[type="submit"][value*="Factura"]');

  if (!generateBtn) {
    console.error('Could not find Generar Factura button!');
    await browser.close();
    return;
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.log('Navigation wait timeout or direct ajax:', e.message)),
    generateBtn.click()
  ]);

  console.log('8. After submit! Waiting for result...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'rco_after_generate.png' });
  console.log('Screenshot saved to rco_after_generate.png');

  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('Page text summary:\n', pageText.slice(0, 1500));

  // Check for download links or files
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ href: a.href, text: a.innerText.trim() }))
      .filter(a => a.href.includes('pdf') || a.href.includes('xml') || a.href.includes('descarga') || a.href.includes('Factura') || a.text.toLowerCase().includes('descarg') || a.text.toLowerCase().includes('xml') || a.text.toLowerCase().includes('pdf'));
  });
  console.log('Download links found:', links);

  console.log('Captured downloads:', downloads);

  await browser.close();
})().catch(e => console.error(e));
