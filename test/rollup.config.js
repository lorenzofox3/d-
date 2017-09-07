import node from 'rollup-plugin-node-resolve';
import buble from 'rollup-plugin-buble';
import replace from 'rollup-plugin-replace';

export default {
  entry: './test/index.js',
  dest: './test/dist/index.js',
  plugins: [
    replace({'process.env.NODE_ENV': JSON.stringify('test')}),
    node({jsnext: true}),
    buble({
      jsx: 'h',
      transforms: {
        async: false
      },
      target: {chrome: 52},
      objectAssign: 'Object.assign'
    }),
  ],
  format: 'iife',
  moduleName: 'test',
  sourceMap: 'inline'
};