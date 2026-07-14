-- Run once in the Supabase SQL editor. Stores one summary row per
-- `npm run evals:mock` / `npm run evals:live` invocation.
create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  "timestamp" timestamptz not null default now(),
  git_sha text not null,
  total integer not null,
  passed integer not null,
  failed integer not null,
  pass_rate numeric not null,
  results_json jsonb not null
);

create index on eval_runs ("timestamp" desc);
