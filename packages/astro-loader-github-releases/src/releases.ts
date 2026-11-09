/**
 * Releases fetching logic with retry, rate limiting, and error handling
 */

import { Octokit } from '@octokit/rest';
import {
  calculateBackoff,
  filterBySinceDate,
  getSinceDate,
  markLatestRelease,
  normalizeRelease,
  sleep,
  sortByDate,
} from './utils.js';

import type { LoaderContext } from 'astro/loaders';
import type { GithubReleasesLoaderOutputConfig } from './config.js';
import type { ReleaseById, ReleaseByRepo } from './schemas.js';

const PER_PAGE = 100;
const MAX_PAGES = 20; // 2000 releases max per repo

/* Regex for validating a GraphQL release node id */
const RELEASE_NODE_ID_REGEX = /^RE_[A-Za-z0-9_-]+$/;

/**
 * Main fetch function with retry logic and rate limiting awareness.
 */
export async function fetchReleasesByRepoList(
  config: Omit<GithubReleasesLoaderOutputConfig, 'clearStore'>,
  token: string,
  logger?: LoaderContext['logger']
): Promise<ReleaseById[] | ReleaseByRepo[]> {
  const {
    repos,
    sinceDate,
    monthsBack,
    entryReturnType,
    maxRetries = 3,
    maxReleasesPerRepo = 0,
    includePrereleases = true,
    includeDrafts = false,
  } = config;

  logger?.info(
    `Loading GitHub releases for ${repos.length} ${
      repos.length > 1 ? 'repositories' : 'repository'
    }`
  );

  const releasesById: ReleaseById[] = [];
  const releasesByRepo: ReleaseByRepo[] = [];

  const sinceDateMs = sinceDate || monthsBack ? getSinceDate(monthsBack, sinceDate) : null;

  const octokit = new Octokit({
    auth: token,
    userAgent: '@functionfly/astro-loader-github-releases',
  });

  for (const repo of repos) {
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      logger?.error(
        `Skipping "${repo}": a repository must be given as "owner/repo".`
      );
      continue;
    }
    const releasesPerRepo: ReleaseById[] = [];

    let page = 1;
    let hasNextPage = true;

    while (hasNextPage && page <= MAX_PAGES) {
      try {
        const res = await fetchReleasesPageWithRetry(
          octokit,
          owner,
          repoName,
          page,
          maxRetries,
          logger
        );

        // Normalize and filter
        const normalized = res.data
          .map((r: any) => normalizeRelease(r, owner, repoName))
          .filter((r) => (includePrereleases || !r.isPrerelease))
          .filter((r) => (includeDrafts || !r.isDraft));

        // Apply sinceDate filter
        const filtered = filterBySinceDate(normalized, sinceDateMs);

        if (entryReturnType === 'byRelease') {
          releasesById.push(...filtered);
        } else {
          releasesPerRepo.push(...filtered);
        }

        // Check pagination
        hasNextPage = res.data.length === PER_PAGE && page < MAX_PAGES;
        page++;

        // Apply maxReleasesPerRepo limit
        if (
          maxReleasesPerRepo > 0 &&
          (entryReturnType === 'byRelease'
            ? releasesById.length
            : releasesPerRepo.length) >= maxReleasesPerRepo
        ) {
          hasNextPage = false;
        }

        // Check rate limiting
        const remaining = parseInt(res.headers['x-ratelimit-remaining'] || '5000', 10);
        if (remaining < 10) {
          logger?.warn(
            `GitHub rate limit nearly exhausted (${remaining} remaining)`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger?.error(`Failed to fetch releases for ${repo}: ${message}`);
        break;
      }
    }

    if (entryReturnType === 'byRepository') {
      // Sort and mark latest
      const sortedReleases = sortByDate(releasesPerRepo);
      const withLatestFlag = markLatestRelease(sortedReleases);

      releasesByRepo.push({
        repo,
        releases: withLatestFlag,
      });
    }
  }

  // For byRelease, also sort and mark latest globally
  if (entryReturnType === 'byRelease') {
    const sorted = sortByDate(releasesById);
    return markLatestRelease(sorted);
  }

  return releasesByRepo;
}

/**
 * Fetch a single page of releases with retry logic.
 */
async function fetchReleasesPageWithRetry(
  octokit: Octokit,
  owner: string,
  repo: string,
  page: number,
  maxRetries: number,
  logger?: LoaderContext['logger']
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await octokit.rest.repos.listReleases({
        owner,
        repo,
        per_page: PER_PAGE,
        page,
      });
    } catch (error: any) {
      lastError = error;

      // Don't retry on 404 (repo not found) or 401 (auth)
      if (error.status === 404 || error.status === 401) {
        throw error;
      }

      // Rate limit - retry after reset
      if (error.status === 403 && error.headers?.['x-ratelimit-remaining'] === '0') {
        const resetTime = parseInt(error.headers['x-ratelimit-reset'] || '0', 10);
        const now = Math.floor(Date.now() / 1000);
        const waitSeconds = Math.max(resetTime - now, 60);

        logger?.warn(
          `Rate limited. Waiting ${waitSeconds}s until reset...`
        );

        if (attempt < maxRetries) {
          await sleep(waitSeconds * 1000);
          continue;
        }
      }

      // Network errors - exponential backoff
      if (attempt < maxRetries) {
        const backoff = calculateBackoff(attempt);
        logger?.warn(
          `Fetch failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${Math.round(
            backoff / 1000
          )}s...`
        );
        await sleep(backoff);
        continue;
      }
    }
  }

  throw lastError || new Error('Failed to fetch releases');
}

/**
 * Fetch a single release by owner/repo/tag.
 */
export async function fetchReleaseByTag(
  token: string,
  owner: string,
  repo: string,
  tagName: string
): Promise<ReleaseById | null> {
  const octokit = new Octokit({
    auth: token,
    userAgent: '@functionfly/astro-loader-github-releases',
  });

  try {
    const res = await octokit.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag: tagName,
    });
    return normalizeRelease(res.data, owner, repo);
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
export async function fetchReleaseByRestId(
  token: string,
  owner: string,
  repo: string,
  releaseId: number,
): Promise<ReleaseById | null> {
  const octokit = new Octokit({
    auth: token,
    userAgent: '@functionfly/astro-loader-github-releases',
  });

  try {
    const res = await octokit.rest.repos.getRelease({
      owner,
      repo,
      release_id: releaseId,
    });
    return normalizeRelease(res.data, owner, repo);
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
async function fetchReleaseByNodeId(
  token: string,
  nodeId: string,
): Promise<ReleaseById | null> {
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
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': '@functionfly/astro-loader-github-releases',
      },
      body: JSON.stringify({ query, variables: { id: nodeId } }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      data?: { node?: Record<string, any> | null };
      errors?: Array<{ message: string }>;
    };

    const node = payload.data?.node;
    if (!node) return null;

    const owner = node.repository?.owner?.login ?? '';
    const repoName = node.repository?.nameWithOwner?.split('/')[1] ?? '';

    return {
      id: String(node.id),
      url: node.url,
      name: node.name || undefined,
      tagName: node.tagName,
      versionNum: undefined,
      description: node.body || undefined,
      descriptionHTML: node.bodyHTML || undefined,
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
      publishedAt: node.publishedAt || undefined,
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
export async function fetchReleaseById(
  token: string,
  id: string
): Promise<ReleaseById | null> {
  if (!RELEASE_NODE_ID_REGEX.test(id)) {
    return null;
  }
  return fetchReleaseByNodeId(token, id);
}