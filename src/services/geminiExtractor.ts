import { GoogleGenAI } from "@google/genai";
import { DatosComprobantePago, DatosFiscales, DatosTicket } from "../types.js";

function obtenerApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "tu_api_key_de_gemini_aqui") {
    throw new Error(
      "Falta configurar GEMINI_API_KEY en tu archivo .env (Obtén una en https://aistudio.google.com/apikey)"
    );
  }
  return apiKey;
}

import * as zlib from "zlib";

/**
 * Extrae texto plano de un PDF del SAT (Constancia de Situación Fiscal) descomprimiendo
 * los flujos FlateDecode nativamente con zlib (toma <10ms y no depende de red).
 */
function extraerTextoPlanoDePdf(pdfBuffer: Buffer): string {
  const raw = pdfBuffer.toString("latin1");
  const textos: string[] = [];

  // Recorrer todos los bloques stream ... endstream
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]*endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw)) !== null) {
    const contenidoBinario = Buffer.from(match[1], "latin1");
    let descomprimido = "";
    try {
      descomprimido = zlib.inflateSync(contenidoBinario).toString("latin1");
    } catch {
      try {
        descomprimido = zlib.inflateRawSync(contenidoBinario).toString("latin1");
      } catch {
        descomprimido = match[1];
      }
    }

    // Extraer literales de texto entre paréntesis (...) en operadores PDF Tj / TJ
    const literalRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
    let lit: RegExpExecArray | null;
    while ((lit = literalRegex.exec(descomprimido)) !== null) {
      const limpio = lit[1]
        .replace(/\\n/g, " ")
        .replace(/\\r/g, " ")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      if (limpio.trim().length > 0) {
        textos.push(limpio.trim());
      }
    }
  }

  return textos.join(" ");
}

/**
 * Intenta extraer directamente los datos de una Constancia de Situación Fiscal (PDF del SAT)
 * a partir de su texto embebido (sirve como acelerador y respaldo si Gemini devuelve 503).
 */
