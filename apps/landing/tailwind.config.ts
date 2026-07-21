import type { Config } from "tailwindcss";
import sharedConfig from "@zenvy/ui/tailwind.config";

const config: Pick<Config, "prefix" | "presets" | "content"> = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [sharedConfig],
};

export default config;
