import {createStore, applyMiddleware, compose} from 'redux';
import grid from './grid';
import reducer from '../reducers/index';
import smartListRegistry from './smartListRegistry';

const initialState = {
  grid: {
    panels: [...grid],
    active: null,
  },
  smartList: []
};

/**
 * this will update the different registries when panel positioning change
 */
const syncRegistries = (store) => next => action => {
  const {type, x, y, startX, startY} = action;
  if (type === 'RESET_PANEL') {
    const sl = smartListRegistry.find(x, y);
    if (sl) {
      sl.remove();
    }
  } else if (type === 'END_MOVE') {
    const {grid: {active}} = store.getState();
    if (active.valid === true) {
      const oldSl = smartListRegistry.find(startX, startY);
      const newSl = smartListRegistry.find(x, y);
      if (oldSl) {
        oldSl.remove();
      }
      if (newSl) {
        newSl.remove();
      }
    }
  }

  return next(action);
};

export default createStore(reducer(grid), initialState, applyMiddleware(syncRegistries));
