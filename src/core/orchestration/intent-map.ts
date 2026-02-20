import * as path from "path"
import * as fs from "fs/promises"

import { getOrchestrationDirectoryForCwd } from "../../services/roo-config"

const INTENT_MAP_FILENAME = "intent_map.md"

/**
 * Path to .orchestration/intent_map.md (The Spatial Map).
 * Maps high-level intents to physical files; updated on intent evolution.
 */
export function getIntentMapPath(cwd: string): string {
	return path.join(getOrchestrationDirectoryForCwd(cwd), INTENT_MAP_FILENAME)
}

/**
 * Appends or updates a section for an intent in intent_map.md.
 * Called incrementally when intent evolution occurs (Post-Hook).
 * Format:
 *   ## INT-001: Intent Name
 *   - path/to/file.ts
 *   - path/to/other.ts
 */
export async function appendIntentMapEntry(
	cwd: string,
	intentId: string,
	intentName: string | undefined,
	relativePaths: string[],
): Promise<void> {
	const dir = getOrchestrationDirectoryForCwd(cwd)
	const mapPath = getIntentMapPath(cwd)

	let existing = ""
	try {
		existing = await fs.readFile(mapPath, "utf8")
	} catch {
		// File missing
	}

	const heading = `## ${intentId}${intentName ? `: ${intentName}` : ""}\n`
	const bulletList = relativePaths.map((p) => `- ${p}`).join("\n") + "\n\n"
	const newSection = heading + bulletList

	// If intent already has a section, replace it; otherwise append
	const sectionRegex = new RegExp(`## ${escapeRegex(intentId)}(: [^\n]*)?\n([\\s\\S]*?)(?=\\n## |$)`, "m")
	const match = existing.match(sectionRegex)
	let newContent: string
	if (match) {
		newContent = existing.replace(sectionRegex, newSection.trimEnd() + "\n\n")
	} else {
		newContent = (existing.trimEnd() ? existing + "\n\n" : "") + newSection
	}

	try {
		await fs.mkdir(dir, { recursive: true })
		await fs.writeFile(mapPath, newContent, "utf8")
	} catch (err) {
		console.warn("[orchestration] Failed to update intent_map.md:", err)
	}
}

/** Parses existing paths for an intent from intent_map.md (bullet lines under ## intentId). */
function getExistingPathsForIntent(content: string, intentId: string): string[] {
	const sectionRegex = new RegExp(`## ${escapeRegex(intentId)}(: [^\n]*)?\n([\\s\\S]*?)(?=\\n## |$)`, "m")
	const match = content.match(sectionRegex)
	if (!match) return []
	const body = match[2] ?? ""
	return body
		.split("\n")
		.map((l) => l.replace(/^\s*-\s*/, "").trim())
		.filter(Boolean)
}

/**
 * Adds one path to an intent's section (merge). Use from Post-Hook to incrementally update the spatial map.
 */
export async function addPathToIntentMap(
	cwd: string,
	intentId: string,
	intentName: string | undefined,
	newPath: string,
): Promise<void> {
	const mapPath = getIntentMapPath(cwd)
	let existing = ""
	try {
		existing = await fs.readFile(mapPath, "utf8")
	} catch {
		// File missing
	}
	const existingPaths = getExistingPathsForIntent(existing, intentId)
	if (existingPaths.includes(newPath)) return
	await appendIntentMapEntry(cwd, intentId, intentName, [...existingPaths, newPath])
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
