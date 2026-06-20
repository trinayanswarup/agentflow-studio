import { createServerClient } from '@/lib/supabase/server'
import { embed } from './embeddings'
import type { WorkflowDefinition, LlmCallNode } from '@/lib/types'

export async function embedWorkflow(workflowId: string): Promise<void> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('workflows')
    .select('id, name, definition_json')
    .eq('id', workflowId)
    .single()

  if (error || !data) {
    throw new Error(`embedWorkflow: workflow ${workflowId} not found`)
  }

  const def = data.definition_json as WorkflowDefinition

  // Serialize: name + all node labels + all llm_call prompts
  const labels = def.nodes.map((n) => n.label)
  const prompts = def.nodes
    .filter((n): n is LlmCallNode => n.type === 'llm_call')
    .map((n) => n.config.prompt)
    .filter(Boolean)

  const content = [def.name, ...labels, ...prompts].join('\n')

  const vec = await embed(content)

  // Upsert: delete existing, then insert fresh
  await supabase.from('workflow_embeddings').delete().eq('workflow_id', workflowId)
  await supabase.from('workflow_embeddings').insert({
    workflow_id: workflowId,
    embedding: `[${vec.join(',')}]`,
    content,
  })
}
