import st from 'smart-table-core';
import data from '../mockData';

import grid from './grid';
import actions from './actions';

const smartListRegistry = [];
const matchXY = (x, y) => (item) => x === item.x && y === item.y;
const get = (x, y) => smartListRegistry.find(matchXY(x, y));
const has = (x, y) => get(x, y) !== void 0;

const extendedSmartList = ( opts => {
  const {x, y} = opts;
  const instance = st(opts);
  return Object.assign(instance, {
    remove: () => {
      smartListRegistry.splice(smartListRegistry.indexOf(instance), 1);
      actions.removeSmartList({x, y});
    }
  })
});

const instance = {
  findOrCreate(x, y){
    if (!has(x, y)) {
      const smartList = extendedSmartList({data, x, y});
      smartList.on('EXEC_CHANGED', ({working}) => {
        const {data:panelData} = grid.getData(x, y);
        actions.updatePanelData({x, y, data: Object.assign({}, panelData, {processing: working})});
      });
      smartList.onDisplayChange(items => {
        actions.updateSmartList({
          x, y,
          tableState: smartList.getTableState(),
          items
        });
      });
      smartListRegistry.push({x, y, smartList});
      actions.createSmartList({x, y, tableState: smartList.getTableState(), items: []});
      smartList.exec();
    }
    return get(x, y).smartList;
  },
  find(x, y){
    const sl = get(x, y);
    return sl !== void 0 ? sl.smartList : sl;
  }
};

export default instance;


