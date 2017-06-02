import zora from 'zora';
import {Grid} from '../src/lib/grid';
import reducer from '../src/reducers/grid';

export default zora()
  .test('Start resize', function * (t) {
    const red = reducer(Grid({rows: 2, columns: 2}));
    const newState = red({}, {type: 'START_RESIZE', x: 2, y: 1});
    t.deepEqual(newState, {active: {x: 2, y: 1}});
  })
  .test('resize over: whole area valid', function * (t) {
    const red = reducer(Grid({rows: 2, columns: 2}));
    const newState = red({active: {x: 2, y: 1}}, {type: 'RESIZE_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 2, y: 1}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 1},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 1}
      ]
    });
  })
  .test('should set invalid area which has intersection with current area', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});

    const newState = red({active: {x: 2, y: 1}}, {type: 'RESIZE_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 2, y: 1}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 1},
        {x: 1, y: 2, dx: 2, dy: 1, adornerStatus: -1},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: -1}
      ]
    });
  })
  .test('should set as valid an area which is entirely included in current area', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});

    const newState = red({active: {x: 1, y: 1}}, {type: 'RESIZE_OVER', x: 2, y: 2});
    t.deepEqual(newState, {
      active: {x: 1, y: 1}, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 1},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 1},
        {x: 1, y: 2, dx: 2, dy: 1, adornerStatus: 1},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 1}
      ]
    });
  })
  .test('should resize a valid area', function * (t) {
    const red = reducer(Grid({rows: 2, columns: 2}));
    const newState = red({active: {x: 2, y: 1}}, {type: 'END_RESIZE', startX: 2, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0},
        {x: 2, y: 1, dx: 1, dy: 2, adornerStatus: 0},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0}
      ]
    });
  })
  .test('should reset adorners without resizing when area is invalid', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});

    const newState = red({active: {x: 2, y: 1}}, {type: 'END_RESIZE', startX: 2, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null, panels: [
        {x: 1, y: 1, dx: 1, dy: 1, adornerStatus: 0},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0},
        {x: 1, y: 2, dx: 2, dy: 1, adornerStatus: 0},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0}
      ]
    });
  })
  .test('should resize the area when it entirely includes another one (and reset the overlapped ones)', function * (t) {
    const grid = Grid({rows: 2, columns: 2});
    const red = reducer(grid);
    grid.updateAt(1, 2, {dx: 2});

    const newState = red({active: {x: 1, y: 1}}, {type: 'END_RESIZE', startX: 1, startY: 1, x: 2, y: 2});
    t.deepEqual(newState, {
      active: null, panels: [
        {x: 1, y: 1, dx: 2, dy: 2, adornerStatus: 0},
        {x: 2, y: 1, dx: 1, dy: 1, adornerStatus: 0},
        {x: 1, y: 2, dx: 1, dy: 1, adornerStatus: 0},
        {x: 2, y: 2, dx: 1, dy: 1, adornerStatus: 0}
      ]
    });
  })
