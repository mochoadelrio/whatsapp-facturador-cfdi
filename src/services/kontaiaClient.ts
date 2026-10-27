import fetch from "node-fetch";

export interface PerfilEmisorKontaia {
  success: boolean;
  tenant_id: string;
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  tiene_csd: boolean;
  csd_serie?: string;
  csd_valido_hasta?: string;
  serie_predeterminada: string;
  siguiente_folio: number;
  tiene_logo: boolean;
  total_clientes: number;
  total_productos: number;
}

export interface ProductoKontaia {
  id?: number;
  tenant_id?: string;
  descripcion: string;
  clave_prod_serv: string;
  clave_unidad?: string;
  unidad?: string;
  precio_unitario: number;
  objeto_imp?: string;
  tasa_iva?: number;
  aplica_retencion_isr?: number;
  aplica_retencion_iva?: number;
}

export interface ClienteKontaia {
  id?: number;
  tenant_id?: string;
  rfc: string;
  razon_social: string;
  codigo_postal: string;
  regimen_fiscal: string;
  uso_cfdi?: string;
  correo_electronico?: string;
  telefono?: string;
  origen_datos?: string;
}

export interface EmisionConceptoKontaia {
  clave_prod_serv: string;
  clave_unidad: string;
  unidad?: string;
  cantidad: number | string;
  descripcion: string;
  valor_unitario: number;
  objeto_imp?: string;
}

export interface SolicitudEmisionKontaia {
  tenant_id: string;
  serie?: string;
  folio?: string;
  forma_pago?: string;
  metodo_pago?: string;
  lugar_expedicion?: string;
  emisor?: {
    rfc: string;
    nombre?: string;
    regimen_fiscal?: string;
  };
  receptor: {
    rfc: string;
    nombre: string;
    domicilio_fiscal_receptor?: string;
    domicilio_fiscal_codigo_postal?: string;
    regimen_fiscal_receptor?: string;
    regimen_fiscal?: string;
    uso_cfdi?: string;
  };
  conceptos: EmisionConceptoKontaia[];
  generar_pdf?: boolean;
}

export interface ResultadoEmisionKontaia {
  estatus: "TIMBRADO_EXITOSO" | "ERROR_FALTA_CSD" | "ERROR_TIMBRADO_PAC" | "RECHAZADO_VALIDACION_PREVIA" | "ERROR";
  uuid?: string;
  fecha_timbrado?: string;
  no_certificado_sat?: string;
  subtotal?: number;
  total_iva?: number;
  total?: number;
  xml_timbrado?: string;
  pdf_base64?: string;
  pdf_bytes_length?: number;
  mensaje?: string;
  errores?: string[];
}

