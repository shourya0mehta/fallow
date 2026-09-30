import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Fallow",
  description: "A ledger for the thinking you hand to AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="masthead">
            <div className="wordmark">
              Fallow<small>a field book for your own thinking</small>
            </div>
            <Nav />
          </header>
          {children}
          <footer className="footer">
            Fallow tracks behavior: what you asked an AI to do, and what you did yourself. It does not measure your brain,
            diagnose anything, or predict disease. Retrievability and capacity are model outputs with borrowed parameters.
            Everything stays in one local file.
          </footer>
        </div>
      </body>
    </html>
  );
}
