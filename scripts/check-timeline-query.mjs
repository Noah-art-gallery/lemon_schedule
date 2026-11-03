// Isolated PostgreSQL query validation, not a substitute for Supabase/RLS integration.
// PGLITE_MODULE points to an externally installed @electric-sql/pglite/dist/index.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,display_name text,avatar_key text);
create table profile_private(user_id uuid,time_zone text);
create table connections(user_low_id uuid,user_high_id uuid);
create table tasks(id bigint primary key,owner_id uuid,title text,due_date date,created_at timestamptz,deleted_at timestamptz);
create table task_occurrences(id bigint primary key,task_id bigint,owner_id uuid,title_snapshot text,occurrence_date date,status text,first_completed_at timestamptz);
create table daily_encouragements(owner_id uuid,author_id uuid,day date,visibility text);
create function private.are_connected(a uuid,b uuid) returns boolean language sql as $$select exists(select 1 from public.connections where (user_low_id=a and user_high_id=b) or (user_low_id=b and user_high_id=a))$$;
-- Single-session harness cannot validate advisory-lock concurrency.
create function private.lock_user_network(a uuid) returns void language sql as $$select$$;
`);
await db.exec(readFileSync("supabase/migrations/20261024083537_friend_timeline.sql", "utf8"));
const ids = [301, 302, 303].map((n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
for (const [index, id] of ids.entries()) {
  await db.query("insert into profiles values ($1,$2,'cat')", [id, `Person ${index}`]);
  await db.query("insert into profile_private values ($1,$2)", [
    id,
    index === 0 ? "Asia/Seoul" : "Pacific/Honolulu",
  ]);
  await db.query(
    "insert into tasks values ($1,$2,$3,'2026-10-24','2026-10-24T08:00:00.123456Z',null)",
    [index + 1, id, `Task ${index}`],
  );
}
await db.query("insert into connections values ($1,$2)", ids.slice(0, 2));
await db.query(
  "insert into task_occurrences values (2,2,$1,'Completed task','2026-10-24','completed','2026-10-24T08:00:00.123456Z')",
  [ids[1]],
);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[0]]);
const read = async (args = [null, null, null, null, 20]) =>
  (await db.query("select public.list_friend_timeline($1,$2,$3,$4,$5) result", args)).rows[0]
    .result;
const all = await read();
assert.equal(all.viewerTimeZone, "Asia/Seoul");
assert.deepEqual(
  all.items.map((x) => `${x.kind}:${x.eventId}`),
  ["completed:2", "created:2"],
);
assert.ok(all.items.every((x) => x.owner.id === ids[1]));
assert.deepEqual(Object.keys(all.items[0].owner).sort(), ["avatarKey", "displayName", "id"]);
const first = await read([null, null, null, null, 1]);
const cursor = first.nextCursor;
assert.ok(cursor.occurredAt.includes("123456"));
const second = await read([null, cursor.occurredAt, cursor.kind, cursor.eventId, 1]);
assert.deepEqual(
  second.items.map((x) => x.kind),
  ["created"],
);
assert.equal(second.nextCursor, null);
await assert.rejects(read([ids[2], null, null, null, 20]), /FORBIDDEN/);
await assert.rejects(read([null, cursor.occurredAt, null, null, 20]), /INVALID_INPUT/);
await db.exec("update task_occurrences set status='pending'");
assert.deepEqual(
  (await read()).items.map((x) => x.kind),
  ["created"],
);
await db.exec("update task_occurrences set status='completed'");
assert.equal((await read()).items[0].occurredAt, all.items[0].occurredAt);
await db.query(
  "insert into daily_encouragements values ($1,$2,(now() at time zone 'Pacific/Honolulu')::date,'visible')",
  [ids[1], ids[0]],
);
assert.ok((await read()).items.every((x) => x.cheeredToday));
await db.exec("update tasks set deleted_at=now() where id=2");
assert.deepEqual((await read()).items, []);
await db.exec("update tasks set deleted_at=null; delete from connections");
assert.deepEqual((await read()).items, []);
await db.exec("select set_config('request.jwt.claim.sub','',false)");
await assert.rejects(read(), /UNAUTHENTICATED/);
assert.equal(
  (
    await db.query(
      "select has_function_privilege('anon','public.list_friend_timeline(uuid,timestamptz,text,bigint,integer)','execute') allowed",
    )
  ).rows[0].allowed,
  false,
);
await db.close();
console.log(
  "Isolated timeline PostgreSQL query checks passed (projection, cursor precision/ties, connection scope, undo/redo, deletion, cheer day, permissions). Full Supabase integration remains separate.",
);
