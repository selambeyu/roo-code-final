import * as path from "path"
import * as fs from "fs/promises"

import * as yaml from "yaml"

import { getOrchestrationDirectoryForCwd } from "../../services/roo-config"
import type { ActiveIntentSpec, ActiveIntentsFile } from "./types"

const ACTIVE_INTENTS_FILENAME = "active_intents.yaml"

/**
 * Path to .orchestration/active_intents.yaml (Intent Specification).
 * Tracks lifecycle of business requirements; updated via Pre/Post-Hooks.
 */
export function getActiveIntentsPath(cwd: string): string {
	return path.join(getOrchestrationDirectoryForCwd(cwd), ACTIVE_INTENTS_FILENAME)
}

function parseActiveIntentsContent(content: string): ActiveIntentSpec[] {
	const parsed = yaml.parse(content) as (ActiveIntentsFile & { intents?: ActiveIntentSpec[] }) | null
	if (!parsed) return []
	const list = parsed.active_intents ?? parsed.intents
	if (!Array.isArray(list)) return []
	return list.filter(
		(e): e is ActiveIntentSpec =>
			typeof e === "object" && e != null && typeof (e as ActiveIntentSpec).id === "string",
	)
}

/**
 * Loads and parses active intents. Tries .orchestration/active_intents.yaml first,
 * then workspace-root active_intents.yaml for backward compatibility.
 * Supports new schema (active_intents, owned_scope, constraints array) and legacy (intents, scope/constraints strings).
 */
export async function loadActiveIntents(cwd: string): Promise<ActiveIntentSpec[]> {
	const primaryPath = getActiveIntentsPath(cwd)
	try {
		const content = await fs.readFile(primaryPath, "utf8")
		return parseActiveIntentsContent(content)
	} catch {
		// Fallback: legacy workspace-root location
		try {
			const legacyPath = path.join(cwd, ACTIVE_INTENTS_FILENAME)
			const content = await fs.readFile(legacyPath, "utf8")
			return parseActiveIntentsContent(content)
		} catch {
			return []
		}
	}
}

/** Valid intent IDs for gatekeeper and select_active_intent. */
export async function getValidIntentIds(cwd: string): Promise<string[]> {
	const intents = await loadActiveIntents(cwd)
	return intents.map((e) => e.id).filter(Boolean)
}
