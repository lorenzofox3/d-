import zora from 'zora';
import * as actions from '../../src/actions';

export default zora()
  .test('resizeOver should be defined', function * (t) {
    const val = actions.dragOver({x: 3, y: 4, operation: 'move'});
    t.deepEqual(val, {type: 'DRAG_OVER', x: 3, y: 4, operation: 'move'});
  })
  .test('endResize should be defined', function * (t) {
    const val = actions.endResize({x: 3, y: 4});
    t.deepEqual(val, {type: 'END_RESIZE', x: 3, y: 4});
  })
  .test('startResize should be defined', function * (t) {
    const val = actions.startResize({x: 3, y: 4});
    t.deepEqual(val, {type: 'START_RESIZE', x: 3, y: 4});
  })
  .test('endMOVE should be defined', function * (t) {
    const val = actions.endMove({x: 3, y: 4});
    t.deepEqual(val, {type: 'END_MOVE', x: 3, y: 4});
  })
  .test('startMove should be defined', function * (t) {
    const val = actions.startMove({x: 3, y: 4});
    t.deepEqual(val, {type: 'START_MOVE', x: 3, y: 4});
  })
  .test('openModal', function * (t) {
    const val = actions.openModal({modalType: 'foo', title: 'bar'});
    t.deepEqual(val, {type: 'OPEN_MODAL', modalType: 'foo', title: 'bar'});
  })
  .test('closeModal', function * (t) {
    const val = actions.closeModal();
    t.deepEqual(val, {type: 'CLOSE_MODAL'});
  })
  .test('updatePanelData should be defined', function * (t) {
    const val = actions.updatePanelData({x: 2, y: 3, data: {foo: 'bar'}});
    t.deepEqual(val, {type: 'UPDATE_PANEL_DATA', x: 2, y: 3, data: {foo: 'bar'}});
  })
  .test('resetPanel should be defined', function * (t) {
    const val = actions.resetPanel({x: 2, y: 3});
    t.deepEqual(val, {type: 'RESET_PANEL', x: 2, y: 3});
  })
  .test('updateSmartList should be defined', function * (t) {
    const val = actions.updateSmartList({x: 2, y: 3, tableState: {foo: 'bar'}, items: []});
    t.deepEqual(val, {type: 'UPDATE_SMART_LIST', x: 2, y: 3, tableState: {foo: 'bar'}, items: []});
  })
  .test('createSmartList should be defined', function * (t) {
    const val = actions.createSmartList({x: 2, y: 3, tableState: {foo: 'bar'}, items: []});
    t.deepEqual(val, {type: 'CREATE_SMART_LIST', x: 2, y: 3, tableState: {foo: 'bar'}, items: []});
  })
  .test('removeSmartList should be defined', function * (t) {
    const val = actions.removeSmartList({x: 2, y: 3});
    t.deepEqual(val, {type: 'REMOVE_SMART_LIST', x: 2, y: 3});
  })