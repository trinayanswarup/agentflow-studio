import type { WorkflowDefinition } from '@/lib/types'
import { helloDefinition } from './hello'
import { leadQualificationDefinition } from './lead-qualification'

export type Template = {
  id: string
  name: string
  description: string
  category: string
  definition: WorkflowDefinition
}

export const TEMPLATES: Template[] = [
  {
    id: 'hello',
    name: 'Hello',
    description:
      'The 5-second first run. Ask a question, get an answer. Input → LLM → Output. No tools, no search.',
    category: 'Starter',
    definition: helloDefinition,
  },
  {
    id: 'lead-qualification',
    name: 'Lead Qualification',
    description:
      'Search and qualify a B2B lead. Web search → extract company profile → score against criteria → human review.',
    category: 'Sales',
    definition: leadQualificationDefinition,
  },
]

const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]))

export function getTemplate(id: string): Template | undefined {
  return TEMPLATE_MAP.get(id)
}
