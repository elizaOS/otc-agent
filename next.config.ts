import type { NextConfig } from 'next';
import { webpack } from 'next/dist/compiled/webpack/webpack';

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Remove hardcoded path - use process.cwd() or remove entirely
  // outputFileTracingRoot: '/Users/shawwalters/jeju',
  serverExternalPackages: ['handlebars', '@elizaos/plugin-sql', '@elizaos/core'],
  experimental: {
    inlineCss: true,
  },
  // Fix cross-origin chunk loading issues
  // Supports localhost development and Cloudflare tunnels out of the box
  allowedDevOrigins: process.env.NODE_ENV === 'development' 
    ? [
        // Common localhost patterns (works for all developers)
        'localhost:5004',
        '127.0.0.1:5004',
        '0.0.0.0:5004',
        
        // Cloudflare tunnel support (set TUNNEL_DOMAIN in .env.local)
        ...(process.env.TUNNEL_DOMAIN ? [process.env.TUNNEL_DOMAIN] : []),
        
        // Allow custom origins via environment variable (comma-separated)
        ...(process.env.ALLOWED_DEV_ORIGINS?.split(',').map(o => o.trim()) || []),
      ].filter(Boolean)
    : [],
  webpack: (config, { isServer }) => {
    // Ignore handlebars require.extensions warning
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/handlebars/,
        message: /require\.extensions/,
      },
    ];
    
    // Exclude Web3 packages and handlebars from server-side bundling
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        '@rainbow-me/rainbowkit',
        'wagmi',
        '@tanstack/react-query',
        'viem',
        'handlebars',
        '@elizaos/plugin-sql',
        '@elizaos/core'
      ];
    }
    
    // Configure webpack to ignore files that shouldn't trigger rebuilds
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.next/**',
        '**/.git/**',
        '**/*.log',
        '**/*.pid',
        '**/dist/**',
        '**/contracts/artifacts/**',
        '**/contracts/cache/**',
        '**/typechain-types/**',
        '**/cypress/screenshots/**',
        '**/cypress/videos/**',
        '**/prisma/**',
        '**/*.db',
        '**/*.db-journal',
        '**/*.sqlite',
        '**/*.sqlite-journal',
        '**/data/**',
        '**/.eliza/**',
        '**/.elizadb/**',
        '**/.elizaos-cache/**',
        '**/.eliza-runtime/**',
        '**/eliza-data/**',
        '**/logs/**',
        '**/tmp/**',
        '**/.cache/**',
        '**/agent/**',
        '**/agent.js',
        '**/agent.js.map',
        '**/chunk-*.js',
        '**/chunk-*.js.map'
      ],
    };


    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^pg-native$|^cloudflare:sockets$/,
      }),
      // Ignore IndexedDB related imports on server
      ...(isServer ? [
        new webpack.DefinePlugin({
          'typeof window': JSON.stringify('undefined'),
          'typeof indexedDB': JSON.stringify('undefined')
        })
      ] : [])
    );
    // Return modified config
    return {
      ...config,
      resolve: {
        ...config.resolve,
        fallback: {
          ...config.resolve?.fallback,
          fs: false,
          net: false,
          tls: false,
          async_hooks: false,
          worker_threads: false,
        },
      },
    };
  },
  async redirects() {
    return [
      {
        source: '/start',
        destination: 'https://ai.eliza.how/eliza/',
        permanent: false,
      },
      {
        source: '/school',
        destination: 'https://www.youtube.com/playlist?list=PL0D_B_lUFHBKZSKgLlt24RvjJ8pavZNVh',
        permanent: false,
      },
      {
        source: '/discord',
        destination: 'https://discord.gg/2bkryvK9Yu',
        permanent: false,
      },
      {
        source: '/profiles',
        destination: 'https://elizaos.github.io/profiles',
        permanent: false,
      },
      {
        source: '/bounties',
        destination: 'https://elizaos.github.io/website/',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https://*.solana.com wss://*.solana.com https://*.helius-rpc.com https://*.drpc.org https://eth.merkle.io https://api.neynar.com https://farcaster.xyz https://client.farcaster.xyz https://warpcast.com https://wrpcd.net https://*.wrpcd.net wss://relay.farcaster.xyz https://auth.privy.io https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://*.metamask.io https://*.coinbase.com https://api.developer.coinbase.com",
              "font-src 'self' data:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self' https://farcaster.xyz https://*.farcaster.xyz",
              "frame-src 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path(.*)',
        destination: 'https://us-assets.i.posthog.com/static/:path',
      },
      {
        source: '/ingest/:path(.*)',
        destination: 'https://us.i.posthog.com/:path',
      },
      {
        source: '/profiles/:path(.*)',
        destination: 'https://elizaos.github.io/profiles/:path',
      },
      {
        source: '/bounties/:path(.*)',
        destination: 'https://elizaos.github.io/website/:path',
      },
      {
        source: '/eliza/:path(.*)',
        destination: 'https://elizaos.github.io/eliza/:path',
      },
      {
        source: '/.well-known/farcaster.json',
        destination: '/.well-known/farcaster.json',
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
