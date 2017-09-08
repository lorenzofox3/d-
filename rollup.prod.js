import node from 'rollup-plugin-node-resolve';
import replace from 'rollup-plugin-replace';
import babel from 'rollup-plugin-babel';

export default {
  input: './src/index.js',
  output: {
    file: './dist/js/bundle.js',
    format: 'es'
  },
  plugins: [
    replace({'process.env.NODE_ENV': JSON.stringify('production')}),
    node({jsnext: true}),
    babel()],
  name: 'dashboard',
  sourcemap: true
};
