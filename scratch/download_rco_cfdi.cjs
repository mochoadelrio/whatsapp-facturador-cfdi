const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true
  });
  const page = await context.newPage();

  const downloads = [];
  page.on('download', async download => {
    const filename = download.suggestedFilename();
    const savePath = path.resolve(process.cwd(), 'downloads', filename);
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    await download.saveAs(savePath);
    console.log(`[DOWNLOADED] ${filename} -> ${savePath} (${fs.statSync(savePath).size} bytes)`);
    downloads.push({ filename, path: savePath });
  });

  console.log('Navigating to https://redviacorta.mx/es/factura...');
  await page.goto('https://redviacorta.mx/es/factura', { waitUntil: 'networkidle', timeout: 60000 });

  // Click on "Buscar facturas" button if needed to reveal the search section
  const buscarTab = await page.$('#BuscarBtn') || await page.$('button:has-text("Buscar facturas")');
  if (buscarTab) {
    console.log('Clicking "Buscar facturas" tab/button...');
    await buscarTab.click();
    await page.waitForTimeout(1000);
  }

  console.log('Filling search fields...');
  // Fill RFC
  await page.fill('#_com_rco_facturacion_buscarFactura_BuscarFacturaPortlet_rfc', 'VAMC9112056Q2');
  // Fill Ticket
  await page.fill('#_com_rco_facturacion_buscarFactura_BuscarFacturaPortlet_no_ticket', '39090448475016909065');

  await page.screenshot({ path: 'rco_search_filled.png' });

  console.log('Submitting search...');
  const searchBtn = await page.$('#_com_rco_facturacion_buscarFactura_BuscarFacturaPortlet_uhcm') ||
                    await page.$('button:has-text("Buscar")');
  
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
    searchBtn.click()
  ]);

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'rco_search_results.png' });
  console.log('Saved rco_search_results.png');

  // Look for download buttons / links
  const links = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, button'));
    return els.map(el => ({
      tag: el.tagName,
      id: el.id,
      className: el.className,
      text: el.innerText.trim(),
      href: el.href || '',
      onclick: el.getAttribute('onclick') || ''
    })).filter(x => 
      x.href.includes('xml') || x.href.includes('pdf') || x.href.includes('download') || x.href.includes('Descarga') ||
      x.text.toLowerCase().includes('pdf') || x.text.toLowerCase().includes('xml') || x.text.toLowerCase().includes('descarg') ||
      x.onclick.includes('xml') || x.onclick.includes('pdf') || x.onclick.includes('download')
    );
  });
  console.log('Download elements found:', JSON.stringify(links, null, 2));

  // If there are buttons or links to download, click them
  const downloadBtns = await page.$$('a[href*="pdf"], a[href*="xml"], button:has-text("PDF"), button:has-text("XML"), .download-btn, [title*="PDF"], [title*="XML"], [title*="Descarga"]');
  console.log(`Found ${downloadBtns.length} download buttons/links`);

  for (let i = 0; i < downloadBtns.length; i++) {
    try {
      console.log(`Clicking download button ${i}...`);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        downloadBtns[i].click()
      ]);
      const filename = download.suggestedFilename();
      const savePath = path.resolve(process.cwd(), 'downloads', filename);
      await download.saveAs(savePath);
      console.log(`Downloaded: ${filename} (${fs.statSync(savePath).size} bytes)`);
    } catch (e) {
      console.log(`Download click error for btn ${i}:`, e.message);
    }
  }

  // Also check all tables
  const tables = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table')).map(t => t.innerText);
  });
  console.log('Tables:\n', tables.join('\n---\n'));

  await browser.close();
})().catch(e => console.error(e));
