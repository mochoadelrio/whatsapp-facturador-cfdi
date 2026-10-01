const fs = require('fs');
const path = require('path');

const outboxDir = path.resolve('data/outbox');
if (!fs.existsSync(outboxDir)) {
  fs.mkdirSync(outboxDir, { recursive: true });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const manuelJid = '5214773929593@s.whatsapp.net';
  const cristhianLid = '140974432981152@lid';

  const files = [
    // Lote 3
    {
      filePath: path.resolve('downloads/Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.pdf'),
      fileName: 'Factura_Las_Varas_KCAV455057.pdf',
      mimetype: 'application/pdf',
      caption: '🧾 Factura Lote 3 PDF: Autopista Las Varas - Puerto Vallarta (\$148.00 MXN) | UUID: 89FA18D4-BD53-11F1-BB5F-378AB08C3964'
    },
    {
      filePath: path.resolve('downloads/Factura_Las_Varas_KCAV455057_2_Casetas_148MXN.xml'),
      fileName: 'Factura_Las_Varas_KCAV455057.xml',
      mimetype: 'text/xml',
      caption: '📄 CFDI 4.0 XML Lote 3: Autopista Las Varas - Puerto Vallarta'
    },
    // Lote 4
    {
      filePath: path.resolve('downloads/Factura_Jala_Compostela_JC787247_428MXN.pdf'),
      fileName: 'Factura_Jala_Compostela_JC787247.pdf',
      mimetype: 'application/pdf',
      caption: '🧾 Factura Lote 4 PDF: Autopista Jala - Compostela (\$428.00 MXN) | UUID: d9f2daf5-0ef4-4a3a-9ecf-e12e41073921'
    },
    {
      filePath: path.resolve('downloads/Factura_Jala_Compostela_JC787247_428MXN.xml'),
      fileName: 'Factura_Jala_Compostela_JC787247.xml',
      mimetype: 'text/xml',
      caption: '📄 CFDI 4.0 XML Lote 4: Autopista Jala - Compostela'
    },
    // Lote 5
    {
      filePath: path.resolve('downloads/Factura_Walmart_ViaAlta_474MXN.pdf'),
      fileName: 'Factura_Walmart_IWAVX242617.pdf',
      mimetype: 'application/pdf',
      caption: '🧾 Factura Lote 5 PDF: Walmart México Unidad Vía Alta (\$474.00 MXN) | UUID: A5822262-DEE4-4646-AB99-F52854F1677B'
    }
  ];

  // 1. Enviar mensaje de resumen a Manuel
  const introMsgManuel = {
    to: manuelJid,
    type: 'text',
    text: `📂 *Facturas completadas de los Lotes 3, 4 y 5:*\n\n` +
          `A continuación te adjunto directamente los archivos PDF y XML timbrados de los lotes 3, 4 y 5:`
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_0_intro_manuel.json`), JSON.stringify(introMsgManuel, null, 2));
  console.log('Enqueued: Intro Manuel');
  await sleep(1000);

  // 2. Enviar cada archivo a Manuel
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const docMsg = {
      to: manuelJid,
      type: 'document',
      filePath: f.filePath,
      fileName: f.fileName,
      mimetype: f.mimetype,
      caption: f.caption
    };
    fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_${i + 1}_manuel_${f.fileName}.json`), JSON.stringify(docMsg, null, 2));
    console.log(`Enqueued to Manuel: ${f.fileName}`);
    await sleep(1200);
  }

  // 3. Enviar mensaje final con la explicación sobre Pizza Hut y Ciosa a Manuel
  const infoMsgManuel = {
    to: manuelJid,
    type: 'text',
    text: `ℹ️ *Sobre los tickets de Pizza Hut y Ciosa:*\n\n` +
          `• *Pizza Hut (\$260.00 MXN):* En el portal de Pizza Hut/Amigo del Chef la sucursal 1447 aparece como "Sucursal mal configurada". El ticket impreso pide solicitarla enviando el número de ticket (1447190572627350) y la constancia de situación fiscal a: *facturacion@amigodelchef.com*.\n\n` +
          `• *Ciosa Autopartes (\$600.00 MXN):* Ciosa no cuenta con autofactura abierta en web; en el ticket se indica: *"Solicite su factura en tienda dentro de las 24 horas siguientes a la compra"* o contactando a *servicioaclientes@ciosa.com* / 800 500 3500.\n\n` +
          `¿Gusta que mande un correo automático a ambos proveedores con los datos fiscales de Cristhian para que emitan las facturas?`
  };
  fs.writeFileSync(path.join(outboxDir, `msg_${Date.now()}_99_info_manuel.json`), JSON.stringify(infoMsgManuel, null, 2));
  console.log('Enqueued info Pizza Hut & Ciosa to Manuel');

  console.log('Envío completado exitosamente.');
}

main().catch(console.error);
