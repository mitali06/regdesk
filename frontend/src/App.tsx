import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const GITHUB = import.meta.env.VITE_GITHUB_URL ?? "";
const LINKEDIN = import.meta.env.VITE_LINKEDIN_URL ?? "";

type Citation = { doc_id: string; snippet: string; score: number; dense: number; lexical: number };
type AskResponse = {
  answer: string; citations: Citation[]; refused: boolean;
  latency_ms: number; input_tokens: number; output_tokens: number;
};
type RecallRow = { k: number; dense_only: number; hybrid: number };
type Scorecard = {
  examples: number; answerable: number; unanswerable: number;
  recall_at_k: RecallRow[]; citation_accuracy: number | null;
  refusal_correctness: number | null; avg_latency_ms: number | null;
};
type DocItem = { name: string; chunks: number };
type View = "ask" | "docs" | "evals";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const docName = (id: string) => id.split("#")[0];
const docDomain = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("credit") || n.includes("loan") || n.includes("lend")) return "Lending";
  if (n.includes("insur") || n.includes("home") || n.includes("policy")) return "Insurance";
  if (n.includes("clinic") || n.includes("diab") || n.includes("health") || n.includes("t2dm")) return "Healthcare";
  return "Document";
};

const EXAMPLES = [
  "What is the maximum debt-to-income ratio for approval?",
  "What is the deductible for a named-storm event?",
  "At what HbA1c level is type 2 diabetes diagnosed?",
  "Does the insurance policy cover cyber liability?",
];

/* ---------- icons ---------- */
const I = {
  shield: <svg viewBox="0 0 24 24" fill="none"><path d="M4 7l8-4 8 4v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ask: <svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 11-3.4-6.8M21 4v4h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 3v4h4M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  docPlain: <svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.7"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  api: <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7"/><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ban: <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  spark: <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const NAV: { id: View; label: string; icon: JSX.Element; count?: number }[] = [
  { id: "ask", label: "Ask", icon: I.ask },
  { id: "docs", label: "Documents", icon: I.doc },
  { id: "evals", label: "Evaluations", icon: I.chart },
];

