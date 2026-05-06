import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "zapdev", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
