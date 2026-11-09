import { z } from "astro/zod";

/* Regex for validating release identifiers */
const RELEASE_NODE_ID_REGEX = /^RE_[A-Za-z0-9_-]+$/;
const RELEASE_URL_REGEX =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/([^/]+)\/?$/;

/* Common optional config shared between build-time and live loaders */
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
  includeDrafts: z.boolean().default(false),
});

/* Build-time Loader Config */
export const GithubReleasesLoaderUserConfigSchema = z
  .object({
    /**
     * The repositories from which to load releases, each formatted as 'owner/repo'.
     */
    repos: z
      .array(
        z.string().regex(/^[^/]+\/[^/]+$/, {
          message: "Repository name must follow the 'owner/repo' format",
        }),
      )
      .nonempty({
        message: "At least one repository must be provided",
      }),

    /**
     * The date from which to start loading releases.
     * If both `monthsBack` and `sinceDate` are configured, the more recent date will be used.
     */
    sinceDate: z
      .union([z.date(), z.string(), z.number()])
      .transform((v) => (v instanceof Date ? v : new Date(v)))
      .refine((d) => !Number.isNaN(d.getTime()), {
        message:
          "`sinceDate` must be a valid Date or a value convertible by `new Date()`.",
      })
      .optional(),

    /**
     * The number of recent months to load releases, including the current month.
     * If both `monthsBack` and `sinceDate` are configured, the more recent date will be used.
     */
    monthsBack: z
      .number()
      .int({ message: "`monthsBack` must be an integer" })
      .gte(1, "`monthsBack` must be greater than or equal to 1")
      .optional(),

    /**
     * Determines whether entries are returned per repository or per individual release item.
     * - 'byRepository': Return entries per repository.
     * - 'byRelease': Return entries per individual release item.
     *
     * @default 'byRepository'
     */
    entryReturnType: z
      .enum(["byRepository", "byRelease"], {
        message:
          "`entryReturnType` must be either `byRepository` or `byRelease`",
      })
      .default("byRepository" as const),
  })
  .extend(
    OptionalConfigSchema.pick({
      clearStore: true,
      githubToken: true,
      maxRetries: true,
      maxReleasesPerRepo: true,
      includePrereleases: true,
      includeDrafts: true,
    }).shape,
  );

export type GithubReleasesLoaderUserConfig = z.input<
  typeof GithubReleasesLoaderUserConfigSchema
>;
export type GithubReleasesLoaderOutputConfig = z.output<
  typeof GithubReleasesLoaderUserConfigSchema
>;

/* Live Loader Config */
export const LiveGithubReleasesLoaderUserConfigSchema = z.object({
  githubToken: z.string().optional(),
  cacheTtl: z.number().int().min(0).default(300),
  maxRetries: z.number().int().min(0).max(10).default(3),
});

export type LiveGithubReleasesLoaderUserConfig = z.input<
  typeof LiveGithubReleasesLoaderUserConfigSchema
>;

/* Live Collection Filter */
export const LiveCollectionFilterSchema =
  GithubReleasesLoaderUserConfigSchema.omit({
    clearStore: true,
    githubToken: true,
    maxRetries: true,
    maxReleasesPerRepo: true,
  });

export type LiveCollectionFilter = z.input<typeof LiveCollectionFilterSchema>;

/**
 * The normalised form of a live-entry identifier.
 *
 * A string identifier is either a GraphQL node id or a release URL, and a
 * URL carries the owner, the repository and the tag — so both string forms
 * are resolved into the same shape the object form uses.
 */
export type LiveEntryIdentifier =
  | { nodeId: string }
  | {
      owner: string;
      repo: string;
      tagName?: string | undefined;
      releaseId?: number | undefined;
    };

/* Live Entry Filter */
export const LiveEntryFilterSchema = z.object({
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
  identifier: z
    .union([
      z.string(),
      z
        .object({
          owner: z.string().min(1, "`owner` cannot be empty"),
          repo: z.string().min(1, "`repo` cannot be empty"),
          tagName: z.string().min(1, "`tagName` cannot be empty").optional(),
          releaseId: z.number().int().positive().optional(),
        })
        .refine((value) => Boolean(value.tagName || value.releaseId), {
          message: "either `tagName` or `releaseId` must be provided",
        }),
    ])
    .superRefine((val, ctx) => {
      if (typeof val === "string") {
        if (RELEASE_NODE_ID_REGEX.test(val)) return;
        const match = val.match(RELEASE_URL_REGEX);
        if (match) return;
        ctx.addIssue({
          code: "custom",
          message:
            "Invalid identifier string: expected a GitHub Release global node ID or a GitHub Release URL",
        });
      }
    })
    .transform((val): LiveEntryIdentifier => {
      if (typeof val === "string") {
        const urlMatch = val.match(RELEASE_URL_REGEX);
        if (urlMatch) {
          const [, owner, repo, tagName] = urlMatch;
          return {
            owner: owner ?? "",
            repo: repo ?? "",
            tagName: tagName ?? "",
          };
        }
        return { nodeId: val };
      }
      return val;
    }),
});

export type LiveEntryFilter = z.input<typeof LiveEntryFilterSchema>;
