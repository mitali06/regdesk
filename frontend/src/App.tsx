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

const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);
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
];
const REFUSE_EXAMPLE = "Does the insurance policy cover cyber liability?";

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
  warn: <svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.3 4l-7 12a2 2 0 001.7 3h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
  bot: <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M9.5 9a2.5 2.5 0 113.5 2.3c-.7.3-1 .8-1 1.7M12 16h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  layers: <svg viewBox="0 0 24 24" fill="none"><path d="M5 4h8l3 3v6H5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 9h12v11H9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
  menu: <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  logo: <svg viewBox="0 0 32 32" fill="none"><path d="M9.6 11h4.1v4.1c0 2.4-1.4 3.9-3.8 4.4l-.5-1.7c1.1-.3 1.7-.9 1.8-1.8H9.6z" fill="#fff"/><path d="M16.3 11h4.1v4.1c0 2.4-1.4 3.9-3.8 4.4l-.5-1.7c1.1-.3 1.7-.9 1.8-1.8h-1.6z" fill="#fff"/><path d="M9.6 23h12.8" stroke="#c9ccff" strokeWidth="1.9" strokeLinecap="round"/></svg>,
};

const NAV: { id: View; label: string; icon: JSX.Element }[] = [
  { id: "ask", label: "Ask", icon: I.ask },
  { id: "docs", label: "Documents", icon: I.doc },
  { id: "evals", label: "Evaluations", icon: I.chart },
];

export default function App() {
  const [view, setView] = useState<View>("ask");
  const [health, setHealth] = useState<"live" | "wake" | "unknown">("unknown");
  const [docCount, setDocCount] = useState<number | null>(null);
  const [askKey, setAskKey] = useState(0);
  const [seed, setSeed] = useState<string | null>(null);
  const [topQ, setTopQ] = useState("");
  function newQuery() { setSeed(null); setAskKey(k => k + 1); setView("ask"); }
  function runSearch() { const t = topQ.trim(); if (!t) return; setSeed(t); setAskKey(k => k + 1); setView("ask"); setTopQ(""); }

  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(() => setHealth("live"))
      .catch(() => setHealth("wake"));
  }, []);

  const [navOpen, setNavOpen] = useState(false);
  const go = (v: View) => { setView(v); setNavOpen(false); };
  const crumb = NAV.find(n => n.id === view)!.label;

  return (
    <div className={`app${navOpen ? " nav-open" : ""}`}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <aside className="side" aria-label="Primary navigation">
        <div className="logo">
          <div className="logomark">{I.logo}</div>
          <div><b>RegDesk</b><div className="sub">Grounded answers, cited</div></div>
        </div>
        <div className="navlabel">Workspace</div>
        {NAV.map(n => (
          <button key={n.id} className={`nav${view === n.id ? " active" : ""}`} aria-current={view === n.id ? "page" : undefined} onClick={() => go(n.id)}>
            {n.icon} {n.label}
            {n.id === "docs" && docCount != null && <span className="count">{docCount}</span>}
          </button>
        ))}
        <div className="navlabel">Resources</div>
        <a className="nav" href={`${API}/docs`} target="_blank" rel="noreferrer">{I.api} API reference</a>
        <button className="nav" onClick={() => go("evals")}>{I.info} How it works</button>
        <div className="spacer" />
        <div className="userbox">
          <div className="avatar">MK</div>
          <div><div className="nm">Mitali Kasurde</div><div className="role">Admin · Demo org</div></div>
        </div>
      </aside>

      <main className="main" id="main">
        <div className="topbar">
          <button className="hamburger" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(o => !o)}>{I.menu}</button>
          <div className="crumb">RegDesk / <b>{crumb}</b></div>
          <form className="topsearch" onSubmit={e => { e.preventDefault(); runSearch(); }}>
            {I.search}
            <input value={topQ} onChange={e => setTopQ(e.target.value)} placeholder="Ask across your documents…" aria-label="Ask across your documents" />
          </form>
          <div className={`status ${health === "live" ? "live" : "wake"}`} role="status" aria-live="polite">
            <span className="dot" />
            {health === "live" ? "API live" : health === "wake" ? "API waking…" : "Connecting…"}
          </div>
          <button className="ghostbtn" onClick={newQuery} aria-label="Start a new query">{I.plus} <span className="lbl-txt">New query</span></button>
        </div>

        <div className="scroll">
          {view === "ask" && <Ask key={askKey} seed={seed} />}
          {view === "docs" && <Documents onCount={setDocCount} />}
          {view === "evals" && <Evals />}
        </div>
      </main>
    </div>
  );
}

