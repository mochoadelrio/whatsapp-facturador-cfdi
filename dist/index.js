import "dotenv/config";
import { iniciarBotWhatsApp } from "./whatsapp/bot.js";
import { iniciarServidorMetaWebhook } from "./whatsapp/metaCloudApi.js";
async function main() {
    console.log("========================================================");
    console.log("🚀 Iniciando Bot de Facturación CFDI 4.0 para WhatsApp");
    console.log("   Motor IA: Gemini 3.8 Flash (@google/genai)");
    console.log("   Motor RPA: Playwright + Conectores Autónomos Oficiales");
    console.log("========================================================\n");
    if (!process.env.GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY === "tu_api_key_de_gemini_aqui") {
        console.warn("⚠️ AVISO: Aún no has configurado tu GEMINI_API_KEY en el archivo .env.");
    }
    // Si se configuran credenciales de Meta Cloud API, arrancar el servidor de Webhooks oficial
    if (process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID) {
        const port = Number(process.env.PORT) || 3000;
        console.log("🌐 Activando modo oficial: Meta WhatsApp Cloud API (Webhooks)...");
        iniciarServidorMetaWebhook(port);
    }
    else {
        // Modo estándar: WhatsApp Web / Baileys (Código QR)
        console.log("📱 Activando modo estándar: WhatsApp Web Multi-Device...");
        await iniciarBotWhatsApp();
    }
}
main().catch((err) => {
    console.error("Error fatal al iniciar la aplicación:", err);
    process.exit(1);
});
