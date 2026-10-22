import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import AdmZip from "adm-zip";
import { BovedaCsd } from "../types.js";

const FINKOK_USERNAME = process.env.FINKOK_USERNAME || "m.ochoa.delrio@gmail.com";
const FINKOK_PASSWORD = process.env.FINKOK_PASSWORD || "Modr1988-+";
const FINKOK_ENV = (process.env.FINKOK_ENV || "DEMO").toUpperCase();

function obtenerRegistrationEndpoint(ambiente?: "DEMO" | "PROD"): string {
  const env = ambiente || (FINKOK_ENV === "PROD" || FINKOK_ENV === "PRODUCCION" ? "PROD" : "DEMO");
  return env === "PROD"
    ? "https://facturacion.finkok.com/servicios/soap/registration"
    : "https://demo-facturacion.finkok.com/servicios/soap/registration";
}

/**
 * Da de alta automáticamente un RFC emisor bajo la cuenta de reseller en Finkok PAC
 * mediante el Web Service de Registro (método SOAP "add").
 * Esto evita el error 702 del PAC ("No ha registrado el RFC emisor bajo la cuenta de Finkok").
 */
export async function registrarRfcEnFinkok(
  rfc: string,
  ambiente?: "DEMO" | "PROD"
): Promise<{
  exito: boolean;
  mensaje: string;
  yaExiste?: boolean;
}> {
  const rfcLimpio = rfc.trim().toUpperCase();
  const endpoint = obtenerRegistrationEndpoint(ambiente);

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:reg="http://facturacion.finkok.com/registration">
  <soapenv:Header/>
  <soapenv:Body>
    <reg:add>
      <reg:reseller_username>${FINKOK_USERNAME}</reg:reseller_username>
      <reg:reseller_password>${FINKOK_PASSWORD}</reg:reseller_password>
      <reg:taxpayer_id>${rfcLimpio}</reg:taxpayer_id>
      <reg:type_user>O</reg:type_user>
    </reg:add>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    console.log(`📡 [Finkok Registration] Registrando RFC ${rfcLimpio} en ${endpoint}...`);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "add",
      },
      body: soapEnvelope,
    });

    const xml = await resp.text();
    console.log(`📥 [Finkok Registration] Respuesta (${resp.status}): ${xml.slice(0, 300)}`);

    const matchSuccess = xml.match(/<(?:\w+:)?success>([^<]+)<\/(?:\w+:)?success>/i);
    const matchMessage = xml.match(/<(?:\w+:)?message>([^<]+)<\/(?:\w+:)?message>/i);

    const isSuccess = matchSuccess ? matchSuccess[1].toLowerCase() === "true" : false;
    const mensaje = matchMessage ? matchMessage[1].trim() : "";

    if (isSuccess) {
      const yaExiste = mensaje.toLowerCase().includes("already exists");
      return {
        exito: true,
        mensaje: yaExiste
          ? "El RFC ya se encontraba dado de alta y activo en Finkok."
          : "RFC registrado y activado exitosamente en Finkok PAC.",
        yaExiste,
      };
    }

    if (mensaje.toLowerCase().includes("already exists")) {
      return {
        exito: true,
        mensaje: "El RFC ya se encuentra registrado y activo en Finkok.",
        yaExiste: true,
      };
    }

    return {
      exito: false,
      mensaje: mensaje || `Error al dar de alta RFC en Finkok (HTTP ${resp.status})`,
    };
  } catch (err: any) {
    console.error("❌ Error en registrarRfcEnFinkok:", err);
    return {
      exito: false,
      mensaje: err?.message || String(err),
    };
  }
}

/**
 * Consulta el estatus de un RFC emisor en Finkok mediante el método SOAP "get".
 */
