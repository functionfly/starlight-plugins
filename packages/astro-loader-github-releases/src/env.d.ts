/**
 * Astro's `astro:env/server` is a virtual module: it only exists inside an
 * Astro build, so it has no resolvable types of its own.
 */
declare module "astro:env/server" {
  export function getSecret(secretName: string): string | undefined;
}
