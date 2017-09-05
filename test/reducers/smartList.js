import zora from 'zora';
import reducer from '../../src/reducers/smartList';

export default zora()
  .test('create smart list', function * (t) {
    const newState = reducer([], {
      type: 'CREATE_SMART_LIST',
      x: 1,
      y: 2,
      tableState: {foo: 'bar'},
      items: [{id: 1}, {id: 2}]
    });
    t.deepEqual(newState, [{
      x: 1,
      y: 2,
      tableState: {foo: 'bar'},
      items: [{id: 1}, {id: 2}]
    }]);
  })
  .test('update smart list', function * (t) {
    const newState = reducer([
      {x: 1, y: 1, tableState: {foo: 'bar'}, items: [{id: 123}]},
      {x: 1, y: 2, tableState: {foo: 'barbis'}, items: [{id: 1}, {id: 2}]},
    ], {
      type: 'UPDATE_SMART_LIST',
      x: 1,
      y: 2,
      tableState: {foo: 'woot'},
      items: [{id: 666}]
    });
    t.deepEqual(newState, [
      {x: 1, y: 1, tableState: {foo: 'bar'}, items: [{id: 123}]},
      {x: 1, y: 2, tableState: {foo: 'woot'}, items: [{id: 666}]}
    ]);
  })
  .test('remove smart list', function * (t) {
    const newState = reducer([
      {x: 1, y: 1, tableState: {foo: 'bar'}, items: [{id: 123}]},
      {x: 1, y: 2, tableState: {foo: 'barbis'}, items: [{id: 1}, {id: 2}]},
    ], {
      type: 'REMOVE_SMART_LIST',
      x: 1,
      y: 2
    });
    t.deepEqual(newState, [
      {x: 1, y: 1, tableState: {foo: 'bar'}, items: [{id: 123}]}
    ]);
  });