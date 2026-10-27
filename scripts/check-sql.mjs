// Migratsiyani PGlite (WASM Postgres) da tekshiradi
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
await db.exec('create role anon; create role authenticated;');
const sql = fs.readFileSync('supabase/migrations/0001_init.sql', 'utf8').replace(/create extension[^;]*;/g, '');
await db.exec(sql);
const t = await db.query("select count(*)::int c from information_schema.tables where table_schema='public'");
console.log('tables', t.rows[0].c);
const a = await db.query("select public.create_first_admin('Sensei', 'S@x.uz', 'h') id");
console.log('admin', a.rows[0].id);
try { await db.query("select public.create_first_admin('Boshqa', 'b@x.uz', 'h')"); console.log('XATO: ikkinchi admin yaratildi'); } catch (e) { console.log('ikkinchi admin rad etildi:', e.message); }
const rls = await db.query("select count(*)::int c from pg_tables where schemaname='public' and not rowsecurity");
console.log('RLS yoqilmagan jadvallar', rls.rows[0].c);
