# 🧾 Bot de WhatsApp para Autofacturación de Tickets (CFDI 4.0 México)

Aplicación en **Node.js + TypeScript** que conecta un bot a tu **WhatsApp** (escaneando un código QR con Baileys), recibe la foto de cualquier ticket de compra, extrae todos los datos fiscales usando **Gemini 3.8 Flash** (`@google/genai` Interactions API), navega al portal de facturación con **Playwright** y te regresa la factura en **PDF y XML** directamente al chat de WhatsApp.

---

## ✨ Funcionalidades Principales

1. **Conexión inmediata a WhatsApp (Baileys):** Sin trámites de Meta Business; escaneas el QR en la terminal y puedes probar enviándote mensajes a tu propio chat (*"Mensajes contigo mismo"*) o desde otro número.
2. **Lectura inteligente de Tickets con Gemini 3.8 Flash:** Extrae en JSON estructurado:
   - Establecimiento, RFC Emisor y Sucursal
   - Folio del ticket y Código de Facturación Web / ID de transacción
   - Subtotal, IVA, Total y Clave SAT de Forma de Pago (`01` Efectivo, `04` Tarjeta de Crédito, `28` Débito, `03` Transferencia)
   - URL del portal de facturación (impreso en el ticket o inferido para cadenas como OXXO, Walmart, Alsea, etc.)
   - Desglose de productos/conceptos del ticket.
3. **Configuración de Perfil Fiscal por Voz/Texto o Constancia del SAT:**
   - Envía tu **Constancia de Situación Fiscal** (PDF o foto) con el comentario `constancia` y Gemini extraerá y guardará automáticamente tu RFC, Razón Social, Código Postal y Régimen Fiscal.
   - O configúralo con el comando `/rfc RFC | RAZON SOCIAL | CP | REGIMEN | USO_CFDI | EMAIL`.
4. **Agente RPA con Playwright + Generador CFDI 4.0 (PDF y XML):**
   - Abre el portal de facturación del comercio, identifica los campos del formulario con IA, los rellena con los datos del ticket + tu RFC, te envía captura de pantalla del portal y te entrega los archivos `.pdf` y `.xml` en el chat.

---

## 🚀 Cómo instalar y ejecutar

1. **Instalar dependencias:**
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Configurar tu API Key de Gemini:**
   Abre el archivo `.env` y coloca tu API Key de Google AI Studio:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```

3. **Probar el generador CFDI (PDF + XML) en consola antes de conectar WhatsApp:**
   ```bash
   npm run test:ticket
   ```

4. **Iniciar el Bot de WhatsApp:**
   ```bash
   npm start
   ```
   Escanea el código QR que aparecerá en la terminal desde tu WhatsApp (*Configuración -> Dispositivos vinculados -> Vincular un dispositivo*) y envía `/ayuda` o la foto de un ticket.
