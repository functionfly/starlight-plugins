import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/live.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: true,
  clean: true,
  sourcemap: false,
  // The package is `"type": "module"`, so the output keeps the `.js`/`.d.ts`
  // extension the `exports` map points at. With tsdown's default
  // (`fixedExtension: true`) the files would be emitted as `.mjs`/`.d.mts`
  // and the published entry points would not exist.
  fixedExtension: false,
  deps: {
    // `astro` is a peer dependency and `astro:env/server` is a virtual
    // module that only exists inside an Astro build — neither can be
    // bundled. `@octokit/rest` is a runtime dependency of the package, so
    // it is externalised as well: bundling it produced a 1.5 MB artefact
    // that carried a second, private copy of Octokit's dependency tree.
    neverBundle: [/^astro(:|\/)/, "@octokit/rest"],
  },
});
