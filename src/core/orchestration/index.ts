export { loadActiveIntents, getValidIntentIds, getActiveIntentsPath } from "./active-intents"
export {
	appendAgentTraceEntry,
	buildTraceEntry,
	getRecentTraceEntriesForIntent,
	getAgentTracePath,
	computeContentHash,
	CONTENT_HASH_PREFIX,
} from "./agent-trace"
export { appendIntentMapEntry, addPathToIntentMap, getIntentMapPath } from "./intent-map"
export type {
	ActiveIntentSpec,
	ActiveIntentsFile,
	AgentTraceEntry,
	AgentTraceFile,
	AgentTraceRange,
	AgentTraceConversation,
	AgentTraceContributor,
	AgentTraceRelated,
} from "./types"
