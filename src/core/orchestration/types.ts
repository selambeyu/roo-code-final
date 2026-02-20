/**
 * Data Model types for .orchestration/ (Sidecar storage pattern).
 * Machine-managed; essentials only.
 */

/** Single intent from active_intents.yaml (Intent Specification) */
export interface ActiveIntentSpec {
	id: string
	name?: string
	status?: string
	/** Formal scope: globs or paths for parallelism */
	owned_scope?: string[]
	constraints?: string[]
	/** Definition of Done */
	acceptance_criteria?: string[]
	/** Legacy: single scope description */
	scope?: string
	[key: string]: unknown
}

export interface ActiveIntentsFile {
	active_intents: ActiveIntentSpec[]
}

/** One range in a file with content hash for spatial independence */
export interface AgentTraceRange {
	start_line: number
	end_line: number
	content_hash: string
}

/** Contributor to a conversation (AI or human) */
export interface AgentTraceContributor {
	entity_type: "AI" | "human"
	model_identifier?: string
}

/** One conversation (session) contributing to a file */
export interface AgentTraceConversation {
	url?: string
	contributor: AgentTraceContributor
	ranges: AgentTraceRange[]
}

/** Related artifact (e.g. specification reference) */
export interface AgentTraceRelated {
	type: string
	value: string
}

/** One file in a trace entry */
export interface AgentTraceFile {
	relative_path: string
	conversations: AgentTraceConversation[]
	related?: AgentTraceRelated[]
}

/** Semantic classification for mutations: AST_REFACTOR = syntax change, same intent; INTENT_EVOLUTION = new feature. */
export const MUTATION_CLASS = {
	AST_REFACTOR: "AST_REFACTOR",
	INTENT_EVOLUTION: "INTENT_EVOLUTION",
} as const

export type MutationClass = (typeof MUTATION_CLASS)[keyof typeof MUTATION_CLASS]

/**
 * Single append-only record in agent_trace.jsonl (The Ledger).
 * Maps Intent IDs (REQ-ID) to Content Hashes; mutation_class distinguishes refactors from features.
 */
export interface AgentTraceEntry {
	id: string
	timestamp: string
	/** REQ-ID from Phase 1; links this change to an intent. */
	intent_id?: string
	/** Explicit mapping: related array contains the Intent ID (REQ-ID). */
	related?: AgentTraceRelated[]
	/** Semantic classification: AST_REFACTOR (syntax change, same intent) or INTENT_EVOLUTION (new feature). */
	mutation_class?: string
	vcs?: { revision_id?: string }
	/** Each file has ranges with content_hash (spatial hash); intent_id + content_hash = full traceability. */
	files: AgentTraceFile[]
}
