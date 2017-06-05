import gridReducer from './grid';
import modalReducer from './modal';

export default (grid) => (state = {}, action) => ({
  grid: gridReducer(grid)(state.grid, action),
  modal: modalReducer(grid)(state.modal, action)
});
