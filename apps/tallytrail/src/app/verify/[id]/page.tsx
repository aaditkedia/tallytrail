"use client";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Fingerprint, ShieldCheck, XCircle } from "lucide-react";
import type { publicVerification } from "@/lib/service";
import { canonicalJson } from "@/lib/canonical";
import "../../tallytrail.css";
type Verification = Awaited<ReturnType<typeof publicVerification>>;

export default function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<Verification | null>(null);
  const [error, setError] = useState("");
  const [fileResult, setFileResult] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError(""); setFileResult(null);
    document.title = `Verify ${id} · TallyTrail`;
    fetch(`/api/verify/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setReport(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id]);
  async function checkPayload(file?: File) {
    if (!file || !report) return;
    try {
      if (file.size > 128 * 1024) throw new Error("Payload must be under 128 KB");
      const payload = JSON.parse(await file.text());
      if (payload.schema !== "tallytrail.report.v1" || !payload.input || !payload.calculation) throw new Error("Select the owner-exported hash payload");
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(payload)));
      const computed = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
      setFileResult(computed === report.hash ? "MATCH: shared evidence payload matches the saved receipt." : "MISMATCH: this payload differs from the saved receipt.");
    } catch (e) { setFileResult(e instanceof Error ? e.message : "Could not verify payload"); }
  }
  return <div className="tt-shell" style={{ minHeight: "100vh", padding: "40px 20px" }}><div style={{ maxWidth: 680, margin: "auto" }}><a href="/" className="tt-text-button"><ArrowLeft size={16} /> Back to TallyTrail</a><section className="tt-panel" style={{ marginTop: 24, padding: "30px" }}><div className="tt-verify-icon"><ShieldCheck size={35} /></div><div className="tt-eyebrow" style={{ textAlign: "center" }}>PUBLIC VERIFICATION RECEIPT</div><h1 style={{ fontFamily: "Georgia,serif", fontSize: 30, textAlign: "center", fontWeight: 400 }}>A clear trail for {id}.</h1>{error ? <div role="alert" className="tt-alert error" style={{ marginTop: 24 }}>{error}</div> : !report ? <p style={{ textAlign: "center", padding: 30 }}>Checking the local receipt…</p> : <><div role={report.matches ? "status" : "alert"} className={`tt-alert ${report.matches ? "" : "error"}`} style={{ marginTop: 24 }}>{report.matches ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {report.matches ? "Saved report hash matches the recomputed payload." : "Integrity check failed. The stored payload changed."}</div><div className="tt-review-total"><span>{report.periodStart} — {report.periodEnd}</span><strong>{report.totalKg.toLocaleString("en-US", { maximumFractionDigits: 2 })} <small>kg CO₂e</small></strong><p>Scope 1: {report.scope1Kg.toFixed(2)} kg · Scope 2: {report.scope2Kg.toFixed(2)} kg</p></div><div className="tt-hash-card"><Fingerprint size={20} /><div><strong>Saved SHA-256 fingerprint</strong><code>{report.hash}</code><small>{report.factorVersion}</small></div></div><p style={{ fontSize: 12, color: "#596c4d", lineHeight: 1.9 }}>{report.note}</p><div className="tt-info-box" style={{ margin: "20px 0" }}><strong>{report.inputMode === "synthetic" ? "Synthetic demonstration data." : "User-entered evidence."}</strong> {report.chain?.status === "submitted" && report.chain.signature ? <>This report was confirmed by its owner and recorded with <code>submit_report</code> on Solana {report.chain.network ?? "devnet"}: <a href={report.chain.explorerUrl ?? `https://explorer.solana.com/tx/${report.chain.signature}?cluster=devnet`} target="_blank" rel="noreferrer">view transaction on Solana Explorer</a>. </> : <>This report was confirmed locally. Blockchain status: <strong>not submitted</strong>. No transaction signature exists. </>}This check cannot establish the truth of bills or emissions claims.</div><h2 className="tt-section-title">Independently check a shared payload</h2><p style={{ fontSize: 12, color: "#5e7052", marginBottom: 13 }}>Ask the report owner for its exported hash payload, then select it here. SHA-256 is recomputed in your browser. The file is never uploaded.</p><label className="tt-file-link" style={{ border: "1px dashed #d1dfc4", padding: 16, borderRadius: 7 }}><Download size={17} /> Select exported payload JSON<input type="file" className="tt-visually-hidden" aria-label="Select owner-exported payload JSON" accept="application/json,.json" onChange={e => { void checkPayload(e.target.files?.[0]); e.target.value = ""; }} /></label>{fileResult && <div role="status" className={`tt-alert ${fileResult.startsWith("MATCH:") ? "" : "error"}`} style={{ marginTop: 15 }}>{fileResult}</div>}</>}</section><p style={{ marginTop: 20, fontSize: 12, textAlign: "center", color: "#5e7052" }}>TallyTrail · Local proof of concept · not certified carbon accounting</p></div></div>;
}
