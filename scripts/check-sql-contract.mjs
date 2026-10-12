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

const visibilityMigration = readFileSync(
  join(migrationDirectory, "20260919170000_connection_visibility.sql"),
  "utf8",
).toLowerCase();
assert.match(
  visibilityMigration,
  /and profiles\.id in \(request\.requester_id, request\.addressee_id\)/,
  "pending-request visibility must compare the outer profile UUID, not the request ID",
);

const webhookBody = sql.match(
  /create function private\.enqueue_completion_push\(\)[\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(webhookBody, "completion push webhook trigger function missing");
assert.match(webhookBody, /set search_path = ''/, "webhook must pin its search path");
assert.match(webhookBody, /vault\.decrypted_secrets/, "webhook configuration must use Vault");
assert.match(webhookBody, /net\.http_post\(/, "webhook must enqueue asynchronous HTTP");
assert.match(webhookBody, /exception when others then/, "enqueue failure must preserve completion");
assert.match(
  sql,
  /revoke all on function private\.enqueue_completion_push\(\) from public, anon, authenticated/,
  "webhook must not be directly callable by clients",
);
assert.match(
  sql,
  /create trigger send_completion_push\s+after insert on public\.notifications/,
  "webhook must only watch notification INSERTs",
);
assert.match(
  sql,
  /an api-callable function exposes webhook internals/,
  "migration must reject public RPC bridges into webhook internals",
);
assert.doesNotMatch(webhookBody, /[a-f0-9]{64}/, "webhook must not embed a secret literal");

for (const rpc of [
  "list_social_activity",
  "list_own_history",
  "get_occurrence_detail",
  "list_encouragement_summaries",
  "list_inbox",
  "get_inbox_unread_count",
  "mark_all_inbox_read",
]) {
  const body = sql.match(new RegExp(`create function public\\.${rpc}\\([\\s\\S]*?\\n\\$\\$;`))?.[0];
  assert.ok(body, `${rpc} read contract missing`);
  assert.match(body, /set search_path = ''/, `${rpc} pins search path`);
  assert.match(body, /auth\.uid\(\) is null/, `${rpc} requires authentication`);
  assert.match(
    sql,
    new RegExp(`revoke all on function public\\.${rpc}\\([^;]+from public, anon`),
    `${rpc} denies anonymous access`,
  );
}
const readSql = readFileSync(
  join(migrationDirectory, "20261012120000_social_read_models.sql"),
  "utf8",
);
assert.match(
  readSql,
  /\(o\.first_completed_at, o\.id\) < \(cursor_completed_at, cursor_occurrence_id\)/,
  "completion feeds use stable keyset pagination",
);
assert.match(readSql, /id <= through_id/, "mark all honors a high-water boundary");
assert.match(
  readSql,
  /visibility = 'visible'/,
  "only visible encouragements enter public previews",
);
assert.match(
  readSql,
  /private\.can_read_occurrence\(o\.id\)/,
  "batch summaries omit unauthorized targets",
);

const petVersionSql = readFileSync(
  join(migrationDirectory, "20261012130000_versioned_pet_drawings.sql"),
  "utf8",
);
assert.match(
  petVersionSql,
  /add constraint pets_drawing_path_check/,
  "versioned pet paths remain constrained",
);
assert.match(petVersionSql, /user_id::text/, "drawing folder must match the pet owner");
assert.ok(
  petVersionSql.includes(
    "/(pet|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]png$",
  ),
  "legacy and immutable UUID PNG filenames are accepted without nested paths",
);
assert.doesNotMatch(
  petVersionSql,
  /(?:drop|alter) policy/i,
  "versioned saves retain existing private storage policies",
);

const socialPolicySql = readFileSync(
  join(migrationDirectory, "20261012140000_remove_blocks_and_owner_hiding.sql"),
  "utf8",
).toLowerCase();
for (const signature of [
  "block_user(uuid)",
  "unblock_user(uuid)",
  "list_blocked_profiles()",
  "hide_encouragement(bigint, boolean)",
]) {
  assert.ok(
    socialPolicySql.includes(`drop function public.${signature};`),
    `${signature} must be removed`,
  );
}
assert.match(
  socialPolicySql,
  /drop table public\.blocks restrict;/,
  "block storage must be removed without cascading unrelated objects",
);
assert.doesNotMatch(socialPolicySql, /\bcascade\s*;/, "policy removal must not cascade");
assert.match(
  socialPolicySql,
  /update public\.encouragements set visibility = 'visible' where visibility = 'hidden_by_owner';/,
  "only owner-hidden rows are restored",
);
assert.match(
  socialPolicySql,
  /check \(visibility in \('visible', 'deleted_by_author'\)\)/,
  "visibility has exactly the final two states",
);
for (const name of [
  "private.are_connected",
  "public.request_connection",
  "public.respond_connection_request",
  "public.complete_occurrence",
  "public.list_inbox",
  "public.upsert_encouragement",
  "public.get_occurrence_detail",
]) {
  const body = socialPolicySql.match(
    new RegExp(`create or replace function ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?\\n\\$\\$;`),
  )?.[0];
  assert.ok(body, `${name} must explicitly replace its obsolete dependency`);
  assert.doesNotMatch(
    body,
    /public\.blocks|hidden_by_owner/,
    `${name} must not retain removed policy`,
  );
}

const avatarSql = readFileSync(
  join(migrationDirectory, "20261012150000_profile_avatars.sql"),
  "utf8",
).toLowerCase();
assert.match(
  avatarSql,
  /avatar_key text not null default 'lemon'/,
  "avatars have a non-null safe default",
);
assert.match(
  avatarSql,
  /'lemon', 'cat', 'dog', 'rabbit', 'bear', 'fox', 'penguin', 'flower'/,
  "avatars accept the fixed public key set",
);
assert.match(
  avatarSql,
  /new_avatar_key text default null/,
  "partial profile updates preserve omitted avatar keys",
);
assert.match(
  avatarSql,
  /where id = current_user_id/,
  "avatar writes remain scoped to the authenticated owner",
);
assert.match(
  avatarSql,
  /revoke all on function public\.update_my_profile\(text, text, text\) from public, anon/,
  "avatar RPC rejects anonymous callers",
);
assert.doesNotMatch(
  avatarSql,
  /(?:create|drop|alter) policy|grant update/,
  "avatars preserve existing RLS and do not add direct update permissions",
);
for (const field of ["avatarkey", "authoravatarkey", "actoravatarkey"]) {
  assert.ok(avatarSql.includes(`'${field}'`), `${field} is included in public read projections`);
}

console.log(
  `SQL contract checks passed (${protectedTables.length} RLS tables, ${migrations.length} migration).`,
);
