import http from 'http';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initRealtime } from './realtime/io.js';

async function main() {
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(env.port, () => {
    console.log(`[gramcare] API + Socket.IO on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
