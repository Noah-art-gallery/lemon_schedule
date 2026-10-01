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
  "push_delivery_attempts",
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
  "create_task_schedule",
  "update_task_schedule",
  "list_task_occurrences",
  "get_owner_today",
  "update_my_profile",
  "list_blocked_profiles",
  "set_pet_decorations",
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
assert.match(
  sql,
  /unique \(notification_id, device_id\)/,
  "push attempts must dedupe per notification and device",
);
assert.match(
  sql,
  /grant select, insert, update on table public\.push_delivery_attempts to service_role/,
  "only the server may record push attempts",
);
assert.match(sql, /bucket_id = 'pet-drawings'/, "pet drawings must use a private owner bucket");
assert.match(
  sql,
  /drawing_path ~ '\^\[0-9a-f-\]\+\/pet\[\.\]png\$'/,
  "stored pet.png paths must pass the final database constraint",
);
assert.match(sql, /deleted_at timestamptz/, "tasks must support logical deletion");
assert.match(sql, /'deleted_by_author'/, "encouragement deletion must preserve a tombstone");
assert.match(
  sql,
  /visibility = 'visible' or author_id = \(select auth\.uid\(\)\)/,
  "hidden encouragement must remain visible to its author",
);
assert.match(sql, /pg_catalog\.pg_timezone_names/, "time zones must be validated as IANA names");
assert.match(
  sql,
  /title text not null check \(btrim\(title\) <> '' and char_length\(title\) <= 80\)/,
  "task titles must be nonblank and limited to 80 stored characters",
);
assert.match(sql, /'invalid_display_name'/, "signup must require an explicit display name");
assert.match(sql, /'invalid_time_zone'/, "signup must require an explicit IANA time zone");
assert.match(
  sql,
  /create function private\.lock_user_pair\(/,
  "connection pairs need a shared lock",
);
for (const rpc of [
  "request_connection",
  "respond_connection_request",
  "cancel_connection_request",
  "disconnect_friend",
  "block_user",
  "unblock_user",
]) {
  const functionBody = sql.match(
    new RegExp(`create function public\\.${rpc}\\([\\s\\S]*?\\n\\$\\$;`),
  )?.[0];
  assert.ok(functionBody, `${rpc} function body missing`);
  assert.match(
    functionBody,
    /private\.lock_user_pair\(/,
    `${rpc} must serialize connection state for its user pair`,
  );
}
const completionBody = sql.match(
  /create function public\.complete_occurrence\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(completionBody, "complete_occurrence function body missing");
assert.match(
  completionBody,
  /private\.lock_user_network\(/,
  "completion recipients must be serialized with relationship changes",
);
const encouragementBody = sql.match(
  /create function public\.upsert_encouragement\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(encouragementBody, "upsert_encouragement function body missing");
assert.match(
  encouragementBody,
  /private\.lock_user_pair\(/,
  "encouragement writes must be serialized with relationship changes",
);
const listOccurrencesBody = sql.match(
  /create function public\.list_task_occurrences\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(listOccurrencesBody, "list_task_occurrences function body missing");
assert.match(
  listOccurrencesBody,
  /private\.lock_user_pair\(/,
  "friend reads must serialize with relationship changes",
);
assert.match(
  sql,
  /revoke insert on public\.tasks from authenticated/,
  "task creation must use RPC",
);
assert.match(
  sql,
  /revoke insert \(owner_id, title, due_date, due_time, recurrence\) on public\.tasks/,
  "column-level task insert grants must also be revoked",
);
assert.match(
  sql,
  /revoke insert on public\.task_occurrences from authenticated/,
  "occurrences must only be materialized by guarded functions",
);
assert.match(
  sql,
  /revoke update \(title, due_date, due_time, recurrence\) on public\.tasks/,
  "schedule edits must use the schedule-aware RPC",
);
assert.match(
  sql,
  /revoke update \(recurrence_changed_at\) on public\.tasks/,
  "recurrence metadata edits must use the schedule-aware RPC",
);
assert.doesNotMatch(
  sql,
  /grant[^;]*(insert|delete)[^;]*on public\.pets/,
  "pet rows must only be provisioned by the signup trigger",
);
assert.doesNotMatch(sql, /auth\.role\(\)/, "deprecated auth.role() must not be used");

console.log(
  `SQL contract checks passed (${protectedTables.length} RLS tables, ${migrations.length} migration).`,
);