export default function App() {
  const [view, setView] = useState<View>("ask");
  const [health, setHealth] = useState<"live" | "wake" | "unknown">("unknown");
  const [docCount, setDocCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(() => setHealth("live"))
      .catch(() => setHealth("wake"));
  }, []);

  const crumb = NAV.find(n => n.id === view)!.label;

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <div className="logomark">{I.shield}</div>
          <div><b>RegDesk</b><div className="sub">Grounded answers, cited</div></div>
        </div>
        <div className="navlabel">Workspace</div>
        {NAV.map(n => (
          <button key={n.id} className={`nav${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>
            {n.icon} {n.label}
            {n.id === "docs" && docCount != null && <span className="count">{docCount}</span>}
          </button>
        ))}
        <div className="navlabel">Resources</div>
        <a className="nav" href={`${API}/docs`} target="_blank" rel="noreferrer">{I.api} API reference</a>
        <button className="nav" onClick={() => setView("evals")}>{I.info} How it works</button>
        <div className="spacer" />
        <div className="userbox">
          <div className="avatar">MK</div>
          <div><div className="nm">Mitali Kasurde</div><div className="role">Admin · Demo org</div></div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="crumb">RegDesk / <b>{crumb}</b></div>
          <div className="topsearch">{I.search} Search documents &amp; answers…</div>
          <div className={`status ${health === "live" ? "live" : "wake"}`}>
            <span className="dot" />
            {health === "live" ? "API live" : health === "wake" ? "API waking…" : "Connecting…"}
          </div>
          <button className="ghostbtn" onClick={() => setView("ask")}>{I.plus} New query</button>
        </div>

        <div className="scroll">
          {view === "ask" && <Ask />}
          {view === "docs" && <Documents onCount={setDocCount} />}
          {view === "evals" && <Evals />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Ask ---------- */
function Ask() {
  const [q, setQ] = useState("");
  const [hybrid, setHybrid] = useState(true);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text) return;
    if (question) setQ(question);
    setLoading(true); setError(null); setResp(null);
    try {
      const r = await fetch(`${API}/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, hybrid }),
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      setResp(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setLoading(false); }
  }

  return (
    <section className="view">
      <div className="hero">
        <span className="tag"><span className="d2" /> Retrieval-grounded · Citation-enforced</span>
        <h1>Ask regulated documents. Get answers you can <span className="g">actually trust.</span></h1>
        <p>RegDesk retrieves the exact passage, answers with a citation you can check, and refuses rather than guess when the documents don't contain the answer.</p>
        <div className="pipe">
          <div className="s"><b>1</b> Ask or upload a document</div>
          <div className="s"><b>2</b> Hybrid search finds the passage</div>
          <div className="s"><b>3</b> Cited answer — or honest refusal</div>
        </div>
      </div>

      <div className="askcard">
        <p className="lbl">Try one of these against the loaded documents</p>
        <div className="chips">
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="chip-q" onClick={() => ask(ex)}>{ex}</button>
          ))}
        </div>
        <div className="inputrow">
          <div className="inputwrap">
            <textarea value={q} onChange={e => setQ(e.target.value)}
              placeholder="…or type your own question about the loaded documents"
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }} />
          </div>
          <button className="askbtn" onClick={() => ask()} disabled={loading || !q.trim()}>
            {loading ? <><span className="spin" />Thinking…</> : "Ask →"}
          </button>
        </div>
        <div className="ctrls">
          <label className="switch" title="Hybrid combines semantic + keyword search">
            <span className={`track${hybrid ? " on" : ""}`} onClick={() => setHybrid(h => !h)} />
            Hybrid retrieval (dense + keyword)
          </label>
          <span>· Refuses below the semantic-match threshold</span>
        </div>
        {error && <div className="err">{error} — the API may be waking up (free tier sleeps after ~15 min). Give it ~30s and try again.</div>}
      </div>

      {resp && (
        <div className="answer">
          <div className="ans-head">
            <div className="ic">{I.spark}</div>
            <h3>Answer</h3>
            {resp.refused
              ? <span className="badge refused">{I.ban} Refused — not in the documents</span>
              : <span className="badge ok">{I.check} Grounded &amp; cited</span>}
          </div>
          <div className="ans-body">
            <div className="ans-text">{resp.answer}</div>
            <div className="meta">
              <span className="m"><b>{resp.latency_ms}</b> ms latency</span>
              <span className="m"><b>{resp.input_tokens}</b> input tok</span>
              <span className="m"><b>{resp.output_tokens}</b> output tok</span>
            </div>
            {resp.citations.length > 0 && (
              <>
                <p className="srcttl">Sources — every claim is traceable</p>
                {resp.citations.map((c, i) => (
                  <div className="src" key={i}>
                    <div className="top">
                      <code>{docName(c.doc_id)}</code>
                      <span className="matchpct">match {c.score.toFixed(3)}</span>
                    </div>
                    <div className="snip">{c.snippet}…</div>
                    <div className="bars">
                      <ScoreBar label="semantic" value={c.dense} max={1} />
                      <ScoreBar label="keyword" value={c.lexical} max={Math.max(c.lexical, 8)} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <div className="foot">
        <span>Portfolio project by <b>Mitali Kasurde</b> — a deployable, evaluation-instrumented RAG + agent system (FastAPI · React · hybrid retrieval · Claude).</span>
        <span className="links">
          {GITHUB && <a href={GITHUB} target="_blank" rel="noreferrer">GitHub repo →</a>}
          {LINKEDIN && <a href={LINKEDIN} target="_blank" rel="noreferrer">LinkedIn →</a>}
          <a href={`${API}/docs`} target="_blank" rel="noreferrer">API docs →</a>
        </span>
      </div>
    </section>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="bar">
      <div className="bl"><span>{label}</span><span>{value.toFixed(label === "semantic" ? 3 : 1)}</span></div>
      <div className="bt"><div className="bf" style={{ width: `${w}%` }} /></div>
    </div>
  );
}

/* ---------- Documents ---------- */
function Documents({ onCount }: { onCount: (n: number) => void }) {
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetch(`${API}/documents`)
      .then(r => r.json())
      .then(d => { setDocs(d.documents); onCount(d.documents.length); })
      .catch(() => setError("Couldn't load documents — the API may be waking up."));
  }
  useEffect(refresh, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploadMsg("Uploading…"); setError(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Upload failed");
      setUploadMsg(`Added "${d.filename}" (${d.chunks_added} chunks). Ask about it in the Ask tab.`);
      refresh();
    } catch (e) {
      setUploadMsg(null);
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { e.target.value = ""; }
  }

  const totalChunks = docs?.reduce((s, d) => s + d.chunks, 0) ?? 0;

  return (
    <section className="view">
      <div className="sectionhead">
        <div><h2>Documents</h2><p>Answers are grounded in these indexed sources. Add your own to query it instantly.</p></div>
        {docs && <div className="ghostbtn">{docs.length} files · {totalChunks} chunks</div>}
      </div>
      <div className="panelblock">
        {docs?.map((d, i) => (
          <div className="docrow" key={i}>
            <div className="fi">{I.docPlain}</div>
            <div>
              <div className="nm">{d.name}</div>
              <div className="mt">{docDomain(d.name)} · {d.chunks} chunks</div>
            </div>
            <span className="st">Indexed</span>
          </div>
        ))}
        {docs && docs.length === 0 && <div className="empty">No documents indexed yet.</div>}
        {!docs && !error && <div className="empty">Loading documents…</div>}
        <label className="uploadzone">
          Drop a <b>.pdf, .md or .txt</b> here, or click to browse — it's chunked and searchable in seconds
          <input type="file" accept=".txt,.md,.pdf" onChange={onFile} />
        </label>
        {uploadMsg && <div className="note">{uploadMsg}</div>}
        {error && <div className="err">{error}</div>}
      </div>
    </section>
  );
}

/* ---------- Evals ---------- */
function Evals() {
  const [card, setCard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/evals`);
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      setCard(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const maxRecall = (rows: RecallRow[]) =>
    Math.max(...rows.flatMap(r => [r.dense_only, r.hybrid]), 1);

  return (
    <section className="view">
      <div className="sectionhead">
        <div><h2>Evaluations</h2><p>A demo that says "trust me" isn't enough. RegDesk grades itself on a labeled question set every run.</p></div>
        <button className="ghostbtn" onClick={load} disabled={loading}>
          {I.ask} {loading ? "Running…" : "Re-run evaluation"}
        </button>
      </div>

      {error && <div className="err">{error} — the API may be waking up; try again in ~30s.</div>}

      {card && (
        <>
          <div className="grid3">
            <div className="metric"><div className="v">{pct(card.citation_accuracy)}</div><div className="k">Cited the right source</div><div className="d">across {card.answerable} answerable questions</div></div>
            <div className="metric"><div className="v">{pct(card.refusal_correctness)}</div><div className="k">Correctly refused</div><div className="d">{card.unanswerable} unanswerable held-out questions</div></div>
            <div className="metric"><div className="v">{card.avg_latency_ms ?? "—"} ms</div><div className="k">Avg latency</div><div className="d">measured this run</div></div>
          </div>
          <div className="panelblock">
            <h3>Did it find the right document? <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 13 }}>(recall@k)</span></h3>
            <p className="desc">On this clean sample corpus both methods score near-perfect; the hybrid advantage widens on larger, messier document sets — upload more and re-run to see the gap move.</p>
            <table>
              <thead><tr><th>Top-k results</th><th>Semantic only</th><th>Hybrid (dense + BM25)</th></tr></thead>
              <tbody>
                {card.recall_at_k.map(r => {
                  const win = r.hybrid >= r.dense_only;
                  const w = 50 * (r.hybrid / maxRecall(card.recall_at_k));
                  return (
                    <tr key={r.k}>
                      <td>k = {r.k}</td>
                      <td><span className="pillv">{pct(r.dense_only)}</span></td>
                      <td>
                        <span className="winbar" style={{ width: `${w}px` }} />
                        <span className={win ? "hl" : "pillv"}>{pct(r.hybrid)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="note">
              Measured on {card.answerable} answerable + {card.unanswerable} unanswerable questions
              ({card.examples} total). Upload more documents and re-run to watch the hybrid advantage grow.
            </div>
          </div>
        </>
      )}
    </section>
  );
}
