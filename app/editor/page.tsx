import dynamic from 'next/dynamic'
import type { WorkflowDefinition } from '@/lib/types'
import { getTemplate } from '@/lib/templates'

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
  searchParams: { template?: string; demo?: string; name?: string; tour?: string }
}

export default function EditorPage({ searchParams }: EditorPageProps) {
  // ?demo=true is a legacy alias for the lead-qualification template.
  const templateId =
    searchParams.template ?? (searchParams.demo === 'true' ? 'lead-qualification' : undefined)
  const template = templateId ? getTemplate(templateId) : undefined

  const initialDefinition: WorkflowDefinition | undefined = template?.definition
  const initialName = template?.name ?? searchParams.name ?? 'My Workflow'
  const showTour = searchParams.tour === 'true'

  return (
    <div className="h-screen bg-gray-950 text-white">
      <WorkflowCanvas
        initialDefinition={initialDefinition}
        initialName={initialName}
        showTour={showTour}
      />
    </div>
  )
}
