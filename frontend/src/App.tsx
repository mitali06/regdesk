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

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

const EXAMPLES = [
  "What is the maximum debt-to-income ratio for approval?",
  "What is the deductible for a named-storm event?",
  "At what HbA1c level is type 2 diabetes diagnosed?",
  "Does the insurance policy cover cyber liability?",
];

export default function App() {
  const [tab, setTab] = useState<"ask" | "evals">("ask");
  return (
    <div className="wrap">
      <header className="app">
        <div className="brand">
          <h1>RegDesk <span className="pill">demo</span></h1>
          <p>Ask questions about dense regulatory documents and get answers with citations — or an honest "I can't answer that."</p>
        </div>
        <div className="tabs">
          <button className={tab === "ask" ? "active" : ""} onClick={() => setTab("ask")}>Try it</button>
          <button className={tab === "evals" ? "active" : ""} onClick={() => setTab("evals")}>How good is it?</button>
        </div>
      </header>

      <section className="hero">
        <p>
          <strong>The problem:</strong> rules in finance, insurance, and healthcare are buried in long policy
          documents, and generic chatbots confidently make things up — unacceptable when a wrong answer has
          consequences. <strong>RegDesk</strong> retrieves the exact passage, answers with a citation you can
          check, and <strong>refuses rather than guess</strong> when the documents don't contain the answer.
        </p>
        <div className="how">
          <div className="step"><span className="num">1</span> Pick a question (or upload your own document)</div>
          <div className="step"><span className="num">2</span> RegDesk finds the relevant passages (hybrid search)</div>
          <div className="step"><span className="num">3</span> You get a cited answer — or an honest refusal</div>
        </div>
      </section>

      {tab === "ask" ? <Ask /> : <Evals />}

      <footer className="foot">
        <span>Portfolio project by <strong>Mitali Kasurde</strong> — a deployable, evaluation-instrumented RAG + agent system (FastAPI · React · hybrid retrieval · Claude).</span>
        <span className="links">
          {GITHUB && <a href={GITHUB} target="_blank" rel="noreferrer">GitHub repo →</a>}
          {LINKEDIN && <a href={LINKEDIN} target="_blank" rel="noreferrer">LinkedIn →</a>}
          <a href={`${API}/docs`} target="_blank" rel="noreferrer">API docs →</a>
        </span>
      </footer>
    </div>
  );
}

function Ask() {
  const [q, setQ] = useState("");
  const [hybrid, setHybrid] = useState(true);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  function refreshDocs() {
    fetch(`${API}/documents`).then(r => r.json()).then(d => setDocs(d.documents)).catch(() => {});
  }
  useEffect(refreshDocs, []);

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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploadMsg("Uploading…");
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Upload failed");
      setUploadMsg(`Added "${d.filename}" (${d.chunks_added} chunks). Ask about it below.`);
      refreshDocs();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <>
      <div className="card">
        <h3>Try a question</h3>
        <p className="hint">These run against the sample documents already loaded below. Click one, or type your own.</p>
        <div className="chips">
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="example" onClick={() => ask(ex)}>{ex}</button>
          ))}
        </div>
        <textarea value={q} onChange={e => setQ(e.target.value)}
          placeholder="…or type your own question about the loaded documents" />
        <div className="row">
          <button className="primary" onClick={() => ask()} disabled={loading || !q.trim()}>
            {loading ? "Thinking…" : "Ask"}
          </button>
          <label className="toggle" title="Hybrid combines semantic + keyword search">
            <input type="checkbox" checked={hybrid} onChange={e => setHybrid(e.target.checked)} />
            Hybrid retrieval (dense + keyword)
          </label>
        </div>
        {error && <div className="err">{error} — the API may be waking up (free tier sleeps after 15 min); try again in ~30s.</div>}
      </div>

      {resp && (
        <div className="card">
          <h3>
            Answer{" "}
            {resp.refused
              ? <span className="badge refused">refused — not in the documents</span>
              : <span className="badge ok">grounded &amp; cited</span>}
          </h3>
          <div className="answer">{resp.answer}</div>
          <div className="chips">
            <span className="chip">latency {resp.latency_ms} ms</span>
            <span className="chip">in {resp.input_tokens} tok</span>
            <span className="chip">out {resp.output_tokens} tok</span>
          </div>
          {resp.citations.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Sources <span className="hint inline">(every claim is traceable to a passage)</span></h3>
              {resp.citations.map((c, i) => (
                <div className="src" key={i}>
                  <div className="top"><code>{c.doc_id}</code><span className="chip">match {c.score.toFixed(3)}</span></div>
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
      )}

      <div className="card">
        <h3>Documents loaded {docs && <span className="chip">{docs.length} files</span>}</h3>
        <p className="hint">Answers come from these built-in sample documents. Add your own to query it too.</p>
        <ul className="doclist">
          {docs?.map((d, i) => <li key={i}><code>{d.name}</code> <span className="muted">· {d.chunks} chunks</span></li>)}
          {docs?.length === 0 && <li className="muted">No documents indexed.</li>}
        </ul>
        <input className="file" type="file" accept=".txt,.md,.pdf" onChange={onFile} />
        {uploadMsg && <div className="note">{uploadMsg}</div>}
      </div>
    </>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="bar">
      <span>{label}: {value.toFixed(3)}</span>
      <div className="track"><div className="fill" style={{ width: `${w}%` }} /></div>
    </div>
  );
}

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

  return (
    <div className="card">
      <h3>How good is it? (automated evaluation)</h3>
      <p className="hint">
        A demo that says "trust me" isn't enough. RegDesk grades itself on a labeled question set every run:
        does it retrieve the right document, cite the right source, and correctly refuse questions the
        documents can't answer?
      </p>
      <div className="row">
        <button className="primary" onClick={load} disabled={loading}>{loading ? "Running…" : "Re-run evaluation"}</button>
      </div>
      {error && <div className="err">{error}</div>}
      {card && (
        <>
          <div className="metric-grid" style={{ marginTop: 14 }}>
            <div className="metric"><div className="v">{pct(card.citation_accuracy)}</div><div className="k">Cited the right source</div></div>
            <div className="metric"><div className="v">{pct(card.refusal_correctness)}</div><div className="k">Correctly refused</div></div>
            <div className="metric"><div className="v">{card.avg_latency_ms ?? "—"} ms</div><div className="k">Avg latency</div></div>
          </div>
          <h3 style={{ marginTop: 18 }}>Did it find the right document? (recall@k)</h3>
          <table className="evals">
            <thead><tr><th>Top-k results</th><th>Keyword/semantic only</th><th>Hybrid</th></tr></thead>
            <tbody>
              {card.recall_at_k.map(r => (
                <tr key={r.k}><td>{r.k}</td><td>{pct(r.dense_only)}</td><td>{pct(r.hybrid)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            Measured on {card.answerable} answerable + {card.unanswerable} unanswerable questions. On this small,
            clean sample corpus both methods score near-perfect; the hybrid advantage shows on larger, messier
            document sets — upload more and re-run to see it move.
          </div>
        </>
      )}
    </div>
  );
}
