import zora from 'zora';
import grid from './grid';
import actions from './actions';
import gridReducer from './gridReducer';

zora()
  .test(grid)
  .test(actions)
  .test(gridReducer)
  .run();