create table public.push_delivery_attempts (
  id bigint generated always as identity primary key,
  notification_id bigint not null references public.notifications (id) on delete cascade,
  device_id text not null,
  platform text not null check (platform in ('android', 'ios')),
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  provider_message_id text,
  error_code text,
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (notification_id, device_id)
);

create index push_delivery_attempts_notification_idx
  on public.push_delivery_attempts (notification_id, status);

alter table public.push_delivery_attempts enable row level security;
revoke all on table public.push_delivery_attempts from anon, authenticated;
grant select, insert, update on table public.push_delivery_attempts to service_role;
grant usage, select on sequence public.push_delivery_attempts_id_seq to service_role;