export async function consultarEstatusRfcFinkok(
  rfc: string,
  ambiente?: "DEMO" | "PROD"
): Promise<{
  registrado: boolean;
  activo: boolean;
  status?: string;
  counter?: number;
  credit?: number;
  mensaje?: string;
}> {
  const rfcLimpio = rfc.trim().toUpperCase();
  const endpoint = obtenerRegistrationEndpoint(ambiente);

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:reg="http://facturacion.finkok.com/registration">
  <soapenv:Header/>
  <soapenv:Body>
    <reg:get>
      <reg:reseller_username>${FINKOK_USERNAME}</reg:reseller_username>
      <reg:reseller_password>${FINKOK_PASSWORD}</reg:reseller_password>
      <reg:taxpayer_id>${rfcLimpio}</reg:taxpayer_id>
    </reg:get>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "get",
      },
      body: soapEnvelope,
    });

    const xml = await resp.text();
    const matchStatus = xml.match(/<(?:\w+:)?status>([^<]+)<\/(?:\w+:)?status>/i);
    const matchCounter = xml.match(/<(?:\w+:)?counter>([^<]+)<\/(?:\w+:)?counter>/i);
    const matchCredit = xml.match(/<(?:\w+:)?credit>([^<]+)<\/(?:\w+:)?credit>/i);
    const matchMessage = xml.match(/<(?:\w+:)?message>([^<]+)<\/(?:\w+:)?message>/i);

    if (matchStatus) {
      const status = matchStatus[1].trim().toUpperCase();
      return {
        registrado: true,
        activo: status === "A",
        status,
        counter: matchCounter ? parseInt(matchCounter[1], 10) : 0,
        credit: matchCredit ? parseInt(matchCredit[1], 10) : undefined,
      };
    }

    return {
      registrado: false,
      activo: false,
      mensaje: matchMessage ? matchMessage[1].trim() : "No registrado en Finkok",
    };
  } catch (err: any) {
    return {
      registrado: false,
      activo: false,
      mensaje: err?.message || String(err),
    };
  }
}

/**
 * Valida un Certificado de Sello Digital (.cer), Llave Privada (.key) y Contraseña.
 * Si es válido, lo persiste en /certs y extrae todos los metadatos fiscales del CSD.
 */
