import st from 'smart-table-core';
import data from '../mockData';

export default (store, actions) => {

  const smartListRegistry = [];

  const has = (x, y) => smartListRegistry.find((item) => x === item.x && y === item.y) !== void 0;

  const get = (x, y) => smartListRegistry.find(item => x === item.x && y === item.y).smartList;

  const instance = {
    getSmartList(x, y){
      if (!has(x, y)) {
        const smartList = st({data});
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

      return get(x, y);
    }
  };

  const state = store.getState();
  const smartListStates = state.smartList || [];

  for(let {x,y} of smartListStates){
    const smartList = st({data});
    smartList.onDisplayChange(items => {
      actions.updateSmartList({
        x, y,
        tableState: smartList.getTableState(),
        items
      });
    });
    smartListRegistry.push({x, y, smartList});
    smartList.exec();
    // setTimeout( () => smartList.exec(),200 );
  }

  return instance;
};