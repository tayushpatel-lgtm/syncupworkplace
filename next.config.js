/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next otherwise drops generated AGENTS.md / CLAUDE.md into the repo root on
  // every dev run. This project keeps its own docs.
  agentRules: false,
};

module.exports = nextConfig;
