import zora from 'zora';
import * as actions from '../../src/actions';

export default zora()
  .test('resizeOver should be defined', function * (t) {
    const val = actions.dragOver({x: 3, y: 4});
    t.deepEqual(val, {type: 'DRAG_OVER', x: 3, y: 4});
  })
  .test('endResize should be defined', function * (t) {
    const val = actions.endResize({x: 3, y: 4});
    t.deepEqual(val, {type: 'END_RESIZE', x: 3, y: 4});
  })
  .test('startResize should be defined', function * (t) {
    const val = actions.startResize({x: 3, y: 4});
    t.deepEqual(val, {type: 'START_RESIZE', x: 3, y: 4});
  })
  .test('openModal', function * (t) {
    const val = actions.openModal({modalType: 'foo', title: 'bar'});
    t.deepEqual(val, {type: 'OPEN_MODAL', modalType: 'foo', title: 'bar'});
  })
  .test('closeModal', function * (t) {
    const val = actions.closeModal();
    t.deepEqual(val, {type: 'CLOSE_MODAL'});
  })