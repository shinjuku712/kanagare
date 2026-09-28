/**
 * Instance branding, fixed at build time from BRAND_DIR (see vite.config.ts).
 * Defaults to Kanagare; `logo` is a data: URL of a replacement SVG, or null for
 * the built-in mark.
 */
declare const __BRAND__: { name: string; shortName: string; logo: string | null };

export const brand = __BRAND__;
