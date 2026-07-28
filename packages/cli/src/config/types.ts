export type HuddleConfig = {
  server: string;
  color: boolean;
  openBrowser: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  nonInteractive: boolean;
};

export type GlobalFlags = {
  help: boolean;
  version: boolean;
  json: boolean;
  noColor: boolean;
  quiet: boolean;
  verbose: boolean;
  noOpen: boolean;
  nonInteractive: boolean;
  server?: string;
};

export const DEFAULT_CONFIG: HuddleConfig = {
  server: "https://huddle.dev",
  color: true,
  openBrowser: true,
  json: false,
  quiet: false,
  verbose: false,
  nonInteractive: false,
};