function intentarExtraerCsfDePdfLocal(pdfBuffer: Buffer): DatosFiscales | null {
  try {
    const texto = extraerTextoPlanoDePdf(pdfBuffer);
    if (!texto || texto.length < 40) return null;

    const esCsf =
      /CONSTANCIA DE SITUACI/i.test(texto) ||
      /CEDULA DE IDENTIFICACI/i.test(texto) ||
      /Datos de Identificaci/i.test(texto) ||
      /Registro Federal de Contribuyentes/i.test(texto);

    if (!esCsf) return null;

    // Buscar RFC (Persona Moral 12 chars o Persona Física 13 chars)
    const rfcMatch =
      texto.match(/RFC:\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i) ||
      texto.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/);
    if (!rfcMatch) return null;
    const rfc = rfcMatch[1].toUpperCase().trim();

    // Buscar Código Postal
    const cpMatch =
      texto.match(/C[óo]digo Postal:\s*(\d{5})/i) ||
      texto.match(/\bC\.?P\.?\s*(\d{5})\b/i);
    const codigoPostal = cpMatch ? cpMatch[1] : "06600";

    // Buscar Razón Social (Persona Moral) o Nombre + Apellidos (Persona Física)
    let razonSocial = "";
    const denomMatch = texto.match(
      /Denominaci[óo]n\/Raz[óo]n Social:\s*([A-ZÑ0-9 .,;&-]+?)(?=\s+R[ée]gimen Capital:|\s+Nombre Comercial:|\s+Fecha inicio)/i
    );
    if (denomMatch && denomMatch[1]?.trim()) {
      razonSocial = denomMatch[1].trim().toUpperCase();
    } else {
      const nombreMatch = texto.match(
        /Nombre\s*\(s\):\s*([A-ZÑÁÉÍÓÚÜ .'-]+?)\s+Primer Apellido:\s*([A-ZÑÁÉÍÓÚÜ .'-]+?)(?:\s+Segundo Apellido:\s*([A-ZÑÁÉÍÓÚÜ .'-]+?))?(?=\s+Fecha inicio|\s+Estatus)/i
      );
      if (nombreMatch) {
        razonSocial = [nombreMatch[1], nombreMatch[2], nombreMatch[3]]
          .filter(Boolean)
          .map((s) => s!.trim())
          .join(" ")
          .toUpperCase();
      }
    }

    if (!razonSocial) return null;

    // Determinar clave de Régimen Fiscal SAT
    let regimenFiscal = rfc.length === 12 ? "601" : "612";
    if (/Simplificado de Confianza/i.test(texto)) regimenFiscal = "626";
    else if (/General de Ley Personas Morales/i.test(texto)) regimenFiscal = "601";
    else if (/Actividades Empresariales y Profesionales/i.test(texto)) regimenFiscal = "612";
    else if (/Sueldos y Salarios/i.test(texto)) regimenFiscal = "605";
    else if (/Sin obligaciones fiscales/i.test(texto)) regimenFiscal = "616";
    else if (/Incorporaci[óo]n Fiscal/i.test(texto)) regimenFiscal = "621";
    else if (/Plataformas Tecnol[óo]gicas/i.test(texto)) regimenFiscal = "625";
    else if (/Arrendamiento/i.test(texto)) regimenFiscal = "606";

    console.log("   -> ⚡ Constancia Fiscal extraída directamente del PDF del SAT:", {
      rfc,
      razonSocial,
      codigoPostal,
      regimenFiscal,
    });

    return {
      rfc,
      razonSocial,
      codigoPostal,
      regimenFiscal,
      usoCfdi: "G03",
      email: "facturas@ejemplo.com",
    };
  } catch {
    return null;
  }
}

/**
 * Ejecuta una consulta multimodal o de texto con salida JSON estructurada
 * con reintentos automáticos ante picos de demanda (HTTP 503 / 429).
 */
async function generarJsonConGemini(params: {
  prompt: string;
  schema: Record<string, any>;
  media?: { buffer: Buffer; mimeType: string };
}): Promise<any> {
  const apiKey = obtenerApiKey();
  const client = new GoogleGenAI({ apiKey });

  const intentos = [
    { model: "gemini-3.8-flash", useThinkingZero: true, delayMs: 0 },
    { model: "gemini-2.5-flash", useThinkingZero: true, delayMs: 1200 },
    { model: "gemini-2.0-flash", useThinkingZero: false, delayMs: 1800 },
    { model: "gemini-3.8-flash", useThinkingZero: false, delayMs: 2500 },
  ];

  let ultimoError: any = null;

  for (let i = 0; i < intentos.length; i++) {
    const intento = intentos[i];
    if (intento.delayMs > 0) {
      console.log(
        `   ⏳ Reintentando Gemini (${intento.model}, intento ${i + 1}/${intentos.length}) en ${intento.delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, intento.delayMs));
    }

    try {
      console.log(
        `   -> Llamando a ${intento.model} (intento ${i + 1}/${intentos.length})...`
      );
      const parts: any[] = [];
      if (params.media) {
        parts.push({
          inlineData: {
            data: params.media.buffer.toString("base64"),
            mimeType: params.media.mimeType,
          },
        });
      }
      parts.push({ text: params.prompt });

      const config: Record<string, any> = {
        responseMimeType: "application/json",
        responseSchema: params.schema as any,
      };
      if (intento.useThinkingZero) {
        config.thinkingConfig = { thinkingBudget: 0 };
      }

      const response: any = await Promise.race([
        client.models.generateContent({
          model: intento.model,
          contents: [{ role: "user", parts }],
          config,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout 25s en ${intento.model}`)), 25000)
        ),
      ]);

      if (response?.text) {
        console.log(`   -> ✅ Respuesta JSON recibida de ${intento.model}.`);
        return JSON.parse(response.text);
      }
    } catch (err: any) {
      ultimoError = err;
      console.warn(
        `   ⚠️ Aviso en ${intento.model} (intento ${i + 1}):`,
        err?.message?.slice(0, 180) || err
      );
    }
  }

  throw new Error(
    `No se pudo conectar con Gemini tras varios intentos (${
      ultimoError?.message || "Error desconocido"
    })`
  );
}

/**
 * Clasifica y extrae en UNA SOLA llamada si una imagen o PDF es una
 * Constancia de Situación Fiscal (CSF) o un Ticket de Compra.
 */
