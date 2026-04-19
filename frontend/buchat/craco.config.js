const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add fallbacks for Node.js core modules that aren't available in browser
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        path: false,
        fs: false,
        crypto: false,
      };

      // Ignore the problematic modules from the curve25519 library
      webpackConfig.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(path|fs)$/,
          contextRegExp: /@privacyresearch\/curve25519-typescript/,
        })
      );

      return webpackConfig;
    },
  },
};
