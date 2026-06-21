import { useState } from "react";

type Citation = { doc_id: string; snippet: string };
type AskResponse = {
  answer: string;
  citations: Citation[];
  refused: boolean;
  latency_ms: number;
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function App() {
  const [q, setQ] = useState("");
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!r.ok) throw new Error(`Request failed: ${r.status}`);
      setResp((await r.json()) as AskResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>RegDesk</h1>
      <p>Ask a question about the regulated-document corpus. Answers are grounded and cited.</p>
      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        rows={3}
        style={{ width: "100%" }}
        placeholder="e.g. What is the maximum debt-to-income ratio for approval?"
      />
      <button onClick={ask} disabled={loading || !q.trim()}>
        {loading ? "Thinking…" : "Ask"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {resp && (
        <section style={{ marginTop: 24 }}>
          {resp.refused && <p><em>Refused (insufficient grounding).</em></p>}
          <p>{resp.answer}</p>
          <small>Latency: {resp.latency_ms} ms</small>
          <ul>
            {resp.citations.map((c, i) => (
              <li key={i}><code>{c.doc_id}</code>: {c.snippet}…</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
