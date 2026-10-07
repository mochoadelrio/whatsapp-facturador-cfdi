import { facturarLoteRco } from "../connectors/rcoConnector.js";
import { facturarLoteIdeal } from "../connectors/idealConnector.js";
import { facturarLoteLasVaras } from "../connectors/lasVarasConnector.js";
import { facturarLoteJalaCompostela } from "../connectors/jalaConnector.js";
import { facturarTicketWalmart } from "../connectors/walmartConnector.js";
import { facturarTicketOxxo } from "../connectors/oxxoConnector.js";
import { facturarTicketFarmaciasGuadalajara } from "../connectors/farmaciasGdlConnector.js";
import { facturarTicketCostco } from "../connectors/costcoConnector.js";
import { facturarTicketOxxoGas } from "../connectors/oxxoGasConnector.js";
import { facturarTicketG500 } from "../connectors/g500Connector.js";
import { facturarTicketAutoZone } from "../connectors/autozoneConnector.js";
import { facturarTicketHeb } from "../connectors/hebConnector.js";
import { facturarTicketChedraui } from "../connectors/chedrauiConnector.js";
import { facturarTicketSoriana } from "../connectors/sorianaConnector.js";
import { facturarTicketPepsico } from "../connectors/pepsicoConnector.js";
import { facturarTicketPropimex } from "../connectors/propimexConnector.js";
import { facturarTicketMercadoSanJuan } from "../connectors/mercadoSanJuanConnector.js";
import { facturarTicketBara } from "../connectors/baraConnector.js";
import { facturarTicketGasNoel } from "../connectors/gasNoelConnector.js";
import { facturarBoletoFlechaAmarilla } from "../connectors/flechaAmarillaConnector.js";
import { facturarGuiaCastores } from "../connectors/castoresConnector.js";
import { facturarTicketDulceriasVazquez } from "../connectors/dulceriasVazquezConnector.js";
import { facturarTicketCoqueta } from "../connectors/coquetaConnector.js";
import { facturarTicketCepesmar } from "../connectors/cepesmarConnector.js";
import { facturarTicketAtlantimex } from "../connectors/atlantimexConnector.js";
import { facturarTicketBahiaKino } from "../connectors/bahiaKinoConnector.js";
import { facturarTicketGrupoModelo } from "../connectors/grupoModeloConnector.js";
import { solicitarFacturaPorCorreo } from "../connectors/emailInvoiceConnector.js";
/**
 * Clasifica de forma inteligente cada ticket según su establecimiento,
 * URL de facturación, folio o texto detectado.
 */
