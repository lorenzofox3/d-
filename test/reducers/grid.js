import zora from 'zora';
import {Grid} from '../../src/lib/grid';
import reducer from '../../src/reducers/grid';

export default zora()
  .test('Start resize', function * (t) {
    const red = reducer(Grid({rows: 2, columns: 2}));
    const newState = red({}, {type: 'START_RESIZE', x: 2, y: 1});
    t.deepEqual(newState, {active: {x: 2, y: 1, operation: 'resize'}});
  })
  .test('resize over: whole area valid', function * (t) {
    const red = reducer(Grid({rows: 2, columns: 2}));
    const newState = red({active: {x: 2, y: 1, operation: 'resize'}}, {type: 'DRAG_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 2, y: 1, operation: 'resize', valid: true}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 1, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 1, data: {}}
      ]
    });
  })
  .test('resize over: should set invalid area which has intersection with current area', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});

    const newState = red({active: {x: 2, y: 1, operation: 'resize'}}, {type: 'DRAG_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 2, y: 1, operation: 'resize', valid: false}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, data: {}, adornerStatus: 0},
        {x: 2, y: 1, dx: 1, dy: 1, data: {}, adornerStatus: 1},
        {x: 1, y: 2, dx: 2, dy: 1, data: {}, adornerStatus: -1},
        {x: 2, y: 2, dx: 1, dy: 1, data: {}, adornerStatus: -1}
      ]
    });
  })
  .test('resize over: should set as valid an area which is entirely included in current area', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});
    const newState = red({active: {x: 1, y: 1, operation: 'resize'}}, {type: 'DRAG_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 1, y: 1, operation: 'resize', valid: true}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 1, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 1, data: {}},
        {x: 1, y: 2, dx: 2, dy: 1, adornerStatus: 1, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 1, data: {}}
      ]
    });
  })
  .test('end resize: should resize a valid area', function * (t) {
    const red = reducer(Grid({rows: 2, columns: 2}));
    const newState = red({active: {x: 2, y: 1, valid: true}}, {type: 'END_RESIZE', startX: 2, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 2, adornerStatus: 0, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}}
      ]
    });
  })
  .test('end resize: should reset adorners without resizing when area is invalid', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});

    const newState = red({active: {x: 2, y: 1, valid: false}}, {type: 'END_RESIZE', startX: 2, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 1, y: 2, dx: 2, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}}
      ]
    });
  })
  .test('end resize: should resize the area when it entirely includes another one (and reset the overlapped ones)', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});

    const newState = red({active: {x: 1, y: 1, valid: true}}, {type: 'END_RESIZE', startX: 1, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null, panels: [
        {x: 1, y: 1, dx: 2, dy: 2, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}}
      ]
    });
  })
  .test('start move', function * (t) {
    const red = reducer(Grid({rows: 2, columns: 2}));
    const newState = red({}, {type: 'START_MOVE', x: 2, y: 1});
    t.deepEqual(newState, {active: {x: 2, y: 1, operation: 'move'}});
  })
  .test('move over: should set valid when swapping two self including panels', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    const newState = red({active: {x: 2, y: 1, operation: 'move'}}, {type: 'DRAG_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 2, y: 1, operation: 'move', valid: true}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 1, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 1, data: {}}
      ]
    });
  })
  .test('move over: should set invalid when the moving area does not include the target area', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(2, 1, {dy: 2});
    const newState = red({active: {x: 1, y: 1, operation: 'move'}}, {type: 'DRAG_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 1, y: 1, operation: 'move', valid: false}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 1, data: {}},
        {x: 2, y: 1, dx: 1, dy: 2, adornerStatus: -1, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: -1, data: {}}
      ]
    });
  })
  .test('move over: should set valid when all targeted area fits within the active area', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 1, {dy: 2});
    const newState = red({active: {x: 1, y: 1, operation: 'move'}}, {type: 'DRAG_OVER', x: 2, y: 1});
    t.deepEqual(newState, {
      active: {x: 1, y: 1, operation: 'move', valid: true}, panels: [
        {x: 1, y: 1, dx: 1, dy: 2, adornerStatus: 1, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 1, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 1, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 1, data: {}}
      ]
    });
  })
  .test('move over: should not set valid when the targeted area does not fit into the grid', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 1, {dx: 2});
    const newState = red({active: {x: 1, y: 1, operation: 'move'}}, {type: 'DRAG_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 1, y: 1, operation: 'move', valid: false}, panels: [
        {x: 1, y: 1, dx: 2, dy: 1, adornerStatus: -1, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: -1, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: -1, data: {}}
      ]
    });
  })
  .test('end move: should swap tow self including panels', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(2, 1, {data: {foo: 'bar'}});
    grid.updateAt(2, 2, {data: {foo: 'barbis'}});

    const newState = red({active: {x: 2, y: 1, valid: true}}, {type: 'END_MOVE', startX: 2, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null,
      panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {foo: 'barbis'}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {foo: 'bar'}}
      ]
    });
  })
  .test('end move: should not swap panels when it is forbidden (invalid)', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(2, 1, {data: {foo: 'bar'}});
    grid.updateAt(2, 2, {data: {foo: 'barbis'}});

    const newState = red({active: {x: 2, y: 1, valid: false}}, {type: 'END_MOVE', startX: 2, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null,
      panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {foo: 'bar'}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {foo: 'barbis'}}
      ]
    });
  })
  .test('update panel data', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    const newState = red({active: null}, {type: 'UPDATE_PANEL_DATA', x: 2, y: 1, data: {foo: 'bar'}});
    t.deepEqual(newState, {
      active: null,
      panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {foo: 'bar'}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}}
      ]
    });
  })
  .test('reset panel data', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {data: {foo: 'bar'}});
    const newState = red({active: null}, {type: 'RESET_PANEL', x: 1, y: 2});
    t.deepEqual(newState, {
      active: null,
      panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0, data: {}}
      ]
    });
  })