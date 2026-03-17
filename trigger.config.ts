import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncVercelEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_rcarsutrurlwdirmpoty",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  build: {
    extensions: [syncVercelEnvVars()],
  },
});
