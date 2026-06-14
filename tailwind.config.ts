import type { Config } from "tailwindcss";

/**
 * AgentFlow Studio design tokens.
 *
 * - One chrome accent (`accent`, an indigo ramp) drives every interactive
 *   element: primary buttons, links, focus rings, active tabs. UI chrome never
 *   invents its own colour.
 * - The neutral `gray` ramp is overridden with a deliberate cool-slate scale so
 *   every surface reads as designed, not default-Tailwind. Existing
 *   `bg-gray-900` / `border-gray-800` classes resolve to these values.
 * - The six node-type hues (blue/purple/orange/yellow/red/green) are a separate
 *   *semantic* palette that encodes node meaning on the canvas — defined in
 *   `components/canvas/types.ts`, not here.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Single chrome accent.
        accent: {
          DEFAULT: "#6366f1",
          50:  "#eef0ff",
          100: "#e0e3ff",
          200: "#c6cbff",
          300: "#a3a8fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#2e2a82",
        },
        // Deliberate cool-slate neutral ramp (overrides default gray).
        gray: {
          50:  "#f5f6f8",
          100: "#e9ebf0",
          200: "#d3d7e0",
          300: "#aab1c2",
          400: "#7e8799",
          500: "#5b6475",
          600: "#444c5c",
          700: "#2f3542",
          800: "#212734",
          900: "#151922",
          950: "#0c0e15",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)",
        "accent-glow": "0 0 0 1px rgba(99,102,241,0.4), 0 0 24px -4px rgba(99,102,241,0.5)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
