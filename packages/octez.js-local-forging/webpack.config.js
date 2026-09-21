/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * This file has been modified from its original Taquito source
 * (https://github.com/ecadlabs/taquito) as part of the octez.js fork.
 * See NOTICE for details.
 */
const webpack = require('webpack');
const path = require('path');

module.exports = {
  entry: {
    "octezjs_local_forging": ['./src/octez.js-local-forging.ts']
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    modules: ['node_modules'],
    fallback: {
      "stream": require.resolve("stream-browserify")
    },
    conditionNames: ['import', 'module', 'browser', 'default'],
    alias: {
      '@noble/hashes': path.resolve(__dirname, '../../node_modules/@noble/hashes/esm')
    }
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    library: ['[name]'],
    libraryTarget: "var"
  },
  plugins: [
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] })
  ]
};
