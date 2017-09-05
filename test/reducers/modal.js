import zora from 'zora';
import reducer from '../../src/reducers/modal';


export default zora()
  .test('open modal', function * (t) {
    const red = reducer();
    const newState = red({}, {title: 'whatever modal', type: 'OPEN_MODAL'});
    t.deepEqual(newState, {title: 'whatever modal', isOpen: true})
  })
  .test('close modal', function * (t) {
    const red = reducer();
    const newState = red({title: 'foo', modalType: 'super modal', isOpen: true}, {type: 'CLOSE_MODAL'});
    t.deepEqual(newState, {title: '', modalType: 'none', isOpen: false});
  })