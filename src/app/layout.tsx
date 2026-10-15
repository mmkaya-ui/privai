import type { Metadata } from "next";
// Self-hosted from npm: the build makes no request to Google Fonts and the app loads no third-party font.
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "PrivAI - Multi-Model AI Chat",
  description: "Secure, local-first AI chat client for OpenAI, Claude, Gemini, and more.",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
