create table public.provider_daily_usage (
  provider text not null,
  usage_day date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, usage_day)
);

create table public.provider_user_daily_usage (
  provider text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, user_id, usage_day)
);

create table public.provider_request_usage (
  provider text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  status text not null default 'started'
    check (status in ('started', 'succeeded', 'failed')),
  outcome text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, user_id, request_id)
);

create index provider_request_usage_recent_idx
  on public.provider_request_usage(provider, user_id, created_at desc);

create or replace function public.consume_provider_quota(
  target_provider text,
  target_user_id uuid,
  target_request_id text,
  daily_user_limit integer,
  daily_global_limit integer,
  minute_user_limit integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
  global_count integer;
  recent_count integer;
begin
  if target_provider not in ('google_vision', 'serpapi')
    or target_request_id !~ '^[A-Za-z0-9:_-]{8,120}$' then
    return 'invalid_request';
  end if;
  if daily_user_limit < 1 or daily_global_limit < 1 or minute_user_limit < 1 then
    return 'quota_not_configured';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_provider || ':' || current_date::text, 0)
  );

  if exists (
    select 1
    from public.provider_request_usage
    where provider = target_provider
      and user_id = target_user_id
      and request_id = target_request_id
  ) then
    return 'duplicate_request';
  end if;

  select count(*)::integer into recent_count
  from public.provider_request_usage
  where provider = target_provider
    and user_id = target_user_id
    and created_at >= now() - interval '1 minute';
  if recent_count >= minute_user_limit then
    return 'rate_limited';
  end if;

  select coalesce(request_count, 0) into user_count
  from public.provider_user_daily_usage
  where provider = target_provider
    and user_id = target_user_id
    and usage_day = current_date;
  if coalesce(user_count, 0) >= daily_user_limit then
    return 'quota_reached';
  end if;

  select coalesce(request_count, 0) into global_count
  from public.provider_daily_usage
  where provider = target_provider
    and usage_day = current_date;
  if coalesce(global_count, 0) >= daily_global_limit then
    return 'global_quota_reached';
  end if;

  insert into public.provider_user_daily_usage (
    provider, user_id, usage_day, request_count
  ) values (target_provider, target_user_id, current_date, 1)
  on conflict (provider, user_id, usage_day) do update
    set request_count = public.provider_user_daily_usage.request_count + 1,
        updated_at = now();

  insert into public.provider_daily_usage (provider, usage_day, request_count)
  values (target_provider, current_date, 1)
  on conflict (provider, usage_day) do update
    set request_count = public.provider_daily_usage.request_count + 1,
        updated_at = now();

  insert into public.provider_request_usage (provider, user_id, request_id)
  values (target_provider, target_user_id, target_request_id);

  return 'allowed';
end;
$$;

create or replace function public.record_provider_usage_outcome(
  target_provider text,
  target_user_id uuid,
  target_request_id text,
  target_outcome text,
  target_latency_ms integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.provider_request_usage
  set status = case when target_outcome = 'success' then 'succeeded' else 'failed' end,
      outcome = left(target_outcome, 80),
      latency_ms = greatest(0, target_latency_ms),
      updated_at = now()
  where provider = target_provider
    and user_id = target_user_id
    and request_id = target_request_id;
$$;

alter table public.provider_daily_usage enable row level security;
alter table public.provider_user_daily_usage enable row level security;
alter table public.provider_request_usage enable row level security;

revoke all on public.provider_daily_usage from public, anon, authenticated;
revoke all on public.provider_user_daily_usage from public, anon, authenticated;
revoke all on public.provider_request_usage from public, anon, authenticated;
revoke all on function public.consume_provider_quota(text, uuid, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.record_provider_usage_outcome(text, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_provider_quota(text, uuid, text, integer, integer, integer)
  to service_role;
grant execute on function public.record_provider_usage_outcome(text, uuid, text, text, integer)
  to service_role;
