/**
 * Types for the deep import `pdf-parse/lib/pdf-parse.js`. @types/pdf-parse only declares
 * the package root; we import the implementation directly to avoid the package's debug
 * harness (see lib/library-parse.ts).
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
