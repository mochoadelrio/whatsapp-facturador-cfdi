const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.log('Navigating to https://www.autopistaguadalajaratepic.com.mx...');
  try {
    await page.goto('https://www.autopistaguadalajaratepic.com.mx', { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('Goto err:', e.message);
  }

  console.log('Title:', await page.title());
  console.log('Current URL:', page.url());

  await page.screenshot({ path: 'gdl_tepic_page.png' });

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea, button, a')).map(el => ({
      tag: el.tagName,
      type: el.type || '',
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      text: (el.innerText || el.textContent || '').trim().slice(0, 100),
      href: el.href || ''
    })).filter(x => x.text || x.name || x.id || x.placeholder);
  });

  console.log('Inputs found:', JSON.stringify(inputs.slice(0, 30), null, 2));

  await browser.close();
})().catch(console.error);
