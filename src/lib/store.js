import {Grid} from './grid';
import {createStore} from 'redux';
import reducer from '../reducers/index';
import {ROWS, COLUMNS} from './const';
import {connect} from 'flaco';
import {bindActions} from '../actions/index';
import gridify from '../combinators/gridInjected';


const grid = Grid({rows:ROWS, columns:COLUMNS});
const initialState = {
  grid: {
    panels: [...grid],
    active: null
  }
};

const store = createStore(reducer(grid), initialState,
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__());
const actions = bindActions(store);

export default {
  gridify: gridify(grid, actions),
  store,
  connect: (sliceState) => connect(store, actions, sliceState)
}