import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          glow: "var(--color-primary-glow)",
        },
        bg: {
          base: "var(--color-bg-base)",
          surface: "var(--color-bg-surface)",
          "surface-hover": "var(--color-bg-surface-hover)",
          highlight: "var(--color-bg-highlight)",
        },
        text: {
          main: "var(--color-text-main)",
          muted: "var(--color-text-muted)",
          faint: "var(--color-text-faint)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          highlight: "var(--color-border-highlight)",
        },
      },
      borderRadius: {
        xl: "var(--radius-xl)",
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        glow: "0 0 20px var(--color-primary-glow)",
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
      },
    },
  },
  plugins: [],
};

export default config;
