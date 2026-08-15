import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  async redirects() {
    return [
      {
        source: "/branding/favicon.ico",
        destination: "https://www.pdfroot.com/favicon.ico",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "pdfroot.com",
          },
        ],
        destination: "https://www.pdfroot.com/:path*",
        permanent: true,
      },
      {
        source: "/login",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/signup",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/dashboard",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/rrb-photo-resize",
        destination: "/rrb-signature-resize",
        permanent: true,
      },
    ];
  },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:(fs|https)$/ }));
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        "node:fs": false,
        "node:https": false,
      };
    }

    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
