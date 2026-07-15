# Adding tools, node types, and eval cases

## Adding a tool

```typescript
// lib/tools/my-tool.ts
import { z } from "zod";
import { defineTool } from "./registry";

export const myTool = defineTool({
  name: "my_tool",
  description: "What this tool does",
  inputSchema: z.object({
    query: z.string().describe("The input query"),
  }),
  execute: async (input) => {
    // input is fully typed and Zod-validated before execute() is called
    return `result for ${input.query}`;
  },
});
```

Register it in `lib/tools/registry.ts`:

```typescript
registry.set("my_tool", myTool);
```

The JSON Schema passed to Groq for function-calling is auto-derived from `inputSchema` via `z.toJSONSchema()` - nothing else needs updating. Validation and the tool spec can never drift apart.

## Adding a node type

1. Add the discriminated union variant to `lib/types.ts`
2. Create `lib/engine/nodes/my-node.ts` with an `execute(node, context, runId?)` function
3. Add a `case 'my_node':` to the switch statement in `lib/engine/runner.ts`
4. Create `components/canvas/nodes/MyNode.tsx` for the React Flow visual representation

## Adding an eval case

Add a JSON file to `evals/cases/` with this shape:

```json
{
  "id": "my-new-case",
  "description": "What this case verifies",
  "tags": ["mock"],
  "template": "lead-qualification",
  "input": "Some company name",
  "assertions": [
    { "type": "contains", "field": "output", "value": "expected substring" }
  ]
}
```

Tag as `"mock"` if it should run in CI on every push with all external calls mocked, or `"live"` if it needs a real Groq/Tavily/Hugging Face response. Full assertion types are documented in `evals/README.md`.

```bash
npm run evals:mock   # runs only mock-tagged cases, zero API keys needed
npm run evals:live   # runs only live-tagged cases against real APIs
npm run evals        # runs both
```
