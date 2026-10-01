const fs = require('fs');
const path = require('path');

const outboxDir = path.resolve('data/outbox');
const target = '140974432981152@lid';

const textSummary = `✅ *¡Lote 3 Facturado y Timbrado con Éxito!* (Autopista Las Varas - Puerto Vallarta / 2 Casetas) 🛣️🚗
━━━━━━━━━━━━━━━━━━━━━
🏢 *Emisor:* Concesionaria Autopista Las Varas - Puerto Vallarta
🧾 *Folio:* Serie KCAV - 455057
🆔 *UUID SAT:* \`89FA18D4-BD53-11F1-BB5F-378AB08C3964\`
📅 *Fecha Timbrado:* 2026-09-30 22:49:55
💰 *Total:* *$148.00 MXN*
━━━━━━━━━━━━━━━━━━━━━
📌 *Casetas incluidas en esta factura:*
1. Caseta La Peñita ($74.00) — NRU: \`789991808931842074\`
2. Caseta La Peñita ($74.00) — NRU: \`790361109652922285\`
━━━━━━━━━━━━━━━━━━━━━
👤 *Receptor:* CRISTHIAN VALDIVIA MARTINEZ (\`VAMC9112056Q2\`)
📎 *Te adjuntamos tus archivos PDF y XML oficiales a continuación.*`;

const items = [
  {
    name: '1_text_cristhian',
    data: { jid: target, content: { text: textSummary } }
  },
  {
    name: '2_pdf_cristhian',
    data: {
      jid: target,
      content: {
        document: path.resolve('downloads/Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.pdf'),
        mimetype: 'application/pdf',
        fileName: 'Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.pdf'
      }
    }
  },
  {
    name: '3_xml_cristhian',
    data: {
      jid: target,
      content: {
        document: path.resolve('downloads/Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.xml'),
        mimetype: 'application/xml',
        fileName: 'Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.xml'
      }
    }
  },
  {
    name: '4_confirm_manuel',
    data: {
      jid: '5214773929593@s.whatsapp.net',
      content: {
        text: '🔔 *Lote 3 Completado y Entregado a Cristhian*\\n\\nLas 2 casetas de Autopista Las Varas - Puerto Vallarta ($148.00 MXN) fueron timbradas exitosamente (UUID `89FA18D4-BD53-11F1-BB5F-378AB08C3964`) y entregadas a Cristhian con su PDF y XML.'
      }
    }
  }
];

(async () => {
  for (const item of items) {
    const filePath = path.join(outboxDir, `lote3_${Date.now()}_${item.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(item.data, null, 2));
    console.log('Enqueued:', item.name);
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('Todos los archivos del Lote 3 fueron entregados al outbox correctamente.');
})();
