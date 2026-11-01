import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { caseGenerationRequestSchema } from "@mystery-room/shared";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
let sessionReady: Promise<void> | undefined;

async function ensureSession(force = false): Promise<void> {
  if (force) sessionReady = undefined;
  sessionReady ??= fetch(`${API}/session/guest`, { method: "POST", credentials: "include" }).then(async response => {
    if (!response.ok) throw new Error("Could not start a guest session. Check that the API is running.");
  }).catch(error => { sessionReady = undefined; throw error; });
  return sessionReady;
}

async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  await ensureSession();
  const response = await fetch(`${API}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init.headers } });
  if (response.status === 401 && retry) {
    await ensureSession(true);
    return api<T>(path, init, false);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || "The request could not be completed.");
  return payload?.data as T;
}

function useLoad<T>(path: string, enabled = true) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError("");
    try { setData(await api<T>(path)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load this page."); }
    finally { setLoading(false); }
  }, [path, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload };
}

type Suspect = { id: string; name: string; age?: number; occupation: string; relationshipToIncident: string; publicBiography: string; publicMotive: string; publicAlibi: string; statement: string; knownFacts: string[]; relevantEvidenceCount?: number };
type Evidence = { id: string; title: string; type: string; summary: string; content?: string; eventTime?: string; discoveredAt?: string; sourceDescription: string; relatedSuspectIds: string[]; relatedTimelineEventIds: string[]; assetId?: string };
type CaseFile = { id: string; title: string; scenario: string; difficulty: string; caseLength: string; status: string; currentStage?: string; incident: { summary: string; location: string; incidentTime: string; background: string }; suspects: Suspect[]; evidence: Evidence[]; timeline: any[]; progress?: { investigatedEvidenceIds: string[]; notes: any[]; accusationSubmitted: boolean }; createdAt: string };

function Brand() { return <Link className="brand" to="/"><span className="brand-mark">M</span><span>MYSTERY ROOM</span></Link>; }
function Eyebrow({ children }: { children: React.ReactNode }) { return <p className="eyebrow"><span className="live-dot" />{children}</p>; }
function Loading({ label = "Opening the case file" }: { label?: string }) { return <div className="loading-state"><span className="spinner" /><p>{label}<span className="loading-dots">...</span></p></div>; }
function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="notice error-notice"><strong>We hit a snag.</strong><p>{message}</p>{retry && <button className="text-button" onClick={retry}>Try again ↻</button>}</div>; }

function LandingPage() {
  return <main className="page-shell">
    <nav className="topbar" aria-label="Main navigation"><Brand /><div className="nav-right"><span className="edition">AN INTERACTIVE DETECTIVE GAME</span><Link className="nav-link" to="/library">Your cases <span aria-hidden="true">↗</span></Link></div></nav>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><Eyebrow>YOUR NEXT CASE IS WAITING</Eyebrow><h1 id="hero-title">Every mystery<br />has a <em>truth.</em></h1><p className="intro">Step into a mystery made just for you. Examine the evidence, question every alibi, and decide who did it.</p><div className="hero-actions"><Link className="primary-button" to="/create">Create a mystery <span aria-hidden="true">→</span></Link><a className="secondary-hero-button" href="#how-it-works">Explore how it works ↓</a></div><p className="no-account"><span aria-hidden="true">◈</span> Start investigating right away. No account needed.</p></div>
      <div className="case-art" aria-label="An illustrated mystery case file"><div className="art-grid" /><div className="case-file"><div className="file-top"><span>CASE FILE</span><span>NO. 001</span></div><div className="file-stamp">UNSOLVED<br />MYSTERY</div><div className="file-rule" /><p className="file-label">THE EVIDENCE IS<br />ALL AROUND YOU</p><div className="file-footer"><span>OPEN INVESTIGATION</span><span>◉</span></div></div><div className="magnifier"><div className="lens"><span>?</span></div><div className="handle" /></div><span className="art-note note-one">FIG. 01 — THE SCENE</span><span className="art-note note-two">LOOK CLOSER</span></div>
    </section>
    <section className="feature-row" id="how-it-works" aria-label="How the game works"><article><span className="step-no">01</span><div><h2>Set the scene</h2><p>Give us a premise. We’ll build the case around it.</p></div></article><article><span className="step-no">02</span><div><h2>Follow the evidence</h2><p>Search statements, timelines, and hidden details.</p></div></article><article><span className="step-no">03</span><div><h2>Name your suspect</h2><p>Make your accusation when you’re ready.</p></div></article></section>
    <section className="sample-strip"><div><Eyebrow>INSIDE THE INVESTIGATION</Eyebrow><h2>A story told through<br /><em>the details.</em></h2></div><div className="sample-evidence"><span className="sample-tag">SAMPLE EVIDENCE · FICTIONAL</span><p className="sample-message">“I left the observatory before the lights went out. Ask anyone.”</p><div><span>WITNESS STATEMENT</span><span>22:14 · NORTH WING</span></div></div></section>
    <footer className="footer"><span>AI MYSTERY ROOM</span><span>FICTIONAL CASES. REAL DEDUCTION.</span><span>EST. 2025</span></footer>
  </main>;
}

function CreateCasePage() {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState("");
  const [category, setCategory] = useState("any");
  const [difficulty, setDifficulty] = useState("medium");
  const [tone, setTone] = useState("classic_detective");
  const [caseLength, setCaseLength] = useState("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef("");
  const valid = caseGenerationRequestSchema.safeParse({ scenario, category: category === "any" ? undefined : category, difficulty, tone, caseLength }).success;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const parsed = caseGenerationRequestSchema.safeParse({ scenario, category: category === "any" ? undefined : category, difficulty, tone, caseLength });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check your scenario and try again."); return; }
    setBusy(true);
    try {
      idempotencyKey.current ||= crypto.randomUUID();
      const created = await api<{ caseId: string }>("/cases", { method: "POST", headers: { "Idempotency-Key": idempotencyKey.current }, body: JSON.stringify(parsed.data) });
      navigate(`/generating/${created.caseId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start your case."); setBusy(false); }
  }
  return <main className="page-shell create-shell"><header className="topbar"><Brand /><Link className="nav-link" to="/library">Case library ↗</Link></header><div className="form-wrap"><Link className="back-link" to="/">← Return to the room</Link><Eyebrow>START A NEW INVESTIGATION</Eyebrow><h1>Set the <em>scene.</em></h1><p className="form-intro">Give us the opening. We’ll establish the truth, build the evidence, and leave the deduction to you.</p><form className="create-form" onSubmit={submit}>
    <label className="field-label" htmlFor="scenario">Your mystery premise <span>REQUIRED</span></label><textarea id="scenario" value={scenario} onChange={event => setScenario(event.target.value)} minLength={30} maxLength={2000} placeholder="A night guard finds the museum's oldest clock stopped at 11:17. Three people had keys to the gallery..." required /><div className="field-meta"><span>Start with a place, an incident, or a question.</span><span className={scenario.length > 2000 ? "over-limit" : ""}>{scenario.length} / 2,000</span></div>
    <div className="privacy-note"><span>◇</span><p>Keep it fictional. Please don’t include real people’s private or sensitive information.</p></div>
    <div className="form-grid"><label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="any">Any mystery</option><option value="disappearance">Disappearance</option><option value="theft">Theft</option><option value="murder_mystery">Murder mystery</option><option value="cyber_mystery">Cyber mystery</option><option value="historical_mystery">Historical mystery</option><option value="campus_mystery">Campus mystery</option><option value="locked_room">Locked-room mystery</option></select></label><label>Difficulty<select value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="easy">Easy · clear clues</option><option value="medium">Medium · connected clues</option><option value="hard">Hard · layered deduction</option></select></label><label>Tone<select value={tone} onChange={event => setTone(event.target.value)}><option value="classic_detective">Classic detective</option><option value="psychological_thriller">Psychological thriller</option><option value="noir">Noir</option><option value="lighthearted">Lighthearted mystery</option></select></label><label>Case length<select value={caseLength} onChange={event => setCaseLength(event.target.value)}><option value="short">Short</option><option value="standard">Standard</option><option value="extended">Extended</option></select></label></div>
    {error && <ErrorState message={error} />}<button className="primary-button submit-button" type="submit" disabled={!valid || busy}>{busy ? "Opening your case…" : "Build my investigation"}<span aria-hidden="true">→</span></button><p className="form-footnote">Usually takes a minute. Your case is private to this browser session.</p>
  </form></div></main>;
}

