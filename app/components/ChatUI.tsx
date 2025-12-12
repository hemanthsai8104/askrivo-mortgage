// app/components/ChatUI.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

type HistoryItem = { id: string; role: "user" | "assistant" | "system"; content: string };
type ToolPayload = { name?: string; arguments?: any; result?: any; status?: number };

export default function ChatUI() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([
    { id: "s0", role: "system", content: "Hi — I'm AskRivo. How can I help with your mortgage today?" },
  ]);
  const [toolPayload, setToolPayload] = useState<ToolPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  function pushHistory(item: HistoryItem) {
    setHistory((h) => [...h, item]);
  }

  async function sendMessage() {
    const txt = message.trim();
    if (!txt || loading) return;

    setError(null);
    setLoading(true);
    setToolPayload(null);

    const userItem: HistoryItem = { id: `u-${Date.now()}`, role: "user", content: txt };
    pushHistory(userItem);
    setMessage("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: txt }),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => null);
        const errMsg = `Server ${res.status}: ${bodyText ?? res.statusText}`;
        pushHistory({ id: `err-${Date.now()}`, role: "assistant", content: `Error: ${errMsg}` });
        setError(errMsg);
        setLoading(false);
        return;
      }

      const json = await res.json().catch((e) => {
        const errMsg = `Invalid JSON from server: ${String(e)}`;
        pushHistory({ id: `err-json-${Date.now()}`, role: "assistant", content: `Error: ${errMsg}` });
        setError(errMsg);
        setLoading(false);
        return null;
      });

      if (!json) return;

      if (json.ok === false) {
        const err = json.error ?? "Unknown error";
        pushHistory({ id: `aerr-${Date.now()}`, role: "assistant", content: `Error: ${err}` });
        setError(err);
        setLoading(false);
        return;
      }

      // Main assistant response
      if (typeof json.modelResponse === "string" && json.modelResponse.trim()) {
        pushHistory({ id: `a-${Date.now()}`, role: "assistant", content: json.modelResponse });
      } //
      else if (json.tool && json.tool.result) {
        const r = json.tool.result;

        const warningsText = r.warnings?.length
          ? `Warnings: ${r.warnings.join("; ")}`
          : "";

        const summary = [
          "Numbers computed by the calculator tool.",
          `Loan Amount: ${r.loanAmount ?? "N/A"}`,
          `Monthly EMI: ${r.monthlyEMI ?? "N/A"}`,
          `Upfront Costs: ${r.hiddenFees ?? "N/A"}`,
          warningsText,
        ]
          .filter(Boolean)
          .join("  |  ");

        pushHistory({
          id: `a-tool-${Date.now()}`,
          role: "assistant",
          content: summary,
        });
      } //
      else {
        pushHistory({
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "No response from model. Check tool output.",
        });
      }

      // Store tool payload for the right-hand evidence panel
      if (json.tool) {
        setToolPayload(json.tool);
      } else {
        setToolPayload(null);
      }
    } catch (e: any) {
      const m = String(e?.message ?? e);
      pushHistory({ id: `aerr-${Date.now()}`, role: "assistant", content: `Network error: ${m}` });
      setError(m);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function downloadJSON() {
    if (!toolPayload) return;
    const blob = new Blob([JSON.stringify(toolPayload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tool-evidence.json";
    a.click();
  }

  async function copyJSON() {
    if (!toolPayload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(toolPayload, null, 2));
      window.alert("Tool JSON copied to clipboard.");
    } catch (e) {
      window.alert("Copy failed: " + String(e));
    }
  }

  return (
    <div className="content" style={{ alignItems: "flex-start" }}>
      <div className="left">
        <div className="card instructions">
          <h3>AskRivo — Mortgage Anti-Calculator</h3>
          <p className="hint">Ask anything — I’ll interpret it naturally, and calculate using the math tool.</p>
          <p className="hint">All numbers come from a deterministic calculator, not the AI.</p>
        </div>

        <div className="card chat" style={{ display: "flex", flexDirection: "column" }}>
          <div ref={scrollRef} className="chat-history" style={{ paddingRight: 8 }}>
            {history.map((h) => (
              <div key={h.id} className="msg-pair">
                <div className={`bubble ${h.role}`}>{h.content}</div>
              </div>
            ))}
            {loading && <div className="loading">Thinking…</div>}
          </div>

          <div className="composer" style={{ marginTop: 8 }}>
            <input
              ref={inputRef}
              className="composer-input"
              placeholder='Try: "EMI for 2,000,000 AED with 20% down in 25 years"'
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--glass)",
                color: "var(--muted)",
              }}
            />

            <div className="controls" style={{ marginTop: 8 }}>
              <button className="btn" onClick={sendMessage} disabled={loading}>
                {loading ? "Thinking..." : "Send"}
              </button>

              <button
                className="btn ghost"
                onClick={() => {
                  setMessage("");
                  inputRef.current?.focus();
                }}
                disabled={loading}
              >
                Clear
              </button>

              {error && <div className="error" style={{ marginLeft: 12 }}>{error}</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="right">
        <div className="card raw-card">
          <h4>Tool JSON (authoritative calculator output)</h4>

          <div className="raw-actions">
            <button className="btn small" onClick={downloadJSON} disabled={!toolPayload}>
              Download JSON
            </button>
            <button className="btn small ghost" onClick={copyJSON} disabled={!toolPayload}>
              Copy JSON
            </button>
            <button className="btn small ghost" onClick={() => setToolPayload(null)}>
              Clear
            </button>
          </div>

          <pre className="raw-box" style={{ marginTop: 8 }}>
            {toolPayload ? JSON.stringify(toolPayload, null, 2) : "No tool result yet."}
          </pre>
        </div>
      </div>
    </div>
  );
}
