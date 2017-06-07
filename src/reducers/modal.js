export default (grid) => (state = {isOpen: false}, action) => {
  const {type, title, modalType, x, y} = action;
  switch (type) {
    case 'OPEN_MODAL': {
      return Object.assign({}, state, {isOpen: true, title, modalType, x, y});
    }
    case 'CLOSE_MODAL': {
      return Object.assign({}, state, {isOpen: false, title:'', modalType:'none'});
    }
    default:
      return state;
  }
};