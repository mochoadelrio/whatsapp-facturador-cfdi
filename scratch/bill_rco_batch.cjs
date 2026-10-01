const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const tickets = [
  { uid: '95190559281216909062', total: '185.00', tramo: 'LEON - LAGOS DE MORENO' },
  { uid: '82340917420116843012', total: '256.00', tramo: 'TEPATITLAN' },
  { uid: '13710642483816908803', total: '210.00', tramo: 'JALOSTOTITLAN' },
  { uid: '45210486519416909064', total: '60.00', tramo: 'SAN FRANCISCO - LEON' },
  { uid: '02960793063116843014', total: '256.00', tramo: 'GUADALAJARA - TEPATITLAN' },
  { uid: '81780563125416909057', total: '185.00', tramo: 'LAGOS DE MORENO - LEON' },
  { uid: '10320765918016908805', total: '210.00', tramo: 'ARANDAS - EL DESPERDICIO' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('1. Navegando al portal de Red Vía Corta...');
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle', timeout: 60000 });

  console.log(`2. Agregando ${tickets.length} tickets de Red Vía Corta en lote...`);

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    console.log(`   -> Agregando ticket ${i + 1}/${tickets.length}: UID ${t.uid} ($${t.total})...`);
    
    await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_ticket', t.uid);
    await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_tickettotal', t.total);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
      page.click('#Agregar')
    ]);

    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'rco_batch_added.png', fullPage: true });

  const tableRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table tr')).map(r => r.innerText.trim());
  });
  console.log('Filas en la tabla tras agregar todos los tickets:\n', tableRows);

  console.log('3. Llenando datos fiscales de Cristhian Valdivia...');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_rfc', 'VAMC9112056Q2');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_nombre_razon_social', 'CRISTHIAN VALDIVIA MARTINEZ');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_cp', '37545');

  // Seleccionar régimen 626
  await page.selectOption('#_com_rco_facturacion_solicitudFacturacionPortlet_solicitudRegimen', '626');
  await page.dispatchEvent('#_com_rco_facturacion_solicitudFacturacionPortlet_solicitudRegimen', 'change');
  await page.waitForTimeout(2000);

  // Seleccionar Uso CFDI G03
  await page.selectOption('#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select', 'G03').catch(async () => {
    const opts = await page.evaluate(() => {
      const s = document.querySelector('#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select');
      return Array.from(s.options).map(o => o.value);
    });
    if (opts.length > 1) {
      await page.selectOption('#_com_rco_facturacion_solicitudFacturacionPortlet_cfdi_select', opts[1]);
    }
  });

  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_email', 'cristhian.valdivia@ejemplo.com');
  await page.fill('#_com_rco_facturacion_solicitudFacturacionPortlet_email2', 'cristhian.valdivia@ejemplo.com');

  console.log('4. Emitiendo factura masiva...');
  const generateBtn = await page.$('#_com_rco_facturacion_solicitudFacturacionPortlet_ptwy') ||
                      await page.$('button:has-text("Generar Factura")') ||
                      await page.$('input[type="submit"][value*="Factura"]');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {}),
    generateBtn.click()
  ]);

  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'rco_batch_result.png', fullPage: true });

  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('Resultado de emisión:\n', pageText.slice(0, 1000));

  await browser.close();
})().catch(console.error);
