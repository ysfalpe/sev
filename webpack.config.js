import path from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import CompressionPlugin from 'compression-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    entry: {
        main: './src/index.js',
        webrtc: './src/modules/WebRTCManager.js',
        media: './src/modules/MediaStreamManager.js',
        auth: './src/modules/AuthManager.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].[contenthash].js',
        chunkFilename: '[name].[contenthash].chunk.js',
        clean: true
    },
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-source-map',
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                        plugins: [
                            '@babel/plugin-proposal-class-properties',
                            '@babel/plugin-transform-runtime'
                        ]
                    }
                }
            }
        ]
    },
    optimization: {
        minimize: process.env.NODE_ENV === 'production',
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true,
                        drop_debugger: true
                    },
                    output: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ],
        splitChunks: {
            chunks: 'all',
            minSize: 20000,
            minChunks: 1,
            maxAsyncRequests: 30,
            maxInitialRequests: 30,
            cacheGroups: {
                defaultVendors: {
                    test: /[\\/]node_modules[\\/]/,
                    priority: -10,
                    reuseExistingChunk: true
                },
                default: {
                    minChunks: 2,
                    priority: -20,
                    reuseExistingChunk: true
                }
            }
        },
        runtimeChunk: 'single'
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
        }),
        new CompressionPlugin({
            filename: '[path][base].gz',
            algorithm: 'gzip',
            test: /\.(js|css|html|svg)$/,
            threshold: 10240,
            minRatio: 0.8
        }),
        new webpack.optimize.ModuleConcatenationPlugin(),
        new webpack.ids.HashedModuleIdsPlugin({
            context: __dirname,
            hashFunction: 'sha256'
        })
    ],
    resolve: {
        extensions: ['.js'],
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@modules': path.resolve(__dirname, 'src/modules'),
            '@utils': path.resolve(__dirname, 'src/utils'),
            '@config': path.resolve(__dirname, 'src/config')
        }
    },
    performance: {
        hints: process.env.NODE_ENV === 'production' ? 'warning' : false,
        maxEntrypointSize: 512000,
        maxAssetSize: 512000
    },
    stats: {
        colors: true,
        modules: false,
        children: false,
        chunks: false,
        chunkModules: false
    }
}; 