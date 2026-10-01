import type { Metadata } from "next";
import "@fontsource/jersey-10/400.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./globals.css";
import "./fallow-extension.css";
import { FallowProvider } from "@/client/FallowProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Fallow",
  description: "A garden for the thinking you hand to AI. Every skill is a plant; the ones you stop using dry out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <FallowProvider>
          <div className="shell">
            <Header />
            {children}
            <footer className="foot">Fallow tracks what you ask AI to do and what you do yourself. It does not measure your brain or diagnose anything. Everything stays on your device.</footer>
          </div>
        </FallowProvider>
      </body>
    </html>
  );
}