export function clasificarProveedorTicket(item) {
    const t = item.ticket;
    const est = (t.establecimiento || "").toUpperCase();
    const suc = (t.sucursal || "").toUpperCase();
    const url = (t.urlPortalFacturacion || "").toLowerCase();
    const email = (t.emailFacturacion || "").toLowerCase();
    const raw = (item.rawText || "").toLowerCase();
    // 1. Red de Carreteras de Occidente (RCO / Red Vía Corta)
    if (url.includes("redviacorta") ||
        url.includes("rco.com") ||
        est.includes("RED VIA CORTA") ||
        est.includes("RCO") ||
        raw.includes("red de carreteras de occidente") ||
        raw.includes("redviacorta.mx") ||
        raw.includes("jalostotitlan") ||
        raw.includes("tepatitlan") ||
        raw.includes("arandas") ||
        (t.codigoFacturacion && t.codigoFacturacion.length >= 18 && !url.includes("lasvaras"))) {
        return { provider: "RCO" };
    }
    // 2. Concesionaria Guadalajara - Tepic (IDEAL)
    if (url.includes("gdl-tep") ||
        url.includes("ideal") ||
        est.includes("GUADALAJARA") && est.includes("TEPIC") ||
        suc.includes("ARENAL") ||
        suc.includes("BARRANCAS") ||
        suc.includes("SANTA CECILIA") ||
        suc.includes("CHAPALA") ||
        suc.includes("LA LAJA") ||
        raw.includes("facturaciongdl-tep") ||
        raw.includes("concesionaria de autopistas del pacifico") ||
        raw.includes("arenal") && raw.includes("carril")) {
        return { provider: "IDEAL" };
    }
    // 3. Autopista Las Varas - Puerto Vallarta
    if (url.includes("lasvaras") ||
        url.includes("faclasvaras") ||
        est.includes("LAS VARAS") ||
        suc.includes("LA PEÑITA") ||
        raw.includes("lasvaras-vallarta") ||
        raw.includes("faclasvaras-ptovallarta") ||
        raw.includes("la peñita") ||
        (t.codigoFacturacion && raw.includes("nru"))) {
        return { provider: "LAS_VARAS" };
    }
    // 4. Autopista Jala - Compostela (PeajeClic)
    if (url.includes("jalacompostela") ||
        url.includes("peajeclic") ||
        est.includes("JALA") ||
        raw.includes("jalacompostela.com") ||
        raw.includes("peajeclic")) {
        return { provider: "JALA_COMPOSTELA" };
    }
    // 5. Walmart México y Sam's Club (Nueva Walmart de México: Bodega Aurrera, Sam's Club, Walmart Express)
    if (url.includes("walmart") ||
        url.includes("sams") ||
        est.includes("WALMART") ||
        est.includes("BODEGA AURRERA") ||
        est.includes("SAMS") ||
        raw.includes("sam's") ||
        raw.includes("sams club") ||
        raw.includes("nueva walmart de mexico") ||
        raw.includes("facturacion.walmartmexico") ||
        raw.includes("facturacion-clientes.walmart")) {
        return { provider: "WALMART" };
    }
    // 5b. Comercializadora PepsiCo México (Sabritas / DSD Ruta / Sabritel / GEPP)
    if (est.includes("PEPSICO") ||
        est.includes("SABRITAS") ||
        est.includes("GAMESA") ||
        raw.includes("comercializadora pepsico") ||
        raw.includes("pepsico mexico") ||
        raw.includes("pepsico méxico") ||
        raw.includes("sabritel") ||
        raw.includes("cpm110719sg3") ||
        raw.includes("cpm1107198q3") ||
        raw.includes("facturagepp.com.mx")) {
        return { provider: "PEPSICO" };
    }
    // 5c. Propimex S. de R.L. de C.V. (Coca-Cola FEMSA México)
    if (url.includes("clienteskof") ||
        est.includes("PROPIMEX") ||
        est.includes("COCA-COLA") ||
        est.includes("COCA COLA") ||
        est.includes("FEMSA") && (raw.includes("kof") || raw.includes("refresco")) ||
        raw.includes("propimex") ||
        raw.includes("pro840423sg8") ||
        raw.includes("coca-cola femsa") ||
        raw.includes("linea.kof@kof.com.mx")) {
        return { provider: "PROPIMEX" };
    }
    // 5d. Mercado San Juan (MSJ Carnes y Abarrotes - León, Gto.)
    if (url.includes("mercadosanjuan") ||
        est.includes("MERCADO SAN JUAN") ||
        est.includes("SAN JUAN") && (raw.includes("carnes") || raw.includes("abarrotes")) ||
        raw.includes("mercado san juan") ||
        raw.includes("mercadosanjuan.com.mx") ||
        raw.includes("cca980312ra1") ||
        raw.includes("comercializadora de carnes y abarrotes san juan")) {
        return { provider: "MERCADO_SAN_JUAN" };
    }
    // 5e. Tiendas Bara (FEMSA Comercio)
    if (url.includes("bara.com.mx") ||
        est.includes("TIENDAS BARA") ||
        est.includes("BARA") ||
        raw.includes("tiendas bara") ||
        raw.includes("cadena comercial bara") ||
        raw.includes("ccb0007204m7")) {
        return { provider: "BARA" };
    }
    // 5f. Gas Noel (Grupo Noel - León, Gto.)
    if (url.includes("gasnoel") ||
        est.includes("GAS NOEL") ||
        est.includes("GRUPO NOEL") ||
        raw.includes("gas noel") ||
        raw.includes("gno670404n94") ||
        raw.includes("gasnoel.com.mx")) {
        return { provider: "GAS_NOEL" };
    }
    // 5g. Primera Plus / Grupo Flecha Amarilla (León, Gto.)
    if (url.includes("facturaelectronicagfa") ||
        url.includes("primeraplus") ||
        url.includes("flecha-amarilla") ||
        est.includes("PRIMERA PLUS") ||
        est.includes("FLECHA AMARILLA") ||
        est.includes("AUTOBUSES DE LA PIEDAD") ||
        raw.includes("primera plus") ||
        raw.includes("flecha amarilla") ||
        raw.includes("api6609273e0") ||
        raw.includes("cfdiboletoprimeraplus")) {
        return { provider: "FLECHA_AMARILLA" };
    }
    // 5h. Transportes Castores (Matriz León, Gto.)
    if (url.includes("castores.com.mx") ||
        est.includes("CASTORES") ||
        raw.includes("transportes castores") ||
        raw.includes("grupo castores") ||
        raw.includes("tan020524f53") ||
        raw.includes("talon") && raw.includes("flete")) {
        return { provider: "CASTORES" };
    }
    // 5i. Dulcerías y Abarroteras Vázquez (León, Gto.)
    if (url.includes("dulceriashvazquez") ||
        est.includes("DULCERIAS") && est.includes("VAZQUEZ") ||
        est.includes("DULCERIAS VAZQUEZ") ||
        raw.includes("dulcerias vazquez") ||
        raw.includes("dulcerias y abarroteras vazquez") ||
        raw.includes("dav9408226e6")) {
        return { provider: "DULCERIAS_VAZQUEZ" };
    }
    // 5j. Calzado Coqueta y Audaz (León, Gto.)
    if (url.includes("coquetayaudaz") ||
        est.includes("COQUETA") ||
        est.includes("AUDAZ") ||
        raw.includes("coqueta y audaz") ||
        raw.includes("coq8503158r8") ||
        raw.includes("calzado coqueta")) {
        return { provider: "COQUETA" };
    }
    // 5k. Cepesmar (Central de Pescados y Mariscos de León)
    if (url.includes("cepesmar") ||
        est.includes("CEPESMAR") ||
        est.includes("CENTRAL DE PESCADOS Y MARISCOS") ||
        raw.includes("cepesmar") ||
        raw.includes("cpm010215kl8") ||
        raw.includes("pescados y mariscos") && raw.includes("las cruces")) {
        return { provider: "CEPESMAR" };
    }
    // 5l. Grupo Atlantimex (León, Gto.)
    if (url.includes("atlantimex") ||
        est.includes("ATLANTIMEX") ||
        raw.includes("atlantimex") ||
        raw.includes("cat050614m91") ||
        raw.includes("pvabastos@atlantimex.com")) {
        return { provider: "ATLANTIMEX" };
    }
    // 5m. Mariscos Bahía Kino (Distribuidora Bahía Kino León)
    if (url.includes("mariscosbahiakino") ||
        est.includes("BAHIA KINO") ||
        est.includes("BAHÍA KINO") ||
        raw.includes("bahia kino") ||
        raw.includes("bahía kino") ||
        raw.includes("dbk1208153a9") ||
        raw.includes("distribuidora bahia kino")) {
        return { provider: "BAHIA_KINO" };
    }
    // 5n. Grupo Modelo / Corona México (Agencias y Modelorama León)
    if (url.includes("modelo.gmodelo") ||
        url.includes("grupomodelo") ||
        url.includes("modelorama") ||
        est.includes("GRUPO MODELO") ||
        est.includes("CERVECERIA MODELO") ||
        est.includes("MODELORAMA") ||
        est.includes("CORONA") && (raw.includes("cerveza") || raw.includes("modelo")) ||
        raw.includes("grupo modelo") ||
        raw.includes("cerveceria modelo") ||
        raw.includes("cmm080617bd2")) {
        return { provider: "GRUPO_MODELO" };
    }
    // 6. OXXO GAS (Servicios Gasolineros de México)
    if (url.includes("oxxogas") ||
        est.includes("OXXO GAS") ||
        raw.includes("oxxo gas") ||
        raw.includes("servicios gasolineros de mexico") ||
        raw.includes("servicios gasolineros de méxico")) {
        return { provider: "OXXO_GAS" };
    }
    // 7. Cadena Comercial OXXO (Tiendas)
    if (url.includes("oxxo.com") ||
        est.includes("OXXO") ||
        raw.includes("cadena comercial oxxo") ||
        raw.includes("tiendas oxxo") ||
        raw.includes("oxxo, s.a.")) {
        return { provider: "OXXO" };
    }
    // 8. Farmacias Guadalajara (Corporativo Fragua)
    if (url.includes("farmaciasguadalajara") ||
        (est.includes("FARMACIA") && est.includes("GUADALAJARA")) ||
        est.includes("FRAGUA") ||
        raw.includes("farmacias guadalajara") ||
        raw.includes("corporativo fragua")) {
        return { provider: "FARMACIAS_GDL" };
    }
    // 9. Costco Wholesale México
    if (url.includes("costco") ||
        est.includes("COSTCO") ||
        raw.includes("costco wholesale") ||
        raw.includes("costco mexico") ||
        raw.includes("costco méxico")) {
        return { provider: "COSTCO" };
    }
    // 10. G500 Network
    if (url.includes("g500") ||
        est.includes("G500") ||
        raw.includes("g500") ||
        raw.includes("g-500")) {
        return { provider: "G500" };
    }
    // 11. AutoZone de México
    if (url.includes("autozone") ||
        est.includes("AUTOZONE") ||
        est.includes("AUTO ZONE") ||
        raw.includes("autozone") ||
        raw.includes("auto zone") ||
        raw.includes("facturaelectronica@autozone.com")) {
        return { provider: "AUTOZONE" };
    }
    // 12. Supermercados H-E-B México (Muy fuerte en León, Gto.)
    if (url.includes("heb.com.mx") ||
        est.includes("H-E-B") ||
        est.includes("HEB ") ||
        est === "HEB" ||
        est.includes("SUPERMERCADOS INTERNACIONALES HEB") ||
        raw.includes("facturacion.heb.com.mx") ||
        raw.includes("supermercados internacionales heb")) {
        return { provider: "HEB" };
    }
    // 13. Tiendas Chedraui / Selecto Chedraui (León, Gto.)
    if (url.includes("chedraui") ||
        url.includes("masfacturaweb.com.mx/chedraui") ||
        est.includes("CHEDRAUI") ||
        raw.includes("tiendas chedraui") ||
        raw.includes("chedraui")) {
        return { provider: "CHEDRAUI" };
    }
    // 14. Organización Soriana y City Club (León, Gto.)
    if (url.includes("soriana") ||
        url.includes("cityclub") ||
        est.includes("SORIANA") ||
        est.includes("CITY CLUB") ||
        raw.includes("tiendas soriana") ||
        raw.includes("organizacion soriana") ||
        raw.includes("city club")) {
        return { provider: "SORIANA" };
    }
    // 15. Solicitudes por Correo Electrónico (El Amigo del Chef León, Gas Noel León, Grupo CIOSA, etc.)
    if (email ||
        raw.includes("facturacion@amigodelchef.com") ||
        raw.includes("facturac1on@amigodelchef.com") ||
        est.includes("AMIGO DEL CHEF") ||
        est.includes("PIZZA HUT")) {
        return {
            provider: "EMAIL_DIRECTO",
            emailDestino: email || "facturac1on@amigodelchef.com",
        };
    }
    if (raw.includes("servicioaclientes@ciosa.com") ||
        est.includes("CIOSA") ||
        raw.includes("grupo ciosa")) {
        return {
            provider: "EMAIL_DIRECTO",
            emailDestino: "servicioaclientes@ciosa.com",
        };
    }
    if (est.includes("GAS NOEL") ||
        raw.includes("gas noel") ||
        raw.includes("gasnoel.com")) {
        return {
            provider: "EMAIL_DIRECTO",
            emailDestino: "atencionaclientes@gasnoel.com.mx",
        };
    }
    return { provider: "GENERICO" };
}
/**
 * Agrupa una lista de tickets recibidos en lotes óptimos por proveedor
 */
