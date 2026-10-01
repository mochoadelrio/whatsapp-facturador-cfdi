const fs = require('fs');
const path = require('path');

const outboxDir = path.resolve('data/outbox');
if (!fs.existsSync(outboxDir)) {
  fs.mkdirSync(outboxDir, { recursive: true });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const recipients = [
    { name: 'Manuel', jid: '5214773929593@s.whatsapp.net' },
    { name: 'Cristhian_LID', jid: '140974432981152@lid' },
    { name: 'Cristhian_PN', jid: '524775907888@s.whatsapp.net' }
  ];

  const items = [
    // 1. Resumen Lotes 3, 4 y 5
    {
      type: 'text',
      content: {
        text: `📦 *Entrega de Facturas Oficiales SAT (Lotes 3, 4 y 5)* 🧾✨\n\n` +
              `👤 *Receptor:* CRISTHIAN VALDIVIA MARTINEZ (\`VAMC9112056Q2\`)\n\n` +
              `📍 *Lote 3: Autopista Las Varas - Puerto Vallarta* (\$148.00 MXN)\n` +
              `• Folio: KCAV - 455057 | UUID: \`89FA18D4-BD53-11F1-BB5F-378AB08C3964\`\n\n` +
              `📍 *Lote 4: Autopista Jala - Compostela* (\$428.00 MXN)\n` +
              `• Folio: JC - 787247 | UUID: \`d9f2daf5-0ef4-4a3a-9ecf-e12e41073921\`\n\n` +
              `📍 *Lote 5: Walmart México Unidad Vía Alta* (\$474.00 MXN)\n` +
              `• Folio: IWAVX - 242617 | UUID: \`A5822262-DEE4-4646-AB99-F52854F1677B\`\n\n` +
              `📎 A continuación te envío todos los archivos PDF y XML oficiales:`
      }
    },
    // 2. Lote 3 PDF
    {
      type: 'document',
      content: {
        document: path.resolve('downloads/Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.pdf'),
        mimetype: 'application/pdf',
        fileName: 'Factura_Las_Varas_KCAV455057_148MXN.pdf'
      }
    },
    // 3. Lote 3 XML
    {
      type: 'document',
      content: {
        document: path.resolve('downloads/Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.xml'),
        mimetype: 'application/xml',
        fileName: 'Factura_Las_Varas_KCAV455057_148MXN.xml'
      }
    },
    // 4. Lote 4 PDF
    {
      type: 'document',
      content: {
        document: path.resolve('downloads/Factura_Jala_Compostela_JC787247_428MXN.pdf'),
        mimetype: 'application/pdf',
        fileName: 'Factura_Jala_Compostela_JC787247_428MXN.pdf'
      }
    },
    // 5. Lote 4 XML
    {
      type: 'document',
      content: {
        document: path.resolve('downloads/Factura_Jala_Compostela_JC787247_428MXN.xml'),
        mimetype: 'application/xml',
        fileName: 'Factura_Jala_Compostela_JC787247_428MXN.xml'
      }
    },
    // 6. Lote 5 PDF
    {
      type: 'document',
      content: {
        document: path.resolve('downloads/Factura_Walmart_ViaAlta_474MXN.pdf'),
        mimetype: 'application/pdf',
        fileName: 'Factura_Walmart_IWAVX242617_474MXN.pdf'
      }
    },
    // 7. Explicación de Pizza Hut y Ciosa
    {
      type: 'text',
      content: {
        text: `📌 *Estado de los 2 tickets comerciales restantes:*\n\n` +
              `🍕 *1. Pizza Hut (\$260.00 MXN)*\n` +
              `• Ticket Folio: \`1447190572627350\` | Ticket único: 9057\n` +
              `• Al intentar ingresarlo en el portal oficial de autofactura (\`sf.facelec.net:8443/autoFacelecPH/\`), el sistema arroja: *"Sucursal mal configurada"*.\n` +
              `• El propio ticket especifica que para facturarlo se debe enviar el número de ticket y constancia a: *facturacion@amigodelchef.com*.\n\n` +
              `🔧 *2. Ciosa Autopartes (\$600.00 MXN)*\n` +
              `• Folio Ticket: \`PV2050-042609-432\` / Global: \`0006150352\`\n` +
              `• Ciosa no cuenta con autofactura abierta en web al público; el ticket indica expresamente: *"Solicite su factura en tienda dentro de las 24 horas siguientes a la fecha de compra"* o vía *servicioaclientes@ciosa.com* / 800 500 3500.\n\n` +
              `¿Deseas que preparemos un correo o te envíe el texto listo para reenviárselo a atención a clientes de ambas empresas?`
      }
    }
  ];

  let seq = 1;
  // Primero enviar a Manuel, luego a Cristhian LID y Cristhian PN
  for (const r of recipients) {
    console.log(`\nEncolando mensajes para ${r.name} (${r.jid})...`);
    for (const item of items) {
      const outboxFileName = `out_${Date.now()}_${seq++}_${r.name}.json`;
      const payload = {
        jid: r.jid,
        content: item.content
      };
      fs.writeFileSync(path.join(outboxDir, outboxFileName), JSON.stringify(payload, null, 2));
      console.log(` -> Enqueued: ${outboxFileName}`);
      await sleep(1500); // 1.5s entre mensajes para evitar colisión de locks en outbox
    }
  }

  console.log('\nTodos los archivos y reportes fueron encolados al outbox con el formato oficial { jid, content }.');
}

main().catch(console.error);