export async function validarEInstalarCsd(params: {
  rfc: string;
  cerBuffer?: Buffer;
  keyBuffer?: Buffer;
  password?: string;
  zipBuffer?: Buffer;
}): Promise<{
  valido: boolean;
  error?: string;
  noCertificado?: string;
  fechaInicio?: string;
  fechaFin?: string;
  cerFile?: string;
  keyFile?: string;
  diasVigenciaRestantes?: number;
  finkokRegistro?: { exito: boolean; mensaje: string };
}> {
  const rfcLimpio = params.rfc.trim().toUpperCase();
  let cerBuf = params.cerBuffer;
  let keyBuf = params.keyBuffer;

  // Si vino un archivo .zip, extraer .cer y .key
  if (params.zipBuffer && (!cerBuf || !keyBuf)) {
    try {
      const zip = new AdmZip(params.zipBuffer);
      const zipEntries = zip.getEntries();
      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          const entryName = entry.entryName.toLowerCase();
          if (entryName.endsWith(".cer") && !cerBuf) {
            cerBuf = entry.getData();
          } else if (entryName.endsWith(".key") && !keyBuf) {
            keyBuf = entry.getData();
          }
        }
      }
    } catch (err: any) {
      return {
        valido: false,
        error: `No se pudo descomprimir el archivo ZIP de los sellos: ${err?.message || err}`,
      };
    }
  }

  if (!cerBuf) {
    return {
      valido: false,
      error: "Falta el archivo de certificado público (.cer).",
    };
  }

  if (!keyBuf) {
    return {
      valido: false,
      error: "Falta el archivo de llave privada (.key).",
    };
  }

  if (!params.password || params.password.trim() === "") {
    return {
      valido: false,
      error: "Falta la contraseña de la llave privada del CSD.",
    };
  }

  const passwordLimpia = params.password.trim();

  // 1. Analizar Certificado X.509 (.cer)
  let x509: crypto.X509Certificate;
  try {
    x509 = new crypto.X509Certificate(cerBuf);
  } catch (err: any) {
    return {
      valido: false,
      error: `El archivo .cer no es un certificado X.509 válido: ${err?.message || err}`,
    };
  }

  // 2. Extraer No. de Certificado (20 dígitos ASCII desde serial hex)
  const serialHex = x509.serialNumber;
  let noCertificado = "";
  for (let i = 0; i < serialHex.length; i += 2) {
    const code = parseInt(serialHex.substring(i, i + 2), 16);
    if (code >= 32 && code <= 126) {
      noCertificado += String.fromCharCode(code);
    }
  }

  if (noCertificado.length !== 20) {
    // Si la conversión directa no dio 20 caracteres, intentar extraer los dígitos
    const digitos = serialHex.replace(/[^0-9]/g, "");
    if (digitos.length >= 20) noCertificado = digitos.slice(0, 20);
  }

  // 3. Validar vigencia
  const fechaFinDate = new Date(x509.validTo);
  const fechaInicioDate = new Date(x509.validFrom);
  const ahora = Date.now();
  const msRestantes = fechaFinDate.getTime() - ahora;
  const diasRestantes = Math.ceil(msRestantes / (1000 * 60 * 60 * 24));

  if (diasRestantes <= 0) {
    return {
      valido: false,
      error: `El certificado CSD está VENCIDO desde el ${x509.validTo}. Tramita un nuevo CSD en el portal del SAT.`,
    };
  }

  // 4. Validar contraseña y abrir llave privada (.key)
  let pkey: crypto.KeyObject;
  try {
    pkey = crypto.createPrivateKey({
      key: keyBuf,
      format: "der",
      type: "pkcs8",
      passphrase: passwordLimpia,
    });
  } catch (err: any) {
    return {
      valido: false,
      error:
        "Contraseña incorrecta para la llave privada (.key) o formato no soportado. Verifica tu clave de sellos digitales.",
    };
  }

  // 5. Validar que la llave privada corresponda al certificado público (.cer)
  try {
    const testPayload = Buffer.from(`klientia-verify-${Date.now()}`);
    const sign = crypto.createSign("SHA256");
    sign.update(testPayload);
    sign.end();
    const signature = sign.sign(pkey);

    const verify = crypto.createVerify("SHA256");
    verify.update(testPayload);
    verify.end();
    const match = verify.verify(x509.publicKey, signature);

    if (!match) {
      return {
        valido: false,
        error:
          "La llave privada (.key) no corresponde a este certificado (.cer). Asegúrate de enviar el par de sellos digitales correcto.",
      };
    }
  } catch (err: any) {
    return {
      valido: false,
      error: `Error al verificar la correspondencia de llaves: ${err?.message || err}`,
    };
  }

  // 6. Guardar archivos validados en el directorio certs/
  const certsDir = path.resolve(process.cwd(), "certs");
  if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });

  const cerFileName = `${rfcLimpio}.cer`;
  const keyFileName = `${rfcLimpio}.key`;
  fs.writeFileSync(path.join(certsDir, cerFileName), cerBuf);
  fs.writeFileSync(path.join(certsDir, keyFileName), keyBuf);

  // 7. Registrar automáticamente el RFC en Finkok PAC para autorizar timbrado
  const regFinkok = await registrarRfcEnFinkok(rfcLimpio);

  return {
    valido: true,
    noCertificado,
    fechaInicio: fechaInicioDate.toISOString().slice(0, 10),
    fechaFin: fechaFinDate.toISOString().slice(0, 10),
    cerFile: cerFileName,
    keyFile: keyFileName,
    diasVigenciaRestantes: diasRestantes,
    finkokRegistro: regFinkok,
  };
}
