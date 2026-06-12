"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { OCRResult, ExportFormat, AppStatus } from "./types";
import { extractText, exportText, checkHealth } from "./api";

/* ─── tiny SVG icons ─────────────────────────────────────────── */
const Icon = {
  Upload: () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Copy: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  Check: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Download: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  X: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  File: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  Scan: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
    </svg>
  ),
};

/* ─── helpers ────────────────────────────────────────────────── */
function fmtBytes(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/* ─── sub-components ─────────────────────────────────────────── */
function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 999,
      background: ok ? "var(--success-bg)" : "var(--error-bg)",
      color: ok ? "var(--success)" : "var(--error)",
      border: `1px solid ${ok ? "#a7f3d0" : "#fca5a5"}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? "var(--success)" : "var(--error)", display: "inline-block" }} />
      {ok ? "API Online" : "API Offline — start backend"}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", padding: "12px 16px", textAlign: "center",
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2800); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28,
      background: "#0f172a", color: "#fff",
      padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)", zIndex: 9999,
    }}>
      <span style={{ color: "#10b981" }}><Icon.Check /></span>
      {msg}
    </div>
  );
}

/* ─── main page ──────────────────────────────────────────────── */
export default function Home() {
  const [status, setStatus]         = useState<AppStatus>("idle");
  const [result, setResult]         = useState<OCRResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [file, setFile]             = useState<File | null>(null);
  const [preview, setPreview]       = useState<string | null>(null);
  const [progress, setProgress]     = useState(0);
  const [copied, setCopied]         = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const [exporting, setExporting]   = useState<ExportFormat | null>(null);
  const [editedText, setEditedText] = useState("");
  const [apiOk, setApiOk]           = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { checkHealth().then(setApiOk); }, []);

  const startProgress = useCallback(() => {
    setProgress(0);
    let v = 0;
    timerRef.current = setInterval(() => {
      v += Math.random() * 7 + 2;
      if (v >= 88) { v = 88; clearInterval(timerRef.current!); }
      setProgress(v);
    }, 320);
  }, []);

  const finishProgress = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
  }, []);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setFile(f);
    setResult(null);
    setError(null);
    setEditedText("");
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setStatus("processing");
    startProgress();
    try {
      const data = await extractText(f);
      finishProgress();
      setTimeout(() => {
        setResult(data);
        setEditedText(data.text);
        setStatus("done");
      }, 250);
    } catch (err) {
      finishProgress();
      setError(err instanceof Error ? err.message : "Processing failed");
      setStatus("error");
    }
  }, [startProgress, finishProgress]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/tiff": [".tiff", ".tif"],
      "image/bmp": [".bmp"],
      "image/webp": [".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    disabled: status === "processing",
  });

  const copy = () => {
    navigator.clipboard.writeText(editedText).then(() => {
      setCopied(true);
      setToast("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const doExport = async (fmt: ExportFormat) => {
    if (!editedText || !file) return;
    setExporting(fmt);
    try {
      await exportText(editedText, file.name.replace(/\.[^/.]+$/, ""), fmt);
      setToast(`Exported as .${fmt.toUpperCase()}`);
    } catch (e) {
      setToast(`Export failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setExporting(null);
    }
  };

  const reset = () => {
    setStatus("idle"); setResult(null); setError(null);
    setFile(null); setPreview(null); setProgress(0); setEditedText("");
  };

  /* ── render ── */
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <header style={{
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--border)", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            borderRadius: 10, padding: 6, color: "#fff", display: "flex",
          }}>
            <Icon.Scan />
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.03em" }}>
            Text<span style={{ background: "linear-gradient(135deg,#4f46e5,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Lens</span>
          </span>
        </div>
        <StatusBadge ok={apiOk} />
      </header>

      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #a855f7 100%)",
        padding: "48px 24px", textAlign: "center",
      }}>
        <h1 style={{ color: "#fff", fontSize: "clamp(1.6rem, 4vw, 2.6rem)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 12 }}>
          Extract Text from Images & PDFs
        </h1>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 15, maxWidth: 520, margin: "0 auto" }}>
          EasyOCR-powered · noise removal · skew correction · multi-page PDFs · export to TXT / PDF / DOCX
        </p>
      </div>

      {/* Main */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 16px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: result && status === "done" ? "1fr 1.35fr" : "1fr",
          gap: 20, alignItems: "start",
        }}>

          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Dropzone */}
            <div {...getRootProps()} style={{
              border: `2px dashed ${isDragActive ? "var(--primary)" : "var(--border)"}`,
              borderRadius: "var(--radius)", padding: "40px 24px", textAlign: "center",
              cursor: status === "processing" ? "not-allowed" : "pointer",
              background: isDragActive ? "var(--primary-light)" : "var(--surface)",
              transition: "all 0.2s",
              boxShadow: isDragActive ? "0 0 0 4px rgba(79,70,229,0.15)" : "var(--shadow)",
              opacity: status === "processing" ? 0.65 : 1,
            }}>
              <input {...getInputProps()} />
              <div style={{ color: isDragActive ? "var(--primary)" : "var(--muted)", marginBottom: 12 }}>
                <Icon.Upload />
              </div>
              {isDragActive ? (
                <p style={{ color: "var(--primary)", fontWeight: 700, fontSize: 16 }}>Drop to extract</p>
              ) : (
                <>
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Drop your file here</p>
                  <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>or click to browse</p>
                  <div style={{
                    display: "inline-block",
                    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                    color: "#fff", borderRadius: "var(--radius-sm)",
                    padding: "9px 22px", fontWeight: 600, fontSize: 14, pointerEvents: "none",
                  }}>
                    Choose File
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 14 }}>
                    JPG · PNG · TIFF · BMP · WebP · PDF &nbsp;·&nbsp; Max 50 MB
                  </p>
                </>
              )}
            </div>

            {/* Processing bar */}
            {status === "processing" && (
              <div className="fade-in" style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", padding: 20, boxShadow: "var(--shadow)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    border: "3px solid var(--primary-light)", borderTopColor: "var(--primary)",
                    animation: "spin 0.75s linear infinite", flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Extracting text…</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Running OCR pipeline</div>
                  </div>
                </div>
                <div style={{ background: "var(--primary-light)", borderRadius: 999, height: 7, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${progress}%`,
                    background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
                    borderRadius: 999, transition: "width 0.35s ease",
                  }} />
                </div>
                <div style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  {Math.round(progress)}%
                </div>
              </div>
            )}

            {/* Error */}
            {status === "error" && error && (
              <div className="fade-in" style={{
                background: "var(--error-bg)", border: "1px solid #fca5a5",
                borderRadius: "var(--radius)", padding: 18,
              }}>
                <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 4 }}>Extraction failed</div>
                <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>
                <button onClick={reset} style={{
                  marginTop: 12, fontSize: 12, color: "var(--error)", background: "none",
                  border: "1px solid #fca5a5", borderRadius: "var(--radius-sm)",
                  padding: "5px 14px", cursor: "pointer", fontWeight: 600,
                }}>Try again</button>
              </div>
            )}

            {/* File card */}
            {file && (
              <div className="fade-in" style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)",
              }}>
                <div style={{
                  padding: "10px 14px", borderBottom: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon.File />
                    <span style={{ fontWeight: 600, fontSize: 13, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{fmtBytes(file.size)}</span>
                    {status === "done" && (
                      <button onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", padding: 2 }}>
                        <Icon.X />
                      </button>
                    )}
                  </div>
                </div>
                {preview ? (
                  <div style={{ padding: 10, background: "var(--surface2)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Preview" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 8, display: "block" }} />
                  </div>
                ) : (
                  <div style={{ padding: "16px 14px", color: "var(--muted)", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                    <Icon.File />
                    PDF document — {result?.pages ?? "?"} page(s)
                  </div>
                )}
              </div>
            )}

            {/* Stats row */}
            {result && status === "done" && (
              <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                <Stat label="Words" value={result.word_count.toLocaleString()} />
                <Stat label="Chars" value={result.char_count.toLocaleString()} />
                <Stat label="Confidence" value={`${result.confidence}%`} />
                <Stat label="Time" value={`${result.processing_time}s`} />
              </div>
            )}
          </div>

          {/* Right column — results */}
          {result && status === "done" && (
            <div className="fade-in" style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)",
            }}>
              {/* Toolbar */}
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 0 3px #d1fae5" }} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Extracted Text</span>
                  {result.pages > 1 && (
                    <span style={{
                      background: "var(--primary-light)", color: "var(--primary)",
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    }}>{result.pages} pages</span>
                  )}
                </div>
                <button onClick={copy} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", border: `1px solid ${copied ? "#a7f3d0" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)",
                  background: copied ? "var(--success-bg)" : "var(--surface2)",
                  color: copied ? "var(--success)" : "var(--muted)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                }}>
                  {copied ? <Icon.Check /> : <Icon.Copy />}
                  {copied ? "Copied!" : "Copy all"}
                </button>
              </div>

              {/* Text area */}
              <textarea
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%", minHeight: 340, padding: "16px",
                  border: "none", outline: "none", resize: "vertical",
                  fontFamily: "'Consolas', 'Fira Code', 'SF Mono', monospace",
                  fontSize: 13, lineHeight: 1.75,
                  background: "var(--surface2)", color: "var(--text)", display: "block",
                }}
                placeholder="Extracted text appears here. You can edit before exporting."
              />

              {/* Export row */}
              <div style={{
                padding: "12px 16px", borderTop: "1px solid var(--border)",
                background: "var(--surface2)",
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginRight: 4 }}>Export:</span>
                {(["txt", "pdf", "docx"] as ExportFormat[]).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => doExport(fmt)}
                    disabled={exporting !== null}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "7px 16px", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: exporting === fmt ? "var(--primary-light)" : "var(--surface)",
                      color: exporting === fmt ? "var(--primary)" : "var(--text)",
                      fontSize: 12, fontWeight: 700, cursor: exporting ? "not-allowed" : "pointer",
                      opacity: exporting && exporting !== fmt ? 0.5 : 1,
                      textTransform: "uppercase" as const, letterSpacing: "0.05em",
                      transition: "all 0.15s",
                    }}
                  >
                    <Icon.Download />
                    {exporting === fmt ? "…" : fmt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* How it works — idle only */}
        {status === "idle" && (
          <section style={{ marginTop: 56 }}>
            <h2 style={{ textAlign: "center", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", marginBottom: 8 }}>
              How it works
            </h2>
            <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14, marginBottom: 32 }}>
              Four-step preprocessing pipeline before OCR runs
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {[
                { step: "01", title: "Noise Removal", desc: "OpenCV denoising clears speckles and compression artifacts." },
                { step: "02", title: "Skew Correction", desc: "Hough transform detects and corrects document tilt up to ±45°." },
                { step: "03", title: "Contrast Boost", desc: "CLAHE sharpens local contrast so text stands out clearly." },
                { step: "04", title: "EasyOCR Engine", desc: "Deep-learning OCR reads the cleaned image with high accuracy." },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", padding: "20px",
                  boxShadow: "var(--shadow)",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)", letterSpacing: "0.1em", marginBottom: 8 }}>{step}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{title}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer style={{
        borderTop: "1px solid var(--border)", marginTop: 60,
        padding: "18px 24px", textAlign: "center",
        color: "var(--muted)", fontSize: 12,
      }}>
        TextLens v2 · EasyOCR + PyMuPDF + FastAPI + Next.js
      </footer>
    </div>
  );
}