export function agruparTickets(items) {
    const groupsMap = new Map();
    for (const item of items) {
        const { provider, emailDestino } = clasificarProveedorTicket(item);
        const groupKey = emailDestino ? `${provider}_${emailDestino}` : provider;
        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
                provider,
                emailDestino,
                items: [],
            });
        }
        groupsMap.get(groupKey).items.push(item);
    }
    return Array.from(groupsMap.values());
}
/**
 * Orquestador principal que ejecuta la facturación autónoma en paralelo para todos los grupos
 */
export async function procesarLoteCompletoAutonomo(items, perfil, onProgress) {
    const grupos = agruparTickets(items);
    const resultados = [];
    if (onProgress) {
        await onProgress(`📊 *Lote clasificado:* ${items.length} ticket(s) divididos en ${grupos.length} grupo(s) de facturación:\n` +
            grupos
                .map((g, i) => `• Grupo ${i + 1}: *${g.provider}* (${g.items.length} ticket(s))`)
                .join("\n"));
    }
    // Ejecutar los conectores de cada grupo
    for (const grupo of grupos) {
        try {
            let res;
            switch (grupo.provider) {
                case "RCO":
                    res = await facturarLoteRco({
                        tickets: grupo.items,
                        perfil,
                        onProgress,
                    });
                    break;
                case "IDEAL":
                    res = await facturarLoteIdeal({
                        tickets: grupo.items,
                        perfil,
                        onProgress,
                    });
                    break;
                case "LAS_VARAS":
                    res = await facturarLoteLasVaras({
                        tickets: grupo.items,
                        perfil,
                        onProgress,
                    });
                    break;
                case "JALA_COMPOSTELA":
                    res = await facturarLoteJalaCompostela({
                        tickets: grupo.items,
                        perfil,
                        onProgress,
                    });
                    break;
                case "WALMART":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketWalmart({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "PEPSICO":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketPepsico({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "PROPIMEX":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketPropimex({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "MERCADO_SAN_JUAN":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketMercadoSanJuan({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "BARA":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketBara({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "GAS_NOEL":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketGasNoel({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "FLECHA_AMARILLA":
                    for (const itm of grupo.items) {
                        const r = await facturarBoletoFlechaAmarilla({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "CASTORES":
                    for (const itm of grupo.items) {
                        const r = await facturarGuiaCastores({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "DULCERIAS_VAZQUEZ":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketDulceriasVazquez({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "COQUETA":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketCoqueta({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "CEPESMAR":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketCepesmar({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "ATLANTIMEX":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketAtlantimex({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "BAHIA_KINO":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketBahiaKino({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "GRUPO_MODELO":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketGrupoModelo({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "OXXO_GAS":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketOxxoGas({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "OXXO":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketOxxo({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "FARMACIAS_GDL":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketFarmaciasGuadalajara({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "COSTCO":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketCostco({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "G500":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketG500({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "AUTOZONE":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketAutoZone({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "HEB":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketHeb({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "CHEDRAUI":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketChedraui({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "SORIANA":
                    for (const itm of grupo.items) {
                        const r = await facturarTicketSoriana({
                            tickets: [itm],
                            perfil,
                            onProgress,
                        });
                        resultados.push(r);
                    }
                    continue;
                case "EMAIL_DIRECTO":
                    res = await solicitarFacturaPorCorreo({
                        tickets: grupo.items,
                        perfil,
                        onProgress,
                    }, grupo.emailDestino || "facturas@ejemplo.com");
                    break;
                default:
                    res = {
                        exito: false,
                        emisor: grupo.items[0]?.ticket.establecimiento || "Establecimiento desconocido",
                        total: grupo.items.reduce((s, t) => s + (Number(t.ticket.montoTotal) || 0), 0),
                        mensaje: `El comercio no cuenta con conector automático directo. Requiere portal web: ${grupo.items[0]?.ticket.urlPortalFacturacion || "No especificado"}`,
                        ticketIds: grupo.items.map((t) => t.id),
                    };
                    break;
            }
            resultados.push(res);
        }
        catch (e) {
            resultados.push({
                exito: false,
                emisor: grupo.provider,
                total: grupo.items.reduce((s, t) => s + (Number(t.ticket.montoTotal) || 0), 0),
                mensaje: `Error en conector ${grupo.provider}: ${e?.message || e}`,
                ticketIds: grupo.items.map((t) => t.id),
            });
        }
    }
    return resultados;
}
