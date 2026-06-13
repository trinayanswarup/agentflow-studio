import type { WorkflowDefinition } from '@/lib/types'

export const leadQualificationDefinition: WorkflowDefinition = {
  name: 'Lead Qualification',
  nodes: [
    {
      id: 'input_1',
      type: 'input',
      label: 'Company Name',
      position: { x: 280, y: 0 },
      config: { placeholder: 'e.g. Nord Security' },
    },
    {
      id: 'search_1',
      type: 'tool_call',
      label: 'Web Search',
      position: { x: 280, y: 120 },
      config: {
        toolName: 'web_search',
        args: {
          query:
            '{{input_1_output}} company funding employees industry site:crunchbase.com OR linkedin.com',
        },
      },
    },
    {
      id: 'extract_1',
      type: 'llm_call',
      label: 'Extract Profile',
      position: { x: 280, y: 240 },
      config: {
        system:
          'You are a data extraction assistant. Return valid JSON only — no markdown, no prose. Use the web_fetch tool to read a URL from the search results if you need more detail.',
        prompt:
          'Extract company name, industry, employee count, funding stage, headquarters, and a one-sentence description from the search results below. Return as JSON.\n\nSearch results:\n{{search_1_output}}',
        tools: ['web_fetch'],
      },
    },
    {
      id: 'score_1',
      type: 'tool_call',
      label: 'Score Lead',
      position: { x: 280, y: 380 },
      config: {
        toolName: 'evaluate_output',
        args: {
          output: '{{extract_1_output}}',
          criteria:
            'A qualified lead is a B2B SaaS or tech company with 50–500 employees, Series A or B funded, and an active engineering team. Score higher if the company matches more of these criteria.',
        },
      },
    },
    {
      id: 'review_1',
      type: 'human_pause',
      label: 'Human Review',
      position: { x: 280, y: 520 },
      config: { message: 'Review the lead qualification score before finalizing.' },
    },
    {
      id: 'output_1',
      type: 'output',
      label: 'Qualified Lead Report',
      position: { x: 280, y: 640 },
      config: {
        template: '{{score_1_output}}\n\n---\nCompany profile:\n{{extract_1_output}}',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'search_1' },
    { id: 'e2', source: 'search_1', target: 'extract_1' },
    { id: 'e3', source: 'extract_1', target: 'score_1' },
    { id: 'e4', source: 'score_1', target: 'review_1' },
    { id: 'e5', source: 'review_1', target: 'output_1' },
  ],
}
