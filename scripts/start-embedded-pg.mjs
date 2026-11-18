import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../.data/pg");

const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "studio",
  password: "studio",
  port,
  persistent: true,
});

await pg.initialise();
await pg.start();
await pg.createDatabase("studio").catch(() => undefined);

console.log(`Embedded Postgres ready on postgresql://studio:studio@127.0.0.1:${port}/studio`);
console.log("Keep this process running while developing.");

process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await pg.stop();
  process.exit(0);
});

setInterval(() => {}, 1 << 30);
