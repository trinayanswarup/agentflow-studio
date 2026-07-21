import { describe, it, expect } from 'vitest'
import { resolveHumanPauseContent } from './human-pause'
import type { ExecutionContext, HumanPauseNode } from '@/lib/types'

function makeNode(config: HumanPauseNode['config'] = {}): HumanPauseNode {
  return { id: 'review_1', type: 'human_pause', label: 'Analyst Review', config }
}

describe('resolveHumanPauseContent', () => {
  it('falls back to previousOutput when config.content is not set', () => {
    const context: ExecutionContext = { input: 'example.com' }

    const content = resolveHumanPauseContent(makeNode(), context, 'true')

    expect(content).toBe('true')
  })

  it('resolves config.content against the context when set, ignoring previousOutput', () => {
    const context: ExecutionContext = {
      input: 'example.com',
      score_1_output: '{"score":9,"reasoning":"Known breach on file."}',
    }
    const node = makeNode({ content: '{{score_1_output}}' })

    // previousOutput here simulates the "true"/"false" a condition node
    // would actually produce — must be ignored in favor of config.content.
    const content = resolveHumanPauseContent(node, context, 'true')

    expect(content).toBe('{"score":9,"reasoning":"Known breach on file."}')
  })
})
