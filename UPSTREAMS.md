# Upstreams

Every package in this repository is either written by FunctionFly or is a fork
of a third-party project. This file records where each fork came from, so an
upstream change can be pulled in deliberately instead of by accident.

## Forks

| Package | Upstream | Fork repository (pre-move) | Notes |
| --- | --- | --- | --- |
| `packages/astro-loader-github-releases` | [lin-stephanie/astro-loaders](https://github.com/lin-stephanie/astro-loaders) (`packages/astro-loader-github-releases`) | — (vendored, no upstream repository) | Rewritten against the GitHub **REST** API instead of GraphQL. Adds retry with exponential backoff, rate-limit awareness, a live-loader cache, prerelease/draft filters, a per-repository release cap, and specific error codes. |
| `packages/astro-mail-obfuscation` | [andreas-brunner/astro-mail-obfuscation](https://github.com/andreas-brunner/astro-mail-obfuscation) | — (vendored, no upstream repository) | Meta-tag key material is encrypted with AES-256-GCM instead of being published in plaintext, an HMAC-SHA256 integrity tag was added, key extraction is constant-time, and a CSP-compatible mode replaced the `unsafe-inline` requirement. |
| `packages/starlight-announcement` | [frostybee/starlight-announcement](https://github.com/frostybee/starlight-announcement) | `github.com/functionfly/starlight-announcement` | Package renamed to the `@functionfly` scope. Behaviour otherwise unchanged. |
| `packages/starlight-mega-menu` | [robinmordasiewicz/starlight-mega-menu](https://github.com/robinmordasiewicz/starlight-mega-menu) | `github.com/functionfly/starlight-mega-menu` | Package renamed to the `@functionfly` scope. Behaviour otherwise unchanged. |
| `packages/starlight-site-graph` | [fevol/starlight-site-graph](https://github.com/fevol/starlight-site-graph) | `github.com/functionflycom/starlight-site-graph` | Package renamed to the `@functionfly` scope and the Astro peer dependency widened to 7. The sitemap `contentRoot` is resolved with `fileURLToPath(config.srcDir)` instead of `config.srcDir.pathname`, which produced a URL-encoded path on platforms where the path contains characters that need escaping. |

## Pulling an upstream change in

1. Fetch the upstream repository next to this one and note the tag you are
   taking.
2. Apply the change to the package directory in this repository.
3. Re-record the upstream version in this file.
4. For the two compiled packages, run `bun run build && bun run verify:dist` so
   the committed artefact matches the source.

The `github.com/functionfly/starlight-announcement`,
`github.com/functionfly/starlight-mega-menu` and
`github.com/functionflycom/starlight-site-graph` repositories are the previous
homes of the three forked packages. They are kept as upstream mirrors and are
no longer consumed directly; this repository is the single source of truth.
