import * as fs from "fs";
import * as path from "path";
import { procesarLoteCompletoAutonomo } from "./batchRouter.js";
const activeSessions = new Map();
const DEBOUNCE_WAIT_MS = 8000; // 8 segundos después del último ticket recibido para empezar
/**
 * Agrega un ticket a la cola de procesamiento por lote de un usuario.
 * Si el usuario envía varios tickets seguidos, se acumulan y se procesan juntos.
 */
export function encolarTicketEnLote(params) {
    const { jid, perfil, ticket, rawText, imageBuffer, mimeType, onFirstItem, onItemCountUpdate, onProcessStart, onDeliverResult, onBatchComplete, onProgressNotice, } = params;
    let session = activeSessions.get(jid);
    const isFirst = !session;
    if (!session) {
        session = {
            jid,
            perfil,
            timer: null,
            items: [],
            startedAt: Date.now(),
        };
        activeSessions.set(jid, session);
    }
    // Guardar copia local de la imagen para posibles adjuntos de correo o auditoría
    const ticketsDir = path.resolve(process.cwd(), "scratch", "tickets_recibidos");
    if (!fs.existsSync(ticketsDir))
        fs.mkdirSync(ticketsDir, { recursive: true });
    const ext = mimeType?.includes("png") ? "png" : "jpeg";
    const itemId = `ticket_${Date.now()}_${session.items.length + 1}`;
    const imgPath = path.join(ticketsDir, `${itemId}.${ext}`);
    if (imageBuffer) {
        fs.writeFileSync(imgPath, imageBuffer);
    }
    session.items.push({
        id: itemId,
        imagePath: imgPath,
        imageBuffer,
        ticket,
        rawText,
    });
    if (session.timer) {
        clearTimeout(session.timer);
    }
    if (isFirst) {
        if (onFirstItem)
            onFirstItem();
    }
    else {
        if (onItemCountUpdate)
            onItemCountUpdate(session.items.length);
    }
    // Programar la ejecución autónoma una vez que el usuario termine de enviar sus tickets
    session.timer = setTimeout(async () => {
        activeSessions.delete(jid);
        const itemsToProcess = session.items;
        const currentPerfil = session.perfil;
        console.log(`\n🚀 [BatchQueue] Iniciando procesamiento autónomo de ${itemsToProcess.length} tickets para ${jid}...`);
        if (onProcessStart) {
            await onProcessStart(itemsToProcess.length);
        }
        try {
            const resultados = await procesarLoteCompletoAutonomo(itemsToProcess, currentPerfil, async (progressMsg) => {
                if (onProgressNotice)
                    await onProgressNotice(progressMsg);
            });
            // Entregar cada resultado conforme termine
            for (const res of resultados) {
                if (onDeliverResult) {
                    await onDeliverResult(res);
                }
            }
            const totalMonto = resultados.reduce((sum, r) => sum + r.total, 0);
            const exitosas = resultados.filter((r) => r.exito).length;
            const summaryText = `🎉 *Lote de tickets procesado con éxito:*
• *Tickets analizados:* ${itemsToProcess.length}
• *Facturas/Trámites generados:* ${exitosas} de ${resultados.length}
• *Monto total facturado:* $${totalMonto.toFixed(2)} MXN
• *Receptor:* ${currentPerfil.razonSocial} (\`${currentPerfil.rfc}\`)`;
            if (onBatchComplete) {
                await onBatchComplete(summaryText);
            }
        }
        catch (err) {
            console.error("[BatchQueue] Error procesando lote:", err);
            if (onProgressNotice) {
                await onProgressNotice(`⚠️ Ocurrió una eventualidad procesando el lote: ${err?.message || err}`);
            }
        }
    }, DEBOUNCE_WAIT_MS);
}
