import * as path from "path"
import * as fs from "fs/promises"

import { getOrchestrationDirectoryForCwd } from "../../services/roo-config"

const INTENTIGNORE_FILENAME = ".intentignore"

/**
 * Path to .orchestration/.intentignore. Lists intent IDs to exclude from changes
 * (frozen intents). One intent ID per line; # comments supported.
 */
export function getIntentignorePath(cwd: string): string {
	return path.join(getOrchestrationDirectoryForCwd(cwd), INTENTIGNORE_FILENAME)
}

/**
 * Loads the set of intent IDs that are ignored (excluded from destructive changes).
 * Returns empty set if file missing or unreadable.
 */
export async function loadIntentignore(cwd: string): Promise<Set<string>> {
	const filePath = getIntentignorePath(cwd)
	try {
		const content = await fs.readFile(filePath, "utf8")
		const ids = new Set<string>()
		for (const line of content.split("\n")) {
			const trimmed = line.replace(/#.*$/, "").trim()
			if (trimmed) ids.add(trimmed)
		}
		return ids
	} catch {
		return new Set()
	}
}
