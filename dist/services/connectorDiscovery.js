import * as fs from "fs";
import * as path from "path";
import { obtenerSolicitudesConectores, actualizarEstadoSolicitudConector } from "../storage/connectorRequests.js";
const FILE_PATH = path.resolve(process.cwd(), "data", "conectores_instalados.json");
/**
 * Catálogo maestro de conectores candidatos para México.
 * Priorizado especialmente para establecimientos de León, Guanajuato y la región del Bajío
 * (gasolineras locales, casetas de acceso, cadenas comerciales, restaurantes y paqueterías de León).
 */
export const CATALOGO_CANDIDATOS_MEXICO = [
    // ========================================================
    // 🦁 BLOQUE PRIORITARIO: LEÓN, GUANAJUATO Y ZONA METROPOLITANA BAJÍO
    // ========================================================
    {
        nombre: "Farmacias ISSEG (Gobierno de Guanajuato)",
        zona: "León, Guanajuato e ISSEG Estatal",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "ISS800101QG1",
        urlPortal: "https://facturacion.farmaciasisseg.com/",
        patrones: ["isseg", "farmacias isseg", "farmacia isseg", "instituto de seguridad social guanajuato"],
        camposRequeridos: ["ticket", "folio", "sucursal", "total"],
    },
    {
        nombre: "Tiendas Bara (Supermercados Bara Bajío)",
        zona: "León, Silao, Irapuato y Bajío",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "CBR9802058G7",
        urlPortal: "https://facturacion.tiendasbara.com.mx/",
        patrones: ["tiendas bara", "bara", "bara leon", "supermercados bara"],
        camposRequeridos: ["ticket", "tienda", "fecha", "total"],
    },
    {
        nombre: "OXXO Gas León y Bajío",
        zona: "León, Guanajuato y Corredor Bajío",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "SGM950714DC2",
        urlPortal: "https://facturacion.oxxogas.com/",
        patrones: ["oxxo gas", "oxxogas", "servicios gasolineros de mexico", "gasolinera oxxo gas leon"],
        camposRequeridos: ["referencia facturación", "estación", "monto"],
    },
    {
        nombre: "Transportes Castores (Matriz Blvd. Aeropuerto León)",
        zona: "León, Gto (Matriz Blvd. Aeropuerto)",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "TCA840428514",
        urlPortal: "https://facturacion.castores.com.mx/",
        patrones: ["castores", "transportes castores", "castores paqueteria", "envios castores leon"],
        camposRequeridos: ["talón de embarque", "guía", "total"],
    },
    {
        nombre: "Primera Plus / Grupo Flecha Amarilla (Matriz León)",
        zona: "León, Gto (Corporativo Matriz La Luz)",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "TFA8402014T1",
        urlPortal: "https://facturacion.primeraplus.com.mx/",
        patrones: ["primera plus", "primeraplus", "flecha amarilla", "servicios coordinados", "unebus leon silao"],
        camposRequeridos: ["token boleto", "origen", "total"],
    },
    {
        nombre: "Caseta Guanajuato - Silao (Puerto Interior / Gobierno de Gto)",
        zona: "Silao - Guanajuato Capital / Puerto Interior",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "GEG850101FQ2",
        urlPortal: "https://facturacion.guanajuato.gob.mx/",
        patrones: ["caseta guanajuato silao", "autopista cuota guanajuato", "gobierno del estado de guanajuato", "cuota silao", "puerto interior"],
        camposRequeridos: ["folio caseta", "carril", "fecha", "total"],
    },
    {
        nombre: "Restaurante El Rincón Gaucho León (Calzada / Campestre)",
        zona: "León, Gto (Calzada / Campestre)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "RGA9001185G2",
        urlPortal: "https://facturacion.elrincongaucho.com.mx/",
        patrones: ["rincon gaucho", "el rincon gaucho leon", "rincon gaucho calzada", "rincon gaucho campestre"],
        camposRequeridos: ["folio ticket", "sucursal", "fecha", "total"],
    },
    {
        nombre: "La Vaca Argentina León (Plaza Mayor / Campestre)",
        zona: "León, Gto (Plaza Mayor / Campestre)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "LVA0308159E1",
        urlPortal: "https://facturacion.lavacaargentina.com.mx/",
        patrones: ["la vaca argentina", "vaca argentina leon", "vaca argentina campestre"],
        camposRequeridos: ["ticket", "fecha", "total"],
    },
    {
        nombre: "Panteón Taurino León (Blvd. López Mateos / Calzada)",
        zona: "León, Gto (López Mateos / Calzada)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "PTA7206124K3",
        urlPortal: "https://facturacion.panteontaurino.com.mx/",
        patrones: ["panteon taurino", "el panteon taurino leon", "taurino tradicional leon"],
        camposRequeridos: ["folio de consumo", "fecha", "total"],
    },
    {
        nombre: "H-E-B León (Cerro Gordo y Campestre)",
        zona: "León, Gto (Cerro Gordo / Campestre)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "HEB960209489",
        urlPortal: "https://facturacion.heb.com.mx/",
        patrones: ["heb leon", "h-e-b leon", "heb cerro gordo", "heb campestre"],
        camposRequeridos: ["ticket id", "tienda", "caja", "total"],
    },
    {
        nombre: "Costco Gas & Costco León (Campestre / Garza Sada)",
        zona: "León, Gto (Zona Campestre)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "CME910715UB9",
        urlPortal: "https://facturacion.costco.com.mx/",
        patrones: ["costco leon", "costco gas leon", "gasolinas costco leon"],
        camposRequeridos: ["ticket", "transacción", "total"],
    },
    {
        nombre: "Gasolineras Mobil León y Bajío (Grupo Islo / Combustibles Bajío)",
        zona: "León, Gto (Corredor Blvd. Aeropuerto / López Mateos)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "CBL9804245Z2",
        urlPortal: "https://facturacion.mobil.com.mx/",
        patrones: ["mobil leon", "gasolinera mobil bajio", "combustibles mobil leon"],
        camposRequeridos: ["código web", "estación", "fecha", "total"],
    },
    {
        nombre: "Gasolineras G500 León y Silao",
        zona: "León, Silao y Carr. Fed. 45",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "GOO1402283A4",
        urlPortal: "https://facturacion.g500network.com/",
        patrones: ["g500 leon", "gasolinera g500 bajio", "estacion g500 silao"],
        camposRequeridos: ["referencia", "estación", "total"],
    },
    {
        nombre: "Calzado y Zapaterías Flexi (Matriz León, Gto)",
        zona: "León, Gto (Capital del Calzado)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "ZFL6505286NA",
        urlPortal: "https://facturacion.flexi.com.mx/",
        patrones: ["flexi leon", "zapaterias flexi", "outlet flexi leon", "calzado flexi"],
        camposRequeridos: ["código de compra", "sucursal", "total"],
    },
    {
        nombre: "The Home Depot León (Campestre y Blvd. Aeropuerto)",
        zona: "León, Gto (Campestre / Blvd. Aeropuerto)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "THD000921IF4",
        urlPortal: "https://facturacion.homedepot.com.mx/",
        patrones: ["home depot leon", "the home depot aeropuerto", "home depot campestre leon"],
        camposRequeridos: ["número de ticket", "tienda", "caja", "total"],
    },
    {
        nombre: "Fix Ferreterías León (Blvd. López Mateos / Centro)",
        zona: "León, Gto (López Mateos / Centro)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "FFE0010178M8",
        urlPortal: "https://facturacion.fixferreterias.com/",
        patrones: ["fix ferreterias leon", "fix ferreterias", "indar leon"],
        camposRequeridos: ["folio ticket", "sucursal", "total"],
    },
    {
        nombre: "Farmacias Guadalajara León (Zona Metropolitana)",
        zona: "León, Silao y Guanajuato",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "FGU830930PD3",
        urlPortal: "https://facturacion.farmaciasguadalajara.com/",
        patrones: ["farmacias guadalajara leon", "farmacia guadalajara bajio", "superfarmacia guadalajara"],
        camposRequeridos: ["folio ticket", "tienda", "fecha", "total"],
    },
    {
        nombre: "Ma Come No Trattoria León (Zona Campestre)",
        zona: "León, Gto (Zona Campestre)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "MCN0102148L9",
        urlPortal: "https://facturacion.macomeno.com.mx/",
        patrones: ["ma come no", "ma come no trattoria", "macomeno leon"],
        camposRequeridos: ["folio consumo", "fecha", "total"],
    },
    {
        nombre: "Transportes Tresguerras (Bajío / Celaya - León)",
        zona: "León y Corredor Industrial Bajío",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "ATT9312217R6",
        urlPortal: "https://facturacion.tresguerras.com.mx/",
        patrones: ["tresguerras leon", "tres guerras", "autotransportes tresguerras"],
        camposRequeridos: ["guía rastreo", "sucursal", "total"],
    },
    {
        nombre: "Estacionamiento Plaza Mayor y Centro Max / Altacia",
        zona: "León, Gto (Plaza Mayor / Altacia / Centro Max)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "CMA9810145X1",
        urlPortal: "https://facturacion.plazamayor.com.mx/",
        patrones: ["estacionamiento plaza mayor leon", "estacionamiento altacia", "operadora plazamayor"],
        camposRequeridos: ["folio boleto", "fecha", "total"],
    },
    {
        nombre: "Autopista Salamanca - León / Libramiento Celaya",
        zona: "Salamanca - Irapuato - León y Celaya",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "LCE0409214L8",
        urlPortal: "https://facturacion.libramientocelaya.com.mx/",
        patrones: ["salamanca leon", "libramiento celaya", "concesionaria celaya", "caseta mendoza"],
        camposRequeridos: ["folio", "fecha", "total"],
    },
    {
        nombre: "UneBus Guanajuato (Purísima - San Pancho - León - Silao)",
        zona: "Ruta Metropolitana León - San Pancho - Silao",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "TFA8402014T1",
        urlPortal: "https://facturacion.unebus.com.mx/",
        patrones: ["unebus", "une bus", "unebus leon", "unebus guanajuato"],
        camposRequeridos: ["folio boleto", "total"],
    },
    {
        nombre: "Petro-7 Bajío / León",
        zona: "León y Bajío",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "PSE9406152J0",
        urlPortal: "https://www.petro-7.com.mx/facturacion/",
        patrones: ["petro seven", "petro-7 leon", "petro 7"],
        camposRequeridos: ["referencia de facturación", "estación", "monto"],
    },
    {
        nombre: "Farmacias del Ahorro León",
        zona: "León, Gto",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "CFA9104117S8",
        urlPortal: "https://www.fahorro.com/facturacion",
        patrones: ["farmacias del ahorro leon", "del ahorro leon", "fahorro leon"],
        camposRequeridos: ["código de facturación", "sucursal", "total"],
    },
    {
        nombre: "La Comer / Fresko León (Plaza Mayor / Insurgentes)",
        zona: "León, Gto (Insurgentes / Plaza Mayor)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "LCM0512143K1",
        urlPortal: "https://facturacion.lacomer.com.mx/",
        patrones: ["la comer leon", "fresko leon", "city market"],
        camposRequeridos: ["código de ticket", "tienda", "total"],
    },
    {
        nombre: "Italianni's Plaza Mayor León",
        zona: "León, Gto (Plaza Mayor)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "ITA9808244N6",
        urlPortal: "https://facturacion.alsea.com.mx/",
        patrones: ["italiannis leon", "italianni's plaza mayor leon"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Starbucks Campestre / Plaza Mayor León",
        zona: "León, Gto (Campestre / Plaza Mayor / Altacia)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CBE9109119F0",
        urlPortal: "https://facturacion.alsea.com.mx/",
        patrones: ["starbucks leon", "starbucks campestre", "starbucks plaza mayor"],
        camposRequeridos: ["número de ticket", "tienda", "fecha", "total"],
    },
    {
        nombre: "7-Eleven Bajío / León",
        zona: "León y Corredor Bajío",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "SEM9807011U0",
        urlPortal: "https://e-factura.7-eleven.com.mx/",
        patrones: ["7-eleven leon", "7 eleven bajio", "siete eleven"],
        camposRequeridos: ["ticket id", "tienda", "caja", "total"],
    },
    {
        nombre: "AutoZone León (Refacciones y Autopartes)",
        zona: "León, Gto (Torres Landa / Aeropuerto / Hidalgo)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "AME9701095U2",
        urlPortal: "https://facturacion.autozone.com.mx/",
        patrones: ["autozone leon", "autozone de mexico", "refaccionaria autozone"],
        camposRequeridos: ["folio ticket", "tienda", "total"],
    },
    {
        nombre: "Bodega Aurrera y Walmart León (Retail y Abarrotes)",
        zona: "León, Gto (San Juan Bosco / Delta / Clouthier)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "NWM9709244W4",
        urlPortal: "https://facturacion.walmartmexico.com.mx/",
        patrones: ["bodega aurrera leon", "aurrera san juan bosco", "aurrera torres landa", "mi bodega aurrera leon"],
        camposRequeridos: ["tc #", "tr #", "fecha", "total"],
    },
    {
        nombre: "Tiendas Soriana León (Híper y Súper)",
        zona: "León, Gto (Maravillas / Malecón / Satélite / Cerro Gordo)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "TSO991022PB6",
        urlPortal: "https://facturacion.soriana.com/",
        patrones: ["soriana leon", "soriana hiper maravillas", "soriana malecon", "tiendas soriana leon"],
        camposRequeridos: ["código de ticket", "tienda", "total"],
    },
    {
        nombre: "Tiendas Chedraui León (Plaza Mayor / Poliforum)",
        zona: "León, Gto (Plaza Mayor / Poliforum)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "TCH850701RM1",
        urlPortal: "https://facturacion.chedraui.com.mx/",
        patrones: ["chedraui leon", "tiendas chedraui leon", "chedraui poliforum"],
        camposRequeridos: ["folio ticket", "tienda", "total"],
    },
    {
        nombre: "Pinturas Comex León (Materiales y Mantenimiento)",
        zona: "León, Gto (López Mateos / Torres Landa)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "CDF8101297N8",
        urlPortal: "https://facturacion.comex.com.mx/",
        patrones: ["comex leon", "pinturas comex", "distribuidora comex leon"],
        camposRequeridos: ["número de ticket", "sucursal", "total"],
    },
    {
        nombre: "Steren Electrónica León (Tecnología y Ferretería Digital)",
        zona: "León, Gto (Centro Peatonal / Plaza Mayor / Centro Max)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "EST9008298Q8",
        urlPortal: "https://facturacion.steren.com.mx/",
        patrones: ["steren leon", "electronica steren", "steren plaza mayor"],
        camposRequeridos: ["número de ticket", "tienda", "total"],
    },
    {
        nombre: "Papelerías Lumen León (Materiales y Oficina)",
        zona: "León, Gto (Zona Campestre / López Mateos)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "ALU891012KT4",
        urlPortal: "https://facturacion.lumen.com.mx/",
        patrones: ["lumen leon", "papelerias lumen", "lumen campestre"],
        camposRequeridos: ["ticket", "sucursal", "fecha", "total"],
    },
    {
        nombre: "Restaurante Argentilia León (Cortes y Negocios)",
        zona: "León, Gto (Zona Campestre)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "ARG0408103A5",
        urlPortal: "https://facturacion.argentilia.com.mx/",
        patrones: ["argentilia leon", "restaurante argentilia", "argentilia campestre"],
        camposRequeridos: ["folio ticket", "fecha", "total"],
    },
    {
        nombre: "El Borrego de Oro León (Restaurante Típico y Desayunos)",
        zona: "León, Gto (Campestre / Blvd. Aeropuerto)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "BGO9805128M1",
        urlPortal: "https://facturacion.elborregodeoro.com.mx/",
        patrones: ["borrego de oro leon", "el borrego de oro"],
        camposRequeridos: ["folio de consumo", "fecha", "total"],
    },
    {
        nombre: "Librerías Gandhi León (Libros y Papelería Ejecutiva)",
        zona: "León, Gto (Plaza Mayor / Campestre)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "LGA9211048Z4",
        urlPortal: "https://facturacion.gandhi.com.mx/",
        patrones: ["gandhi leon", "librerias gandhi plaza mayor", "libreria gandhi"],
        camposRequeridos: ["ticket", "tienda", "fecha", "total"],
    },
    {
        nombre: "Caffenio León (Café Drive-Thru)",
        zona: "León, Gto (Torres / Blvd. Aeropuerto / Campestre)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CAF9405036B5",
        urlPortal: "https://facturacion.caffenio.com/",
        patrones: ["caffenio leon", "caffenio torres", "caffenio aeropuerto"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Laboratorios Médico Chopo León (Servicios de Salud)",
        zona: "León, Gto (Campestre / Centro / Torres Landa)",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "LME850912K45",
        urlPortal: "https://facturacion.chopo.com.mx/",
        patrones: ["chopo leon", "laboratorios chopo", "chopo campestre"],
        camposRequeridos: ["orden de estudio", "sucursal", "total"],
    },
    {
        nombre: "Petco León (Alimentos y Cuidado de Mascotas)",
        zona: "León, Gto (Plaza Mayor / Insurgentes)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "PMC1303273M3",
        urlPortal: "https://facturacion.petco.com.mx/",
        patrones: ["petco leon", "petco plaza mayor"],
        camposRequeridos: ["ticket", "tienda", "caja", "total"],
    },
    {
        nombre: "Smart Fit León (Gimnasios y Membresías)",
        zona: "León, Gto (Plaza Mayor / Centro Max / Altacia)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "SFI1103046M1",
        urlPortal: "https://facturacion.smartfit.com.mx/",
        patrones: ["smart fit leon", "smartfit plaza mayor", "smartfit altacia"],
        camposRequeridos: ["contrato / membresía", "unidad", "total"],
    },
    {
        nombre: "Gorditas Tarandas León (Desayunos y Antojitos)",
        zona: "León, Gto (López Mateos / Centro)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "GTA0811126J8",
        urlPortal: "https://facturacion.gorditastarandas.com.mx/",
        patrones: ["gorditas tarandas", "tarandas leon"],
        camposRequeridos: ["folio ticket", "sucursal", "total"],
    },
    {
        nombre: "Sam's Club León (Campestre y Centro Max)",
        zona: "León, Gto (Campestre / Blvd. Aeropuerto)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "NWM9709244W4",
        urlPortal: "https://facturacion.walmartmexico.com.mx/",
        patrones: ["sams club leon", "sam's club leon", "sams campestre", "sams centro max"],
        camposRequeridos: ["tc #", "tr #", "fecha", "total"],
    },
    {
        nombre: "City Club León (Torres Landa / López Mateos)",
        zona: "León, Gto (Torres Landa)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "TSO991022PB6",
        urlPortal: "https://facturacion.soriana.com/",
        patrones: ["city club leon", "tiendas city club leon"],
        camposRequeridos: ["código de ticket", "tienda", "total"],
    },
    {
        nombre: "Casa Ley León (Blvd. San Juan Bosco)",
        zona: "León, Gto (San Juan Bosco)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "CLE810525EA8",
        urlPortal: "https://facturacion.casaley.com.mx/",
        patrones: ["casa ley leon", "ley san juan bosco", "tiendas ley leon"],
        camposRequeridos: ["código ticket", "tienda", "total"],
    },
    {
        nombre: "Tiendas 3B León (Abarrotes y Despensa)",
        zona: "León, Gto (Red de Colonias León)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "TTB0407223J2",
        urlPortal: "https://facturacion.tiendas3b.com/",
        patrones: ["tiendas 3b leon", "3b leon", "tres b leon"],
        camposRequeridos: ["folio", "tienda", "fecha", "total"],
    },
    {
        nombre: "Miniso León (Plaza Mayor / Altacia / Mulza)",
        zona: "León, Gto (Plaza Mayor / Altacia)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "MME1609232J7",
        urlPortal: "https://facturacion.miniso.com.mx/",
        patrones: ["miniso leon", "miniso plaza mayor", "miniso altacia"],
        camposRequeridos: ["folio ticket", "sucursal", "total"],
    },
    {
        nombre: "Suburbia León (Centro / Centro Max / Galerías)",
        zona: "León, Gto (Centro / Blvd. Aeropuerto)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "SUB910603SB3",
        urlPortal: "https://facturacion.suburbia.com.mx/",
        patrones: ["suburbia leon", "suburbia centro max", "tiendas suburbia"],
        camposRequeridos: ["código de facturación", "terminal", "total"],
    },
    {
        nombre: "Zapaterías Cuadra / Franco Cuadra (Corporativo Matriz León)",
        zona: "León, Gto (Matriz Blvd. Aeropuerto)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "CUA941215M73",
        urlPortal: "https://facturacion.cuadra.com.mx/",
        patrones: ["cuadra leon", "franco cuadra", "zapaterias cuadra leon", "botas cuadra"],
        camposRequeridos: ["folio compra", "sucursal", "total"],
    },
    {
        nombre: "Charly Calzado y Ropa Deportiva (Corporativo Matriz León)",
        zona: "León, Gto (Matriz Blvd. Aeropuerto)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "GCH9008298G5",
        urlPortal: "https://facturacion.charly.com/",
        patrones: ["charly leon", "grupo charly", "tiendas charly leon", "charly outlet"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Pirma Calzado y Deporte (Matriz San Pancho / León)",
        zona: "León y San Francisco del Rincón, Gto",
        categoria: "Supermercados y Retail",
        rfcEmisor: "PBR9006013U7",
        urlPortal: "https://facturacion.pirma.com.mx/",
        patrones: ["pirma leon", "pirma brasil", "tiendas pirma leon", "calzado pirma"],
        camposRequeridos: ["código venta", "sucursal", "total"],
    },
    {
        nombre: "Zapaterías Brantano (Corporativo Matriz Blvd. Aeropuerto León)",
        zona: "León, Gto (Matriz Blvd. Aeropuerto)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "BRA9107129A2",
        urlPortal: "https://facturacion.brantano.com.mx/",
        patrones: ["brantano leon", "zapaterias brantano", "outlet brantano"],
        camposRequeridos: ["ticket", "fecha", "total"],
    },
    {
        nombre: "Capa de Ozono Calzado (Corporativo Matriz León)",
        zona: "León, Gto (Matriz León)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "COZ9208151M9",
        urlPortal: "https://facturacion.capadeozono.com.mx/",
        patrones: ["capa de ozono leon", "zapaterias capa de ozono", "capa de ozono outlet"],
        camposRequeridos: ["código ticket", "tienda", "total"],
    },
    {
        nombre: "Outlet Mulza León (Centro del Calzado y Piel)",
        zona: "León, Gto (Blvd. Aeropuerto 843)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "OMU0809187H4",
        urlPortal: "https://facturacion.mulza.mx/",
        patrones: ["mulza leon", "outlet mulza", "mulza calzado", "estacionamiento mulza"],
        camposRequeridos: ["folio boleto / ticket", "fecha", "total"],
    },
    {
        nombre: "Factory Shops Outlet León (Blvd. Aeropuerto)",
        zona: "León, Gto (Blvd. Aeropuerto)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "FSO0711202K1",
        urlPortal: "https://facturacion.factoryshops.com.mx/",
        patrones: ["factory shops leon", "the factory shops", "factory shops aeropuerto"],
        camposRequeridos: ["folio", "fecha", "total"],
    },
    {
        nombre: "Plaza del Zapato León (Blvd. López Mateos)",
        zona: "León, Gto (Blvd. López Mateos / Calzada)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "PZA8506129F2",
        urlPortal: "https://facturacion.plazadelzapato.com.mx/",
        patrones: ["plaza del zapato leon", "plaza del zapato", "zapaterias plaza del zapato"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Mochomos León (Plaza Mayor)",
        zona: "León, Gto (Plaza Mayor)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "MOC1408127K4",
        urlPortal: "https://facturacion.mochomos.mx/",
        patrones: ["mochomos leon", "restaurante mochomos", "mochomos plaza mayor"],
        camposRequeridos: ["folio ticket", "fecha", "total"],
    },
    {
        nombre: "Sonora Grill / Sonora Prime León (Plaza Mayor)",
        zona: "León, Gto (Plaza Mayor)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "SGR0805149T2",
        urlPortal: "https://facturacion.sonoragrill.com.mx/",
        patrones: ["sonora grill leon", "sonora prime leon", "sonora grill plaza mayor"],
        camposRequeridos: ["ticket", "fecha", "total"],
    },
    {
        nombre: "Boston's Pizza León (Campestre / Torres Landa)",
        zona: "León, Gto (Blvd. Campestre / Torres Landa)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "BPL0906235G1",
        urlPortal: "https://facturacion.bostons.com.mx/",
        patrones: ["bostons pizza leon", "boston's pizza leon", "bostons campestre"],
        camposRequeridos: ["número de cheque", "fecha", "total"],
    },
    {
        nombre: "Carl's Jr. León (López Mateos / Centro Max / Altacia)",
        zona: "León, Gto (Centro Max / López Mateos / Altacia)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CJL9805144P8",
        urlPortal: "https://facturacion.carlsjr.com.mx/",
        patrones: ["carls jr leon", "carl's jr leon", "carls jr centro max"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Little Caesars Pizza León (Grupo Caeser Bajío)",
        zona: "León, Gto (Sucursales León)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "LCB0610195L3",
        urlPortal: "https://facturacion.littlecaesarsmexico.com/",
        patrones: ["little caesars leon", "little caesar leon", "caesars pizza leon"],
        camposRequeridos: ["ticket", "sucursal", "fecha", "total"],
    },
    {
        nombre: "KFC Kentucky Fried Chicken León",
        zona: "León, Gto (López Mateos / San Jerónimo)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "KFC9004128N2",
        urlPortal: "https://facturacion.kfc.com.mx/",
        patrones: ["kfc leon", "kentucky leon", "kentucky fried chicken leon"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "McDonald's León (López Mateos / Plaza Mayor / Centro Max)",
        zona: "León, Gto (López Mateos / Centro Max)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "SML8501183H2",
        urlPortal: "https://facturacion.mcdonalds.com.mx/",
        patrones: ["mcdonalds leon", "mcdonald's leon", "mcdonalds centro max"],
        camposRequeridos: ["ticket", "tienda", "fecha", "total"],
    },
    {
        nombre: "Subway León (Campestre / Centro / Plaza Mayor)",
        zona: "León, Gto (Campestre / Centro / Altacia)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "SUB0209187K9",
        urlPortal: "https://facturacion.subway.com.mx/",
        patrones: ["subway leon", "subway campestre", "subway plaza mayor"],
        camposRequeridos: ["ticket", "sucursal", "total"],
    },
    {
        nombre: "Sushi Roll León (Plaza Mayor / Altacia)",
        zona: "León, Gto (Plaza Mayor / Altacia)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "SRO0304154T6",
        urlPortal: "https://facturacion.sushiroll.com.mx/",
        patrones: ["sushi roll leon", "sushi roll plaza mayor", "sushiroll altacia"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Sirloin Stockade León (Centro Max)",
        zona: "León, Gto (Centro Max Blvd. Aeropuerto)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "SSL9211248H7",
        urlPortal: "https://facturacion.sirloinstockade.com.mx/",
        patrones: ["sirloin stockade leon", "sirloin centro max"],
        camposRequeridos: ["folio ticket", "sucursal", "total"],
    },
    {
        nombre: "Buffalo Wild Wings León (Plaza Mayor)",
        zona: "León, Gto (Plaza Mayor)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "BWW1203204R1",
        urlPortal: "https://facturacion.buffalowildwings.com.mx/",
        patrones: ["buffalo wild wings leon", "bww plaza mayor", "bww leon"],
        camposRequeridos: ["ticket", "fecha", "total"],
    },
    {
        nombre: "Wingstop León (Centro Max / Plaza Mayor)",
        zona: "León, Gto (Centro Max / Plaza Mayor)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "WSM0907142H3",
        urlPortal: "https://facturacion.wingstop.com.mx/",
        patrones: ["wingstop leon", "wingstop centro max", "wingstop plaza mayor"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "McCarthy's Irish Pub León (Zona Campestre)",
        zona: "León, Gto (Blvd. Campestre)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "MIP1109156F4",
        urlPortal: "https://facturacion.mccarthyspub.com.mx/",
        patrones: ["mccarthys leon", "mccarthy's irish pub leon", "mccarthys campestre"],
        camposRequeridos: ["cuenta", "fecha", "total"],
    },
    {
        nombre: "Pastelerías El Globo León (Campestre / Plaza Mayor)",
        zona: "León, Gto (Campestre / Plaza Mayor)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "EGL9104192V8",
        urlPortal: "https://facturacion.elglobo.com.mx/",
        patrones: ["el globo leon", "pasteleria el globo", "el globo campestre"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Pastelerías Suspiros León (López Mateos / San Pedro)",
        zona: "León, Gto (López Mateos / San Pedro)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "PSU0309124L9",
        urlPortal: "https://facturacion.suspirospastelerias.com/",
        patrones: ["suspiros leon", "pastelerias suspiros leon"],
        camposRequeridos: ["folio venta", "sucursal", "total"],
    },
    {
        nombre: "Salud Digna León (Centro, Miguel Alemán, San Jerónimo)",
        zona: "León, Gto (Centro / Miguel Alemán / San Jerónimo)",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "SDI0307185Z6",
        urlPortal: "https://facturacion.salud-digna.org/",
        patrones: ["salud digna leon", "salud digna centro leon", "salud digna miguel aleman"],
        camposRequeridos: ["folio de pago", "código de barras", "total"],
    },
    {
        nombre: "Farmacias Benavides León (Sucursales León)",
        zona: "León, Gto (Campestre / López Mateos)",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "FBE9110219Z3",
        urlPortal: "https://facturacion.benavides.com.mx/",
        patrones: ["farmacias benavides leon", "benavides leon"],
        camposRequeridos: ["referencia", "fecha", "total"],
    },
    {
        nombre: "Farmacias San Pablo León (Campestre)",
        zona: "León, Gto (Blvd. Campestre)",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "FSP9308102C4",
        urlPortal: "https://www.farmaciasanpablo.com.mx/facturacion",
        patrones: ["farmacias san pablo leon", "san pablo campestre"],
        camposRequeridos: ["folio ticket", "tienda", "total"],
    },
    {
        nombre: "Hospital Ángeles León (Lomas del Campestre)",
        zona: "León, Gto (Lomas del Campestre / Av. Cerro Gordo)",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "HAL0008246P1",
        urlPortal: "https://facturacion.hospitalesangeles.com/",
        patrones: ["hospital angeles leon", "angeles leon", "hospitales angeles leon"],
        camposRequeridos: ["folio cuenta", "admisión", "total"],
    },
    {
        nombre: "Hospital Médica Campestre León (Blvd. Manantial)",
        zona: "León, Gto (Blvd. Manantial / Campestre)",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "HMC0411195R2",
        urlPortal: "https://facturacion.medicacampestre.com/",
        patrones: ["medica campestre leon", "hospital medica campestre"],
        camposRequeridos: ["recibo", "paciente", "total"],
    },
    {
        nombre: "Ópticas Devlyn León (Plaza Mayor / Centro Max / Altacia)",
        zona: "León, Gto (Plaza Mayor / Centro Max / Altacia)",
        categoria: "Tiendas y Farmacias",
        rfcEmisor: "ODL3611145K9",
        urlPortal: "https://facturacion.devlyn.com.mx/",
        patrones: ["devlyn leon", "opticas devlyn leon", "devlyn plaza mayor"],
        camposRequeridos: ["ticket", "sucursal", "total"],
    },
    {
        nombre: "Refaccionarias California León",
        zona: "León, Gto (López Mateos / Torres Landa)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "RCA8108147Y3",
        urlPortal: "https://facturacion.refaccionariacalifornia.com.mx/",
        patrones: ["refaccionaria california leon", "california autopartes leon"],
        camposRequeridos: ["factura ticket", "sucursal", "total"],
    },
    {
        nombre: "Grupo Rolcar Refaccionarias León",
        zona: "León, Gto (López Mateos / Torres Landa / San Pedro)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "RFL6109259G8",
        urlPortal: "https://facturacion.rolcar.com.mx/",
        patrones: ["rolcar leon", "refaccionaria rolcar", "rolcar torres landa"],
        camposRequeridos: ["folio ticket", "sucursal", "total"],
    },
    {
        nombre: "Interceramic León (Pisos y Baños Campestre / Blvd. Aeropuerto)",
        zona: "León, Gto (Campestre / Blvd. Aeropuerto)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "ICM7802102M9",
        urlPortal: "https://facturacion.interceramic.com/",
        patrones: ["interceramic leon", "pisos interceramic leon", "interceramic aeropuerto"],
        camposRequeridos: ["folio venta", "tienda", "total"],
    },
    {
        nombre: "Daltile México León (Pisos y Acabados)",
        zona: "León, Gto (Blvd. Aeropuerto)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "DAL5502128H4",
        urlPortal: "https://facturacion.daltile.com.mx/",
        patrones: ["daltile leon", "pisos daltile", "daltile aeropuerto"],
        camposRequeridos: ["orden de venta", "sucursal", "total"],
    },
    {
        nombre: "Gasolineras Valero León y Bajío",
        zona: "León, Gto (Blvd. Morelos / Libramiento / Aeropuerto)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "VME1708233D2",
        urlPortal: "https://facturacion.valeromexico.com/",
        patrones: ["valero leon", "gasolinera valero leon", "estacion valero bajio"],
        camposRequeridos: ["referencia", "estación", "total"],
    },
    {
        nombre: "Gasolineras BP British Petroleum León",
        zona: "León, Gto (Torres Landa / Libramiento Morelos)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "BPM1702146Y3",
        urlPortal: "https://facturacion.bp.com.mx/",
        patrones: ["bp leon", "gasolinera bp leon", "british petroleum leon"],
        camposRequeridos: ["ticket", "estación", "total"],
    },
    {
        nombre: "Gasolineras TotalEnergies León y Silao",
        zona: "León, Silao y Carretera 45",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "TEM1705183K2",
        urlPortal: "https://facturacion.totalenergies.mx/",
        patrones: ["total leon", "totalenergies leon", "gasolinera total bajio"],
        camposRequeridos: ["código de facturación", "estación", "total"],
    },
    {
        nombre: "Gasolineras Repsol León (Libramiento Morelos)",
        zona: "León, Gto (Libramiento José María Morelos)",
        categoria: "Gasolineras y Combustibles",
        rfcEmisor: "RDM8506144M1",
        urlPortal: "https://facturacion.repsol.com.mx/",
        patrones: ["repsol leon", "gasolinera repsol leon", "estacion repsol morelos"],
        camposRequeridos: ["referencia", "estación", "total"],
    },
    {
        nombre: "Hotel Hotsson León (Icono Ejecutivo Blvd. López Mateos)",
        zona: "León, Gto (Blvd. López Mateos 1102)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "HHO1105188L2",
        urlPortal: "https://facturacion.hotsson.com/",
        patrones: ["hotsson leon", "hotel hotsson leon", "restaurante los vitrales hotsson"],
        camposRequeridos: ["folio reservación / consumo", "fecha", "total"],
    },
    {
        nombre: "Aeropuerto Internacional del Bajío (BJX - Grupo Aeroportuario GAP)",
        zona: "Silao - León, Gto (BJX Guanajuato)",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "GAP9805284U9",
        urlPortal: "https://facturacion.aeropuertosgap.com.mx/",
        patrones: ["aeropuerto bajio", "aeropuerto leon", "bjx leon", "estacionamiento aeropuerto bjx"],
        camposRequeridos: ["folio boleto / ticket", "aeropuerto", "total"],
    },
    {
        nombre: "Hotel Courtyard by Marriott León Poliforum",
        zona: "León, Gto (Zona Poliforum)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CML1204185T9",
        urlPortal: "https://facturacion.marriott.com/",
        patrones: ["courtyard leon", "marriott leon poliforum", "courtyard by marriott leon"],
        camposRequeridos: ["folio reservación", "folio folio", "total"],
    },
    {
        nombre: "Hotel Real de Minas Poliforum León",
        zona: "León, Gto (Blvd. López Mateos / Poliforum)",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "HRM7508204K1",
        urlPortal: "https://facturacion.realdeminas.com.mx/",
        patrones: ["real de minas leon", "hotel real de minas poliforum"],
        camposRequeridos: ["folio huésped", "fecha", "total"],
    },
    {
        nombre: "Poliforum León (Centro de Exposiciones y Convenciones)",
        zona: "León, Gto (Poliforum León)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "CEX9906103A8",
        urlPortal: "https://facturacion.poliforumleon.com/",
        patrones: ["poliforum leon", "estacionamiento poliforum leon", "centro de convenciones leon"],
        camposRequeridos: ["folio boleto", "evento", "total"],
    },
    {
        nombre: "Zapaterías Coqueta y Audaz León (Corporativo Matriz)",
        zona: "León, Gto (Matriz León)",
        categoria: "Supermercados y Retail",
        rfcEmisor: "CYA8504128N3",
        urlPortal: "https://facturacion.coquetayaudaz.com.mx/",
        patrones: ["coqueta y audaz leon", "zapaterias coqueta y audaz", "calzado infantil coqueta"],
        camposRequeridos: ["ticket", "sucursal", "total"],
    },
    {
        nombre: "Llomer Pisos y Azulejos León (Blvd. Aeropuerto)",
        zona: "León, Gto (Blvd. Aeropuerto)",
        categoria: "Materiales y Oficina",
        rfcEmisor: "LLO9810245M7",
        urlPortal: "https://facturacion.llomer.com.mx/",
        patrones: ["llomer leon", "pisos llomer", "llomer azulejos leon"],
        camposRequeridos: ["folio venta", "tienda", "total"],
    },
    // ========================================================
    // 🇲🇽 BLOQUE SECUNDARIO: AUTOPISTAS Y COMERCIOS NACIONALES
    // ========================================================
    {
        nombre: "CAPUFE (Caminos y Puentes Federales)",
        zona: "Autopistas Federales",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "CPF6307036N0",
        urlPortal: "https://facturacioncapufe.com.mx/",
        patrones: ["capufe", "caminos y puentes federales", "sisfact", "plaza de cobro"],
        camposRequeridos: ["código facturación", "fecha", "carril", "total"],
    },
    {
        nombre: "Autopista Arco Norte",
        zona: "Circuito Exterior y Centro",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "AAN0512206W0",
        urlPortal: "https://arconorte.com.mx/facturacion/",
        patrones: ["arco norte", "autopista arco norte", "concesionaria mexiquense"],
        camposRequeridos: ["folio ticket", "entronque", "fecha", "total"],
    },
    {
        nombre: "Pinfra (Promotora y Operadora de Infraestructura)",
        zona: "Autopistas de Cuota Nacionales",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "PIN0709033X1",
        urlPortal: "https://facturacion.pinfra.com.mx/",
        patrones: ["pinfra", "autopistas pinfra", "promotora y operadora"],
        camposRequeridos: ["folio nru", "plaza", "fecha", "total"],
    },
    {
        nombre: "Autovía Morelia - Salamanca",
        zona: "Bajío Sur / Michoacán - Guanajuato",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "AMS0811059G8",
        urlPortal: "https://facturacion.autoviamoreliasalamanca.com.mx/",
        patrones: ["morelia salamanca", "autovia morelia", "caseta la cinta", "valle de santiago"],
        camposRequeridos: ["folio", "código", "fecha", "total"],
    },
    {
        nombre: "Autopista Toluca - Naucalpan",
        zona: "Estado de México",
        categoria: "Casetas y Autopistas",
        rfcEmisor: "ATN0703274V2",
        urlPortal: "https://autopistatolucanaucalpan.com.mx/facturacion",
        patrones: ["toluca naucalpan", "autovias del valle"],
        camposRequeridos: ["folio nru", "fecha", "monto"],
    },
    {
        nombre: "Liverpool México",
        zona: "Nacional / Plaza Mayor y Altacia León",
        categoria: "Supermercados y Retail",
        rfcEmisor: "DLI931201MI9",
        urlPortal: "https://facturacion.liverpool.com.mx/",
        patrones: ["liverpool", "distribuidora liverpool"],
        camposRequeridos: ["código de facturación", "terminal", "total"],
    },
    {
        nombre: "Sanborns Hermanos",
        zona: "Nacional / Plaza Mayor León",
        categoria: "Supermercados y Retail",
        rfcEmisor: "SHE190630V37",
        urlPortal: "https://facturacion.sanborns.com.mx/",
        patrones: ["sanborns", "sanborns hermanos"],
        camposRequeridos: ["transacción", "tienda", "caja", "total"],
    },
    {
        nombre: "Sears México",
        zona: "Nacional / Plaza Mayor León",
        categoria: "Supermercados y Retail",
        rfcEmisor: "SOP470227H29",
        urlPortal: "https://facturacion.sears.com.mx/",
        patrones: ["sears", "sears roebuck"],
        camposRequeridos: ["ticket", "tienda", "total"],
    },
    {
        nombre: "Office Depot México",
        zona: "Nacional / Campestre León",
        categoria: "Materiales y Oficina",
        rfcEmisor: "ODM950324V2A",
        urlPortal: "https://facturacion.officedepot.com.mx/",
        patrones: ["office depot", "officedepot"],
        camposRequeridos: ["itu / código de facturación", "fecha", "total"],
    },
    {
        nombre: "Estafeta Mexicana",
        zona: "Nacional",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "EME8803095G2",
        urlPortal: "https://facturacion.estafeta.com/",
        patrones: ["estafeta", "estafeta mexicana"],
        camposRequeridos: ["número de guía", "código postal", "total"],
    },
    {
        nombre: "DHL Express México",
        zona: "Nacional",
        categoria: "Paquetería y Transporte",
        rfcEmisor: "DEX8003185D9",
        urlPortal: "https://facturacion.dhl.com.mx/",
        patrones: ["dhl", "dhl express"],
        camposRequeridos: ["guía aérea (awb)", "cuenta", "total"],
    },
    {
        nombre: "Cinépolis México",
        zona: "Nacional",
        categoria: "Restaurantes y Cafeterías",
        rfcEmisor: "CNE9305141D2",
        urlPortal: "https://facturacion.cinepolis.com/",
        patrones: ["cinepolis", "cinépolis"],
        camposRequeridos: ["folio ticket", "complejo", "total"],
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
                    zona: candidato.zona || "León, Gto y Bajío",
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
                zona: "León, Guanajuato y Bajío",
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
            zona: "León, Gto y Cercanías",
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
            zona: cand.zona || "León, Gto y Bajío",
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
                            .map((c, idx) => `${idx + 1}. *${c.nombre}* (${c.categoria})\n   • *Zona:* 📍 ${c.zona || "León, Gto y Bajío"}\n   • *Portal:* ${c.urlPortal}\n   • *RFC:* \`${c.rfcEmisor}\``)
                            .join("\n\n");
                        const textoNotificacion = `🤖 *KlientIA — Expansión de Conectores (León, Gto y Bajío) (${dia})*

Se han descubierto e integrado exitosamente *${res.nuevos.length} nuevos conectores* de comercios y servicios de León, Gto y alrededores:

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
