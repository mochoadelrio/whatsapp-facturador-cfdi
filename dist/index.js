import "dotenv/config";
import { iniciarBotWhatsApp } from "./whatsapp/bot.js";
async function main() {
    console.log("========================================================");
    console.log("🚀 Iniciando Bot de Facturación CFDI 4.0 para WhatsApp");
    console.log("   Motor IA: Gemini 3.8 Flash (@google/genai)");
    console.log("   Motor RPA: Playwright + CFDI 4.0 Generator");
    console.log("========================================================\n");
    if (!process.env.GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY === "tu_api_key_de_gemini_aqui") {
        console.warn("⚠️ AVISO: Aún no has configurado tu GEMINI_API_KEY en el archivo .env.");
        console.warn("   Crea un archivo .env basado en .env.example y agrega tu llave de https://aistudio.google.com/apikey\n");
    }
    await iniciarBotWhatsApp();
}
main().catch((err) => {
    console.error("Error fatal al iniciar la aplicación:", err);
    process.exit(1);
});
