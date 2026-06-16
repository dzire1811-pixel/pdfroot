import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
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
