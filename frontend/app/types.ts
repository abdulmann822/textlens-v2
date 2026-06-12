export interface OCRResult {
  text: string;
  word_count: number;
  char_count: number;
  confidence: number;
  pages: number;
  processing_time: number;
  file_info: {
    width?: number;
    height?: number;
    format?: string;
    total_pages?: number;
  };
}

export type ExportFormat = "txt" | "pdf" | "docx";
export type AppStatus = "idle" | "processing" | "done" | "error";
