import zora from 'zora';
import grid from './grid';
import actions from './actions';

zora()
  .test(grid)
  .test(actions)
  .run();