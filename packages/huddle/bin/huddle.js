#!/usr/bin/env node
/**
 * Public `npx huddle` entry. Delegates to @huddle/cli.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const cliRoot = dirname(require.resolve("@huddle/cli/package.json"));
await import(pathToFileURL(join(cliRoot, "dist/bin.js")).href);
