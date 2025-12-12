// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "AskRivo — Mortgage Friend",
  description: "Anti-calculator mortgage assistant for UAE buyers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <div className="page-root">
          <header className="topbar card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="brand">
              <div className="logo">AR</div>
              <div>
                <div className="title">AskRivo</div>
                <div className="subtitle">Mortgage friend — anti-calculator</div>
              </div>
            </div>

            <div style={{ marginLeft: "auto" }} className="info">
              Built for the UAE — deterministic math only
            </div>
          </header>

          <main className="content" style={{ marginTop: 8 }}>
            {/* keep children in the layout's columns so pages using .left/.right work */}
            {children}
          </main>

          <footer className="footer" style={{ marginTop: 18 }}>
            <div className="info">Numbers are computed by the deterministic calculator — the AI only composes language.</div>
          </footer>
        </div>
      </body>
    </html>
  );
}
