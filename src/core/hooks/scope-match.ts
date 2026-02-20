/**
 * Scope enforcement: check if a relative file path matches an intent's owned_scope (globs).
 * Uses simple glob rules: ** matches any path segment sequence, * matches one segment.
 */
function toPosix(p: string): string {
	return p.replace(/\\/g, "/")
}

/**
 * Returns true if `relativePath` is under (or equal to) any of the owned_scope patterns.
 * Patterns are globs, e.g. "src/auth/**", "src/middleware/jwt.ts".
 */
export function pathMatchesOwnedScope(relativePath: string, ownedScope: string[]): boolean {
	if (ownedScope.length === 0) return false
	const path = toPosix(relativePath).replace(/^\/+/, "")

	for (const pattern of ownedScope) {
		const p = toPosix(pattern).replace(/^\/+/, "")
		if (matchGlob(path, p)) return true
	}
	return false
}

function matchGlob(path: string, pattern: string): boolean {
	// Exact match
	if (path === pattern) return true
	// Pattern "prefix/**" matches "prefix" or "prefix/anything"
	if (pattern.endsWith("/**")) {
		const prefix = pattern.slice(0, -3)
		if (path === prefix || path.startsWith(prefix + "/")) return true
	}
	// Directory prefix (no wildcard): "src/auth" matches "src/auth/foo.ts"
	if (pattern !== "" && !pattern.includes("*")) {
		if (path.startsWith(pattern + "/")) return true
	}
	// Glob: * and ** via regex
	const re = globToRegExp(pattern)
	return re.test(path)
}

function globToRegExp(glob: string): RegExp {
	// ** matches zero or more path segments; * matches one segment (no /)
	const escaped = glob
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "\\E.*")
		.replace(/\*/g, "[^/]*")
		.replace(/\\E/g, ".*")
	return new RegExp(`^${escaped}$`)
}
