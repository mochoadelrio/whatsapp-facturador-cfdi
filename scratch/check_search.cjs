const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const downloads = [];
  page.on('download', async d => {
    const fn = d.suggestedFilename();
    const p = path.resolve(process.cwd(), 'downloads', fn);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await d.saveAs(p);
    console.log(`[DOWNLOAD SUCCESS] ${fn} saved to ${p} (${fs.statSync(p).size} bytes)`);
    downloads.push({ filename: fn, path: p });
  });

  console.log('1. Navigating to https://redviacorta.mx/es/factura...');
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle', timeout: 60000 });

  console.log('2. Clicking Buscar facturas tab...');
  await page.click('#BuscarBtn');
  await page.waitForTimeout(1500);

  console.log('3. Filling form...');
  await page.evaluate(() => {
    const rfc = document.querySelector('input[name*="BuscarFacturaPortlet_rfc"]');
    if (rfc) rfc.value = 'VAMC9112056Q2';
    const ticket = document.querySelector('input[name*="BuscarFacturaPortlet_no_ticket"]');
    if (ticket) ticket.value = '39090448475016909065';
  });

  console.log('4. Submitting form...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Buscar');
    if (btn) {
      if (btn.closest('form')) {
        btn.closest('form').submit();
      } else {
        btn.click();
      }
    }
  });

  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'rco_search_result_clicked.png', fullPage: true });

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table tr')).map(r => r.innerText.trim());
  });
  console.log('Table rows after search:\n', rows);

  // Check interactive elements in table
  const tableElements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table a, table button, table i, table img')).map(e => ({
      tag: e.tagName,
      className: e.className,
      href: e.href || '',
      onclick: e.getAttribute('onclick') || '',
      text: e.innerText.trim(),
      title: e.getAttribute('title') || ''
    }));
  });
  console.log('Table elements:', JSON.stringify(tableElements, null, 2));

  // If there are download links or buttons, trigger download
  for (let i = 0; i < tableElements.length; i++) {
    const el = tableElements[i];
    if (el.href || el.onclick || el.tag === 'BUTTON' || el.tag === 'A') {
      console.log(`Attempting download click on element ${i}:`, el);
      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 10000 }),
          page.evaluate((idx) => {
            const items = document.querySelectorAll('table a, table button, table i');
            if (items[idx]) items[idx].click();
          }, i)
        ]);
        const fn = download.suggestedFilename();
        const p = path.resolve(process.cwd(), 'downloads', fn);
        await download.saveAs(p);
        console.log(`Successfully downloaded: ${fn}`);
      } catch (err) {
        console.log(`Click ${i} did not trigger direct download: ${err.message}`);
      }
    }
  }

  console.log('Downloads finished. Total:', downloads);
  await browser.close();
})().catch(console.error);
