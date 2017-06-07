import gridReducer from './grid';
import modalReducer from './modal';
import smartListReducer from './smartList';

export default (grid) => (state = {}, action) => ({
  grid: gridReducer(grid)(state.grid, action),
  modal: modalReducer(grid)(state.modal, action),
  smartList: smartListReducer(state.smartList, action)
});
