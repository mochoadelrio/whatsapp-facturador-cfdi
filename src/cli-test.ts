import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { extraerDatosTicket } from "./services/geminiExtractor.js";
import { procesarFacturacionTicket } from "./services/invoicingAgent.js";
import { obtenerPerfilFiscal } from "./storage/profiles.js";
import { DatosTicket } from "./types.js";

/**
 * Script de prueba rápida por consola (sin necesidad de WhatsApp):
 * - Si pasas la ruta de una imagen (`npm run test:ticket -- ./mi_ticket.jpg`), la analiza con Gemini 3.8 Flash.
 * - Si no pasas imagen, prueba la generación de PDF y XML CFDI 4.0 con un ticket de ejemplo de OXXO.
 */
async function ejecutarPruebaCli() {
  const rutaImagen = process.argv[2];
  const { perfil } = obtenerPerfilFiscal("usuario_prueba@s.whatsapp.net");

  let datosTicket: DatosTicket;

  if (rutaImagen && fs.existsSync(rutaImagen)) {
    console.log(`📸 Leyendo imagen de ticket: ${rutaImagen} con Gemini 3.8 Flash...`);
    const buffer = fs.readFileSync(rutaImagen);
    datosTicket = await extraerDatosTicket(buffer, "image/jpeg");
  } else {
    console.log("🧾 Ejecutando prueba con ticket simulado de OXXO (puedes pasar una foto real con: npm run test:ticket -- ruta/a/ticket.jpg)...");
    datosTicket = {
      esTicketValido: true,
      establecimiento: "CADENA COMERCIAL OXXO, S.A. DE C.V.",
      rfcEmisor: "CCO8605231N4",
      sucursal: "OXXO REFORMA CENTRO",
      fechaCompra: new Date().toISOString().slice(0, 10),
      horaCompra: "14:35",
      folioTicket: "4829104",
      codigoFacturacion: "ID-99481023-OX",
      caja: "02",
      subtotal: 133.62,
      iva: 21.38,
      montoTotal: 155.0,
      moneda: "MXN",
      formaPago: "04",
      urlPortalFacturacion: null,
      emailFacturacion: null,
      conceptos: [
        {
          descripcion: "CAFE AMERICANO GRANDE ANDATTI",
          cantidad: 2,
          precioUnitario: 32.76,
          importe: 65.52,
        },
        {
          descripcion: " AGUA MINERAL PENAFEL 600ML",
          cantidad: 2,
          precioUnitario: 18.1,
          importe: 36.2,
        },
        {
          descripcion: "BARRA DE PROTEINA",
          cantidad: 1,
          precioUnitario: 31.9,
          importe: 31.9,
        },
      ],
      notasExtraccion: "Ticket de demostración",
    };
  }

  console.log("\n✅ Datos del Ticket:", JSON.stringify(datosTicket, null, 2));

  const resultado = await procesarFacturacionTicket(datosTicket, perfil);
  const outDir = path.resolve(process.cwd(), "output_pruebas");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (resultado.pdfBuffer) {
    const pdfPath = path.join(outDir, `${resultado.nombreArchivoBase}.pdf`);
    fs.writeFileSync(pdfPath, resultado.pdfBuffer);
    console.log(`📄 PDF CFDI 4.0 guardado en: ${pdfPath}`);
  }

  if (resultado.xmlBuffer) {
    const xmlPath = path.join(outDir, `${resultado.nombreArchivoBase}.xml`);
    fs.writeFileSync(xmlPath, resultado.xmlBuffer);
    console.log(`🗂️ XML CFDI 4.0 guardado en: ${xmlPath}`);
  }
}

ejecutarPruebaCli().catch((err) => {
  console.error("Error en prueba CLI:", err);
  process.exit(1);
});
