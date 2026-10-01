import type { NextConfig } from "next";

/**
 * Two builds from one tree.
 *   next build                      the local app: API routes, file-backed ledger, hooks and extension talk to it
 *   STATIC_EXPORT=1 next build      the hosted site: static files, no API, the ledger lives in the visitor's browser
 * The static build runs through scripts/build-static.sh, which sets the API routes aside
 * for the duration of the build (a static site has no server to run them).
 */
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/^\/$/, "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isStatic
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath || undefined,
      }
    : {}),
};

export default nextConfig;
