"use client";

import React, { useEffect, useRef, useState } from "react";

type HistoryItem = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Financials = {
  monthlyIncome?: number | null;
  basicSalary?: number | null;
  netSalary?: number | null;
  housingAllowance?: number | null;
  currentRent?: number | null;
  uploaded?: boolean;
};

export default function ChatUI() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversationClosed, setConversationClosed] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  
  // FIX: Added currentStage state for Objective 4 Persistence
  const [currentStage, setCurrentStage] = useState("DISCOVERY");

  const [history, setHistory] = useState<HistoryItem[]>([
    {
      id: "sys-0",
      role: "system",
      content:
        "Hi — I'm AskRivo. Upload your salary slip and I’ll help you decide whether renting or buying makes financial sense. All calculations are deterministic and privacy-safe.",
    },
  ]);

  const [financials, setFinancials] = useState<Financials | null>(null);
  const [toolPayload, setToolPayload] = useState<any | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history]);

  function pushHistory(item: HistoryItem) {
    setHistory((h) => [...h, item]);
  }

  async function handleFileUpload(file: File) {
    try {
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json?.extractedData) {
        throw new Error("Extraction failed");
      }

      setFinancials({
        ...json.extractedData,
        uploaded: true,
      });

      pushHistory({
        id: `sys-extract-${Date.now()}`,
        role: "system",
        content:
          "I’ve securely extracted and sanitized your financial details. You don’t need to type any numbers.",
      });
    } catch {
      setError("Failed to extract document. Please try another file.");
    }
  }

  async function sendMessage() {
    const txt = message.trim();
    if (!txt || loading || conversationClosed) return;

    if (
      awaitingConfirmation &&
      ["yes", "ok", "proceed", "go ahead", "agree"].some((p) =>
        txt.toLowerCase().includes(p)
      )
    ) {
      setConversationClosed(true);
      setAwaitingConfirmation(false);

      pushHistory({
        id: `sys-final-${Date.now()}`,
        role: "system",
        content:
          "Great. I’ve captured your intent. A mortgage specialist will contact you shortly.",
      });

      setToolPayload((p: any) => ({
        ...p,
        finalStatus: "LEAD_CAPTURED",
      }));

      setMessage("");
      return;
    }

    setLoading(true);
    setError(null);

    pushHistory({
      id: `u-${Date.now()}`,
      role: "user",
      content: txt,
    });

    setMessage("");

    const rentMatch = txt.match(/(\d{3,6})/);
    let updatedFinancials = financials ? { ...financials } : null;
    if (rentMatch && updatedFinancials) {
      updatedFinancials.currentRent = Number(rentMatch[1]);
      setFinancials(updatedFinancials);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((h) => h.role !== "system")
            .map((h) => ({ role: h.role, content: h.content })),
          currentUserMessage: txt,
          stage: currentStage,
          data: { financials: updatedFinancials },
        }),
      });

      const json = await res.json();

      if (!res.ok || json?.type === "ERROR") {
        throw new Error(json?.message || "Request failed");
      }

      // FIX: Update currentStage based on server response for sticky closing
      if (json?.stage) {
        setCurrentStage(json.stage);
      }

      if (json?.type === "QUESTION") {
        pushHistory({
          id: `a-${Date.now()}`,
          role: "assistant",
          content: json.message,
        });
      }

      if (json?.type === "RESULT") {
        setToolPayload({
          decision: json.decision,
          metrics: json.metrics,
          nextAction: null,
        });

        pushHistory({
          id: `a-${Date.now()}`,
          role: "assistant",
          content: json.explanation,
        });
      }

      if (json?.type === "CLOSE") {
        setAwaitingConfirmation(true);

        setToolPayload({
          decision: json.decision,
          metrics: json.metrics,
          nextAction: json.nextAction,
        });

        pushHistory({
          id: `a-${Date.now()}`,
          role: "assistant",
          content: json.message,
        });
      }
    } catch (e: any) {
      pushHistory({
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Error: ${String(e?.message ?? e)}`,
      });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="content" style={{ alignItems: "flex-start" }}>
      <div className="left">
        <div className="card instructions">
          <h3>AskRivo — Mortgage Advisor</h3>
          <p className="hint">
            Upload your salary slip. All calculations are deterministic and
            privacy-safe.
          </p>
        </div>

        <div className="card chat">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px dashed rgba(255,255,255,0.15)",
              marginBottom: 14,
            }}
          >
            <label style={{ cursor: "pointer", fontSize: 13, color: "#cbd5e1" }}>
              📄 Upload salary slip
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: "none" }}
                onChange={(e) =>
                  e.target.files && handleFileUpload(e.target.files[0])
                }
              />
            </label>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              PDF / Image · Secure OCR
            </span>
          </div>

          <div ref={scrollRef} className="chat-history">
            {history.map((h) => (
              <div key={h.id} className="msg-pair">
                <div className={`bubble ${h.role}`}>{h.content}</div>
              </div>
            ))}
            {loading && <div className="loading">Analyzing…</div>}
          </div>

          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              placeholder={
                conversationClosed
                  ? "Conversation completed"
                  : "Ask about rent vs buy or affordability"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || conversationClosed}
            />
            <button
              className="chat-btn send"
              onClick={sendMessage}
              disabled={loading || conversationClosed}
            >
              Ask
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </div>
      </div>

      <div className="right">
        <div className="card raw-card">
          <h4>Tool JSON (authoritative)</h4>
          <pre className="raw-box">
            {toolPayload
              ? JSON.stringify(toolPayload, null, 2)
              : "No tool result yet."}
          </pre>
        </div>
      </div>
    </div>
  );
}