/**
 * Utility functions for GitHub Releases loader
 */

import type { ReleaseById } from "./schemas";

/**
 * Get the date since which to fetch the releases with `monthsBack`.
 */
export function getSinceDate(
  monthsBack: number | undefined,
  sinceDate: Date | undefined,
): number | null {
  if (monthsBack) {
    const startDate = new Date();
    startDate.setUTCMonth(startDate.getMonth() - monthsBack + 1);
    startDate.setUTCDate(1);
    return sinceDate === undefined
      ? +startDate
      : Math.max(+startDate, +sinceDate);
  }
  return sinceDate === undefined ? null : +sinceDate;
}

/**
 * Map a raw GitHub API release to our normalized schema.
 */
export function normalizeRelease(
  release: any,
  owner: string,
  repoName: string,
): ReleaseById {
  // Extract version from tag (e.g., "v1.2.3" or "release-1.2.3" -> "1.2.3")
  const versionMatch = release.tag_name?.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
  const versionNum = versionMatch ? versionMatch[1] : undefined;

  return {
    id: String(release.id),
    url: release.html_url,
    name: release.name || undefined,
    tagName: release.tag_name,
    versionNum,
    description: release.body || undefined,
    descriptionHTML: release.body
      ? markdownToHtmlSimple(release.body)
      : undefined,
    isDraft: release.draft,
    isLatest: false, // Set later based on comparison
    isPrerelease: release.prerelease,
    repoOwner: owner,
    repoName: repoName,
    repoNameWithOwner: `${owner}/${repoName}`,
    repoUrl: `https://github.com/${owner}/${repoName}`,
    repoStargazerCount: 0, // Not in release API; would need separate call
    repoIsInOrganization: false, // Not in release API
    createdAt: release.created_at,
    publishedAt: release.published_at || undefined,
  };
}

/**
 * Escape the characters that would otherwise be read as markup.
 *
 * This runs BEFORE the inline transformations, so a release note that
 * contains `<script>` is rendered as text and a link target cannot break
 * out of the `href` attribute.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Apply the inline markdown transformations to an already escaped line.
 *
 * Code spans are extracted first and restored last, so their contents are
 * never treated as emphasis or a link.
 */
function renderInline(text: string): string {
  const codeSpans: string[] = [];

  let out = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2">$1</a>',
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(
    /\u0000(\d+)\u0000/g,
    (_match, index: string) => `<code>${codeSpans[Number(index)]}</code>`,
  );

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
export function markdownToHtmlSimple(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

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
export function releaseTimestamp(release: ReleaseById): number {
  return +new Date(release.publishedAt || release.createdAt);
}

/**
 * Apply the sinceDate filter to releases.
 */
export function filterBySinceDate(
  releases: ReleaseById[],
  sinceDateMs: number | null,
): ReleaseById[] {
  if (sinceDateMs === null) return releases;
  return releases.filter((r) => releaseTimestamp(r) >= sinceDateMs);
}

/**
 * Mark the latest non-prerelease release.
 */
export function markLatestRelease(releases: ReleaseById[]): ReleaseById[] {
  if (releases.length === 0) return releases;

  // Sort by published date desc
  const sorted = [...releases].sort((a, b) => {
    const dateA = a.publishedAt || a.createdAt;
    const dateB = b.publishedAt || b.createdAt;
    return +new Date(dateB) - +new Date(dateA);
  });

  // Find first non-prerelease, non-draft
  const latestNonPrerelease = sorted.find((r) => !r.isPrerelease && !r.isDraft);

  return releases.map((r) => ({
    ...r,
    isLatest: latestNonPrerelease
      ? r.id === latestNonPrerelease.id
      : r.id === sorted[0]?.id,
  }));
}

/**
 * Sort releases by date (most recent first).
 */
export function sortByDate(releases: ReleaseById[]): ReleaseById[] {
  return [...releases].sort((a, b) => {
    const dateA = a.publishedAt || a.createdAt;
    const dateB = b.publishedAt || b.createdAt;
    return +new Date(dateB) - +new Date(dateA);
  });
}

/**
 * Sleep helper for retry/backoff logic.
 */
export function sleep(ms: number): Promise<void> {
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
export function resolveGitHubToken(explicit?: string): string | undefined {
  if (explicit) return explicit;

  const fromImportMeta = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.GITHUB_TOKEN;

  if (fromImportMeta) return fromImportMeta;

  if (typeof process !== 'undefined' && process.env?.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  return undefined;
}

/**
 * Calculate exponential backoff with jitter.
 */
export function calculateBackoff(attempt: number, baseDelay = 1000): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.min(exponential + jitter, 30000); // cap at 30s
}
