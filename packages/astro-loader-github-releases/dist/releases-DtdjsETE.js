import { z } from "astro/zod";
import { Octokit } from "@octokit/rest";
// src/config.ts
const RELEASE_NODE_ID_REGEX$1 = /^RE_[A-Za-z0-9_-]+$/;
const RELEASE_URL_REGEX = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/([^/]+)\/?$/;
const OptionalConfigSchema = z.object({
	/**
	* Whether to clear the store scoped to the collection before storing newly loaded data.
	* @default false
	*/
	clearStore: z.boolean().default(false),
	/**
	* GitHub PAT with at least `repo` scope permissions to authenticate requests.
	* For build-time: optional, reads from `GITHUB_TOKEN` env var.
	* For live: optional, reads from `getSecret('GITHUB_TOKEN')`.
	* @see https://github.com/settings/tokens
	*/
	githubToken: z.string().optional(),
	/**
	* NEW: Maximum retry attempts on rate limit or network failure
	* @default 3
	*/
	maxRetries: z.number().int().min(0).max(10).default(3),
	/**
	* NEW: Cache TTL in seconds (live loader only). 0 disables caching.
	* @default 300 (5 minutes)
	*/
	cacheTtl: z.number().int().min(0).default(300),
	/**
	* NEW: Maximum releases to load per repository (0 = unlimited)
	* @default 0
	*/
	maxReleasesPerRepo: z.number().int().min(0).default(0),
	/**
	* NEW: Include prerelease versions
	* @default true
	*/
	includePrereleases: z.boolean().default(true),
	/**
	* NEW: Include draft releases
	* @default false
	*/
	includeDrafts: z.boolean().default(false)
});
const GithubReleasesLoaderUserConfigSchema = z.object({
	/**
	* The repositories from which to load releases, each formatted as 'owner/repo'.
	*/
	repos: z.array(z.string().regex(/^[^/]+\/[^/]+$/, { message: "Repository name must follow the 'owner/repo' format" })).nonempty({ message: "At least one repository must be provided" }),
	/**
	* The date from which to start loading releases.
	* If both `monthsBack` and `sinceDate` are configured, the more recent date will be used.
	*/
	sinceDate: z.union([
		z.date(),
		z.string(),
		z.number()
	]).transform((v) => v instanceof Date ? v : new Date(v)).refine((d) => !Number.isNaN(d.getTime()), { message: "`sinceDate` must be a valid Date or a value convertible by `new Date()`." }).optional(),
	/**
	* The number of recent months to load releases, including the current month.
	* If both `monthsBack` and `sinceDate` are configured, the more recent date will be used.
	*/
	monthsBack: z.number().int({ message: "`monthsBack` must be an integer" }).gte(1, "`monthsBack` must be greater than or equal to 1").optional(),
	/**
	* Determines whether entries are returned per repository or per individual release item.
	* - 'byRepository': Return entries per repository.
	* - 'byRelease': Return entries per individual release item.
	*
	* @default 'byRepository'
	*/
	entryReturnType: z.enum(["byRepository", "byRelease"], { message: "`entryReturnType` must be either `byRepository` or `byRelease`" }).default("byRepository")
}).extend(OptionalConfigSchema.pick({
	clearStore: true,
	githubToken: true,
	maxRetries: true,
	maxReleasesPerRepo: true,
	includePrereleases: true,
	includeDrafts: true
}).shape);
const LiveGithubReleasesLoaderUserConfigSchema = z.object({
	githubToken: z.string().optional(),
	cacheTtl: z.number().int().min(0).default(300),
	maxRetries: z.number().int().min(0).max(10).default(3)
});
const LiveCollectionFilterSchema = GithubReleasesLoaderUserConfigSchema.omit({
	clearStore: true,
	githubToken: true,
	maxRetries: true,
	maxReleasesPerRepo: true
});
const LiveEntryFilterSchema = z.object({ 
/**
* The identifier for a release, which can be one of:
* - GitHub Release global node ID: "RE_kwDOFL76Q84O4ieR"
* - GitHub Release URL: "https://github.com/{owner}/{repo}/releases/tag/{tagName}"
* - Object: { owner, repo, tagName }
* - Object: { owner, repo, releaseId }
*
* A numeric release id is only accepted together with its repository,
* because the REST endpoint addresses a release through its repository.
*/
identifier: z.union([z.string(), z.object({
	owner: z.string().min(1, "`owner` cannot be empty"),
	repo: z.string().min(1, "`repo` cannot be empty"),
	tagName: z.string().min(1, "`tagName` cannot be empty").optional(),
	releaseId: z.number().int().positive().optional()
}).refine((value) => Boolean(value.tagName || value.releaseId), { message: "either `tagName` or `releaseId` must be provided" })]).superRefine((val, ctx) => {
	if (typeof val === "string") {
		if (RELEASE_NODE_ID_REGEX$1.test(val)) return;
		if (val.match(RELEASE_URL_REGEX)) return;
		ctx.addIssue({
			code: "custom",
			message: "Invalid identifier string: expected a GitHub Release global node ID or a GitHub Release URL"
		});
	}
}).transform((val) => {
	if (typeof val === "string") {
		const urlMatch = val.match(RELEASE_URL_REGEX);
		if (urlMatch) {
			const [, owner, repo, tagName] = urlMatch;
			return {
				owner: owner ?? "",
				repo: repo ?? "",
				tagName: tagName ?? ""
			};
		}
		return { nodeId: val };
	}
	return val;
}) });
// src/utils.ts
/**
* Get the date since which to fetch the releases with `monthsBack`.
*/
function getSinceDate(monthsBack, sinceDate) {
	if (monthsBack) {
		const startDate = /* @__PURE__ */ new Date();
		startDate.setUTCMonth(startDate.getMonth() - monthsBack + 1);
		startDate.setUTCDate(1);
		return sinceDate === void 0 ? +startDate : Math.max(+startDate, +sinceDate);
	}
	return sinceDate === void 0 ? null : +sinceDate;
}
/**
* Map a raw GitHub API release to our normalized schema.
*/
function normalizeRelease(release, owner, repoName) {
	const versionMatch = release.tag_name?.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
	const versionNum = versionMatch ? versionMatch[1] : void 0;
	return {
		id: String(release.id),
		url: release.html_url,
		name: release.name || void 0,
		tagName: release.tag_name,
		versionNum,
		description: release.body || void 0,
		descriptionHTML: release.body ? markdownToHtmlSimple(release.body) : void 0,
		isDraft: release.draft,
		isLatest: false,
		isPrerelease: release.prerelease,
		repoOwner: owner,
		repoName,
		repoNameWithOwner: `${owner}/${repoName}`,
		repoUrl: `https://github.com/${owner}/${repoName}`,
		repoStargazerCount: 0,
		repoIsInOrganization: false,
		createdAt: release.created_at,
		publishedAt: release.published_at || void 0
	};
}
/**
* Escape the characters that would otherwise be read as markup.
*
* This runs BEFORE the inline transformations, so a release note that
* contains `<script>` is rendered as text and a link target cannot break
* out of the `href` attribute.
*/
function escapeHtml(text) {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/**
* Apply the inline markdown transformations to an already escaped line.
*
* Code spans are extracted first and restored last, so their contents are
* never treated as emphasis or a link.
*/
function renderInline(text) {
	const codeSpans = [];
	let out = text.replace(/`([^`]+)`/g, (_match, code) => {
		codeSpans.push(code);
		return `\u0000${codeSpans.length - 1}\u0000`;
	});
	out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<a href=\"$2\">$1</a>");
	out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
	out = out.replace(/\u0000(\d+)\u0000/g, (_match, index) => `<code>${codeSpans[Number(index)]}</code>`);
	return out;
}
/**
* Convert release-note markdown to HTML.
*
* The renderer is deliberately small — it handles headings, paragraphs,
* bullet lists, emphasis, inline code and links — but it is also
* *correct*: the previous implementation wrapped a heading in a paragraph
* and left the closing `</p>` of the paragraph it had already replaced,
* which produced malformed markup for every release note that started
* with a heading.
*/
function markdownToHtmlSimple(md) {
	const lines = escapeHtml(md).split("\n");
	const blocks = [];
	let paragraph = [];
	let list = [];
	const flushParagraph = () => {
		if (paragraph.length === 0) return;
		blocks.push(`<p>${paragraph.join(" ")}</p>`);
		paragraph = [];
	};
	const flushList = () => {
		if (list.length === 0) return;
		blocks.push(`<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
		list = [];
	};
	const flush = () => {
		flushParagraph();
		flushList();
	};
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "") {
			flush();
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
		if (heading) {
			flush();
			const level = heading[1]?.length ?? 1;
			blocks.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
			continue;
		}
		const listItem = /^[-*+]\s+(.*)$/.exec(trimmed);
		if (listItem) {
			flushParagraph();
			list.push(renderInline(listItem[1] ?? ""));
			continue;
		}
		flushList();
		paragraph.push(renderInline(trimmed));
	}
	flush();
	return blocks.join("\n");
}
/**
* The timestamp a release is dated by.
*
* `publishedAt` is the date a release went out; `createdAt` is the date the
* tag was pushed, which for a release prepared in advance can be weeks
* earlier. Filtering on the creation date therefore kept — or dropped —
* releases the caller did not ask for.
*/
function releaseTimestamp(release) {
	return +new Date(release.publishedAt || release.createdAt);
}
/**
* Apply the sinceDate filter to releases.
*/
function filterBySinceDate(releases, sinceDateMs) {
	if (sinceDateMs === null) return releases;
	return releases.filter((r) => releaseTimestamp(r) >= sinceDateMs);
}
/**
* Mark the latest non-prerelease release.
*/
function markLatestRelease(releases) {
	if (releases.length === 0) return releases;
	const sorted = [...releases].sort((a, b) => {
		const dateA = a.publishedAt || a.createdAt;
		const dateB = b.publishedAt || b.createdAt;
		return +new Date(dateB) - +new Date(dateA);
	});
	const latestNonPrerelease = sorted.find((r) => !r.isPrerelease && !r.isDraft);
	return releases.map((r) => ({
		...r,
		isLatest: latestNonPrerelease ? r.id === latestNonPrerelease.id : r.id === sorted[0]?.id
	}));
}
/**
* Sort releases by date (most recent first).
*/
function sortByDate(releases) {
	return [...releases].sort((a, b) => {
		const dateA = a.publishedAt || a.createdAt;
		const dateB = b.publishedAt || b.createdAt;
		return +new Date(dateB) - +new Date(dateA);
	});
}
/**
* Sleep helper for retry/backoff logic.
*/
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
* Resolve the GitHub token from the environment.
*
* `import.meta.env` is Vite's view of the environment. It exists inside an
* Astro build, but not in a plain Node process — and a loader is not
* obliged to run inside Vite. The process environment is therefore checked
* as well, so the token is found in both worlds.
*
* The explicit option always wins.
*/
function resolveGitHubToken(explicit) {
	if (explicit) return explicit;
	const fromImportMeta = import.meta.env?.GITHUB_TOKEN;
	if (fromImportMeta) return fromImportMeta;
	if (typeof process !== "undefined" && process.env?.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
}
/**
* Calculate exponential backoff with jitter.
*/
function calculateBackoff(attempt, baseDelay = 1e3) {
	const exponential = baseDelay * Math.pow(2, attempt);
	const jitter = Math.random() * 500;
	return Math.min(exponential + jitter, 3e4);
}
// src/releases.ts
/**
* Releases fetching logic with retry, rate limiting, and error handling
*/
const PER_PAGE = 100;
const MAX_PAGES = 20;
const RELEASE_NODE_ID_REGEX = /^RE_[A-Za-z0-9_-]+$/;
/**
* Main fetch function with retry logic and rate limiting awareness.
*/
async function fetchReleasesByRepoList(config, token, logger) {
	const { repos, sinceDate, monthsBack, entryReturnType, maxRetries = 3, maxReleasesPerRepo = 0, includePrereleases = true, includeDrafts = false } = config;
	logger?.info(`Loading GitHub releases for ${repos.length} ${repos.length > 1 ? "repositories" : "repository"}`);
	const releasesById = [];
	const releasesByRepo = [];
	const sinceDateMs = sinceDate || monthsBack ? getSinceDate(monthsBack, sinceDate) : null;
	const octokit = new Octokit({
		auth: token,
		userAgent: "@functionfly/astro-loader-github-releases"
	});
	for (const repo of repos) {
		const [owner, repoName] = repo.split("/");
		if (!owner || !repoName) {
			logger?.error(`Skipping "${repo}": a repository must be given as "owner/repo".`);
			continue;
		}
		const releasesPerRepo = [];
		let page = 1;
		let hasNextPage = true;
		while (hasNextPage && page <= MAX_PAGES) try {
			const res = await fetchReleasesPageWithRetry(octokit, owner, repoName, page, maxRetries, logger);
			const filtered = filterBySinceDate(res.data.map((r) => normalizeRelease(r, owner, repoName)).filter((r) => includePrereleases || !r.isPrerelease).filter((r) => includeDrafts || !r.isDraft), sinceDateMs);
			if (entryReturnType === "byRelease") releasesById.push(...filtered);
			else releasesPerRepo.push(...filtered);
			hasNextPage = res.data.length === PER_PAGE && page < MAX_PAGES;
			page++;
			if (maxReleasesPerRepo > 0 && (entryReturnType === "byRelease" ? releasesById.length : releasesPerRepo.length) >= maxReleasesPerRepo) hasNextPage = false;
			const remaining = parseInt(res.headers["x-ratelimit-remaining"] || "5000", 10);
			if (remaining < 10) logger?.warn(`GitHub rate limit nearly exhausted (${remaining} remaining)`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			logger?.error(`Failed to fetch releases for ${repo}: ${message}`);
			break;
		}
		if (entryReturnType === "byRepository") {
			const withLatestFlag = markLatestRelease(sortByDate(releasesPerRepo));
			releasesByRepo.push({
				repo,
				releases: withLatestFlag
			});
		}
	}
	if (entryReturnType === "byRelease") return markLatestRelease(sortByDate(releasesById));
	return releasesByRepo;
}
/**
* Fetch a single page of releases with retry logic.
*/
async function fetchReleasesPageWithRetry(octokit, owner, repo, page, maxRetries, logger) {
	let lastError = null;
	for (let attempt = 0; attempt <= maxRetries; attempt++) try {
		return await octokit.rest.repos.listReleases({
			owner,
			repo,
			per_page: PER_PAGE,
			page
		});
	} catch (error) {
		lastError = error;
		if (error.status === 404 || error.status === 401) throw error;
		if (error.status === 403 && error.headers?.["x-ratelimit-remaining"] === "0") {
			const resetTime = parseInt(error.headers["x-ratelimit-reset"] || "0", 10);
			const now = Math.floor(Date.now() / 1e3);
			const waitSeconds = Math.max(resetTime - now, 60);
			logger?.warn(`Rate limited. Waiting ${waitSeconds}s until reset...`);
			if (attempt < maxRetries) {
				await sleep(waitSeconds * 1e3);
				continue;
			}
		}
		if (attempt < maxRetries) {
			const backoff = calculateBackoff(attempt);
			logger?.warn(`Fetch failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${Math.round(backoff / 1e3)}s...`);
			await sleep(backoff);
			continue;
		}
	}
	throw lastError || /* @__PURE__ */ new Error("Failed to fetch releases");
}
/**
* Fetch a single release by owner/repo/tag.
*/
async function fetchReleaseByTag(token, owner, repo, tagName) {
	const octokit = new Octokit({
		auth: token,
		userAgent: "@functionfly/astro-loader-github-releases"
	});
	try {
		return normalizeRelease((await octokit.rest.repos.getReleaseByTag({
			owner,
			repo,
			tag: tagName
		})).data, owner, repo);
	} catch (error) {
		return null;
	}
}
/**
* Fetch a single release by its numeric REST id.
*
* The REST endpoint addresses a release through its repository, so the
* owner and the repository are part of the lookup.
*/
async function fetchReleaseByRestId(token, owner, repo, releaseId) {
	const octokit = new Octokit({
		auth: token,
		userAgent: "@functionfly/astro-loader-github-releases"
	});
	try {
		return normalizeRelease((await octokit.rest.repos.getRelease({
			owner,
			repo,
			release_id: releaseId
		})).data, owner, repo);
	} catch (error) {
		return null;
	}
}
/**
* Resolve a GitHub GraphQL node id (`RE_kwDO...`) to a release.
*
* The REST API addresses releases by a numeric id, so a node id cannot be
* looked up through it — the previous implementation passed the node id to
* `parseInt`, which produced `NaN` and silently returned nothing for every
* identifier in that format.
*/
async function fetchReleaseByNodeId(token, nodeId) {
	const query = `
    query($id: ID!) {
      node(id: $id) {
        ... on Release {
          id
          name
          tagName
          body
          bodyHTML
          isDraft
          isPrerelease
          createdAt
          publishedAt
          url
          repository {
            nameWithOwner
            owner { login }
          }
        }
      }
    }`;
	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"User-Agent": "@functionfly/astro-loader-github-releases"
			},
			body: JSON.stringify({
				query,
				variables: { id: nodeId }
			})
		});
		if (!response.ok) return null;
		const node = (await response.json()).data?.node;
		if (!node) return null;
		const owner = node.repository?.owner?.login ?? "";
		const repoName = node.repository?.nameWithOwner?.split("/")[1] ?? "";
		return {
			id: String(node.id),
			url: node.url,
			name: node.name || void 0,
			tagName: node.tagName,
			versionNum: void 0,
			description: node.body || void 0,
			descriptionHTML: node.bodyHTML || void 0,
			isDraft: Boolean(node.isDraft),
			isLatest: false,
			isPrerelease: Boolean(node.isPrerelease),
			repoOwner: owner,
			repoName,
			repoNameWithOwner: node.repository?.nameWithOwner ?? `${owner}/${repoName}`,
			repoUrl: `https://github.com/${owner}/${repoName}`,
			repoStargazerCount: 0,
			repoIsInOrganization: false,
			createdAt: node.createdAt,
			publishedAt: node.publishedAt || void 0
		};
	} catch (error) {
		return null;
	}
}
/**
* Fetch a single release by its GraphQL node id.
*
* The REST API addresses releases through their repository, so a global
* node id (`RE_kwDO...`) can only be resolved through the GraphQL API.
* The previous implementation passed the node id to `parseInt`, which
* produced `NaN` and silently returned nothing for every identifier in
* that format.
*/
async function fetchReleaseById(token, id) {
	if (!RELEASE_NODE_ID_REGEX.test(id)) return null;
	return fetchReleaseByNodeId(token, id);
}
export { resolveGitHubToken as a, LiveEntryFilterSchema as c, fetchReleasesByRepoList as i, LiveGithubReleasesLoaderUserConfigSchema as l, fetchReleaseByRestId as n, GithubReleasesLoaderUserConfigSchema as o, fetchReleaseByTag as r, LiveCollectionFilterSchema as s, fetchReleaseById as t };
