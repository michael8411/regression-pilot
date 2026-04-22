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
          sunken: "var(--surface-sunken)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          secondary: "var(--ink-secondary)",
          muted: "var(--ink-muted)",
          faint: "var(--ink-faint)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          text: "var(--accent-text)",
          dim: "var(--accent-dim)",
          glow: "var(--accent-glow)",
        },
        ai: {
          DEFAULT: "var(--ai)",
          dim: "var(--ai-dim)",
          glow: "var(--ai-glow)",
        },
        ok: "var(--ok)",
        warn: "var(--warn)",
        err: "var(--err)",
        info: "var(--info)",
      },
      borderColor: {
        subtle: "var(--border-subtle)",
        muted: "var(--border-muted)",
        strong: "var(--border-strong)",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', '"SF Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        float: "var(--shadow-float)",
        glow: "var(--shadow-glow)",
        "glow-sm": "var(--shadow-glow-sm)",
        ai: "var(--shadow-ai)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      transitionTimingFunction: {
        smooth: "var(--ease-out)",
        "smooth-inout": "var(--ease-in-out)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "220ms",
        slow: "320ms",
      },
      /* v1 animations — kept alive for v1 screens (SetupView, SelectView,
         GenerateView, ReviewView, ChatView) until they are rewritten in
         Phase 4. New code should prefer the .animate-* classes in
         styles/animations.css. */
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
