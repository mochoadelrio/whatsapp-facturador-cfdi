const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle', timeout: 60000 });
  
  const formElements = await page.evaluate(() => {
    const els = document.querySelectorAll('input, select, textarea, button');
    return Array.from(els).map(e => ({
      tag: e.tagName,
      type: e.type,
      id: e.id,
      name: e.name,
      placeholder: e.placeholder,
      text: e.innerText || e.value
    }));
  });
  console.log('Form elements:', JSON.stringify(formElements, null, 2));

  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page text snippet:\n', text.slice(0, 1500));

  await browser.close();
})().catch(e => console.error(e));
