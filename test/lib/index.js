import zora from 'zora';
import grid from './grid'
import di from './di';
export default zora()
  .test(grid)
  .test(di);