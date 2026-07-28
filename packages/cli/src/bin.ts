#!/usr/bin/env node
import { installSignalHandlers, runCli } from "./cli.js";

installSignalHandlers();

const result = await runCli();
process.exitCode = result.exitCode;
