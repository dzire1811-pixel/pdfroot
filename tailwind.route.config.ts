import type { Config } from "tailwindcss";
import baseConfig from "./tailwind.config";

const config: Config = {
  ...baseConfig,
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};

export default config;
