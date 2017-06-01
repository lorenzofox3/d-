import gridReducer from './grid';


export default (grid) => (state = {}, action) => ({
  grid: gridReducer(grid)(state.grid, action)
});
