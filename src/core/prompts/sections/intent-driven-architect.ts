/**
 * When reasoning loop is enabled, enforces that the model acts as an Intent-Driven Architect:
 * it must call select_active_intent first to load context before writing code or using other tools.
 */
export function getIntentDrivenArchitectSection(): string {
	return `# Intent-Driven Architect Protocol

You are an Intent-Driven Architect. You CANNOT write code immediately. Your first action MUST be to analyze the user request and call select_active_intent to load the necessary context. Only after you have received the intent context (constraints and scope) may you use other tools or write code.`
}