export async function analizarArchivoRecibido(
  fileBuffer: Buffer,
  mimeType: string,
  comentarioUsuario: string = ""
): Promise<
  | { tipo: "constancia"; perfil: DatosFiscales }
  | { tipo: "comprobante_pago"; comprobante: DatosComprobantePago }
  | { tipo: "ticket"; ticket: DatosTicket }
  | { tipo: "desconocido"; motivo: string }
> {
  // 1. Si es un PDF del SAT, intentar primero extracción instantánea local (<10ms)
  if (mimeType === "application/pdf") {
    const csfLocal = intentarExtraerCsfDePdfLocal(fileBuffer);
    if (csfLocal) {
      return { tipo: "constancia", perfil: csfLocal };
    }
  }

  const textoExtraPdf =
    mimeType === "application/pdf"
      ? extraerTextoPlanoDePdf(fileBuffer).slice(0, 4000)
      : "";

  const prompt = `Analiza este archivo adjunto (imagen o PDF) enviado a un bot de facturación CFDI 4.0 en México (SAT).${
    textoExtraPdf
      ? `\nTexto extraído del PDF como referencia:\n"""${textoExtraPdf}"""\n`
      : ""
  }${
    comentarioUsuario
      ? `\nNota/mensaje escrito por el cliente junto con el archivo: "${comentarioUsuario}" (Si el cliente indica aquí si pagó en efectivo, tarjeta de débito, tarjeta de crédito o los últimos 4 dígitos, respeta su indicación).\n`
      : ""
  }
Clasifícalo en uno de estos 4 tipos (campo "tipoDocumento"):
1. "constancia": Si es una Constancia de Situación Fiscal del SAT, Cédula de Identificación Fiscal o documento con RFC, Denominación/Razón Social y Código Postal del contribuyente.
   - En este caso llena: rfcConstancia, razonSocialConstancia (SIN régimen societario como SA DE CV o SAS DE CV, tal como exige CFDI 4.0), codigoPostalConstancia (5 dígitos) y regimenFiscalConstancia (clave SAT de 3 dígitos, ej. "601" o "626" para Personas Morales, "612" o "626" para Personas Físicas).
2. "comprobante_pago": Si es una captura de pantalla de transferencia SPEI, comprobante de pago bancario (BBVA, Nu, Banorte, Santander, Mercado Pago, etc.) o recibo de transferencia electrónica.
   - En este caso llena: montoPago, claveRastreo (alfanumérica larga), numeroReferencia, fechaPago (DD-MM-YYYY), bancoEmisor, bancoReceptor, cuentaBeneficiaria, beneficiario y concepto.
3. "ticket": Si es un ticket de compra, nota de venta, voucher de compra en tienda o recibo de consumo en cualquier establecimiento.
   - En este caso llena: establecimiento, rfcEmisor, sucursal, fechaCompra (YYYY-MM-DD), horaCompra (HH:MM), folioTicket, codigoFacturacion, subtotal, iva, montoTotal, moneda (ej. MXN), formaPago ("01" Efectivo, "04" Tarjeta de crédito, "28" Tarjeta de débito, "03" Transferencia), ultimosDigitosTarjeta, urlPortalFacturacion y la lista de conceptos.
4. "desconocido": Si no pertenece a ninguna de las categorías anteriores.`;

  const schema = {
    type: "object",
    properties: {
      tipoDocumento: {
        type: "string",
        enum: ["constancia", "comprobante_pago", "ticket", "desconocido"],
      },
      // Campos si es Constancia Fiscal (CSF)
      rfcConstancia: { type: "string", nullable: true },
      razonSocialConstancia: { type: "string", nullable: true },
      codigoPostalConstancia: { type: "string", nullable: true },
      regimenFiscalConstancia: { type: "string", nullable: true },
      // Campos si es Comprobante de Transferencia / Pago
      montoPago: { type: "number", nullable: true },
      claveRastreo: { type: "string", nullable: true },
      numeroReferencia: { type: "string", nullable: true },
      fechaPago: { type: "string", nullable: true },
      bancoEmisor: { type: "string", nullable: true },
      bancoReceptor: { type: "string", nullable: true },
      cuentaBeneficiaria: { type: "string", nullable: true },
      beneficiario: { type: "string", nullable: true },
      concepto: { type: "string", nullable: true },
      // Campos si es Ticket de Compra
      establecimiento: { type: "string", nullable: true },
      rfcEmisor: { type: "string", nullable: true },
      sucursal: { type: "string", nullable: true },
      fechaCompra: { type: "string", nullable: true },
      horaCompra: { type: "string", nullable: true },
      folioTicket: { type: "string", nullable: true },
      codigoFacturacion: { type: "string", nullable: true },
      caja: { type: "string", nullable: true },
      subtotal: { type: "number", nullable: true },
      iva: { type: "number", nullable: true },
      montoTotal: { type: "number", nullable: true },
      moneda: { type: "string", nullable: true },
      formaPago: { type: "string", nullable: true },
      ultimosDigitosTarjeta: { type: "string", nullable: true },
      urlPortalFacturacion: { type: "string", nullable: true },
      conceptos: {
        type: "array",
        nullable: true,
        items: {
          type: "object",
          properties: {
            descripcion: { type: "string" },
            cantidad: { type: "number" },
            precioUnitario: { type: "number" },
            importe: { type: "number" },
          },
          required: ["descripcion", "cantidad", "precioUnitario", "importe"],
        },
      },
    },
    required: ["tipoDocumento"],
  };

  const res = await generarJsonConGemini({
    prompt,
    schema,
    media: { buffer: fileBuffer, mimeType },
  });

  if (res?.tipoDocumento === "comprobante_pago" && (res?.montoPago || res?.montoTotal)) {
    return {
      tipo: "comprobante_pago",
      comprobante: {
        esComprobanteValido: true,
        monto: Number(res.montoPago) || Number(res.montoTotal) || 0,
        claveRastreo: res.claveRastreo || undefined,
        numeroReferencia: res.numeroReferencia || undefined,
        fecha: res.fechaPago || undefined,
        bancoEmisor: res.bancoEmisor || undefined,
        bancoReceptor: res.bancoReceptor || undefined,
        cuentaBeneficiaria: res.cuentaBeneficiaria || undefined,
        beneficiario: res.beneficiario || undefined,
        concepto: res.concepto || undefined,
      },
    };
  }

  if (res?.tipoDocumento === "constancia" && res?.rfcConstancia) {
    return {
      tipo: "constancia",
      perfil: {
        rfc: String(res.rfcConstancia).toUpperCase().trim(),
        razonSocial: String(res.razonSocialConstancia || "CONTRIBUYENTE")
          .toUpperCase()
          .trim(),
        codigoPostal: String(res.codigoPostalConstancia || "06600").trim(),
        regimenFiscal: String(
          res.regimenFiscalConstancia ||
            (String(res.rfcConstancia).trim().length === 12 ? "601" : "612")
        ).trim(),
        usoCfdi: "G03",
        email: "facturas@ejemplo.com",
      },
    };
  }

  if (res?.tipoDocumento === "ticket" && res?.montoTotal != null) {
    let formaPagoFinal = res.formaPago || "01";
    const notaLower = (comentarioUsuario || "").toLowerCase();
    if (notaLower.includes("efectivo")) {
      formaPagoFinal = "01";
    } else if (notaLower.includes("debito") || notaLower.includes("débito") || notaLower.includes("tdd")) {
      formaPagoFinal = "28";
    } else if (notaLower.includes("credito") || notaLower.includes("crédito") || notaLower.includes("tdc")) {
      formaPagoFinal = "04";
    } else if (notaLower.includes("tarjeta") && formaPagoFinal === "01") {
      formaPagoFinal = "28";
    }

    const match4Digitos = comentarioUsuario.match(/\b(\d{4})\b/);
    const ultimosDigitos =
      res.ultimosDigitosTarjeta || (match4Digitos ? match4Digitos[1] : null);

    return {
      tipo: "ticket",
      ticket: {
        esTicketValido: true,
        establecimiento: res.establecimiento || "Establecimiento Comercial",
        rfcEmisor: res.rfcEmisor || null,
        sucursal: res.sucursal || null,
        fechaCompra: res.fechaCompra || new Date().toISOString().slice(0, 10),
        horaCompra: res.horaCompra || null,
        folioTicket: res.folioTicket || null,
        codigoFacturacion: res.codigoFacturacion || null,
        caja: res.caja || null,
        subtotal: res.subtotal ?? null,
        iva: res.iva ?? null,
        montoTotal: Number(res.montoTotal) || 0,
        moneda: res.moneda || "MXN",
        formaPago: formaPagoFinal,
        ultimosDigitosTarjeta: ultimosDigitos,
        urlPortalFacturacion: res.urlPortalFacturacion || null,
        emailFacturacion: null,
        notasExtraccion: comentarioUsuario || null,
        conceptos:
          Array.isArray(res.conceptos) && res.conceptos.length > 0
            ? res.conceptos
            : [
                {
                  descripcion: `Consumo en ${res.establecimiento || "Establecimiento"}`,
                  cantidad: 1,
                  precioUnitario: Number(res.montoTotal) / 1.16,
                  importe: Number(res.montoTotal) / 1.16,
                },
              ],
      },
    };
  }

  return {
    tipo: "desconocido",
    motivo:
      "No pude identificar un Ticket de Compra ni una Constancia de Situación Fiscal en el archivo enviado. Asegúrate de que la imagen o PDF sea legible.",
  };
}

