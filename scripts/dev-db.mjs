// Mahalliy sinov bazasi: PGlite (WASM Postgres) + socket server. Haqiqiy Supabase kerak emas.
// Ishga tushirish: node scripts/dev-db.mjs [port]   ->  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:PORT/postgres  DATABASE_SSL=off
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import fs from 'node:fs';

const port = Number(process.argv[2] || 54329);
const db = await PGlite.create();
await db.exec('create role anon; create role authenticated;');
const files = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
for (const f of files) await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8').replace(/create extension[^;]*;/g, ''));
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`dev-db tayyor: postgres://postgres:postgres@127.0.0.1:${port}/postgres (${files.length} migratsiya)`);
process.on('SIGINT', async () => { await server.stop(); await db.close(); process.exit(0); });
setInterval(() => {}, 1 << 30);
