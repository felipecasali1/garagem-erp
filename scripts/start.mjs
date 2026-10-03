import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertSupportedNodeVersion } from "./check-node-version.mjs";
import { startProductionServer } from "./production-server.mjs";

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    assertSupportedNodeVersion();
    await startProductionServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
