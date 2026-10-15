import { useState } from "react";
import { CheckCircle2, Loader2, Play, Trophy, X, XCircle } from "lucide-react";
import { BENCHMARK, runBrainBenchmark, type BenchResult } from "../lib/benchmark";

export default function BenchmarkModal({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<BenchResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setResults(null);
    // Let the spinner paint before the (fast, synchronous) run.
    setTimeout(() => {
      setResults(runBrainBenchmark());
      setRunning(false);
    }, 60);
  };

  const passed = results?.filter((r) => r.passed).length ?? 0;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2><Trophy size={20} className="inline-icon" /> Luno Benchmark</h2>
            <p>{BENCHMARK.length} auto-checked questions — maths, logic traps, code and knowledge. No cherry-picking: watch it live.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {!results && !running && (
          <div className="bench-intro">
            <p>This tests the <strong>built-in Luno Brain</strong> (the instant, zero-download tier). It computes maths exactly and runs verified code templates — so it should ace this test. The neural tiers (local 3B/7B, free-cloud 70B) handle the open-ended stuff this test can't grade automatically: ask them anything in chat with Deep Think on.</p>
            <button className="primary-btn" onClick={run}><Play size={16} /> Run benchmark</button>
          </div>
        )}
        {running && <div className="bench-running"><Loader2 className="spin" /> Testing…</div>}
        {results && (
          <>
            <div className={`bench-score ${passed === results.length ? "perfect" : ""}`}>
              {passed} / {results.length} correct
              <small>{passed === results.length ? "Perfect score. That's what exact tools + verification buys you." : "Honest scoring — fails are shown, not hidden."}</small>
            </div>
            <div className="bench-list">
              {results.map((r) => (
                <details key={r.q.id} className="bench-item">
                  <summary>
                    {r.passed ? <CheckCircle2 size={16} className="pass" /> : <XCircle size={16} className="fail" />}
                    <span className="bench-cat">{r.q.category}</span>
                    <span className="bench-q">{r.q.question}</span>
                    <span className="bench-ms">{r.ms}ms</span>
                  </summary>
                  <div className="bench-detail">
                    <div><strong>Expected:</strong> {r.q.expected}</div>
                    <div><strong>Luno answered:</strong></div>
                    <pre>{r.answer.slice(0, 900)}</pre>
                  </div>
                </details>
              ))}
            </div>
            <button className="primary-btn" onClick={run}><Play size={16} /> Run again</button>
          </>
        )}
      </div>
    </div>
  );
}