function GenerationPage() {
  const { caseId = "" } = useParams(); const navigate = useNavigate();
  const [status, setStatus] = useState<any>(); const [error, setError] = useState(""); const [retrying, setRetrying] = useState(false); const [pollSequence, setPollSequence] = useState(0);
  useEffect(() => {
    let active = true; let timer: number | undefined;
    const poll = async () => {
      try {
        const latest = await api<any>(`/cases/${caseId}/status`);
        if (!active) return;
        setStatus(latest); setError("");
        if (latest.status === "ready") { navigate(`/case/${caseId}`, { replace: true }); return; }
        if (latest.status === "failed") { setError(latest.errorCode || "GENERATION_FAILED"); return; }
        timer = window.setTimeout(poll, 1800);
      } catch (cause) { if (active) { setError(cause instanceof Error ? cause.message : "Unable to check case progress."); timer = window.setTimeout(poll, 3500); } }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [caseId, navigate, pollSequence]);
  const stages = ["understanding_scenario", "establishing_solution", "building_evidence", "checking_consistency", "repairing_evidence", "ready"];
  const activeIndex = Math.max(0, stages.indexOf(status?.currentStage));
  async function retry() { setRetrying(true); setError(""); try { await api(`/cases/${caseId}/retry`, { method: "POST" }); setStatus({ status: "queued", currentStage: "queued" }); setPollSequence(value => value + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : "Retry could not be started."); } finally { setRetrying(false); } }
  return <main className="page-shell generation-shell"><Brand /><section className="generation-card"><Eyebrow>CASE GENERATION</Eyebrow><h1>{error ? "The trail went cold." : "Putting the pieces\ntogether."}</h1><p className="intro">{error ? "This case could not be prepared. It has not been published as playable." : "We’re establishing the facts before the evidence reaches your desk."}</p>{error ? <><p className="error-code">{error}</p>{status?.retryEligible && <button className="primary-button" onClick={() => void retry()} disabled={retrying}>{retrying ? "Retrying…" : "Retry this case"}<span>↻</span></button>}<Link className="back-link" to="/create">Create another case</Link></> : <div className="stage-list">{["Understanding the scenario", "Establishing the solution", "Building the evidence", "Checking consistency", "Repairing and rechecking evidence", "Preparing the case"].map((label, index) => <div className={`stage-item ${index < activeIndex ? "done" : index === activeIndex ? "active" : ""}`} key={label}><span>{index < activeIndex ? "✓" : `0${index + 1}`}</span>{label}<i /></div>)}</div>}<Link className="back-link" to="/library">Open your case library</Link></section></main>;
}

function LibraryPage() {
  const { data, loading, error, reload } = useLoad<{ items: CaseFile[]; total: number }>("/cases");
  const [removing, setRemoving] = useState("");
  async function remove(id: string) { if (!window.confirm("Delete this case and its investigation notes?")) return; setRemoving(id); try { await api(`/cases/${id}`, { method: "DELETE" }); await reload(); } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Could not delete case."); } finally { setRemoving(""); } }
  return <main className="page-shell library-shell"><header className="topbar"><Brand /><Link className="primary-button compact-button" to="/create">New case <span>＋</span></Link></header><section className="library-content"><Eyebrow>YOUR PRIVATE CASE FILES</Eyebrow><h1>The <em>library.</em></h1><p className="intro">Pick up where your curiosity left off.</p>{loading ? <Loading label="Finding your case files" /> : error ? <ErrorState message={error} retry={reload} /> : !data?.items.length ? <div className="empty-state"><div className="empty-icon">M</div><h2>No open cases yet.</h2><p>Your investigations will be kept here for this browser session.</p><Link className="primary-button" to="/create">Create your first mystery <span>→</span></Link></div> : <div className="case-grid">{data.items.map(item => <article className="library-card" key={item.id}><div className="card-kicker"><span className={`status-dot ${item.status}`} />{item.status === "ready" ? "READY TO INVESTIGATE" : item.status.toUpperCase()}</div><h2>{item.title || "Case in progress"}</h2><p>{item.incident?.summary || item.scenario}</p><div className="card-meta"><span>{item.difficulty} · {item.caseLength}</span><span>{new Date(item.createdAt).toLocaleDateString()}</span></div><div className="card-actions">{item.status === "ready" ? <Link className="text-button" to={`/case/${item.id}`}>Open case →</Link> : <Link className="text-button" to={`/generating/${item.id}`}>View progress →</Link>}<button className="icon-button" aria-label="Delete case" disabled={removing === item.id} onClick={() => void remove(item.id)}>⌫</button></div></article>)}</div>}</section><footer className="footer"><span>AI MYSTERY ROOM</span><span>YOUR FILES STAY WITH THIS SESSION</span></footer></main>;
}

function CaseLayout({ children }: { children: React.ReactNode }) {
  const { caseId = "" } = useParams();
  const { data, loading, error } = useLoad<CaseFile>(`/cases/${caseId}`, Boolean(caseId));
  if (loading) return <main className="desk-shell"><Brand /><Loading /></main>;
  if (error || !data) return <main className="desk-shell"><Brand /><ErrorState message={error || "Case not found."} /><Link className="back-link" to="/library">← Return to case library</Link></main>;
  return <main className="desk-shell"><aside className="desk-sidebar"><Brand /><p className="sidebar-label">INVESTIGATION</p><nav className="desk-nav"><NavLink end to={`/case/${caseId}`}>▦ <span>Case overview</span></NavLink><NavLink to={`/case/${caseId}/suspects`}>♙ <span>Suspects</span></NavLink><NavLink to={`/case/${caseId}/evidence`}>▤ <span>Evidence</span></NavLink><NavLink to={`/case/${caseId}/timeline`}>◷ <span>Timeline</span></NavLink></nav><div className="sidebar-bottom"><Link to="/library">← All cases</Link><span>PRIVATE CASE FILE</span></div></aside><section className="desk-main"><header className="desk-top"><div><span className="desk-case-no">CASE FILE · {caseId.slice(-6).toUpperCase()}</span><strong>{data.title}</strong></div><Link className="accuse-link" to={`/case/${caseId}/accuse`}>{data.progress?.accusationSubmitted ? "View verdict →" : "Make an accusation →"}</Link></header><div className="desk-content">{children}</div></section></main>;
}

function CaseDashboard() {
  const { caseId = "" } = useParams(); const { data, loading, error, reload } = useLoad<CaseFile>(`/cases/${caseId}`);
  if (loading) return <Loading />; if (error || !data) return <ErrorState message={error || "Case unavailable."} retry={reload} />;
  const investigated = data.progress?.investigatedEvidenceIds?.length || 0;
  return <><Eyebrow>CASE OVERVIEW · {data.difficulty.toUpperCase()}</Eyebrow><div className="dashboard-heading"><div><h1>{data.title}</h1><p className="case-location">{data.incident.location} <span>·</span> {data.incident.incidentTime}</p></div><span className="case-badge">ACTIVE INVESTIGATION</span></div><div className="incident-panel"><div className="incident-icon">✳</div><div><span className="panel-kicker">THE INCIDENT</span><h2>{data.incident.summary}</h2><p>{data.incident.background}</p></div></div><div className="stat-grid"><div><span>PERSONS OF INTEREST</span><strong>{data.suspects.length.toString().padStart(2, "0")}</strong></div><div><span>EVIDENCE ITEMS</span><strong>{data.evidence.length.toString().padStart(2, "0")}</strong></div><div><span>REVIEWED</span><strong>{investigated.toString().padStart(2, "0")}<small> / {data.evidence.length}</small></strong></div></div><div className="section-heading"><div><span className="panel-kicker">RECENT LEADS</span><h2>Start with the details.</h2></div><Link className="text-button" to={`/case/${caseId}/evidence`}>All evidence →</Link></div><div className="evidence-list">{data.evidence.slice(0, 3).map(item => <Link className="evidence-row" to={`/case/${caseId}/evidence/${item.id}`} key={item.id}><span className="evidence-type-icon">{typeIcon(item.type)}</span><span className="evidence-row-text"><strong>{item.title}</strong><small>{item.summary}</small></span><span className="evidence-row-kind">{item.type.replaceAll("_", " ")}</span><span className="arrow">↗</span></Link>)}</div><div className="quick-links"><Link to={`/case/${caseId}/suspects`}>Review the suspects <span>→</span></Link><Link to={`/case/${caseId}/timeline`}>Reconstruct the timeline <span>→</span></Link></div><Notes caseId={caseId} />{!data.progress?.accusationSubmitted && <Link className="primary-button accusation-cta" to={`/case/${caseId}/accuse`}>Ready to make an accusation? <span>→</span></Link>}</>;
}

function typeIcon(type: string) { return ({ message: "▤", cctv: "◉", image: "▧", document: "▧", witness_statement: "❞", physical: "⌕" } as Record<string, string>)[type] || "◇"; }

function SuspectsPage() {
  const { caseId = "" } = useParams(); const { data, loading, error, reload } = useLoad<Suspect[]>(`/cases/${caseId}/suspects`);
  if (loading) return <Loading />; if (error || !data) return <ErrorState message={error || "Suspects unavailable."} retry={reload} />;
  return <><Eyebrow>PEOPLE CONNECTED TO THE INCIDENT</Eyebrow><h1 className="page-title">The <em>suspects.</em></h1><p className="intro">Every person has a reason to be here. Every story deserves a closer look.</p><div className="suspect-grid">{data.map((person, index) => <article className="suspect-card" key={person.id}><div className={`suspect-avatar avatar-${index % 4}`}>{person.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</div><div className="suspect-number">PERSON OF INTEREST · 0{index + 1}</div><h2>{person.name}</h2><p className="suspect-role">{person.occupation}{person.age ? ` · ${person.age}` : ""}</p><p>{person.relationshipToIncident}</p><p className="suspect-evidence-count">{person.relevantEvidenceCount ?? 0} related evidence items</p><div className="suspect-divider" /><p className="suspect-motive"><span>KNOWN MOTIVE</span>{person.publicMotive}</p><p className="suspect-alibi"><span>THEIR ALIBI</span>{person.publicAlibi}</p><details><summary>Read statement</summary><p>{person.statement}</p></details></article>)}</div></>;
}

function EvidencePage() {
  const { caseId = "" } = useParams(); const [type, setType] = useState(""); const [query, setQuery] = useState("");
  const path = `/cases/${caseId}/evidence?${new URLSearchParams({ ...(type ? { type } : {}), ...(query ? { q: query } : {}) })}`;
  const { data, loading, error, reload } = useLoad<{ items: Evidence[]; total: number }>(path);
  if (loading) return <Loading />; if (error || !data) return <ErrorState message={error || "Evidence unavailable."} retry={reload} />;
  const types = [["", "All evidence"], ["message", "Messages"], ["image", "Images"], ["cctv", "CCTV stills"], ["document", "Documents"], ["witness_statement", "Witnesses"], ["physical", "Physical"]];
  return <><Eyebrow>THE CASE MATERIALS · {data.total} ITEMS</Eyebrow><h1 className="page-title">Evidence <em>room.</em></h1><div className="evidence-controls"><input aria-label="Search evidence" placeholder="Search titles and details…" value={query} onChange={event => setQuery(event.target.value)} /><span>⌕</span></div><div className="filter-tabs">{types.map(([value, label]) => <button className={type === value ? "selected" : ""} key={value} onClick={() => setType(value)}>{label}</button>)}</div>{!data.items.length ? <div className="empty-inline">No evidence matches that search.</div> : <div className="gallery-grid">{data.items.map(item => <Link className="evidence-card" to={`/case/${caseId}/evidence/${item.id}`} key={item.id}><div className={`evidence-card-art art-${item.type}`}>{item.assetId ? <img crossOrigin="use-credentials" src={`${API}/cases/${caseId}/assets/${item.assetId}`} alt="" /> : <span>{typeIcon(item.type)}</span>}<small>{item.type.replaceAll("_", " ")}</small></div><div className="evidence-card-copy"><span>{item.eventTime || item.discoveredAt || "CASE MATERIAL"}</span><h2>{item.title}</h2><p>{item.summary}</p><b>Examine evidence →</b></div></Link>)}</div>}</>;
}

function EvidenceDetailPage() {
  const { caseId = "", evidenceId = "" } = useParams(); const { data, loading, error, reload } = useLoad<Evidence>(`/cases/${caseId}/evidence/${evidenceId}`);
  const [note, setNote] = useState(""); const [saved, setSaved] = useState(false); const [saving, setSaving] = useState(false);
  if (loading) return <Loading label="Examining evidence" />; if (error || !data) return <ErrorState message={error || "Evidence unavailable."} retry={reload} />;
  async function saveNote(event: React.FormEvent) { event.preventDefault(); if (!note.trim()) return; setSaving(true); try { await api(`/cases/${caseId}/notes`, { method: "POST", body: JSON.stringify({ content: `${data!.title}: ${note.trim()}` }) }); setNote(""); setSaved(true); window.setTimeout(() => setSaved(false), 2500); } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Could not save note."); } finally { setSaving(false); } }
  return <><Link className="back-link" to={`/case/${caseId}/evidence`}>← All evidence</Link><Eyebrow>{data.type.replaceAll("_", " ").toUpperCase()} · CASE MATERIAL</Eyebrow><div className="detail-heading"><div><h1 className="page-title">{data.title}</h1><p>{data.sourceDescription}</p></div><span>{data.eventTime || data.discoveredAt || "TIME UNCONFIRMED"}</span></div><article className={`evidence-detail-content detail-${data.type}`}><span className="panel-kicker">{data.type === "cctv" ? "FICTIONAL CCTV-STYLE STILL · NOT ACTUAL FOOTAGE" : data.sourceDescription.toUpperCase()}</span>{["image", "cctv"].includes(data.type) && (data.assetId ? <img className="image-preview" crossOrigin="use-credentials" src={`${API}/cases/${caseId}/assets/${data.assetId}`} alt={data.summary} /> : <div className="image-placeholder"><strong>{data.type === "cctv" ? "Scene description" : "Evidence image description"}</strong><span>IMAGE UNAVAILABLE · TEXT CLUE AVAILABLE</span></div>)}<p>{data.content}</p><div className="detail-meta"><span>RELATED PERSONS</span><div>{data.relatedSuspectIds.map(id => <span className="tag" key={id}>{id.replaceAll("_", " ")}</span>)}</div></div></article><form className="note-form" onSubmit={saveNote}><label htmlFor="note">Add a note about this clue</label><textarea id="note" maxLength={4000} placeholder="What stands out? Connect it to another detail…" value={note} onChange={event => setNote(event.target.value)} /><div><span>{saved ? "Note saved to this case." : "Notes are private to this investigation."}</span><button className="text-button" disabled={!note.trim() || saving}>{saving ? "Saving…" : "Save note →"}</button></div></form></>;
}

function TimelinePage() {
  const { caseId = "" } = useParams(); const { data, loading, error, reload } = useLoad<any[]>(`/cases/${caseId}/timeline`);
  if (loading) return <Loading />; if (error || !data) return <ErrorState message={error || "Timeline unavailable."} retry={reload} />;
  return <><Eyebrow>CHRONOLOGY · FICTIONAL CASE TIME</Eyebrow><h1 className="page-title">The <em>timeline.</em></h1><p className="intro">Follow what happened, and when. Timestamps are shown as written in the case file.</p><div className="timeline-list">{data.map((event, index) => <article className="timeline-event" key={event.id}><div className="timeline-marker">{String(index + 1).padStart(2, "0")}</div><time>{event.timestamp}</time><h2>{event.title}</h2><p>{event.description}</p><div className="timeline-tags">{event.relatedSuspectIds.map((id: string) => <span className="tag" key={id}>{id.replaceAll("_", " ")}</span>)}{event.relatedEvidenceIds.map((id: string) => <Link className="tag evidence-tag" to={`/case/${caseId}/evidence/${id}`} key={id}>Evidence ↗</Link>)}</div></article>)}</div></>;
}

function Notes({ caseId }: { caseId: string }) {
  const { data, reload } = useLoad<any>(`/cases/${caseId}/progress`);
  const [content, setContent] = useState(""); const [busy, setBusy] = useState(false); const [editingId, setEditingId] = useState(""); const [editContent, setEditContent] = useState("");
  async function addNote(event: React.FormEvent) { event.preventDefault(); if (!content.trim()) return; setBusy(true); try { await api(`/cases/${caseId}/notes`, { method: "POST", body: JSON.stringify({ content }) }); setContent(""); await reload(); } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Could not save note."); } finally { setBusy(false); } }
  async function editNote(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { await api(`/cases/${caseId}/notes/${editingId}`, { method: "PATCH", body: JSON.stringify({ content: editContent }) }); setEditingId(""); await reload(); } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Could not update note."); } finally { setBusy(false); } }
  async function deleteNote(id: string) { try { await api(`/cases/${caseId}/notes/${id}`, { method: "DELETE" }); await reload(); } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Could not delete note."); } }
  return <section className="notes-panel"><div className="section-heading"><div><span className="panel-kicker">YOUR PRIVATE FIELD NOTES</span><h2>Keep your theory close.</h2></div></div><form onSubmit={addNote}><textarea aria-label="Investigation note" maxLength={4000} placeholder="A detail, a contradiction, a hunch…" value={content} onChange={event => setContent(event.target.value)} /><button className="text-button" disabled={!content.trim() || busy}>{busy ? "Saving…" : "Add note +"}</button></form><div className="saved-notes">{data?.notes?.map((item: any) => editingId === item.id ? <form className="edit-note" key={item.id} onSubmit={editNote}><textarea maxLength={4000} value={editContent} onChange={event => setEditContent(event.target.value)} /><button className="text-button" disabled={!editContent.trim() || busy}>Save changes</button><button type="button" className="secondary-button" onClick={() => setEditingId("")}>Cancel</button></form> : <div className="saved-note" key={item.id}><p><span>“</span>{item.content}</p><div><button className="text-button" onClick={() => { setEditingId(item.id); setEditContent(item.content); }}>Edit</button><button className="secondary-button" onClick={() => void deleteNote(item.id)}>Delete</button></div></div>)}</div></section>;
}

function AccusationPage() {
  const { caseId = "" } = useParams(); const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad<CaseFile>(`/cases/${caseId}`);
  const [selected, setSelected] = useState(""); const [explanation, setExplanation] = useState(""); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [submitError, setSubmitError] = useState("");
  if (loading) return <Loading />; if (error || !data) return <ErrorState message={error || "Case unavailable."} retry={reload} />;
  if (data.progress?.accusationSubmitted) return <section className="already-accused"><Eyebrow>THE ACCUSATION IS ON RECORD</Eyebrow><h1 className="page-title">The truth is <em>waiting.</em></h1><p className="intro">Your submitted verdict is ready to review.</p><Link className="primary-button" to={`/case/${caseId}/result`}>See the verdict <span>→</span></Link></section>;
  async function submit() { setBusy(true); setSubmitError(""); try { await api(`/cases/${caseId}/accusations`, { method: "POST", body: JSON.stringify({ selectedSuspectId: selected, explanation }) }); navigate(`/case/${caseId}/result`); } catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "Your accusation could not be recorded."); setConfirm(false); } finally { setBusy(false); } }
  return <><Eyebrow>FINAL DECISION · TAKE YOUR TIME</Eyebrow><h1 className="page-title">Who did <em>it?</em></h1><p className="intro">Choose one suspect. The evidence has already been gathered; now make your call.</p><div className="accusation-options">{data.suspects.map((person, index) => <button key={person.id} className={`accusation-option ${selected === person.id ? "chosen" : ""}`} onClick={() => setSelected(person.id)}><span className="option-number">0{index + 1}</span><span><strong>{person.name}</strong><small>{person.occupation} · {person.relationshipToIncident}</small></span><i>{selected === person.id ? "●" : "○"}</i></button>)}</div><label className="field-label accusation-explain-label" htmlFor="explanation">Your reasoning <span>OPTIONAL</span></label><textarea className="accusation-explain" id="explanation" maxLength={1000} placeholder="Which detail convinced you?" value={explanation} onChange={event => setExplanation(event.target.value)} /><div className="field-meta"><span>This will be saved with your accusation.</span><span>{explanation.length} / 1,000</span></div>{submitError && <ErrorState message={submitError} />}<button className="primary-button submit-button" disabled={!selected || busy} onClick={() => setConfirm(true)}>Submit final accusation <span>→</span></button>{confirm && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><Eyebrow>FINAL CONFIRMATION</Eyebrow><h2 id="confirm-title">Accuse {data.suspects.find(person => person.id === selected)?.name}?</h2><p>You can submit one accusation for this case. The verdict will be recorded and the solution revealed.</p><div><button className="secondary-button" onClick={() => setConfirm(false)}>Review evidence</button><button className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "Recording…" : "Confirm accusation →"}</button></div></section></div>}</>;
}

function ResultPage() {
  const { caseId = "" } = useParams(); const { data, loading, error, reload } = useLoad<any>(`/cases/${caseId}/result`);
  if (loading) return <Loading label="Opening the solution" />; if (error || !data) return <ErrorState message={error || "Solution unavailable."} retry={reload} />;
  return <><Eyebrow>CASE CLOSED · SOLUTION REVEALED</Eyebrow><div className={`verdict-banner ${data.verdict}`}><span className="verdict-icon">{data.verdict === "correct" ? "✓" : "×"}</span><div><span className="panel-kicker">YOUR ACCUSATION WAS {data.verdict.toUpperCase()}</span><h1>{data.verdict === "correct" ? "Well observed." : "The details told another story."}</h1><p>You accused {data.selectedSuspect?.name}. The culprit was {data.culprit?.name}.</p></div></div><section className="solution-section"><span className="panel-kicker">WHAT REALLY HAPPENED</span><h2>The truth behind the case.</h2><p>{data.solution.reconstruction}</p><div className="solution-columns"><article><span>MOTIVE</span><p>{data.solution.motive}</p></article><article><span>METHOD</span><p>{data.solution.method}</p></article></div></section><section className="solution-section"><span className="panel-kicker">THE DECISIVE DETAILS</span><h2>Evidence that mattered.</h2><div className="decisive-list">{data.solution.decisiveEvidence.map((item: any) => <Link to={`/case/${caseId}/evidence/${item.id}`} key={item.id}><span>{typeIcon(item.type)}</span><div><strong>{item.title}</strong><p>{item.explanation}</p></div><b>↗</b></Link>)}</div></section><section className="solution-section red-herring-section"><span className="panel-kicker">FALSE TRAILS, EXPLAINED</span><h2>The red herrings.</h2>{data.solution.redHerringExplanations.map((item: string, index: number) => <p className="red-herring" key={index}><span>0{index + 1}</span>{item}</p>)}</section><div className="result-actions"><Link className="primary-button" to="/library">Return to your library <span>→</span></Link><Link className="text-button" to="/create">Start a new case</Link></div></>;
}

export function App() {
  return <Routes><Route path="/" element={<LandingPage />} /><Route path="/create" element={<CreateCasePage />} /><Route path="/generating/:caseId" element={<GenerationPage />} /><Route path="/library" element={<LibraryPage />} /><Route path="/case/:caseId" element={<CaseLayout><CaseDashboard /></CaseLayout>} /><Route path="/case/:caseId/suspects" element={<CaseLayout><SuspectsPage /></CaseLayout>} /><Route path="/case/:caseId/evidence" element={<CaseLayout><EvidencePage /></CaseLayout>} /><Route path="/case/:caseId/evidence/:evidenceId" element={<CaseLayout><EvidenceDetailPage /></CaseLayout>} /><Route path="/case/:caseId/timeline" element={<CaseLayout><TimelinePage /></CaseLayout>} /><Route path="/case/:caseId/accuse" element={<CaseLayout><AccusationPage /></CaseLayout>} /><Route path="/case/:caseId/result" element={<CaseLayout><ResultPage /></CaseLayout>} /><Route path="*" element={<LandingPage />} /></Routes>;
}
