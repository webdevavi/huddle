/**
 * Exit-code families (§58). Distinct ranges keep scripts diagnosable.
 */
export const ExitCode = {
  SUCCESS: 0,
  USAGE: 2,
  PREREQUISITE: 10,
  AUTHENTICATION: 20,
  NETWORK: 30,
  COMPATIBILITY: 40,
  POLICY: 50,
  STORAGE: 60,
  PROVIDER: 70,
  INTERNAL: 80,
} as const;

export type ExitCodeName = keyof typeof ExitCode;
export type ExitCodeValue = (typeof ExitCode)[ExitCodeName];
