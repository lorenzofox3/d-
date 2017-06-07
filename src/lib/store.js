import {Grid} from './grid';
import {createStore} from 'redux';
import reducer from '../reducers/index';
import {ROWS, COLUMNS} from './const';
import {connect} from 'flaco';
import {bindActions} from '../actions/index';
import gridify from '../combinators/gridInjected';
import smartListRegistry from './smartListRegistry';


const grid = Grid({rows: ROWS, columns: COLUMNS});

//todo dummy for test
grid.updateAt(1, 1, {dx: 2, dy: 4, data:{title:'test',type:'list',source:'issues'}});


const initialState = {
  grid: {
    panels: [...grid],
    active: null,
  },
  smartList: [{x: 1, y: 1}]
};

const store = createStore(reducer(grid), initialState,
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__());
const actions = bindActions(store);

export default {
  gridify: gridify(grid, actions),
  store,
  connect: (sliceState) => connect(store, actions, sliceState),
  smartListRegistry: smartListRegistry(store, actions)
}