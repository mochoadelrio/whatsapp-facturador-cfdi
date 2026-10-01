import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("Probando con vertexai: false (Gemini Developer API)...");
    try {
        const client1 = new GoogleGenAI({ apiKey });
        const r1 = await client1.interactions.create({
            model: "gemini-3.8-flash",
            input: "Responde solo OK",
        });
        console.log("Exito 1 (interactions):", r1.output_text);
    }
    catch (e) {
        console.error("Fallo 1 (interactions):", e?.message || e);
    }
    console.log("Probando con vertexai: true (Vertex AI Express Mode)...");
    try {
        const client2 = new GoogleGenAI({ apiKey, vertexai: true });
        const r2 = await client2.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "Responde solo OK",
        });
        console.log("Exito 2 (vertexai generateContent):", r2.text);
    }
    catch (e) {
        console.error("Fallo 2:", e?.message || e);
    }
}
run();
