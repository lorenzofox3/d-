import node from 'rollup-plugin-node-resolve';
export default {
  entry: './test/index.js',
  dest: './test/dist/index.js',
  plugins: [node({jsnext: true})],
  format: 'iife',
  moduleName: 'test',
  sourceMap: 'inline'
};