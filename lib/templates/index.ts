import type { WorkflowDefinition } from '@/lib/types'
import { helloDefinition } from './hello'
import { leadQualificationDefinition } from './lead-qualification'
import { domainRiskDefinition } from './domain-risk'
import { researchAgentDefinition } from './research-agent'

export type TestCase = { input: string; expected: string }

export type Template = {
  id: string
  name: string
  description: string
  category: string
  definition: WorkflowDefinition
  defaultTestCases: TestCase[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'hello',
    name: 'Hello',
    description:
      'The 5-second first run. Ask a question, get an answer. Input → LLM → Output. No tools, no search.',
    category: 'Starter',
    definition: helloDefinition,
    defaultTestCases: [
      { input: 'What is the capital of France?', expected: 'Paris' },
    ],
  },
  {
    id: 'lead-qualification',
    name: 'Lead Qualification',
    description:
      'Search and qualify a B2B lead. Web search → extract company profile → score against criteria → human review.',
    category: 'Sales',
    definition: leadQualificationDefinition,
    defaultTestCases: [
      { input: 'Nord Security', expected: 'cybersecurity' },
      { input: 'Revolut', expected: 'fintech' },
      { input: 'Spotify', expected: 'music streaming' },
    ],
  },
  {
    id: 'domain-risk',
    name: 'CyberOps Domain Risk Check',
    description:
      'Assess a domain\'s cybersecurity risk. High scores branch to analyst review; low scores skip straight to the report. Shows conditional branching.',
    category: 'Security',
    definition: domainRiskDefinition,
    defaultTestCases: [
      { input: 'nordsecurity.com', expected: 'low risk' },
      { input: 'haveibeenpwned.com', expected: 'security' },
    ],
  },
  {
    id: 'research-agent',
    name: 'Self-Correcting Research Agent',
    description:
      'Write a research brief, score its completeness, and loop back to refine the search if it falls short — capped at 3 retries. Shows eval + loop + retry.',
    category: 'Research',
    definition: researchAgentDefinition,
    defaultTestCases: [
      { input: 'quantum computing', expected: 'qubits' },
      { input: 'CRISPR gene editing', expected: 'DNA' },
    ],
  },
]

const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]))

export function getTemplate(id: string): Template | undefined {
  return TEMPLATE_MAP.get(id)
}
