-- Migration: guardrail_events table
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
--
-- Structured, queryable log of every guardrail action taken during a run:
-- validation_retry (a structured LLM output failed schema validation),
-- backoff_retry (a transient 429/5xx/network error was retried),
-- budget_exceeded (the run's cost cap was hit), step_timeout (a node ran
-- longer than WORKFLOW_STEP_TIMEOUT_MS). Previously these were only visible
-- live via SSE/Langfuse — nothing persisted them for later inspection. This
-- table backs the get_guardrail_events MCP tool used by the Ask Agent's
-- failure-diagnosis flow.
--
-- Written fire-and-forget from app/api/stream/[runId]/route.ts's
-- persistEvent — never on the critical path of a run.

create table if not exists guardrail_events (
  id             uuid        primary key default gen_random_uuid(),
  run_id         uuid        not null references runs(id) on delete cascade,
  node_id        text        not null,
  node_label     text        not null,
  event_type     text        not null check (event_type in (
                               'validation_retry', 'backoff_retry', 'budget_exceeded', 'step_timeout'
                             )),
  attempt        integer,                 -- backoff_retry: which attempt number
  http_status    integer,                 -- backoff_retry: status code that triggered it, if any
  delay_ms       integer,                 -- backoff_retry: backoff delay before the retry
  timeout_ms     integer,                 -- step_timeout: the configured timeout that was exceeded
  total_cost_usd numeric,                 -- budget_exceeded: estimated cost at abort time
  cap_usd        numeric,                 -- budget_exceeded: the configured cap
  error_message  text,                    -- validation_retry / backoff_retry: the error/validation message
  output_preview text,                    -- validation_retry: preview of the model output that failed
  created_at     timestamptz default now()
);

-- Index for "all guardrail events for this run", the only access pattern
-- get_guardrail_events uses.
create index if not exists guardrail_events_run_id_idx
  on guardrail_events (run_id);
