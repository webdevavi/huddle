import type { GlobalFlags } from "./config/types.js";

export type ParsedArgs = {
  globals: GlobalFlags;
  command: string[];
  options: Record<string, string | boolean>;
  positionals: string[];
};

function emptyGlobals(): GlobalFlags {
  return {
    help: false,
    version: false,
    json: false,
    noColor: false,
    quiet: false,
    verbose: false,
    noOpen: false,
    nonInteractive: false,
  };
}

function applyGlobalBool(globals: GlobalFlags, flag: string): boolean {
  switch (flag) {
    case "--help":
    case "-h":
      globals.help = true;
      return true;
    case "--version":
    case "-V":
      globals.version = true;
      return true;
    case "--json":
      globals.json = true;
      return true;
    case "--no-color":
      globals.noColor = true;
      return true;
    case "--quiet":
    case "-q":
      globals.quiet = true;
      return true;
    case "--verbose":
    case "-v":
      globals.verbose = true;
      return true;
    case "--no-open":
      globals.noOpen = true;
      return true;
    case "--non-interactive":
      globals.nonInteractive = true;
      return true;
    default:
      return false;
  }
}

/**
 * Minimal argv parser. Global flags may appear anywhere.
 * Command is the first non-flag token, optional second word for subcommands.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const globals = emptyGlobals();
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  const command: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;

    if (applyGlobalBool(globals, token)) {
      i += 1;
      continue;
    }

    if (token === "--server") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --server");
      }
      globals.server = value;
      i += 2;
      continue;
    }

    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        options[token.slice(2, eq)] = token.slice(eq + 1);
        i += 1;
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        options[key] = next;
        i += 2;
      } else {
        options[key] = true;
        i += 1;
      }
      continue;
    }

    if (token.startsWith("-") && token.length === 2) {
      options[token.slice(1)] = true;
      i += 1;
      continue;
    }

    if (command.length < 2) {
      command.push(token);
    } else {
      positionals.push(token);
    }
    i += 1;
  }

  return { globals, command, options, positionals };
}
