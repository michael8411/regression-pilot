/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        glass: {
          50: "rgba(255, 255, 255, 0.02)",
          100: "rgba(255, 255, 255, 0.04)",
          200: "rgba(255, 255, 255, 0.07)",
          300: "rgba(255, 255, 255, 0.10)",
          400: "rgba(255, 255, 255, 0.15)",
        },
        surface: {
          base: "#0a0b0f",
          raised: "rgba(16, 18, 24, 0.80)",
          overlay: "rgba(22, 25, 34, 0.70)",
        },
        accent: {
          DEFAULT: "#14b8a6",
          light: "#5eead4",
          dim: "#0d9488",
          glow: "rgba(20, 184, 166, 0.20)",
        },
        ink: {
          DEFAULT: "rgba(255, 255, 255, 0.85)",
          secondary: "rgba(255, 255, 255, 0.50)",
          muted: "rgba(255, 255, 255, 0.28)",
          faint: "rgba(255, 255, 255, 0.12)",
        },
        ok: "#34d399",
        warn: "#fbbf24",
        err: "#fb7185",
      },
      fontFamily: {
        sans: ['"Outfit"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      boxShadow: {
        glass: "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
        "glass-up": "0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        glow: "0 0 24px rgba(20,184,166,0.25)",
        "glow-sm": "0 0 12px rgba(20,184,166,0.18)",
      },
      animation: {
        "in": "fadeSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "in-fast": "fadeSlideUp 0.2s cubic-bezier(0.16,1,0.3,1) both",
        "fade": "fadeIn 0.25s ease both",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
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
