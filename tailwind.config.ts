import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "oklch(1 0 0)",
        foreground: "oklch(0.18 0 0)",
        card: "oklch(1 0 0)",
        "card-foreground": "oklch(0.18 0 0)",
        popover: "oklch(1 0 0)",
        "popover-foreground": "oklch(0.18 0 0)",
        primary: "oklch(0.598 0.214 27.3)",
        "primary-foreground": "oklch(0.99 0 0)",
        secondary: "oklch(0.97 0 0)",
        "secondary-foreground": "oklch(0.205 0 0)",
        muted: "oklch(0.968 0 0)",
        "muted-foreground": "oklch(0.5 0 0)",
        accent: "oklch(0.968 0.008 27)",
        "accent-foreground": "oklch(0.598 0.214 27.3)",
        destructive: "oklch(0.598 0.214 27.3)",
        border: "oklch(0.922 0 0)",
        input: "oklch(0.922 0 0)",
        ring: "oklch(0.598 0.214 27.3)",
        success: "oklch(0.62 0.16 150)",
        "success-foreground": "oklch(0.99 0 0)",
        brand: {
          50: "#fff1f1",
          100: "#ffe1e1",
          500: "#ff1a1a",
          600: "#e60000",
          700: "#b80000",
          900: "#0b0f1a",
        },
      },
      boxShadow: {
        glow: "0 24px 80px rgba(37, 99, 235, 0.18)",
        card: "0 18px 55px rgba(15, 23, 42, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
