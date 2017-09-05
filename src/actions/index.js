const actionCreator = actionName => opts => ({type: actionName, ...opts});

export const dragOver = actionCreator('DRAG_OVER');
export const endResize = actionCreator('END_RESIZE');
export const startResize = actionCreator('START_RESIZE');
export const startMove = actionCreator('START_MOVE');
export const endMove = actionCreator('END_MOVE');
export const openModal = actionCreator('OPEN_MODAL');
export const closeModal = actionCreator('CLOSE_MODAL');
export const updatePanelData = actionCreator('UPDATE_PANEL_DATA');
export const updateSmartList = actionCreator('UPDATE_SMART_LIST');
export const createSmartList = actionCreator('CREATE_SMART_LIST');
export const resetPanel = actionCreator('RESET_PANEL');
export const removeSmartList = actionCreator('REMOVE_SMART_LIST');