export default () => (state = {isOpen: false}, action) => {
  const {type} = action;
  const modalData = {...action};
  delete  modalData.type;
  switch (type) {
    case 'OPEN_MODAL': {
      return {...state, ...modalData, isOpen: true};
    }
    case 'CLOSE_MODAL': {
      return {...state, ...modalData, isOpen: false, title: '', modalType: 'none'};
    }
    default:
      return state;
  }
};