const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Navigating to Red Via Corta Buscar...');
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle' });

  // Make Buscar form visible
  await page.evaluate(() => {
    const formBusca = document.getElementById("portlet_com_rco_facturacion_buscarFactura_BuscarFacturaPortlet");
    const form = document.getElementById("p_p_id_com_rco_facturacion_solicitudFacturacionPortlet_");
    if (formBusca) formBusca.style.display = "block";
    if (form) form.style.display = "none";
  });

  await page.fill('input[name*="BuscarFacturaPortlet_rfc"]', 'VAMC9112056Q2');
  await page.fill('input[name*="BuscarFacturaPortlet_no_ticket"]', '95190559281216909062');

  const btn = await page.$('form[action*="buscarFacturas"] button[type="submit"]');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
    btn.click()
  ]);

  await page.waitForTimeout(3000);

  const outDir = path.resolve(process.cwd(), 'downloads');
  fs.mkdirSync(outDir, { recursive: true });

  // Find folio and serie
  const invoiceInfo = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr')).map(r => r.innerText.trim());
    return rows;
  });
  console.log('Table rows in search:\n', invoiceInfo);

  // Click XML
  console.log('Downloading XML...');
  const xmlLink = await page.$('a.btn-success');
  let xmlPath = '';
  if (xmlLink) {
    const [downloadXml] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      xmlLink.click()
    ]);
    xmlPath = path.join(outDir, 'Factura_RCO_Lote_7_Casetas_1362MXN.xml');
    await downloadXml.saveAs(xmlPath);
    console.log(`Saved XML to: ${xmlPath} (${fs.statSync(xmlPath).size} bytes)`);
  }

  // Click PDF
  console.log('Downloading PDF...');
  const pdfLink = await page.$('a.btn-danger');
  let pdfPath = '';
  if (pdfLink) {
    const [downloadPdf] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      pdfLink.click()
    ]);
    pdfPath = path.join(outDir, 'Factura_RCO_Lote_7_Casetas_1362MXN.pdf');
    await downloadPdf.saveAs(pdfPath);
    console.log(`Saved PDF to: ${pdfPath} (${fs.statSync(pdfPath).size} bytes)`);
  }

  await browser.close();
})().catch(console.error);
