import zora from 'zora';
import grid from './grid';
import modal from './modal';
import smartList from './smartList';

export default zora()
  .test(grid)
  .test(modal)
  .test(smartList)