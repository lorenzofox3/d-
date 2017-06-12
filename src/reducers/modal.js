export default (grid) => (state = {isOpen: false}, action) => {
  const {type, title, modalType, x, y} = action;
  const modalData = Object.assign({}, action);
  delete  modalData.type;
  switch (type) {
    case 'OPEN_MODAL': {
      return Object.assign({}, state, modalData, {isOpen: true});
    }
    case 'CLOSE_MODAL': {
      return Object.assign({}, state, modalData, {isOpen: false, title: '', modalType: 'none'});
    }
    default:
      return state;
  }
};