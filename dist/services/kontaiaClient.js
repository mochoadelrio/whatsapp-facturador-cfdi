import fetch from "node-fetch";
export class KontaiaClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = (baseUrl || process.env.KONTAIA_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    }
    /**
     * Obtiene la configuración fiscal del emisor registrada en KontaIA.
     */
    async obtenerPerfilEmisor(rfc) {
        const cleanRfc = rfc.trim().toUpperCase();
        try {
            const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/perfil-emisor/${cleanRfc}`, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });
            if (!resp.ok) {
                if (resp.status === 404)
                    return null;
                console.warn(`[KontaiaClient] HTTP ${resp.status} al consultar perfil emisor ${cleanRfc}`);
                return null;
            }
            const data = await resp.json();
            return data;
        }
        catch (err) {
            console.warn(`[KontaiaClient] Error consultando perfil emisor ${cleanRfc}:`, err.message || err);
            return null;
        }
    }
    /**
     * Lista los productos del emisor en KontaIA, con opción de búsqueda predictiva.
     */
    async listarProductos(rfc, query) {
        const cleanRfc = rfc.trim().toUpperCase();
        try {
            const qParam = query && query.trim() ? `?query=${encodeURIComponent(query.trim())}` : "";
            const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/productos/${cleanRfc}${qParam}`, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });
            if (!resp.ok)
                return [];
            const data = await resp.json();
            return Array.isArray(data) ? data : [];
        }
        catch (err) {
            console.warn(`[KontaiaClient] Error listando productos de ${cleanRfc}:`, err.message || err);
            return [];
        }
    }
    /**
     * Busca el mejor producto que coincida con la consulta del usuario.
     */
    async buscarProducto(rfc, query) {
        const lista = await this.listarProductos(rfc, query);
        return lista.length > 0 ? lista[0] : null;
    }
    /**
     * Guarda un producto en el catálogo de KontaIA.
     */
    async guardarProducto(rfc, producto) {
        const cleanRfc = rfc.trim().toUpperCase();
        try {
            const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/productos/${cleanRfc}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(producto)
            });
            if (!resp.ok)
                return null;
            const data = await resp.json();
            return data.producto || null;
        }
        catch (err) {
            console.warn(`[KontaiaClient] Error guardando producto para ${cleanRfc}:`, err.message || err);
            return null;
        }
    }
    /**
     * Lista los clientes registrados en KontaIA con búsqueda predictiva.
     */
    async listarClientes(rfc, query) {
        const cleanRfc = rfc.trim().toUpperCase();
        try {
            const qParam = query && query.trim() ? `?query=${encodeURIComponent(query.trim())}` : "";
            const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/clientes/${cleanRfc}${qParam}`, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });
            if (!resp.ok)
                return [];
            const data = await resp.json();
            return Array.isArray(data) ? data : [];
        }
        catch (err) {
            console.warn(`[KontaiaClient] Error listando clientes de ${cleanRfc}:`, err.message || err);
            return [];
        }
    }
    /**
     * Busca un cliente receptor en KontaIA por nombre o RFC.
     */
    async buscarCliente(rfc, query) {
        const lista = await this.listarClientes(rfc, query);
        return lista.length > 0 ? lista[0] : null;
    }
    /**
     * Guarda un nuevo cliente receptor en el catálogo de KontaIA.
     */
    async guardarCliente(tenantId, cliente) {
        const cleanTenant = tenantId.trim().toUpperCase();
        try {
            const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/clientes/${cleanTenant}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(cliente)
            });
            if (!resp.ok)
                return null;
            const data = await resp.json();
            return data.cliente || null;
        }
        catch (err) {
            console.warn(`[KontaiaClient] Error guardando cliente para ${cleanTenant}:`, err.message || err);
            return null;
        }
    }
    /**
     * Emite y timbra la factura vía KontaIA (utiliza el CSD y configuración de KontaIA).
     */
    async emitirYTimbrar(payload) {
        try {
            const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/emitir-y-timbrar`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    generar_pdf: payload.generar_pdf !== undefined ? payload.generar_pdf : true
                })
            });
            const data = await resp.json();
            if (!resp.ok) {
                const detail = data?.detail;
                if (typeof detail === "object" && detail !== null) {
                    return {
                        estatus: "RECHAZADO_VALIDACION_PREVIA",
                        mensaje: detail.mensaje || "Validación preventiva del SAT rechazada.",
                        errores: Array.isArray(detail.errores) ? detail.errores : []
                    };
                }
                return {
                    estatus: "ERROR",
                    mensaje: (typeof detail === "string" ? detail : data.mensaje) || `Error HTTP ${resp.status} al timbrar con KontaIA.`
                };
            }
            return data;
        }
        catch (err) {
            console.error("[KontaiaClient] Error de conexión al timbrar factura:", err);
            return {
                estatus: "ERROR",
                mensaje: `Error de red al conectar con KontaIA: ${err.message || err}`
            };
        }
    }
    /**
     * Descarga el PDF oficial generado de un comprobante timbrado.
     */
    async descargarPdfBuffer(uuid) {
        try {
            const resp = await fetch(`${this.baseUrl}/api/v1/cfdi/${uuid}/pdf`, {
                method: "GET"
            });
            if (!resp.ok)
                return null;
            const arrBuf = await resp.arrayBuffer();
            return Buffer.from(arrBuf);
        }
        catch (err) {
            return null;
        }
    }
    /**
     * Descarga el XML CFDI 4.0 oficial timbrado.
     */
    async descargarXmlBuffer(uuid) {
        try {
            const resp = await fetch(`${this.baseUrl}/api/v1/cfdi/${uuid}/xml`, {
                method: "GET"
            });
            if (!resp.ok)
                return null;
            const text = await resp.text();
            return Buffer.from(text, "utf-8");
        }
        catch (err) {
            return null;
        }
    }
}
// Instancia singleton compartida
export const kontaiaClient = new KontaiaClient();