/* ---------- Trust strip (live from /evals) ---------- */
function TrustStrip() {
  const [card, setCard] = useState<Scorecard | null>(null);
  useEffect(() => {
    fetch(`${API}/evals`).then(r => (r.ok ? r.json() : null)).then(setCard).catch(() => {});
  }, []);
  const stats = [
    { v: pct(card?.citation_accuracy), k: <>cited the right source<br />{card ? `(${card.answerable} answerable questions)` : " "}</> },
    { v: pct(card?.refusal_correctness), k: <>correctly refused<br />{card ? `(${card.unanswerable} unanswerable questions)` : " "}</> },
    { v: card?.avg_latency_ms != null ? `${card.avg_latency_ms} ms` : "—", k: <>avg response time<br />measured this run</> },
    { v: "0", k: <>answers from the<br />open web — by design</> },
  ];
  return (
    <div className="trust">
      {stats.map((s, i) => (
        <div className="stat" key={i}><div className="v">{s.v}</div><div className="k">{s.k}</div></div>
      ))}
    </div>
  );
}

/* ---------- Ask ---------- */
function Ask({ seed }: { seed?: string | null }) {
  const [q, setQ] = useState(seed ?? "");
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

  useEffect(() => { if (seed) ask(seed); /* run seeded question once on mount */ }, []);

  return (
    <section className="view">
      {/* HERO */}
      <div className="hero">
        <span className="tag"><span className="d2" /> For credit, insurance, and clinical teams — sensitive documents, high-stakes answers</span>
        <h1>Exact answers from your most <span className="g">sensitive documents</span> — sourced, every time.</h1>
        <p className="herosub">RegDesk is built for the documents where a confident guess is a liability — credit policies, insurance contracts, and clinical guidelines. It does two things well: <b>retrieve the precise rule or figure from a single critical document</b>, and <b>make cohesive sense of what a set of documents says together</b> — citing every claim back to its source.</p>
        <TrustStrip />
      </div>

      {/* FUNCTIONAL ASK */}
      <div className="askcard">
        <p className="lbl">Try it against the loaded documents</p>
        <div className="chips">
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="chip-q" onClick={() => ask(ex)}>{ex}</button>
          ))}
          <button className="chip-q refuse" onClick={() => ask(REFUSE_EXAMPLE)} title="See it refuse a question the documents can't answer">
            {REFUSE_EXAMPLE}
          </button>
        </div>
        <div className="inputrow">
          <div className="inputwrap">
            <textarea value={q} onChange={e => setQ(e.target.value)}
              aria-label="Your question about the loaded documents"
              placeholder="…or type your own question about the loaded documents"
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }} />
          </div>
          <button className="askbtn" onClick={() => ask()} disabled={loading || !q.trim()}>
            {loading ? <><span className="spin" />Thinking…</> : "Ask →"}
          </button>
        </div>
        <div className="ctrls">
          <button type="button" className="switch" role="switch" aria-checked={hybrid} onClick={() => setHybrid(h => !h)} title="Hybrid combines semantic + keyword search">
            <span className={`track${hybrid ? " on" : ""}`} />
            Hybrid retrieval (dense + keyword)
          </button>
          <span>· Refuses below the semantic-match threshold</span>
        </div>
        {error && <div className="err">{error} — the API may be waking up (free tier sleeps after ~15 min). Give it ~30s and try again.</div>}
      </div>

      {loading && (
        <div className="answer skel" aria-hidden="true">
          <div className="ans-head"><span className="skbox" /><span className="skline w30" /></div>
          <div className="ans-body"><span className="skline" /><span className="skline" /><span className="skline w70" /><div className="skmeta"><span className="skpill" /><span className="skpill" /><span className="skpill" /></div></div>
        </div>
      )}

      {resp && (
        <div className="answer" aria-live="polite">
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

      {/* WHY IT MATTERS */}
      <div className="why">
        <p className="why-lbl">Why it matters</p>
        <p>In regulated work, a decision turns on what a <b>specific clause actually says</b> — or on what a <b>set of documents collectively requires</b>. A general chatbot answers from memory and can't show its work: fine for brainstorming, unacceptable when the output drives an underwriting decision, a claim, or a clinical step. RegDesk treats the document as the source of truth — it answers <b>only</b> from what's in your documents, cites the passage, and refuses when they don't cover the question.</p>
      </div>

      {/* TWO JOBS */}
      <h2 className="sechead">Two jobs, one source of truth</h2>
      <p className="secsub">Whether the answer lives in one paragraph of one document or has to be assembled across several, every claim stays traceable to where it came from.</p>
      <div className="jobs">
        <div className="job">
          <div className="job-ic">{I.search}</div>
          <div className="job-role">Pinpoint retrieval</div>
          <h3>Find the exact answer in one document</h3>
          <p>Pull a specific rule, threshold, or clause out of a long, dense document — and see the exact passage it came from, not a paraphrase.</p>
          <div className="demo">
            <div className="demo-q"><span>Question</span>"What's the maximum debt-to-income ratio for approval?"</div>
            <div className="demo-a">The maximum DTI ratio is <b>43%</b> for qualified mortgages; above it requires manual underwriting.<sup>[1]</sup></div>
            <div className="citerow"><span className="cite">credit_policy_2024.pdf · p.12</span></div>
            <div className="prov">Grounded in <b>1 source</b> · exact passage shown</div>
          </div>
        </div>
        <div className="job">
          <div className="job-ic">{I.layers}</div>
          <div className="job-role">Cohesive synthesis</div>
          <h3>Make sense of a set of documents</h3>
          <p>Ask what several documents say together. RegDesk assembles the answer across sources — without losing which claim came from which document.</p>
          <div className="demo">
            <div className="demo-q"><span>Question</span>"What's a homeowner's total exposure for a named storm?"</div>
            <div className="demo-a">The named-storm deductible is <b>2% of dwelling value</b><sup>[1]</sup>, separate from the standard $1,000 deductible<sup>[2]</sup>; flood damage is excluded and needs a separate policy.<sup>[3]</sup></div>
            <div className="citerow"><span className="cite">homeowners_insurance.md · §4</span><span className="cite">§2.1</span><span className="cite">exclusions · §7</span></div>
            <div className="prov">Synthesized across <b>3 passages</b> · each claim cited</div>
          </div>
        </div>
      </div>

      {/* COMPARISON */}
      <h2 className="sechead">The same question, two kinds of AI</h2>
      <p className="secsub">Toggle between a question the documents <i>can</i> answer and one they <i>can't</i>. Watch where a generic assistant goes wrong — and what RegDesk does instead.</p>
      <Comparison />

      {/* DEPLOY */}
      <div className="deploy">
        <h3>Built to run where the sensitive data already lives</h3>
        <p>Because the documents are sensitive, RegDesk runs inside your own infrastructure — files and questions never leave your boundary. It ships as an API and an MCP server, Dockerized and CI-tested, so it drops into an underwriting, claims, or review workflow and can be versioned and audited like any other service.</p>
        <div className="deploy-row">
          {["Your infra · your data", "REST API", "MCP server", "Docker", "CI-tested", "Self-grading evals"].map(t => <span className="t" key={t}>{t}</span>)}
        </div>
      </div>

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

/* ---------- Comparison (illustrative) ---------- */
function Comparison() {
  const [c, setC] = useState<"a" | "u">("a");
  const answerable = c === "a";
  return (
    <div className="cmpwrap">
      <div className="cmptabs" role="tablist" aria-label="Example question type">
        <button role="tab" aria-selected={answerable} className={`cmptab${answerable ? " active" : ""}`} onClick={() => setC("a")}>Answerable question</button>
        <button role="tab" aria-selected={!answerable} className={`cmptab${!answerable ? " active" : ""}`} onClick={() => setC("u")}>Unanswerable question</button>
      </div>
      <div className="qbar">
        <span className="ql">Question</span>
        <span className="qt">{answerable
          ? "“What is the maximum debt-to-income ratio for loan approval?”"
          : "“Does the insurance policy cover cyber liability?”"}</span>
      </div>
      <div className="cmpgrid">
        <div className="col generic">
          <div className="colhead generic">
            <div className="av">{I.bot}</div>
            <div><div className="nm">Generic AI assistant</div><div className="sb">answers from training data</div></div>
          </div>
          <span className="badge warn">{I.warn} {answerable ? "Confident — but unverifiable" : "Confident — and wrong"}</span>
          {answerable ? (
            <div className="ans-c gen">Generally, lenders look for a debt-to-income ratio below <b>36%</b>, though some programs allow up to about <b>43–50%</b> depending on the lender and loan type.<sup className="qmark">[?]</sup></div>
          ) : (
            <div className="ans-c gen">Yes — most modern policies include cyber liability coverage, typically covering data breaches and certain third-party claims up to your policy limits.<sup className="qmark">[?]</sup></div>
          )}
          <div className="flaw"><b>The problem:</b> {answerable
            ? "no source, hedged ranges, and nothing to trace. In a compliance setting this is a guess dressed up as an answer."
            : "the loaded policy says nothing about cyber liability — so this is fabricated. A generic assistant will still confidently produce an answer."}</div>
        </div>
        <div className="col regdesk">
          <div className="colhead regdesk">
            <div className="av">{I.shield}</div>
            <div><div className="nm">RegDesk</div><div className="sb">answers from your documents only</div></div>
          </div>
          {answerable
            ? <span className="badge ok">{I.check} Grounded &amp; cited</span>
            : <span className="badge refused">{I.ban} Refused — not in the documents</span>}
          {answerable ? (
            <>
              <div className="ans-c">The maximum debt-to-income ratio for loan approval is <b>43%</b> for qualified mortgages; applications above it require manual underwriting with documented compensating factors.<sup className="cmark">[1]</sup></div>
              <div className="src">
                <div className="top"><code>credit_policy_2024.pdf · p.12</code><span className="matchpct">match 0.913</span></div>
                <div className="snip">"…a maximum debt-to-income ratio of 43% applies to all qualified mortgage products. Applications exceeding this limit must be escalated to manual underwriting…"</div>
              </div>
              <div className="provc">Grounded in <b>3 indexed documents</b> · <b>0</b> from the open web</div>
              <div className="winline">{I.check}<span>One exact number, traceable to the passage it came from.</span></div>
            </>
          ) : (
            <>
              <div className="ans-c">I can't answer that from the loaded documents — none of them address cyber liability coverage. Rather than guess, RegDesk abstains.</div>
              <div className="provc">Best semantic match <b>0.21</b> · below the <b>0.28</b> refusal threshold → no answer generated</div>
              <div className="winline">{I.check}<span>Refusing a question it can't ground is the feature, not a failure.</span></div>
            </>
          )}
        </div>
      </div>
      <div className="cmpnote">Illustrative — the “Generic AI assistant” column is a representative example of typical ungrounded behavior, shown for contrast.</div>
    </div>
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
        {!docs && !error && [0, 1, 2].map(i => (
          <div className="docrow skel" key={i} aria-hidden="true"><span className="skbox" /><div style={{ flex: 1 }}><span className="skline w40" /><span className="skline w20" /></div></div>
        ))}
        <label className="uploadzone">
          Drop a <b>.pdf, .md or .txt</b> here, or click to browse — it's chunked and searchable in seconds
          <input type="file" accept=".txt,.md,.pdf" onChange={onFile} aria-label="Upload a .pdf, .md, or .txt document" />
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

      {loading && !card && (
        <div className="grid3" aria-hidden="true">
          {[0, 1, 2].map(i => <div className="metric skel" key={i}><span className="skline w40" style={{ height: 26 }} /><span className="skline w70" /></div>)}
        </div>
      )}

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
