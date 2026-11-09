import { z } from "astro/zod";
declare const GithubReleasesLoaderUserConfigSchema: z.ZodObject<{
  repos: z.ZodArray<z.ZodString>;
  sinceDate: z.ZodOptional<z.ZodPipe<z.ZodUnion<readonly [z.ZodDate, z.ZodString, z.ZodNumber]>, z.ZodTransform<Date, string | number | Date>>>;
  monthsBack: z.ZodOptional<z.ZodNumber>;
  entryReturnType: z.ZodDefault<z.ZodEnum<{
    byRepository: "byRepository";
    byRelease: "byRelease";
  }>>;
  clearStore: z.ZodDefault<z.ZodBoolean>;
  githubToken: z.ZodOptional<z.ZodString>;
  maxRetries: z.ZodDefault<z.ZodNumber>;
  maxReleasesPerRepo: z.ZodDefault<z.ZodNumber>;
  includePrereleases: z.ZodDefault<z.ZodBoolean>;
  includeDrafts: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
type GithubReleasesLoaderUserConfig = z.input<typeof GithubReleasesLoaderUserConfigSchema>;
type GithubReleasesLoaderOutputConfig = z.output<typeof GithubReleasesLoaderUserConfigSchema>;
declare const LiveGithubReleasesLoaderUserConfigSchema: z.ZodObject<{
  githubToken: z.ZodOptional<z.ZodString>;
  cacheTtl: z.ZodDefault<z.ZodNumber>;
  maxRetries: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
type LiveGithubReleasesLoaderUserConfig = z.input<typeof LiveGithubReleasesLoaderUserConfigSchema>;
declare const LiveCollectionFilterSchema: z.ZodObject<{
  repos: z.ZodArray<z.ZodString>;
  sinceDate: z.ZodOptional<z.ZodPipe<z.ZodUnion<readonly [z.ZodDate, z.ZodString, z.ZodNumber]>, z.ZodTransform<Date, string | number | Date>>>;
  monthsBack: z.ZodOptional<z.ZodNumber>;
  entryReturnType: z.ZodDefault<z.ZodEnum<{
    byRepository: "byRepository";
    byRelease: "byRelease";
  }>>;
  includePrereleases: z.ZodDefault<z.ZodBoolean>;
  includeDrafts: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
type LiveCollectionFilter = z.input<typeof LiveCollectionFilterSchema>;
declare const LiveEntryFilterSchema: z.ZodObject<{
  identifier: z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
    owner: z.ZodString;
    repo: z.ZodString;
    tagName: z.ZodOptional<z.ZodString>;
    releaseId: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>]>, z.ZodTransform<{
    nodeId: string;
  } | {
    owner: string;
    repo: string;
    tagName?: string | undefined;
    releaseId?: number | undefined;
  }, string | {
    owner: string;
    repo: string;
    tagName?: string | undefined;
    releaseId?: number | undefined;
  }>>;
}, z.core.$strip>;
type LiveEntryFilter = z.input<typeof LiveEntryFilterSchema>;
export { LiveGithubReleasesLoaderUserConfig as a, LiveEntryFilter as i, GithubReleasesLoaderUserConfig as n, LiveCollectionFilter as r, GithubReleasesLoaderOutputConfig as t };