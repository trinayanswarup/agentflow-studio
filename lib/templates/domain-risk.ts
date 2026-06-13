import type { WorkflowDefinition } from '@/lib/types'

/**
 * CyberOps Domain Risk Check.
 * Branching workflow: a high risk score (>= 7) routes to analyst review;
 * a low score skips straight to output. Demonstrates condition branching.
 */
export const domainRiskDefinition: WorkflowDefinition = {
  name: 'CyberOps Domain Risk Check',
  nodes: [
    {
      id: 'input_1',
      type: 'input',
      label: 'Domain',
      position: { x: 280, y: 0 },
      config: { placeholder: 'e.g. example.com' },
    },
    {
      id: 'search_1',
      type: 'tool_call',
      label: 'Search Incidents',
      position: { x: 280, y: 120 },
      config: {
        toolName: 'web_search',
        args: { query: '{{input_1_output}} data breach security incident' },
      },
    },
    {
      id: 'extract_1',
      type: 'llm_call',
      label: 'Extract Risk Signals',
      position: { x: 280, y: 240 },
      config: {
        system:
          'You are a cybersecurity analyst assistant. Return valid JSON only — no markdown, no prose. You may use the web_fetch tool to read a result URL if you need more detail.',
        prompt:
          'From the search results below, extract cybersecurity risk signals about this domain as JSON with exactly these keys: "exposure" (what is publicly exposed or leaked), "known_breaches" (any reported breaches or incidents), "reputation_notes" (anything affecting trust/reputation). If a field is unknown, use "none found".\n\nSearch results:\n{{search_1_output}}',
        tools: ['web_fetch'],
      },
    },
    {
      id: 'score_1',
      type: 'tool_call',
      label: 'Risk Score',
      position: { x: 280, y: 360 },
      config: {
        toolName: 'evaluate_output',
        args: {
          output: '{{extract_1_output}}',
          criteria:
            'Rate cybersecurity risk 1-10 based on these signals, where 10 is the highest risk. Known breaches, leaked credentials, and exposed infrastructure should push the score up.',
        },
      },
    },
    {
      id: 'risk_gate_1',
      type: 'condition',
      label: 'High Risk?',
      position: { x: 280, y: 480 },
      config: { expression: '{{score_1_output}} >= 7' },
    },
    {
      id: 'review_1',
      type: 'human_pause',
      label: 'Analyst Review',
      position: { x: 520, y: 600 },
      config: {
        message:
          'High cybersecurity risk detected for {{input_1_output}}. An analyst should review before this is finalized.',
      },
    },
    {
      id: 'output_1',
      type: 'output',
      label: 'Risk Report',
      position: { x: 280, y: 720 },
      config: {
        template:
          'Domain: {{input_1_output}}\n\nRisk score: {{score_1_output}}\n\nSignals:\n{{extract_1_output}}',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'search_1' },
    { id: 'e2', source: 'search_1', target: 'extract_1' },
    { id: 'e3', source: 'extract_1', target: 'score_1' },
    { id: 'e4', source: 'score_1', target: 'risk_gate_1' },
    // High risk → analyst review → output
    { id: 'e5', source: 'risk_gate_1', target: 'review_1', sourceHandle: 'true' },
    { id: 'e6', source: 'review_1', target: 'output_1' },
    // Low risk → straight to output
    { id: 'e7', source: 'risk_gate_1', target: 'output_1', sourceHandle: 'false' },
  ],
}
