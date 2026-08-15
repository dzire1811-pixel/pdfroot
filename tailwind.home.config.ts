import type { Config } from "tailwindcss";
import baseConfig from "./tailwind.config";

const config: Config = {
  ...baseConfig,
  content: [
    "./app/page.tsx",
    "./components/homepage/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/Brand.tsx",
    "./components/CookiePreferencesButton.tsx",
    "./components/Logo.tsx",
    "./components/SocialLinks.tsx",
    "./components/ToolDirectoryIcon.tsx",
  ],
};

export default config;
