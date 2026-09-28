/**
 * Documentation version configuration — the single source of truth for which
 * docs versions exist and which one is the default. Re-exported by
 * src/pages/api/search/[version].json.ts, which the rest of the site imports from.
 */

export const VERSIONS = ["next", "1.0.0", "0.9.0"];
export const DEFAULT_VERSION = "1.0.0";
