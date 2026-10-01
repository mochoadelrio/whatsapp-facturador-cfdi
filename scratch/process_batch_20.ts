import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();

import { extraerDatosTicket } from "../src/services/geminiExtractor.js";

async function main() {
  const dir = path.resolve(process.cwd(), "scratch/tickets_lote_20");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".jpeg") || f.endsWith(".jpg") || f.endsWith(".png"));

  console.log(`🚀 Iniciando extracción masiva de ${files.length} tickets con Gemini 3.8 Flash...`);

  const resultados: any[] = [];

  // Procesar con concurrencia de 4 para no saturar y ser ultra veloces
  const CONCURRENCY = 4;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    console.log(`Procesando lote ${i + 1} a ${Math.min(i + CONCURRENCY, files.length)} de ${files.length}...`);

    const promesas = chunk.map(async (filename) => {
      const filePath = path.join(dir, filename);
      const buffer = fs.readFileSync(filePath);
      try {
        const datos = await extraerDatosTicket(buffer, "image/jpeg");
        return {
          archivo: filename,
          exito: true,
          establecimiento: datos.establecimiento,
          rfcEmisor: datos.rfcEmisor,
          folio: datos.folioTicket,
          codigoFacturacion: datos.codigoFacturacion,
          fecha: datos.fechaCompra,
          montoTotal: datos.montoTotal,
          formaPago: datos.formaPago,
          urlPortal: datos.urlPortalFacturacion,
          conceptos: datos.conceptos,
        };
      } catch (err: any) {
        console.error(`Error procesando ${filename}:`, err.message);
        return {
          archivo: filename,
          exito: false,
          error: err.message,
        };
      }
    });

    const chunkResultados = await Promise.all(promesas);
    resultados.push(...chunkResultados);
  }

  const outPath = path.resolve(process.cwd(), "scratch/resultados_lote_20.json");
  fs.writeFileSync(outPath, JSON.stringify(resultados, null, 2), "utf-8");
  console.log(`\n✅ Extracción terminada. Guardado en ${outPath}`);

  // Agrupar por establecimiento / portal
  const grupos: Record<string, any[]> = {};
  for (const r of resultados) {
    if (!r.exito) continue;
    const est = (r.establecimiento || "Otros").trim().toUpperCase();
    if (!grupos[est]) grupos[est] = [];
    grupos[est].push(r);
  }

  console.log("\n📊 RESUMEN POR PROVEEDOR / GRUPO:");
  let totalGlobal = 0;
  for (const [est, items] of Object.entries(grupos)) {
    const subtotalGrupo = items.reduce((acc, it) => acc + (Number(it.montoTotal) || 0), 0);
    totalGlobal += subtotalGrupo;
    console.log(`\n🏢 ${est} (${items.length} tickets) - Total: $${subtotalGrupo.toFixed(2)} MXN`);
    items.forEach((it, idx) => {
      console.log(`   ${idx + 1}. Folio/Cod: ${it.codigoFacturacion || it.folio || 'S/N'} | Fecha: ${it.fecha} | Total: $${it.montoTotal} | Forma Pago: ${it.formaPago}`);
    });
  }

  console.log(`\n💰 Gran Total de los 20 tickets: $${totalGlobal.toFixed(2)} MXN\n`);
}

main().catch(console.error);
