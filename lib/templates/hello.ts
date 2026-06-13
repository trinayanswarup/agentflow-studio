import type { WorkflowDefinition } from '@/lib/types'

export const helloDefinition: WorkflowDefinition = {
  name: 'Hello',
  nodes: [
    {
      id: 'input_1',
      type: 'input',
      label: 'User Input',
      position: { x: 200, y: 0 },
      config: { placeholder: 'Ask me anything…' },
    },
    {
      id: 'llm_1',
      type: 'llm_call',
      label: 'Answer',
      position: { x: 200, y: 120 },
      config: {
        prompt: 'Answer the user\'s question: {{input_1_output}}',
        system: '',
        tools: [],
      },
    },
    {
      id: 'output_1',
      type: 'output',
      label: 'Output',
      position: { x: 200, y: 260 },
      config: { template: '' },
    },
  ],
  edges: [
    { id: 'e1', source: 'input_1', target: 'llm_1' },
    { id: 'e2', source: 'llm_1', target: 'output_1' },
  ],
}
