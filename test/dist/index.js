(function () {
'use strict';

/**
 * slice() reference.
 */

var slice = Array.prototype.slice;

/**
 * Expose `co`.
 */

var index = co['default'] = co.co = co;

/**
 * Wrap the given generator `fn` into a
 * function that returns a promise.
 * This is a separate function so that
 * every `co()` call doesn't create a new,
 * unnecessary closure.
 *
 * @param {GeneratorFunction} fn
 * @return {Function}
 * @api public
 */

co.wrap = function (fn) {
  createPromise.__generatorFunction__ = fn;
  return createPromise;
  function createPromise() {
    return co.call(this, fn.apply(this, arguments));
  }
};

/**
 * Execute the generator function or a generator
 * and return a promise.
 *
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */

function co(gen) {
  var ctx = this;
  var args = slice.call(arguments, 1);

  // we wrap everything in a promise to avoid promise chaining,
  // which leads to memory leak errors.
  // see https://github.com/tj/co/issues/180
  return new Promise(function(resolve, reject) {
    if (typeof gen === 'function') gen = gen.apply(ctx, args);
    if (!gen || typeof gen.next !== 'function') return resolve(gen);

    onFulfilled();

    /**
     * @param {Mixed} res
     * @return {Promise}
     * @api private
     */

    function onFulfilled(res) {
      var ret;
      try {
        ret = gen.next(res);
      } catch (e) {
        return reject(e);
      }
      next(ret);
    }

    /**
     * @param {Error} err
     * @return {Promise}
     * @api private
     */

    function onRejected(err) {
      var ret;
      try {
        ret = gen.throw(err);
      } catch (e) {
        return reject(e);
      }
      next(ret);
    }

    /**
     * Get the next value in the generator,
     * return a promise.
     *
     * @param {Object} ret
     * @return {Promise}
     * @api private
     */

    function next(ret) {
      if (ret.done) return resolve(ret.value);
      var value = toPromise.call(ctx, ret.value);
      if (value && isPromise(value)) return value.then(onFulfilled, onRejected);
      return onRejected(new TypeError('You may only yield a function, promise, generator, array, or object, '
        + 'but the following object was passed: "' + String(ret.value) + '"'));
    }
  });
}

/**
 * Convert a `yield`ed value into a promise.
 *
 * @param {Mixed} obj
 * @return {Promise}
 * @api private
 */

function toPromise(obj) {
  if (!obj) return obj;
  if (isPromise(obj)) return obj;
  if (isGeneratorFunction(obj) || isGenerator(obj)) return co.call(this, obj);
  if ('function' == typeof obj) return thunkToPromise.call(this, obj);
  if (Array.isArray(obj)) return arrayToPromise.call(this, obj);
  if (isObject(obj)) return objectToPromise.call(this, obj);
  return obj;
}

/**
 * Convert a thunk to a promise.
 *
 * @param {Function}
 * @return {Promise}
 * @api private
 */

function thunkToPromise(fn) {
  var ctx = this;
  return new Promise(function (resolve, reject) {
    fn.call(ctx, function (err, res) {
      if (err) return reject(err);
      if (arguments.length > 2) res = slice.call(arguments, 1);
      resolve(res);
    });
  });
}

/**
 * Convert an array of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 *
 * @param {Array} obj
 * @return {Promise}
 * @api private
 */

function arrayToPromise(obj) {
  return Promise.all(obj.map(toPromise, this));
}

/**
 * Convert an object of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 *
 * @param {Object} obj
 * @return {Promise}
 * @api private
 */

function objectToPromise(obj){
  var results = new obj.constructor();
  var keys = Object.keys(obj);
  var promises = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var promise = toPromise.call(this, obj[key]);
    if (promise && isPromise(promise)) defer(promise, key);
    else results[key] = obj[key];
  }
  return Promise.all(promises).then(function () {
    return results;
  });

  function defer(promise, key) {
    // predefine the key in the result
    results[key] = undefined;
    promises.push(promise.then(function (res) {
      results[key] = res;
    }));
  }
}

/**
 * Check if `obj` is a promise.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isPromise(obj) {
  return 'function' == typeof obj.then;
}

/**
 * Check if `obj` is a generator.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

function isGenerator(obj) {
  return 'function' == typeof obj.next && 'function' == typeof obj.throw;
}

/**
 * Check if `obj` is a generator function.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */
function isGeneratorFunction(obj) {
  var constructor = obj.constructor;
  if (!constructor) return false;
  if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true;
  return isGenerator(constructor.prototype);
}

/**
 * Check for plain object.
 *
 * @param {Mixed} val
 * @return {Boolean}
 * @api private
 */

function isObject(val) {
  return Object == val.constructor;
}

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var keys = createCommonjsModule(function (module, exports) {
exports = module.exports = typeof Object.keys === 'function'
  ? Object.keys : shim;

exports.shim = shim;
function shim (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
});

var is_arguments = createCommonjsModule(function (module, exports) {
var supportsArgumentsClass = (function(){
  return Object.prototype.toString.call(arguments)
})() == '[object Arguments]';

exports = module.exports = supportsArgumentsClass ? supported : unsupported;

exports.supported = supported;
function supported(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

exports.unsupported = unsupported;
function unsupported(object){
  return object &&
    typeof object == 'object' &&
    typeof object.length == 'number' &&
    Object.prototype.hasOwnProperty.call(object, 'callee') &&
    !Object.prototype.propertyIsEnumerable.call(object, 'callee') ||
    false;
}
});

var index$1 = createCommonjsModule(function (module) {
var pSlice = Array.prototype.slice;
var objectKeys = keys;
var isArguments = is_arguments;

var deepEqual = module.exports = function (actual, expected, opts) {
  if (!opts) opts = {};
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!actual || !expected || typeof actual != 'object' && typeof expected != 'object') {
    return opts.strict ? actual === expected : actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected, opts);
  }
};

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isBuffer (x) {
  if (!x || typeof x !== 'object' || typeof x.length !== 'number') return false;
  if (typeof x.copy !== 'function' || typeof x.slice !== 'function') {
    return false;
  }
  if (x.length > 0 && typeof x[0] !== 'number') return false;
  return true;
}

function objEquiv(a, b, opts) {
  var i, key;
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return deepEqual(a, b, opts);
  }
  if (isBuffer(a)) {
    if (!isBuffer(b)) {
      return false;
    }
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b);
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key], opts)) return false;
  }
  return typeof a === typeof b;
}
});

