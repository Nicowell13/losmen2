const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log('🚀 Generating PDF...');
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const htmlPath = path.resolve(__dirname, 'index.html');
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { 
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // Hide print button
  await page.addStyleTag({ content: '.no-print { display: none !important; }' });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 2000));

  const outputPath = path.resolve(__dirname, 'Laporan-AI-Chatbot-WhatsApp-Losmen.pdf');
  
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: true
  });

  await browser.close();
  console.log(`✅ PDF berhasil dibuat: ${outputPath}`);
})();