/**
 * Extrae todos los datos necesarios para facturación CFDI 4.0 en México
 * a partir de la foto de un ticket de compra.
 */
export async function extraerDatosTicket(
  imageBuffer: Buffer,
  mimeType: string = "image/jpeg"
): Promise<DatosTicket> {
  const prompt = `Eres un experto en facturación electrónica CFDI 4.0 de México (SAT).
Analiza cuidadosamente este archivo y determina si es un ticket de compra / nota de venta (esTicketValido = true). Si es una Constancia de Situación Fiscal o Cédula del SAT, pon esTicketValido = false.
Si es un ticket de compra, extrae todos los datos clave que piden los portales de autofacturación en México:
- Nombre comercial del establecimiento (ej. OXXO, Walmart, Starbucks, Pemex, Restaurante, etc.)
- RFC del emisor (si aparece impreso en el ticket)
- Número o nombre de sucursal / estación
- Fecha de compra en formato YYYY-MM-DD y hora en HH:MM
- Folio del ticket, número de nota o transacción
- Código de facturación web, ID de facturación, referencia o código especial para facturar
- Número de caja o terminal
- Subtotal, IVA desglosado y Monto Total
- Clave de Forma de Pago del SAT según cómo se pagó en el ticket:
  "01" = Efectivo, "04" = Tarjeta de crédito, "28" = Tarjeta de débito, "03" = Transferencia electrónica
- URL del portal de facturación si viene impresa en el ticket (incluye https://). Si no trae URL pero reconoces una cadena mexicana conocida (ej. OXXO -> https://www.oxxo.com/facturacion, Walmart -> https://facturacion.walmartmexico.com.mx, Alsea/Starbucks/Domino's/Vips -> https://www.facturaenlinea.com.mx), coloca su portal oficial.
- Correo electrónico de facturación si el ticket pide enviar datos por correo.
- Lista de productos/conceptos comprados con su cantidad, precio unitario e importe.`;

  const schema = {
    type: "object",
    properties: {
      esTicketValido: {
        type: "boolean",
        description:
          "true SOLO si es un ticket de compra o nota de venta con monto total. false si es una Constancia de Situación Fiscal u otro documento.",
      },
      establecimiento: { type: "string" },
      rfcEmisor: { type: "string", nullable: true },
      sucursal: { type: "string", nullable: true },
      fechaCompra: { type: "string", nullable: true },
      horaCompra: { type: "string", nullable: true },
      folioTicket: { type: "string", nullable: true },
      codigoFacturacion: { type: "string", nullable: true },
      caja: { type: "string", nullable: true },
      subtotal: { type: "number", nullable: true },
      iva: { type: "number", nullable: true },
      montoTotal: { type: "number" },
      moneda: { type: "string" },
      formaPago: {
        type: "string",
        description: "Clave SAT: 01, 03, 04 o 28",
      },
      urlPortalFacturacion: { type: "string", nullable: true },
      emailFacturacion: { type: "string", nullable: true },
      conceptos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descripcion: { type: "string" },
            cantidad: { type: "number" },
            precioUnitario: { type: "number" },
            importe: { type: "number" },
          },
          required: ["descripcion", "cantidad", "precioUnitario", "importe"],
        },
      },
      notasExtraccion: { type: "string", nullable: true },
    },
    required: [
      "esTicketValido",
      "establecimiento",
      "montoTotal",
      "moneda",
      "formaPago",
      "conceptos",
    ],
  };

  return (await generarJsonConGemini({
    prompt,
    schema,
    media: { buffer: imageBuffer, mimeType },
  })) as DatosTicket;
}

