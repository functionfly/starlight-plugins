import { a as resolveGitHubToken, c as LiveEntryFilterSchema, i as fetchReleasesByRepoList, l as LiveGithubReleasesLoaderUserConfigSchema, n as fetchReleaseByRestId, r as fetchReleaseByTag, s as LiveCollectionFilterSchema, t as fetchReleaseById } from "./releases-DtdjsETE.js";
import { getSecret } from "astro:env/server";
// src/live-github-releases-loader.ts
/**
* Simple in-memory cache for live loader results.
*/
const cache = /* @__PURE__ */ new Map();
function getCached(key) {
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data;
}
function setCached(key, data, ttlSeconds) {
	if (ttlSeconds <= 0) return;
	cache.set(key, {
		data,
		expiresAt: Date.now() + ttlSeconds * 1e3
	});
}
var LiveGithubReleasesLoaderError = class extends Error {
	code;
	identifier;
	constructor(message, code, identifier) {
		super(message);
		this.code = code;
		this.identifier = identifier;
		this.name = "LiveGithubReleasesLoaderError";
	}
};
/**
* Resolve the token for the live loader.
*
* `getSecret` THROWS when the secret is not declared in `astro:env`, so an
* undeclared secret used to abort the request with an error instead of the
* loader's own "missing token" answer. The process environment is checked
* afterwards, because a token in the environment is a normal way to run this.
*/
function resolveLiveToken(explicit) {
	if (explicit) return explicit;
	try {
		const secret = getSecret("GITHUB_TOKEN");
		if (secret) return secret;
	} catch {}
	return resolveGitHubToken();
}
/**
* Live Astro loader that fetches releases at runtime on each request.
* Fetches releases from repository lists or a single release by its identifier.
*/
function liveGithubReleasesLoader(userConfig) {
	let githubToken;
	let cacheTtlSeconds = 300;
	if (userConfig) {
		const parsedConfig = LiveGithubReleasesLoaderUserConfigSchema.safeParse(userConfig);
		if (!parsedConfig.success) throw new LiveGithubReleasesLoaderError(`The configuration provided is invalid. ${parsedConfig.error.issues.map((issue) => issue.message).join("\n")}`, "INVALID_CONFIG");
		githubToken = parsedConfig.data.githubToken;
		cacheTtlSeconds = parsedConfig.data.cacheTtl;
	}
	return {
		name: "live-github-releases",
		async loadCollection({ filter }) {
			const parsedFilter = LiveCollectionFilterSchema.safeParse(filter);
			if (!parsedFilter.success) return { error: new LiveGithubReleasesLoaderError(`The filter provided is invalid. ${parsedFilter.error.issues.map((issue) => issue.message).join("\n")}`, "INVALID_FILTER") };
			const parsed = parsedFilter.data;
			const cacheKey = `collection:${JSON.stringify(parsed)}`;
			const cached = getCached(cacheKey);
			if (cached) return { entries: cached };
			const config = parsed;
			const token = resolveLiveToken(githubToken);
			if (!token) return { error: new LiveGithubReleasesLoaderError("No GitHub token provided.", "MISSING_TOKEN") };
			try {
				const entries = (await fetchReleasesByRepoList(config, token)).map((release) => ({
					id: "id" in release ? release.id : release.repo,
					data: release,
					rendered: "descriptionHTML" in release ? { html: release.descriptionHTML || "" } : void 0
				}));
				setCached(cacheKey, entries, cacheTtlSeconds);
				return { entries };
			} catch (error) {
				return { error: new LiveGithubReleasesLoaderError("Failed to load GitHub releases.", "COLLECTION_LOAD_ERROR") };
			}
		},
		async loadEntry({ filter }) {
			const parsedFilter = LiveEntryFilterSchema.safeParse(filter);
			if (!parsedFilter.success) return { error: new LiveGithubReleasesLoaderError(`The filter provided is invalid. ${parsedFilter.error.issues.map((issue) => issue.message).join("\n")}`, "INVALID_FILTER") };
			const token = resolveLiveToken(githubToken);
			if (!token) return { error: new LiveGithubReleasesLoaderError("No GitHub token provided.", "MISSING_TOKEN") };
			const { identifier } = parsedFilter.data;
			const cacheKey = `entry:${JSON.stringify(identifier)}`;
			const cached = getCached(cacheKey);
			if (cached) return cached;
			try {
				let release = null;
				if ("nodeId" in identifier) release = await fetchReleaseById(token, identifier.nodeId);
				else if (identifier.releaseId !== void 0) release = await fetchReleaseByRestId(token, identifier.owner, identifier.repo, identifier.releaseId);
				else if (identifier.tagName) release = await fetchReleaseByTag(token, identifier.owner, identifier.repo, identifier.tagName);
				if (!release) return { error: new LiveGithubReleasesLoaderError(`The identifier '${JSON.stringify(identifier)}' did not resolve to a GitHub Release.`, "INVALID_IDENTIFIER", String(identifier)) };
				const result = {
					id: release.id,
					data: release,
					rendered: { html: release.descriptionHTML || "" }
				};
				setCached(cacheKey, result, cacheTtlSeconds);
				return result;
			} catch (error) {
				return { error: new LiveGithubReleasesLoaderError("Failed to load GitHub release.", "ENTRY_LOAD_ERROR", String(identifier)) };
			}
		}
	};
}
/**
* Clear the in-memory cache (useful for testing).
*/
function clearLiveLoaderCache() {
	cache.clear();
}
export { LiveGithubReleasesLoaderError, clearLiveLoaderCache, liveGithubReleasesLoader };
