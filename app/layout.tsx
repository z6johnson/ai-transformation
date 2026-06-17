import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Transformation Practice — OSI, UC San Diego",
  description:
    "Workspace for the AI Transformation Practice: AI-assisted Layer 1 lifecycle mapping and the executive measurement dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="site-header">
            <a className="brand" href="/">
              <span className="t-subhead">AI Transformation Practice</span>
              <span className="t-system">OSI</span>
            </a>
            <nav aria-label="Primary">
              <a href="/">Engagements</a>
              <a href="/dashboard">Dashboard</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <span>AI Transformation Practice · UC San Diego</span>
            <span aria-hidden="true">·</span>
            <span>Layer 1 mapping · Beta</span>
            <span className="push-end">AI drafts; a person confirms.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