/**
 * Extrae los datos fiscales del usuario si envía una foto o PDF de su Constancia de Situación Fiscal del SAT.
 */
export async function extraerConstanciaFiscal(
  fileBuffer: Buffer,
  mimeType: string
): Promise<DatosFiscales | null> {
  const prompt = `Analiza este documento o imagen.
Determina si es una Constancia de Situación Fiscal del SAT (México), Cédula de Identificación Fiscal o documento con datos fiscales de un contribuyente (esConstanciaValida = true). Si es un ticket de supermercado o recibo de compra, pon esConstanciaValida = false.
Si es una Constancia Fiscal válida, extrae:
- RFC del contribuyente (12 o 13 caracteres)
- Nombre completo o Denominación/Razón Social (sin el régimen societario como S.A. DE C.V. si es persona moral, tal como pide CFDI 4.0)
- Código Postal (5 dígitos) del domicilio fiscal
- Clave de 3 dígitos del Régimen Fiscal principal del SAT (ej. "601" General de Ley Personas Morales, "605" Sueldos y Salarios, "612" Personas Físicas con Actividades Empresariales y Profesionales, "626" Régimen Simplificado de Confianza RESICO, "616" Sin obligaciones fiscales).`;

  const schema = {
    type: "object",
    properties: {
      esConstanciaValida: {
        type: "boolean",
        description:
          "true si el documento o imagen es una Constancia de Situación Fiscal o Cédula de Identificación Fiscal del SAT",
      },
      rfc: { type: "string" },
      razonSocial: { type: "string" },
      codigoPostal: { type: "string" },
      regimenFiscal: {
        type: "string",
        description: "Clave SAT de 3 dígitos, ej. 601, 605, 612, 626",
      },
    },
    required: [
      "esConstanciaValida",
      "rfc",
      "razonSocial",
      "codigoPostal",
      "regimenFiscal",
    ],
  };

  const parsed = await generarJsonConGemini({
    prompt,
    schema,
    media: { buffer: fileBuffer, mimeType },
  });

  if (!parsed || !parsed.esConstanciaValida || !parsed.rfc) return null;

  return {
    rfc: parsed.rfc,
    razonSocial: parsed.razonSocial,
    codigoPostal: parsed.codigoPostal || "06600",
    regimenFiscal: parsed.regimenFiscal || "612",
    usoCfdi: "G03",
    email: "facturas@ejemplo.com",
  };
}

