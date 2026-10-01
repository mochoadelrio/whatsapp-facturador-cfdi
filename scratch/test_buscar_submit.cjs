const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('buscarFactura') || url.includes('factura')) {
      console.log(`[HTTP ${res.status()}] ${url.slice(0, 120)}`);
    }
  });

  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle' });

  // Make Buscar form visible
  await page.evaluate(() => {
    const formBusca = document.getElementById("portlet_com_rco_facturacion_buscarFactura_BuscarFacturaPortlet");
    const form = document.getElementById("p_p_id_com_rco_facturacion_solicitudFacturacionPortlet_");
    if (formBusca) formBusca.style.display = "block";
    if (form) form.style.display = "none";
  });

  // Fill form
  await page.fill('input[name*="BuscarFacturaPortlet_rfc"]', 'VAMC9112056Q2');
  await page.fill('input[name*="BuscarFacturaPortlet_no_ticket"]', '39090448475016909065');

  // Submit via the submit button inside BuscarFactura form
  const btn = await page.$('form[action*="buscarFacturas"] button[type="submit"]');
  console.log('Submit button found:', !!btn);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('Nav error:', e.message)),
    btn.click()
  ]);

  await page.waitForTimeout(4000);

  const fullHtml = await page.content();
  fs.writeFileSync('buscar_response.html', fullHtml);

  // Extract all text inside the buscar portlet
  const text = await page.evaluate(() => {
    const p = document.getElementById("portlet_com_rco_facturacion_buscarFactura_BuscarFacturaPortlet") || document.body;
    return p.innerText;
  });
  console.log('Buscar portlet text after search:\n', text);

  await page.screenshot({ path: 'rco_buscar_after_submit.png', fullPage: true });

  await browser.close();
})().catch(console.error);
