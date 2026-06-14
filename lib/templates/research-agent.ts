import type { WorkflowDefinition } from '@/lib/types'

/**
 * Self-Correcting Research Agent.
 * Writes a research brief, scores its completeness, and if the score is below 7
 * loops back to search with a refined query and tries again. The runner's
 * per-node loop guard caps the retries at 3. Demonstrates eval + loop + retry.
 *
 * The loop is expressed as a condition (`quality_gate_1`) whose `true` branch
 * points back upstream to `search_1` — no special loop node is needed.
 */
export const researchAgentDefinition: WorkflowDefinition = {
  name: 'Self-Correcting Research Agent',
  nodes: [
    {
      id: 'input_1',
      type: 'input',
      label: 'Research Topic',
      position: { x: 280, y: 0 },
      config: { placeholder: 'e.g. impact of GLP-1 drugs on healthcare costs' },
    },
    {
      id: 'search_1',
      type: 'tool_call',
      label: 'Web Search',
      position: { x: 280, y: 120 },
      config: {
        toolName: 'web_search',
        // Fixed keywords keep the retry query short (<400 chars) so Tavily accepts
        // it on every pass. Including {{quality_1_output}} caused the query to
        // exceed Tavily's 400-character limit on the second iteration.
        args: {
          query:
            '{{input_1_output}} key applications case studies examples statistics',
        },
      },
    },
    {
      id: 'brief_1',
      type: 'llm_call',
      label: 'Write Brief',
      position: { x: 280, y: 240 },
      config: {
        system:
          'You are a research analyst. Write a thorough, well-sourced brief. Prefer specific facts, figures, and named sources over generalities.',
        prompt:
          'Write a research brief on the topic below using these search results. Include key facts, figures, multiple sources, and a balanced perspective.\n\nTopic: {{input_1_output}}\n\nSearch results:\n{{search_1_output}}',
        tools: [],
      },
    },
    {
      id: 'quality_1',
      type: 'tool_call',
      label: 'Quality Score',
      position: { x: 280, y: 360 },
      config: {
        toolName: 'evaluate_output',
        args: {
          output: '{{brief_1_output}}',
          criteria:
            'Rate this brief\'s completeness 1-10. A complete brief has specific facts, figures, multiple named sources, and a balanced perspective. Thin or generic briefs score low.',
        },
      },
    },
    {
      id: 'quality_gate_1',
      type: 'condition',
      label: 'Needs Improvement?',
      position: { x: 280, y: 480 },
      // Low score → true → loop back to search and retry.
      config: { expression: '{{quality_1_output}} < 7' },
    },
    {
      id: 'output_1',
      type: 'output',
      label: 'Research Brief',
      position: { x: 280, y: 600 },
      config: {
        template: '{{brief_1_output}}\n\n---\nQuality assessment:\n{{quality_1_output}}',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'search_1' },
    { id: 'e2', source: 'search_1', target: 'brief_1' },
    { id: 'e3', source: 'brief_1', target: 'quality_1' },
    { id: 'e4', source: 'quality_1', target: 'quality_gate_1' },
    // Low quality → loop back upstream to search and retry (guarded at 3).
    { id: 'e5', source: 'quality_gate_1', target: 'search_1', sourceHandle: 'true' },
    // Good enough → output.
    { id: 'e6', source: 'quality_gate_1', target: 'output_1', sourceHandle: 'false' },
  ],
}
