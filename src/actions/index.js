const actionCreator = actionName => opts => (Object.assign({type: actionName}, opts))

export const resizeOver = actionCreator('RESIZE_OVER');
export const endResize = actionCreator('END_RESIZE');
export const startResize = actionCreator('START_RESIZE');
export const openModal = actionCreator('OPEN_MODAL');
export const closeModal = actionCreator('CLOSE_MODAL');