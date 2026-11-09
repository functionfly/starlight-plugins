import { a as LiveGithubReleasesLoaderUserConfig, i as LiveEntryFilter, r as LiveCollectionFilter } from "./config-D4E7wcxO.js";
import { z } from "astro/zod";
import { LiveLoader } from "astro/loaders";
declare const ReleaseByIdSchema: z.ZodObject<{
  id: z.ZodString;
  url: z.ZodString;
  name: z.ZodOptional<z.ZodString>;
  tagName: z.ZodString;
  versionNum: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  descriptionHTML: z.ZodOptional<z.ZodString>;
  isDraft: z.ZodBoolean;
  isLatest: z.ZodBoolean;
  isPrerelease: z.ZodBoolean;
  repoOwner: z.ZodString;
  repoName: z.ZodString;
  repoNameWithOwner: z.ZodString;
  repoUrl: z.ZodString;
  repoStargazerCount: z.ZodNumber;
  repoIsInOrganization: z.ZodBoolean;
  createdAt: z.ZodString;
  publishedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type ReleaseById = z.infer<typeof ReleaseByIdSchema>;
declare const ReleaseByRepoSchema: z.ZodObject<{
  repo: z.ZodString;
  releases: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    tagName: z.ZodString;
    versionNum: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    descriptionHTML: z.ZodOptional<z.ZodString>;
    isDraft: z.ZodBoolean;
    isLatest: z.ZodBoolean;
    isPrerelease: z.ZodBoolean;
    repoOwner: z.ZodString;
    repoName: z.ZodString;
    repoNameWithOwner: z.ZodString;
    repoUrl: z.ZodString;
    repoStargazerCount: z.ZodNumber;
    repoIsInOrganization: z.ZodBoolean;
    createdAt: z.ZodString;
    publishedAt: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type ReleaseByRepo = z.infer<typeof ReleaseByRepoSchema>;
type LiveGithubReleasesEntry = ReleaseById | ReleaseByRepo;
export declare class LiveGithubReleasesLoaderError extends Error {
  code?: string | undefined;
  identifier?: string | undefined;
  constructor(message: string, code?: string | undefined, identifier?: string | undefined);
}
/**
 * Live Astro loader that fetches releases at runtime on each request.
 * Fetches releases from repository lists or a single release by its identifier.
 */
export declare function liveGithubReleasesLoader(userConfig?: LiveGithubReleasesLoaderUserConfig): LiveLoader<LiveGithubReleasesEntry, LiveEntryFilter, LiveCollectionFilter, LiveGithubReleasesLoaderError>;
/**
 * Clear the in-memory cache (useful for testing).
 */
export declare function clearLiveLoaderCache(): void;
export type { LiveCollectionFilter, LiveEntryFilter, LiveGithubReleasesLoaderUserConfig };