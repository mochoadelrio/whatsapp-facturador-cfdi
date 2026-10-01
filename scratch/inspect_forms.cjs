const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle' });

  // Get all scripts on the page that mention BuscarFactura or buscarFactura
  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script'))
      .map(s => s.innerText || s.src)
      .filter(s => s.includes('BuscarFactura') || s.includes('buscarFactura') || s.includes('solicitudFacturacion'));
  });

  console.log(`Found ${scripts.length} relevant scripts`);
  fs.writeFileSync('rco_scripts.txt', scripts.join('\n\n--- SCRIPT ---\n\n'));
  console.log('Saved rco_scripts.txt');

  // Let's also inspect all form tags and their actions/methods
  const forms = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).map(f => ({
      id: f.id,
      name: f.name,
      action: f.action,
      method: f.method,
      inputs: Array.from(f.querySelectorAll('input, select, button')).map(i => ({
        tag: i.tagName,
        type: i.type,
        id: i.id,
        name: i.name,
        value: i.value,
        text: i.innerText
      }))
    }));
  });

  console.log('Forms found:', JSON.stringify(forms, null, 2));

  await browser.close();
})().catch(console.error);
