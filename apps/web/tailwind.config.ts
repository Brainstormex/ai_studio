import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1419",
        paper: "#f4efe6",
        accent: "#c45c26",
        moss: "#2f5d50",
        mist: "#d7e0dc",
      },
      fontFamily: {
        display: ["\"Fraunces\"", "Georgia", "serif"],
        body: ["\"Source Sans 3\"", "Segoe UI", "sans-serif"],
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at 20% 20%, rgba(196,92,38,0.12), transparent 40%), radial-gradient(circle at 80% 0%, rgba(47,93,80,0.16), transparent 35%), linear-gradient(160deg, #f7f2ea 0%, #e8efe9 55%, #f3ebe1 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
