import { a as resolveGitHubToken, i as fetchReleasesByRepoList, o as GithubReleasesLoaderUserConfigSchema } from "./releases-DtdjsETE.js";
import { z } from "astro/zod";
// src/schemas.ts
const ReleaseByIdSchema = z.object({
	id: z.string(),
	url: z.string(),
	name: z.string().optional(),
	tagName: z.string(),
	versionNum: z.string().optional(),
	description: z.string().optional(),
	descriptionHTML: z.string().optional(),
	isDraft: z.boolean(),
	isLatest: z.boolean(),
	isPrerelease: z.boolean(),
	repoOwner: z.string(),
	repoName: z.string(),
	repoNameWithOwner: z.string(),
	repoUrl: z.string(),
	repoStargazerCount: z.number(),
	repoIsInOrganization: z.boolean(),
	createdAt: z.string(),
	publishedAt: z.string().optional()
});
const ReleaseByRepoSchema = z.object({
	repo: z.string(),
	releases: z.array(ReleaseByIdSchema)
});
// src/github-releases-loader.ts
/**
* Build-time Astro loader that loads multiple GitHub releases at build time.
* Loads releases from a list of repositories.
*/
function githubReleasesLoader(userConfig) {
	return {
		name: "github-releases",
		schema: userConfig.entryReturnType === "byRelease" ? ReleaseByIdSchema : ReleaseByRepoSchema,
		async load({ store, logger, parseData, generateDigest }) {
			const parsed = GithubReleasesLoaderUserConfigSchema.safeParse(userConfig);
			if (!parsed.success) {
				logger.error(`The configuration provided is invalid. ${parsed.error.issues.map((issue) => issue.message).join("\n")}`);
				return;
			}
			try {
				const { clearStore, ...config } = parsed.data;
				const token = resolveGitHubToken(config.githubToken);
				if (!token) {
					logger.warn("No GitHub token provided. Please provide a `githubToken` or set the `GITHUB_TOKEN` environment variable.");
					return;
				}
				const releases = await fetchReleasesByRepoList(config, token, logger);
				if (clearStore) store.clear();
				for (const item of releases) {
					if ("id" in item && config.entryReturnType === "byRelease") {
						const parsedItem = await parseData({
							id: item.id,
							data: item
						});
						store.set({
							id: item.id,
							data: parsedItem,
							digest: generateDigest(parsedItem),
							rendered: { html: item.descriptionHTML || "" }
						});
					}
					if ("repo" in item && config.entryReturnType === "byRepository") {
						const parsedItem = await parseData({
							id: item.repo,
							data: item
						});
						store.set({
							id: item.repo,
							data: parsedItem,
							digest: generateDigest(parsedItem)
						});
					}
				}
				logger.info(`Successfully loaded ${releases.length} GitHub release${releases.length === 1 ? "" : "s"}`);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				logger.error(`Failed to load GitHub releases. ${message}`);
			}
		}
	};
}
export { githubReleasesLoader };
