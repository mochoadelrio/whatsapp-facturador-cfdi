import { DatosFiscales, DatosTicket } from "../types.js";

export interface TicketBatchItem {
  id: string;
  imagePath?: string;
  imageBuffer?: Buffer;
  ticket: DatosTicket;
  rawText?: string;
}

export interface StampedInvoiceResult {
  exito: boolean;
  emisor: string;
  serie?: string;
  folio?: string;
  uuid?: string;
  total: number;
  pdfPath?: string;
  xmlPath?: string;
  pdfBuffer?: Buffer;
  xmlBuffer?: Buffer;
  mensaje: string;
  ticketIds: string[];
}

export interface ConnectorBatchInput {
  tickets: TicketBatchItem[];
  perfil: DatosFiscales;
  onProgress?: (msg: string) => Promise<void> | void;
}
