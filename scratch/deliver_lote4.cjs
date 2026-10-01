const fs = require('fs');
const path = require('path');

const outboxDir = path.resolve('data/outbox');
if (!fs.existsSync(outboxDir)) {
  fs.mkdirSync(outboxDir, { recursive: true });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const cristhianLid = '140974432981152@lid';
  const manuelJid = '5214773929593@s.whatsapp.net';

  const pdfPath = path.resolve('downloads/Factura_Jala_Compostela_JC787247_428MXN.pdf');
  const xmlPath = path.resolve('downloads/Factura_Jala_Compostela_JC787247_428MXN.xml');

  // 1. Mensaje de texto a Cristhian
  const textMsg = {
    to: cristhianLid,
    type: 'text',
    text: `🧾 *Factura Lote 4 lista (Autopista Jala - Compostela)*\n\n` +
          `Hola Cristhian, ya quedó emitida y timbrada ante el SAT tu factura de las 2 casetas de la Autopista Jala - Compostela (Caseta Amado Nervo).\n\n` +
          `• *Emisor:* Fondo Nacional de Infraestructura (FONADIN)\n` +
          `• *Serie y Folio:* JC - 787247\n` +
          `• *UUID SAT:* d9f2daf5-0ef4-4a3a-9ecf-e12e41073921\n` +
          `• *Total:* \$428.00 MXN\n` +
          `• *Tickets incluidos:*\n` +
          `   - Caseta Amado Nervo Carril 2302 (Folio 01723939 / Sec. 02392552): \$214.00 MXN\n` +
          `   - Caseta Amado Nervo Carril 2104 (Folio 02925656 / Sec. 04267017): \$214.00 MXN\n\n` +
          `Te adjunto enseguida tus archivos PDF y XML oficiales:`
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_1_text_cristhian.json`), JSON.stringify(textMsg, null, 2));
  console.log('Enqueued: 1_text_cristhian');
  await sleep(1200);

  // 2. PDF a Cristhian
  const pdfMsg = {
    to: cristhianLid,
    type: 'document',
    filePath: pdfPath,
    fileName: 'Factura_Jala_Compostela_JC787247.pdf',
    mimetype: 'application/pdf',
    caption: 'Factura PDF JC-787247 (Autopista Jala - Compostela - \$428.00 MXN)'
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_2_pdf_cristhian.json`), JSON.stringify(pdfMsg, null, 2));
  console.log('Enqueued: 2_pdf_cristhian');
  await sleep(1200);

  // 3. XML a Cristhian
  const xmlMsg = {
    to: cristhianLid,
    type: 'document',
    filePath: xmlPath,
    fileName: 'Factura_Jala_Compostela_JC787247.xml',
    mimetype: 'text/xml',
    caption: 'CFDI 4.0 XML Oficial JC-787247 (UUID: d9f2daf5-0ef4-4a3a-9ecf-e12e41073921)'
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_3_xml_cristhian.json`), JSON.stringify(xmlMsg, null, 2));
  console.log('Enqueued: 3_xml_cristhian');
  await sleep(1200);

  // 4. Notificación de confirmación a Manuel
  const confirmMsg = {
    to: manuelJid,
    type: 'text',
    text: `✅ *Lote 4 completado y enviado a Cristhian:*\n\n` +
          `• Autopista Jala - Compostela (2 casetas Amado Nervo)\n` +
          `• Serie/Folio: JC - 787247\n` +
          `• UUID SAT: d9f2daf5-0ef4-4a3a-9ecf-e12e41073921\n` +
          `• Total: \$428.00 MXN\n` +
          `• PDF y XML entregados en el chat de Cristhian.`
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_4_confirm_manuel.json`), JSON.stringify(confirmMsg, null, 2));
  console.log('Enqueued: 4_confirm_manuel');

  console.log('Todos los archivos del Lote 4 fueron entregados al outbox correctamente.');
}

main().catch(console.error);
