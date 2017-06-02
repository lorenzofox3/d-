export default (state = {isOpen: false}, action) => {
  const {type, title, modalType} = action;
  switch (type) {
    case 'OPEN_MODAL': {
      return Object.assign({}, state, {isOpen: true, title, modalType});
    }
    case 'CLOSE_MODAL': {
      return Object.assign({}, state, {isOpen: false});
    }
    default:
      return state;
  }
};