import type { StarlightPlugin } from '@astrojs/starlight/types';
import { fileURLToPath } from 'node:url';
import { validateConfig, type StarlightSiteGraphConfig, starlightSiteGraphConfig } from './config';

import integration from './integration';
import { translations } from './i18n';

export default function plugin(userConfig?: StarlightSiteGraphConfig): StarlightPlugin {
	const parsedConfig = validateConfig(starlightSiteGraphConfig, userConfig);
	return {
		name: 'starlight-site-graph-plugin',
		hooks: {
			'i18n:setup'({ injectTranslations }) {
				injectTranslations(translations);
			},
			'config:setup': async ({ addIntegration, config, command, logger, updateConfig }) => {
				if (command === 'preview') return;

				// TODO: Temporary implementation of graph/backlinks exclusion from plugin
				if (!parsedConfig.graph) {
					parsedConfig.graphConfig.visibilityRules = [];
				}
				if (!parsedConfig.backlinks) {
					parsedConfig.backlinksConfig.visibilityRules = [];
				}
				if (!(parsedConfig.graph || parsedConfig.backlinks)) {
					// EXPL: This bypasses the sitemap generation, so page contents don't have to be parsed
					parsedConfig.sitemapConfig.pageInclusionRules = [];
				}

				// EXPL: Pass a starlight flag to the integration, if none is given, all starlight-specific features are disabled
				addIntegration(integration({ ...parsedConfig, starlight: true }));
				const componentOverrides: typeof config.components = {};
				// The plugin's own assets are referenced by ABSOLUTE path.
				//
				// They used to be referenced by package specifier
				// ('starlight-site-graph/styles/layers.css'), which only resolves
				// when the package is installed under its own name. The plugin is
				// consumed from source — as a submodule of the consuming
				// repository — so the specifier had nothing to resolve to and the
				// build failed on the stylesheet.
				const asset = (relative: string): string =>
					fileURLToPath(new URL(relative, import.meta.url));
				const customCss: typeof config.customCss = [
					asset('./styles/layers.css'),
					asset('./styles/common.css'),
					asset('./styles/starlight.css'),
				];

				if (parsedConfig.overridePageSidebar) {
					if (config.components?.PageSidebar) {
						logger.warn(
							'It looks like you already have a `PageSidebar` component override in your Starlight configuration.',
						);
						logger.warn(
							'To use `starlight-site-graph`, either remove the override or manually render `starlight-site-graph/components/Graph.astro`.',
						);
						logger.info(
							"If you do not want this plugin to override your `PageSidebar` at all, you can set `overridePageSidebar` to `false` in the configuration.",
						)
					} else {
						componentOverrides.PageSidebar = asset('./overrides/PageSidebar.astro');
					}
				}

				updateConfig({
					customCss: [...(config.customCss ?? []), ...customCss],
					components: {
						...componentOverrides,
						...config.components,
					},
				});
			},
		},
	};
}
