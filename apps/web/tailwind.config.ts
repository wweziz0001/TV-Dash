import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#090d14",
        panel: "#0f1726",
        accent: "#6ee7f9",
        ember: "#f59e0b",
        success: "#34d399",
        danger: "#fb7185",
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(110, 231, 249, 0.2), 0 24px 80px rgba(9, 13, 20, 0.45)",
      },
      backgroundImage: {
        "dashboard-grid":
          "linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
} satisfies Config;