const assertions = {
  ok(val, message = 'should be truthy') {
    const assertionResult = {
      pass: Boolean(val),
      expected: 'truthy',
      actual: val,
      operator: 'ok',
      message
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  deepEqual(actual, expected, message = 'should be equivalent') {
    const assertionResult = {
      pass: index$1(actual, expected),
      actual,
      expected,
      message,
      operator: 'deepEqual'
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  equal(actual, expected, message = 'should be equal') {
    const assertionResult = {
      pass: actual === expected,
      actual,
      expected,
      message,
      operator: 'equal'
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  notOk(val, message = 'should not be truthy') {
    const assertionResult = {
      pass: !Boolean(val),
      expected: 'falsy',
      actual: val,
      operator: 'notOk',
      message
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  notDeepEqual(actual, expected, message = 'should not be equivalent') {
    const assertionResult = {
      pass: !index$1(actual, expected),
      actual,
      expected,
      message,
      operator: 'notDeepEqual'
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  notEqual(actual, expected, message = 'should not be equal') {
    const assertionResult = {
      pass: actual !== expected,
      actual,
      expected,
      message,
      operator: 'notEqual'
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  throws(func, expected, message) {
    let caught, pass, actual;
    if (typeof expected === 'string') {
      [expected, message] = [message, expected];
    }
    try {
      func();
    } catch (error) {
      caught = {error};
    }
    pass = caught !== undefined;
    actual = caught && caught.error;
    if (expected instanceof RegExp) {
      pass = expected.test(actual) || expected.test(actual && actual.message);
      expected = String(expected);
    } else if (typeof expected === 'function' && caught) {
      pass = actual instanceof expected;
      actual = actual.constructor;
    }
    const assertionResult = {
      pass,
      expected,
      actual,
      operator: 'throws',
      message: message || 'should throw'
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  doesNotThrow(func, expected, message) {
    let caught;
    if (typeof expected === 'string') {
      [expected, message] = [message, expected];
    }
    try {
      func();
    } catch (error) {
      caught = {error};
    }
    const assertionResult = {
      pass: caught === undefined,
      expected: 'no thrown error',
      actual: caught && caught.error,
      operator: 'doesNotThrow',
      message: message || 'should not throw'
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  },
  fail(reason = 'fail called') {
    const assertionResult = {
      pass: false,
      actual: 'fail called',
      expected: 'fail not called',
      message: reason,
      operator: 'fail'
    };
    this.test.addAssertion(assertionResult);
    return assertionResult;
  }
};

function assertion (test) {
  return Object.create(assertions, {test: {value: test}});
}

const Test = {
  run: function () {
    const assert = assertion(this);
    const now = Date.now();
    return index(this.coroutine(assert))
      .then(() => {
        return {assertions: this.assertions, executionTime: Date.now() - now};
      });
  },
  addAssertion(){
    const newAssertions = [...arguments].map(a => Object.assign({description: this.description}, a));
    this.assertions.push(...newAssertions);
    return this;
  }
};

function test ({description, coroutine, only = false}) {
  return Object.create(Test, {
    description: {value: description},
    coroutine: {value: coroutine},
    assertions: {value: []},
    only: {value: only},
    length: {
      get(){
        return this.assertions.length
      }
    }
  });
}

function tapOut ({pass, message, index}) {
  const status = pass === true ? 'ok' : 'not ok';
  console.log([status, index, message].join(' '));
}

function canExit () {
  return typeof process !== 'undefined' && typeof process.exit === 'function';
}

function tap () {
  return function * () {
    let index = 1;
    let lastId = 0;
    let success = 0;
    let failure = 0;

    const starTime = Date.now();
    console.log('TAP version 13');
    try {
      while (true) {
        const assertion = yield;
        if (assertion.pass === true) {
          success++;
        } else {
          failure++;
        }
        assertion.index = index;
        if (assertion.id !== lastId) {
          console.log(`# ${assertion.description} - ${assertion.executionTime}ms`);
          lastId = assertion.id;
        }
        tapOut(assertion);
        if (assertion.pass !== true) {
          console.log(`  ---
  operator: ${assertion.operator}
  expected: ${JSON.stringify(assertion.expected)}
  actual: ${JSON.stringify(assertion.actual)}
  ...`);
        }
        index++;
      }
    } catch (e) {
      console.log('Bail out! unhandled exception');
      console.log(e);
      if (canExit()) {
        process.exit(1);
      }
    }
    finally {
      const execution = Date.now() - starTime;
      if (index > 1) {
        console.log(`
1..${index - 1}
# duration ${execution}ms
# success ${success}
# failure ${failure}`);
      }
      if (failure && canExit()) {
        process.exit(1);
      }
    }
  };
}

const Plan = {
  test(description, coroutine, opts = {}){
    const testItems = (!coroutine && description.tests) ? [...description] : [{description, coroutine}];
    this.tests.push(...testItems.map(t=>test(Object.assign(t, opts))));
    return this;
  },

  only(description, coroutine){
    return this.test(description, coroutine, {only: true});
  },

  run(sink = tap()){
    const sinkIterator = sink();
    sinkIterator.next();
    const hasOnly = this.tests.some(t=>t.only);
    const runnable = hasOnly ? this.tests.filter(t=>t.only) : this.tests;
    return index(function * () {
      let id = 1;
      try {
        const results = runnable.map(t=>t.run());
        for (let r of results) {
          const {assertions, executionTime} = yield r;
          for (let assert of assertions) {
            sinkIterator.next(Object.assign(assert, {id, executionTime}));
          }
          id++;
        }
      }
      catch (e) {
        sinkIterator.throw(e);
      } finally {
        sinkIterator.return();
      }
    }.bind(this))
  },

  * [Symbol.iterator](){
    for (let t of this.tests) {
      yield t;
    }
  }
};

function plan$1 () {
  return Object.create(Plan, {
    tests: {value: []},
    length: {
      get(){
        return this.tests.length
      }
    }
  });
}

const valuesFromDef = (rows, columns) => ({x = 1, y = 1, dx = 1, dy = 1}={}) => {
  const values = [];
  for (let i = 0; i < rows * columns; i++) {
    const r = Math.floor(i / rows) + 1;
    const c = i % columns + 1;
    values.push(r >= y && r < y + dy && c >= x && c < x + dx ? 1 : 0);
  }
  return values;
};

const defFromIndex = (rows, columns) => (i) => {
  const x = i % columns + 1;
  const y = Math.floor(i / rows) + 1;
  return {x, y};
};

const indexFromDef = (rows, columns) => (x, y) => (y - 1) * rows + x - 1;

const AreaFactory = (rows, columns) => {
  const iToDef = defFromIndex(rows, columns);

  const factory = values => Object.create(Proto, {
    values: {value: [...values]}, length: {
      get(){
        return values.filter(v => v === 1).length
      }
    }
  });

  const Proto = {
    [Symbol.iterator](){
      const values = this.values;
      return (function * () {
        for (let i = 0; i < values.length; i++) {
          if (values[i] === 1) {
            yield iToDef(i);
          }
        }
      })();
    },
    intersection(area){
      return factory(this.values.map((v, i) => v * area.values[i]));
    },
    includes(area){
      const isOne = v => v === 1;
      return this.intersection(area).values.filter(isOne).length === area.values.filter(isOne).length;
    },
    isIncluded(area){
      return area.includes(this);
    },
    union(area){
      return factory(this.values.map((v, i) => v + area.values[i] > 0 ? 1 : 0));
    },
    complement(){
      return factory(this.values.map(v => 1 - v));
    }
  };
  return factory;
};

var grid = plan$1()
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
    ]);
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
  });

plan$1()
  .test(grid)
  .run();

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uL25vZGVfbW9kdWxlcy96b3JhL2Rpc3Qvem9yYS5lcy5qcyIsIi4uLy4uL3NyYy9ncmlkLmpzIiwiLi4vZ3JpZC5qcyIsIi4uL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogc2xpY2UoKSByZWZlcmVuY2UuXG4gKi9cblxudmFyIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xuXG4vKipcbiAqIEV4cG9zZSBgY29gLlxuICovXG5cbnZhciBpbmRleCA9IGNvWydkZWZhdWx0J10gPSBjby5jbyA9IGNvO1xuXG4vKipcbiAqIFdyYXAgdGhlIGdpdmVuIGdlbmVyYXRvciBgZm5gIGludG8gYVxuICogZnVuY3Rpb24gdGhhdCByZXR1cm5zIGEgcHJvbWlzZS5cbiAqIFRoaXMgaXMgYSBzZXBhcmF0ZSBmdW5jdGlvbiBzbyB0aGF0XG4gKiBldmVyeSBgY28oKWAgY2FsbCBkb2Vzbid0IGNyZWF0ZSBhIG5ldyxcbiAqIHVubmVjZXNzYXJ5IGNsb3N1cmUuXG4gKlxuICogQHBhcmFtIHtHZW5lcmF0b3JGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5jby53cmFwID0gZnVuY3Rpb24gKGZuKSB7XG4gIGNyZWF0ZVByb21pc2UuX19nZW5lcmF0b3JGdW5jdGlvbl9fID0gZm47XG4gIHJldHVybiBjcmVhdGVQcm9taXNlO1xuICBmdW5jdGlvbiBjcmVhdGVQcm9taXNlKCkge1xuICAgIHJldHVybiBjby5jYWxsKHRoaXMsIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykpO1xuICB9XG59O1xuXG4vKipcbiAqIEV4ZWN1dGUgdGhlIGdlbmVyYXRvciBmdW5jdGlvbiBvciBhIGdlbmVyYXRvclxuICogYW5kIHJldHVybiBhIHByb21pc2UuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1Byb21pc2V9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGNvKGdlbikge1xuICB2YXIgY3R4ID0gdGhpcztcbiAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cbiAgLy8gd2Ugd3JhcCBldmVyeXRoaW5nIGluIGEgcHJvbWlzZSB0byBhdm9pZCBwcm9taXNlIGNoYWluaW5nLFxuICAvLyB3aGljaCBsZWFkcyB0byBtZW1vcnkgbGVhayBlcnJvcnMuXG4gIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vdGovY28vaXNzdWVzLzE4MFxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgaWYgKHR5cGVvZiBnZW4gPT09ICdmdW5jdGlvbicpIGdlbiA9IGdlbi5hcHBseShjdHgsIGFyZ3MpO1xuICAgIGlmICghZ2VuIHx8IHR5cGVvZiBnZW4ubmV4dCAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHJlc29sdmUoZ2VuKTtcblxuICAgIG9uRnVsZmlsbGVkKCk7XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge01peGVkfSByZXNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfVxuICAgICAqIEBhcGkgcHJpdmF0ZVxuICAgICAqL1xuXG4gICAgZnVuY3Rpb24gb25GdWxmaWxsZWQocmVzKSB7XG4gICAgICB2YXIgcmV0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0ID0gZ2VuLm5leHQocmVzKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChlKTtcbiAgICAgIH1cbiAgICAgIG5leHQocmV0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0Vycm9yfSBlcnJcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfVxuICAgICAqIEBhcGkgcHJpdmF0ZVxuICAgICAqL1xuXG4gICAgZnVuY3Rpb24gb25SZWplY3RlZChlcnIpIHtcbiAgICAgIHZhciByZXQ7XG4gICAgICB0cnkge1xuICAgICAgICByZXQgPSBnZW4udGhyb3coZXJyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChlKTtcbiAgICAgIH1cbiAgICAgIG5leHQocmV0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIG5leHQgdmFsdWUgaW4gdGhlIGdlbmVyYXRvcixcbiAgICAgKiByZXR1cm4gYSBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHJldFxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9XG4gICAgICogQGFwaSBwcml2YXRlXG4gICAgICovXG5cbiAgICBmdW5jdGlvbiBuZXh0KHJldCkge1xuICAgICAgaWYgKHJldC5kb25lKSByZXR1cm4gcmVzb2x2ZShyZXQudmFsdWUpO1xuICAgICAgdmFyIHZhbHVlID0gdG9Qcm9taXNlLmNhbGwoY3R4LCByZXQudmFsdWUpO1xuICAgICAgaWYgKHZhbHVlICYmIGlzUHJvbWlzZSh2YWx1ZSkpIHJldHVybiB2YWx1ZS50aGVuKG9uRnVsZmlsbGVkLCBvblJlamVjdGVkKTtcbiAgICAgIHJldHVybiBvblJlamVjdGVkKG5ldyBUeXBlRXJyb3IoJ1lvdSBtYXkgb25seSB5aWVsZCBhIGZ1bmN0aW9uLCBwcm9taXNlLCBnZW5lcmF0b3IsIGFycmF5LCBvciBvYmplY3QsICdcbiAgICAgICAgKyAnYnV0IHRoZSBmb2xsb3dpbmcgb2JqZWN0IHdhcyBwYXNzZWQ6IFwiJyArIFN0cmluZyhyZXQudmFsdWUpICsgJ1wiJykpO1xuICAgIH1cbiAgfSk7XG59XG5cbi8qKlxuICogQ29udmVydCBhIGB5aWVsZGBlZCB2YWx1ZSBpbnRvIGEgcHJvbWlzZS5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSBvYmpcbiAqIEByZXR1cm4ge1Byb21pc2V9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiB0b1Byb21pc2Uob2JqKSB7XG4gIGlmICghb2JqKSByZXR1cm4gb2JqO1xuICBpZiAoaXNQcm9taXNlKG9iaikpIHJldHVybiBvYmo7XG4gIGlmIChpc0dlbmVyYXRvckZ1bmN0aW9uKG9iaikgfHwgaXNHZW5lcmF0b3Iob2JqKSkgcmV0dXJuIGNvLmNhbGwodGhpcywgb2JqKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIG9iaikgcmV0dXJuIHRodW5rVG9Qcm9taXNlLmNhbGwodGhpcywgb2JqKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob2JqKSkgcmV0dXJuIGFycmF5VG9Qcm9taXNlLmNhbGwodGhpcywgb2JqKTtcbiAgaWYgKGlzT2JqZWN0KG9iaikpIHJldHVybiBvYmplY3RUb1Byb21pc2UuY2FsbCh0aGlzLCBvYmopO1xuICByZXR1cm4gb2JqO1xufVxuXG4vKipcbiAqIENvbnZlcnQgYSB0aHVuayB0byBhIHByb21pc2UuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn1cbiAqIEByZXR1cm4ge1Byb21pc2V9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiB0aHVua1RvUHJvbWlzZShmbikge1xuICB2YXIgY3R4ID0gdGhpcztcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICBmbi5jYWxsKGN0eCwgZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICBpZiAoZXJyKSByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDIpIHJlcyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgIHJlc29sdmUocmVzKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbi8qKlxuICogQ29udmVydCBhbiBhcnJheSBvZiBcInlpZWxkYWJsZXNcIiB0byBhIHByb21pc2UuXG4gKiBVc2VzIGBQcm9taXNlLmFsbCgpYCBpbnRlcm5hbGx5LlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IG9ialxuICogQHJldHVybiB7UHJvbWlzZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGFycmF5VG9Qcm9taXNlKG9iaikge1xuICByZXR1cm4gUHJvbWlzZS5hbGwob2JqLm1hcCh0b1Byb21pc2UsIHRoaXMpKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0IGFuIG9iamVjdCBvZiBcInlpZWxkYWJsZXNcIiB0byBhIHByb21pc2UuXG4gKiBVc2VzIGBQcm9taXNlLmFsbCgpYCBpbnRlcm5hbGx5LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge1Byb21pc2V9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBvYmplY3RUb1Byb21pc2Uob2JqKXtcbiAgdmFyIHJlc3VsdHMgPSBuZXcgb2JqLmNvbnN0cnVjdG9yKCk7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcbiAgdmFyIHByb21pc2VzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgIHZhciBwcm9taXNlID0gdG9Qcm9taXNlLmNhbGwodGhpcywgb2JqW2tleV0pO1xuICAgIGlmIChwcm9taXNlICYmIGlzUHJvbWlzZShwcm9taXNlKSkgZGVmZXIocHJvbWlzZSwga2V5KTtcbiAgICBlbHNlIHJlc3VsdHNba2V5XSA9IG9ialtrZXldO1xuICB9XG4gIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIGRlZmVyKHByb21pc2UsIGtleSkge1xuICAgIC8vIHByZWRlZmluZSB0aGUga2V5IGluIHRoZSByZXN1bHRcbiAgICByZXN1bHRzW2tleV0gPSB1bmRlZmluZWQ7XG4gICAgcHJvbWlzZXMucHVzaChwcm9taXNlLnRoZW4oZnVuY3Rpb24gKHJlcykge1xuICAgICAgcmVzdWx0c1trZXldID0gcmVzO1xuICAgIH0pKTtcbiAgfVxufVxuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGEgcHJvbWlzZS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNQcm9taXNlKG9iaikge1xuICByZXR1cm4gJ2Z1bmN0aW9uJyA9PSB0eXBlb2Ygb2JqLnRoZW47XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYG9iamAgaXMgYSBnZW5lcmF0b3IuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gb2JqXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNHZW5lcmF0b3Iob2JqKSB7XG4gIHJldHVybiAnZnVuY3Rpb24nID09IHR5cGVvZiBvYmoubmV4dCAmJiAnZnVuY3Rpb24nID09IHR5cGVvZiBvYmoudGhyb3c7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYG9iamAgaXMgYSBnZW5lcmF0b3IgZnVuY3Rpb24uXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gb2JqXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGlzR2VuZXJhdG9yRnVuY3Rpb24ob2JqKSB7XG4gIHZhciBjb25zdHJ1Y3RvciA9IG9iai5jb25zdHJ1Y3RvcjtcbiAgaWYgKCFjb25zdHJ1Y3RvcikgcmV0dXJuIGZhbHNlO1xuICBpZiAoJ0dlbmVyYXRvckZ1bmN0aW9uJyA9PT0gY29uc3RydWN0b3IubmFtZSB8fCAnR2VuZXJhdG9yRnVuY3Rpb24nID09PSBjb25zdHJ1Y3Rvci5kaXNwbGF5TmFtZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBpc0dlbmVyYXRvcihjb25zdHJ1Y3Rvci5wcm90b3R5cGUpO1xufVxuXG4vKipcbiAqIENoZWNrIGZvciBwbGFpbiBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNPYmplY3QodmFsKSB7XG4gIHJldHVybiBPYmplY3QgPT0gdmFsLmNvbnN0cnVjdG9yO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb21tb25qc01vZHVsZShmbiwgbW9kdWxlKSB7XG5cdHJldHVybiBtb2R1bGUgPSB7IGV4cG9ydHM6IHt9IH0sIGZuKG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMpLCBtb2R1bGUuZXhwb3J0cztcbn1cblxudmFyIGtleXMgPSBjcmVhdGVDb21tb25qc01vZHVsZShmdW5jdGlvbiAobW9kdWxlLCBleHBvcnRzKSB7XG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB0eXBlb2YgT2JqZWN0LmtleXMgPT09ICdmdW5jdGlvbidcbiAgPyBPYmplY3Qua2V5cyA6IHNoaW07XG5cbmV4cG9ydHMuc2hpbSA9IHNoaW07XG5mdW5jdGlvbiBzaGltIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gIHJldHVybiBrZXlzO1xufVxufSk7XG5cbnZhciBpc19hcmd1bWVudHMgPSBjcmVhdGVDb21tb25qc01vZHVsZShmdW5jdGlvbiAobW9kdWxlLCBleHBvcnRzKSB7XG52YXIgc3VwcG9ydHNBcmd1bWVudHNDbGFzcyA9IChmdW5jdGlvbigpe1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFyZ3VtZW50cylcbn0pKCkgPT0gJ1tvYmplY3QgQXJndW1lbnRzXSc7XG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHN1cHBvcnRzQXJndW1lbnRzQ2xhc3MgPyBzdXBwb3J0ZWQgOiB1bnN1cHBvcnRlZDtcblxuZXhwb3J0cy5zdXBwb3J0ZWQgPSBzdXBwb3J0ZWQ7XG5mdW5jdGlvbiBzdXBwb3J0ZWQob2JqZWN0KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqZWN0KSA9PSAnW29iamVjdCBBcmd1bWVudHNdJztcbn1cblxuZXhwb3J0cy51bnN1cHBvcnRlZCA9IHVuc3VwcG9ydGVkO1xuZnVuY3Rpb24gdW5zdXBwb3J0ZWQob2JqZWN0KXtcbiAgcmV0dXJuIG9iamVjdCAmJlxuICAgIHR5cGVvZiBvYmplY3QgPT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2Ygb2JqZWN0Lmxlbmd0aCA9PSAnbnVtYmVyJyAmJlxuICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsICdjYWxsZWUnKSAmJlxuICAgICFPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwob2JqZWN0LCAnY2FsbGVlJykgfHxcbiAgICBmYWxzZTtcbn1cbn0pO1xuXG52YXIgaW5kZXgkMSA9IGNyZWF0ZUNvbW1vbmpzTW9kdWxlKGZ1bmN0aW9uIChtb2R1bGUpIHtcbnZhciBwU2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2U7XG52YXIgb2JqZWN0S2V5cyA9IGtleXM7XG52YXIgaXNBcmd1bWVudHMgPSBpc19hcmd1bWVudHM7XG5cbnZhciBkZWVwRXF1YWwgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhY3R1YWwsIGV4cGVjdGVkLCBvcHRzKSB7XG4gIGlmICghb3B0cykgb3B0cyA9IHt9O1xuICAvLyA3LjEuIEFsbCBpZGVudGljYWwgdmFsdWVzIGFyZSBlcXVpdmFsZW50LCBhcyBkZXRlcm1pbmVkIGJ5ID09PS5cbiAgaWYgKGFjdHVhbCA9PT0gZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9IGVsc2UgaWYgKGFjdHVhbCBpbnN0YW5jZW9mIERhdGUgJiYgZXhwZWN0ZWQgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5nZXRUaW1lKCkgPT09IGV4cGVjdGVkLmdldFRpbWUoKTtcblxuICAvLyA3LjMuIE90aGVyIHBhaXJzIHRoYXQgZG8gbm90IGJvdGggcGFzcyB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcsXG4gIC8vIGVxdWl2YWxlbmNlIGlzIGRldGVybWluZWQgYnkgPT0uXG4gIH0gZWxzZSBpZiAoIWFjdHVhbCB8fCAhZXhwZWN0ZWQgfHwgdHlwZW9mIGFjdHVhbCAhPSAnb2JqZWN0JyAmJiB0eXBlb2YgZXhwZWN0ZWQgIT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gb3B0cy5zdHJpY3QgPyBhY3R1YWwgPT09IGV4cGVjdGVkIDogYWN0dWFsID09IGV4cGVjdGVkO1xuXG4gIC8vIDcuNC4gRm9yIGFsbCBvdGhlciBPYmplY3QgcGFpcnMsIGluY2x1ZGluZyBBcnJheSBvYmplY3RzLCBlcXVpdmFsZW5jZSBpc1xuICAvLyBkZXRlcm1pbmVkIGJ5IGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoYXMgdmVyaWZpZWRcbiAgLy8gd2l0aCBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwpLCB0aGUgc2FtZSBzZXQgb2Yga2V5c1xuICAvLyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSwgZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5XG4gIC8vIGNvcnJlc3BvbmRpbmcga2V5LCBhbmQgYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LiBOb3RlOiB0aGlzXG4gIC8vIGFjY291bnRzIGZvciBib3RoIG5hbWVkIGFuZCBpbmRleGVkIHByb3BlcnRpZXMgb24gQXJyYXlzLlxuICB9IGVsc2Uge1xuICAgIHJldHVybiBvYmpFcXVpdihhY3R1YWwsIGV4cGVjdGVkLCBvcHRzKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWRPck51bGwodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzQnVmZmVyICh4KSB7XG4gIGlmICgheCB8fCB0eXBlb2YgeCAhPT0gJ29iamVjdCcgfHwgdHlwZW9mIHgubGVuZ3RoICE9PSAnbnVtYmVyJykgcmV0dXJuIGZhbHNlO1xuICBpZiAodHlwZW9mIHguY29weSAhPT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgeC5zbGljZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoeC5sZW5ndGggPiAwICYmIHR5cGVvZiB4WzBdICE9PSAnbnVtYmVyJykgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gb2JqRXF1aXYoYSwgYiwgb3B0cykge1xuICB2YXIgaSwga2V5O1xuICBpZiAoaXNVbmRlZmluZWRPck51bGwoYSkgfHwgaXNVbmRlZmluZWRPck51bGwoYikpXG4gICAgcmV0dXJuIGZhbHNlO1xuICAvLyBhbiBpZGVudGljYWwgJ3Byb3RvdHlwZScgcHJvcGVydHkuXG4gIGlmIChhLnByb3RvdHlwZSAhPT0gYi5wcm90b3R5cGUpIHJldHVybiBmYWxzZTtcbiAgLy9+fn5JJ3ZlIG1hbmFnZWQgdG8gYnJlYWsgT2JqZWN0LmtleXMgdGhyb3VnaCBzY3Jld3kgYXJndW1lbnRzIHBhc3NpbmcuXG4gIC8vICAgQ29udmVydGluZyB0byBhcnJheSBzb2x2ZXMgdGhlIHByb2JsZW0uXG4gIGlmIChpc0FyZ3VtZW50cyhhKSkge1xuICAgIGlmICghaXNBcmd1bWVudHMoYikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgYSA9IHBTbGljZS5jYWxsKGEpO1xuICAgIGIgPSBwU2xpY2UuY2FsbChiKTtcbiAgICByZXR1cm4gZGVlcEVxdWFsKGEsIGIsIG9wdHMpO1xuICB9XG4gIGlmIChpc0J1ZmZlcihhKSkge1xuICAgIGlmICghaXNCdWZmZXIoYikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgIGZvciAoaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoYVtpXSAhPT0gYltpXSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICB0cnkge1xuICAgIHZhciBrYSA9IG9iamVjdEtleXMoYSksXG4gICAgICAgIGtiID0gb2JqZWN0S2V5cyhiKTtcbiAgfSBjYXRjaCAoZSkgey8vaGFwcGVucyB3aGVuIG9uZSBpcyBhIHN0cmluZyBsaXRlcmFsIGFuZCB0aGUgb3RoZXIgaXNuJ3RcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gaGF2aW5nIHRoZSBzYW1lIG51bWJlciBvZiBvd25lZCBwcm9wZXJ0aWVzIChrZXlzIGluY29ycG9yYXRlc1xuICAvLyBoYXNPd25Qcm9wZXJ0eSlcbiAgaWYgKGthLmxlbmd0aCAhPSBrYi5sZW5ndGgpXG4gICAgcmV0dXJuIGZhbHNlO1xuICAvL3RoZSBzYW1lIHNldCBvZiBrZXlzIChhbHRob3VnaCBub3QgbmVjZXNzYXJpbHkgdGhlIHNhbWUgb3JkZXIpLFxuICBrYS5zb3J0KCk7XG4gIGtiLnNvcnQoKTtcbiAgLy9+fn5jaGVhcCBrZXkgdGVzdFxuICBmb3IgKGkgPSBrYS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGlmIChrYVtpXSAhPSBrYltpXSlcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvL2VxdWl2YWxlbnQgdmFsdWVzIGZvciBldmVyeSBjb3JyZXNwb25kaW5nIGtleSwgYW5kXG4gIC8vfn5+cG9zc2libHkgZXhwZW5zaXZlIGRlZXAgdGVzdFxuICBmb3IgKGkgPSBrYS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGtleSA9IGthW2ldO1xuICAgIGlmICghZGVlcEVxdWFsKGFba2V5XSwgYltrZXldLCBvcHRzKSkgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0eXBlb2YgYSA9PT0gdHlwZW9mIGI7XG59XG59KTtcblxuY29uc3QgYXNzZXJ0aW9ucyA9IHtcbiAgb2sodmFsLCBtZXNzYWdlID0gJ3Nob3VsZCBiZSB0cnV0aHknKSB7XG4gICAgY29uc3QgYXNzZXJ0aW9uUmVzdWx0ID0ge1xuICAgICAgcGFzczogQm9vbGVhbih2YWwpLFxuICAgICAgZXhwZWN0ZWQ6ICd0cnV0aHknLFxuICAgICAgYWN0dWFsOiB2YWwsXG4gICAgICBvcGVyYXRvcjogJ29rJyxcbiAgICAgIG1lc3NhZ2VcbiAgICB9O1xuICAgIHRoaXMudGVzdC5hZGRBc3NlcnRpb24oYXNzZXJ0aW9uUmVzdWx0KTtcbiAgICByZXR1cm4gYXNzZXJ0aW9uUmVzdWx0O1xuICB9LFxuICBkZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSA9ICdzaG91bGQgYmUgZXF1aXZhbGVudCcpIHtcbiAgICBjb25zdCBhc3NlcnRpb25SZXN1bHQgPSB7XG4gICAgICBwYXNzOiBpbmRleCQxKGFjdHVhbCwgZXhwZWN0ZWQpLFxuICAgICAgYWN0dWFsLFxuICAgICAgZXhwZWN0ZWQsXG4gICAgICBtZXNzYWdlLFxuICAgICAgb3BlcmF0b3I6ICdkZWVwRXF1YWwnXG4gICAgfTtcbiAgICB0aGlzLnRlc3QuYWRkQXNzZXJ0aW9uKGFzc2VydGlvblJlc3VsdCk7XG4gICAgcmV0dXJuIGFzc2VydGlvblJlc3VsdDtcbiAgfSxcbiAgZXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSA9ICdzaG91bGQgYmUgZXF1YWwnKSB7XG4gICAgY29uc3QgYXNzZXJ0aW9uUmVzdWx0ID0ge1xuICAgICAgcGFzczogYWN0dWFsID09PSBleHBlY3RlZCxcbiAgICAgIGFjdHVhbCxcbiAgICAgIGV4cGVjdGVkLFxuICAgICAgbWVzc2FnZSxcbiAgICAgIG9wZXJhdG9yOiAnZXF1YWwnXG4gICAgfTtcbiAgICB0aGlzLnRlc3QuYWRkQXNzZXJ0aW9uKGFzc2VydGlvblJlc3VsdCk7XG4gICAgcmV0dXJuIGFzc2VydGlvblJlc3VsdDtcbiAgfSxcbiAgbm90T2sodmFsLCBtZXNzYWdlID0gJ3Nob3VsZCBub3QgYmUgdHJ1dGh5Jykge1xuICAgIGNvbnN0IGFzc2VydGlvblJlc3VsdCA9IHtcbiAgICAgIHBhc3M6ICFCb29sZWFuKHZhbCksXG4gICAgICBleHBlY3RlZDogJ2ZhbHN5JyxcbiAgICAgIGFjdHVhbDogdmFsLFxuICAgICAgb3BlcmF0b3I6ICdub3RPaycsXG4gICAgICBtZXNzYWdlXG4gICAgfTtcbiAgICB0aGlzLnRlc3QuYWRkQXNzZXJ0aW9uKGFzc2VydGlvblJlc3VsdCk7XG4gICAgcmV0dXJuIGFzc2VydGlvblJlc3VsdDtcbiAgfSxcbiAgbm90RGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UgPSAnc2hvdWxkIG5vdCBiZSBlcXVpdmFsZW50Jykge1xuICAgIGNvbnN0IGFzc2VydGlvblJlc3VsdCA9IHtcbiAgICAgIHBhc3M6ICFpbmRleCQxKGFjdHVhbCwgZXhwZWN0ZWQpLFxuICAgICAgYWN0dWFsLFxuICAgICAgZXhwZWN0ZWQsXG4gICAgICBtZXNzYWdlLFxuICAgICAgb3BlcmF0b3I6ICdub3REZWVwRXF1YWwnXG4gICAgfTtcbiAgICB0aGlzLnRlc3QuYWRkQXNzZXJ0aW9uKGFzc2VydGlvblJlc3VsdCk7XG4gICAgcmV0dXJuIGFzc2VydGlvblJlc3VsdDtcbiAgfSxcbiAgbm90RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSA9ICdzaG91bGQgbm90IGJlIGVxdWFsJykge1xuICAgIGNvbnN0IGFzc2VydGlvblJlc3VsdCA9IHtcbiAgICAgIHBhc3M6IGFjdHVhbCAhPT0gZXhwZWN0ZWQsXG4gICAgICBhY3R1YWwsXG4gICAgICBleHBlY3RlZCxcbiAgICAgIG1lc3NhZ2UsXG4gICAgICBvcGVyYXRvcjogJ25vdEVxdWFsJ1xuICAgIH07XG4gICAgdGhpcy50ZXN0LmFkZEFzc2VydGlvbihhc3NlcnRpb25SZXN1bHQpO1xuICAgIHJldHVybiBhc3NlcnRpb25SZXN1bHQ7XG4gIH0sXG4gIHRocm93cyhmdW5jLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICAgIGxldCBjYXVnaHQsIHBhc3MsIGFjdHVhbDtcbiAgICBpZiAodHlwZW9mIGV4cGVjdGVkID09PSAnc3RyaW5nJykge1xuICAgICAgW2V4cGVjdGVkLCBtZXNzYWdlXSA9IFttZXNzYWdlLCBleHBlY3RlZF07XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBmdW5jKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNhdWdodCA9IHtlcnJvcn07XG4gICAgfVxuICAgIHBhc3MgPSBjYXVnaHQgIT09IHVuZGVmaW5lZDtcbiAgICBhY3R1YWwgPSBjYXVnaHQgJiYgY2F1Z2h0LmVycm9yO1xuICAgIGlmIChleHBlY3RlZCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgcGFzcyA9IGV4cGVjdGVkLnRlc3QoYWN0dWFsKSB8fCBleHBlY3RlZC50ZXN0KGFjdHVhbCAmJiBhY3R1YWwubWVzc2FnZSk7XG4gICAgICBleHBlY3RlZCA9IFN0cmluZyhleHBlY3RlZCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwZWN0ZWQgPT09ICdmdW5jdGlvbicgJiYgY2F1Z2h0KSB7XG4gICAgICBwYXNzID0gYWN0dWFsIGluc3RhbmNlb2YgZXhwZWN0ZWQ7XG4gICAgICBhY3R1YWwgPSBhY3R1YWwuY29uc3RydWN0b3I7XG4gICAgfVxuICAgIGNvbnN0IGFzc2VydGlvblJlc3VsdCA9IHtcbiAgICAgIHBhc3MsXG4gICAgICBleHBlY3RlZCxcbiAgICAgIGFjdHVhbCxcbiAgICAgIG9wZXJhdG9yOiAndGhyb3dzJyxcbiAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UgfHwgJ3Nob3VsZCB0aHJvdydcbiAgICB9O1xuICAgIHRoaXMudGVzdC5hZGRBc3NlcnRpb24oYXNzZXJ0aW9uUmVzdWx0KTtcbiAgICByZXR1cm4gYXNzZXJ0aW9uUmVzdWx0O1xuICB9LFxuICBkb2VzTm90VGhyb3coZnVuYywgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgICBsZXQgY2F1Z2h0O1xuICAgIGlmICh0eXBlb2YgZXhwZWN0ZWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBbZXhwZWN0ZWQsIG1lc3NhZ2VdID0gW21lc3NhZ2UsIGV4cGVjdGVkXTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGZ1bmMoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY2F1Z2h0ID0ge2Vycm9yfTtcbiAgICB9XG4gICAgY29uc3QgYXNzZXJ0aW9uUmVzdWx0ID0ge1xuICAgICAgcGFzczogY2F1Z2h0ID09PSB1bmRlZmluZWQsXG4gICAgICBleHBlY3RlZDogJ25vIHRocm93biBlcnJvcicsXG4gICAgICBhY3R1YWw6IGNhdWdodCAmJiBjYXVnaHQuZXJyb3IsXG4gICAgICBvcGVyYXRvcjogJ2RvZXNOb3RUaHJvdycsXG4gICAgICBtZXNzYWdlOiBtZXNzYWdlIHx8ICdzaG91bGQgbm90IHRocm93J1xuICAgIH07XG4gICAgdGhpcy50ZXN0LmFkZEFzc2VydGlvbihhc3NlcnRpb25SZXN1bHQpO1xuICAgIHJldHVybiBhc3NlcnRpb25SZXN1bHQ7XG4gIH0sXG4gIGZhaWwocmVhc29uID0gJ2ZhaWwgY2FsbGVkJykge1xuICAgIGNvbnN0IGFzc2VydGlvblJlc3VsdCA9IHtcbiAgICAgIHBhc3M6IGZhbHNlLFxuICAgICAgYWN0dWFsOiAnZmFpbCBjYWxsZWQnLFxuICAgICAgZXhwZWN0ZWQ6ICdmYWlsIG5vdCBjYWxsZWQnLFxuICAgICAgbWVzc2FnZTogcmVhc29uLFxuICAgICAgb3BlcmF0b3I6ICdmYWlsJ1xuICAgIH07XG4gICAgdGhpcy50ZXN0LmFkZEFzc2VydGlvbihhc3NlcnRpb25SZXN1bHQpO1xuICAgIHJldHVybiBhc3NlcnRpb25SZXN1bHQ7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGFzc2VydGlvbiAodGVzdCkge1xuICByZXR1cm4gT2JqZWN0LmNyZWF0ZShhc3NlcnRpb25zLCB7dGVzdDoge3ZhbHVlOiB0ZXN0fX0pO1xufVxuXG5jb25zdCBUZXN0ID0ge1xuICBydW46IGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBhc3NlcnQgPSBhc3NlcnRpb24odGhpcyk7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICByZXR1cm4gaW5kZXgodGhpcy5jb3JvdXRpbmUoYXNzZXJ0KSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHthc3NlcnRpb25zOiB0aGlzLmFzc2VydGlvbnMsIGV4ZWN1dGlvblRpbWU6IERhdGUubm93KCkgLSBub3d9O1xuICAgICAgfSk7XG4gIH0sXG4gIGFkZEFzc2VydGlvbigpe1xuICAgIGNvbnN0IG5ld0Fzc2VydGlvbnMgPSBbLi4uYXJndW1lbnRzXS5tYXAoYSA9PiBPYmplY3QuYXNzaWduKHtkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbn0sIGEpKTtcbiAgICB0aGlzLmFzc2VydGlvbnMucHVzaCguLi5uZXdBc3NlcnRpb25zKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxufTtcblxuZnVuY3Rpb24gdGVzdCAoe2Rlc2NyaXB0aW9uLCBjb3JvdXRpbmUsIG9ubHkgPSBmYWxzZX0pIHtcbiAgcmV0dXJuIE9iamVjdC5jcmVhdGUoVGVzdCwge1xuICAgIGRlc2NyaXB0aW9uOiB7dmFsdWU6IGRlc2NyaXB0aW9ufSxcbiAgICBjb3JvdXRpbmU6IHt2YWx1ZTogY29yb3V0aW5lfSxcbiAgICBhc3NlcnRpb25zOiB7dmFsdWU6IFtdfSxcbiAgICBvbmx5OiB7dmFsdWU6IG9ubHl9LFxuICAgIGxlbmd0aDoge1xuICAgICAgZ2V0KCl7XG4gICAgICAgIHJldHVybiB0aGlzLmFzc2VydGlvbnMubGVuZ3RoXG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gdGFwT3V0ICh7cGFzcywgbWVzc2FnZSwgaW5kZXh9KSB7XG4gIGNvbnN0IHN0YXR1cyA9IHBhc3MgPT09IHRydWUgPyAnb2snIDogJ25vdCBvayc7XG4gIGNvbnNvbGUubG9nKFtzdGF0dXMsIGluZGV4LCBtZXNzYWdlXS5qb2luKCcgJykpO1xufVxuXG5mdW5jdGlvbiBjYW5FeGl0ICgpIHtcbiAgcmV0dXJuIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2Vzcy5leGl0ID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiB0YXAgKCkge1xuICByZXR1cm4gZnVuY3Rpb24gKiAoKSB7XG4gICAgbGV0IGluZGV4ID0gMTtcbiAgICBsZXQgbGFzdElkID0gMDtcbiAgICBsZXQgc3VjY2VzcyA9IDA7XG4gICAgbGV0IGZhaWx1cmUgPSAwO1xuXG4gICAgY29uc3Qgc3RhclRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGNvbnNvbGUubG9nKCdUQVAgdmVyc2lvbiAxMycpO1xuICAgIHRyeSB7XG4gICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBjb25zdCBhc3NlcnRpb24gPSB5aWVsZDtcbiAgICAgICAgaWYgKGFzc2VydGlvbi5wYXNzID09PSB0cnVlKSB7XG4gICAgICAgICAgc3VjY2VzcysrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZhaWx1cmUrKztcbiAgICAgICAgfVxuICAgICAgICBhc3NlcnRpb24uaW5kZXggPSBpbmRleDtcbiAgICAgICAgaWYgKGFzc2VydGlvbi5pZCAhPT0gbGFzdElkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCMgJHthc3NlcnRpb24uZGVzY3JpcHRpb259IC0gJHthc3NlcnRpb24uZXhlY3V0aW9uVGltZX1tc2ApO1xuICAgICAgICAgIGxhc3RJZCA9IGFzc2VydGlvbi5pZDtcbiAgICAgICAgfVxuICAgICAgICB0YXBPdXQoYXNzZXJ0aW9uKTtcbiAgICAgICAgaWYgKGFzc2VydGlvbi5wYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgLS0tXG4gIG9wZXJhdG9yOiAke2Fzc2VydGlvbi5vcGVyYXRvcn1cbiAgZXhwZWN0ZWQ6ICR7SlNPTi5zdHJpbmdpZnkoYXNzZXJ0aW9uLmV4cGVjdGVkKX1cbiAgYWN0dWFsOiAke0pTT04uc3RyaW5naWZ5KGFzc2VydGlvbi5hY3R1YWwpfVxuICAuLi5gKTtcbiAgICAgICAgfVxuICAgICAgICBpbmRleCsrO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdCYWlsIG91dCEgdW5oYW5kbGVkIGV4Y2VwdGlvbicpO1xuICAgICAgY29uc29sZS5sb2coZSk7XG4gICAgICBpZiAoY2FuRXhpdCgpKSB7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZmluYWxseSB7XG4gICAgICBjb25zdCBleGVjdXRpb24gPSBEYXRlLm5vdygpIC0gc3RhclRpbWU7XG4gICAgICBpZiAoaW5kZXggPiAxKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcbjEuLiR7aW5kZXggLSAxfVxuIyBkdXJhdGlvbiAke2V4ZWN1dGlvbn1tc1xuIyBzdWNjZXNzICR7c3VjY2Vzc31cbiMgZmFpbHVyZSAke2ZhaWx1cmV9YCk7XG4gICAgICB9XG4gICAgICBpZiAoZmFpbHVyZSAmJiBjYW5FeGl0KCkpIHtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbn1cblxuY29uc3QgUGxhbiA9IHtcbiAgdGVzdChkZXNjcmlwdGlvbiwgY29yb3V0aW5lLCBvcHRzID0ge30pe1xuICAgIGNvbnN0IHRlc3RJdGVtcyA9ICghY29yb3V0aW5lICYmIGRlc2NyaXB0aW9uLnRlc3RzKSA/IFsuLi5kZXNjcmlwdGlvbl0gOiBbe2Rlc2NyaXB0aW9uLCBjb3JvdXRpbmV9XTtcbiAgICB0aGlzLnRlc3RzLnB1c2goLi4udGVzdEl0ZW1zLm1hcCh0PT50ZXN0KE9iamVjdC5hc3NpZ24odCwgb3B0cykpKSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgb25seShkZXNjcmlwdGlvbiwgY29yb3V0aW5lKXtcbiAgICByZXR1cm4gdGhpcy50ZXN0KGRlc2NyaXB0aW9uLCBjb3JvdXRpbmUsIHtvbmx5OiB0cnVlfSk7XG4gIH0sXG5cbiAgcnVuKHNpbmsgPSB0YXAoKSl7XG4gICAgY29uc3Qgc2lua0l0ZXJhdG9yID0gc2luaygpO1xuICAgIHNpbmtJdGVyYXRvci5uZXh0KCk7XG4gICAgY29uc3QgaGFzT25seSA9IHRoaXMudGVzdHMuc29tZSh0PT50Lm9ubHkpO1xuICAgIGNvbnN0IHJ1bm5hYmxlID0gaGFzT25seSA/IHRoaXMudGVzdHMuZmlsdGVyKHQ9PnQub25seSkgOiB0aGlzLnRlc3RzO1xuICAgIHJldHVybiBpbmRleChmdW5jdGlvbiAqICgpIHtcbiAgICAgIGxldCBpZCA9IDE7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHRzID0gcnVubmFibGUubWFwKHQ9PnQucnVuKCkpO1xuICAgICAgICBmb3IgKGxldCByIG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICBjb25zdCB7YXNzZXJ0aW9ucywgZXhlY3V0aW9uVGltZX0gPSB5aWVsZCByO1xuICAgICAgICAgIGZvciAobGV0IGFzc2VydCBvZiBhc3NlcnRpb25zKSB7XG4gICAgICAgICAgICBzaW5rSXRlcmF0b3IubmV4dChPYmplY3QuYXNzaWduKGFzc2VydCwge2lkLCBleGVjdXRpb25UaW1lfSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZCsrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjYXRjaCAoZSkge1xuICAgICAgICBzaW5rSXRlcmF0b3IudGhyb3coZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBzaW5rSXRlcmF0b3IucmV0dXJuKCk7XG4gICAgICB9XG4gICAgfS5iaW5kKHRoaXMpKVxuICB9LFxuXG4gICogW1N5bWJvbC5pdGVyYXRvcl0oKXtcbiAgICBmb3IgKGxldCB0IG9mIHRoaXMudGVzdHMpIHtcbiAgICAgIHlpZWxkIHQ7XG4gICAgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBwbGFuICgpIHtcbiAgcmV0dXJuIE9iamVjdC5jcmVhdGUoUGxhbiwge1xuICAgIHRlc3RzOiB7dmFsdWU6IFtdfSxcbiAgICBsZW5ndGg6IHtcbiAgICAgIGdldCgpe1xuICAgICAgICByZXR1cm4gdGhpcy50ZXN0cy5sZW5ndGhcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBwbGFuO1xuIiwiZXhwb3J0IGNvbnN0IHZhbHVlc0Zyb21EZWYgPSAocm93cywgY29sdW1ucykgPT4gKHt4ID0gMSwgeSA9IDEsIGR4ID0gMSwgZHkgPSAxfT17fSkgPT4ge1xuICBjb25zdCB2YWx1ZXMgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3dzICogY29sdW1uczsgaSsrKSB7XG4gICAgY29uc3QgciA9IE1hdGguZmxvb3IoaSAvIHJvd3MpICsgMTtcbiAgICBjb25zdCBjID0gaSAlIGNvbHVtbnMgKyAxO1xuICAgIHZhbHVlcy5wdXNoKHIgPj0geSAmJiByIDwgeSArIGR5ICYmIGMgPj0geCAmJiBjIDwgeCArIGR4ID8gMSA6IDApO1xuICB9XG4gIHJldHVybiB2YWx1ZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZGVmRnJvbUluZGV4ID0gKHJvd3MsIGNvbHVtbnMpID0+IChpKSA9PiB7XG4gIGNvbnN0IHggPSBpICUgY29sdW1ucyArIDE7XG4gIGNvbnN0IHkgPSBNYXRoLmZsb29yKGkgLyByb3dzKSArIDE7XG4gIHJldHVybiB7eCwgeX07XG59O1xuXG5leHBvcnQgY29uc3QgaW5kZXhGcm9tRGVmID0gKHJvd3MsIGNvbHVtbnMpID0+ICh4LCB5KSA9PiAoeSAtIDEpICogcm93cyArIHggLSAxO1xuXG5leHBvcnQgY29uc3QgQXJlYUZhY3RvcnkgPSAocm93cywgY29sdW1ucykgPT4ge1xuICBjb25zdCBpVG9EZWYgPSBkZWZGcm9tSW5kZXgocm93cywgY29sdW1ucyk7XG5cbiAgY29uc3QgZmFjdG9yeSA9IHZhbHVlcyA9PiBPYmplY3QuY3JlYXRlKFByb3RvLCB7XG4gICAgdmFsdWVzOiB7dmFsdWU6IFsuLi52YWx1ZXNdfSwgbGVuZ3RoOiB7XG4gICAgICBnZXQoKXtcbiAgICAgICAgcmV0dXJuIHZhbHVlcy5maWx0ZXIodiA9PiB2ID09PSAxKS5sZW5ndGhcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIGNvbnN0IFByb3RvID0ge1xuICAgIFtTeW1ib2wuaXRlcmF0b3JdKCl7XG4gICAgICBjb25zdCB2YWx1ZXMgPSB0aGlzLnZhbHVlcztcbiAgICAgIHJldHVybiAoZnVuY3Rpb24gKiAoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYgKHZhbHVlc1tpXSA9PT0gMSkge1xuICAgICAgICAgICAgeWllbGQgaVRvRGVmKGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICB9LFxuICAgIGludGVyc2VjdGlvbihhcmVhKXtcbiAgICAgIHJldHVybiBmYWN0b3J5KHRoaXMudmFsdWVzLm1hcCgodiwgaSkgPT4gdiAqIGFyZWEudmFsdWVzW2ldKSk7XG4gICAgfSxcbiAgICBpbmNsdWRlcyhhcmVhKXtcbiAgICAgIGNvbnN0IGlzT25lID0gdiA9PiB2ID09PSAxO1xuICAgICAgcmV0dXJuIHRoaXMuaW50ZXJzZWN0aW9uKGFyZWEpLnZhbHVlcy5maWx0ZXIoaXNPbmUpLmxlbmd0aCA9PT0gYXJlYS52YWx1ZXMuZmlsdGVyKGlzT25lKS5sZW5ndGg7XG4gICAgfSxcbiAgICBpc0luY2x1ZGVkKGFyZWEpe1xuICAgICAgcmV0dXJuIGFyZWEuaW5jbHVkZXModGhpcyk7XG4gICAgfSxcbiAgICB1bmlvbihhcmVhKXtcbiAgICAgIHJldHVybiBmYWN0b3J5KHRoaXMudmFsdWVzLm1hcCgodiwgaSkgPT4gdiArIGFyZWEudmFsdWVzW2ldID4gMCA/IDEgOiAwKSk7XG4gICAgfSxcbiAgICBjb21wbGVtZW50KCl7XG4gICAgICByZXR1cm4gZmFjdG9yeSh0aGlzLnZhbHVlcy5tYXAodiA9PiAxIC0gdikpO1xuICAgIH1cbiAgfTtcbiAgcmV0dXJuIGZhY3Rvcnk7XG59O1xuXG5leHBvcnQgY29uc3QgR3JpZCA9ICh7cGFuZWxzRGF0YSA9IFtdLCByb3dzID0gNCwgY29sdW1ucyA9IDR9ID17fSkgPT4ge1xuICBjb25zdCBpVG9EZWYgPSBkZWZGcm9tSW5kZXgocm93cywgY29sdW1ucyk7XG4gIGNvbnN0IGFyZWEgPSBBcmVhRmFjdG9yeShyb3dzLCBjb2x1bW5zKTtcbiAgY29uc3QgdG9WYWx1ZXMgPSB2YWx1ZXNGcm9tRGVmKHJvd3MsIGNvbHVtbnMpO1xuICBsZXQgcGFuZWxzID0gWy4uLnBhbmVsc0RhdGFdO1xuICBpZiAocm93cyAqIGNvbHVtbnMubGVuZ3RoICE9PSBwYW5lbHNEYXRhLmxlbmd0aCkge1xuICAgIHBhbmVscyA9IChuZXcgQXJyYXkocm93cyAqIGNvbHVtbnMpKS5maWxsKDApLm1hcCgoXywgaW5kZXgpID0+IE9iamVjdC5hc3NpZ24oaVRvRGVmKGluZGV4KSwge1xuICAgICAgZHg6IDEsXG4gICAgICBkeTogMSxcbiAgICAgIGFkb3JuZXJTdGF0dXM6IDBcbiAgICB9KSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIFtTeW1ib2wuaXRlcmF0b3JdKCl7XG4gICAgICByZXR1cm4gKGZ1bmN0aW9uICogKCkge1xuICAgICAgICBmb3IgKGxldCBwIG9mIHBhbmVscykge1xuICAgICAgICAgIHlpZWxkIE9iamVjdC5hc3NpZ24oe30sIHApO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgIH0sXG4gICAgdXBkYXRlQXQoeCwgeSwgZGF0YSl7XG4gICAgICBjb25zdCBwID0gcGFuZWxzLmZpbmQocCA9PiBwLnggPT09IHggJiYgcC55ID09PSB5KTtcbiAgICAgIE9iamVjdC5hc3NpZ24ocCwgZGF0YSk7XG4gICAgICByZXR1cm4gcDtcbiAgICB9LFxuICAgIHBhbmVsKHgsIHkpe1xuICAgICAgcmV0dXJuIGFyZWEodG9WYWx1ZXMocGFuZWxzLmZpbmQocCA9PiBwLnggPT09IHggJiYgcC55ID09PSB5KSkpO1xuICAgIH0sXG4gICAgYXJlYSh4LCB5LCBkeCA9IDEsIGR5ID0gMSl7XG4gICAgICByZXR1cm4gYXJlYSh0b1ZhbHVlcyh7eCwgeSwgZHgsIGR5fSkpO1xuICAgIH1cbiAgfTtcbn07IiwiaW1wb3J0IHpvcmEgZnJvbSAnem9yYSc7XG5pbXBvcnQge2luZGV4RnJvbURlZiwgZGVmRnJvbUluZGV4LCB2YWx1ZXNGcm9tRGVmLCBBcmVhRmFjdG9yeX0gZnJvbSAnLi4vc3JjL2dyaWQnO1xuXG5leHBvcnQgZGVmYXVsdCB6b3JhKClcbiAgLnRlc3QoJ2luZGV4RnJvbUluZGV4JywgZnVuY3Rpb24gKiAodCkge1xuICAgIGNvbnN0IGZuID0gaW5kZXhGcm9tRGVmKDQsIDQpO1xuICAgIGNvbnN0IGluZGV4ID0gZm4oMywgMik7XG4gICAgdC5lcXVhbChpbmRleCwgNik7XG4gIH0pXG4gIC50ZXN0KCdkZWZGcm9tSW5kZXgnLCBmdW5jdGlvbiAqICh0KSB7XG4gICAgY29uc3QgZm4gPSBkZWZGcm9tSW5kZXgoNCwgNCk7XG4gICAgY29uc3QgZGVmID0gZm4oNSk7XG4gICAgdC5kZWVwRXF1YWwoZGVmLCB7eDogMiwgeTogMn0pO1xuICB9KVxuICAudGVzdCgndmFsdWVGcm9tRGVmJywgZnVuY3Rpb24gKiAodCkge1xuICAgIGNvbnN0IGZuID0gdmFsdWVzRnJvbURlZig0LCA0KTtcbiAgICBjb25zdCB2YWx1ZXMgPSBmbih7eDogMiwgeTogMywgZHg6IDMsIGR5OiAyfSk7XG4gICAgdC5kZWVwRXF1YWwodmFsdWVzLCBbXG4gICAgICAwLCAwLCAwLCAwLFxuICAgICAgMCwgMCwgMCwgMCxcbiAgICAgIDAsIDEsIDEsIDEsXG4gICAgICAwLCAxLCAxLCAxXG4gICAgXSk7XG4gIH0pXG4gIC50ZXN0KCdBcmVhOiBpbnRlcnNlY3Rpb24nLCBmdW5jdGlvbiAqICh0KSB7XG4gICAgY29uc3QgZmFjdG9yeSA9IEFyZWFGYWN0b3J5KDQsIDQpO1xuICAgIGNvbnN0IGExID0gZmFjdG9yeShbXG4gICAgICAxLCAxLCAxLCAxLFxuICAgICAgMSwgMSwgMSwgMSxcbiAgICAgIDAsIDAsIDAsIDAsXG4gICAgICAwLCAwLCAwLCAwXG4gICAgXSk7XG4gICAgY29uc3QgYTIgPSBmYWN0b3J5KFtcbiAgICAgIDEsIDEsIDAsIDAsXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMCwgMCwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDBcbiAgICBdKTtcbiAgICB0LmRlZXBFcXVhbChhMS5pbnRlcnNlY3Rpb24oYTIpLnZhbHVlcywgYTIuaW50ZXJzZWN0aW9uKGExKS52YWx1ZXMsICdpbnRlcnNlY3Rpb24gc2hvdWxkIGJlIGNvbW11dGF0aXZlJyk7XG4gICAgdC5kZWVwRXF1YWwoYTEuaW50ZXJzZWN0aW9uKGEyKS52YWx1ZXMsIFtcbiAgICAgIDEsIDEsIDAsIDAsXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMCwgMCwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDBcbiAgICBdKTtcbiAgfSlcbiAgLnRlc3QoJ0FyZWEgdW5pb24nLCBmdW5jdGlvbiAqICh0KSB7XG4gICAgY29uc3QgZmFjdG9yeSA9IEFyZWFGYWN0b3J5KDQsIDQpO1xuICAgIGNvbnN0IGExID0gZmFjdG9yeShbXG4gICAgICAxLCAxLCAxLCAxLFxuICAgICAgMSwgMSwgMSwgMSxcbiAgICAgIDAsIDAsIDAsIDAsXG4gICAgICAwLCAwLCAwLCAwXG4gICAgXSk7XG4gICAgY29uc3QgYTIgPSBmYWN0b3J5KFtcbiAgICAgIDEsIDEsIDAsIDAsXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMSwgMSwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDBcbiAgICBdKTtcbiAgICB0LmRlZXBFcXVhbChhMS51bmlvbihhMikudmFsdWVzLCBhMi51bmlvbihhMSkudmFsdWVzLCAndW5pb24gc2hvdWxkIGJlIGNvbW11dGF0aXZlJyk7XG4gICAgdC5kZWVwRXF1YWwoYTEudW5pb24oYTIpLnZhbHVlcywgW1xuICAgICAgMSwgMSwgMSwgMSxcbiAgICAgIDEsIDEsIDEsIDEsXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMCwgMCwgMCwgMFxuICAgIF0pXG4gIH0pXG4gIC50ZXN0KCdBcmVhOiBpbmNsdWRlcycsIGZ1bmN0aW9uICogKHQpIHtcbiAgICBjb25zdCBmYWN0b3J5ID0gQXJlYUZhY3RvcnkoNCwgNCk7XG4gICAgdC5vayhmYWN0b3J5KFtcbiAgICAgIDEsIDEsIDEsIDEsXG4gICAgICAxLCAxLCAxLCAxLFxuICAgICAgMCwgMCwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDBcbiAgICBdKS5pbmNsdWRlcyhmYWN0b3J5KFtcbiAgICAgIDEsIDEsIDAsIDAsXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMCwgMCwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDBcbiAgICBdKSkpO1xuICAgIHQubm90T2soZmFjdG9yeShbXG4gICAgICAwLCAwLCAwLCAwLFxuICAgICAgMSwgMSwgMSwgMCxcbiAgICAgIDEsIDEsIDEsIDAsXG4gICAgICAwLCAwLCAwLCAwXG4gICAgXSkuaW5jbHVkZXMoZmFjdG9yeShbXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMSwgMSwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDAsXG4gICAgICAwLCAwLCAwLCAwXG4gICAgXSkpKTtcbiAgfSlcbiAgLnRlc3QoJ0FyZWE6IGlzSW5jbHVkZWQnLCBmdW5jdGlvbiAqICh0KSB7XG4gICAgY29uc3QgZmFjdG9yeSA9IEFyZWFGYWN0b3J5KDQsIDQpO1xuICAgIHQub2soZmFjdG9yeShbXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMSwgMSwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDAsXG4gICAgICAwLCAwLCAwLCAwXG4gICAgXSkuaXNJbmNsdWRlZChmYWN0b3J5KFtcbiAgICAgIDEsIDEsIDEsIDAsXG4gICAgICAxLCAxLCAxLCAwLFxuICAgICAgMCwgMCwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDBcbiAgICBdKSkpO1xuICAgIHQubm90T2soZmFjdG9yeShbXG4gICAgICAwLCAwLCAwLCAwLFxuICAgICAgMSwgMSwgMSwgMCxcbiAgICAgIDEsIDEsIDEsIDAsXG4gICAgICAwLCAwLCAwLCAwXG4gICAgXSkuaXNJbmNsdWRlZChmYWN0b3J5KFtcbiAgICAgIDAsIDAsIDAsIDAsXG4gICAgICAxLCAxLCAwLCAwLFxuICAgICAgMSwgMSwgMCwgMCxcbiAgICAgIDAsIDAsIDAsIDBcbiAgICBdKSkpO1xuICB9KVxuXG5cbiIsImltcG9ydCB6b3JhIGZyb20gJ3pvcmEnO1xuaW1wb3J0IGdyaWQgZnJvbSAnLi9ncmlkJztcblxuem9yYSgpXG4gIC50ZXN0KGdyaWQpXG4gIC5ydW4oKTsiXSwibmFtZXMiOlsicGxhbiIsInpvcmEiXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0FBSUEsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7Ozs7OztBQU1sQyxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUM7Ozs7Ozs7Ozs7Ozs7O0FBY3ZDLEVBQUUsQ0FBQyxJQUFJLEdBQUcsVUFBVSxFQUFFLEVBQUU7RUFDdEIsYUFBYSxDQUFDLHFCQUFxQixHQUFHLEVBQUUsQ0FBQztFQUN6QyxPQUFPLGFBQWEsQ0FBQztFQUNyQixTQUFTLGFBQWEsR0FBRztJQUN2QixPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7R0FDakQ7Q0FDRixDQUFDOzs7Ozs7Ozs7OztBQVdGLFNBQVMsRUFBRSxDQUFDLEdBQUcsRUFBRTtFQUNmLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQztFQUNmLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDOzs7OztFQUtwQyxPQUFPLElBQUksT0FBTyxDQUFDLFNBQVMsT0FBTyxFQUFFLE1BQU0sRUFBRTtJQUMzQyxJQUFJLE9BQU8sR0FBRyxLQUFLLFVBQVUsRUFBRSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDMUQsSUFBSSxDQUFDLEdBQUcsSUFBSSxPQUFPLEdBQUcsQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDOztJQUVoRSxXQUFXLEVBQUUsQ0FBQzs7Ozs7Ozs7SUFRZCxTQUFTLFdB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RSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7TUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO01BQ1YsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztLQUNYLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztNQUNkLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7TUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO01BQ1YsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztNQUNWLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7S0FDWCxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztNQUNsQixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO01BQ1YsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztNQUNWLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7TUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO0tBQ1gsQ0FBQyxDQUFDLENBQUMsQ0FBQztHQUNOLENBQUM7R0FDRCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsWUFBWSxDQUFDLEVBQUU7SUFDdkMsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNsQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQztNQUNYLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7TUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO01BQ1YsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztNQUNWLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7S0FDWCxDQUFDLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQztNQUNwQixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO01BQ1YsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztNQUNWLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7TUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO0tBQ1gsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO01BQ2QsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztNQUNWLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7TUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO01BQ1YsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztLQUNYLENBQUMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDO01BQ3BCLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7TUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO01BQ1YsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztNQUNWLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7S0FDWCxDQUFDLENBQUMsQ0FBQyxDQUFDO0dBQ04sQ0FBQyxDQUFBOztBQ2xISkEsTUFBSSxFQUFFO0dBQ0gsSUFBSSxDQUFDLElBQUksQ0FBQztHQUNWLEdBQUcsRUFBRSw7OyJ9
