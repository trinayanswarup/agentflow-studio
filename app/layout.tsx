import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Header } from "@/components/layout/Header";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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
        className={`${inter.variable} ${geistMono.variable} bg-gray-950 text-gray-100 antialiased`}
      >
        <Header />
        {children}
      </body>
    </html>
  );
}
