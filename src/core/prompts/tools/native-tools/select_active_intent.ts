import type OpenAI from "openai"

const SELECT_ACTIVE_INTENT_DESCRIPTION = `Load the context for an active intent before proceeding. You MUST call this tool first with a valid intent_id from the active intents list. Do not write code or use other tools until you have received the intent context.

Parameters:
- intent_id: (required) The ID of the active intent to load. Must match an entry in .orchestration/active_intents.yaml.

Example: Loading context for a specific intent
{ "intent_id": "fix-login-bug" }`

const INTENT_ID_PARAMETER_DESCRIPTION = `The ID of the active intent (must exist in .orchestration/active_intents.yaml)`

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description: SELECT_ACTIVE_INTENT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: INTENT_ID_PARAMETER_DESCRIPTION,
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
