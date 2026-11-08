import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
import { createWorkboardSqliteStores } from "./sqlite-store.js";

const workerModuleUrl = new URL("./sqlite-store.worker.ts", import.meta.url);
const board = {
  version: 1 as const,
  board: { id: "ops", name: "Operations", createdAt: 1, updatedAt: 1 },
};

// This facade checks availability after a failure, so the call that observes the dead slot rejects.
async function afterAtMostOneRejection<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch {
    return call();
  }
}

it("recovers Workboard after its slot fails with a silent sibling retaining the actor", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "workboard-recovery-"));
  const dbPath = path.join(dir, "workboard.sqlite");
  const capture = vi.spyOn(Worker.prototype, "postMessage");
  const stores = createWorkboardSqliteStores({ dbPath, workerModuleUrl });
  const sibling = createWorkboardSqliteStores({ dbPath, workerModuleUrl });
  try {
    await Promise.all([stores.ready, sibling.ready]);
    await stores.boards.register("ops", board);
    const openRequestIndex = capture.mock.calls.findIndex(
      ([request]) => request?.type === "open" && request.databasePath === dbPath,
    );
    const worker = capture.mock.contexts[openRequestIndex];
    assert(worker instanceof Worker, "Workboard worker was not opened");
    worker.emit("error", new Error("database is locked"));
    await expect(afterAtMostOneRejection(() => stores.boards.lookup("ops"))).resolves.toEqual(
      board,
    );
    await expect(afterAtMostOneRejection(() => sibling.boards.lookup("ops"))).resolves.toEqual(
      board,
    );
    await stores.boards.delete("ops");
    await expect(stores.boards.lookup("ops")).resolves.toBeUndefined();
  } finally {
    capture.mockRestore();
    await Promise.all([stores.close(), sibling.close()]);
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

it("does not reopen the store for a single real database lock", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "workboard-recovery-"));
  const dbPath = path.join(dir, "workboard.sqlite");
  const stores = createWorkboardSqliteStores({ dbPath, workerModuleUrl });
  const holder = new DatabaseSync(dbPath);
  try {
    await stores.ready;
    await stores.boards.register("ops", board);
    holder.exec("BEGIN IMMEDIATE");
    const changed = { ...board, board: { ...board.board, updatedAt: 2 } };
    await expect(stores.boards.register("ops", changed)).rejects.toMatchObject({ errcode: 5 });
    holder.exec("ROLLBACK");
    await stores.boards.register("ops", changed);
    await expect(stores.boards.lookup("ops")).resolves.toEqual(changed);
    expect(await stores.dataVersion()).toBeLessThan(1_000_000_000);
  } finally {
    holder.close();
    await stores.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
