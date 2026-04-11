const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

// Cesium source path
const cesiumSource = 'node_modules/cesium/Source';
const cesiumWorkers = '../Build/Cesium/Workers';

module.exports = {
    entry: './src/index.ts',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
        sourcePrefix: '',
        publicPath: './'
    },
    amd: {
        toUrlUndefined: true
    },
    resolve: {
        extensions: ['.ts', '.js'],
        mainFiles: ['index', 'Cesium'],
        alias: {
            cesium: path.resolve(__dirname, cesiumSource)
        },
        fallback: {
            fs: false,
            Buffer: false,
            http: false,
            https: false,
            zlib: false
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.(png|gif|jpg|jpeg|svg|xml|json)$/,
                type: 'asset/resource'
            },
            // YENI EKLENEN KURAL :
            {
                test: /\.glsl$/,
                use: 'ts-shader-loader'
            }

        ],
        unknownContextCritical: false
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html'
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.join(cesiumSource, cesiumWorkers),
                    to: 'Workers'
                },
                {
                    from: path.join(cesiumSource, 'Assets'),
                    to: 'Assets'
                },
                {
                    from: path.join(cesiumSource, 'Widgets'),
                    to: 'Widgets'
                },
                {
                    from: path.join(cesiumSource, 'ThirdParty'),
                    to: 'ThirdParty'
                },
                {
                    from: 'public/SampleData',
                    to: 'SampleData'
                },
                {
                    from: 'public/icons',
                    to: 'icons'
                }
            ]
        }),
        new webpack.DefinePlugin({
            CESIUM_BASE_URL: JSON.stringify('./')
        })
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist')
        },
        compress: true,
        port: 8080,
        hot: true,
        open: false,
        headers: {
            'Access-Control-Allow-Origin': '*'
        }
    },
    devtool: 'source-map'
};
