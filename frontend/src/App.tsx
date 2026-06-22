import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type Citation = {
  doc_id: string; snippet: string; score: number; dense: number; lexical: number;
};
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

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export default function App() {
  const [tab, setTab] = useState<"ask" | "evals">("ask");
  return (
    <div className="wrap">
      <header className="app">
        <div className="brand">
          <h1>RegDesk</h1>
          <p>Grounded RAG + agent over regulated documents — hybrid retrieval, cited answers, measured.</p>
        </div>
        <div className="tabs">
          <button className={tab === "ask" ? "active" : ""} onClick={() => setTab("ask")}>Ask</button>
          <button className={tab === "evals" ? "active" : ""} onClick={() => setTab("evals")}>Evals</button>
        </div>
      </header>
      {tab === "ask" ? <Ask /> : <Evals />}
    </div>
  );
}

function Ask() {
  const [q, setQ] = useState("");
  const [hybrid, setHybrid] = useState(true);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexed, setIndexed] = useState<number | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/health`).then(r => r.json()).then(d => setIndexed(d.chunks_indexed)).catch(() => {});
  }, []);

  async function ask() {
    setLoading(true); setError(null); setResp(null);
    try {
      const r = await fetch(`${API}/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, hybrid }),
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
      setIndexed(d.total_chunks);
      setUploadMsg(`Added "${d.filename}" (${d.chunks_added} chunks). Ask about it below.`);
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <>
      <div className="card">
        <h3>Documents {indexed != null && <span className="chip">{indexed} chunks indexed</span>}</h3>
        <input className="file" type="file" accept=".txt,.md,.pdf" onChange={onFile} />
        {uploadMsg && <div className="note">{uploadMsg}</div>}
      </div>

      <div className="card">
        <h3>Ask</h3>
        <textarea value={q} onChange={e => setQ(e.target.value)}
          placeholder="e.g. What is the maximum debt-to-income ratio for approval?" />
        <div className="row">
          <button className="primary" onClick={ask} disabled={loading || !q.trim()}>
            {loading ? "Thinking…" : "Ask"}
          </button>
          <label className="toggle">
            <input type="checkbox" checked={hybrid} onChange={e => setHybrid(e.target.checked)} />
            Hybrid retrieval (dense + BM25)
          </label>
        </div>
        {error && <div className="err">{error}</div>}
      </div>

      {resp && (
        <div className="card">
          <h3>
            Answer{" "}
            {resp.refused
              ? <span className="badge refused">refused — insufficient grounding</span>
              : <span className="badge ok">grounded</span>}
          </h3>
          <div className="answer">{resp.answer}</div>
          <div className="chips">
            <span className="chip">latency {resp.latency_ms} ms</span>
            <span className="chip">in {resp.input_tokens} tok</span>
            <span className="chip">out {resp.output_tokens} tok</span>
          </div>
          {resp.citations.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Sources</h3>
              {resp.citations.map((c, i) => (
                <div className="src" key={i}>
                  <div className="top">
                    <code>{c.doc_id}</code>
                    <span className="chip">fused {c.score.toFixed(3)}</span>
                  </div>
                  <div className="snip">{c.snippet}…</div>
                  <div className="bars">
                    <ScoreBar label="dense" value={c.dense} max={1} />
                    <ScoreBar label="bm25" value={c.lexical} max={Math.max(c.lexical, 8)} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
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
      <h3>Evaluation scorecard</h3>
      <div className="row">
        <button className="primary" onClick={load} disabled={loading}>
          {loading ? "Running…" : "Re-run evals"}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      {card && (
        <>
          <div className="metric-grid" style={{ marginTop: 14 }}>
            <div className="metric"><div className="v">{pct(card.citation_accuracy)}</div><div className="k">Citation accuracy</div></div>
            <div className="metric"><div className="v">{pct(card.refusal_correctness)}</div><div className="k">Refusal correctness</div></div>
            <div className="metric"><div className="v">{card.avg_latency_ms ?? "—"} ms</div><div className="k">Avg latency</div></div>
          </div>
          <h3 style={{ marginTop: 18 }}>Recall@k — dense-only vs hybrid</h3>
          <table className="evals">
            <thead><tr><th>k</th><th>Dense only</th><th>Hybrid (dense+BM25)</th></tr></thead>
            <tbody>
              {card.recall_at_k.map(r => (
                <tr key={r.k}><td>{r.k}</td><td>{pct(r.dense_only)}</td><td>{pct(r.hybrid)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            Measured on {card.answerable} answerable + {card.unanswerable} unanswerable questions.
            On this small, domain-separated sample corpus, dense and hybrid both saturate; the hybrid
            advantage shows up on larger, noisier corpora — upload more documents and re-run to see it move.
          </div>
        </>
      )}
    </div>
  );
}
