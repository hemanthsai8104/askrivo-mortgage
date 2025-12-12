// app/page.tsx
import React from "react";
import ChatUI from "./components/ChatUI";

export default function Page() {
  // ChatUI contains both left (chat) and right (tool JSON) columns
  return (
    <div style={{ width: "100%" }}>
      <div style={{ padding: "18px 8px 0 8px" }}>
        <h1 style={{ margin: "8px 0 6px 0", fontSize: 28 }}>AskRivo — Mortgage Friend</h1>
        <div style={{ color: "var(--muted)", marginBottom: 12 }}>
          Hi — I'm AskRivo. How can I help with your mortgage today?
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <ChatUI />
      </div>
    </div>
  );
}
