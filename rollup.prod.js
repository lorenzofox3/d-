import node from 'rollup-plugin-node-resolve';
import buble from 'rollup-plugin-buble';
import replace from 'rollup-plugin-replace';

export default {
  input: './src/index.js',
  output: {
    file:'./dist/js/bundle.js',
    format:'es'
  },
  plugins: [
    replace({'process.env.NODE_ENV': JSON.stringify('production')}),
    node({jsnext: true}),
    buble({
      jsx: 'h',
      target: {chrome: 52},
      objectAssign: 'Object.assign'
    })],
  name: 'dashboard',
  sourcemap: true
};
