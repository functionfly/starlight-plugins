import { z } from "astro/zod";

/* Zod schemas for release data */
export const ReleaseByIdSchema = z.object({
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
  publishedAt: z.string().optional(),
});
export type ReleaseById = z.infer<typeof ReleaseByIdSchema>;

export const ReleaseByRepoSchema = z.object({
  repo: z.string(),
  releases: z.array(ReleaseByIdSchema),
});
export type ReleaseByRepo = z.infer<typeof ReleaseByRepoSchema>;
