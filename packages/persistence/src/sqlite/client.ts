import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));

/** Resolve migration SQL relative to repo layout (src or dist). */
export function loadControlPlaneMigrationSql(): string {
  const candidates = [
    join(here, "../../../../deploy/migrations/001_control_plane.sql"),
    join(process.cwd(), "deploy/migrations/001_control_plane.sql"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      // try next
    }
  }
  throw new Error("Unable to locate deploy/migrations/001_control_plane.sql");
}

export function openSqliteDatabase(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

export function migrateSqlite(db: DatabaseSync): void {
  db.exec(loadControlPlaneMigrationSql());
}

export function createMigratedSqlite(path = ":memory:"): DatabaseSync {
  const db = openSqliteDatabase(path);
  migrateSqlite(db);
  return db;
}
