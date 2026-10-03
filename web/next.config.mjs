import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * `@wagmi/connectors` re-exports every wallet SDK — MetaMask, WalletConnect and
 * Base Account — and their optional peers (`@x402/*`,
 * `@react-native-async-storage/async-storage`) are not installed, which fails
 * the webpack build even though the admin wallet only uses the injected
 * connector. Resolving those optional imports to an empty module keeps the
 * build honest and the unused connectors out of the bundle.
 */
const optionalWalletModules = [
  '@x402/core',
  '@x402/core/client',
  '@x402/evm',
  '@x402/evm/exact/client',
  '@x402/evm/upto/client',
  '@x402/svm',
  '@x402/svm/exact/client',
  '@react-native-async-storage/async-storage'
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/wikipedia/commons/**'
      }
    ]
  },
  webpack: (config) => {
    for (const request of optionalWalletModules) {
      config.resolve.alias[request] = false;
    }
    return config;
  }
};

export default withNextIntl(nextConfig);