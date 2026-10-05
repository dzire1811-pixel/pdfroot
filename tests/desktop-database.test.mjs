import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import test from "node:test";
import { db } from "../lib/desktop-payment/db.ts";

// A local PostgreSQL protocol stub exercises the actual pg connection lifecycle.
// No credentials, external database, email, or payment provider is used.
function frame(type, payload) {
  const size = Buffer.alloc(4);
  size.writeInt32BE(payload.length + 4);
  return Buffer.concat([Buffer.from(type), size, payload]);
}

test("database connects after a slow wake-up and recovers from an idle disconnect", async t => {
  const sockets = new Set();
  const timers = new Set();
  let firstConnection = true;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.once("data", () => {
      const delay = firstConnection ? 5_500 : 0;
      firstConnection = false;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!socket.destroyed) socket.write(Buffer.concat([
          frame("R", Buffer.alloc(4)), // AuthenticationOk
          frame("Z", Buffer.from("I")), // ReadyForQuery
        ]));
      }, delay);
      timers.add(timer);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `postgres://test:test@127.0.0.1:${server.address().port}/test?sslmode=disable`;
  const pool = db();
  t.after(async () => {
    await pool.end();
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  const started = Date.now();
  const client = await pool.connect();
  assert.ok(Date.now() - started >= 5_000, "connection outlasted the old timeout");
  assert.strictEqual(db(), pool, "all callers share the same pool");
  client.release();

  // The pg pool removes the dead idle client and our listener prevents an
  // unhandled error. A subsequent request must be able to reconnect.
  const idleError = once(pool, "error");
  for (const socket of sockets) socket.destroy();
  await idleError;
  const fresh = await pool.connect();
  assert.notStrictEqual(fresh, client);
  fresh.release();
});
