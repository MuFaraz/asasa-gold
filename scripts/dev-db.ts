/**
 * Local-only Postgres (PGlite over a TCP socket) so the app runs with zero external setup:
 *   npm run dev:db      # terminal 1
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run db:migrate && npm run dev
 * Production uses Neon; this exists purely to make local review frictionless.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const db = await PGlite.create("./.pglite-data");
  const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1", maxConnections: 10 });
  await server.start();
  console.log("[dev-db] PGlite listening on postgres://postgres:postgres@127.0.0.1:5433/postgres");
  process.on("SIGINT", async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}

main();