export class KontaiaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.KONTAIA_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  }

  /**
   * Obtiene la configuración fiscal del emisor registrada en KontaIA.
   */
  async obtenerPerfilEmisor(rfc: string): Promise<PerfilEmisorKontaia | null> {
    const cleanRfc = rfc.trim().toUpperCase();
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/perfil-emisor/${cleanRfc}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!resp.ok) {
        if (resp.status === 404) return null;
        console.warn(`[KontaiaClient] HTTP ${resp.status} al consultar perfil emisor ${cleanRfc}`);
        return null;
      }
      const data = await resp.json() as PerfilEmisorKontaia;
      return data;
    } catch (err: any) {
      console.warn(`[KontaiaClient] Error consultando perfil emisor ${cleanRfc}:`, err.message || err);
      return null;
    }
  }

  /**
   * Lista los productos del emisor en KontaIA, con opción de búsqueda predictiva.
   */
  async listarProductos(rfc: string, query?: string): Promise<ProductoKontaia[]> {
    const cleanRfc = rfc.trim().toUpperCase();
    try {
      const qParam = query && query.trim() ? `?query=${encodeURIComponent(query.trim())}` : "";
      const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/productos/${cleanRfc}${qParam}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!resp.ok) return [];
      const data = await resp.json() as ProductoKontaia[];
      return Array.isArray(data) ? data : [];
    } catch (err: any) {
      console.warn(`[KontaiaClient] Error listando productos de ${cleanRfc}:`, err.message || err);
      return [];
    }
  }

  /**
   * Busca el mejor producto que coincida con la consulta del usuario.
   */
  async buscarProducto(rfc: string, query: string): Promise<ProductoKontaia | null> {
    const lista = await this.listarProductos(rfc, query);
    return lista.length > 0 ? lista[0] : null;
  }

  /**
   * Guarda un producto en el catálogo de KontaIA.
   */
  async guardarProducto(rfc: string, producto: ProductoKontaia): Promise<ProductoKontaia | null> {
    const cleanRfc = rfc.trim().toUpperCase();
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/productos/${cleanRfc}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(producto)
      });
      if (!resp.ok) return null;
      const data = await resp.json() as { success: boolean; producto: ProductoKontaia };
      return data.producto || null;
    } catch (err: any) {
      console.warn(`[KontaiaClient] Error guardando producto para ${cleanRfc}:`, err.message || err);
      return null;
    }
  }

  /**
   * Lista los clientes registrados en KontaIA con búsqueda predictiva.
   */
  async listarClientes(rfc: string, query?: string): Promise<ClienteKontaia[]> {
    const cleanRfc = rfc.trim().toUpperCase();
    try {
      const qParam = query && query.trim() ? `?query=${encodeURIComponent(query.trim())}` : "";
      const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/clientes/${cleanRfc}${qParam}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!resp.ok) return [];
      const data = await resp.json() as ClienteKontaia[];
      return Array.isArray(data) ? data : [];
    } catch (err: any) {
      console.warn(`[KontaiaClient] Error listando clientes de ${cleanRfc}:`, err.message || err);
      return [];
    }
  }

  /**
   * Busca un cliente receptor en KontaIA por nombre o RFC.
   */
  async buscarCliente(rfc: string, query: string): Promise<ClienteKontaia | null> {
    const lista = await this.listarClientes(rfc, query);
    return lista.length > 0 ? lista[0] : null;
  }

  /**
   * Guarda un nuevo cliente receptor en el catálogo de KontaIA.
   */
  async guardarCliente(tenantId: string, cliente: ClienteKontaia): Promise<ClienteKontaia | null> {
    const cleanTenant = tenantId.trim().toUpperCase();
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/clientes/${cleanTenant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(cliente)
      });
      if (!resp.ok) return null;
      const data = await resp.json() as { success: boolean; cliente: ClienteKontaia };
      return data.cliente || null;
    } catch (err: any) {
      console.warn(`[KontaiaClient] Error guardando cliente para ${cleanTenant}:`, err.message || err);
      return null;
    }
  }

  /**
   * Emite y timbra la factura vía KontaIA (utiliza el CSD y configuración de KontaIA).
   */
  async emitirYTimbrar(payload: SolicitudEmisionKontaia): Promise<ResultadoEmisionKontaia> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/facturacion/emitir-y-timbrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          ...payload,
          generar_pdf: payload.generar_pdf !== undefined ? payload.generar_pdf : true
        })
      });

      const data = await resp.json() as any;

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

      return data as ResultadoEmisionKontaia;
    } catch (err: any) {
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
  async descargarPdfBuffer(uuid: string): Promise<Buffer | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/cfdi/${uuid}/pdf`, {
        method: "GET"
      });
      if (!resp.ok) return null;
      const arrBuf = await resp.arrayBuffer();
      return Buffer.from(arrBuf);
    } catch (err) {
      return null;
    }
  }

  /**
   * Descarga el XML CFDI 4.0 oficial timbrado.
   */
  async descargarXmlBuffer(uuid: string): Promise<Buffer | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/cfdi/${uuid}/xml`, {
        method: "GET"
      });
      if (!resp.ok) return null;
      const text = await resp.text();
      return Buffer.from(text, "utf-8");
    } catch (err) {
      return null;
    }
  }
}

// Instancia singleton compartida
export const kontaiaClient = new KontaiaClient();
