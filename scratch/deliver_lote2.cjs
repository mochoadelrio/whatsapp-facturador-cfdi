const fs = require('fs');
const path = require('path');

const outboxDir = path.resolve('data/outbox');
fs.mkdirSync(outboxDir, { recursive: true });

const textSummary = `✅ *¡Lote 2 Facturado y Timbrado con Éxito!* (Autopista Guadalajara - Tepic / 6 Casetas) 🛣️🚗
━━━━━━━━━━━━━━━━━━━━━
🏢 *Emisor:* Concesionaria Autopista Guadalajara-Tepic (IDEAL Carso)
👤 *Receptor:* CRISTHIAN VALDIVIA MARTINEZ (\`VAMC9112056Q2\`)
💰 *Total Facturado:* *$1,382.00 MXN*
━━━━━━━━━━━━━━━━━━━━━
📄 *Factura 1:*
• *Folio:* Serie KCAG - 1913640
• *UUID SAT:* \`79946E86-BD50-11F1-9F82-F9504F05E8BD\`
• *Total:* $214.00 MXN (Caseta Arenal)

📄 *Factura 2:*
• *Folio:* Serie KCAG - 1913680
• *UUID SAT:* \`2F5FBD2D-BD51-11F1-BD59-BF410A941341\`
• *Total:* $1,168.00 MXN (5 Casetas agrupadas: Barrancas A, Barrancas B, Santa Cecilia, Chapala, La Laja)
━━━━━━━━━━━━━━━━━━━━━
📎 *Te adjuntamos tus archivos PDF y XML oficiales a continuación.*`;

const targets = [
  '140974432981152@lid',
  '524775907888@s.whatsapp.net'
];

let counter = 1;
for (const target of targets) {
  // 1. Text Summary
  fs.writeFileSync(
    path.join(outboxDir, `lote2_${counter++}_text.json`),
    JSON.stringify({ jid: target, content: { text: textSummary } })
  );

  // 2. Factura 1 PDF
  fs.writeFileSync(
    path.join(outboxDir, `lote2_${counter++}_pdf1.json`),
    JSON.stringify({
      jid: target,
      content: {
        document: path.resolve('downloads/Factura_Ideal_KCAG1913640_Arenal.pdf'),
        mimetype: 'application/pdf',
        fileName: 'Factura_Gdl_Tepic_KCAG1913640_Arenal_214MXN.pdf'
      }
    })
  );

  // 3. Factura 1 XML
  fs.writeFileSync(
    path.join(outboxDir, `lote2_${counter++}_xml1.json`),
    JSON.stringify({
      jid: target,
      content: {
        document: path.resolve('downloads/Factura_Ideal_KCAG1913640_Arenal.xml'),
        mimetype: 'application/xml',
        fileName: 'Factura_Gdl_Tepic_KCAG1913640_Arenal_214MXN.xml'
      }
    })
  );

  // 4. Factura 2 PDF
  fs.writeFileSync(
    path.join(outboxDir, `lote2_${counter++}_pdf2.json`),
    JSON.stringify({
      jid: target,
      content: {
        document: path.resolve('downloads/Factura_Ideal_KCAG1913680_Barrancas_SantaCecilia.pdf'),
        mimetype: 'application/pdf',
        fileName: 'Factura_Gdl_Tepic_KCAG1913680_5_Casetas_1168MXN.pdf'
      }
    })
  );

  // 5. Factura 2 XML
  fs.writeFileSync(
    path.join(outboxDir, `lote2_${counter++}_xml2.json`),
    JSON.stringify({
      jid: target,
      content: {
        document: path.resolve('downloads/Factura_Ideal_KCAG1913680_Barrancas_SantaCecilia.xml'),
        mimetype: 'application/xml',
        fileName: 'Factura_Gdl_Tepic_KCAG1913680_5_Casetas_1168MXN.xml'
      }
    })
  );
}

// Confirmation to Manuel
fs.writeFileSync(
  path.join(outboxDir, `lote2_${counter++}_manuel.json`),
  JSON.stringify({
    jid: '5214773929593@s.whatsapp.net',
    content: {
      text: `🔔 *Reporte Lote 2 Completado y Entregado a Cristhian*\\n\\nSe facturaron exitosamente las *6 casetas de Autopista Guadalajara - Tepic* ($1,382.00 MXN):\\n• Factura Arenal ($214.00) - UUID \`79946E86-BD50-11F1-9F82-F9504F05E8BD\`\\n• Factura 5 Casetas ($1,168.00) - UUID \`2F5FBD2D-BD51-11F1-BD59-BF410A941341\`\\n• Ambos PDFs y XMLs enviados al chat de Cristhian.`
    }
  })
);

console.log('Todos los mensajes del Lote 2 fueron encolados al outbox correctamente.');
