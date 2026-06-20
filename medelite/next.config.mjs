/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer ships untranspiled ESM; let Next compile it.
  transpilePackages: ["@react-pdf/renderer"],
  // Fonts are loaded via <link> in layout; skip build-time font inlining.
  optimizeFonts: false,
};
export default nextConfig;
