/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          base: "var(--surface-base)",
          panel: "var(--surface-panel)",
          elevated: "var(--surface-elevated)",
          overlay: "var(--surface-overlay)",
          input: "var(--surface-input)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          secondary: "var(--ink-secondary)",
          muted: "var(--ink-muted)",
          faint: "var(--ink-faint)",
        },
        accent: {
          DEFAULT: "#0fb8a3",
          dim: "rgba(15,184,163,0.10)",
          glow: "rgba(15,184,163,0.18)",
          text: "#4ecdc4",
        },
        ok: "#22c55e",
        warn: "#f59e0b",
        err: "#f87171",
        info: "#60a5fa",
      },
      borderColor: {
        subtle: "var(--border-subtle)",
        muted: "var(--border-muted)",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      boxShadow: {
        float:
          "0 8px 32px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        glow: "0 0 20px rgba(15,184,163,0.25)",
        "glow-sm": "0 0 10px rgba(15,184,163,0.15)",
      },
      animation: {
        in: "fadeSlideUp 0.3s cubic-bezier(0.16,1,0.3,1) both",
        "in-fast": "fadeSlideUp 0.18s cubic-bezier(0.16,1,0.3,1) both",
        fade: "fadeIn 0.2s ease both",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