export interface AccionFormularioPortal {
  selector: string;
  accion: "fill" | "select" | "click";
  valor?: string;
  descripcion: string;
}

export async function mapearFormularioPortalConIA(
  elementosDomJson: string,
  ticket: DatosTicket,
  perfil: DatosFiscales
): Promise<{ acciones: AccionFormularioPortal[]; explicacion: string }> {
  const prompt = `Eres un agente RPA experto en llenar portales de autofacturación CFDI 4.0 en México.
Datos del ticket:
${JSON.stringify(ticket, null, 2)}

Datos fiscales del receptor:
${JSON.stringify(perfil, null, 2)}

Campos interactivos detectados en el portal:
${elementosDomJson}

Determina la secuencia exacta de acciones ("fill", "select" o "click") para ingresar los datos del ticket y/o RFC en esta pantalla.`;

  const schema = {
    type: "object",
    properties: {
      explicacion: { type: "string" },
      acciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            selector: { type: "string" },
            accion: { type: "string", enum: ["fill", "select", "click"] },
            valor: { type: "string", nullable: true },
            descripcion: { type: "string" },
          },
          required: ["selector", "accion", "descripcion"],
        },
      },
    },
    required: ["explicacion", "acciones"],
  };

  try {
    return await generarJsonConGemini({ prompt, schema });
  } catch {
    return { acciones: [], explicacion: "No se pudieron determinar acciones." };
  }
}
