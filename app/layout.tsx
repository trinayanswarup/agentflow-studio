import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AgentFlow Studio — Visual AI Workflow Builder",
  description:
    "Drag nodes onto a canvas, wire them together, and run them. A custom TypeScript execution engine walks the graph, calls LLMs and tools, streams a live trace, and pauses for human review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-gray-950 text-gray-100 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
