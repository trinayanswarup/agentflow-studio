import dynamic from 'next/dynamic'

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
  searchParams: { demo?: string; name?: string }
}

export default function EditorPage({ searchParams }: EditorPageProps) {
  const isDemo = searchParams.demo === 'true'
  const initialName = isDemo ? 'Lead Enrichment Pipeline' : (searchParams.name ?? 'My Workflow')

  return (
    <div className="h-screen bg-gray-950 text-white">
      <WorkflowCanvas initialDemo={isDemo} initialName={initialName} />
    </div>
  )
}
