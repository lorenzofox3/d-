import node from 'rollup-plugin-node-resolve';
import buble from 'rollup-plugin-buble';
import commonjs from 'rollup-plugin-commonjs';

export default {
  entry: './test/index.js',
  dest: './test/dist/index.js',
  plugins: [
    node({jsnext: true}),
    commonjs(),
    buble({
      jsx: 'h',
      target: {chrome: 52},
      objectAssign: 'Object.assign'
    }),
  ],
  format: 'iife',
  moduleName: 'test',
  sourceMap: 'inline'
};