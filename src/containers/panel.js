import {connect} from 'flaco'

const findPanelFromState = (x, y) => state => state.grid.panels.find(({x:px, y:py}) => x === px && y === py);
export default (store, actions) => (x, y) => connect(store, actions, findPanelFromState(x, y));