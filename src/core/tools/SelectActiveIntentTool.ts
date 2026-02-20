import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { loadActiveIntents } from "../orchestration/active-intents"
import type { ActiveIntentSpec } from "../orchestration/types"
import { getIntentContext } from "../hooks/IntentDataModel"

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

function buildIntentContextXml(entry: ActiveIntentSpec): string {
	const name = entry.name != null ? String(entry.name).trim() : ""
	const status = entry.status != null ? String(entry.status).trim() : ""
	const ownedScope = entry.owned_scope ?? []
	const constraintsList = Array.isArray(entry.constraints)
		? entry.constraints
		: entry.constraints != null
			? [String(entry.constraints)]
			: []
	const acceptanceCriteria = entry.acceptance_criteria ?? []
	// Legacy: single scope string
	const scopeLegacy = entry.scope != null ? String(entry.scope).trim() : ""

	const nameBlock = name ? `  <name>${escapeXml(name)}</name>\n` : ""
	const statusBlock = status ? `  <status>${escapeXml(status)}</status>\n` : ""
	const ownedScopeBlock =
		ownedScope.length > 0
			? `  <owned_scope>\n${ownedScope.map((s) => `    - ${escapeXml(s)}`).join("\n")}\n  </owned_scope>\n`
			: ""
	const scopeLegacyBlock = scopeLegacy ? `  <scope>${escapeXml(scopeLegacy)}</scope>\n` : ""
	const constraintsBlock =
		constraintsList.length > 0
			? `  <constraints>\n${constraintsList.map((c) => `    - ${escapeXml(String(c))}`).join("\n")}\n  </constraints>\n`
			: ""
	const acceptanceBlock =
		acceptanceCriteria.length > 0
			? `  <acceptance_criteria>\n${acceptanceCriteria.map((a) => `    - ${escapeXml(String(a))}`).join("\n")}\n  </acceptance_criteria>\n`
			: ""

	return `<intent_context>\n${nameBlock}${statusBlock}${ownedScopeBlock}${scopeLegacyBlock}${constraintsBlock}${acceptanceBlock}</intent_context>`
}

/** Re-export for gatekeeper and other consumers that expect workspace-root path. Prefer getActiveIntentsPath from orchestration. */
export async function loadActiveIntentsFromOrchestration(cwd: string): Promise<ActiveIntentSpec[]> {
	return loadActiveIntents(cwd)
}

export async function getValidIntentIds(cwd: string): Promise<string[]> {
	const intents = await loadActiveIntents(cwd)
	return intents.map((e) => e.id).filter(Boolean)
}

/**
 * Builds consolidated intent context XML (constraints, scope, related files, recent trace).
 * Used by Context Loader (Pre-Hook) to inject into the system prompt and by select_active_intent tool result.
 */
export async function getConsolidatedIntentContextXml(cwd: string, intentId: string): Promise<string> {
	const intents = await loadActiveIntents(cwd)
	const entry = intents.find((e) => e.id === intentId.trim())
	if (!entry) return ""

	let xml = buildIntentContextXml(entry)
	const deepContext = await getIntentContext(cwd, intentId.trim())
	if (deepContext) {
		if (deepContext.relatedFiles.length > 0) {
			xml = xml.replace(
				"</intent_context>",
				`  <related_files>\n${deepContext.relatedFiles.map((f) => `    - ${escapeXml(f)}`).join("\n")}\n  </related_files>\n</intent_context>`,
			)
		}
		if (deepContext.recentHistory.length > 0) {
			const summary = deepContext.recentHistory
				.slice(0, 10)
				.map((e) => `${e.timestamp} ${e.files?.map((f) => f.relative_path).join(", ") ?? ""}`)
				.join("; ")
			xml = xml.replace(
				"</intent_context>",
				`  <recent_history>${escapeXml(summary)}</recent_history>\n</intent_context>`,
			)
		}
	}
	return xml
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: { intent_id: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { intent_id } = params
		const { pushToolResult } = callbacks

		if (!intent_id || typeof intent_id !== "string" || !intent_id.trim()) {
			task.consecutiveMistakeCount++
			pushToolResult("You must cite a valid active Intent ID.")
			return
		}

		const intents = await loadActiveIntents(task.cwd)
		const entry = intents.find((e) => e.id === intent_id.trim())

		if (!entry) {
			task.consecutiveMistakeCount++
			const validIds = intents.map((e) => e.id).filter(Boolean)
			const hint =
				validIds.length > 0
					? ` Valid IDs: ${validIds.join(", ")}`
					: " No intents in .orchestration/active_intents.yaml."
			pushToolResult(`You must cite a valid active Intent ID.${hint}`)
			return
		}

		task.consecutiveMistakeCount = 0
		const intentId = intent_id.trim()
		task.currentIntentId = intentId
		const xml = await getConsolidatedIntentContextXml(task.cwd, intentId)
		pushToolResult(xml)
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
