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

  const pdfPath = path.resolve('downloads/Factura_Walmart_ViaAlta_474MXN.pdf');

  // 1. Texto a Cristhian
  const textMsg = {
    to: cristhianLid,
    type: 'text',
    text: `🛒 *Factura de Walmart (Unidad Vía Alta) lista*\n\n` +
          `Hola Cristhian, quedó emitida y timbrada ante el SAT tu factura de Walmart México por \$474.00 MXN:\n\n` +
          `• *Emisor:* Nueva Wal Mart de México S. de R.L. de C.V.\n` +
          `• *Serie y Folio:* IWAVX - 242617\n` +
          `• *UUID SAT:* A5822262-DEE4-4646-AB99-F52854F1677B\n` +
          `• *Total:* \$474.00 MXN\n` +
          `• *Ticket:* TC# 965463762351480703998 | TR# 03957\n\n` +
          `El paquete oficial XML y PDF también fue enviado por el sistema de Walmart a tu correo electrónico. A continuación te adjunto tu factura en PDF:`
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_1_text_cristhian.json`), JSON.stringify(textMsg, null, 2));
  console.log('Enqueued: 1_text_cristhian');
  await sleep(1200);

  // 2. PDF a Cristhian
  const pdfMsg = {
    to: cristhianLid,
    type: 'document',
    filePath: pdfPath,
    fileName: 'Factura_Walmart_IWAVX242617_474MXN.pdf',
    mimetype: 'application/pdf',
    caption: 'Factura PDF Walmart IWAVX-242617 (\$474.00 MXN)'
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_2_pdf_cristhian.json`), JSON.stringify(pdfMsg, null, 2));
  console.log('Enqueued: 2_pdf_cristhian');
  await sleep(1200);

  // 3. Confirmación a Manuel
  const confirmMsg = {
    to: manuelJid,
    type: 'text',
    text: `✅ *Ticket Walmart (Unidad Vía Alta) facturado y enviado a Cristhian:*\n\n` +
          `• Serie/Folio: IWAVX - 242617\n` +
          `• UUID SAT: A5822262-DEE4-4646-AB99-F52854F1677B\n` +
          `• Total: \$474.00 MXN\n` +
          `• PDF entregado en el chat de Cristhian y paquete enviado a su correo.`
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_3_confirm_manuel.json`), JSON.stringify(confirmMsg, null, 2));
  console.log('Enqueued: 3_confirm_manuel');

  console.log('Mensajes de Walmart encolados correctamente.');
}

main().catch(console.error);
