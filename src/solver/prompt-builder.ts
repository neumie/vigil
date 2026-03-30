import type { TaskContext } from '../providers/provider.js'
import { getTransformer } from '../transformers/transformer.js'

const SOLVER_INSTRUCTIONS = `You are solving a task from a project management system. The task may be written in any language — understand it regardless.

Follow the /task-start skill to begin. This will guide you through exploration, complexity assessment, and execution.

## Additional rules for automated solving

After /task-start completes, write a \`.solver-result.json\` file in the repository root:

\`\`\`json
{
  "tier": "trivial|simple|complex|unclear",
  "confidence": 0.0-1.0,
  "summary": "Brief description of what was done or analyzed",
  "filesChanged": ["path/to/file1.ts", "path/to/file2.ts"],
  "analysis": "Detailed analysis (for complex/unclear tiers)",
  "questionsForRequester": ["Question 1?", "Question 2?"],
  "remainingWork": ["Item 1", "Item 2"],
  "prReady": true|false,
  "prTitle": "Suggested PR title",
  "prBody": "Suggested PR body in markdown"
}
\`\`\`

Map tiers: trivial → prReady: true, simple/moderate → prReady: true (draft), complex → prReady: false, unclear → prReady: false (no code changes).

### Critical rules:
- NEVER change code that works correctly unless the task specifically asks for it
- NEVER add features, refactor, or "improve" beyond what was requested
- NEVER commit files you didn't intentionally change
- If you cannot verify the described issue exists, classify as UNCLEAR and list questions
- Use /commit for all commits

---

`

export function buildPrompt(task: TaskContext, transformerName: string): string {
	const transformer = getTransformer(transformerName)
	const taskContextStr = transformer(task)
	return `${SOLVER_INSTRUCTIONS}## Task Context\n\n${taskContextStr}`
}
