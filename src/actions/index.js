const actionCreator = actionName => opts => (Object.assign({type: actionName}, opts))

export const resizeOver = actionCreator('RESIZE_OVER');
export const endResize = actionCreator('END_RESIZE');
export const startResize = actionCreator('START_RESIZE');
export const openModal = actionCreator('OPEN_MODAL');
export const closeModal = actionCreator('CLOSE_MODAL');
export const updatePanelData = actionCreator('UPDATE_PANEL_DATA');
export const bindActions = (store) => ( {
  resizeOver: (arg) => store.dispatch(resizeOver(arg)),
  endResize: (arg) => store.dispatch(endResize(arg)),
  startResize: (arg) => store.dispatch(startResize(arg)),
  openModal: (args) => store.dispatch(openModal(args)),
  closeModal: (args) => store.dispatch(closeModal(args)),
  updatePanelData: (args) => store.dispatch(updatePanelData(args))
});