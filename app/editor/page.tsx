import dynamic from 'next/dynamic'
import type { WorkflowDefinition } from '@/lib/types'
import { getTemplate } from '@/lib/templates'
import { createServerClient } from '@/lib/supabase/server'

// WorkflowCanvas uses ReactFlow which requires browser APIs — load client-side only.
const WorkflowCanvas = dynamic(() => import('@/components/canvas/WorkflowCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400 text-sm">
      Loading canvas…
    </div>
  ),
})

interface EditorPageProps {
  searchParams: { template?: string; demo?: string; name?: string; tour?: string; workflow?: string }
}

export default async function EditorPage({ searchParams }: EditorPageProps) {
  // ?demo=true is a legacy alias for the lead-qualification template.
  const templateId =
    searchParams.template ?? (searchParams.demo === 'true' ? 'lead-qualification' : undefined)
  const template = templateId ? getTemplate(templateId) : undefined

  let initialDefinition: WorkflowDefinition | undefined = template?.definition
  let initialName: string = template?.name ?? searchParams.name ?? 'My Workflow'
  let initialWorkflowId: string | undefined = undefined

  // ?workflow=<id> — load an existing saved workflow from Supabase
  if (!initialDefinition && searchParams.workflow) {
    try {
      const supabase = createServerClient()
      const { data } = await supabase
        .from('workflows')
        .select('id, name, definition_json')
        .eq('id', searchParams.workflow)
        .single()
      if (data) {
        initialName = (data as { name: string }).name
        initialDefinition = (data as { definition_json: WorkflowDefinition }).definition_json
        initialWorkflowId = (data as { id: string }).id
      }
    } catch {
      // If fetch fails, open blank canvas with the ID still set so share/run work
      initialWorkflowId = searchParams.workflow
    }
  }

  const showTour = searchParams.tour === 'true'

  return (
    <div className="h-screen bg-gray-950 text-white">
      <WorkflowCanvas
        initialDefinition={initialDefinition}
        initialName={initialName}
        showTour={showTour}
        initialWorkflowId={initialWorkflowId}
      />
    </div>
  )
}
