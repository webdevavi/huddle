/**
 * Injectable filesystem port so tests can simulate ENOSPC / permission loss.
 */

export class StorageUnavailableError extends Error {
  readonly code = "STORAGE_UNAVAILABLE" as const;

  constructor(message = "Host storage unavailable") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export interface FsPort {
  mkdir(path: string, opts?: { recursive?: boolean; mode?: number }): Promise<void>;
  writeFile(
    path: string,
    data: Uint8Array | string,
    opts?: { mode?: number; flag?: string },
  ): Promise<void>;
  appendFile(path: string, data: Uint8Array | string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  openExclusive(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  symlink(target: string, path: string): Promise<void>;
}

import { promises as fsp } from "node:fs";

export class NodeFsPort implements FsPort {
  async mkdir(path: string, opts?: { recursive?: boolean; mode?: number }): Promise<void> {
    await fsp.mkdir(path, { recursive: opts?.recursive ?? false, mode: opts?.mode });
  }

  async writeFile(
    path: string,
    data: Uint8Array | string,
    opts?: { mode?: number; flag?: string },
  ): Promise<void> {
    await fsp.writeFile(path, data, {
      mode: opts?.mode,
      flag: opts?.flag,
    });
  }

  async appendFile(path: string, data: Uint8Array | string): Promise<void> {
    await fsp.appendFile(path, data);
  }

  async readFile(path: string): Promise<Buffer> {
    return fsp.readFile(path);
  }

  async rename(from: string, to: string): Promise<void> {
    await fsp.rename(from, to);
  }

  async unlink(path: string): Promise<void> {
    await fsp.unlink(path);
  }

  async readdir(path: string): Promise<string[]> {
    return fsp.readdir(path);
  }

  async openExclusive(path: string, data: string): Promise<void> {
    await fsp.writeFile(path, data, { flag: "wx", mode: 0o600 });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fsp.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async realpath(path: string): Promise<string> {
    return fsp.realpath(path);
  }

  async symlink(target: string, path: string): Promise<void> {
    await fsp.symlink(target, path);
  }
}

/** Test double that fails writes after N successful write/append ops. */
export class FaultyFsPort implements FsPort {
  readonly inner: FsPort;
  #writesUntilFail: number;
  #failCode: "ENOSPC" | "EACCES";

  constructor(
    inner: FsPort,
    options: { writesUntilFail: number; failCode?: "ENOSPC" | "EACCES" },
  ) {
    this.inner = inner;
    this.#writesUntilFail = options.writesUntilFail;
    this.#failCode = options.failCode ?? "ENOSPC";
  }

  #maybeFail(): void {
    if (this.#writesUntilFail <= 0) {
      const err = new Error(
        this.#failCode === "ENOSPC" ? "No space left on device" : "Permission denied",
      ) as NodeJS.ErrnoException;
      err.code = this.#failCode;
      throw err;
    }
    this.#writesUntilFail -= 1;
  }

  mkdir(path: string, opts?: { recursive?: boolean; mode?: number }): Promise<void> {
    return this.inner.mkdir(path, opts);
  }

  async writeFile(
    path: string,
    data: Uint8Array | string,
    opts?: { mode?: number; flag?: string },
  ): Promise<void> {
    this.#maybeFail();
    return this.inner.writeFile(path, data, opts);
  }

  async appendFile(path: string, data: Uint8Array | string): Promise<void> {
    this.#maybeFail();
    return this.inner.appendFile(path, data);
  }

  readFile(path: string): Promise<Buffer> {
    return this.inner.readFile(path);
  }

  rename(from: string, to: string): Promise<void> {
    return this.inner.rename(from, to);
  }

  unlink(path: string): Promise<void> {
    return this.inner.unlink(path);
  }

  readdir(path: string): Promise<string[]> {
    return this.inner.readdir(path);
  }

  async openExclusive(path: string, data: string): Promise<void> {
    this.#maybeFail();
    return this.inner.openExclusive(path, data);
  }

  exists(path: string): Promise<boolean> {
    return this.inner.exists(path);
  }

  realpath(path: string): Promise<string> {
    return this.inner.realpath(path);
  }

  symlink(target: string, path: string): Promise<void> {
    return this.inner.symlink(target, path);
  }
}
