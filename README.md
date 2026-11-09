# FunctionFly Starlight Plugins

Astro [Starlight](https://starlight.astro.build) plugins maintained by FunctionFly.

Two of these packages are FunctionFly's own; three are FunctionFly forks of
third-party Starlight plugins, kept here so the whole Starlight surface the
docs site depends on has one home, one build, and one place to update.

| Package | What it does | Origin |
| --- | --- | --- |
| [`@functionfly/astro-loader-github-releases`](packages/astro-loader-github-releases) | Astro content loader that turns GitHub releases into a content collection. REST API, retry with backoff, rate-limit awareness, configurable cache. | FunctionFly (fork of [`astro-loader-github-releases`](https://github.com/lin-stephanie/astro-loaders)) |
| [`@functionfly/astro-mail-obfuscation`](packages/astro-mail-obfuscation) | Astro integration that obfuscates e-mail and phone numbers in the built HTML. AES-256-GCM key material, HMAC integrity, CSP-compatible mode. | FunctionFly (fork of [`astro-mail-obfuscation`](https://github.com/matcolville/astro-mail-obfuscation)) |
| [`@functionfly/starlight-announcement`](packages/starlight-announcement) | Announcement banner with variants, scheduling, dismissibility and page targeting. | Fork of [`frostybee/starlight-announcement`](https://github.com/frostybee/starlight-announcement) |
| [`@functionfly/starlight-mega-menu`](packages/starlight-mega-menu) | Mega-menu navigation for the Starlight header. | Fork of [`robinmordasiewicz/starlight-mega-menu`](https://github.com/robinmordasiewicz/starlight-mega-menu) |
| [`@functionfly/starlight-site-graph`](packages/starlight-site-graph) | Interactive graph of the documentation's internal links, rendered in the right sidebar. | Fork of [`fevol/starlight-site-graph`](https://github.com/fevol/starlight-site-graph) |

See [`UPSTREAMS.md`](UPSTREAMS.md) for the exact upstream of every fork and how
to pull upstream changes in.

## Layout

```
packages/
  astro-loader-github-releases/   built package — ships dist/
  astro-mail-obfuscation/         built package — ships dist/
  starlight-announcement/         source package — no build step
  starlight-mega-menu/            source package — no build step
  starlight-site-graph/           source package — no build step
```

The three source packages export TypeScript and Astro files directly and are
consumed from source by the docs site. The two built packages are consumed as
compiled artefacts, and their `dist/` is committed so that a consumer can
install them without a build step.

## Development

Requires Bun 1.4.4 or newer (the lockfile format is version-specific) and
Node 20 or newer.

```bash
bun install          # install workspace dependencies
bun run build        # build the two compiled packages
bun run typecheck    # type-check both compiled packages
bun run check        # build + typecheck
bun run verify:dist  # fail if the committed dist/ has drifted from the source
```

## Consuming the plugins

The FunctionFly docs site (`github.com/functionfly/functionfly`, `web/docs`)
consumes all five packages from this repository.

**Compiled packages** — installed as `file:` dependencies against a checkout of
this repository:

```json
{
  "dependencies": {
    "@functionfly/astro-loader-github-releases": "file:../../starlight-plugins/packages/astro-loader-github-releases",
    "@functionfly/astro-mail-obfuscation": "file:../../starlight-plugins/packages/astro-mail-obfuscation"
  }
}
```

**Source packages** — imported from the checkout, because they are TypeScript:

```ts
import starlightSiteGraph from "../../starlight-plugins/packages/starlight-site-graph/index.ts";
import starlightAnnouncement from "../../starlight-plugins/packages/starlight-announcement/index.ts";
import starlightMegaMenu from "../../starlight-plugins/packages/starlight-mega-menu/index.ts";
```

## License

MIT — see [`LICENSE`](LICENSE). Every forked package keeps its upstream licence,
which is also MIT.
