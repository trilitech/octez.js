/* eslint-disable @typescript-eslint/no-var-requires */
const TerserPlugin = require('terser-webpack-plugin');
const pkg = require('./package.json');
var { SubresourceIntegrityPlugin } = require('webpack-subresource-integrity');
var WebpackAssetsManifest = require('webpack-assets-manifest');

module.exports = {
  mode: 'production',
  entry: "./dist/lib/octez.js",
  output: {
    library: 'octez.js',
    libraryTarget: 'umd',
    path: __dirname,
    filename: pkg.unpkg,
    crossOriginLoading: 'anonymous'
  },
  resolve: {
    fallback: {
      fs: false,
      stream: require.resolve("stream-browserify")
    },
    conditionNames: ['import', 'module', 'browser', 'default']
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  plugins: [
    new SubresourceIntegrityPlugin({
      hashFuncNames: ['sha384'],
      enabled: true
    }),
    new WebpackAssetsManifest({ integrity: true })
  ]
}
