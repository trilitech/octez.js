/* eslint-disable @typescript-eslint/no-var-requires */
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
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.webpack.json'
          }
        },
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
    conditionNames: ['import', 'module', 'browser', 'default']
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
