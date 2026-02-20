import * as vscode from "vscode"

import { Package } from "../../shared/package"
import type { Task } from "../task/Task"
import type { ToolResponse } from "../../shared/tools"
import { appendAgentTraceEntry, buildTraceEntry } from "../orchestration/agent-trace"
import { addPathToIntentMap } from "../orchestration/intent-map"
import { getValidIntentIds, loadActiveIntents } from "../orchestration/active-intents"
import { loadIntentignore } from "../orchestration/intentignore"
import { pathMatchesOwnedScope } from "./scope-match"
import { MUTATION_CLASS } from "../orchestration/types"
import {
	gatekeeperInvalidIntentError,
	scopeViolationError,
	intentIgnoredError,
	userRejectedError,
	mutationClassRequiredError,
} from "./tool-error"

/** Safe (read-only) tools: no file writes, no shell execution, no destructive side effects. */
const SAFE_TOOLS = new Set([
	"read_file",
	"list_files",
	"search_files",
	"codebase_search",
	"read_command_output",
	"ask_followup_question",
	"select_active_intent",
	"attempt_completion",
	"switch_mode",
	"access_mcp_resource",
	"use_mcp_tool",
])

/** Destructive tools: write, delete, or execute. Require intent checkout and scope when reasoning loop is on. */
const DESTRUCTIVE_TOOLS = new Set([
	"write_to_file",
	"edit_file",
	"search_replace",
	"edit",
	"apply_patch",
	"apply_diff",
	"execute_command",
	"new_task",
	"run_slash_command",
])

const MUTATING_TOOLS = new Set(["write_to_file", "edit_file", "search_replace", "edit", "apply_patch", "apply_diff"])

export interface HookEngineCallbacks {
	/** Pass options.is_error: true when the tool was blocked (so LLM/API treat it as a tool error). */
	pushToolResult: (content: ToolResponse, options?: { is_error?: boolean }) => void
}

/**
 * Hook Engine: strict middleware boundary. Intercepts all tool execution.
 * - PreToolUse: enforces intent context (two-stage state machine) and HITL is handled per-tool.
 * - PostToolUse: updates agent_trace.jsonl (content_hash, link to intent_id) and intent_map.md.
 */
