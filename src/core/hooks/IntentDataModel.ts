import { loadActiveIntents } from "../orchestration/active-intents"
import { getRecentTraceEntriesForIntent } from "../orchestration/agent-trace"
import type { ActiveIntentSpec } from "../orchestration/types"
import type { AgentTraceEntry } from "../orchestration/types"

export interface IntentContext {
	constraints: string[]
	scope: string
	owned_scope: string[]
	acceptance_criteria: string[]
	relatedFiles: string[]
	recentHistory: AgentTraceEntry[]
}

/**
 * Data Model for intent-driven context. Queries .orchestration/active_intents.yaml
 * and .orchestration/agent_trace.jsonl. Used by Pre-Hook to inject deep context
 * when select_active_intent is called.
 */
export async function getIntentContext(cwd: string, intentId: string): Promise<IntentContext | null> {
	const intents = await loadActiveIntents(cwd)
	const entry = intents.find((e) => e.id === intentId.trim()) as ActiveIntentSpec | undefined
	if (!entry) return null

	const scope = entry.scope != null ? String(entry.scope).trim() : ""
	const owned_scope = entry.owned_scope ?? []
	const constraints = Array.isArray(entry.constraints)
		? entry.constraints
		: entry.constraints != null
			? [String(entry.constraints)]
			: []
	const acceptance_criteria = entry.acceptance_criteria ?? []
	// relatedFiles from owned_scope (globs/paths)
	const relatedFiles = [...owned_scope]

	const recentHistory = await getRecentTraceEntriesForIntent(cwd, intentId.trim(), 20)

	return {
		scope,
		owned_scope,
		constraints,
		acceptance_criteria,
		relatedFiles,
		recentHistory,
	}
}
