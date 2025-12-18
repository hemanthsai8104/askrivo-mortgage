// lib/vision/ocr.ts
import Tesseract from "tesseract.js";

/**
 * Extracts raw text from PDF buffer or Image buffer.
 */
export async function extractTextFromDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  // 1. Handle Images (OCR)
  if (mimeType.startsWith("image/")) {
    try {
      // Tesseract.recognize expects a Buffer or URL
      const { data: { text } } = await Tesseract.recognize(fileBuffer);
      return text || "";
    } catch (error) {
      console.error("Tesseract Error:", error);
      throw new Error("Failed to read image text.");
    }
  }

  // 2. Handle PDFs (Text Extraction)
  if (mimeType === "application/pdf") {
    // We use require to bypass TypeScript missing type definitions for pdf2json
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFParser = require("pdf2json");

    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser(null, 1); // 1 = text content only

      pdfParser.on("pdfParser_dataError", (errData: any) => {
        console.error(errData.parserError);
        reject(new Error("PDF Parsing Failed"));
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        // pdf2json returns URL-encoded text sometimes, decode it
        const rawText = pdfParser.getRawTextContent();
        resolve(decodeURIComponent(rawText));
      });

      // Parse the buffer
      try {
        pdfParser.parseBuffer(fileBuffer);
      } catch (e) {
        reject(e);
      }
    });
  }

  throw new Error("Unsupported file type. Please upload PDF or Image.");
}