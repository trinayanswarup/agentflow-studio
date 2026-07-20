-- Migration: agent_decisions table
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
--
-- Records every call to POST /api/agent/ask:
--   - which tool the agent chose (if any)
--   - the tool's input and output
--   - the model's final answer
--   - latency
--
-- Writes are fire-and-forget from the API route — this table is for
-- analytics and debugging, never on the critical path.

create table if not exists agent_decisions (
  id           uuid        primary key default gen_random_uuid(),
  question     text        not null,
  tool_called  text,                   
  tool_input   jsonb,                  
  tool_output  jsonb,                  
  reasoning    text,                    
  final_answer text        not null,
  latency_ms   integer     not null,
  created_at   timestamptz default now()
);

-- Index for browsing recent decisions quickly.
create index if not exists agent_decisions_created_at_idx
  on agent_decisions (created_at desc);

-- Optional: index for filtering by tool name.
create index if not exists agent_decisions_tool_called_idx
  on agent_decisions (tool_called)
  where tool_called is not null;
