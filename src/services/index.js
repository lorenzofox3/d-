import actions from './actions';
import grid from './grid';
import smartLists from './smartListRegistry';
import store from './store';
import {connect} from 'flaco';


export default {
  actions,
  grid,
  smartLists,
  store,
  connect: sliceState => connect(store, actions, sliceState)
};