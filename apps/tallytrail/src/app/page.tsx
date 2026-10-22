"use client";
import { KHero } from "./_khero/KHero";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, BadgeCheck, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, ExternalLink, FileCheck2, FileText, Fingerprint, Flame, LayoutDashboard, Leaf, LoaderCircle, Plus, ScanLine, ShieldCheck, Sparkles, Sprout, Upload, X, Zap } from "lucide-react";
import { SwarmTimeline, StatusBadge } from "@hackathon/ui";
import { GRID_FACTORS } from "@/lib/factors";
import type { Report, ReportInput, Offset } from "@/lib/domain";
import { SAMPLE_REPORT } from "@/lib/sample";
import { reportInputSchema } from "@/lib/input";
import type { EvidenceEntry, EvidenceMetadata } from "@/lib/evidence";
import type { Extraction } from "@/lib/vision-contract";
import "./tallytrail.css";

const format = (n: number, digits = 1) => n.toLocaleString("en-US", { maximumFractionDigits: digits });
const shortDate = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.issues ? `${result.error}: ${result.issues.map((i: { path: string; message: string }) => `${i.path} ${i.message}`).join("; ")}` : result.error);
  return result as T;
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function HomeApp() {
  const [tab, setTab] = useState("Overview");
  const [reports, setReports] = useState<Report[]>([]);
  const [offsets, setOffsets] = useState<Offset[]>([]);
  const [input, setInput] = useState<ReportInput>(structuredClone(SAMPLE_REPORT));
  const [active, setActive] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [credit, setCredit] = useState({ registry: "Demo registry", serial: "DEMO-2026-001", tonnes: 1, beneficiary: "Juniper Bakery (synthetic)", acknowledged: false });
  const [lookup, setLookup] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);
  const [storageConsent, setStorageConsent] = useState(false);
  const [extractionConsent, setExtractionConsent] = useState(false);
  const [visionReady, setVisionReady] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const billInput = useRef<HTMLInputElement>(null);
  const builder = useRef<HTMLDivElement>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const actionRunning = useRef(false);
  const refresh = async () => {
    const state = await api<{ reports: Report[]; offsets: Offset[] }>("/api/reports");
    setReports(state.reports); setOffsets(state.offsets);
  };
  const refreshEvidence = async () => {
    const state = await api<{ vision: { configured: boolean }; evidence: EvidenceEntry[] }>("/api/evidence");
    setVisionReady(state.vision.configured); setEvidence(state.evidence);
  };
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  useEffect(() => { refreshEvidence().catch(e => { setVisionReady(false); setError(e.message); }); }, []);
  const reviewOpen = Boolean(active);
  useEffect(() => {
    if (!reviewOpen) return;
    const dialog = reviewDialog.current;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close(); document.body.style.overflow = oldOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [reviewOpen]);
  useEffect(() => { document.title = `${tab} · TallyTrail`; }, [tab]);
  const confirmed = reports.filter(r => r.status === "confirmed");
  const total = confirmed.reduce((sum, r) => sum + r.calculation.totalKg, 0);
  const scope1 = confirmed.reduce((sum, r) => sum + r.calculation.scope1Kg, 0);
  const scope2 = confirmed.reduce((sum, r) => sum + r.calculation.scope2Kg, 0);
  const warnings = reports.filter(r => r.status === "draft").reduce((sum, r) => sum + r.flags.length, 0);
  const act = async (work: () => Promise<void>) => {
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); } finally { actionRunning.current = false; setBusy(false); }
  };
  const loadSample = () => { setInput(structuredClone(SAMPLE_REPORT)); setTab("Overview"); setNotice("Synthetic bakery sample loaded. Review the quantities, then analyze."); builder.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const analyze = () => act(async () => {
    const validated = reportInputSchema.safeParse(input);
    if (!validated.success) throw new Error(validated.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    const draft = await api<Report>("/api/reports", validated.data);
    setActive(draft); setAcknowledged(false); await refresh();
  });
  const confirm = () => act(async () => {
    if (!active) return;
    const report = await api<Report>(`/api/reports/${active.id}/confirm`, { acknowledged });
    setActive(report);
    setNotice(report.chain.status === "submitted"
      ? `Report confirmed. Devnet transaction: ${report.chain.signature}`
      : report.chain.detail || "Report confirmed. Verification receipt is ready.");
    await refresh();
  });
  const importFile = (file?: File) => act(async () => {
    if (!file) return;
    if (file.size > 64 * 1024) throw new Error("JSON sample must be under 64 KB.");
    const raw = JSON.parse(await file.text());
    const validated = reportInputSchema.safeParse(raw);
    if (!validated.success) throw new Error(`Invalid bill JSON: ${validated.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    setInput(validated.data); setNotice(`Imported ${file.name}. Fields are user-supplied; no vision extraction was performed.`);
  });
  const attachFingerprint = (file?: File) => act(async () => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error("Evidence file must be under 10 MB.");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(n => n.toString(16).padStart(2, "0")).join("");
    setInput(value => ({ ...value, evidenceSha256: hash, inputMode: "manual" })); setNotice(`Fingerprint attached for ${file.name}. The file stays on your device. Enter its quantities below.`);
  });
  const uploadEvidence = () => act(async () => {
    if (!billFile || !storageConsent) throw new Error("Select a bill and consent to private local storage first.");
    if (billFile.size > 4 * 1024 * 1024) throw new Error("Bill file must be up to 4 MiB.");
    const form = new FormData(); form.set("file", billFile); form.set("region", input.region); form.set("storageConsent", "true"); form.set("extractionConsent", String(extractionConsent));
    const response = await fetch("/api/evidence", { method: "POST", body: form });
    const result = await response.json() as { error?: string; issues?: { path: string; message: string }[]; evidence: EvidenceMetadata; extraction: Extraction | null; message: string };
    if (!response.ok) throw new Error(result.issues ? `${result.error}: ${result.issues.map(i => i.message).join("; ")}` : result.error || "Upload failed");
    setInput(value => result.extraction ? result.extraction.input : { ...value, evidenceSha256: result.evidence.sha256, inputMode: "manual" });
    setStorageConsent(false); setExtractionConsent(false); setBillFile(null);
    if (billInput.current) billInput.current.value = "";
    await refreshEvidence();
    setNotice(result.extraction ? "Gemini extraction loaded into the form. Check every quantity, unit and date against your bill before analyzing. No report was created." : result.message);
  });
  const removeEvidence = (id: string) => void act(async () => {
    const response = await fetch(`/api/evidence/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error((await response.json()).error || "Could not delete private file");
    await refreshEvidence(); setNotice("Private original deleted. Existing report fingerprints are retained.");
  });
  const editAsNew = (report: Report) => {
    setInput(structuredClone(report.input)); setActive(null); setTab("Overview"); setAcknowledged(false);
    setNotice("Report fields copied into a new draft form. Change the period or other incorrect fields before analyzing. The original report is preserved.");
    setTimeout(() => builder.current?.scrollIntoView({ behavior: "smooth" }), 0);
  };
  const discard = () => void act(async () => {
    if (!active || active.status !== "draft") return;
    const response = await fetch(`/api/reports/${active.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error((await response.json()).error || "Could not discard draft");
    setActive(null); await refresh(); setNotice("Draft discarded. Confirmed reports and original files are preserved.");
  });

  return <div className="tt-shell">
    <aside className="tt-sidebar">
      <a href="/" className="tt-logo"><span><Sprout size={25} /></span>TallyTrail<span className="tt-logo-dot">.</span></a>
      <div className="tt-workspace"><span className="tt-avatar">J</span><div><strong>Your workspace</strong><small>Local demonstration</small></div><ChevronRight size={15} /></div>
      <div className="tt-nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{[
        { label: "Overview", Icon: LayoutDashboard }, { label: "Reports", Icon: FileText }, { label: "Offset ledger", Icon: Leaf }, { label: "Verification", Icon: ShieldCheck }, { label: "Methodology", Icon: CircleHelp },
      ].map(({ label, Icon }) => <button key={label} aria-label={label} aria-current={tab === label ? "page" : undefined} className={tab === label ? "tt-nav active" : "tt-nav"} onClick={() => { setTab(label); setError(""); setNotice(""); }}><Icon size={19} /><span>{label}</span>{label === "Reports" && <small>{reports.length}</small>}</button>)}</nav>
      <div className="tt-sidebar-card"><span className="tt-circle-icon"><Leaf size={19} /></span><strong>Small footprint.<br />Clearer future.</strong><p>Build an evidence trail for every number you report.</p><button onClick={() => setTab("Methodology")}>Explore the methodology <ArrowRight size={14} /></button></div>
      <div className="tt-sidebar-bottom"><span className="tt-avatar small">AK</span><div><strong>Owner demo</strong><small>Deterministic review steps · optional devnet anchor</small></div><span className="tt-online" /></div>
    </aside>

    <a className="tt-skip-link" href="#tt-main-content">Skip to main content</a><main className="tt-main" id="tt-main-content">
      <header className="tt-topbar"><div>Workspace <ChevronRight size={14} /><strong>{tab}</strong></div><span className="tt-environment"><span /> PoC · devnet optional</span></header>
      <div className="tt-content">
        <div className="tt-page-heading"><div><div className="tt-eyebrow">CARBON ACCOUNTING, WITH A PAPER TRAIL</div><h1>{tab === "Overview" ? "Your impact, made clear." : tab === "Offset ledger" ? "One credit. One claim." : tab === "Verification" ? "Trust starts with evidence." : tab === "Methodology" ? "Every number has a source." : "Your emissions reports."}</h1><p>{tab === "Overview" ? "Turn everyday energy use into emissions you can understand and verify." : "Transparent calculations. Human review. An honest record of what is verified."}</p></div><button className="tt-button primary" aria-label="Create a new report" disabled={busy} onClick={() => { setInput({ business: "", region: input.region, periodStart: "", periodEnd: "", inputMode: "manual", lineItems: [{ kind: "electricity", label: "Purchased electricity", amount: 0, unit: "kWh" }, { kind: "natural_gas", label: "Natural gas", amount: 0, unit: "therm" }] }); setTab("Overview"); setTimeout(() => builder.current?.scrollIntoView({ behavior: "smooth" }), 0); }}><Plus size={17} /> New report</button></div>
        {error && <div role="alert" className="tt-alert error"><ShieldCheck size={18} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
        {notice && <div role="status" className="tt-alert"><CheckCircle2 size={18} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}

        {tab === "Overview" && <>
          <section className="tt-hero"><div><span className="tt-hero-tag"><Sparkles size={14} /> A BETTER STARTING POINT</span><h2>Your bills tell a story.<br />Let’s make it count.</h2><p>Bring your energy data. We’ll show the math,<br className="tt-desktop" /> flag the gaps, and keep the evidence together.</p><button onClick={loadSample}>Try a sample report <ArrowRight size={16} /></button><span className="tt-hero-note">Synthetic data · no account or API key needed</span></div><div className="tt-hero-visual" aria-hidden="true"><div className="tt-orbit orbit-one" /><div className="tt-orbit orbit-two" /><span className="tt-float leaf"><Leaf size={22} /></span><span className="tt-float bolt"><Zap size={20} /></span><div className="tt-paper"><div className="tt-paper-top"><span><Sprout size={16} /> TallyTrail</span><BadgeCheck size={20} /></div><small>EMISSIONS SUMMARY</small><b>1,634.9 <em>kg CO₂e</em></b><span className="tt-paper-label">Illustrative bakery sample</span><div className="tt-mini-bars">{[35, 48, 40, 62, 50, 72, 55, 83, 65, 95, 72, 58].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div><div className="tt-paper-bottom"><span><Check size={11} /> Evidence → factors → review</span></div></div><div className="tt-proof-tag"><ShieldCheck size={18} /><div><strong>Built for transparency</strong><small>See the source behind every factor</small></div></div></div></section>
          <section className="tt-metrics" aria-label="Workspace totals">
            <Metric label="Confirmed emissions" value={`${format(total / 1000, 3)}`} suffix="t CO₂e" detail="Gross emissions · local reports" Icon={Leaf} />
            <Metric label="Scope 1 / Scope 2" value={`${format(scope1)} / ${format(scope2)}`} suffix="kg" detail="Direct fuel / purchased electricity" Icon={Zap} />
            <Metric label="Confirmed reports" value={String(confirmed.length).padStart(2, "0")} detail={`${reports.length - confirmed.length} awaiting human review`} Icon={FileCheck2} />
            <Metric label="Review flags" value={String(warnings).padStart(2, "0")} detail="Across draft reports" Icon={ScanLine} />
          </section>
          <div className="tt-main-grid">
            <section className="tt-panel tt-builder" ref={builder}><div className="tt-panel-heading"><div><h2>Build your evidence trail</h2><p>A few details. A traceable calculation.</p></div><span className="tt-step-pill">01 / 03</span></div>
              <div className="tt-input-mode"><button onClick={() => fileInput.current?.click()}><Upload size={21} /><strong>Import structured bill data</strong><span>JSON sample · up to 64 KB <ArrowRight size={13} /></span></button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /><a href="/samples/bakery-bill.json" download><ArrowDownToLine size={14} /> Get sample</a></div>
              <p className="tt-subtle-note">Enter quantities manually, import JSON, or optionally upload a bill below. Extraction never confirms a report.</p>
              <details className="tt-bill-upload"><summary><Upload size={16} /> Private bill upload & optional extraction</summary><div><p>PDF, JPEG, PNG or WebP · one file up to 4 MiB. Copies are stored privately on this machine. Gemini extraction is {visionReady ? "configured, not live-verified" : "disabled on this server"}.</p><input ref={billInput} disabled={busy} aria-label="Select private bill file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { setBillFile(e.target.files?.[0] ?? null); setStorageConsent(false); setExtractionConsent(false); }} /><label className="tt-checkbox"><input type="checkbox" disabled={busy} checked={storageConsent} onChange={e => setStorageConsent(e.target.checked)} /><span>Store this bill privately on this machine until I delete it.</span></label><label className="tt-checkbox"><input type="checkbox" checked={extractionConsent} disabled={busy || !visionReady} onChange={e => setExtractionConsent(e.target.checked)} /><span>Send this file to Google Gemini for extraction. This may incur API charges and sends bill contents outside this machine. I will review all returned fields.</span></label><button className="tt-button secondary" aria-label={extractionConsent ? "Upload and extract bill for review" : "Upload bill privately for manual entry"} disabled={busy || !billFile || !storageConsent} onClick={uploadEvidence}>{busy ? <LoaderCircle size={15} className="tt-spin" /> : <Upload size={15} />}{extractionConsent ? "Upload & extract for review" : "Upload privately · manual entry"}</button><EvidenceLibrary entries={evidence} busy={busy} onDelete={removeEvidence} /></div></details>
              <div className="tt-form-grid"><label>Business name<input value={input.business} disabled={busy} maxLength={80} onChange={e => setInput({ ...input, business: e.target.value })} /></label><label>Electric grid region<select disabled={busy} value={input.region} onChange={e => setInput({ ...input, region: e.target.value as ReportInput["region"] })}>{Object.entries(GRID_FACTORS).map(([key, region]) => <option key={key} value={key}>{region.name} ({key})</option>)}</select></label><label>Period starts<input disabled={busy} type="date" value={input.periodStart} onChange={e => setInput({ ...input, periodStart: e.target.value })} /></label><label>Period ends<input disabled={busy} type="date" value={input.periodEnd} onChange={e => setInput({ ...input, periodEnd: e.target.value })} /></label></div>
              <p className="tt-subtle-note">Confirm your utility’s eGRID region. ZIP lookup is not implemented.</p>
              <div className="tt-line-items">{input.lineItems.map((item, index) => <div className="tt-line-item" key={index}><span className={`tt-source-icon ${item.kind === "electricity" ? "electric" : "gas"}`}>{item.kind === "electricity" ? <Zap size={18} /> : <Flame size={18} />}</span><label><span>{item.kind === "electricity" ? "Purchased electricity" : item.kind === "natural_gas" ? "Natural gas" : "Stationary diesel"}</span><input disabled={busy} aria-label={`Evidence label ${index + 1}`} value={item.label} onChange={e => setInput({ ...input, lineItems: input.lineItems.map((l, i) => i === index ? { ...l, label: e.target.value } : l) })} /></label><div className="tt-quantity"><input disabled={busy} aria-label={`${item.kind} quantity`} type="number" min="0.001" step="any" value={item.amount} onChange={e => setInput({ ...input, lineItems: input.lineItems.map((l, i) => i === index ? { ...l, amount: Number(e.target.value) } : l) })} /><span>{item.unit === "therm" ? "therms" : item.unit}</span></div><button aria-label={`Remove line ${index + 1}`} className="tt-icon-button" disabled={busy || input.lineItems.length === 1} onClick={() => setInput({ ...input, lineItems: input.lineItems.filter((_, i) => i !== index) })}><X size={14} /></button></div>)}</div>
              <div className="tt-line-actions"><label className="tt-add-line">Add energy source<select aria-label="Add energy source" value="" disabled={busy || input.lineItems.length >= 30} onChange={e => { const kind = e.target.value; const line: ReportInput["lineItems"][number] = kind === "electricity" ? { kind: "electricity", label: "Purchased electricity", amount: 0, unit: "kWh" } : kind === "natural_gas" ? { kind: "natural_gas", label: "Natural gas", amount: 0, unit: "therm" } : { kind: "stationary_diesel", label: "Stationary generator fuel", amount: 0, unit: "gallon" }; setInput({ ...input, lineItems: [...input.lineItems, line] }); }}><option value="" disabled>Select a source…</option><option value="electricity">Electricity · kWh</option><option value="natural_gas">Natural gas · therms</option><option value="stationary_diesel">Stationary diesel · gallons</option></select></label><label className="tt-file-link"><Fingerprint size={14} />{input.evidenceSha256 ? "Replace evidence fingerprint" : "Attach evidence fingerprint"}<input className="tt-visually-hidden" disabled={busy} aria-label="Attach a file fingerprint without uploading" type="file" accept="image/*,application/pdf" onChange={e => { void attachFingerprint(e.target.files?.[0]); e.target.value = ""; }} /></label>{input.evidenceSha256 && <button disabled={busy} onClick={() => { const { evidenceSha256: ignored, ...rest } = input; setInput(rest); }}>Remove fingerprint</button>}</div>
              <label className="tt-checkbox"><input disabled={busy} type="checkbox" checked={input.inputMode === "synthetic"} onChange={e => setInput({ ...input, inputMode: e.target.checked ? "synthetic" : "manual" })} /><span>This is synthetic demonstration data</span></label>
              <div className="tt-builder-footer"><span><ShieldCheck size={15} /> Calculation runs locally.</span><button className="tt-button primary" onClick={analyze} disabled={busy}>{busy ? <LoaderCircle size={16} className="tt-spin" /> : <Sparkles size={16} />} Analyze evidence <ArrowRight size={15} /></button></div>
            </section>
            <div className="tt-right-column"><section className="tt-panel"><div className="tt-panel-heading"><div><h2>From evidence to confidence</h2><p>A deliberate checkpoint at every step.</p></div></div><ol className="tt-process"><li><span><FileText size={19} /></span><div><strong>Start with your evidence</strong><p>Bill quantities and optional file fingerprint.</p></div><small>01</small></li><li><span><Zap size={19} /></span><div><strong>Calculate with EPA factors</strong><p>Every factor, unit and formula is visible.</p></div><small>02</small></li><li><span><ClipboardCheck size={19} /></span><div><strong>Review, then confirm</strong><p>Auditor flags stay in the decision trail.</p></div><small>03</small></li><li><span><ShieldCheck size={19} /></span><div><strong>Share a verification receipt</strong><p>A reproducible hash, with privacy in mind.</p></div><small>04</small></li></ol></section><section className="tt-integration"><span className="tt-source-icon"><Fingerprint size={23} /></span><h3>Honest about the chain.</h3><p>After you confirm a full-calendar-month report, the server can call the Anchor <code>submit_report</code> instruction on Solana devnet when wallet and program env vars are set. Duplicates fail on-chain via the report PDA.</p><button onClick={() => setTab("Methodology")}>View readiness <ArrowRight size={14} /></button><span className="tt-integration-status"><i /> Devnet wiring via env vars</span></section></div>
          </div>
          <ReportList reports={reports.slice(-4).reverse()} onOpen={report => { setActive(report); setAcknowledged(false); }} onAll={() => setTab("Reports")} />
        </>}

        {tab === "Reports" && <ReportList reports={[...reports].reverse()} onOpen={report => { setActive(report); setAcknowledged(false); }} />}
        {tab === "Offset ledger" && <div className="tt-main-grid"><section className="tt-panel"><div className="tt-panel-heading"><div><h2>Record a demo retirement</h2><p>Duplicate registry + serial claims are rejected locally.</p></div><Leaf size={23} /></div><div className="tt-info-box">These entries do not retire real credits. There is no registry integration or blockchain transaction, and they never reduce reported gross emissions.</div><form onSubmit={e => { e.preventDefault(); void act(async () => { await api("/api/offsets", credit); await refresh(); setNotice("Demo retirement recorded. Try the same serial again to see duplicate protection."); }); }} className="tt-credit-form"><label>Registry<input required value={credit.registry} onChange={e => setCredit({ ...credit, registry: e.target.value })} /></label><label>Credit serial<input required value={credit.serial} onChange={e => setCredit({ ...credit, serial: e.target.value })} /></label><div className="tt-form-grid"><label>Tonnes CO₂e<input type="number" required min="0.001" step="0.001" value={credit.tonnes} onChange={e => setCredit({ ...credit, tonnes: Number(e.target.value) })} /></label><label>Beneficiary<input required value={credit.beneficiary} onChange={e => setCredit({ ...credit, beneficiary: e.target.value })} /></label></div><label className="tt-checkbox"><input type="checkbox" required checked={credit.acknowledged} onChange={e => setCredit({ ...credit, acknowledged: e.target.checked })} /><span>I understand this records a local demonstration, not a real offset retirement.</span></label><button className="tt-button primary" type="submit" disabled={busy || !credit.acknowledged}>Record demo retirement <ArrowRight size={16} /></button></form></section><section className="tt-panel"><div className="tt-panel-heading"><div><h2>Retirement ledger</h2><p>{offsets.length} local record(s)</p></div></div>{!offsets.length ? <Empty text="Your local retirement records will appear here." /> : offsets.map(o => <div className="tt-offset-row" key={o.id}><span className="tt-source-icon"><Leaf size={18} /></span><div><strong>{o.serial}</strong><p>{o.registry} · {o.beneficiary}</p><small>Demo record · {o.id}</small></div><b>{format(o.tonnes, 3)} t</b></div>)}</section></div>}
        {tab === "Verification" && <section className="tt-panel tt-verify-intro"><span className="tt-verify-icon"><ShieldCheck size={34} /></span><h2>A receipt anyone can inspect.</h2><p>Open a confirmed report to check its saved SHA-256 fingerprint.<br />The public response omits business identity and raw bill details.</p><form onSubmit={e => { e.preventDefault(); if (lookup.trim()) window.location.href = `/verify/${encodeURIComponent(lookup.trim())}`; }}><label>Report ID<input placeholder="TT-…" required value={lookup} onChange={e => setLookup(e.target.value)} /></label><button className="tt-button primary">Verify report <ArrowRight size={16} /></button></form><small>Public hash check. Devnet explorer link appears when a report was submitted on-chain.</small></section>}
        {tab === "Methodology" && <Methodology />}
        <footer className="tt-footer"><span><Sprout size={14} /> TallyTrail · trace the numbers, understand the impact.</span><span>Local proof of concept · not certified carbon accounting</span></footer>
      </div>
    </main>

    {active && <dialog ref={reviewDialog} className="tt-modal" aria-labelledby="report-title" onCancel={event => { if (busy) event.preventDefault(); else setActive(null); }} onClick={event => { if (!busy && event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setActive(null); } }}><div className="tt-modal-header"><span><FileCheck2 size={21} /> Report review</span><button className="tt-icon-button" disabled={busy} aria-label="Close report" onClick={() => setActive(null)}><X size={20} /></button></div><div className="tt-modal-body"><div className="tt-review-title"><div><span className="tt-eyebrow">{active.id}</span><h2 id="report-title">{active.input.business}</h2><p>{shortDate(active.input.periodStart)} – {shortDate(active.input.periodEnd)} · {active.input.region}</p></div><StatusBadge tone={active.status === "confirmed" ? "green" : "amber"}>{active.status === "confirmed" ? (active.chain.status === "submitted" ? "Confirmed · devnet" : "Confirmed") : "Needs your review"}</StatusBadge></div><div className="tt-review-total"><span>Total gross emissions</span><strong>{format(active.calculation.totalKg, 2)} <small>kg CO₂e</small></strong><p>Scope 1: {format(active.calculation.scope1Kg, 2)} kg · Scope 2: {format(active.calculation.scope2Kg, 2)} kg</p></div><h3 className="tt-section-title">The math, line by line</h3>{active.calculation.lines.map((line, index) => <div className="tt-calculation-line" key={index}><div><strong>{line.label}</strong><span>Scope {line.scope} · {format(line.amount)} {line.unit} × {format(line.value, 8)} kg CO₂e/{line.unit}</span><a href={line.source} target="_blank" rel="noreferrer">{line.sourceLabel} <ExternalLink size={11} /></a><small>Factor derivation: {line.derivation}</small></div><b>{format(line.kgCo2e, 2)} kg</b></div>)}<h3 className="tt-section-title">Auditor findings</h3>{active.flags.map((flag, i) => <div className={`tt-flag ${flag.severity}`} key={i}><ShieldCheck size={16} /><p><strong>{flag.severity === "blocking" ? "Blocked" : "Review"}</strong> {flag.message}</p></div>)}<div className="tt-timeline-wrap"><SwarmTimeline title="Deterministic review pipeline · not AI agents" steps={active.steps.map((step, i) => ({ id: `${active.id}-${i}`, seq: i + 1, name: step.agent, detail: step.detail, status: step.status === "pending" ? "awaiting_approval" : "completed", durationMs: step.durationMs }))} /></div><div className="tt-hash-card"><Fingerprint size={19} /><div><strong>SHA-256 · evidence + calculation</strong><code>{active.hash}</code><small>{active.chain.status === "submitted" && active.chain.explorerUrl ? <>Devnet tx: <a href={active.chain.explorerUrl} target="_blank" rel="noreferrer">Solana Explorer</a></> : active.chain.detail || "No devnet transaction for this report."}</small></div></div>{error && <div className="tt-alert error" role="alert">{error}</div>}{active.status === "draft" ? <><label className="tt-checkbox tt-review-ack"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /><span>I reviewed the evidence, selected region, units, calculations and all flags. I understand this is an uncertified local prototype.</span></label><div className="tt-draft-actions"><button className="tt-button secondary" disabled={busy} onClick={() => editAsNew(active)}>Copy & correct fields</button><button className="tt-button secondary" disabled={busy} onClick={discard}>Discard draft</button></div><button className="tt-button primary tt-full" disabled={busy || !acknowledged || active.flags.some(f => f.severity === "blocking")} onClick={confirm}>{busy ? <LoaderCircle size={17} className="tt-spin" /> : <CheckCircle2 size={17} />} Confirm local report</button></> : <div className="tt-report-actions"><a className="tt-button primary" href={`/verify/${active.id}`}>Open verification <ExternalLink size={15} /></a><button className="tt-button secondary" onClick={() => download(`${active.id}.json`, { schema: "tallytrail.report.v1", input: active.input, calculation: active.calculation })}><ArrowDownToLine size={15} /> Export hash payload</button></div>}</div></dialog>}
  </div>;
}

function Metric({ label, value, suffix, detail, Icon }: { label: string; value: string; suffix?: string; detail: string; Icon: typeof Leaf }) {
  return <div className="tt-metric"><div><span>{label}</span><Icon size={17} /></div><strong>{value} <small>{suffix}</small></strong><p>{detail}</p></div>;
}
function Empty({ text }: { text: string }) { return <div className="tt-empty"><FileText size={28} /><strong>A clean slate.</strong><p>{text}</p></div>; }
function EvidenceLibrary({ entries, busy, onDelete }: { entries: EvidenceEntry[]; busy: boolean; onDelete: (id: string) => void }) {
  return <section className="tt-private-library" aria-label="Saved private originals"><h3>Saved private originals ({entries.length})</h3><p>These files remain available after reloading. Deleting an original preserves existing report fingerprints.</p>{!entries.length ? <p>No private originals stored.</p> : entries.map(entry => <div className="tt-evidence-record" key={entry.id}><strong>{entry.metadata ? `${entry.metadata.mime} · ${Math.ceil(entry.metadata.bytes / 1024)} KB · ${new Date(entry.metadata.storedAt).toLocaleDateString()}` : "Original with damaged or missing metadata"}</strong><small>File {entry.id}</small>{entry.metadata && <code>{entry.metadata.sha256}</code>}{!entry.available && <span role="status">This original needs attention. Download is unavailable; you can still delete it.</span>}{entry.available && <a aria-label={`Download original ${entry.id}`} href={`/api/evidence/${entry.id}`} download>Download original</a>}<button disabled={busy} aria-label={`Delete original ${entry.id}`} onClick={() => onDelete(entry.id)}>Delete original</button></div>)}</section>;
}
function ReportList({ reports, onOpen, onAll }: { reports: Report[]; onOpen: (report: Report) => void; onAll?: () => void }) {
  return <section className="tt-panel tt-report-list"><div className="tt-panel-heading"><div><h2>Recent reports</h2><p>Your numbers, with the evidence attached.</p></div>{onAll && <button className="tt-text-button" onClick={onAll}>View all reports <ArrowRight size={15} /></button>}</div>{!reports.length ? <Empty text="Analyze your first bill to start building an emissions history." /> : <div className="tt-table-wrap"><table><thead><tr><th>REPORT / BUSINESS</th><th>REPORTING PERIOD</th><th>GROSS EMISSIONS</th><th>STATUS</th><th><span className="tt-visually-hidden">Review</span></th></tr></thead><tbody>{reports.map(report => <tr key={report.id}><td><div className="tt-report-name"><span className="tt-source-icon"><FileText size={18} /></span><div><strong>{report.input.business}</strong><small>{report.id} · {report.input.inputMode === "synthetic" ? "Synthetic data" : "Entered data"}</small></div></div></td><td>{shortDate(report.input.periodStart)}<small>to {shortDate(report.input.periodEnd)}</small></td><td><strong>{format(report.calculation.totalKg, 2)}</strong> <span className="tt-muted">kg CO₂e</span></td><td><StatusBadge tone={report.status === "confirmed" ? "green" : "amber"}>{report.status === "confirmed" ? "Confirmed locally" : "Review required"}</StatusBadge></td><td><button aria-label={`Review ${report.id}`} className="tt-icon-button" onClick={() => onOpen(report)}><ArrowRight size={18} /></button></td></tr>)}</tbody></table></div>}</section>;
}
function Methodology() {
  return <div className="tt-method-grid">{[
    { title: "Scope 1 · stationary combustion", icon: <Flame size={24} />, body: "Natural gas uses EPA Table 1 factors with 0.1 MMBtu per therm. Stationary diesel uses Distillate Fuel Oil No. 2 per-gallon factors. CH₄ and N₂O are converted using AR5 100-year GWPs of 28 and 265. Vehicle fuel is not supported.", link: "https://www.epa.gov/system/files/documents/2025-01/ghg-emission-factors-hub-2025.pdf", label: "EPA 2025 GHG Emission Factors Hub" },
    { title: "Scope 2 · purchased electricity", icon: <Zap size={24} />, body: "Location-based CO₂e uses EPA eGRID2023 Rev2 total-output rates for RFCE, CAMX or ERCT. lb/MWh × 0.45359237 ÷ 1000 = kg/kWh. Select your utility’s region explicitly. These are annual historical factors; they are not live grid intensity.", link: "https://www.epa.gov/egrid/summary-data", label: "EPA eGRID2023 Rev2 summary" },
    { title: "Evidence integrity & privacy", icon: <Fingerprint size={24} />, body: "The report hash covers canonical JSON with reviewed fields, calculation and optional original-file fingerprint. Fingerprint-only mode keeps files in the browser. Optional uploads store a private local copy; Gemini receives contents only with server enablement and explicit per-file consent. A hash proves consistency, not truth.", link: null, label: null },
    { title: "Readiness & limits", icon: <ShieldCheck size={24} />, body: "Review steps are deterministic functions (not LLM agents). Optional Gemini bill extraction runs only when TALLYTRAIL_GEMINI_ENABLED=true and you consent per file. Hosted mode uses Neon Postgres, Neon Auth, and Vercel Blob via env vars. Solana devnet submit_report runs after confirmation for full calendar months when SOLANA_* wallet and program vars are set. This is a PoC, not certified carbon accounting.", link: null, label: null },
  ].map(card => <section className="tt-panel tt-method-card" key={card.title}><span className="tt-source-icon">{card.icon}</span><h2>{card.title}</h2><p>{card.body}</p>{card.link && <a href={card.link} target="_blank" rel="noreferrer">{card.label} <ExternalLink size={13} /></a>}</section>)}</div>;
}

export default function Home() {
  return <><KHero name={"TallyTrail"} tag={"Ledger"} eyebrow={"Carbon accounting \u00b7 with a paper trail"} body={"Turn everyday energy bills into emissions you can understand, review, and verify \u2014 every number tied to its source."} stat={"Every factor sourced \u00b7 Anchored on Solana devnet"} primary={"Try a sample report"} secondary={"Open the workspace"} accent={"#3f9a62"} features={["Bill import", "Sourced emission factors", "Scope 1 & Scope 2", "Bill fingerprints", "Human review gate", "Solana devnet receipts", "Offset ledger", "Public verify links"]} image={"/hero.webp"} /><div id="app">{<HomeApp />}</div></>;
}