export async function runWithHooks(options: {
	toolName: string
	block: { nativeArgs?: Record<string, unknown>; params?: Record<string, unknown> }
	task: Task
	callbacks: HookEngineCallbacks
	execute: () => Promise<void>
}): Promise<void> {
	const { toolName, block, task, callbacks, execute } = options
	const args = block.nativeArgs ?? block.params ?? {}
	// Use workspace folder that contains task.cwd so .vscode/settings.json in the project is respected
	const resource = task.cwd ? vscode.Uri.file(task.cwd) : undefined
	const config = vscode.workspace.getConfiguration(Package.name, resource)
	const reasoningLoopEnabled = config.get<boolean>("reasoningLoopEnabled", false)

	// ---------- PreToolUse: Gatekeeper — valid intent_id required for non-select tools ----------
	if (reasoningLoopEnabled && toolName !== "select_active_intent") {
		if (!task.currentIntentId) {
			task.consecutiveMistakeCount++
			callbacks.pushToolResult(gatekeeperInvalidIntentError(), { is_error: true })
			return
		}
		const validIds = await getValidIntentIds(task.cwd)
		if (!validIds.includes(task.currentIntentId)) {
			task.consecutiveMistakeCount++
			callbacks.pushToolResult(gatekeeperInvalidIntentError(), { is_error: true })
			return
		}
	}

	// ---------- PreToolUse: .intentignore (exclude changes to listed intents) ----------
	if (reasoningLoopEnabled && DESTRUCTIVE_TOOLS.has(toolName) && task.currentIntentId) {
		const ignored = await loadIntentignore(task.cwd)
		if (ignored.has(task.currentIntentId)) {
			task.consecutiveMistakeCount++
			callbacks.pushToolResult(intentIgnoredError(task.currentIntentId), { is_error: true })
			return
		}
	}

	// ---------- PreToolUse: Scope enforcement (owned_scope vs target path) ----------
	if (reasoningLoopEnabled && task.currentIntentId) {
		const targetPath = getRelativePathFromBlock(toolName, args)
		if (
			targetPath &&
			DESTRUCTIVE_TOOLS.has(toolName) &&
			toolName !== "execute_command" &&
			toolName !== "new_task" &&
			toolName !== "run_slash_command"
		) {
			const intents = await loadActiveIntents(task.cwd)
			const spec = intents.find((e) => e.id === task.currentIntentId)
			const ownedScope = spec?.owned_scope ?? []
			if (ownedScope.length > 0 && !pathMatchesOwnedScope(targetPath, ownedScope)) {
				task.consecutiveMistakeCount++
				callbacks.pushToolResult(scopeViolationError(task.currentIntentId, targetPath), { is_error: true })
				return
			}
		}
	}

	// ---------- PreToolUse: write_to_file requires mutation_class (AST_REFACTOR | INTENT_EVOLUTION) ----------
	if (reasoningLoopEnabled && toolName === "write_to_file") {
		const mc = typeof args.mutation_class === "string" ? args.mutation_class.trim() : ""
		const valid = mc === MUTATION_CLASS.AST_REFACTOR || mc === MUTATION_CLASS.INTENT_EVOLUTION
		if (!valid) {
			task.consecutiveMistakeCount++
			callbacks.pushToolResult(mutationClassRequiredError(), { is_error: true })
			return
		}
	}

	// ---------- PreToolUse: UI-blocking authorization (Approve/Reject) for destructive tools ----------
	if (reasoningLoopEnabled && DESTRUCTIVE_TOOLS.has(toolName)) {
		const targetPath = getRelativePathFromBlock(toolName, args)
		const detail = targetPath ? `${toolName} → ${targetPath}` : toolName
		const intentLabel = task.currentIntentId ? ` (Intent: ${task.currentIntentId})` : ""
		const choice = await vscode.window.showWarningMessage(
			`Allow this change? ${detail}${intentLabel}`,
			"Approve",
			"Reject",
		)
		if (choice !== "Approve") {
			task.consecutiveMistakeCount++
			callbacks.pushToolResult(
				userRejectedError(choice === "Reject" ? "User rejected the operation." : undefined),
				{ is_error: true },
			)
			return
		}
	}

	// ---------- Execute (extension host handles API, MCP, tool impl) ----------
	await execute()

	// ---------- PostToolUse: trace ledger (Intent ID → content_hash; refactor vs feature via mutation_class), intent map ----------
	// Always append to agent_trace.jsonl when a mutating tool runs (so the ledger updates even if reasoning loop is off).
	if (MUTATING_TOOLS.has(toolName) && task.cwd && task.cwd.trim() !== "") {
		const intentId = (typeof args.intent_id === "string" ? args.intent_id : undefined) ?? task.currentIntentId
		const relativePath = getRelativePathFromBlock(toolName, args)
		const contentForHash = getContentForHashFromBlock(toolName, args)
		// write_to_file supplies mutation_class when reasoning loop is on; other tools default to INTENT_EVOLUTION
		const mutationClass =
			typeof args.mutation_class === "string" &&
			(args.mutation_class === MUTATION_CLASS.AST_REFACTOR ||
				args.mutation_class === MUTATION_CLASS.INTENT_EVOLUTION)
				? args.mutation_class
				: MUTATION_CLASS.INTENT_EVOLUTION
		if (relativePath && contentForHash !== undefined) {
			const entry = buildTraceEntry({
				intentId,
				tool: toolName,
				relativePath,
				content: contentForHash,
				mutation_class: mutationClass,
				sessionLogId: task.taskId,
				modelId: task.api.getModel().id,
			})
			await appendAgentTraceEntry(task.cwd, entry)
		}
		// Update spatial map when reasoning loop is on (intent_map.md)
		if (reasoningLoopEnabled && intentId && relativePath) {
			const intents = await loadActiveIntents(task.cwd)
			const spec = intents.find((e) => e.id === intentId)
			await addPathToIntentMap(task.cwd, intentId, spec?.name, relativePath)
		}
	}
}

function getRelativePathFromBlock(toolName: string, args: Record<string, unknown>): string | undefined {
	switch (toolName) {
		case "write_to_file":
			return typeof args.path === "string" ? args.path : undefined
		case "edit_file":
		case "search_replace":
		case "edit":
			return typeof args.file_path === "string" ? args.file_path : undefined
		case "apply_diff":
			return typeof args.path === "string" ? args.path : undefined
		case "apply_patch":
			return "patch"
		default:
			return undefined
	}
}

function getContentForHashFromBlock(toolName: string, args: Record<string, unknown>): string | undefined {
	switch (toolName) {
		case "write_to_file":
			return typeof args.content === "string" ? args.content : ""
		case "edit_file":
		case "search_replace":
		case "edit":
			return typeof args.new_string === "string" ? args.new_string : undefined
		case "apply_diff":
			return typeof args.diff === "string" ? args.diff : undefined
		case "apply_patch":
			return typeof args.patch === "string" ? args.patch : undefined
		default:
			return undefined
	}
}
