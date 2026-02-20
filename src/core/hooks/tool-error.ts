/**
 * Standardized JSON tool-error for autonomous recovery.
 * LLM receives this structure so it can self-correct without crashing.
 */
export interface ToolErrorPayload {
	error: string
	code: string
	message: string
	intent_id?: string
	path?: string
	suggestion?: string
}

export const ToolErrorCodes = {
	SCOPE_VIOLATION: "SCOPE_VIOLATION",
	INTENT_REQUIRED: "INTENT_REQUIRED",
	INTENT_INVALID: "INTENT_INVALID",
	INTENT_IGNORED: "INTENT_IGNORED",
	USER_REJECTED: "USER_REJECTED",
	MUTATION_CLASS_REQUIRED: "MUTATION_CLASS_REQUIRED",
} as const

export function formatToolError(payload: ToolErrorPayload): string {
	return JSON.stringify(payload)
}

export function scopeViolationError(intentId: string, filename: string): string {
	return formatToolError({
		error: "scope_violation",
		code: ToolErrorCodes.SCOPE_VIOLATION,
		message: `Scope Violation: ${intentId} is not authorized to edit ${filename}. Request scope expansion.`,
		intent_id: intentId,
		path: filename,
		suggestion:
			"Either choose a file within the intent's owned_scope or ask the user to expand the intent scope in .orchestration/active_intents.yaml",
	})
}

/** Gatekeeper: no intent declared or invalid intent_id. */
export function gatekeeperInvalidIntentError(): string {
	return formatToolError({
		error: "intent_invalid",
		code: ToolErrorCodes.INTENT_INVALID,
		message: "You must cite a valid active Intent ID.",
		suggestion: "Call select_active_intent(intent_id) with an intent_id from .orchestration/active_intents.yaml",
	})
}

export function intentRequiredError(): string {
	return formatToolError({
		error: "intent_required",
		code: ToolErrorCodes.INTENT_REQUIRED,
		message:
			"You must cite a valid active Intent ID. Call select_active_intent(intent_id) first to load context before using other tools.",
		suggestion: "Call select_active_intent with an intent_id from .orchestration/active_intents.yaml",
	})
}

export function intentIgnoredError(intentId: string): string {
	return formatToolError({
		error: "intent_ignored",
		code: ToolErrorCodes.INTENT_IGNORED,
		message: `Intent ${intentId} is listed in .intentignore. Changes to this intent are excluded.`,
		intent_id: intentId,
		suggestion: "Choose a different intent or ask the user to remove this intent from .intentignore",
	})
}

export function userRejectedError(feedback?: string): string {
	return formatToolError({
		error: "user_rejected",
		code: ToolErrorCodes.USER_REJECTED,
		message: feedback ?? "The user rejected this operation.",
		suggestion: "Adjust your approach and retry, or ask the user for guidance",
	})
}

/** write_to_file: mutation_class must be AST_REFACTOR (syntax change) or INTENT_EVOLUTION (new feature). */
export function mutationClassRequiredError(): string {
	return formatToolError({
		error: "mutation_class_required",
		code: ToolErrorCodes.MUTATION_CLASS_REQUIRED,
		message:
			"write_to_file requires mutation_class: use AST_REFACTOR (syntax change, same intent) or INTENT_EVOLUTION (new feature).",
		suggestion: "Call write_to_file with mutation_class set to AST_REFACTOR or INTENT_EVOLUTION",
	})
}
