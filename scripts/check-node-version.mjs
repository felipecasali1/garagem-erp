import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const minimumNodeVersion = "22.12.0";

export function supportsNodeVersion(version) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    version,
  );
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (major !== 22) return major > 22;
  if (minor !== 12) return minor > 12;
  if (patch > 0) return true;
  return !match[4];
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  if (!supportsNodeVersion(version)) {
    throw new Error(
      `GaragemERP requires Node.js >=${minimumNodeVersion}; current version is ${version}. ` +
        "Use the version in .nvmrc, then retry.",
    );
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    assertSupportedNodeVersion();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
