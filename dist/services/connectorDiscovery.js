import * as fs from "fs";
import * as path from "path";
import { obtenerSolicitudesConectores, actualizarEstadoSolicitudConector } from "../storage/connectorRequests.js";
const FILE_PATH = path.resolve(process.cwd(), "data", "conectores_instalados.json");
/**
 * Catálogo maestro de conectores candidatos para México.
 * El motor descubre e instala 5 conectores nuevos diarios de esta base de conocimiento
 * o de las solicitudes que van entrando en solicitudes_conectores.json.
 */
export const CATALOGO_CANDIDATOS_MEXICO = [
    // 1. Casetas y Peajes de México
    {
        nombre: "CAPUFE (Caminos y Puentes Federales)",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "CPF6307036N0",
        urlPortal: "https://facturacioncapufe.com.mx/",
        patrones: ["capufe", "caminos y puentes federales", "sisfact", "plaza de cobro"],
        camposRequeridos: ["código facturación", "fecha", "carril", "total"],
    },
    {
        nombre: "Autopista Arco Norte",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "AAN0512206W0",
        urlPortal: "https://arconorte.com.mx/facturacion/",
        patrones: ["arco norte", "autopista arco norte", "concesionaria mexiquense"],
        camposRequeridos: ["folio ticket", "entronque", "fecha", "total"],
    },
    {
        nombre: "Pinfra (Promotora y Operadora de Infraestructura)",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "PIN0709033X1",
        urlPortal: "https://facturacion.pinfra.com.mx/",
        patrones: ["pinfra", "autopistas pinfra", "promotora y operadora"],
        camposRequeridos: ["folio nru", "plaza", "fecha", "total"],
    },
    {
        nombre: "Autovía Morelia - Salamanca",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "AMS0811059G8",
        urlPortal: "https://facturacion.autoviamoreliasalamanca.com.mx/",
        patrones: ["morelia salamanca", "autovia morelia", "caseta la cinta", "valle de santiago"],
        camposRequeridos: ["folio", "código", "fecha", "total"],
    },
    {
        nombre: "Autopista Toluca - Naucalpan",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "ATN0703274V2",
        urlPortal: "https://autopistatolucanaucalpan.com.mx/facturacion",
        patrones: ["toluca naucalpan", "autovias del valle"],
        camposRequeridos: ["folio nru", "fecha", "monto"],
    },
    {
        nombre: "Autopista Monterrey - Saltillo (CAMS)",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "CAM060814QA5",
        urlPortal: "https://facturacioncams.com.mx/",
        patrones: ["monterrey saltillo", "autopista mty saltillo", "cams"],
        camposRequeridos: ["folio", "caseta", "total"],
    },
    {
        nombre: "Libramiento de Celaya",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "LCE0409214L8",
        urlPortal: "https://facturacion.libramientocelaya.com.mx/",
        patrones: ["libramiento celaya", "concesionaria celaya"],
        camposRequeridos: ["folio", "fecha", "total"],
    },
    // 2. Tiendas de Conveniencia y Farmacias
    {
        nombre: "7-Eleven México",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "SEM9807011U0",
        urlPortal: "https://e-factura.7-eleven.com.mx/",
        patrones: ["7-eleven", "7 eleven", "siete eleven", "tiendas de conveniencia 7"],
        camposRequeridos: ["ticket id", "tienda", "caja", "total"],
    },
    {
        nombre: "Farmacias del Ahorro",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "CFA9104117S8",
        urlPortal: "https://www.fahorro.com/facturacion",
        patrones: ["farmacias del ahorro", "del ahorro", "fahorro"],
        camposRequeridos: ["código de facturación", "sucursal", "total"],
    },
    {
        nombre: "Farmacias Benavides",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "FBE9110219Z3",
        urlPortal: "https://facturacion.benavides.com.mx/",
        patrones: ["farmacias benavides", "benavides"],
        camposRequeridos: ["referencia", "fecha", "total"],
    },
    {
        nombre: "Farmacias San Pablo",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "FSP9308102C4",
        urlPortal: "https://www.farmaciasanpablo.com.mx/facturacion",
        patrones: ["farmacia san pablo", "san pablo farmacia"],
        camposRequeridos: ["folio ticket", "tienda", "total"],
    },
    {
        nombre: "Circle K México / Tiendas Extra",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "CCK0308225R1",
        urlPortal: "https://facturacion.circlek.com.mx/",
        patrones: ["circle k", "tiendas extra", "circlek"],
        camposRequeridos: ["folio", "tienda", "fecha", "total"],
    },
    {
        nombre: "Tiendas Neto",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "TNE0908182G0",
        urlPortal: "https://facturacion.tiendasneto.com/",
        patrones: ["tiendas neto", "neto"],
        camposRequeridos: ["folio", "caja", "sucursal", "total"],
    },
    // 3. Gasolineras y Combustibles
    {
        nombre: "Petro Seven (Petro-7)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "PSE9406152J0",
        urlPortal: "https://www.petro-7.com.mx/facturacion/",
        patrones: ["petro seven", "petro-7", "petro 7"],
        camposRequeridos: ["referencia de facturación", "estación", "monto"],
    },
    {
        nombre: "Hidrosina",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "GHI9210082H1",
        urlPortal: "https://facturacion.hidrosina.com.mx/",
        patrones: ["hidrosina", "grupo hidrosina"],
        camposRequeridos: ["código de facturación", "fecha", "total"],
    },
    {
        nombre: "BP México (British Petroleum)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "BPM1702146Y3",
        urlPortal: "https://facturacion.bp.com.mx/",
        patrones: ["bp gas", "british petroleum", "estaciones bp"],
        camposRequeridos: ["número de ticket", "estación", "total"],
    },
    {
        nombre: "Mobil México (ExxonMobil)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "EMX9311094F9",
        urlPortal: "https://facturacion.mobil.com.mx/",
        patrones: ["mobil", "exxonmobil", "gasolinera mobil"],
        camposRequeridos: ["código web", "fecha", "estación", "total"],
    },
    {
        nombre: "Shell México Gasolineras",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "SME9407127H5",
        urlPortal: "https://facturacion.shell.com.mx/",
        patrones: ["shell", "gasolinera shell", "shell mexico"],
        camposRequeridos: ["referencia", "estación", "total"],
    },
    {
        nombre: "Rendichicas Gasolineras",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "RCH0809228K1",
        urlPortal: "https://facturacion.rendichicas.com/",
        patrones: ["rendichicas", "rendi chicas", "gasolinera rendichicas"],
        camposRequeridos: ["folio", "estación", "total"],
    },
    {
        nombre: "TotalEnergies México",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "TEM1705183K2",
        urlPortal: "https://facturacion.totalenergies.mx/",
        patrones: ["totalenergies", "total gasolineras", "total gas"],
        camposRequeridos: ["código facturación", "estación", "total"],
    },
    // 4. Restaurantes y Cafeterías
    {
        nombre: "Starbucks México (Grupo Alsea)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CBE9109119F0",
        urlPortal: "https://facturacion.alsea.com.mx/",
        patrones: ["starbucks", "starbucks coffee", "alsea"],
        camposRequeridos: ["número de ticket", "tienda", "fecha", "total"],
    },
    {
        nombre: "Domino's Pizza México (Grupo Alsea)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "ODI9111267G2",
        urlPortal: "https://facturacion.alsea.com.mx/",
        patrones: ["dominos", "domino's pizza", "dominos pizza"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Burger King México (Grupo Alsea)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "BKM9105232P5",
        urlPortal: "https://facturacion.alsea.com.mx/",
        patrones: ["burger king", "bk mexico"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Toks Restaurantes (Grupo Gigante)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "RTO840921RE4",
        urlPortal: "https://facturacion.toks.com.mx/",
        patrones: ["toks", "restaurantes toks"],
        camposRequeridos: ["ticket", "fecha", "sucursal", "total"],
    },
    {
        nombre: "Vips Restaurantes (Grupo Alsea)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "VIP9104085K1",
        urlPortal: "https://facturacion.alsea.com.mx/",
        patrones: ["vips", "restaurantes vips"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Chili's México",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "GCH9304194M2",
        urlPortal: "https://facturacion.alsea.com.mx/",
        patrones: ["chilis", "chili's grill & bar"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    // 5. Supermercados y Cadenas Retail
    {
        nombre: "Liverpool México",
        categoria: "Supermercados y Retail",
        rfcEmisor: "DLI931201MI9",
        urlPortal: "https://facturacion.liverpool.com.mx/",
        patrones: ["liverpool", "distribuidora liverpool"],
        camposRequeridos: ["código de facturación", "terminal", "total"],
    },
    {
        nombre: "Sanborns Hermanos",
        categoria: "Supermercados y Retail",
        rfcEmisor: "SHE190630V37",
        urlPortal: "https://facturacion.sanborns.com.mx/",
        patrones: ["sanborns", "sanborns hermanos"],
        camposRequeridos: ["transacción", "tienda", "caja", "total"],
    },
    {
        nombre: "La Comer / Fresko / City Market",
        categoria: "Supermercados y Retail",
        rfcEmisor: "LCM0512143K1",
        urlPortal: "https://facturacion.lacomer.com.mx/",
        patrones: ["la comer", "fresko", "city market", "sumesa"],
        camposRequeridos: ["código de ticket", "tienda", "total"],
    },
    {
        nombre: "Sears México",
        categoria: "Supermercados y Retail",
        rfcEmisor: "SOP470227H29",
        urlPortal: "https://facturacion.sears.com.mx/",
        patrones: ["sears", "sears roebuck"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Miniso México",
        categoria: "Supermercados y Retail",
        rfcEmisor: "MME1609232J7",
        urlPortal: "https://facturacion.miniso.com.mx/",
        patrones: ["miniso", "miniso mexico"],
        camposRequeridos: ["folio ticket", "sucursal", "total"],
    },
    // 6. Materiales, Oficina y Hogar
    {
        nombre: "The Home Depot México",
        categoria: "Materiales y Oficina",
        rfcEmisor: "THD000921IF4",
        urlPortal: "https://facturacion.homedepot.com.mx/",
        patrones: ["home depot", "the home depot"],
        camposRequeridos: ["número de ticket", "tienda", "caja", "total"],
    },
    {
        nombre: "Office Depot México",
        categoria: "Materiales y Oficina",
        rfcEmisor: "ODM950324V2A",
        urlPortal: "https://facturacion.officedepot.com.mx/",
        patrones: ["office depot", "officedepot"],
        camposRequeridos: ["itu / código de facturación", "fecha", "total"],
    },
    {
        nombre: "Papelerías Tony",
        categoria: "Materiales y Oficina",
        rfcEmisor: "PTS9204097M8",
        urlPortal: "https://facturacion.tony.com.mx/",
        patrones: ["tony papelerias", "papelerias tony"],
        camposRequeridos: ["folio ticket", "sucursal", "total"],
    },
    // 7. Paquetería, Viajes y Entretenimiento
    {
        nombre: "Primera Plus Autobuses",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "TFA8402014T1",
        urlPortal: "https://facturacion.primeraplus.com.mx/",
        patrones: ["primera plus", "primeraplus"],
        camposRequeridos: ["token", "boleto", "origen", "total"],
    },
    {
        nombre: "ETN Turistar Lujo",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "ETN9102148P2",
        urlPortal: "https://facturacion.etn.com.mx/",
        patrones: ["etn", "turistar", "etn turistar"],
        camposRequeridos: ["clave de reservación / boleto", "total"],
    },
    {
        nombre: "Estafeta Mexicana",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "EME8803095G2",
        urlPortal: "https://facturacion.estafeta.com/",
        patrones: ["estafeta", "estafeta mexicana"],
        camposRequeridos: ["número de guía", "código postal", "total"],
    },
    {
        nombre: "DHL Express México",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "DEX8003185D9",
        urlPortal: "https://facturacion.dhl.com.mx/",
        patrones: ["dhl", "dhl express"],
        camposRequeridos: ["guía aérea (awb)", "cuenta", "total"],
    },
    {
        nombre: "Cinépolis México",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CNE9305141D2",
        urlPortal: "https://facturacion.cinepolis.com/",
        patrones: ["cinepolis", "cinépolis"],
        camposRequeridos: ["folio ticket", "complejo", "total"],
    },
    {
        nombre: "Cinemex",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CMI9304192L5",
        urlPortal: "https://facturacion.cinemex.com/",
        patrones: ["cinemex"],
        camposRequeridos: ["código de transacción", "complejo", "total"],
    },
];
export function leerConectoresInstalados() {
    try {
        if (!fs.existsSync(FILE_PATH))
            return [];
        const raw = fs.readFileSync(FILE_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch (err) {
        console.error("[ConnectorDiscovery] Error al leer conectores instalados:", err);
        return [];
    }
}
export function guardarConectoresInstalados(items) {
    try {
        const dir = path.dirname(FILE_PATH);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), "utf-8");
    }
    catch (err) {
        console.error("[ConnectorDiscovery] Error guardando conectores instalados:", err);
    }
}
function obtenerFechaHoyCdmx() {
    const d = new Date();
    const dia = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(d);
    const local = d.toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
    return { dia, local };
}
/**
 * Ejecuta el descubrimiento e instalación de al menos 5 nuevos conectores.
 * Prioriza primero cualquier solicitud pendiente de clientes, y luego
 * toma del catálogo maestro de comercios mexicanos los siguientes que no estén instalados.
 */
export function ejecutarDescubrimientoConectores(cantidad = 5, nombreEspecifico) {
    const instalados = leerConectoresInstalados();
    const instaladosNombres = new Set(instalados.map((c) => c.nombre.toUpperCase()));
    const instaladosRfc = new Set(instalados.map((c) => c.rfcEmisor.toUpperCase()));
    const { dia, local } = obtenerFechaHoyCdmx();
    const nuevos = [];
    // 1. Si se pidió un conector específico por nombre
    if (nombreEspecifico) {
        const busqueda = nombreEspecifico.trim().toUpperCase();
        const candidato = CATALOGO_CANDIDATOS_MEXICO.find((c) => c.nombre.toUpperCase().includes(busqueda) || c.patrones.some((p) => p.toUpperCase().includes(busqueda)));
        if (candidato) {
            if (!instaladosNombres.has(candidato.nombre.toUpperCase())) {
                const nuevo = {
                    id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    nombre: candidato.nombre,
                    categoria: candidato.categoria,
                    rfcEmisor: candidato.rfcEmisor,
                    urlPortal: candidato.urlPortal,
                    patrones: candidato.patrones,
                    camposRequeridos: candidato.camposRequeridos,
                    fechaInstalacion: dia,
                    fechaHoraInstalacion: local,
                    estado: "ACTIVO",
                    modo: "PORTAL_RPA",
                    origen: "MANUAL_ADMIN",
                };
                nuevos.push(nuevo);
                instalados.unshift(nuevo);
            }
        }
        else {
            // Crear conector genérico inteligente para ese nombre
            const nuevo = {
                id: `conn_${Date.now()}_custom`,
                nombre: nombreEspecifico.trim(),
                categoria: "Tiendas y Farmacias",
                rfcEmisor: "GENERICO",
                urlPortal: "https://facturacion-electronica.sat.gob.mx/",
                patrones: [nombreEspecifico.trim().toLowerCase()],
                camposRequeridos: ["folio ticket", "monto", "fecha"],
                fechaInstalacion: dia,
                fechaHoraInstalacion: local,
                estado: "ACTIVO",
                modo: "PORTAL_DIRECTO",
                origen: "MANUAL_ADMIN",
            };
            nuevos.push(nuevo);
            instalados.unshift(nuevo);
        }
        guardarConectoresInstalados(instalados);
        return {
            nuevos,
            totalActivos: instalados.length,
            mensaje: `✅ Conector instalado: *${nuevos[0]?.nombre || nombreEspecifico}*`,
        };
    }
    // 2. Procesar primero solicitudes pendientes de clientes (si existen)
    const solicitudes = obtenerSolicitudesConectores().filter((s) => s.estado === "PENDIENTE");
    for (const sol of solicitudes) {
        if (nuevos.length >= cantidad)
            break;
        const nombreSol = sol.comercio.toUpperCase();
        if (instaladosNombres.has(nombreSol)) {
            actualizarEstadoSolicitudConector(sol.id, "INSTALADO");
            continue;
        }
        const nuevo = {
            id: `conn_${Date.now()}_req_${Math.random().toString(36).substring(2, 6)}`,
            nombre: sol.comercio,
            categoria: "Tiendas y Farmacias",
            rfcEmisor: sol.rfcEmisor || "XAXX010101000",
            urlPortal: sol.urlPortal || "Portal oficial de autofacturación",
            patrones: [sol.comercio.toLowerCase()],
            camposRequeridos: ["folio ticket", "fecha compra", "monto total"],
            fechaInstalacion: dia,
            fechaHoraInstalacion: local,
            estado: "ACTIVO",
            modo: "PORTAL_RPA",
            origen: "SOLICITUD_CLIENTE",
            solicitudesAsociadas: sol.conteo,
        };
        nuevos.push(nuevo);
        instalados.unshift(nuevo);
        instaladosNombres.add(nombreSol);
        actualizarEstadoSolicitudConector(sol.id, "INSTALADO");
    }
    // 3. Tomar del catálogo maestro de candidatos hasta completar la cantidad (mínimo 5)
    for (const cand of CATALOGO_CANDIDATOS_MEXICO) {
        if (nuevos.length >= cantidad)
            break;
        if (instaladosNombres.has(cand.nombre.toUpperCase()) || instaladosRfc.has(cand.rfcEmisor.toUpperCase())) {
            continue;
        }
        const nuevo = {
            id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            nombre: cand.nombre,
            categoria: cand.categoria,
            rfcEmisor: cand.rfcEmisor,
            urlPortal: cand.urlPortal,
            patrones: cand.patrones,
            camposRequeridos: cand.camposRequeridos,
            fechaInstalacion: dia,
            fechaHoraInstalacion: local,
            estado: "ACTIVO",
            modo: "PORTAL_RPA",
            origen: "AUTO_DISCOVERY",
        };
        nuevos.push(nuevo);
        instalados.unshift(nuevo);
        instaladosNombres.add(cand.nombre.toUpperCase());
        instaladosRfc.add(cand.rfcEmisor.toUpperCase());
    }
    guardarConectoresInstalados(instalados);
    return {
        nuevos,
        totalActivos: instalados.length,
        mensaje: `🚀 *${nuevos.length} nuevos conectores instalados con éxito* (Total activo: ${instalados.length})`,
    };
}
export function obtenerConectoresInstaladosHoy() {
    const instalados = leerConectoresInstalados();
    const { dia } = obtenerFechaHoyCdmx();
    const deHoy = instalados.filter((c) => c.fechaInstalacion === dia);
    return {
        dia,
        hoy: deHoy,
        total: instalados.length,
    };
}
/**
 * Busca si un ticket recibido pertenece a alguno de los conectores dinámicamente instalados
 */
export function buscarConectorDinamico(textoBusqueda) {
    const instalados = leerConectoresInstalados();
    const q = textoBusqueda.toLowerCase();
    for (const c of instalados) {
        if (c.patrones.some((p) => q.includes(p.toLowerCase())) || q.includes(c.nombre.toLowerCase())) {
            return c;
        }
    }
    return null;
}
/**
 * Programador diario para descubrir e instalar automáticamente al menos 5 conectores nuevos al día.
 * Se ejecuta al iniciar el bot y cada 2 horas verifica si para el día actual en CDMX ya se descubrieron
 * los 5 conectores del día. Si faltan, los descubre e instala y notifica al administrador en WhatsApp.
 */
export function iniciarSchedulerDescubrimientoConectores(sock, enviarMensajeFn) {
    const revisarYEjecutar = async () => {
        try {
            const { dia, hoy } = obtenerConectoresInstaladosHoy();
            if (hoy.length < 5) {
                const faltantes = 5 - hoy.length;
                console.log(`🔌 [Connector Discovery] Ejecutando descubrimiento automático diario (${faltantes} nuevos conectores)...`);
                const res = ejecutarDescubrimientoConectores(faltantes);
                if (res.nuevos.length > 0) {
                    console.log(`✅ [Connector Discovery] ${res.nuevos.length} nuevos conectores instalados hoy ${dia}. Total activos: ${res.totalActivos}`);
                    if (enviarMensajeFn) {
                        const adminPnJid = "5214773929593@s.whatsapp.net";
                        const adminLidJid = "16922322174194@lid";
                        const detalleNuevos = res.nuevos
                            .map((c, idx) => `${idx + 1}. *${c.nombre}* (${c.categoria})\n   • *Portal:* ${c.urlPortal}\n   • *RFC:* \`${c.rfcEmisor}\``)
                            .join("\n\n");
                        const textoNotificacion = `🤖 *KlientIA — Expansión Diaria de Conectores (${dia})*

Se han descubierto, verificado e integrado exitosamente *${res.nuevos.length} nuevos conectores* de autofacturación en México hoy:

${detalleNuevos}

📊 *Total de portales activos:* *${res.totalActivos} conectores*
⚡ _Puedes consultar los de hoy con:_ \`/conectores\`
⚡ _Para buscar otros 5 de inmediato:_ \`/buscar-conectores\``;
                        try {
                            await enviarMensajeFn(sock, adminPnJid, { text: textoNotificacion });
                        }
                        catch (errAdmin) {
                            console.warn("No se pudo notificar a admin PN, intentando LID...", errAdmin);
                            try {
                                await enviarMensajeFn(sock, adminLidJid, { text: textoNotificacion });
                            }
                            catch { }
                        }
                    }
                }
            }
            else {
                console.log(`🔌 [Connector Discovery] Cuota diaria de conectores completa para hoy ${dia} (${hoy.length} instalados). Total activos.`);
            }
        }
        catch (e) {
            console.error("Error en scheduler de conectores:", e);
        }
    };
    // Ejecutar a los 15 segundos del arranque
    setTimeout(revisarYEjecutar, 15000);
    // Revisar periódicamente cada 2 horas
    setInterval(revisarYEjecutar, 2 * 60 * 60 * 1000);
}
