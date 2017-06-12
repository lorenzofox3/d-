import * as actions from '../actions/index';
import store from './store';

const output = {};

for(let action of Object.keys(actions)){
  output[action] = args => store.dispatch(actions[action](args));
}

export default output;