export default (state = [], action) => {
  const {type} = action;
  switch (type) {
    case 'CREATE_SMART_LIST': {
      const {x, y, tableState, items} = action;
      return state.concat({x, y, tableState, items});
    }
    case 'UPDATE_SMART_LIST': {
      const {x, y, tableState, items} = action;
      return state.map((sl) => {
        if (sl.x === x && sl.y === y) {
          return {...sl, tableState, items};
        } else {
          return sl;
        }
      });
    }
    case 'REMOVE_SMART_LIST': {
      const {x, y} = action;
      return state.filter(f => f.x !== x || f.y !== y);
    }
    default:
      return state;
  }
};