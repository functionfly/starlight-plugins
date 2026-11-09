import type { ViteUserConfig } from 'astro';

import type { MegaMenuConfig } from '../types';

export function vitePluginMegaMenuConfig(config: MegaMenuConfig): VitePlugin {
  const moduleId = 'virtual:starlight-mega-menu/config';
  const resolvedModuleId = `\0${moduleId}`;
  const moduleContent = `export default ${JSON.stringify(config)}`;

  return {
    name: 'vite-plugin-starlight-mega-menu-config',
    load(id) {
      return id === resolvedModuleId ? moduleContent : undefined;
    },
    resolveId(id) {
      return id === moduleId ? resolvedModuleId : undefined;
    },
  };
}

type VitePlugin = NonNullable<ViteUserConfig['plugins']>[number];
