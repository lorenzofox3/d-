import zora from 'zora';
import {indexFromDef, defFromIndex, valuesFromDef, AreaFactory} from '../src/grid';

export default zora()
  .test('indexFromIndex', function * (t) {
    const fn = indexFromDef(4, 4);
    const index = fn(3, 2);
    t.equal(index, 6);
  })
  .test('defFromIndex', function * (t) {
    const fn = defFromIndex(4, 4);
    const def = fn(5);
    t.deepEqual(def, {x: 2, y: 2});
  })
  .test('valueFromDef', function * (t) {
    const fn = valuesFromDef(4, 4);
    const values = fn({x: 2, y: 3, dx: 3, dy: 2});
    t.deepEqual(values, [
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 1, 1, 1,
      0, 1, 1, 1
    ]);
  })
  .test('Area: intersection', function * (t) {
    const factory = AreaFactory(4, 4);
    const a1 = factory([
      1, 1, 1, 1,
      1, 1, 1, 1,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const a2 = factory([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    t.deepEqual(a1.intersection(a2).values, a2.intersection(a1).values, 'intersection should be commutative');
    t.deepEqual(a1.intersection(a2).values, [
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
  })
  .test('Area union', function * (t) {
    const factory = AreaFactory(4, 4);
    const a1 = factory([
      1, 1, 1, 1,
      1, 1, 1, 1,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const a2 = factory([
      1, 1, 0, 0,
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0
    ]);
    t.deepEqual(a1.union(a2).values, a2.union(a1).values, 'union should be commutative');
    t.deepEqual(a1.union(a2).values, [
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 0, 0,
      0, 0, 0, 0
    ])
  })
  .test('Area: includes', function * (t) {
    const factory = AreaFactory(4, 4);
    t.ok(factory([
      1, 1, 1, 1,
      1, 1, 1, 1,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]).includes(factory([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ])));
    t.notOk(factory([
      0, 0, 0, 0,
      1, 1, 1, 0,
      1, 1, 1, 0,
      0, 0, 0, 0
    ]).includes(factory([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ])));
  })
  .test('Area: isIncluded', function * (t) {
    const factory = AreaFactory(4, 4);
    t.ok(factory([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]).isIncluded(factory([
      1, 1, 1, 0,
      1, 1, 1, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ])));
    t.notOk(factory([
      0, 0, 0, 0,
      1, 1, 1, 0,
      1, 1, 1, 0,
      0, 0, 0, 0
    ]).isIncluded(factory([
      0, 0, 0, 0,
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0
    ])));
  })


