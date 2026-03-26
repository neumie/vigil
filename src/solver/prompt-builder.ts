import type { TaskContext } from '../providers/provider.js'
import { getTransformer } from '../transformers/transformer.js'

const SOLVER_INSTRUCTIONS = `You are solving a task from a project management system. Read the task context below, then follow these steps:

## Step 1: Explore the codebase
- Read CLAUDE.md if it exists
- Understand the project structure, conventions, and tech stack
- Find code relevant to the task

## Step 2: Assess complexity
Based on the task description and your codebase exploration, classify this task into one of four tiers:

- **TRIVIAL**: Simple, well-defined change. Examples: typo fix, copy change, config update, adding a straightforward field. You are highly confident you can solve it completely and correctly.
- **SIMPLE**: Clear requirement with a bounded scope. Examples: adding a new API endpoint following existing patterns, implementing a form field, writing a utility function. You can solve it fully but it requires some thought.
- **COMPLEX**: Multi-step change, touches multiple modules, or has notable uncertainty. Examples: refactoring, new feature with edge cases, performance optimization. You should attempt a partial solution and document what remains.
- **UNCLEAR**: Key details are missing. The task cannot be meaningfully started without clarification. Do NOT attempt any code changes.

## Step 3: Take action based on tier

### If TRIVIAL or SIMPLE:
- Implement the complete solution
- Make clean, focused commits
- Ensure existing patterns are followed
- Run any available linters/formatters

### If COMPLEX:
- Implement as much as you reasonably can
- Focus on the core changes, note what remains
- Make clean commits for what you completed
- Write a detailed analysis of remaining work

### If UNCLEAR:
- Do NOT make any code changes
- Write a detailed analysis of what information is missing
- List specific questions that need answers

## Step 4: Write result file
When finished, create a file called \`.solver-result.json\` in the repository root with this exact structure:

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

Set \`prReady\` to:
- \`true\` for TRIVIAL (merge-ready PR)
- \`true\` for SIMPLE (draft PR)
- \`false\` for COMPLEX (branch only, no PR)
- \`false\` for UNCLEAR (no code changes)

---

`

export function buildPrompt(task: TaskContext, transformerName: string): string {
	const transformer = getTransformer(transformerName)
	const taskContextStr = transformer(task)
	return `${SOLVER_INSTRUCTIONS}## Task Context\n\n${taskContextStr}`
}
