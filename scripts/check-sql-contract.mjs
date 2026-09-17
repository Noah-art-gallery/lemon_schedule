import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

assert.ok(migrations.length > 0, "Supabase migration is required");

const sql = migrations
  .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
  .join("\n")
  .toLowerCase();

const protectedTables = [
  "profiles",
  "profile_private",
  "connection_requests",
  "connections",
  "blocks",
  "tasks",
  "task_occurrences",
  "completion_events",
  "encouragements",
  "notifications",
  "pets",
  "pet_unlocks",
  "device_tokens",
];

for (const table of protectedTables) {
  assert.match(sql, new RegExp(`create table public\\.${table}\\b`), `${table} table missing`);
  assert.match(
    sql,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `${table} must enable RLS`,
  );
  assert.match(
    sql,
    new RegExp(`revoke all on table public\\.${table} from anon, authenticated`),
    `${table} must start from explicit privileges`,
  );
}

for (const rpc of [
  "request_connection",
  "respond_connection_request",
  "complete_occurrence",
  "reopen_occurrence",
  "upsert_encouragement",
  "delete_task",
  "delete_encouragement",
]) {
  assert.match(sql, new RegExp(`create function public\\.${rpc}\\(`), `${rpc} RPC missing`);
  assert.match(
    sql,
    new RegExp(`revoke all on function public\\.${rpc}\\([^;]+from public, anon`),
    `${rpc} must not be callable anonymously`,
  );
}

assert.match(
  sql,
  /occurrence_id bigint not null unique/,
  "completion must be idempotent per occurrence",
);
assert.match(
  sql,
  /on conflict \(recipient_id, event_key\) do nothing/,
  "notifications must dedupe",
);
assert.match(sql, /with \(security_invoker = true\)/, "views must honor caller RLS");
assert.match(sql, /bucket_id = 'pet-drawings'/, "pet drawings must use a private owner bucket");
assert.match(sql, /deleted_at timestamptz/, "tasks must support logical deletion");
assert.match(sql, /'deleted_by_author'/, "encouragement deletion must preserve a tombstone");
assert.match(sql, /pg_catalog\.pg_timezone_names/, "time zones must be validated as IANA names");
assert.doesNotMatch(sql, /auth\.role\(\)/, "deprecated auth.role() must not be used");

console.log(
  `SQL contract checks passed (${protectedTables.length} RLS tables, ${migrations.length} migration).`,
);
