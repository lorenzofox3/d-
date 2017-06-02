import {connect} from 'flaco';

export default (store, actions) => connect(store, actions, state => state.modal);