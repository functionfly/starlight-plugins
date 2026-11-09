# @functionfly/astro-loader-github-releases

A GitHub releases loader for Astro — build-time and live collections, the
**REST** API instead of GraphQL, retry with exponential backoff, rate-limit
awareness, and a configurable cache.

Fork of
[`astro-loader-github-releases`](https://github.com/lin-stephanie/astro-loaders/tree/main/packages/astro-loader-github-releases);
see [`UPSTREAMS.md`](../../UPSTREAMS.md) in the repository root.

## What this fork changes

| Feature | Original | This fork |
| --- | --- | --- |
| API | GraphQL | **REST API** — no code generation, no GraphQL token scope |
| Retry logic | None | Exponential backoff with jitter |
| Rate limiting | Throws | **Waits until the reset** and retries |
| Live loader caching | None | Configurable TTL cache |
| Markdown rendering | GraphQL `bodyHTML` | **Built-in renderer** (headings, lists, emphasis, code, links) |
| Filter options | Basic | + `includePrereleases`, `includeDrafts`, `maxReleasesPerRepo` |
| Error messages | Generic | Specific error codes |
| Release lookup by node id | — | **Works** — the original passed a GraphQL node id to the REST API, which produced `NaN` |

## Installation

The package is not published to npm. Consume it from the repository:

```json
{
  "dependencies": {
    "@functionfly/astro-loader-github-releases": "file:../../starlight-plugins/packages/astro-loader-github-releases"
  }
}
```

## Usage (build time)

```js
// src/content.config.ts
import { defineCollection } from "astro:content";
import { githubReleasesLoader } from "@functionfly/astro-loader-github-releases";

const releases = defineCollection({
  loader: githubReleasesLoader({
    repos: ["functionfly/functionfly"],
    entryReturnType: "byRelease",
    monthsBack: 6,
    maxRetries: 3,
    includePrereleases: false,
  }),
});

export const collections = { releases };
```

### Display

```astro
---
import { getCollection, render } from "astro:content";

const releases = await getCollection("releases");
---

{releases.map(async (release) => {
  const { Content } = await render(release);
  return (
    <article>
      <h2>{release.data.tagName}</h2>
      <p>{release.data.description}</p>
      <Content />
    </article>
  );
})}
```

## Usage (live)

```js
// src/live.config.ts
import { defineLiveCollection } from "astro:content";
import { liveGithubReleasesLoader } from "@functionfly/astro-loader-github-releases/live";

const liveReleases = defineLiveCollection({
  loader: liveGithubReleasesLoader({
    cacheTtl: 600, // 10 minutes
  }),
});

export const collections = { liveReleases };
```

### Live query

```astro
---
export const prerender = false;
import { getLiveCollection } from "astro:content";

const { entries, error } = await getLiveCollection("liveReleases", {
  repos: ["functionfly/functionfly"],
});
---

{error ? (
  <p>Error: {error.message}</p>
) : (
  entries.map((release) => (
    <h2>{release.data.tagName}</h2>
  ))
)}
```

## Configuration

### Build-time options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `repos` | `string[]` | required | Repositories in `'owner/repo'` format |
| `sinceDate` | `Date\|string\|number` | — | Load releases since this date |
| `monthsBack` | `number` | — | Load releases from the last N months |
| `entryReturnType` | `'byRelease'\|'byRepository'` | `'byRepository'` | How to organize entries |
| `clearStore` | `boolean` | `false` | Clear the store before loading |
| `githubToken` | `string` | `GITHUB_TOKEN` from the environment | GitHub PAT |
| `maxRetries` | `number` | `3` | Retry attempts on failure |
| `maxReleasesPerRepo` | `number` | `0` (unlimited) | Cap on releases per repository |
| `includePrereleases` | `boolean` | `true` | Include prerelease versions |
| `includeDrafts` | `boolean` | `false` | Include draft releases |

`sinceDate` and `monthsBack` are compared against the **publication** date of
a release, not the date its tag was created.

### Live loader options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `githubToken` | `string` | `GITHUB_TOKEN` from the environment | GitHub PAT |
| `cacheTtl` | `number` | `300` (5 min) | Cache TTL in seconds (0 disables) |
| `maxRetries` | `number` | `3` | Retry attempts |

### The token

The token is resolved in this order:

1. the `githubToken` option,
2. `import.meta.env.GITHUB_TOKEN`,
3. `process.env.GITHUB_TOKEN`.

The live loader additionally reads `getSecret("GITHUB_TOKEN")` from
`astro:env`. A secret that is not declared there is not an error — the
loader falls back to the environment instead of throwing.

### Live entry identifiers

`getLiveCollection("liveReleases", { identifier })` accepts:

| Identifier | Resolved through |
| --- | --- |
| `"RE_kwDOFL76Q84O4ieR"` (GraphQL node id) | the GraphQL API |
| `"https://github.com/{owner}/{repo}/releases/tag/{tag}"` | the REST API, by tag |
| `{ owner, repo, tagName }` | the REST API, by tag |
| `{ owner, repo, releaseId }` | the REST API, by numeric id |

A numeric release id is only accepted together with its repository, because
the REST endpoint addresses a release through its repository.

### Error codes (live loader)

- `MISSING_TOKEN` — no GitHub token was provided
- `INVALID_FILTER` — the filter provided is missing required options
- `INVALID_IDENTIFIER` — the identifier did not resolve to a release
- `COLLECTION_LOAD_ERROR` — the collection could not be loaded
- `ENTRY_LOAD_ERROR` — the individual entry could not be loaded
- `INVALID_CONFIG` — the configuration is invalid

## Migration from the original

Drop-in replacement with the same API:

```js
// Original
import { githubReleasesLoader } from "astro-loader-github-releases";

// This fork
import { githubReleasesLoader } from "@functionfly/astro-loader-github-releases";
```

### Key differences

- The **REST** API is used instead of GraphQL, so no code generation is needed
  and the token only needs read access to public repositories.
- All **new options** are optional and backwards compatible.
- The error codes may differ slightly for the live loader.

## License

MIT
