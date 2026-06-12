import { OCRResult, ExportFormat } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function extractText(file: File): Promise<OCRResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/ocr`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let detail = `Server error (${res.status})`;
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  return res.json();
}

export async function exportText(
  text: string,
  filename: string,
  format: ExportFormat
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, filename }),
  });

  if (!res.ok) {
    let detail = "Export failed";
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
