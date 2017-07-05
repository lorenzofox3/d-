import node from 'rollup-plugin-node-resolve';
import buble from 'rollup-plugin-buble';
import replace from 'rollup-plugin-replace';

export default {
  entry: './src/index.js',
  dest: './src/bundle.js',
  format: 'es',
  plugins: [
    replace({'process.env.NODE_ENV': JSON.stringify('dev')}),
    node({jsnext: true}),
    buble({
    jsx: 'h',
    target: {chrome: 52},
    objectAssign: 'Object.assign'
  })],
  moduleName: 'dashboard',
  sourceMap: 'inline'
};
