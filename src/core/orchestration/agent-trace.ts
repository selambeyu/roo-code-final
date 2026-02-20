import * as crypto from "crypto"
import * as path from "path"
import * as fs from "fs/promises"

import { getOrchestrationDirectoryForCwd } from "../../services/roo-config"
import type { AgentTraceEntry, AgentTraceFile, AgentTraceRange } from "./types"

const AGENT_TRACE_FILENAME = "agent_trace.jsonl"

/** Prefix for content hash in ledger (spatial independence). */
export const CONTENT_HASH_PREFIX = "sha256:"

/**
 * Spatial hashing: SHA-256 hash of string content for the trace ledger.
 * Enables content-addressable ranges; if lines move, the hash of the content remains valid.
 */
export function computeContentHash(content: string): string {
	const hash = crypto.createHash("sha256").update(content, "utf8").digest("hex")
	return `${CONTENT_HASH_PREFIX}${hash}`
}

/**
 * Path to .orchestration/agent_trace.jsonl (The Ledger).
 * Each line: one JSON object that maps an Intent ID (REQ-ID) to content hashes (ranges[].content_hash).
 * mutation_class distinguishes refactors (AST_REFACTOR) from features (INTENT_EVOLUTION).
 */
export function getAgentTracePath(cwd: string): string {
	return path.join(getOrchestrationDirectoryForCwd(cwd), AGENT_TRACE_FILENAME)
}

/**
 * Appends one record to agent_trace.jsonl. Called from Post-Hook after file writes.
 * Uses full Agent Trace schema; content_hash per range for spatial independence.
 */
export async function appendAgentTraceEntry(cwd: string, entry: AgentTraceEntry): Promise<void> {
	const dir = getOrchestrationDirectoryForCwd(cwd)
	const tracePath = getAgentTracePath(cwd)
	const line = JSON.stringify(entry) + "\n"
	try {
		await fs.mkdir(dir, { recursive: true })
		await fs.appendFile(tracePath, line, "utf8")
	} catch (err) {
		console.warn("[orchestration] Failed to append agent trace:", err)
	}
}

/**
 * Builds a single trace entry for a file write/edit.
 * - Injects REQ-ID (intent_id) into the top-level related array (Intent ID → entry mapping).
 * - Injects content_hash (SHA-256 spatial hash) into each range (content → hash mapping).
 * - mutation_class distinguishes AST_REFACTOR (refactor) from INTENT_EVOLUTION (feature).
 * Append to agent_trace.jsonl via appendAgentTraceEntry.
 */
export function buildTraceEntry(params: {
	intentId: string | undefined
	tool: string
	relativePath: string
	content: string
	mutation_class?: string
	startLine?: number
	endLine?: number
	sessionLogId?: string
	modelId?: string
	revisionId?: string
}): AgentTraceEntry {
	const contentHash = computeContentHash(params.content)
	const ranges: AgentTraceRange[] = [
		{
			start_line: params.startLine ?? 1,
			end_line: params.endLine ?? 1,
			content_hash: contentHash,
		},
	]
	const file: AgentTraceFile = {
		relative_path: params.relativePath,
		conversations: [
			{
				url: params.sessionLogId,
				contributor: { entity_type: "AI", model_identifier: params.modelId },
				ranges,
			},
		],
		related: params.intentId ? [{ type: "intent", value: params.intentId }] : undefined,
	}
	return {
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		intent_id: params.intentId,
		related: params.intentId ? [{ type: "intent", value: params.intentId }] : undefined,
		mutation_class: params.mutation_class,
		vcs: params.revisionId ? { revision_id: params.revisionId } : undefined,
		files: [file],
	}
}

/**
 * Reads recent trace entries for an intent (for deep context injection).
 * Parses JSONL and filters by intent_id; returns last N, newest first.
 */
export async function getRecentTraceEntriesForIntent(
	cwd: string,
	intentId: string,
	limit: number = 20,
): Promise<AgentTraceEntry[]> {
	const tracePath = getAgentTracePath(cwd)
	try {
		const content = await fs.readFile(tracePath, "utf8")
		const lines = content.split("\n").filter(Boolean)
		const entries: AgentTraceEntry[] = []
		for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
			const entry = JSON.parse(lines[i]) as AgentTraceEntry
			if (entry.intent_id === intentId) entries.push(entry)
		}
		return entries
	} catch {
		return []
	}
}
