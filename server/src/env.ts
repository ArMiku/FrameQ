import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

config({
  path: resolve(serverRoot, ".env"),
  override: false,
  quiet: true,
});
