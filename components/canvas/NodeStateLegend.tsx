const STATES = [
  { color: 'bg-yellow-400', label: 'Running' },
  { color: 'bg-green-500',  label: 'Done' },
  { color: 'bg-red-500',    label: 'Error' },
  { color: 'bg-blue-500',   label: 'Waiting for you' },
] as const

export function NodeStateLegend() {
  return (
    <div className="flex flex-shrink-0 items-center gap-5 border-b border-gray-800 bg-gray-950 px-4 py-1.5">
      {STATES.map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${color}`} />
          {label}
        </span>
      ))}
    </div>
  )
}
