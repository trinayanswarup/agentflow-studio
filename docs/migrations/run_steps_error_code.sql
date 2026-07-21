-- Migration: run_steps.error_code column
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
--
-- Guardrail failures already carry a machine-readable code (e.g.
-- OUTPUT_VALIDATION_FAILED, STEP_TIMEOUT, BUDGET_EXCEEDED) on their
-- step_error/run_error TraceEvent, but persistEvent previously only wrote
-- the human-readable `error` message to run_steps — the code itself was
-- dropped. get_run_details needs the exact code to report "which step
-- failed and why" precisely, not just a free-text message.

alter table run_steps add column if not exists error_code text;
