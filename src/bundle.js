const createTextVNode = (value) => ({
  nodeType: 'Text',
  children: [],
  props: {value},
  lifeCycle: 0
});

/**
 * Transform hyperscript into virtual dom node
 * @param nodeType {Function, String} - the HTML tag if string, a component or combinator otherwise
 * @param props {Object} - the list of properties/attributes associated to the related node
 * @param children - the virtual dom nodes related to the current node children
 * @returns {Object} - a virtual dom node
 */
function h (nodeType, props, ...children) {
  const flatChildren = children.reduce((acc, child) => {
    const childrenArray = Array.isArray(child) ? child : [child];
    return acc.concat(childrenArray);
  }, [])
    .map(child => {
      // normalize text node to have same structure than regular dom nodes
      const type = typeof child;
      return type === 'object' || type === 'function' ? child : createTextVNode(child);
    });

  if (typeof nodeType !== 'function') {//regular html/text node
    return {
      nodeType,
      props: props,
      children: flatChildren,
      lifeCycle: 0
    };
  } else {
    const fullProps = Object.assign({children: flatChildren}, props);
    const comp = nodeType(fullProps);
    return typeof comp !== 'function' ? comp : h(comp, props, ...flatChildren); //functional comp vs combinator (HOC)
  }
}

function compose (first, ...fns) {
  return (...args) => fns.reduce((previous, current) => current(previous), first(...args));
}

function curry (fn, arityLeft) {
  const arity = arityLeft || fn.length;
  return (...args) => {
    const argLength = args.length || 1;
    if (arity === argLength) {
      return fn(...args);
    } else {
      const func = (...moreArgs) => fn(...args, ...moreArgs);
      return curry(func, arity - args.length);
    }
  };
}



function tap (fn) {
  return arg => {
    fn(arg);
    return arg;
  }
}

const nextTick = fn => setTimeout(fn, 0);

const pairify = holder => key => [key, holder[key]];

const isShallowEqual = (a, b) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((k) => a[k] === b[k]);
};

const ownKeys = obj => Object.keys(obj).filter(k => obj.hasOwnProperty(k));

const isDeepEqual = (a, b) => {
  const type = typeof a;

  //short path(s)
  if (a === b) {
    return true;
  }

  if (type !== typeof b) {
    return false;
  }

  if (type !== 'object') {
    return a === b;
  }

  // objects ...
  if (a === null || b === null) {
    return false;
  }

  if (Array.isArray(a)) {
    return a.length && b.length && a.every((item, i) => isDeepEqual(a[i], b[i]));
  }

  const aKeys = ownKeys(a);
  const bKeys = ownKeys(b);
  return aKeys.length === bKeys.length && aKeys.every(k => isDeepEqual(a[k], b[k]));
};

const identity = a => a;

const noop = _ => {
};

const SVG_NP = 'http://www.w3.org/2000/svg';

const updateDomNodeFactory = (method) => (items) => tap(domNode => {
  for (let pair of items) {
    domNode[method](...pair);
  }
});

const removeEventListeners = updateDomNodeFactory('removeEventListener');
const addEventListeners = updateDomNodeFactory('addEventListener');
const setAttributes = (items) => tap((domNode) => {
  const attributes = items.filter(([key, value]) => typeof value !== 'function');
  for (let [key, value] of attributes) {
    value === false ? domNode.removeAttribute(key) : domNode.setAttribute(key, value);
  }
});
const removeAttributes = (items) => tap(domNode => {
  for (let attr of items) {
    domNode.removeAttribute(attr);
  }
});

const setTextNode = val => node => node.textContent = val;

const createDomNode = (vnode, parent) => {
  if (vnode.nodeType === 'svg') {
    return document.createElementNS(SVG_NP, vnode.nodeType);
  } else if (vnode.nodeType === 'Text') {
    return document.createTextNode(vnode.nodeType);
  } else {
    return parent.namespaceURI === SVG_NP ? document.createElementNS(SVG_NP, vnode.nodeType) : document.createElement(vnode.nodeType);
  }
};

const getEventListeners = (props) => {
  return Object.keys(props)
    .filter(k => k.substr(0, 2) === 'on')
    .map(k => [k.substr(2).toLowerCase(), props[k]]);
};

const traverse = function * (vnode) {
  yield vnode;
  if (vnode.children && vnode.children.length) {
    for (let child of vnode.children) {
      yield * traverse(child);
    }
  }
};

const updateEventListeners = ({props:newNodeProps}={}, {props:oldNodeProps}={}) => {
  const newNodeEvents = getEventListeners(newNodeProps || {});
  const oldNodeEvents = getEventListeners(oldNodeProps || {});

  return newNodeEvents.length || oldNodeEvents.length ?
    compose(
      removeEventListeners(oldNodeEvents),
      addEventListeners(newNodeEvents)
    ) : noop;
};

const updateAttributes = (newVNode, oldVNode) => {
  const newVNodeProps = newVNode.props || {};
  const oldVNodeProps = oldVNode.props || {};

  if (isShallowEqual(newVNodeProps, oldVNodeProps)) {
    return noop;
  }

  if (newVNode.nodeType === 'Text') {
    return setTextNode(newVNode.props.value);
  }

  const newNodeKeys = Object.keys(newVNodeProps);
  const oldNodeKeys = Object.keys(oldVNodeProps);
  const attributesToRemove = oldNodeKeys.filter(k => !newNodeKeys.includes(k));

  return compose(
    removeAttributes(attributesToRemove),
    setAttributes(newNodeKeys.map(pairify(newVNodeProps)))
  );
};

const domFactory = createDomNode;

// apply vnode diffing to actual dom node (if new node => it will be mounted into the parent)
const domify = (oldVnode, newVnode, parentDomNode) => {
  if (!oldVnode) {//there is no previous vnode
    if (newVnode) {//new node => we insert
      newVnode.dom = parentDomNode.appendChild(domFactory(newVnode, parentDomNode));
      newVnode.lifeCycle = 1;
      return {vnode: newVnode, garbage: null};
    } else {//else (irrelevant)
      throw new Error('unsupported operation')
    }
  } else {//there is a previous vnode
    if (!newVnode) {//we must remove the related dom node
      parentDomNode.removeChild(oldVnode.dom);
      return ({garbage: oldVnode, dom: null});
    } else if (newVnode.nodeType !== oldVnode.nodeType) {//it must be replaced
      newVnode.dom = domFactory(newVnode, parentDomNode);
      newVnode.lifeCycle = 1;
      parentDomNode.replaceChild(newVnode.dom, oldVnode.dom);
      return {garbage: oldVnode, vnode: newVnode};
    } else {// only update attributes
      newVnode.dom = oldVnode.dom;
      // pass the unMountHook
      if(oldVnode.onUnMount){
        newVnode.onUnMount = oldVnode.onUnMount;
      }
      newVnode.lifeCycle = oldVnode.lifeCycle + 1;
      return {garbage: null, vnode: newVnode};
    }
  }
};

/**
 * render a virtual dom node, diffing it with its previous version, mounting it in a parent dom node
 * @param oldVnode
 * @param newVnode
 * @param parentDomNode
 * @param onNextTick collect operations to be processed on next tick
 * @returns {Array}
 */
const render = (oldVnode, newVnode, parentDomNode, onNextTick = []) => {

  //1. transform the new vnode to a vnode connected to an actual dom element based on vnode versions diffing
  // i. note at this step occur dom insertions/removals
  // ii. it may collect sub tree to be dropped (or "unmounted")
  const {vnode, garbage} = domify(oldVnode, newVnode, parentDomNode);

  if (garbage !== null) {
    // defer unmount lifecycle as it is not "visual"
    for (let g of traverse(garbage)) {
      if (g.onUnMount) {
        onNextTick.push(g.onUnMount);
      }
    }
  }

  //Normalisation of old node (in case of a replace we will consider old node as empty node (no children, no props))
  const tempOldNode = garbage !== null || !oldVnode ? {length: 0, children: [], props: {}} : oldVnode;

  if (vnode) {

    //2. update dom attributes based on vnode prop diffing.
    //sync
    if (vnode.onUpdate && vnode.lifeCycle > 1) {
      vnode.onUpdate();
    }

    updateAttributes(vnode, tempOldNode)(vnode.dom);

    //fast path
    if (vnode.nodeType === 'Text') {
      return onNextTick;
    }

    if (vnode.onMount && vnode.lifeCycle === 1) {
      onNextTick.push(() => vnode.onMount());
    }

    const childrenCount = Math.max(tempOldNode.children.length, vnode.children.length);

    //async will be deferred as it is not "visual"
    const setListeners = updateEventListeners(vnode, tempOldNode);
    if (setListeners !== noop) {
      onNextTick.push(() => setListeners(vnode.dom));
    }

    //3 recursively traverse children to update dom and collect functions to process on next tick
    if (childrenCount > 0) {
      for (let i = 0; i < childrenCount; i++) {
        // we pass onNextTick as reference (improve perf: memory + speed)
        render(tempOldNode.children[i], vnode.children[i], vnode.dom, onNextTick);
      }
    }
  }

  return onNextTick;
};

const hydrate = (vnode, dom) => {
  'use strict';
  const hydrated = Object.assign({}, vnode);
  const domChildren = Array.from(dom.childNodes).filter(n => n.nodeType !== 3 || n.nodeValue.trim() !== '');
  hydrated.dom = dom;
  hydrated.children = vnode.children.map((child, i) => hydrate(child, domChildren[i]));
  return hydrated;
};

const mount = curry((comp, initProp, root) => {
  const vnode = comp.nodeType !== void 0 ? comp : comp(initProp || {});
  const oldVNode = root.children.length ? hydrate(vnode, root.children[0]) : null;
  const batch = render(oldVNode, vnode, root);
  nextTick(() => {
    for (let op of batch) {
      op();
    }
  });
  return vnode;
});

function update (comp, initialVNode) {
  let oldNode = initialVNode;
  const updateFunc = (props, ...args) => {
    const mount$$1 = oldNode.dom.parentNode;
    const newNode = comp(Object.assign({children: oldNode.children || []}, oldNode.props, props), ...args);
    const nextBatch = render(oldNode, newNode, mount$$1);

    // danger zone !!!!
    // change by keeping the same reference so the eventual parent node does not need to be "aware" tree may have changed downstream: oldNode may be the child of someone ...(well that is a tree data structure after all :P )
    oldNode = Object.assign(oldNode || {}, newNode);
    // end danger zone

    nextTick(function () {
      for (let op of nextBatch) {
        op();
      }
    });
    return newNode;
  };
  return updateFunc;
}

const lifeCycleFactory = method => curry((fn, comp) => (props, ...args) => {
  const n = comp(props, ...args);
  n[method] = () => fn(n, ...args);
  return n;
});

/**
 * life cycle: when the component is mounted
 */
const onMount = lifeCycleFactory('onMount');

/**
 * life cycle: when the component is unmounted
 */
const onUnMount = lifeCycleFactory('onUnMount');

/**
 * life cycle: before the component is updated
 */
const onUpdate = lifeCycleFactory('onUpdate');

var withState = function (comp) {
  return function () {
    let updateFunc;
    const wrapperComp = (props, ...args) => {
      //lazy evaluate updateFunc (to make sure it is defined
      const setState = (newState) => updateFunc(newState);
      return comp(props, setState, ...args);
    };
    const setUpdateFunction = (vnode) => {
      updateFunc = update(wrapperComp, vnode);
    };

    return compose(onMount(setUpdateFunction), onUpdate(setUpdateFunction))(wrapperComp);
  };
};

var connect$1 = (store, actions = {}, sliceState = identity) =>
  (comp, mapStateToProp = identity, shouldUpate = (a, b) => isDeepEqual(a, b) === false) =>
    (initProp) => {
      let componentProps = initProp;
      let updateFunc, previousStateSlice, unsubscriber;

      const wrapperComp = (props, ...args) => {
        return comp(Object.assign(props, mapStateToProp(sliceState(store.getState()))), actions, ...args);
      };

      const subscribe = onMount((vnode) => {
        updateFunc = update(wrapperComp, vnode);
        unsubscriber = store.subscribe(() => {
          const stateSlice = sliceState(store.getState());
          if (shouldUpate(previousStateSlice, stateSlice) === true) {
            Object.assign(componentProps, mapStateToProp(stateSlice));
            updateFunc(componentProps);
            previousStateSlice = stateSlice;
          }
        });
      });

      const unsubscribe = onUnMount(() => {
        unsubscriber();
      });

      return compose(subscribe, unsubscribe)(wrapperComp);
    };

var Panel = (props) => {
  //todo destruct with rest {...otherProps} instead of deleting stuffs
  const {dx = 1, dy = 1, x, y, panelClasses, children, style = ''} = props;
  delete props.children;
  delete props.panelClasses;
  delete props.dx;
  delete props.dy;
  delete props.x;
  delete props.y;
  delete props.style;

  const positionStyle = `
    --grid-column-offset: ${x};
    --grid-row-offset: ${y};
    --grid-row-span: ${dy};
    --grid-column-span: ${dx};
    ${style}
`;

  const classes = ['panel'].concat(panelClasses).join(' ');

  return (h( 'div', Object.assign({}, props, { style: positionStyle, class: classes }),
    children
  ));
};

var AdornerPanel$1 = ({x, y, adornerStatus}) => {
  const extraClasses = [];
  if (adornerStatus === 1) {
    extraClasses.push('valid-panel');
  } else if (adornerStatus === -1) {
    extraClasses.push('invalid-panel');
  }

  return h( Panel, { panelClasses: extraClasses, x: x, y: y, dx: 1, dy: 1 });
};

var AdornerPanel = (props, grid) => {
  const {x, y} = props;
  const {adornerStatus = 0} = grid.getData(x, y);
  return h( AdornerPanel$1, { x: x, y: y, adornerStatus: adornerStatus })
};

const ROWS = 4;
const COLUMNS = 4;

const resizable = Comp => (props) => {
  const {x, y, dx, dy, adornerStatus, onDragStart} = props;
  const zIndex = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['data-panel'];

  //todo
  delete props.onDragStart;

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return h( Panel, { x: x, y: y, dx: dx, dy: dy, style: `z-index:${zIndex};`, panelClasses: panelClasses },
    h( Comp, props),
    h( 'div', { class: "resize-handle", draggable: "true", onDragStart: onDragStart })
  )
};

const EmptyPanel = resizable(props => {
  return (h( 'button', { onClick: props.onClick }, "+"));
});

const ChartPanel = resizable(props =>{
  return h( 'p', null, "That is a chart" );
});


const ListPanel = resizable(props => {
  const {data = {}} = props;
  return (h( 'div', { class: "panel-content" },
    h( 'header', { class: "panel-header" },
      h( 'h2', null, data.title )
    ),
    h( 'div', { class: "panel-body" },
      props.children
    )
  ));
});

const IssueCard = (props) => {
  const {issue = {}} = props;
  const {id, state, created_at, number, html_url, title} = issue;
  return h( 'article', { class: "issue" },
    h( 'header', null,
      h( 'a', { href: html_url }, "#", number),
      h( 'div', null,
        h( 'h3', null, title ),
        h( 'small', null, "created at: ", h( 'time', null, created_at )
        )
      ),
      h( 'span', null, state )
    )
  )
};


const IssuesList = (props) => {
  const {issues = []} = props;
  return (h( 'ul', { class: "issues-list" },
    issues.map(i => h( 'li', null, h( IssueCard, { issue: i }) ))
  ));
};

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
  const defToI = indexFromDef(rows, columns);

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
    },
    debug(){
      let print = '';
      for (let i = 1; i <= rows; i++) {
        let line = [];
        for (let j = 1; j <= columns; j++) {
          const indexFromDef2 = defToI(j, i);
          line.push(this.values[indexFromDef2]);
        }
        print += `
${line.join(' ')}
`;
      }
      console.log(print);
    }
  };
  return factory;
};

const Grid = ({panelsData = [], rows = 4, columns = 4} ={}) => {
  const iToDef = defFromIndex(rows, columns);
  const area = AreaFactory(rows, columns);
  const toValues = valuesFromDef(rows, columns);
  let panels = [...panelsData];
  if (rows * columns.length !== panelsData.length) {
    panels = (new Array(rows * columns)).fill(0).map((_, index) => Object.assign(iToDef(index), {
      dx: 1,
      dy: 1,
      adornerStatus: 0,
      data: {}
    }));
  }

  return {
    [Symbol.iterator](){
      return (function * () {
        for (let p of panels) {
          yield Object.assign({}, p);
        }
      })();
    },
    updateAt(x, y, data){
      const p = panels.find(p => p.x === x && p.y === y);
      Object.assign(p, data);
      return p;
    },
    panel(x, y){
      return area(toValues(panels.find(p => p.x === x && p.y === y)));
    },
    area(x, y, dx = 1, dy = 1){
      return area(toValues({x, y, dx, dy}));
    },
    getData(x, y){
      return panels.find(p => p.x === x && p.y === y) || {};
    }
  };
};

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

var Symbol$1 = root.Symbol;

var objectProto$1 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$1 = objectProto$1.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto$1.toString;

/** Built-in value references. */
var symToStringTag$1 = Symbol$1 ? Symbol$1.toStringTag : undefined;

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag(value) {
  var isOwn = hasOwnProperty$1.call(value, symToStringTag$1),
      tag = value[symToStringTag$1];

  try {
    value[symToStringTag$1] = undefined;
    var unmasked = true;
  } catch (e) {}

  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag$1] = tag;
    } else {
      delete value[symToStringTag$1];
    }
  }
  return result;
}

/** Used for built-in method references. */
var objectProto$2 = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString$1 = objectProto$2.toString;

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString(value) {
  return nativeObjectToString$1.call(value);
}

var nullTag = '[object Null]';
var undefinedTag = '[object Undefined]';

/** Built-in value references. */
var symToStringTag = Symbol$1 ? Symbol$1.toStringTag : undefined;

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return (symToStringTag && symToStringTag in Object(value))
    ? getRawTag(value)
    : objectToString(value);
}

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

var getPrototype = overArg(Object.getPrototypeOf, Object);

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

var objectTag = '[object Object]';

/** Used for built-in method references. */
var funcProto = Function.prototype;
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to infer the `Object` constructor. */
var objectCtorString = funcToString.call(Object);

/**
 * Checks if `value` is a plain object, that is, an object created by the
 * `Object` constructor or one with a `[[Prototype]]` of `null`.
 *
 * @static
 * @memberOf _
 * @since 0.8.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 * }
 *
 * _.isPlainObject(new Foo);
 * // => false
 *
 * _.isPlainObject([1, 2, 3]);
 * // => false
 *
 * _.isPlainObject({ 'x': 0, 'y': 0 });
 * // => true
 *
 * _.isPlainObject(Object.create(null));
 * // => true
 */
function isPlainObject(value) {
  if (!isObjectLike(value) || baseGetTag(value) != objectTag) {
    return false;
  }
  var proto = getPrototype(value);
  if (proto === null) {
    return true;
  }
  var Ctor = hasOwnProperty.call(proto, 'constructor') && proto.constructor;
  return typeof Ctor == 'function' && Ctor instanceof Ctor &&
    funcToString.call(Ctor) == objectCtorString;
}

function symbolObservablePonyfill(root) {
	var result;
	var Symbol = root.Symbol;

	if (typeof Symbol === 'function') {
		if (Symbol.observable) {
			result = Symbol.observable;
		} else {
			result = Symbol('observable');
			Symbol.observable = result;
		}
	} else {
		result = '@@observable';
	}

	return result;
}

/* global window */
var root$2;

if (typeof self !== 'undefined') {
  root$2 = self;
} else if (typeof window !== 'undefined') {
  root$2 = window;
} else if (typeof global !== 'undefined') {
  root$2 = global;
} else if (typeof module !== 'undefined') {
  root$2 = module;
} else {
  root$2 = Function('return this')();
}

var result = symbolObservablePonyfill(root$2);

var ActionTypes = {
  INIT: '@@redux/INIT'
};

/**
 * Creates a Redux store that holds the state tree.
 * The only way to change the data in the store is to call `dispatch()` on it.
 *
 * There should only be a single store in your app. To specify how different
 * parts of the state tree respond to actions, you may combine several reducers
 * into a single reducer function by using `combineReducers`.
 *
 * @param {Function} reducer A function that returns the next state tree, given
 * the current state tree and the action to handle.
 *
 * @param {any} [preloadedState] The initial state. You may optionally specify it
 * to hydrate the state from the server in universal apps, or to restore a
 * previously serialized user session.
 * If you use `combineReducers` to produce the root reducer function, this must be
 * an object with the same shape as `combineReducers` keys.
 *
 * @param {Function} enhancer The store enhancer. You may optionally specify it
 * to enhance the store with third-party capabilities such as middleware,
 * time travel, persistence, etc. The only store enhancer that ships with Redux
 * is `applyMiddleware()`.
 *
 * @returns {Store} A Redux store that lets you read the state, dispatch actions
 * and subscribe to changes.
 */
function createStore(reducer, preloadedState, enhancer) {
  var _ref2;

  if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
    enhancer = preloadedState;
    preloadedState = undefined;
  }

  if (typeof enhancer !== 'undefined') {
    if (typeof enhancer !== 'function') {
      throw new Error('Expected the enhancer to be a function.');
    }

    return enhancer(createStore)(reducer, preloadedState);
  }

  if (typeof reducer !== 'function') {
    throw new Error('Expected the reducer to be a function.');
  }

  var currentReducer = reducer;
  var currentState = preloadedState;
  var currentListeners = [];
  var nextListeners = currentListeners;
  var isDispatching = false;

  function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      nextListeners = currentListeners.slice();
    }
  }

  /**
   * Reads the state tree managed by the store.
   *
   * @returns {any} The current state tree of your application.
   */
  function getState() {
    return currentState;
  }

  /**
   * Adds a change listener. It will be called any time an action is dispatched,
   * and some part of the state tree may potentially have changed. You may then
   * call `getState()` to read the current state tree inside the callback.
   *
   * You may call `dispatch()` from a change listener, with the following
   * caveats:
   *
   * 1. The subscriptions are snapshotted just before every `dispatch()` call.
   * If you subscribe or unsubscribe while the listeners are being invoked, this
   * will not have any effect on the `dispatch()` that is currently in progress.
   * However, the next `dispatch()` call, whether nested or not, will use a more
   * recent snapshot of the subscription list.
   *
   * 2. The listener should not expect to see all state changes, as the state
   * might have been updated multiple times during a nested `dispatch()` before
   * the listener is called. It is, however, guaranteed that all subscribers
   * registered before the `dispatch()` started will be called with the latest
   * state by the time it exits.
   *
   * @param {Function} listener A callback to be invoked on every dispatch.
   * @returns {Function} A function to remove this change listener.
   */
  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Expected listener to be a function.');
    }

    var isSubscribed = true;

    ensureCanMutateNextListeners();
    nextListeners.push(listener);

    return function unsubscribe() {
      if (!isSubscribed) {
        return;
      }

      isSubscribed = false;

      ensureCanMutateNextListeners();
      var index = nextListeners.indexOf(listener);
      nextListeners.splice(index, 1);
    };
  }

  /**
   * Dispatches an action. It is the only way to trigger a state change.
   *
   * The `reducer` function, used to create the store, will be called with the
   * current state tree and the given `action`. Its return value will
   * be considered the **next** state of the tree, and the change listeners
   * will be notified.
   *
   * The base implementation only supports plain object actions. If you want to
   * dispatch a Promise, an Observable, a thunk, or something else, you need to
   * wrap your store creating function into the corresponding middleware. For
   * example, see the documentation for the `redux-thunk` package. Even the
   * middleware will eventually dispatch plain object actions using this method.
   *
   * @param {Object} action A plain object representing “what changed”. It is
   * a good idea to keep actions serializable so you can record and replay user
   * sessions, or use the time travelling `redux-devtools`. An action must have
   * a `type` property which may not be `undefined`. It is a good idea to use
   * string constants for action types.
   *
   * @returns {Object} For convenience, the same action object you dispatched.
   *
   * Note that, if you use a custom middleware, it may wrap `dispatch()` to
   * return something else (for example, a Promise you can await).
   */
  function dispatch(action) {
    if (!isPlainObject(action)) {
      throw new Error('Actions must be plain objects. ' + 'Use custom middleware for async actions.');
    }

    if (typeof action.type === 'undefined') {
      throw new Error('Actions may not have an undefined "type" property. ' + 'Have you misspelled a constant?');
    }

    if (isDispatching) {
      throw new Error('Reducers may not dispatch actions.');
    }

    try {
      isDispatching = true;
      currentState = currentReducer(currentState, action);
    } finally {
      isDispatching = false;
    }

    var listeners = currentListeners = nextListeners;
    for (var i = 0; i < listeners.length; i++) {
      listeners[i]();
    }

    return action;
  }

  /**
   * Replaces the reducer currently used by the store to calculate the state.
   *
   * You might need this if your app implements code splitting and you want to
   * load some of the reducers dynamically. You might also need this if you
   * implement a hot reloading mechanism for Redux.
   *
   * @param {Function} nextReducer The reducer for the store to use instead.
   * @returns {void}
   */
  function replaceReducer(nextReducer) {
    if (typeof nextReducer !== 'function') {
      throw new Error('Expected the nextReducer to be a function.');
    }

    currentReducer = nextReducer;
    dispatch({ type: ActionTypes.INIT });
  }

  /**
   * Interoperability point for observable/reactive libraries.
   * @returns {observable} A minimal observable of state changes.
   * For more information, see the observable proposal:
   * https://github.com/zenparsing/es-observable
   */
  function observable() {
    var _ref;

    var outerSubscribe = subscribe;
    return _ref = {
      /**
       * The minimal observable subscription method.
       * @param {Object} observer Any object that can be used as an observer.
       * The observer object should have a `next` method.
       * @returns {subscription} An object with an `unsubscribe` method that can
       * be used to unsubscribe the observable from the store, and prevent further
       * emission of values from the observable.
       */
      subscribe: function subscribe(observer) {
        if (typeof observer !== 'object') {
          throw new TypeError('Expected the observer to be an object.');
        }

        function observeState() {
          if (observer.next) {
            observer.next(getState());
          }
        }

        observeState();
        var unsubscribe = outerSubscribe(observeState);
        return { unsubscribe: unsubscribe };
      }
    }, _ref[result] = function () {
      return this;
    }, _ref;
  }

  // When a store is created, an "INIT" action is dispatched so that every
  // reducer returns their initial state. This effectively populates
  // the initial state tree.
  dispatch({ type: ActionTypes.INIT });

  return _ref2 = {
    dispatch: dispatch,
    subscribe: subscribe,
    getState: getState,
    replaceReducer: replaceReducer
  }, _ref2[result] = observable, _ref2;
}

/**
 * Prints a warning in the console if it exists.
 *
 * @param {String} message The warning message.
 * @returns {void}
 */
function warning(message) {
  /* eslint-disable no-console */
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error(message);
  }
  /* eslint-enable no-console */
  try {
    // This error was thrown as a convenience so that if you enable
    // "break on all exceptions" in your console,
    // it would pause the execution at this line.
    throw new Error(message);
    /* eslint-disable no-empty */
  } catch (e) {}
  /* eslint-enable no-empty */
}

/**
 * Composes single-argument functions from right to left. The rightmost
 * function can take multiple arguments as it provides the signature for
 * the resulting composite function.
 *
 * @param {...Function} funcs The functions to compose.
 * @returns {Function} A function obtained by composing the argument functions
 * from right to left. For example, compose(f, g, h) is identical to doing
 * (...args) => f(g(h(...args))).
 */

function isCrushed() {}

if ("dev" !== 'production' && typeof isCrushed.name === 'string' && isCrushed.name !== 'isCrushed') {
  warning('You are currently using minified code outside of NODE_ENV === \'production\'. ' + 'This means that you are running a slower development build of Redux. ' + 'You can use loose-envify (https://github.com/zertosh/loose-envify) for browserify ' + 'or DefinePlugin for webpack (http://stackoverflow.com/questions/30030031) ' + 'to ensure you have the correct code for your production build.');
}

var gridReducer = (grid = Grid()) => (state = {active: null, panels: [...grid]}, action) => {
  switch (action.type) {
    case 'START_RESIZE': {
      const {x, y}=action;
      return Object.assign({}, state, {active: {x, y}});
    }
    case 'RESIZE_OVER': {
      const {x, y} =action;
      const {active} = state;
      const {x:startX, y:startY} = active;
      if (x >= startX && y >= startY) {
        const dx = x - startX + 1;
        const dy = y - startY + 1;
        const activeArea = grid.area(startX, startY, dx, dy);
        const inactiveArea = activeArea.complement();
        const allButStart = grid.area(startX, startY).complement();
        const invalidCellsArea = [...allButStart]
          .map(p => grid.panel(p.x, p.y))
          .filter(p => {
            const intersection = p.intersection(activeArea);
            return intersection.length > 0 && activeArea.includes(p) === false;
          })
          .reduce((acc, current) => acc.union(current), grid.area(1, 1, 0, 0));

        for (let {x, y} of inactiveArea) {
          grid.updateAt(x, y, {adornerStatus: 0});
        }

        for (let {x, y} of activeArea) {
          grid.updateAt(x, y, {adornerStatus: 1});
        }

        for (let {x, y} of invalidCellsArea) {
          grid.updateAt(x, y, {adornerStatus: -1});
        }

        return Object.assign({}, state, {panels: [...grid]});
      } else {
        return state;
      }
    }
    case 'END_RESIZE': {
      const {x, y, startX, startY} =action;
      const dx = x - startX + 1;
      const dy = y - startY + 1;
      if (x >= startX && y >= startY) {
        const activeArea = grid.area(startX, startY, dx, dy);
        const allButStart = grid.area(startX, startY).complement();
        const invalidCellsArea = [...allButStart]
          .map(p => grid.panel(p.x, p.y))
          .filter(p => {
            const intersection = p.intersection(activeArea);
            return intersection.length > 0 && activeArea.includes(p) === false;
          })
          .reduce((acc, current) => acc.union(current), grid.area(1, 1, 0, 0));

        const [baseCell, ...otherCells] = activeArea;

        if (invalidCellsArea.length === 0) {
          grid.updateAt(startX, startY, {dx, dy});
          for (const {x, y} of otherCells) {
            grid.updateAt(x, y, {dx: 1, dy: 1});
          }
        }
      }

      for (let {x, y} of [...grid]) {
        grid.updateAt(x, y, {adornerStatus: 0});
      }

      return Object.assign({}, state, {
        panels: [...grid],
        active: null
      });
    }
    case 'UPDATE_PANEL_DATA': {
      //todo remove dataConf of hidden panels ?
      const {x, y, data} = action;
      grid.updateAt(x, y, {data});
      return Object.assign({}, state, {panels: [...grid]});
    }
    default:
      return state;
  }
};

var modalReducer = (grid) => (state = {isOpen: false}, action) => {
  const {type, title, modalType, x, y} = action;
  switch (type) {
    case 'OPEN_MODAL': {
      return Object.assign({}, state, {isOpen: true, title, modalType, x, y});
    }
    case 'CLOSE_MODAL': {
      return Object.assign({}, state, {isOpen: false, title:'', modalType:'none'});
    }
    default:
      return state;
  }
};

var smartListReducer = (state = [], action) => {
  const {type} = action;
  switch (type) {
    case 'CREATE_SMART_LIST': {
      const {x, y, tableState, items} = action;
      return state.concat({x, y, tableState, items});
    }
    case 'UPDATE_SMART_LIST': {
      const {x, y, tableState, items} = action;
      return state.map((sl) => {
        if (sl.x === x && sl.y === y) {
          return Object.assign({}, sl, {tableState, items});
        } else {
          return sl;
        }
      });
    }
    default:
      return state;
  }
};

var reducer = (grid) => (state = {}, action) => ({
  grid: gridReducer(grid)(state.grid, action),
  modal: modalReducer(grid)(state.modal, action),
  smartList: smartListReducer(state.smartList, action)
});

const actionCreator = actionName => opts => (Object.assign({type: actionName}, opts));

const resizeOver = actionCreator('RESIZE_OVER');
const endResize = actionCreator('END_RESIZE');
const startResize = actionCreator('START_RESIZE');
const openModal = actionCreator('OPEN_MODAL');
const closeModal = actionCreator('CLOSE_MODAL');
const updatePanelData = actionCreator('UPDATE_PANEL_DATA');
const updateSmartList = actionCreator('UPDATE_SMART_LIST');
const createSmartList = actionCreator('CREATE_SMART_LIST');
const bindActions = (store) => ( {
  resizeOver: (arg) => store.dispatch(resizeOver(arg)),
  endResize: (arg) => store.dispatch(endResize(arg)),
  startResize: (arg) => store.dispatch(startResize(arg)),
  openModal: (args) => store.dispatch(openModal(args)),
  closeModal: (args) => store.dispatch(closeModal(args)),
  updatePanelData: (args) => store.dispatch(updatePanelData(args)),
  updateSmartList: (args) => store.dispatch(updateSmartList(args)),
  createSmartList: (args) => store.dispatch(createSmartList(args))
});

/**
 * inject the grid instance and actions into a component as second and third arguments
 */
var gridify$1 = (grid, actions) => Comp => (props, ...args) => Comp(props, grid, actions, ...args);

function swap$1 (f) {
  return (a, b) => f(b, a);
}

function compose$2 (first, ...fns) {
  return (...args) => fns.reduce((previous, current) => current(previous), first(...args));
}

function curry$1 (fn, arityLeft) {
  const arity = arityLeft || fn.length;
  return (...args) => {
    const argLength = args.length || 1;
    if (arity === argLength) {
      return fn(...args);
    } else {
      const func = (...moreArgs) => fn(...args, ...moreArgs);
      return curry$1(func, arity - args.length);
    }
  };
}



function tap$1 (fn) {
  return arg => {
    fn(arg);
    return arg;
  }
}

function pointer (path) {

  const parts = path.split('.');

  function partial (obj = {}, parts = []) {
    const p = parts.shift();
    const current = obj[p];
    return (current === undefined || parts.length === 0) ?
      current : partial(current, parts);
  }

  function set (target, newTree) {
    let current = target;
    const [leaf, ...intermediate] = parts.reverse();
    for (let key of intermediate.reverse()) {
      if (current[key] === undefined) {
        current[key] = {};
        current = current[key];
      }
    }
    current[leaf] = Object.assign(current[leaf] || {}, newTree);
    return target;
  }

  return {
    get(target){
      return partial(target, [...parts])
    },
    set
  }
}

function sortByProperty (prop) {
  const propGetter = pointer(prop).get;
  return (a, b) => {
    const aVal = propGetter(a);
    const bVal = propGetter(b);

    if (aVal === bVal) {
      return 0;
    }

    if (bVal === undefined) {
      return -1;
    }

    if (aVal === undefined) {
      return 1;
    }

    return aVal < bVal ? -1 : 1;
  }
}

function sortFactory ({pointer: pointer$$1, direction} = {}) {
  if (!pointer$$1 || direction === 'none') {
    return array => [...array];
  }

  const orderFunc = sortByProperty(pointer$$1);
  const compareFunc = direction === 'desc' ? swap$1(orderFunc) : orderFunc;

  return (array) => [...array].sort(compareFunc);
}

function typeExpression (type) {
  switch (type) {
    case 'boolean':
      return Boolean;
    case 'number':
      return Number;
    case 'date':
      return (val) => new Date(val);
    default:
      return compose$2(String, (val) => val.toLowerCase());
  }
}

const operators = {
  includes(value){
    return (input) => input.includes(value);
  },
  is(value){
    return (input) => Object.is(value, input);
  },
  isNot(value){
    return (input) => !Object.is(value, input);
  },
  lt(value){
    return (input) => input < value;
  },
  gt(value){
    return (input) => input > value;
  },
  lte(value){
    return (input) => input <= value;
  },
  gte(value){
    return (input) => input >= value;
  },
  equals(value){
    return (input) => value == input;
  },
  notEquals(value){
    return (input) => value != input;
  }
};

const every = fns => (...args) => fns.every(fn => fn(...args));

function predicate ({value = '', operator = 'includes', type = 'string'}) {
  const typeIt = typeExpression(type);
  const operateOnTyped = compose$2(typeIt, operators[operator]);
  const predicateFunc = operateOnTyped(value);
  return compose$2(typeIt, predicateFunc);
}

//avoid useless filter lookup (improve perf)
function normalizeClauses (conf) {
  const output = {};
  const validPath = Object.keys(conf).filter(path => Array.isArray(conf[path]));
  validPath.forEach(path => {
    const validClauses = conf[path].filter(c => c.value !== '');
    if (validClauses.length) {
      output[path] = validClauses;
    }
  });
  return output;
}

function filter$1 (filter) {
  const normalizedClauses = normalizeClauses(filter);
  const funcList = Object.keys(normalizedClauses).map(path => {
    const getter = pointer(path).get;
    const clauses = normalizedClauses[path].map(predicate);
    return compose$2(getter, every(clauses));
  });
  const filterPredicate = every(funcList);

  return (array) => array.filter(filterPredicate);
}

var search$1 = function (searchConf = {}) {
  const {value, scope = []} = searchConf;
  const searchPointers = scope.map(field => pointer(field).get);
  if (!scope.length || !value) {
    return array => array;
  } else {
    return array => array.filter(item => searchPointers.some(p => String(p(item)).includes(String(value))))
  }
};

function sliceFactory ({page = 1, size} = {}) {
  return function sliceFunction (array = []) {
    const actualSize = size || array.length;
    const offset = (page - 1) * actualSize;
    return array.slice(offset, offset + actualSize);
  };
}

function emitter () {

  const listenersLists = {};
  const instance = {
    on(event, ...listeners){
      listenersLists[event] = (listenersLists[event] || []).concat(listeners);
      return instance;
    },
    dispatch(event, ...args){
      const listeners = listenersLists[event] || [];
      for (let listener of listeners) {
        listener(...args);
      }
      return instance;
    },
    off(event, ...listeners){
      if (!event) {
        Object.keys(listenersLists).forEach(ev => instance.off(ev));
      } else {
        const list = listenersLists[event] || [];
        listenersLists[event] = listeners.length ? list.filter(listener => !listeners.includes(listener)) : [];
      }
      return instance;
    }
  };
  return instance;
}

const TOGGLE_SORT = 'TOGGLE_SORT';
const DISPLAY_CHANGED = 'DISPLAY_CHANGED';
const PAGE_CHANGED = 'CHANGE_PAGE';
const EXEC_CHANGED = 'EXEC_CHANGED';
const FILTER_CHANGED = 'FILTER_CHANGED';
const SUMMARY_CHANGED = 'SUMMARY_CHANGED';
const SEARCH_CHANGED = 'SEARCH_CHANGED';
const EXEC_ERROR = 'EXEC_ERROR';

function curriedPointer (path) {
  const {get, set} = pointer(path);
  return {get, set: curry$1(set)};
}

var table$1 = function ({
  sortFactory,
  tableState,
  data,
  filterFactory,
  searchFactory
}) {
  const table = emitter();
  const sortPointer = curriedPointer('sort');
  const slicePointer = curriedPointer('slice');
  const filterPointer = curriedPointer('filter');
  const searchPointer = curriedPointer('search');

  const safeAssign = curry$1((base, extension) => Object.assign({}, base, extension));
  const dispatch = curry$1(table.dispatch.bind(table), 2);

  const dispatchSummary = (filtered) => {
    dispatch(SUMMARY_CHANGED, {
      page: tableState.slice.page,
      size: tableState.slice.size,
      filteredCount: filtered.length
    });
  };

  const exec = ({processingDelay = 20} = {}) => {
    table.dispatch(EXEC_CHANGED, {working: true});
    setTimeout(function () {
      try {
        const filterFunc = filterFactory(filterPointer.get(tableState));
        const searchFunc = searchFactory(searchPointer.get(tableState));
        const sortFunc = sortFactory(sortPointer.get(tableState));
        const sliceFunc = sliceFactory(slicePointer.get(tableState));
        const execFunc = compose$2(filterFunc, searchFunc, tap$1(dispatchSummary), sortFunc, sliceFunc);
        const displayed = execFunc(data);
        table.dispatch(DISPLAY_CHANGED, displayed.map(d => {
          return {index: data.indexOf(d), value: d};
        }));
      } catch (e) {
        table.dispatch(EXEC_ERROR, e);
      } finally {
        table.dispatch(EXEC_CHANGED, {working: false});
      }
    }, processingDelay);
  };

  const updateTableState = curry$1((pter, ev, newPartialState) => compose$2(
    safeAssign(pter.get(tableState)),
    tap$1(dispatch(ev)),
    pter.set(tableState)
  )(newPartialState));

  const resetToFirstPage = () => updateTableState(slicePointer, PAGE_CHANGED, {page: 1});

  const tableOperation = (pter, ev) => compose$2(
    updateTableState(pter, ev),
    resetToFirstPage,
    () => table.exec() // we wrap within a function so table.exec can be overwritten (when using with a server for example)
  );

  const api = {
    sort: tableOperation(sortPointer, TOGGLE_SORT),
    filter: tableOperation(filterPointer, FILTER_CHANGED),
    search: tableOperation(searchPointer, SEARCH_CHANGED),
    slice: compose$2(updateTableState(slicePointer, PAGE_CHANGED), () => table.exec()),
    exec,
    eval(state = tableState){
      return Promise.resolve()
        .then(function () {
          const sortFunc = sortFactory(sortPointer.get(state));
          const searchFunc = searchFactory(searchPointer.get(state));
          const filterFunc = filterFactory(filterPointer.get(state));
          const sliceFunc = sliceFactory(slicePointer.get(state));
          const execFunc = compose$2(filterFunc, searchFunc, sortFunc, sliceFunc);
          return execFunc(data).map(d => {
            return {index: data.indexOf(d), value: d}
          });
        });
    },
    onDisplayChange(fn){
      table.on(DISPLAY_CHANGED, fn);
    },
    getTableState(){
      const sort = Object.assign({}, tableState.sort);
      const search = Object.assign({}, tableState.search);
      const slice = Object.assign({}, tableState.slice);
      const filter = {};
      for (let prop in tableState.filter) {
        filter[prop] = tableState.filter[prop].map(v => Object.assign({}, v));
      }
      return {sort, search, slice, filter};
    }
  };

  const instance = Object.assign(table, api);

  Object.defineProperty(instance, 'length', {
    get(){
      return data.length;
    }
  });

  return instance;
};

var tableDirective = function ({
  sortFactory$$1 = sortFactory,
  filterFactory = filter$1,
  searchFactory = search$1,
  tableState = {sort: {}, slice: {page: 1}, filter: {}, search: {}},
  data = []
}, ...tableDirectives) {

  const coreTable = table$1({sortFactory: sortFactory$$1, filterFactory, tableState, data, searchFactory});

  return tableDirectives.reduce((accumulator, newdir) => {
    return Object.assign(accumulator, newdir({
      sortFactory: sortFactory$$1,
      filterFactory,
      searchFactory,
      tableState,
      data,
      table: coreTable
    }));
  }, coreTable);
};

const table = tableDirective;

var data = [
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/777",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/777/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/777/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/777/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/777",
    "id": 233120548,
    "number": 777,
    "title": "Adjustments for Angular 1.6",
    "user": {
      "login": "MrWook",
      "id": 20294042,
      "avatar_url": "https://avatars2.githubusercontent.com/u/20294042?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/MrWook",
      "html_url": "https://github.com/MrWook",
      "followers_url": "https://api.github.com/users/MrWook/followers",
      "following_url": "https://api.github.com/users/MrWook/following{/other_user}",
      "gists_url": "https://api.github.com/users/MrWook/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/MrWook/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/MrWook/subscriptions",
      "organizations_url": "https://api.github.com/users/MrWook/orgs",
      "repos_url": "https://api.github.com/users/MrWook/repos",
      "events_url": "https://api.github.com/users/MrWook/events{/privacy}",
      "received_events_url": "https://api.github.com/users/MrWook/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-06-02T09:05:06Z",
    "updated_at": "2017-06-06T15:04:42Z",
    "closed_at": null,
    "pull_request": {
      "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/pulls/777",
      "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/777",
      "diff_url": "https://github.com/lorenzofox3/Smart-Table/pull/777.diff",
      "patch_url": "https://github.com/lorenzofox3/Smart-Table/pull/777.patch"
    },
    "body": "Catch timeout promise on cancel because it will throw an error in Angular 1.6"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/775",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/775/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/775/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/775/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/775",
    "id": 232939024,
    "number": 775,
    "title": "How to sort when more than one single property value is given pro column ",
    "user": {
      "login": "bvahdat",
      "id": 3122177,
      "avatar_url": "https://avatars0.githubusercontent.com/u/3122177?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/bvahdat",
      "html_url": "https://github.com/bvahdat",
      "followers_url": "https://api.github.com/users/bvahdat/followers",
      "following_url": "https://api.github.com/users/bvahdat/following{/other_user}",
      "gists_url": "https://api.github.com/users/bvahdat/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/bvahdat/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/bvahdat/subscriptions",
      "organizations_url": "https://api.github.com/users/bvahdat/orgs",
      "repos_url": "https://api.github.com/users/bvahdat/repos",
      "events_url": "https://api.github.com/users/bvahdat/events{/privacy}",
      "received_events_url": "https://api.github.com/users/bvahdat/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-06-01T16:36:13Z",
    "updated_at": "2017-06-01T18:53:44Z",
    "closed_at": null,
    "body": "Using `angularjs 1.5.9` assume two given properties such as `foo` and `bar` being bound to a single column.\r\nIs there any way to instruct `st-sort` to either sort according to the `foo` or `bar` values. That's something along the following lines:\r\n\r\n```html\r\n<th st-sort=\"[firstName, lastName]\">first name <br /> last name</th>\r\n```"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/774",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/774/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/774/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/774/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/774",
    "id": 230118653,
    "number": 774,
    "title": "Smart Table paging is showing more pages than expected",
    "user": {
      "login": "mostafaasad",
      "id": 7625530,
      "avatar_url": "https://avatars3.githubusercontent.com/u/7625530?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/mostafaasad",
      "html_url": "https://github.com/mostafaasad",
      "followers_url": "https://api.github.com/users/mostafaasad/followers",
      "following_url": "https://api.github.com/users/mostafaasad/following{/other_user}",
      "gists_url": "https://api.github.com/users/mostafaasad/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/mostafaasad/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/mostafaasad/subscriptions",
      "organizations_url": "https://api.github.com/users/mostafaasad/orgs",
      "repos_url": "https://api.github.com/users/mostafaasad/repos",
      "events_url": "https://api.github.com/users/mostafaasad/events{/privacy}",
      "received_events_url": "https://api.github.com/users/mostafaasad/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [
      {
        "id": 225862423,
        "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/labels/not%20reproducible",
        "name": "not reproducible",
        "color": "eb6420",
        "default": false
      },
      {
        "id": 259438506,
        "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/labels/to%20be%20closed:%20does%20not%20follow%20guidelines",
        "name": "to be closed: does not follow guidelines",
        "color": "fbca04",
        "default": false
      }
    ],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 3,
    "created_at": "2017-05-20T00:41:41Z",
    "updated_at": "2017-05-22T18:39:51Z",
    "closed_at": null,
    "body": "I am using Smart table in angularjs application. In the pagination it is showing extra pages which don't have the data. How can I display the exact number of pages instead of extra pages?\r\n\r\nFor clarification, I have 94 records, 15 per page so there will be 7 pages , but the pagination is showing 10 pages, after 7th page there is no data in 8-10th pages.\r\nPlease suggest how can I resolve this.\r\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/773",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/773/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/773/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/773/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/773",
    "id": 227275900,
    "number": 773,
    "title": "Fix: Parse initial predicate correctly",
    "user": {
      "login": "g00fy-",
      "id": 843807,
      "avatar_url": "https://avatars0.githubusercontent.com/u/843807?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/g00fy-",
      "html_url": "https://github.com/g00fy-",
      "followers_url": "https://api.github.com/users/g00fy-/followers",
      "following_url": "https://api.github.com/users/g00fy-/following{/other_user}",
      "gists_url": "https://api.github.com/users/g00fy-/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/g00fy-/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/g00fy-/subscriptions",
      "organizations_url": "https://api.github.com/users/g00fy-/orgs",
      "repos_url": "https://api.github.com/users/g00fy-/repos",
      "events_url": "https://api.github.com/users/g00fy-/events{/privacy}",
      "received_events_url": "https://api.github.com/users/g00fy-/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-05-09T07:35:16Z",
    "updated_at": "2017-05-09T07:47:36Z",
    "closed_at": null,
    "pull_request": {
      "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/pulls/773",
      "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/773",
      "diff_url": "https://github.com/lorenzofox3/Smart-Table/pull/773.diff",
      "patch_url": "https://github.com/lorenzofox3/Smart-Table/pull/773.patch"
    },
    "body": "This bug caused other plugins not to work correctly.\r\nThe initial predicate wasn't parsed the same way it was parsed after click - which resulted in the arrows not pointing the right direction."
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/772",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/772/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/772/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/772/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/772",
    "id": 225422992,
    "number": 772,
    "title": "Refresh table with with out page load",
    "user": {
      "login": "smohammedyasin",
      "id": 25565142,
      "avatar_url": "https://avatars2.githubusercontent.com/u/25565142?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/smohammedyasin",
      "html_url": "https://github.com/smohammedyasin",
      "followers_url": "https://api.github.com/users/smohammedyasin/followers",
      "following_url": "https://api.github.com/users/smohammedyasin/following{/other_user}",
      "gists_url": "https://api.github.com/users/smohammedyasin/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/smohammedyasin/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/smohammedyasin/subscriptions",
      "organizations_url": "https://api.github.com/users/smohammedyasin/orgs",
      "repos_url": "https://api.github.com/users/smohammedyasin/repos",
      "events_url": "https://api.github.com/users/smohammedyasin/events{/privacy}",
      "received_events_url": "https://api.github.com/users/smohammedyasin/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-05-01T11:42:11Z",
    "updated_at": "2017-05-01T18:12:47Z",
    "closed_at": null,
    "body": "Hello,\r\n\r\nThis is not an issue,\r\n\r\nI want to know how to refresh table with out reload complete page. and i'm using http$ for CRUD\r\n\r\nplease give me any example which is using server side data.\r\n\r\nAppreciate for quick and best response."
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/771",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/771/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/771/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/771/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/771",
    "id": 225331786,
    "number": 771,
    "title": "Custom filters",
    "user": {
      "login": "richard-austin",
      "id": 14316466,
      "avatar_url": "https://avatars3.githubusercontent.com/u/14316466?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/richard-austin",
      "html_url": "https://github.com/richard-austin",
      "followers_url": "https://api.github.com/users/richard-austin/followers",
      "following_url": "https://api.github.com/users/richard-austin/following{/other_user}",
      "gists_url": "https://api.github.com/users/richard-austin/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/richard-austin/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/richard-austin/subscriptions",
      "organizations_url": "https://api.github.com/users/richard-austin/orgs",
      "repos_url": "https://api.github.com/users/richard-austin/repos",
      "events_url": "https://api.github.com/users/richard-austin/events{/privacy}",
      "received_events_url": "https://api.github.com/users/richard-austin/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2017-04-30T14:49:52Z",
    "updated_at": "2017-04-30T14:49:52Z",
    "closed_at": null,
    "pull_request": {
      "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/pulls/771",
      "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/771",
      "diff_url": "https://github.com/lorenzofox3/Smart-Table/pull/771.diff",
      "patch_url": "https://github.com/lorenzofox3/Smart-Table/pull/771.patch"
    },
    "body": ""
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/770",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/770/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/770/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/770/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/770",
    "id": 224161195,
    "number": 770,
    "title": "Filter with click of a button",
    "user": {
      "login": "Fossil01",
      "id": 8832687,
      "avatar_url": "https://avatars2.githubusercontent.com/u/8832687?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/Fossil01",
      "html_url": "https://github.com/Fossil01",
      "followers_url": "https://api.github.com/users/Fossil01/followers",
      "following_url": "https://api.github.com/users/Fossil01/following{/other_user}",
      "gists_url": "https://api.github.com/users/Fossil01/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/Fossil01/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/Fossil01/subscriptions",
      "organizations_url": "https://api.github.com/users/Fossil01/orgs",
      "repos_url": "https://api.github.com/users/Fossil01/repos",
      "events_url": "https://api.github.com/users/Fossil01/events{/privacy}",
      "received_events_url": "https://api.github.com/users/Fossil01/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-04-25T14:38:16Z",
    "updated_at": "2017-04-26T12:34:53Z",
    "closed_at": null,
    "body": "I would like to filter some table columns by the click of a button. Is this possible and if so, how?\r\n\r\nLets say I have a column USERS with 3 rows: John, John, William.\r\n\r\nNow I have a button:\r\n`<button ng-click=\"filter('John')\">John</button>`\r\nThis should make the table only show Users.John.\r\n\r\nThis button would preferably be placed outside of the table."
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/769",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/769/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/769/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/769/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/769",
    "id": 221752720,
    "number": 769,
    "title": "Sorting with asynchronously received data",
    "user": {
      "login": "blackhearted",
      "id": 4601717,
      "avatar_url": "https://avatars0.githubusercontent.com/u/4601717?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/blackhearted",
      "html_url": "https://github.com/blackhearted",
      "followers_url": "https://api.github.com/users/blackhearted/followers",
      "following_url": "https://api.github.com/users/blackhearted/following{/other_user}",
      "gists_url": "https://api.github.com/users/blackhearted/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/blackhearted/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/blackhearted/subscriptions",
      "organizations_url": "https://api.github.com/users/blackhearted/orgs",
      "repos_url": "https://api.github.com/users/blackhearted/repos",
      "events_url": "https://api.github.com/users/blackhearted/events{/privacy}",
      "received_events_url": "https://api.github.com/users/blackhearted/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-04-14T06:44:08Z",
    "updated_at": "2017-04-14T14:01:26Z",
    "closed_at": null,
    "body": "If data is received asynchronously and not available at the moment of table creation - table is sorted differently.\r\n\r\nData \"received\"\r\n$scope.displayed.push({\r\n        firstName: \"A1\",\r\n        balance: 300\r\n      });\r\n      $scope.displayed.push({\r\n        firstName: \"A2\",\r\n        balance: 200\r\n      });\r\n      $scope.displayed.push({\r\n        firstName: \"A3\",\r\n        balance: 100\r\n      });\r\n\r\nIf it is within $timeout table will look like. Note sorting icon on balance column is wrong:\r\nhttp://plnkr.co/edit/8B0Jy8bq1BDPdnU6bFGl?p=preview\r\nfirst name\tbalance\r\nA1\t                300\r\nA2\t                200\r\nA3\t                100\r\n\r\nIf it is synchronous:\r\nhttp://plnkr.co/edit/ruf2LunDF3pQUMXCD0Zz?p=preview\r\nfirst name\tbalance\r\nA3\t                100\r\nA2\t                200\r\nA1\t                300\r\n\r\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/754",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/754/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/754/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/754/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/754",
    "id": 211948963,
    "number": 754,
    "title": "allow implicit true attributes in stSort",
    "user": {
      "login": "dbeinder",
      "id": 342955,
      "avatar_url": "https://avatars2.githubusercontent.com/u/342955?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/dbeinder",
      "html_url": "https://github.com/dbeinder",
      "followers_url": "https://api.github.com/users/dbeinder/followers",
      "following_url": "https://api.github.com/users/dbeinder/following{/other_user}",
      "gists_url": "https://api.github.com/users/dbeinder/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/dbeinder/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/dbeinder/subscriptions",
      "organizations_url": "https://api.github.com/users/dbeinder/orgs",
      "repos_url": "https://api.github.com/users/dbeinder/repos",
      "events_url": "https://api.github.com/users/dbeinder/events{/privacy}",
      "received_events_url": "https://api.github.com/users/dbeinder/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2017-03-05T12:17:27Z",
    "updated_at": "2017-03-05T12:17:27Z",
    "closed_at": null,
    "pull_request": {
      "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/pulls/754",
      "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/754",
      "diff_url": "https://github.com/lorenzofox3/Smart-Table/pull/754.diff",
      "patch_url": "https://github.com/lorenzofox3/Smart-Table/pull/754.patch"
    },
    "body": "This would allow shorter attributes on the sort attributes, and defaults \"\" to true provided the attribute is defined.\r\n`<th st-sort=\"field\" st-descending-first=\"true\" />` to `<th st-sort=\"field\" st-descending-first />` \r\n`<th st-sort=\"field\" st-skip-natural=\"true\" />` to `<th st-sort=\"field\" st-skip-natural />` \r\n`<th st-sort=\"field\" st-sort-default=\"true\" />` to `<th st-sort=\"field\" st-sort-default />` "
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/753",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/753/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/753/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/753/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/753",
    "id": 211626834,
    "number": 753,
    "title": "Safe src watch collection",
    "user": {
      "login": "viandanteoscuro",
      "id": 4235079,
      "avatar_url": "https://avatars3.githubusercontent.com/u/4235079?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/viandanteoscuro",
      "html_url": "https://github.com/viandanteoscuro",
      "followers_url": "https://api.github.com/users/viandanteoscuro/followers",
      "following_url": "https://api.github.com/users/viandanteoscuro/following{/other_user}",
      "gists_url": "https://api.github.com/users/viandanteoscuro/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/viandanteoscuro/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/viandanteoscuro/subscriptions",
      "organizations_url": "https://api.github.com/users/viandanteoscuro/orgs",
      "repos_url": "https://api.github.com/users/viandanteoscuro/repos",
      "events_url": "https://api.github.com/users/viandanteoscuro/events{/privacy}",
      "received_events_url": "https://api.github.com/users/viandanteoscuro/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2017-03-03T08:39:49Z",
    "updated_at": "2017-03-03T08:40:13Z",
    "closed_at": null,
    "body": "Hi to all!\r\n\r\nI use the xeditable on each cell, every edit i emit a socket event that refresh elements in every user is  using the table.\r\n\r\nI have a problem with the st-safe-src attribute.\r\n\r\nI build the table with an object like this:\r\n\r\n```javascript\r\nrows = [\r\n  {\r\n     id: 456,\r\n     data: [\r\n       {\r\n          value: '',\r\n          name: ''\r\n        },\r\n        ....\r\n     ]\r\n  },\r\n  { ... }, \r\n  ...\r\n]\r\n```\r\n\r\nSo... in the ng-repeat of tr elements i need the id attribute of each row, but the td elements are those of the array 'data' of each row.\r\n\r\nWhen i edit a value, the socket event is emitted, but the collection on the other user is not refreshed... so, the values are not updated. But if i add a row, the table on the other users is refreshed... only the values in the cells are out of date.\r\n\r\nIf i don't use smart table all works fine, but i prefer the smart table.\r\n\r\nIn the code of smart table there is a watch, but i need a watchcollection, is it possible?\r\n\r\nHow?\r\n\r\nThanks\r\n\r\nMassimo"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/752",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/752/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/752/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/752/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/752",
    "id": 209949337,
    "number": 752,
    "title": "Update smart-table by WebSocket",
    "user": {
      "login": "HyperFly",
      "id": 8993705,
      "avatar_url": "https://avatars1.githubusercontent.com/u/8993705?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/HyperFly",
      "html_url": "https://github.com/HyperFly",
      "followers_url": "https://api.github.com/users/HyperFly/followers",
      "following_url": "https://api.github.com/users/HyperFly/following{/other_user}",
      "gists_url": "https://api.github.com/users/HyperFly/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/HyperFly/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/HyperFly/subscriptions",
      "organizations_url": "https://api.github.com/users/HyperFly/orgs",
      "repos_url": "https://api.github.com/users/HyperFly/repos",
      "events_url": "https://api.github.com/users/HyperFly/events{/privacy}",
      "received_events_url": "https://api.github.com/users/HyperFly/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 2,
    "created_at": "2017-02-24T03:17:49Z",
    "updated_at": "2017-02-24T10:47:26Z",
    "closed_at": null,
    "body": "There are 2 tabs in the container.\r\nEach tab has a smart-table in it.\r\n\r\n 1. User clicks on the tab.\r\n\r\n    \t$('a[data-toggle=\"tab\"]').on('shown.bs.tab', function (e) {\r\n\t\t\tvar target = $(e.target).attr(\"href\") // activated tab\r\n\t\t\tvar relatedTarget = $(e.relatedTarget).attr(\"href\")\r\n\t\t\tif (target == \"#tab1\") {\r\n\t\t\t\tScopes.get('tab1').get_records();\r\n\t\t\t} else if (target == \"#tab2\") {\r\n\t\t\t\tScopes.get('tab2').get_records();\r\n\t\t\t}\r\n\t\t})\r\n\r\n 2. Call server to get all record and display on the table.(only first time)\r\n\r\n    \t$scope.got_tab1_records = false;\r\n\t\t$scope.get_records = function () {\r\n\t\t\tif($scope.got_tab1_records) return;\r\n\t\t\tvar today = new Date().toJSON().slice(0,10);\r\n\t\t\tvar url = Flask.url_for('recorder.record_list', {info_type: 1, from_date: today, to_date: today});\r\n\t\t\t$http.get(url).success(\r\n\t\t\t\tfunction(data){\r\n\t\t\t\t\t$scope.tab1_records = data;\r\n\t\t\t\t\t$scope.safe_tab1_records = [].concat($scope.tab1_records);\r\n\t\t\t\t\t$scope.got_tab1_records = true;\r\n\t\t\t\t}\r\n\t\t\t).error(function(response){\r\n\t\t\t\talert(response);\r\n\t\t\t}).finally(function (){\r\n\t\t\t});\r\n\t\t}\r\n\r\n 3. If there is a new record, get the record from WebSocket.\r\n\r\n    \tvar url = \"ws://\" + window.location.href.replace(/https?:\\/\\//,'').replace(/\\/.*/,'') + \"/ws\";\r\n\t\tvar ws = new WebSocket(url);\r\n\t\tws.onerror = function (e) {\r\n\t\t\talert(e);\r\n\t\t\tconsole.log(\"WebSocket Error\" + e);\r\n\t\t\tconsole.log(e);\r\n\t\t}\r\n\t\tws.onclose = function () {\r\n\t\t\tdocument.getElementById(\"logo\").style.color = \"gray\";\r\n\t\t}\r\n\t\tws.onmessage = function (e) {\r\n\t\t\tvar obj = JSON.parse(e.data);\r\n\t\t\t$scope.append_record(obj.state, obj.record);\r\n\t\t}\r\n    \t$scope.append_record = function(info_type, record){\r\n        \tif (info_type == 1) {\r\n            \tScopes.get('tab1').unshift_record(record);\r\n        \t} else if (info_type == 2) {\r\n            \tScopes.get('tab2').safe_tab1_records.unshift(JSON.parse(record));\r\n        \t}\r\n    \t};\r\n\r\n 4. Unshift the record on the st-safe-src and refresh the table.\r\n\r\n     \t$scope.unshift_record = function (record) {\r\n\t\t\t$scope.safe_tab1_records.unshift(JSON.parse(record));\r\n\t\t};\t\r\n\r\nMy question is the step 4 did not refresh the table.\r\nOnly if I click on another tab then click on the original tab.\r\nBut, click on the button in the tab1 it will unshift a record and display on the first row of the table.\r\n\r\n    \t$scope.addRandomItem = function addRandomItem() {\r\n\t\t\t$scope.safe_tab1_records.unshift({_datetime:'2017-02-23', _device:'1'});\r\n\t\t};\r\n\r\nAlso, I have a question.\r\nWhy the st-pagesizelist=\"10,50,100,1000\" did not work ?\r\n\r\nI have [plunker][1] to show this problem. But I don't know how to simulate WebSocket.\r\n\r\n\r\nHtml:\r\n\r\n    <div id=\"right_container\" style=\"position: absolute; width: 38%; height: calc(100% - 107px); right: 0px;\">\r\n\t\t<ul class=\"nav nav-tabs\">\r\n\t\t\t<li class=\"active\"><a data-toggle=\"tab\" href=\"#tab1\">tab1</a></li>\r\n\t\t\t<li class=\"\"><a data-toggle=\"tab\" href=\"#tab2\">tab2</a></li>\r\n\t\t</ul>\r\n\t\t<div class=\"tab-content\">\r\n\t\t\t<div id=\"tab1\" class=\"tab-pane fade in active\" ng-controller=\"tab1\" style=\"position: absolute; width: 100%; height: calc(100% - 42px); top: 42px;\">\r\n\t\t\t\t<button type=\"button\" ng-click=\"addRandomItem(row)\" class=\"btn btn-sm btn-success\">\r\n\t\t\t\t\t<i class=\"glyphicon glyphicon-plus\">\r\n\t\t\t\t\t</i> Add random item\r\n\t\t\t\t</button>\r\n\t\t\t\t<table st-table=\"tab1_records\" st-safe-src=\"safe_tab1_records\" class=\"table table-striped\">\r\n\t\t\t\t\t<thead>\r\n\t\t\t\t\t<tr style=\"background-color: #2A66AB; color: white;\">\r\n\t\t\t\t\t\t<th>time</th>\r\n\t\t\t\t\t\t<th>device</th>\r\n\t\t\t\t\t</tr>\r\n\t\t\t\t\t<tr style=\"background-color: white;\">\r\n\t\t\t\t\t\t<th><input st-search=\"time\" class=\"form-control\" placeholder=\"time search ...\" type=\"text\" /></th>\r\n\t\t\t\t\t\t<th><input st-search=\"device\" class=\"form-control\" placeholder=\"device search ...\" type=\"text\" /></th>\r\n\t\t\t\t\t</tr>\r\n\t\t\t\t\t</thead>\r\n\t\t\t\t\t<tbody style=\"background-color: white;\">\r\n\t\t\t\t\t<tr ng-repeat=\"record in tab1_records\">\r\n\t\t\t\t\t\t<td>{$record._datetime$}</td>\r\n\t\t\t\t\t\t<td>{$record._device$}</td>\r\n\t\t\t\t\t</tr>\r\n\t\t\t\t\t</tbody>\r\n\t\t\t\t\t<tfoot>\r\n\t\t\t\t\t\t<tr>\r\n\t\t\t\t\t\t\t<td colspan=\"4\" class=\"text-center\">\r\n\t\t\t\t\t\t\t\t<div st-pagination=\"\" st-items-by-page=\"10\" st-displayed-pages=\"7\" st-pagesizelist=\"10,50,100,1000\"></div>\r\n\t\t\t\t\t\t\t</td>\r\n\t\t\t\t\t\t</tr>\r\n\t\t\t\t\t</tfoot>\r\n\t\t\t\t</table>\r\n\t\t\t</div>\r\n\t\t\t<div id=\"tab2\" class=\"tab-pane fade\" ng-controller=\"tab2\" style=\"position: absolute; width: 100%; height: calc(100% - 42px); top: 42px;\">\r\n\t\t\t\t<table st-table=\"tab2_records\" st-safe-src=\"safe_tab2_records\" class=\"table table-striped\">\r\n\t\t\t\t\t<thead>\r\n\t\t\t\t\t<tr style=\"background-color: #2A66AB; color: white;\">\r\n\t\t\t\t\t\t<th>time</th>\r\n\t\t\t\t\t\t<th>device</th>\r\n\t\t\t\t\t</tr>\r\n\t\t\t\t\t<tr style=\"background-color: white;\">\r\n\t\t\t\t\t\t<th><input st-search=\"time\" class=\"form-control\" placeholder=\"time search ...\" type=\"text\" /></th>\r\n\t\t\t\t\t\t<th><input st-search=\"device\" class=\"form-control\" placeholder=\"device search ...\" type=\"text\" /></th>\r\n\t\t\t\t\t</tr>\r\n\t\t\t\t\t</thead>\r\n\t\t\t\t\t<tbody style=\"background-color: white;\">\r\n\t\t\t\t\t<tr ng-repeat=\"record in tab2_records\">\r\n\t\t\t\t\t\t<td>{$record._datetime$}</td>\r\n\t\t\t\t\t\t<td>{$record._device$}</td>\r\n\t\t\t\t\t</tr>\r\n\t\t\t\t\t</tbody>\r\n\t\t\t\t\t<tfoot>\r\n\t\t\t\t\t\t<tr>\r\n\t\t\t\t\t\t\t<td colspan=\"4\" class=\"text-center\">\r\n\t\t\t\t\t\t\t\t<div st-pagination=\"\" st-items-by-page=\"10\" st-displayed-pages=\"7\" st-pagesizelist=\"10,50,100,1000\"></div>\r\n\t\t\t\t\t\t\t</td>\r\n\t\t\t\t\t\t</tr>\r\n\t\t\t\t\t</tfoot>\r\n\t\t\t\t</table>\r\n\t\t\t</div>\r\n\t\t</div>\r\n\t</div>\r\n\r\nJavascript:\r\n\r\n    <script src=\"/statics/scripts/angular.min.js\"></script>\r\n\t<script src=\"/statics/scripts/Smart-Table-2.1.8/smart-table.min.js\"></script>\r\n\t<script>\r\n\tvar app = angular.module('map', ['smart-table']);\r\n\tapp = angular.module('map').config(function ($httpProvider, $interpolateProvider) {\r\n\t\t$httpProvider.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';\r\n\t\t$interpolateProvider.startSymbol('{$');\r\n\t\t$interpolateProvider.endSymbol('$}');\r\n\t});\r\n\tapp.run(function ($rootScope) {\r\n\t\t$rootScope.$on('scope.stored', function (event, data) {\r\n\t\t\tconsole.log(\"scope.stored\", data);\r\n\t\t});\r\n\t});\r\n\tapp.controller('tab1', ['$scope', '$http', 'Scopes', function ($scope, $http, Scopes) {\r\n\t\tScopes.store('tab1', $scope);\r\n\t\t$scope.got_tab1_records = false;\r\n\t\t$scope.get_records = function () {\r\n\t\t\tif($scope.got_tab1_records) return;\r\n\t\t\tvar today = new Date().toJSON().slice(0,10);\r\n\t\t\tvar url = Flask.url_for('recorder.record_list', {info_type: 1, from_date: today, to_date: today});\r\n\t\t\t$http.get(url).success(\r\n\t\t\t\tfunction(data){\r\n\t\t\t\t\t$scope.tab1_records = data;\r\n\t\t\t\t\t$scope.safe_tab1_records = [].concat($scope.tab1_records);\r\n\t\t\t\t\t$scope.got_tab1_records = true;\r\n\t\t\t\t}\r\n\t\t\t).error(function(response){\r\n\t\t\t\talert(response);\r\n\t\t\t}).finally(function (){\r\n\t\t\t});\r\n\t\t}\r\n\t\t$scope.addRandomItem = function addRandomItem() {\r\n\t\t\t$scope.safe_tab1_records.unshift({_datetime:'2017-02-23', _device:'1'});\r\n\t\t};\r\n\t\t$scope.unshift_record = function (record) {\r\n\t\t\t$scope.safe_tab1_records.unshift({_datetime:'2017-02-23', _device:'2'});\r\n\t\t};\r\n\t\t$scope.get_records();\r\n\t}]);\r\n\tapp.controller('tab2', ['$scope', '$http', 'Scopes', function ($scope, $http, Scopes) {\r\n\t\tScopes.store('tab2', $scope);\r\n\t\t$scope.got_tab2_records = false;\r\n\t\t$scope.get_records = function () {\r\n\t\t\tif($scope.got_tab2_records) return;\r\n\t\t\tvar today = new Date().toJSON().slice(0,10);\r\n\t\t\tvar url = Flask.url_for('recorder.record_list', {info_type: 2, from_date: today, to_date: today});\r\n\t\t\t$http.get(url).success(\r\n\t\t\t\tfunction(data){\r\n\t\t\t\t\t$scope.tab2_records = data;\r\n\t\t\t\t\t$scope.safe_tab2_records = [].concat($scope.tab2_records);\r\n\t\t\t\t\t$scope.got_tab2_records = true;\r\n\t\t\t\t}\r\n\t\t\t).error(function(response){\r\n\t\t\t\talert(response);\r\n\t\t\t}).finally(function (){\r\n\t\t\t});\r\n\t\t};\r\n \t\t$scope.unshift_record = function (record) {\r\n\t\t\t$scope.safe_tab1_records.unshift(JSON.parse(record));\r\n\t\t};\r\n\t}]);\r\n\tapp.controller('preview', ['$scope', '$http', 'Scopes', function ($scope, $http, Scopes) {\r\n\t\t$('a[data-toggle=\"tab\"]').on('shown.bs.tab', function (e) {\r\n\t\t\tvar target = $(e.target).attr(\"href\") // activated tab\r\n\t\t\tvar relatedTarget = $(e.relatedTarget).attr(\"href\")\r\n\t\t\tif (target == \"#tab1\") {\r\n\t\t\t\tScopes.get('tab1').get_records();\r\n\t\t\t} else if (target == \"#tab2\") {\r\n\t\t\t\tScopes.get('tab2').get_records();\r\n\t\t\t}\r\n\t\t})\r\n\t\t$scope.append_record = function(info_type, record){\r\n\t\t\tif (info_type == 1) {\r\n\t\t\t\tScopes.get('tab1').unshift_record(record);\r\n\t\t\t} else if (info_type == 2) {\r\n\t\t\t\tScopes.get('tab2').safe_tab1_records.unshift(JSON.parse(record));\r\n\t\t\t}\r\n\t\t};\r\n\t\tvar url = \"ws://\" + window.location.href.replace(/https?:\\/\\//,'').replace(/\\/.*/,'') + \"/ws\";\r\n\t\tvar ws = new WebSocket(url);\r\n\t\tws.onerror = function (e) {\r\n\t\t\talert(e);\r\n\t\t\tconsole.log(\"WebSocket Error\" + e);\r\n\t\t\tconsole.log(e);\r\n\t\t}\r\n\t\tws.onclose = function () {\r\n\t\t\tdocument.getElementById(\"logo\").style.color = \"gray\";\r\n\t\t}\r\n\t\tws.onmessage = function (e) {\r\n\t\t\tvar obj = JSON.parse(e.data);\r\n\t\t\t$scope.append_record(obj.state, obj.record);\r\n\t\t}\r\n\t}]);\r\n\t\r\n\tapp.factory('Scopes', function ($rootScope) {\r\n\t\tvar mem = {};\r\n\t\treturn {\r\n\t\t\tstore: function (key, value) {\r\n\t\t\t\t$rootScope.$emit('scope.stored', key);\r\n\t\t\t\tmem[key] = value;\r\n\t\t\t},\r\n\t\t\tget: function (key) {\r\n\t\t\t\treturn mem[key];\r\n\t\t\t}\r\n\t\t};\r\n\t});\r\n\t</script>\r\n\r\n\r\n  [1]: http://plnkr.co/edit/wlyuHVUQHNm2RcVNGYJk?p=preview"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/748",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/748/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/748/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/748/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/748",
    "id": 207450111,
    "number": 748,
    "title": "st-persist example is not working with st-pipe",
    "user": {
      "login": "johnico",
      "id": 19564592,
      "avatar_url": "https://avatars2.githubusercontent.com/u/19564592?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/johnico",
      "html_url": "https://github.com/johnico",
      "followers_url": "https://api.github.com/users/johnico/followers",
      "following_url": "https://api.github.com/users/johnico/following{/other_user}",
      "gists_url": "https://api.github.com/users/johnico/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/johnico/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/johnico/subscriptions",
      "organizations_url": "https://api.github.com/users/johnico/orgs",
      "repos_url": "https://api.github.com/users/johnico/repos",
      "events_url": "https://api.github.com/users/johnico/events{/privacy}",
      "received_events_url": "https://api.github.com/users/johnico/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [
      {
        "id": 225862423,
        "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/labels/not%20reproducible",
        "name": "not reproducible",
        "color": "eb6420",
        "default": false
      },
      {
        "id": 259438506,
        "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/labels/to%20be%20closed:%20does%20not%20follow%20guidelines",
        "name": "to be closed: does not follow guidelines",
        "color": "fbca04",
        "default": false
      }
    ],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-02-14T08:38:54Z",
    "updated_at": "2017-02-14T13:11:57Z",
    "closed_at": null,
    "body": "Hi . this example is not working at all with server pagination \r\nhttp://plnkr.co/edit/ekwiNt?p=preview\r\n\r\nit saved only the data of first page and default sort in local storage and did not update the table\r\n\r\nmy pipe function :\r\n\r\n\r\n`    this.callServer = function callServer(tableState) {\r\n\r\n        vm.isLoading = true;\r\n        var pagination = tableState.pagination;\r\n        var start = pagination.start || 0;  \r\n        var number = pagination.number || 10\r\n\r\n        vm.submit = function (){\r\n            vm.isLoading = true;\r\n\r\n            $scope.filtersForm.$setPristine();\r\n            serverCall(0, 10, tableState,searchObj);\r\n            tableState.pagination.start = 0;\r\n        }\r\n        serverCall(start, number, tableState,searchObj);\r\n\r\n      };\r\n`"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/747",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/747/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/747/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/747/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/747",
    "id": 205849141,
    "number": 747,
    "title": "Issue #727 st-pipe not working with st-safe-src",
    "user": {
      "login": "AlexNG",
      "id": 822810,
      "avatar_url": "https://avatars1.githubusercontent.com/u/822810?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/AlexNG",
      "html_url": "https://github.com/AlexNG",
      "followers_url": "https://api.github.com/users/AlexNG/followers",
      "following_url": "https://api.github.com/users/AlexNG/following{/other_user}",
      "gists_url": "https://api.github.com/users/AlexNG/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/AlexNG/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/AlexNG/subscriptions",
      "organizations_url": "https://api.github.com/users/AlexNG/orgs",
      "repos_url": "https://api.github.com/users/AlexNG/repos",
      "events_url": "https://api.github.com/users/AlexNG/events{/privacy}",
      "received_events_url": "https://api.github.com/users/AlexNG/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2017-02-07T10:40:58Z",
    "updated_at": "2017-02-07T11:08:12Z",
    "closed_at": null,
    "pull_request": {
      "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/pulls/747",
      "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/747",
      "diff_url": "https://github.com/lorenzofox3/Smart-Table/pull/747.diff",
      "patch_url": "https://github.com/lorenzofox3/Smart-Table/pull/747.patch"
    },
    "body": "- optional ability to pipe on safecopy change using existing pipeAfterSafeCopy flag using unpreventPipeOnWatch"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/744",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/744/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/744/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/744/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/744",
    "id": 204111070,
    "number": 744,
    "title": "st-sort with function returning a promise",
    "user": {
      "login": "skidvd",
      "id": 5832513,
      "avatar_url": "https://avatars0.githubusercontent.com/u/5832513?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/skidvd",
      "html_url": "https://github.com/skidvd",
      "followers_url": "https://api.github.com/users/skidvd/followers",
      "following_url": "https://api.github.com/users/skidvd/following{/other_user}",
      "gists_url": "https://api.github.com/users/skidvd/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/skidvd/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/skidvd/subscriptions",
      "organizations_url": "https://api.github.com/users/skidvd/orgs",
      "repos_url": "https://api.github.com/users/skidvd/repos",
      "events_url": "https://api.github.com/users/skidvd/events{/privacy}",
      "received_events_url": "https://api.github.com/users/skidvd/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 2,
    "created_at": "2017-01-30T19:48:49Z",
    "updated_at": "2017-02-01T12:51:02Z",
    "closed_at": null,
    "body": "Hi,\r\n\r\nI am using angular v1.5.9 and smart-table v2.1.0.  I have searched for answers to my question below, but have not been able to find any that address the specific promise/async attributes of it - apologies if this has been addressed somewhere and/or is a duplicate - if so, kindly please refer me there.\r\n\r\nI have been using both st-table=\"displayedItems\" and st-safe-src=\"items\" directives in combination with st-sort.  This combination successfully and reliably works for nearly all conditions I have run across.  This includes scenarios where the st-sort is function based.  However, I recently encountered an need to have a function based st-sort that returns a promise instead of the value directly (i.e. the function will asynchronously resolve the value, at a slightly later time - when it becomes available).\r\n\r\nMy question is, should the st-sort be expected to produce a predictable ordering of the rows in that case?  If so, it does not appear to be.  I am theorizing that this may be do to the fact that the associated values are not available to the sort algorithm all up front - but rather straggle in in an unpredictable order and time frame.  By the way, no errors or other indications are returned that a problem may exist.  Should I expect this to work, or is this a known limitation?  Are there additional items that can be done to make it work on my part or otherwise - if so, I'd greatly appreciate any tips or thoughts you may have?\r\n\r\nTIA!"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/742",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/742/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/742/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/742/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/742",
    "id": 200829550,
    "number": 742,
    "title": "st-sort-default overwrites st-persist state",
    "user": {
      "login": "angustus",
      "id": 9137810,
      "avatar_url": "https://avatars1.githubusercontent.com/u/9137810?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/angustus",
      "html_url": "https://github.com/angustus",
      "followers_url": "https://api.github.com/users/angustus/followers",
      "following_url": "https://api.github.com/users/angustus/following{/other_user}",
      "gists_url": "https://api.github.com/users/angustus/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/angustus/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/angustus/subscriptions",
      "organizations_url": "https://api.github.com/users/angustus/orgs",
      "repos_url": "https://api.github.com/users/angustus/repos",
      "events_url": "https://api.github.com/users/angustus/events{/privacy}",
      "received_events_url": "https://api.github.com/users/angustus/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2017-01-14T21:03:13Z",
    "updated_at": "2017-01-14T21:03:13Z",
    "closed_at": null,
    "body": "**Working example:**\r\nhttp://plnkr.co/edit/UI5r9r?p=preview\r\nIt's a fork of the `st-persist` example; I've added `st-sort-default` field and updated `smart-table` to `v2.1.8` (master as of now).\r\n\r\n**Reproduction:**\r\n1. Use pagination and sort by any column.\r\n2. refresh preview\r\n\r\n**Result:**\r\nThe persisted state is applied before the default sort order is applied.\r\n**Expected:**\r\nPersisted state should be applied last thus overwriting default state order."
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/741",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/741/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/741/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/741/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/741",
    "id": 200642418,
    "number": 741,
    "title": "Is there are a way for a strict search in custom directive? ",
    "user": {
      "login": "kyrodabase",
      "id": 25103243,
      "avatar_url": "https://avatars0.githubusercontent.com/u/25103243?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/kyrodabase",
      "html_url": "https://github.com/kyrodabase",
      "followers_url": "https://api.github.com/users/kyrodabase/followers",
      "following_url": "https://api.github.com/users/kyrodabase/following{/other_user}",
      "gists_url": "https://api.github.com/users/kyrodabase/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/kyrodabase/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/kyrodabase/subscriptions",
      "organizations_url": "https://api.github.com/users/kyrodabase/orgs",
      "repos_url": "https://api.github.com/users/kyrodabase/repos",
      "events_url": "https://api.github.com/users/kyrodabase/events{/privacy}",
      "received_events_url": "https://api.github.com/users/kyrodabase/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [
      {
        "id": 35529859,
        "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/labels/enhancement",
        "name": "enhancement",
        "color": "84b6eb",
        "default": true
      }
    ],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 6,
    "created_at": "2017-01-13T14:27:02Z",
    "updated_at": "2017-01-19T09:01:17Z",
    "closed_at": null,
    "body": "Hi,\r\n\r\nGreat lib! :)\r\n\r\nIs there are a way to match the exact search term instead of a substring?\r\nCurrently if I search for ID = 4, the search function returns ID = 4 and ID = 4000, ID = 4001 etc.\r\nHere is a code snippet: \r\n\r\n` .directive(\"customWatchFilters\", function () {\r\n\r\n    return {\r\n      restrict: \"A\",\r\n      require: \"^stTable\",\r\n      link: function (scope, element, attrs, ctrl) {\r\n      \tscope.$watchCollection(attrs.customWatchFilters, function (filters) {\r\n\r\n          ctrl.tableState().search.predicateObject = {};\r\n\r\n          angular.forEach(filters, function (val, filter) {\r\n            if (angular.isUndefined(val) || val === null) {\r\n              return;\r\n            }\r\n\t\t\r\n            ctrl.search(val.toString(), filter);\r\n          });\r\n\r\n          ctrl.pipe();\r\n\r\n        });\r\n      }\r\n    };\r\n  });`\r\n\r\nPlease advise"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/739",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/739/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/739/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/739/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/739",
    "id": 199296808,
    "number": 739,
    "title": "How can I select page and sort manually with server side pagination ?",
    "user": {
      "login": "johnico",
      "id": 19564592,
      "avatar_url": "https://avatars2.githubusercontent.com/u/19564592?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/johnico",
      "html_url": "https://github.com/johnico",
      "followers_url": "https://api.github.com/users/johnico/followers",
      "following_url": "https://api.github.com/users/johnico/following{/other_user}",
      "gists_url": "https://api.github.com/users/johnico/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/johnico/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/johnico/subscriptions",
      "organizations_url": "https://api.github.com/users/johnico/orgs",
      "repos_url": "https://api.github.com/users/johnico/repos",
      "events_url": "https://api.github.com/users/johnico/events{/privacy}",
      "received_events_url": "https://api.github.com/users/johnico/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2017-01-06T21:44:39Z",
    "updated_at": "2017-01-10T07:14:52Z",
    "closed_at": null,
    "body": "Hi . im using smart table with pagination in server side.\r\nI am keep the sorting and pagination details in local storage or url ,\r\nmy question is how can I keep the page when the user was and when he will come back with the specific url or just back to the page he will get the same page he was.?\r\nthe same issue is with Sorting,  How can I sorting by url parameter\r\nhow can I do that,   ?\r\n\r\n\r\nthx for the help"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/738",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/738/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/738/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/738/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/738",
    "id": 197497382,
    "number": 738,
    "title": "Can't load http content from plunker when opening tutorial site via https",
    "user": {
      "login": "anatoly314",
      "id": 1641594,
      "avatar_url": "https://avatars2.githubusercontent.com/u/1641594?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/anatoly314",
      "html_url": "https://github.com/anatoly314",
      "followers_url": "https://api.github.com/users/anatoly314/followers",
      "following_url": "https://api.github.com/users/anatoly314/following{/other_user}",
      "gists_url": "https://api.github.com/users/anatoly314/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/anatoly314/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/anatoly314/subscriptions",
      "organizations_url": "https://api.github.com/users/anatoly314/orgs",
      "repos_url": "https://api.github.com/users/anatoly314/repos",
      "events_url": "https://api.github.com/users/anatoly314/events{/privacy}",
      "received_events_url": "https://api.github.com/users/anatoly314/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2016-12-25T11:31:32Z",
    "updated_at": "2016-12-25T11:31:32Z",
    "closed_at": null,
    "body": "When I open the following website: https://lorenzofox3.github.io/smart-table-website/ some content not loading but throwing exception in a javascript console:\r\n\r\n> Mixed Content: The page at 'https://lorenzofox3.github.io/smart-table-website/' was loaded over HTTPS, but requested an insecure resource 'http://embed.plnkr.co/SOcUk1'. This request has been blocked; the content must be served over HTTPS.\r\n\r\nTo fix this all http://example.com links should be changed to //example.com"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/737",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/737/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/737/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/737/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/737",
    "id": 196461736,
    "number": 737,
    "title": "Possible issue with reinitialising the scope.pages collection in redraw function",
    "user": {
      "login": "sannyjacobsson",
      "id": 11787831,
      "avatar_url": "https://avatars1.githubusercontent.com/u/11787831?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/sannyjacobsson",
      "html_url": "https://github.com/sannyjacobsson",
      "followers_url": "https://api.github.com/users/sannyjacobsson/followers",
      "following_url": "https://api.github.com/users/sannyjacobsson/following{/other_user}",
      "gists_url": "https://api.github.com/users/sannyjacobsson/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/sannyjacobsson/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/sannyjacobsson/subscriptions",
      "organizations_url": "https://api.github.com/users/sannyjacobsson/orgs",
      "repos_url": "https://api.github.com/users/sannyjacobsson/repos",
      "events_url": "https://api.github.com/users/sannyjacobsson/events{/privacy}",
      "received_events_url": "https://api.github.com/users/sannyjacobsson/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2016-12-19T16:41:11Z",
    "updated_at": "2016-12-20T10:04:00Z",
    "closed_at": null,
    "body": "Angular version: 1.5.8\r\nSmart table version: 2.1.8\r\n\r\nhttps://github.com/lorenzofox3/Smart-Table/blob/master/src/stPagination.js\r\n<pre>\r\nng.module('smart-table')\r\n  .directive('stPagination', ['stConfig', function (stConfig) {\r\n....\r\n        function redraw () {\r\n....\r\n          scope.pages = [];\r\n....\r\n</pre>\r\n\r\nWhen updating the <code>st-items-by-page</code> value a <code>redraw()</code> is triggered. In the case the new value is the length of the items in the backing collection <code></code> the <code>scope.pages</code> collection is reinitialised. \r\n\r\nIt seems to me that we are loosing our referens to the <code>scope.pages</code> collection in the pagination.html template. See https://github.com/lorenzofox3/Smart-Table/blob/master/dist/smart-table.js \r\n<pre>\r\nng.module('smart-table', []).run(['$templateCache', function ($templateCache) {\r\n    $templateCache.put('template/smart-table/pagination.html',\r\n.....</pre>\r\n\r\nIf we instead of reinitialising the code>scope.pages</code> collection in the <code>redraw()</code> function we set the length to zero <code>scope.pages.length = 0;</code> we will maintain our references. When changing the value from the length of the backing collection to some other value the pagination will work. \r\n\r\nI discovered the issue when adding a \"view all\" option for a smart table. I tried with -1 to show all, however that caused ctrl.tableState().pagination.numberOfPages to become negative with all kinds of side effects.\r\n\r\nI'm new to JavaScript and AngularJS so I may very well have missunderstod the issue.  "
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/736",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/736/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/736/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/736/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/736",
    "id": 195207733,
    "number": 736,
    "title": "Smart Table pagging refreshing Issue",
    "user": {
      "login": "hemrajrav",
      "id": 23396834,
      "avatar_url": "https://avatars3.githubusercontent.com/u/23396834?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/hemrajrav",
      "html_url": "https://github.com/hemrajrav",
      "followers_url": "https://api.github.com/users/hemrajrav/followers",
      "following_url": "https://api.github.com/users/hemrajrav/following{/other_user}",
      "gists_url": "https://api.github.com/users/hemrajrav/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/hemrajrav/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/hemrajrav/subscriptions",
      "organizations_url": "https://api.github.com/users/hemrajrav/orgs",
      "repos_url": "https://api.github.com/users/hemrajrav/repos",
      "events_url": "https://api.github.com/users/hemrajrav/events{/privacy}",
      "received_events_url": "https://api.github.com/users/hemrajrav/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2016-12-13T09:55:59Z",
    "updated_at": "2016-12-15T10:29:07Z",
    "closed_at": null,
    "body": "Hi,\r\nhow can i control page refreshing in smart table on refill inside angular controller when any action perform.\r\nfor exa : - I am on page no 6 and i claim an order then control comes on first page when refill smart table.\r\nso how can be control this refresh...please provide me solution immediately.\r\n\r\nThanks in advance\r\nHemraj Rav\r\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/735",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/735/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/735/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/735/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/735",
    "id": 195085675,
    "number": 735,
    "title": "property with \"-\" dash doesnt work in search? Or I am doing something wrong with stSearch",
    "user": {
      "login": "ginamdar",
      "id": 845379,
      "avatar_url": "https://avatars0.githubusercontent.com/u/845379?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/ginamdar",
      "html_url": "https://github.com/ginamdar",
      "followers_url": "https://api.github.com/users/ginamdar/followers",
      "following_url": "https://api.github.com/users/ginamdar/following{/other_user}",
      "gists_url": "https://api.github.com/users/ginamdar/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/ginamdar/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/ginamdar/subscriptions",
      "organizations_url": "https://api.github.com/users/ginamdar/orgs",
      "repos_url": "https://api.github.com/users/ginamdar/repos",
      "events_url": "https://api.github.com/users/ginamdar/events{/privacy}",
      "received_events_url": "https://api.github.com/users/ginamdar/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 4,
    "created_at": "2016-12-12T21:06:48Z",
    "updated_at": "2016-12-15T07:03:24Z",
    "closed_at": null,
    "body": "I have json object as   \r\n```[{\"task-id\":52,\"task-priority\":1,\"task-name\":\"Modify Province\",\"task-description\":\"\",\"task-status\":\"InProgress\"},...]  ```\r\nand in html im rendering its as\r\n```\r\n<div class=\"widget-body\" st-table=\"displayWorklist\" st-safe-src=\"worklist\"  >\r\n<table class=\"table table-bordered table-striped table-condensed\">\r\n<thead>..</thead>\r\n<tbody>\r\n<tr ng-repeat=\"row in displayWorklist\">\r\n   <td class=\"text-center\" >\r\n   {{ row['task-id'] }}\r\n  </td>\r\n</table> ```  \r\n\r\nEverything works fine, now when im trying to filter based on predicate as  \r\n<th>\r\n   <input st-search=\"'task-id'\" placeholder=\"search for taskId\"\r\n  class=\"input-sm form-control\" type=\"search\"/>\r\n  </th>  \r\n```  \r\nI get angular.js:10150 TypeError: $parse(...).assign is not a function\r\n\r\n\"angular\": \"~1.2\",\r\nangular-smart-table: \"^2.1.8\",\r\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/734",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/734/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/734/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/734/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/734",
    "id": 192842900,
    "number": 734,
    "title": "st-pipe with default-sort-column causes double xhr request when initializing table.",
    "user": {
      "login": "wzoet",
      "id": 2481982,
      "avatar_url": "https://avatars3.githubusercontent.com/u/2481982?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/wzoet",
      "html_url": "https://github.com/wzoet",
      "followers_url": "https://api.github.com/users/wzoet/followers",
      "following_url": "https://api.github.com/users/wzoet/following{/other_user}",
      "gists_url": "https://api.github.com/users/wzoet/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/wzoet/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/wzoet/subscriptions",
      "organizations_url": "https://api.github.com/users/wzoet/orgs",
      "repos_url": "https://api.github.com/users/wzoet/repos",
      "events_url": "https://api.github.com/users/wzoet/events{/privacy}",
      "received_events_url": "https://api.github.com/users/wzoet/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2016-12-01T13:11:53Z",
    "updated_at": "2016-12-12T12:09:42Z",
    "closed_at": null,
    "body": "Hi,\r\n\r\nWe are working with your plugin which is really awesome. \r\nWe just found that when having a default-sort field set to true, the pipe is called twice, causing data be loaded twice upon initializing of the page. \r\n\r\nIt is totally not a showstopper, but I guess it isn't very efficient as well.\r\n\r\nWe use angular ˆ1.5.8 and angular-smart-table ˆ2.1.8.\r\n\r\nThanks for your effort in this plugin!"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/733",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/733/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/733/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/733/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/733",
    "id": 192132950,
    "number": 733,
    "title": "Extend selection with shift-click",
    "user": {
      "login": "Rhobal",
      "id": 14913297,
      "avatar_url": "https://avatars1.githubusercontent.com/u/14913297?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/Rhobal",
      "html_url": "https://github.com/Rhobal",
      "followers_url": "https://api.github.com/users/Rhobal/followers",
      "following_url": "https://api.github.com/users/Rhobal/following{/other_user}",
      "gists_url": "https://api.github.com/users/Rhobal/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/Rhobal/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/Rhobal/subscriptions",
      "organizations_url": "https://api.github.com/users/Rhobal/orgs",
      "repos_url": "https://api.github.com/users/Rhobal/repos",
      "events_url": "https://api.github.com/users/Rhobal/events{/privacy}",
      "received_events_url": "https://api.github.com/users/Rhobal/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2016-11-28T22:19:53Z",
    "updated_at": "2016-11-28T22:19:53Z",
    "closed_at": null,
    "pull_request": {
      "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/pulls/733",
      "html_url": "https://github.com/lorenzofox3/Smart-Table/pull/733",
      "diff_url": "https://github.com/lorenzofox3/Smart-Table/pull/733.diff",
      "patch_url": "https://github.com/lorenzofox3/Smart-Table/pull/733.patch"
    },
    "body": "Selection can be extended with shift-click.\r\n\r\nExtension means that the state of the last row that was selected is extended through to the currently\r\nselected row, so all rows in between will either be selected or deselected. If there was no previously\r\nselected row, shift-click will just select the current row.\r\n\r\nTo get to a defined state on paging / filtering / sorting, selections are cleared when entering pipe() if there were any. Otherwise, there could remain selected objects that are not visible."
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/728",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/728/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/728/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/728/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/728",
    "id": 186264848,
    "number": 728,
    "title": "get onclick pagination in controller",
    "user": {
      "login": "doni111",
      "id": 22817277,
      "avatar_url": "https://avatars2.githubusercontent.com/u/22817277?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/doni111",
      "html_url": "https://github.com/doni111",
      "followers_url": "https://api.github.com/users/doni111/followers",
      "following_url": "https://api.github.com/users/doni111/following{/other_user}",
      "gists_url": "https://api.github.com/users/doni111/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/doni111/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/doni111/subscriptions",
      "organizations_url": "https://api.github.com/users/doni111/orgs",
      "repos_url": "https://api.github.com/users/doni111/repos",
      "events_url": "https://api.github.com/users/doni111/events{/privacy}",
      "received_events_url": "https://api.github.com/users/doni111/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2016-10-31T11:48:20Z",
    "updated_at": "2016-10-31T18:21:27Z",
    "closed_at": null,
    "body": "I need to detect the current pagination by the controller on the onclick pagination.\r\nIs there any way to do it?\r\n\r\nThank you"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/727",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/727/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/727/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/727/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/727",
    "id": 184168083,
    "number": 727,
    "title": "st-pipe not working with st-safe-src",
    "user": {
      "login": "daniele-bottelli",
      "id": 8760353,
      "avatar_url": "https://avatars0.githubusercontent.com/u/8760353?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/daniele-bottelli",
      "html_url": "https://github.com/daniele-bottelli",
      "followers_url": "https://api.github.com/users/daniele-bottelli/followers",
      "following_url": "https://api.github.com/users/daniele-bottelli/following{/other_user}",
      "gists_url": "https://api.github.com/users/daniele-bottelli/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/daniele-bottelli/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/daniele-bottelli/subscriptions",
      "organizations_url": "https://api.github.com/users/daniele-bottelli/orgs",
      "repos_url": "https://api.github.com/users/daniele-bottelli/repos",
      "events_url": "https://api.github.com/users/daniele-bottelli/events{/privacy}",
      "received_events_url": "https://api.github.com/users/daniele-bottelli/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 4,
    "created_at": "2016-10-20T08:42:13Z",
    "updated_at": "2017-02-08T16:14:30Z",
    "closed_at": null,
    "body": "Hi there!\nI have a problem using smart table using st-safe-src and st-pipe together.\nAs long as I'm using st-table and st-safe-src directives, I can see all the items in the table.\nAs long as I'm using st-table and st-pipe directives, I can see all the items in the table.\nBUT using st-table, st-safe-src and st-pipe directives, no item is shown in the table.\n\nI tried the solution shown in issue #242 but it didn't work.\nIn issue #238 joshijimit had my same problem but the solution was: discard st-safe-src. For me it's not possible because I need to filter my table.\n\nYou can find my example code here:\nhttp://plnkr.co/edit/NqD47Q?p=preview\n\nThanks :)\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/725",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/725/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/725/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/725/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/725",
    "id": 183773850,
    "number": 725,
    "title": "Go to specific page after custom filter",
    "user": {
      "login": "aalarcong",
      "id": 19558587,
      "avatar_url": "https://avatars1.githubusercontent.com/u/19558587?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/aalarcong",
      "html_url": "https://github.com/aalarcong",
      "followers_url": "https://api.github.com/users/aalarcong/followers",
      "following_url": "https://api.github.com/users/aalarcong/following{/other_user}",
      "gists_url": "https://api.github.com/users/aalarcong/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/aalarcong/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/aalarcong/subscriptions",
      "organizations_url": "https://api.github.com/users/aalarcong/orgs",
      "repos_url": "https://api.github.com/users/aalarcong/repos",
      "events_url": "https://api.github.com/users/aalarcong/events{/privacy}",
      "received_events_url": "https://api.github.com/users/aalarcong/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [
      {
        "id": 225862423,
        "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/labels/not%20reproducible",
        "name": "not reproducible",
        "color": "eb6420",
        "default": false
      },
      {
        "id": 259438506,
        "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/labels/to%20be%20closed:%20does%20not%20follow%20guidelines",
        "name": "to be closed: does not follow guidelines",
        "color": "fbca04",
        "default": false
      }
    ],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 1,
    "created_at": "2016-10-18T18:59:38Z",
    "updated_at": "2016-10-30T21:57:44Z",
    "closed_at": null,
    "body": "Hi.\n\nI'm using the smart table with an api and also include a custom filter directive so i can filter by different columns and is working ok. When i click on a row i go to another page to see more information, in this new page theres a \"go back\" button , so i store the table collection on a service so when i \"go back\" i resume the collection without calling the api and the custom filters runs again because i got them stored also on a service. The issue that i cant solve is to go to an specific page after the custom filter is execute.\n\nI try to use the controller.slice() watching the ctlr.getFilteredCollection but the custom filter override the page changes that the slide function make. Also i try to use a persist directive on localstorage but is the same, the custom filter execute and override the load of the localstorage collection overriding the page.\n\nis There a way to set an specific page after the custom filter? from the custom filter directive theres a way to access the tableState?\n\nmy custom filter looks similar to (of course with some custom logic):\n\n``` javascript\n.filter('customFilter', ['$filter', function ($filter) {\n   return function customFilter(array, expression) {\n     return output;\n    };\n}]);\n```\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/723",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/723/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/723/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/723/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/723",
    "id": 182673873,
    "number": 723,
    "title": "Highlight search term?",
    "user": {
      "login": "kdumovic",
      "id": 4503680,
      "avatar_url": "https://avatars2.githubusercontent.com/u/4503680?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/kdumovic",
      "html_url": "https://github.com/kdumovic",
      "followers_url": "https://api.github.com/users/kdumovic/followers",
      "following_url": "https://api.github.com/users/kdumovic/following{/other_user}",
      "gists_url": "https://api.github.com/users/kdumovic/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/kdumovic/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/kdumovic/subscriptions",
      "organizations_url": "https://api.github.com/users/kdumovic/orgs",
      "repos_url": "https://api.github.com/users/kdumovic/repos",
      "events_url": "https://api.github.com/users/kdumovic/events{/privacy}",
      "received_events_url": "https://api.github.com/users/kdumovic/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2016-10-13T01:35:32Z",
    "updated_at": "2016-10-13T01:35:32Z",
    "closed_at": null,
    "body": "Howdy,\n\nIs there a way to highlight the matching search term within a table cell? I am imagining that any text within a table cell that matches the search query would be enclosed in a span that could then be styled with a background color, etc.\n\nDoes this functionality exist?\n\nThanks.\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/722",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/722/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/722/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/722/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/722",
    "id": 182481256,
    "number": 722,
    "title": "New Feature Request :: Select All Button with the Table",
    "user": {
      "login": "harshild",
      "id": 8577215,
      "avatar_url": "https://avatars1.githubusercontent.com/u/8577215?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/harshild",
      "html_url": "https://github.com/harshild",
      "followers_url": "https://api.github.com/users/harshild/followers",
      "following_url": "https://api.github.com/users/harshild/following{/other_user}",
      "gists_url": "https://api.github.com/users/harshild/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/harshild/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/harshild/subscriptions",
      "organizations_url": "https://api.github.com/users/harshild/orgs",
      "repos_url": "https://api.github.com/users/harshild/repos",
      "events_url": "https://api.github.com/users/harshild/events{/privacy}",
      "received_events_url": "https://api.github.com/users/harshild/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2016-10-12T09:45:44Z",
    "updated_at": "2016-10-21T09:00:50Z",
    "closed_at": null,
    "body": "Hi,\n\nThis talks about the similar concerns as mentioned here :- https://github.com/lorenzofox3/Smart-Table/issues/270\n\nThe provided directive also works like a charm.\n\nBut, i am wondering if it possible to include an auto-selection button with the library and then may be toggling its usages with the help of property.\n\nI searched quite a bit but not found any such request made earlier. You can discard it if something like this has already been adressed\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/716",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/716/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/716/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/716/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/716",
    "id": 177705470,
    "number": 716,
    "title": "Angular Smart Table Reload Data and Reset Filters Along With Pagination(Without st-pipe)",
    "user": {
      "login": "nimanthaharshana",
      "id": 10864598,
      "avatar_url": "https://avatars2.githubusercontent.com/u/10864598?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/nimanthaharshana",
      "html_url": "https://github.com/nimanthaharshana",
      "followers_url": "https://api.github.com/users/nimanthaharshana/followers",
      "following_url": "https://api.github.com/users/nimanthaharshana/following{/other_user}",
      "gists_url": "https://api.github.com/users/nimanthaharshana/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/nimanthaharshana/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/nimanthaharshana/subscriptions",
      "organizations_url": "https://api.github.com/users/nimanthaharshana/orgs",
      "repos_url": "https://api.github.com/users/nimanthaharshana/repos",
      "events_url": "https://api.github.com/users/nimanthaharshana/events{/privacy}",
      "received_events_url": "https://api.github.com/users/nimanthaharshana/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 2,
    "created_at": "2016-09-19T05:17:59Z",
    "updated_at": "2016-09-21T06:03:27Z",
    "closed_at": null,
    "body": "I have the smart table with Ajax loaded data where I want to reset filters and reload my data collection with reset of pagination as well when a button is clicked. My code is given below.\n\n**HTML**\n\n`<button ng-click=\"resetFilters();\" type=\"button\" class=\"btn btn-info\">Reset</button>`\n\n**JS**\n\n```\n\n$scope.resetFilters = function () {\n            $scope.rowCollection = [];\n            $scope.displayedCollection = [];\n            $scope.product_type = null;\n            $scope.product_category = null;\n            $scope.search = null;\n            $scope.rowCollection = new_data;\n        };\n```\n\nHowever I can't get this managed since pagination and filters are not resetting.\n\nI have seen the following but I'm not sure how actually the tableState Object can be accessed since it's undefined when I log it on the console and also **I'm not using st-pipe directive**.\n\n```\ntableState = ctrl.tableState()\ntableState.search.predicateObject = {}\ntableState.pagination.start = 0\n```\n\nPlease Help...\n\nThank You.\n"
  },
  {
    "url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/714",
    "repository_url": "https://api.github.com/repos/lorenzofox3/Smart-Table",
    "labels_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/714/labels{/name}",
    "comments_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/714/comments",
    "events_url": "https://api.github.com/repos/lorenzofox3/Smart-Table/issues/714/events",
    "html_url": "https://github.com/lorenzofox3/Smart-Table/issues/714",
    "id": 175906579,
    "number": 714,
    "title": "Excel like table cell selection",
    "user": {
      "login": "stanleyxu2005",
      "id": 5162687,
      "avatar_url": "https://avatars0.githubusercontent.com/u/5162687?v=3",
      "gravatar_id": "",
      "url": "https://api.github.com/users/stanleyxu2005",
      "html_url": "https://github.com/stanleyxu2005",
      "followers_url": "https://api.github.com/users/stanleyxu2005/followers",
      "following_url": "https://api.github.com/users/stanleyxu2005/following{/other_user}",
      "gists_url": "https://api.github.com/users/stanleyxu2005/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/stanleyxu2005/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/stanleyxu2005/subscriptions",
      "organizations_url": "https://api.github.com/users/stanleyxu2005/orgs",
      "repos_url": "https://api.github.com/users/stanleyxu2005/repos",
      "events_url": "https://api.github.com/users/stanleyxu2005/events{/privacy}",
      "received_events_url": "https://api.github.com/users/stanleyxu2005/received_events",
      "type": "User",
      "site_admin": false
    },
    "labels": [],
    "state": "open",
    "locked": false,
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "comments": 0,
    "created_at": "2016-09-09T01:41:54Z",
    "updated_at": "2016-09-09T03:00:11Z",
    "closed_at": null,
    "body": "Dear Developers,\n\nI'd like to ask whether there is any way (or plugin) to enhance table selecting. I want to select table like what we in Excel do. In concrete: \n- The selection will have a colored border\n- When press CTRL+C, data without format will be copied into clipboard.\n\nI know HandsOnTable (https://handsontable.com/examples.html?headers) is quite good at this, but its performance is a nightmare. I'd like to use my favorite Smart-Table to deliver new projects, so I'm asking ;-)\n"
  }
];

var smartListRegistry = (store, actions) => {

  const smartListRegistry = [];

  const has = (x, y) => smartListRegistry.find((item) => x === item.x && y === item.y) !== void 0;

  const get = (x, y) => smartListRegistry.find(item => x === item.x && y === item.y).smartList;

  const instance = {
    getSmartList(x, y){
      if (!has(x, y)) {
        const smartList = table({data});
        smartList.onDisplayChange(items => {
          actions.updateSmartList({
            x, y,
            tableState: smartList.getTableState(),
            items
          });
        });
        smartListRegistry.push({x, y, smartList});
        actions.createSmartList({x, y, tableState: smartList.getTableState(), items: []});
        smartList.exec();
      }

      return get(x, y);
    }
  };

  const state = store.getState();
  const smartListStates = state.smartList || [];

  for(let {x,y} of smartListStates){
    const smartList = table({data});
    smartList.onDisplayChange(items => {
      actions.updateSmartList({
        x, y,
        tableState: smartList.getTableState(),
        items
      });
    });
    smartListRegistry.push({x, y, smartList});
    smartList.exec();
    // setTimeout( () => smartList.exec(),200 );
  }

  return instance;
};

const grid = Grid({rows: ROWS, columns: COLUMNS});

//todo dummy for test
grid.updateAt(1, 1, {dx: 2, dy: 4, data:{title:'test',type:'list',source:'issues'}});


const initialState = {
  grid: {
    panels: [...grid],
    active: null,
  },
  smartList: [{x: 1, y: 1}]
};

const store$1 = createStore(reducer(grid), initialState,
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__());
const actions = bindActions(store$1);

var App = {
  gridify: gridify$1(grid, actions),
  store: store$1,
  connect: (sliceState) => connect$1(store$1, actions, sliceState),
  smartListRegistry: smartListRegistry(store$1, actions)
};

const connectToSmartList = (x, y) => App.connect(state => state.smartList.find(sl => sl.x === x && sl.y === y));

var SmartIssuesList = (props) => {

  const {x, y} = props;
  const smartTable = App.smartListRegistry.getSmartList(x, y);
  const connect = connectToSmartList(x, y);

  const Comp = connect(({items=[]}) => (
    h( 'div', { class: "issues-container" },
      h( 'button', { onClick: ev => {
        smartTable.sort({pointer: 'title', direction:['asc','desc'][Math.random() > 0.5 ? 1 :0]});
      } }, "click"),
      h( IssuesList, { issues: items.map(i=>i.value) })
    )));

  return h( Comp, null );
};

const EmptyDataPanel = (props, grid, actions) => {
  const {x, y, onDragStart} = props;
  const panelData = grid.getData(x, y);

  const onClick = _ => {
    actions.openModal({x, y, title: 'Create new data panel', modalType: 'createPanelData'});
  };

  return h( EmptyPanel, Object.assign({}, panelData, { onClick: onClick, onDragStart: onDragStart }));
};

const DataListPanel = (props, grid) => {
  const {x, y, onDragStart} = props;
  const panelData = grid.getData(x, y);
  return (h( ListPanel, Object.assign({}, { onDragStart: onDragStart }, panelData),
    h( SmartIssuesList, { x: x, y: y })
  ));
};

const ChartDataPanel = (props, grid) => {
  const {x, y, onDragStart} = props;
  const panelData = grid.getData(x, y);

  return h( ChartPanel, Object.assign({}, { onDragStart: onDragStart }, panelData))
};

const getDataPanel = (type) => {
  switch (type) {
    case 'chart':
      return ChartDataPanel;
    case 'list':
      return DataListPanel;
    default:
      return EmptyDataPanel;
  }
};

const DataPanel = (props, grid, actions) => {
  const {x, y} = props;
  const panelData = grid.getData(x, y);
  const {data = {}}=panelData;

  const onDragStart = ev => {
    ev.dataTransfer.dropEffect = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y}));
    actions.startResize({x, y});
  };

  const Panel = getDataPanel(data.type);

  return Panel(Object.assign({onDragStart}, props), grid, actions);
};

var Modal$2 = props => {
  const {isOpen, closeModal, title} = props;
  const onKeyDown = ({code}) => {
    if(code === 'Escape'){
      closeModal();
    }
  };

  return (h( 'div', { 'aria-hidden': String(!isOpen), onKeyDown: onKeyDown, class: "modal" },
    h( 'header', null,
      h( 'h2', null, title ),
      h( 'button', { onClick: closeModal }, "X")
    ),
    props.children
  ))
};

const autofocus = onMount((vnode)=>{
  vnode.dom.focus();
});
const AutofocusInput = autofocus(props => h( 'input', props));

const SourceTypeSelect = props => {
  const {onUpdate: onUpdate$$1} = props;
  return h( 'label', null,
    h( 'span', null, "Source type" ),
    h( 'select', { required: "true", onChange: ev => onUpdate$$1({source: ev.target.value}), name: "sourceType" },
      h( 'option', { value: "" }, "-"),
      h( 'option', { value: "issues" }, "Issues"),
      h( 'option', { value: "prs" }, "Pull request")
    )
  )
};

const ListInput = (props) => {
  return (h( 'div', null,
    h( SourceTypeSelect, props)
  ));
};
const ChartInput = () => h( 'p', null, "Chart Input" );
const AggregationInput = () => h( 'p', null, "AggregationInput" );
const NoTypeInput = () => h( 'p', null, "Select a panel type " );

const getInputSection = (data = {}) => {
  const {type} = data;
  switch (type) {
    case 'list':
      return ListInput;
    case 'chart':
      return ChartInput;
    case 'aggregation':
      return AggregationInput;
    default:
      return NoTypeInput;
  }
};

const TypeSection = (props) => {
  const {data, onUpdate: onUpdate$$1} = props;
  const InputSection = getInputSection(data);
  const update$$1 = (ev) => {
    onUpdate$$1({type: ev.target.value});
  };
  return (
    h( 'div', null,
      h( 'label', null,
        h( 'span', null, "Panel type:" ),
        h( 'select', { onChange: update$$1, required: "true", name: "type" },
          h( 'option', { value: "" }, " -"),
          h( 'option', { value: "list" }, "List"),
          h( 'option', { value: "chart" }, "Chart"),
          h( 'option', { value: "aggregation" }, "Aggregation")
        )
      ),
      h( InputSection, { data: data, onUpdate: onUpdate$$1 })
    ));
};

const EditDataPanelForm = (props) => {
  const {data, onUpdate: onUpdate$$1, onSubmit}=props;
  return (
    h( 'div', { class: "modal-content" },
      h( 'form', { onSubmit: onSubmit },
        h( 'label', null,
          h( 'span', null, "Panel title:" ),
          h( AutofocusInput, { onChange: ev => onUpdate$$1({title: ev.target.value}), name: "title", required: "true" })
        ),
        h( TypeSection, { data: data, onUpdate: onUpdate$$1 }),
        h( 'button', null, "Create" )
      )
    ));
};

const EditDataPanelModal = (props) => {

  const UpdatableFormSection = withState((props, update$$1) => {
    const {data = {}} = props;
    const onUpdate$$1 = (val) => {
      Object.assign(data,val);
      update$$1(Object.assign(props,{data}));
    };
    return h( EditDataPanelForm, Object.assign({}, { onUpdate: onUpdate$$1 }, props));
  });

  return (h( Modal$2, { isOpen: props.isOpen, closeModal: props.closeModal, title: props.title },
    h( UpdatableFormSection, props)
  ));
};

var EditPanelDataModal = (props, grid, actions) => {
  const {x, y, data = {}, modalType} = props;
  const onSubmit = ev => {
    ev.preventDefault();
    actions.updatePanelData({x, y, data: data});
    const {type} = data;
    if (type === 'list') {

    }
    actions.closeModal();
  };

  return h( EditDataPanelModal, Object.assign({}, { data: data, closeModal: actions.closeModal }, props, { onSubmit: onSubmit }))
};

const EmptyModal = (props, grid, actions) => {
  return (h( Modal$2, { isOpen: props.isOpen, closeModal: actions.closeModal },
    h( 'div', null )
  ));
};


var Modal$1 = Modal = (props, grid, actions) => {
  const {modalType} = props;
  const ModalComponent = modalType === 'createPanelData' ? EditPanelDataModal : EmptyModal;
  return ModalComponent(props, grid, actions);
};

const {store, connect, gridify} = App;

const connectToModal = connect(state => state.modal);
const SideModal = compose$2(gridify,connectToModal)(Modal$1);

const getCoordsFromMouseEvent = (columns, rows) => (ev) => {
  const {currentTarget, offsetX, offsetY} = ev;
  const {offsetWidth, offsetHeight} = currentTarget;
  let xpix = offsetX;
  let ypix = offsetY;
  let {target} = ev;
  while (target !== currentTarget) {
    xpix += target.offsetLeft;
    ypix += target.offsetTop;
    target = target.offsetParent;
  }
  const x = Math.floor((xpix / offsetWidth) * COLUMNS) + 1;
  const y = Math.floor((ypix / offsetHeight) * ROWS) + 1;
  return {x, y};
};

const Container = gridify(({panels}, grid, actions) => {

  //create subscription to panel(x,y)
  const findPanelFromState = (x, y) => state => state.grid.panels.find(({x:px, y:py}) => x === px && y === py);
  const subscribeTo = (x, y) => connect(findPanelFromState(x, y));
  const subscribeFunctions = panels.map(({x, y}) => compose$2(gridify, subscribeTo(x, y)));

  //create connected components
  const AdornerPanelComponents = subscribeFunctions.map(subscribe => subscribe(AdornerPanel));
  const DataPanelComponents = subscribeFunctions.map(subscribe => subscribe(DataPanel));

  const coords = getCoordsFromMouseEvent(COLUMNS, ROWS);

  const onDragOver = (ev) => {
    ev.preventDefault();
    const {x, y} = coords(ev);
    actions.resizeOver(({x, y}));
  };

  const onDrop = ev => {
    const {dataTransfer} = ev;
    const data = dataTransfer.getData('text/plain');
    const JsonData = JSON.parse(data);
    const {x:startX, y:startY} = JsonData;
    if (startX && startY) {
      const {x, y} = coords(ev);
      actions.endResize(({x, startX, y, startY}));
    }
    ev.preventDefault();
  };

  return (h( 'div', { class: "grid-container" },
    h( 'div', { class: "grid adorner-layer" },
      AdornerPanelComponents.map(Panel => h( Panel, null ))
    ),
    h( 'div', { class: "grid data-layer", onDragover: onDragOver, onDrop: onDrop },
      DataPanelComponents.map(Panel => h( Panel, null ))
    ),
    h( SideModal, null )
  ));
});

const {grid:{panels}} = store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlcyI6WyIuLi8uLi9mbGFjby9saWIvaC5qcyIsIi4uLy4uL2ZsYWNvL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1vcGVyYXRvcnMvaW5kZXguanMiLCIuLi8uLi9mbGFjby9saWIvdXRpbC5qcyIsIi4uLy4uL2ZsYWNvL2xpYi9kb21VdGlsLmpzIiwiLi4vLi4vZmxhY28vbGliL3RyYXZlcnNlLmpzIiwiLi4vLi4vZmxhY28vbGliL3RyZWUuanMiLCIuLi8uLi9mbGFjby9saWIvdXBkYXRlLmpzIiwiLi4vLi4vZmxhY28vbGliL2xpZmVDeWNsZXMuanMiLCIuLi8uLi9mbGFjby9saWIvd2l0aFN0YXRlLmpzIiwiLi4vLi4vZmxhY28vbGliL2Nvbm5lY3QuanMiLCJ2aWV3cy9QYW5lbC5qcyIsInZpZXdzL0Fkb3JuZXJQYW5lbC5qcyIsImNvbXBvbmVudHMvQWRvcm5lclBhbmVsLmpzIiwibGliL2NvbnN0LmpzIiwidmlld3MvUmVzaXphYmxlRGF0YVBhbmVsLmpzIiwidmlld3MvSXNzdWVzLmpzIiwibGliL2dyaWQuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19mcmVlR2xvYmFsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fcm9vdC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX1N5bWJvbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX2dldFJhd1RhZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX29iamVjdFRvU3RyaW5nLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fYmFzZUdldFRhZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX292ZXJBcmcuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19nZXRQcm90b3R5cGUuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL2lzT2JqZWN0TGlrZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvaXNQbGFpbk9iamVjdC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zeW1ib2wtb2JzZXJ2YWJsZS9lcy9wb255ZmlsbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zeW1ib2wtb2JzZXJ2YWJsZS9lcy9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWR1eC9lcy9jcmVhdGVTdG9yZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWR1eC9lcy91dGlscy93YXJuaW5nLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlZHV4L2VzL2NvbXBvc2UuanMiLCIuLi9ub2RlX21vZHVsZXMvcmVkdXgvZXMvaW5kZXguanMiLCJyZWR1Y2Vycy9ncmlkLmpzIiwicmVkdWNlcnMvbW9kYWwuanMiLCJyZWR1Y2Vycy9zbWFydExpc3QuanMiLCJyZWR1Y2Vycy9pbmRleC5qcyIsImFjdGlvbnMvaW5kZXguanMiLCJjb21iaW5hdG9ycy9ncmlkSW5qZWN0ZWQuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtb3BlcmF0b3JzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1zb3J0L2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWZpbHRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1zZWFyY2gvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9zcmMvc2xpY2UuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtZXZlbnRzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2V2ZW50cy5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1jb3JlL3NyYy9kaXJlY3RpdmVzL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvaW5kZXguanMiLCJtb2NrRGF0YS5qcyIsImxpYi9zbWFydExpc3RSZWdpc3RyeS5qcyIsImxpYi9zdG9yZS5qcyIsImNvbXBvbmVudHMvU21hcnRJc3N1ZUxpc3QuanMiLCJjb21wb25lbnRzL1Jlc2l6YWJsZURhdGFQYW5lbC5qcyIsInZpZXdzL01vZGFsLmpzIiwidmlld3MvRWRpdERhdGFQYW5lbEZvcm0uanMiLCJjb21wb25lbnRzL0VkaXRQYW5lbERhdGFNb2RhbC5qcyIsImNvbXBvbmVudHMvTW9kYWwuanMiLCJpbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBjcmVhdGVUZXh0Vk5vZGUgPSAodmFsdWUpID0+ICh7XG4gIG5vZGVUeXBlOiAnVGV4dCcsXG4gIGNoaWxkcmVuOiBbXSxcbiAgcHJvcHM6IHt2YWx1ZX0sXG4gIGxpZmVDeWNsZTogMFxufSk7XG5cbi8qKlxuICogVHJhbnNmb3JtIGh5cGVyc2NyaXB0IGludG8gdmlydHVhbCBkb20gbm9kZVxuICogQHBhcmFtIG5vZGVUeXBlIHtGdW5jdGlvbiwgU3RyaW5nfSAtIHRoZSBIVE1MIHRhZyBpZiBzdHJpbmcsIGEgY29tcG9uZW50IG9yIGNvbWJpbmF0b3Igb3RoZXJ3aXNlXG4gKiBAcGFyYW0gcHJvcHMge09iamVjdH0gLSB0aGUgbGlzdCBvZiBwcm9wZXJ0aWVzL2F0dHJpYnV0ZXMgYXNzb2NpYXRlZCB0byB0aGUgcmVsYXRlZCBub2RlXG4gKiBAcGFyYW0gY2hpbGRyZW4gLSB0aGUgdmlydHVhbCBkb20gbm9kZXMgcmVsYXRlZCB0byB0aGUgY3VycmVudCBub2RlIGNoaWxkcmVuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSAtIGEgdmlydHVhbCBkb20gbm9kZVxuICovXG5leHBvcnQgZGVmYXVsdCAgZnVuY3Rpb24gaCAobm9kZVR5cGUsIHByb3BzLCAuLi5jaGlsZHJlbikge1xuICBjb25zdCBmbGF0Q2hpbGRyZW4gPSBjaGlsZHJlbi5yZWR1Y2UoKGFjYywgY2hpbGQpID0+IHtcbiAgICBjb25zdCBjaGlsZHJlbkFycmF5ID0gQXJyYXkuaXNBcnJheShjaGlsZCkgPyBjaGlsZCA6IFtjaGlsZF07XG4gICAgcmV0dXJuIGFjYy5jb25jYXQoY2hpbGRyZW5BcnJheSk7XG4gIH0sIFtdKVxuICAgIC5tYXAoY2hpbGQgPT4ge1xuICAgICAgLy8gbm9ybWFsaXplIHRleHQgbm9kZSB0byBoYXZlIHNhbWUgc3RydWN0dXJlIHRoYW4gcmVndWxhciBkb20gbm9kZXNcbiAgICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgY2hpbGQ7XG4gICAgICByZXR1cm4gdHlwZSA9PT0gJ29iamVjdCcgfHwgdHlwZSA9PT0gJ2Z1bmN0aW9uJyA/IGNoaWxkIDogY3JlYXRlVGV4dFZOb2RlKGNoaWxkKTtcbiAgICB9KTtcblxuICBpZiAodHlwZW9mIG5vZGVUeXBlICE9PSAnZnVuY3Rpb24nKSB7Ly9yZWd1bGFyIGh0bWwvdGV4dCBub2RlXG4gICAgcmV0dXJuIHtcbiAgICAgIG5vZGVUeXBlLFxuICAgICAgcHJvcHM6IHByb3BzLFxuICAgICAgY2hpbGRyZW46IGZsYXRDaGlsZHJlbixcbiAgICAgIGxpZmVDeWNsZTogMFxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgZnVsbFByb3BzID0gT2JqZWN0LmFzc2lnbih7Y2hpbGRyZW46IGZsYXRDaGlsZHJlbn0sIHByb3BzKTtcbiAgICBjb25zdCBjb21wID0gbm9kZVR5cGUoZnVsbFByb3BzKTtcbiAgICByZXR1cm4gdHlwZW9mIGNvbXAgIT09ICdmdW5jdGlvbicgPyBjb21wIDogaChjb21wLCBwcm9wcywgLi4uZmxhdENoaWxkcmVuKTsgLy9mdW5jdGlvbmFsIGNvbXAgdnMgY29tYmluYXRvciAoSE9DKVxuICB9XG59OyIsImV4cG9ydCBmdW5jdGlvbiBzd2FwIChmKSB7XG4gIHJldHVybiAoYSwgYikgPT4gZihiLCBhKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvc2UgKGZpcnN0LCAuLi5mbnMpIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiBmbnMucmVkdWNlKChwcmV2aW91cywgY3VycmVudCkgPT4gY3VycmVudChwcmV2aW91cyksIGZpcnN0KC4uLmFyZ3MpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGN1cnJ5IChmbiwgYXJpdHlMZWZ0KSB7XG4gIGNvbnN0IGFyaXR5ID0gYXJpdHlMZWZ0IHx8IGZuLmxlbmd0aDtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgY29uc3QgYXJnTGVuZ3RoID0gYXJncy5sZW5ndGggfHwgMTtcbiAgICBpZiAoYXJpdHkgPT09IGFyZ0xlbmd0aCkge1xuICAgICAgcmV0dXJuIGZuKC4uLmFyZ3MpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBmdW5jID0gKC4uLm1vcmVBcmdzKSA9PiBmbiguLi5hcmdzLCAuLi5tb3JlQXJncyk7XG4gICAgICByZXR1cm4gY3VycnkoZnVuYywgYXJpdHkgLSBhcmdzLmxlbmd0aCk7XG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHkgKGZuKSB7XG4gIHJldHVybiAoLi4uYXJncykgPT4gZm4oLi4uYXJncyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0YXAgKGZuKSB7XG4gIHJldHVybiBhcmcgPT4ge1xuICAgIGZuKGFyZyk7XG4gICAgcmV0dXJuIGFyZztcbiAgfVxufSIsImV4cG9ydCBjb25zdCBuZXh0VGljayA9IGZuID0+IHNldFRpbWVvdXQoZm4sIDApO1xuXG5leHBvcnQgY29uc3QgcGFpcmlmeSA9IGhvbGRlciA9PiBrZXkgPT4gW2tleSwgaG9sZGVyW2tleV1dO1xuXG5leHBvcnQgY29uc3QgaXNTaGFsbG93RXF1YWwgPSAoYSwgYikgPT4ge1xuICBjb25zdCBhS2V5cyA9IE9iamVjdC5rZXlzKGEpO1xuICBjb25zdCBiS2V5cyA9IE9iamVjdC5rZXlzKGIpO1xuICByZXR1cm4gYUtleXMubGVuZ3RoID09PSBiS2V5cy5sZW5ndGggJiYgYUtleXMuZXZlcnkoKGspID0+IGFba10gPT09IGJba10pO1xufTtcblxuY29uc3Qgb3duS2V5cyA9IG9iaiA9PiBPYmplY3Qua2V5cyhvYmopLmZpbHRlcihrID0+IG9iai5oYXNPd25Qcm9wZXJ0eShrKSk7XG5cbmV4cG9ydCBjb25zdCBpc0RlZXBFcXVhbCA9IChhLCBiKSA9PiB7XG4gIGNvbnN0IHR5cGUgPSB0eXBlb2YgYTtcblxuICAvL3Nob3J0IHBhdGgocylcbiAgaWYgKGEgPT09IGIpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmICh0eXBlICE9PSB0eXBlb2YgYikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBhID09PSBiO1xuICB9XG5cbiAgLy8gb2JqZWN0cyAuLi5cbiAgaWYgKGEgPT09IG51bGwgfHwgYiA9PT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KGEpKSB7XG4gICAgcmV0dXJuIGEubGVuZ3RoICYmIGIubGVuZ3RoICYmIGEuZXZlcnkoKGl0ZW0sIGkpID0+IGlzRGVlcEVxdWFsKGFbaV0sIGJbaV0pKTtcbiAgfVxuXG4gIGNvbnN0IGFLZXlzID0gb3duS2V5cyhhKTtcbiAgY29uc3QgYktleXMgPSBvd25LZXlzKGIpO1xuICByZXR1cm4gYUtleXMubGVuZ3RoID09PSBiS2V5cy5sZW5ndGggJiYgYUtleXMuZXZlcnkoayA9PiBpc0RlZXBFcXVhbChhW2tdLCBiW2tdKSk7XG59O1xuXG5leHBvcnQgY29uc3QgaWRlbnRpdHkgPSBhID0+IGE7XG5cbmV4cG9ydCBjb25zdCBub29wID0gXyA9PiB7XG59O1xuIiwiaW1wb3J0IHt0YXB9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5cbmNvbnN0IFNWR19OUCA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG5cbmNvbnN0IHVwZGF0ZURvbU5vZGVGYWN0b3J5ID0gKG1ldGhvZCkgPT4gKGl0ZW1zKSA9PiB0YXAoZG9tTm9kZSA9PiB7XG4gIGZvciAobGV0IHBhaXIgb2YgaXRlbXMpIHtcbiAgICBkb21Ob2RlW21ldGhvZF0oLi4ucGFpcik7XG4gIH1cbn0pO1xuXG5leHBvcnQgY29uc3QgcmVtb3ZlRXZlbnRMaXN0ZW5lcnMgPSB1cGRhdGVEb21Ob2RlRmFjdG9yeSgncmVtb3ZlRXZlbnRMaXN0ZW5lcicpO1xuZXhwb3J0IGNvbnN0IGFkZEV2ZW50TGlzdGVuZXJzID0gdXBkYXRlRG9tTm9kZUZhY3RvcnkoJ2FkZEV2ZW50TGlzdGVuZXInKTtcbmV4cG9ydCBjb25zdCBzZXRBdHRyaWJ1dGVzID0gKGl0ZW1zKSA9PiB0YXAoKGRvbU5vZGUpID0+IHtcbiAgY29uc3QgYXR0cmlidXRlcyA9IGl0ZW1zLmZpbHRlcigoW2tleSwgdmFsdWVdKSA9PiB0eXBlb2YgdmFsdWUgIT09ICdmdW5jdGlvbicpO1xuICBmb3IgKGxldCBba2V5LCB2YWx1ZV0gb2YgYXR0cmlidXRlcykge1xuICAgIHZhbHVlID09PSBmYWxzZSA/IGRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKGtleSkgOiBkb21Ob2RlLnNldEF0dHJpYnV0ZShrZXksIHZhbHVlKTtcbiAgfVxufSk7XG5leHBvcnQgY29uc3QgcmVtb3ZlQXR0cmlidXRlcyA9IChpdGVtcykgPT4gdGFwKGRvbU5vZGUgPT4ge1xuICBmb3IgKGxldCBhdHRyIG9mIGl0ZW1zKSB7XG4gICAgZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoYXR0cik7XG4gIH1cbn0pO1xuXG5leHBvcnQgY29uc3Qgc2V0VGV4dE5vZGUgPSB2YWwgPT4gbm9kZSA9PiBub2RlLnRleHRDb250ZW50ID0gdmFsO1xuXG5leHBvcnQgY29uc3QgY3JlYXRlRG9tTm9kZSA9ICh2bm9kZSwgcGFyZW50KSA9PiB7XG4gIGlmICh2bm9kZS5ub2RlVHlwZSA9PT0gJ3N2ZycpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWR19OUCwgdm5vZGUubm9kZVR5cGUpO1xuICB9IGVsc2UgaWYgKHZub2RlLm5vZGVUeXBlID09PSAnVGV4dCcpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodm5vZGUubm9kZVR5cGUpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBwYXJlbnQubmFtZXNwYWNlVVJJID09PSBTVkdfTlAgPyBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHX05QLCB2bm9kZS5ub2RlVHlwZSkgOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHZub2RlLm5vZGVUeXBlKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldEV2ZW50TGlzdGVuZXJzID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhwcm9wcylcbiAgICAuZmlsdGVyKGsgPT4gay5zdWJzdHIoMCwgMikgPT09ICdvbicpXG4gICAgLm1hcChrID0+IFtrLnN1YnN0cigyKS50b0xvd2VyQ2FzZSgpLCBwcm9wc1trXV0pO1xufTtcbiIsImV4cG9ydCBjb25zdCB0cmF2ZXJzZSA9IGZ1bmN0aW9uICogKHZub2RlKSB7XG4gIHlpZWxkIHZub2RlO1xuICBpZiAodm5vZGUuY2hpbGRyZW4gJiYgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoKSB7XG4gICAgZm9yIChsZXQgY2hpbGQgb2Ygdm5vZGUuY2hpbGRyZW4pIHtcbiAgICAgIHlpZWxkICogdHJhdmVyc2UoY2hpbGQpO1xuICAgIH1cbiAgfVxufTsiLCJpbXBvcnQge2NvbXBvc2UsIGN1cnJ5fSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgaXNTaGFsbG93RXF1YWwsXG4gIHBhaXJpZnksXG4gIG5leHRUaWNrLFxuICBub29wXG59IGZyb20gJy4vdXRpbCc7XG5pbXBvcnQge1xuICByZW1vdmVBdHRyaWJ1dGVzLFxuICBzZXRBdHRyaWJ1dGVzLFxuICBzZXRUZXh0Tm9kZSxcbiAgY3JlYXRlRG9tTm9kZSxcbiAgcmVtb3ZlRXZlbnRMaXN0ZW5lcnMsXG4gIGFkZEV2ZW50TGlzdGVuZXJzLFxuICBnZXRFdmVudExpc3RlbmVycyxcbn0gZnJvbSAnLi9kb21VdGlsJztcbmltcG9ydCB7dHJhdmVyc2V9IGZyb20gJy4vdHJhdmVyc2UnO1xuXG5jb25zdCB1cGRhdGVFdmVudExpc3RlbmVycyA9ICh7cHJvcHM6bmV3Tm9kZVByb3BzfT17fSwge3Byb3BzOm9sZE5vZGVQcm9wc309e30pID0+IHtcbiAgY29uc3QgbmV3Tm9kZUV2ZW50cyA9IGdldEV2ZW50TGlzdGVuZXJzKG5ld05vZGVQcm9wcyB8fCB7fSk7XG4gIGNvbnN0IG9sZE5vZGVFdmVudHMgPSBnZXRFdmVudExpc3RlbmVycyhvbGROb2RlUHJvcHMgfHwge30pO1xuXG4gIHJldHVybiBuZXdOb2RlRXZlbnRzLmxlbmd0aCB8fCBvbGROb2RlRXZlbnRzLmxlbmd0aCA/XG4gICAgY29tcG9zZShcbiAgICAgIHJlbW92ZUV2ZW50TGlzdGVuZXJzKG9sZE5vZGVFdmVudHMpLFxuICAgICAgYWRkRXZlbnRMaXN0ZW5lcnMobmV3Tm9kZUV2ZW50cylcbiAgICApIDogbm9vcDtcbn07XG5cbmNvbnN0IHVwZGF0ZUF0dHJpYnV0ZXMgPSAobmV3Vk5vZGUsIG9sZFZOb2RlKSA9PiB7XG4gIGNvbnN0IG5ld1ZOb2RlUHJvcHMgPSBuZXdWTm9kZS5wcm9wcyB8fCB7fTtcbiAgY29uc3Qgb2xkVk5vZGVQcm9wcyA9IG9sZFZOb2RlLnByb3BzIHx8IHt9O1xuXG4gIGlmIChpc1NoYWxsb3dFcXVhbChuZXdWTm9kZVByb3BzLCBvbGRWTm9kZVByb3BzKSkge1xuICAgIHJldHVybiBub29wO1xuICB9XG5cbiAgaWYgKG5ld1ZOb2RlLm5vZGVUeXBlID09PSAnVGV4dCcpIHtcbiAgICByZXR1cm4gc2V0VGV4dE5vZGUobmV3Vk5vZGUucHJvcHMudmFsdWUpO1xuICB9XG5cbiAgY29uc3QgbmV3Tm9kZUtleXMgPSBPYmplY3Qua2V5cyhuZXdWTm9kZVByb3BzKTtcbiAgY29uc3Qgb2xkTm9kZUtleXMgPSBPYmplY3Qua2V5cyhvbGRWTm9kZVByb3BzKTtcbiAgY29uc3QgYXR0cmlidXRlc1RvUmVtb3ZlID0gb2xkTm9kZUtleXMuZmlsdGVyKGsgPT4gIW5ld05vZGVLZXlzLmluY2x1ZGVzKGspKTtcblxuICByZXR1cm4gY29tcG9zZShcbiAgICByZW1vdmVBdHRyaWJ1dGVzKGF0dHJpYnV0ZXNUb1JlbW92ZSksXG4gICAgc2V0QXR0cmlidXRlcyhuZXdOb2RlS2V5cy5tYXAocGFpcmlmeShuZXdWTm9kZVByb3BzKSkpXG4gICk7XG59O1xuXG5jb25zdCBkb21GYWN0b3J5ID0gY3JlYXRlRG9tTm9kZTtcblxuLy8gYXBwbHkgdm5vZGUgZGlmZmluZyB0byBhY3R1YWwgZG9tIG5vZGUgKGlmIG5ldyBub2RlID0+IGl0IHdpbGwgYmUgbW91bnRlZCBpbnRvIHRoZSBwYXJlbnQpXG5jb25zdCBkb21pZnkgPSAob2xkVm5vZGUsIG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKSA9PiB7XG4gIGlmICghb2xkVm5vZGUpIHsvL3RoZXJlIGlzIG5vIHByZXZpb3VzIHZub2RlXG4gICAgaWYgKG5ld1Zub2RlKSB7Ly9uZXcgbm9kZSA9PiB3ZSBpbnNlcnRcbiAgICAgIG5ld1Zub2RlLmRvbSA9IHBhcmVudERvbU5vZGUuYXBwZW5kQ2hpbGQoZG9tRmFjdG9yeShuZXdWbm9kZSwgcGFyZW50RG9tTm9kZSkpO1xuICAgICAgbmV3Vm5vZGUubGlmZUN5Y2xlID0gMTtcbiAgICAgIHJldHVybiB7dm5vZGU6IG5ld1Zub2RlLCBnYXJiYWdlOiBudWxsfTtcbiAgICB9IGVsc2Ugey8vZWxzZSAoaXJyZWxldmFudClcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgb3BlcmF0aW9uJylcbiAgICB9XG4gIH0gZWxzZSB7Ly90aGVyZSBpcyBhIHByZXZpb3VzIHZub2RlXG4gICAgaWYgKCFuZXdWbm9kZSkgey8vd2UgbXVzdCByZW1vdmUgdGhlIHJlbGF0ZWQgZG9tIG5vZGVcbiAgICAgIHBhcmVudERvbU5vZGUucmVtb3ZlQ2hpbGQob2xkVm5vZGUuZG9tKTtcbiAgICAgIHJldHVybiAoe2dhcmJhZ2U6IG9sZFZub2RlLCBkb206IG51bGx9KTtcbiAgICB9IGVsc2UgaWYgKG5ld1Zub2RlLm5vZGVUeXBlICE9PSBvbGRWbm9kZS5ub2RlVHlwZSkgey8vaXQgbXVzdCBiZSByZXBsYWNlZFxuICAgICAgbmV3Vm5vZGUuZG9tID0gZG9tRmFjdG9yeShuZXdWbm9kZSwgcGFyZW50RG9tTm9kZSk7XG4gICAgICBuZXdWbm9kZS5saWZlQ3ljbGUgPSAxO1xuICAgICAgcGFyZW50RG9tTm9kZS5yZXBsYWNlQ2hpbGQobmV3Vm5vZGUuZG9tLCBvbGRWbm9kZS5kb20pO1xuICAgICAgcmV0dXJuIHtnYXJiYWdlOiBvbGRWbm9kZSwgdm5vZGU6IG5ld1Zub2RlfTtcbiAgICB9IGVsc2Ugey8vIG9ubHkgdXBkYXRlIGF0dHJpYnV0ZXNcbiAgICAgIG5ld1Zub2RlLmRvbSA9IG9sZFZub2RlLmRvbTtcbiAgICAgIC8vIHBhc3MgdGhlIHVuTW91bnRIb29rXG4gICAgICBpZihvbGRWbm9kZS5vblVuTW91bnQpe1xuICAgICAgICBuZXdWbm9kZS5vblVuTW91bnQgPSBvbGRWbm9kZS5vblVuTW91bnQ7XG4gICAgICB9XG4gICAgICBuZXdWbm9kZS5saWZlQ3ljbGUgPSBvbGRWbm9kZS5saWZlQ3ljbGUgKyAxO1xuICAgICAgcmV0dXJuIHtnYXJiYWdlOiBudWxsLCB2bm9kZTogbmV3Vm5vZGV9O1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiByZW5kZXIgYSB2aXJ0dWFsIGRvbSBub2RlLCBkaWZmaW5nIGl0IHdpdGggaXRzIHByZXZpb3VzIHZlcnNpb24sIG1vdW50aW5nIGl0IGluIGEgcGFyZW50IGRvbSBub2RlXG4gKiBAcGFyYW0gb2xkVm5vZGVcbiAqIEBwYXJhbSBuZXdWbm9kZVxuICogQHBhcmFtIHBhcmVudERvbU5vZGVcbiAqIEBwYXJhbSBvbk5leHRUaWNrIGNvbGxlY3Qgb3BlcmF0aW9ucyB0byBiZSBwcm9jZXNzZWQgb24gbmV4dCB0aWNrXG4gKiBAcmV0dXJucyB7QXJyYXl9XG4gKi9cbmV4cG9ydCBjb25zdCByZW5kZXIgPSAob2xkVm5vZGUsIG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlLCBvbk5leHRUaWNrID0gW10pID0+IHtcblxuICAvLzEuIHRyYW5zZm9ybSB0aGUgbmV3IHZub2RlIHRvIGEgdm5vZGUgY29ubmVjdGVkIHRvIGFuIGFjdHVhbCBkb20gZWxlbWVudCBiYXNlZCBvbiB2bm9kZSB2ZXJzaW9ucyBkaWZmaW5nXG4gIC8vIGkuIG5vdGUgYXQgdGhpcyBzdGVwIG9jY3VyIGRvbSBpbnNlcnRpb25zL3JlbW92YWxzXG4gIC8vIGlpLiBpdCBtYXkgY29sbGVjdCBzdWIgdHJlZSB0byBiZSBkcm9wcGVkIChvciBcInVubW91bnRlZFwiKVxuICBjb25zdCB7dm5vZGUsIGdhcmJhZ2V9ID0gZG9taWZ5KG9sZFZub2RlLCBuZXdWbm9kZSwgcGFyZW50RG9tTm9kZSk7XG5cbiAgaWYgKGdhcmJhZ2UgIT09IG51bGwpIHtcbiAgICAvLyBkZWZlciB1bm1vdW50IGxpZmVjeWNsZSBhcyBpdCBpcyBub3QgXCJ2aXN1YWxcIlxuICAgIGZvciAobGV0IGcgb2YgdHJhdmVyc2UoZ2FyYmFnZSkpIHtcbiAgICAgIGlmIChnLm9uVW5Nb3VudCkge1xuICAgICAgICBvbk5leHRUaWNrLnB1c2goZy5vblVuTW91bnQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vTm9ybWFsaXNhdGlvbiBvZiBvbGQgbm9kZSAoaW4gY2FzZSBvZiBhIHJlcGxhY2Ugd2Ugd2lsbCBjb25zaWRlciBvbGQgbm9kZSBhcyBlbXB0eSBub2RlIChubyBjaGlsZHJlbiwgbm8gcHJvcHMpKVxuICBjb25zdCB0ZW1wT2xkTm9kZSA9IGdhcmJhZ2UgIT09IG51bGwgfHwgIW9sZFZub2RlID8ge2xlbmd0aDogMCwgY2hpbGRyZW46IFtdLCBwcm9wczoge319IDogb2xkVm5vZGU7XG5cbiAgaWYgKHZub2RlKSB7XG5cbiAgICAvLzIuIHVwZGF0ZSBkb20gYXR0cmlidXRlcyBiYXNlZCBvbiB2bm9kZSBwcm9wIGRpZmZpbmcuXG4gICAgLy9zeW5jXG4gICAgaWYgKHZub2RlLm9uVXBkYXRlICYmIHZub2RlLmxpZmVDeWNsZSA+IDEpIHtcbiAgICAgIHZub2RlLm9uVXBkYXRlKCk7XG4gICAgfVxuXG4gICAgdXBkYXRlQXR0cmlidXRlcyh2bm9kZSwgdGVtcE9sZE5vZGUpKHZub2RlLmRvbSk7XG5cbiAgICAvL2Zhc3QgcGF0aFxuICAgIGlmICh2bm9kZS5ub2RlVHlwZSA9PT0gJ1RleHQnKSB7XG4gICAgICByZXR1cm4gb25OZXh0VGljaztcbiAgICB9XG5cbiAgICBpZiAodm5vZGUub25Nb3VudCAmJiB2bm9kZS5saWZlQ3ljbGUgPT09IDEpIHtcbiAgICAgIG9uTmV4dFRpY2sucHVzaCgoKSA9PiB2bm9kZS5vbk1vdW50KCkpO1xuICAgIH1cblxuICAgIGNvbnN0IGNoaWxkcmVuQ291bnQgPSBNYXRoLm1heCh0ZW1wT2xkTm9kZS5jaGlsZHJlbi5sZW5ndGgsIHZub2RlLmNoaWxkcmVuLmxlbmd0aCk7XG5cbiAgICAvL2FzeW5jIHdpbGwgYmUgZGVmZXJyZWQgYXMgaXQgaXMgbm90IFwidmlzdWFsXCJcbiAgICBjb25zdCBzZXRMaXN0ZW5lcnMgPSB1cGRhdGVFdmVudExpc3RlbmVycyh2bm9kZSwgdGVtcE9sZE5vZGUpO1xuICAgIGlmIChzZXRMaXN0ZW5lcnMgIT09IG5vb3ApIHtcbiAgICAgIG9uTmV4dFRpY2sucHVzaCgoKSA9PiBzZXRMaXN0ZW5lcnModm5vZGUuZG9tKSk7XG4gICAgfVxuXG4gICAgLy8zIHJlY3Vyc2l2ZWx5IHRyYXZlcnNlIGNoaWxkcmVuIHRvIHVwZGF0ZSBkb20gYW5kIGNvbGxlY3QgZnVuY3Rpb25zIHRvIHByb2Nlc3Mgb24gbmV4dCB0aWNrXG4gICAgaWYgKGNoaWxkcmVuQ291bnQgPiAwKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuQ291bnQ7IGkrKykge1xuICAgICAgICAvLyB3ZSBwYXNzIG9uTmV4dFRpY2sgYXMgcmVmZXJlbmNlIChpbXByb3ZlIHBlcmY6IG1lbW9yeSArIHNwZWVkKVxuICAgICAgICByZW5kZXIodGVtcE9sZE5vZGUuY2hpbGRyZW5baV0sIHZub2RlLmNoaWxkcmVuW2ldLCB2bm9kZS5kb20sIG9uTmV4dFRpY2spO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvbk5leHRUaWNrO1xufTtcblxuZXhwb3J0IGNvbnN0IGh5ZHJhdGUgPSAodm5vZGUsIGRvbSkgPT4ge1xuICAndXNlIHN0cmljdCc7XG4gIGNvbnN0IGh5ZHJhdGVkID0gT2JqZWN0LmFzc2lnbih7fSwgdm5vZGUpO1xuICBjb25zdCBkb21DaGlsZHJlbiA9IEFycmF5LmZyb20oZG9tLmNoaWxkTm9kZXMpLmZpbHRlcihuID0+IG4ubm9kZVR5cGUgIT09IDMgfHwgbi5ub2RlVmFsdWUudHJpbSgpICE9PSAnJyk7XG4gIGh5ZHJhdGVkLmRvbSA9IGRvbTtcbiAgaHlkcmF0ZWQuY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbi5tYXAoKGNoaWxkLCBpKSA9PiBoeWRyYXRlKGNoaWxkLCBkb21DaGlsZHJlbltpXSkpO1xuICByZXR1cm4gaHlkcmF0ZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgbW91bnQgPSBjdXJyeSgoY29tcCwgaW5pdFByb3AsIHJvb3QpID0+IHtcbiAgY29uc3Qgdm5vZGUgPSBjb21wLm5vZGVUeXBlICE9PSB2b2lkIDAgPyBjb21wIDogY29tcChpbml0UHJvcCB8fCB7fSk7XG4gIGNvbnN0IG9sZFZOb2RlID0gcm9vdC5jaGlsZHJlbi5sZW5ndGggPyBoeWRyYXRlKHZub2RlLCByb290LmNoaWxkcmVuWzBdKSA6IG51bGw7XG4gIGNvbnN0IGJhdGNoID0gcmVuZGVyKG9sZFZOb2RlLCB2bm9kZSwgcm9vdCk7XG4gIG5leHRUaWNrKCgpID0+IHtcbiAgICBmb3IgKGxldCBvcCBvZiBiYXRjaCkge1xuICAgICAgb3AoKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gdm5vZGU7XG59KTsiLCJpbXBvcnQge3JlbmRlcn0gZnJvbSAnLi90cmVlJztcbmltcG9ydCB7bmV4dFRpY2t9IGZyb20gJy4vdXRpbCc7XG5cbi8qKlxuICogQ3JlYXRlIGEgZnVuY3Rpb24gd2hpY2ggd2lsbCB0cmlnZ2VyIGFuIHVwZGF0ZSBvZiB0aGUgY29tcG9uZW50IHdpdGggdGhlIHBhc3NlZCBzdGF0ZVxuICogQHBhcmFtIGNvbXAge0Z1bmN0aW9ufSAtIHRoZSBjb21wb25lbnQgdG8gdXBkYXRlXG4gKiBAcGFyYW0gaW5pdGlhbFZOb2RlIC0gdGhlIGluaXRpYWwgdmlydHVhbCBkb20gbm9kZSByZWxhdGVkIHRvIHRoZSBjb21wb25lbnQgKGllIG9uY2UgaXQgaGFzIGJlZW4gbW91bnRlZClcbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gLSB0aGUgdXBkYXRlIGZ1bmN0aW9uXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHVwZGF0ZSAoY29tcCwgaW5pdGlhbFZOb2RlKSB7XG4gIGxldCBvbGROb2RlID0gaW5pdGlhbFZOb2RlO1xuICBjb25zdCB1cGRhdGVGdW5jID0gKHByb3BzLCAuLi5hcmdzKSA9PiB7XG4gICAgY29uc3QgbW91bnQgPSBvbGROb2RlLmRvbS5wYXJlbnROb2RlO1xuICAgIGNvbnN0IG5ld05vZGUgPSBjb21wKE9iamVjdC5hc3NpZ24oe2NoaWxkcmVuOiBvbGROb2RlLmNoaWxkcmVuIHx8IFtdfSwgb2xkTm9kZS5wcm9wcywgcHJvcHMpLCAuLi5hcmdzKTtcbiAgICBjb25zdCBuZXh0QmF0Y2ggPSByZW5kZXIob2xkTm9kZSwgbmV3Tm9kZSwgbW91bnQpO1xuXG4gICAgLy8gZGFuZ2VyIHpvbmUgISEhIVxuICAgIC8vIGNoYW5nZSBieSBrZWVwaW5nIHRoZSBzYW1lIHJlZmVyZW5jZSBzbyB0aGUgZXZlbnR1YWwgcGFyZW50IG5vZGUgZG9lcyBub3QgbmVlZCB0byBiZSBcImF3YXJlXCIgdHJlZSBtYXkgaGF2ZSBjaGFuZ2VkIGRvd25zdHJlYW06IG9sZE5vZGUgbWF5IGJlIHRoZSBjaGlsZCBvZiBzb21lb25lIC4uLih3ZWxsIHRoYXQgaXMgYSB0cmVlIGRhdGEgc3RydWN0dXJlIGFmdGVyIGFsbCA6UCApXG4gICAgb2xkTm9kZSA9IE9iamVjdC5hc3NpZ24ob2xkTm9kZSB8fCB7fSwgbmV3Tm9kZSk7XG4gICAgLy8gZW5kIGRhbmdlciB6b25lXG5cbiAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICBmb3IgKGxldCBvcCBvZiBuZXh0QmF0Y2gpIHtcbiAgICAgICAgb3AoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gbmV3Tm9kZTtcbiAgfTtcbiAgcmV0dXJuIHVwZGF0ZUZ1bmM7XG59IiwiaW1wb3J0IHtjdXJyeX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcblxuY29uc3QgbGlmZUN5Y2xlRmFjdG9yeSA9IG1ldGhvZCA9PiBjdXJyeSgoZm4sIGNvbXApID0+IChwcm9wcywgLi4uYXJncykgPT4ge1xuICBjb25zdCBuID0gY29tcChwcm9wcywgLi4uYXJncyk7XG4gIG5bbWV0aG9kXSA9ICgpID0+IGZuKG4sIC4uLmFyZ3MpO1xuICByZXR1cm4gbjtcbn0pO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IHdoZW4gdGhlIGNvbXBvbmVudCBpcyBtb3VudGVkXG4gKi9cbmV4cG9ydCBjb25zdCBvbk1vdW50ID0gbGlmZUN5Y2xlRmFjdG9yeSgnb25Nb3VudCcpO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IHdoZW4gdGhlIGNvbXBvbmVudCBpcyB1bm1vdW50ZWRcbiAqL1xuZXhwb3J0IGNvbnN0IG9uVW5Nb3VudCA9IGxpZmVDeWNsZUZhY3RvcnkoJ29uVW5Nb3VudCcpO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IGJlZm9yZSB0aGUgY29tcG9uZW50IGlzIHVwZGF0ZWRcbiAqL1xuZXhwb3J0IGNvbnN0IG9uVXBkYXRlID0gbGlmZUN5Y2xlRmFjdG9yeSgnb25VcGRhdGUnKTsiLCJpbXBvcnQgdXBkYXRlIGZyb20gJy4vdXBkYXRlJztcbmltcG9ydCB7b25Nb3VudCwgb25VcGRhdGV9IGZyb20gJy4vbGlmZUN5Y2xlcyc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5cbi8qKlxuICogQ29tYmluYXRvciB0byBjcmVhdGUgYSBcInN0YXRlZnVsIGNvbXBvbmVudFwiOiBpZSBpdCB3aWxsIGhhdmUgaXRzIG93biBzdGF0ZSBhbmQgdGhlIGFiaWxpdHkgdG8gdXBkYXRlIGl0cyBvd24gdHJlZVxuICogQHBhcmFtIGNvbXAge0Z1bmN0aW9ufSAtIHRoZSBjb21wb25lbnRcbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gLSBhIG5ldyB3cmFwcGVkIGNvbXBvbmVudFxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoY29tcCkge1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGxldCB1cGRhdGVGdW5jO1xuICAgIGNvbnN0IHdyYXBwZXJDb21wID0gKHByb3BzLCAuLi5hcmdzKSA9PiB7XG4gICAgICAvL2xhenkgZXZhbHVhdGUgdXBkYXRlRnVuYyAodG8gbWFrZSBzdXJlIGl0IGlzIGRlZmluZWRcbiAgICAgIGNvbnN0IHNldFN0YXRlID0gKG5ld1N0YXRlKSA9PiB1cGRhdGVGdW5jKG5ld1N0YXRlKTtcbiAgICAgIHJldHVybiBjb21wKHByb3BzLCBzZXRTdGF0ZSwgLi4uYXJncyk7XG4gICAgfTtcbiAgICBjb25zdCBzZXRVcGRhdGVGdW5jdGlvbiA9ICh2bm9kZSkgPT4ge1xuICAgICAgdXBkYXRlRnVuYyA9IHVwZGF0ZSh3cmFwcGVyQ29tcCwgdm5vZGUpO1xuICAgIH07XG5cbiAgICByZXR1cm4gY29tcG9zZShvbk1vdW50KHNldFVwZGF0ZUZ1bmN0aW9uKSwgb25VcGRhdGUoc2V0VXBkYXRlRnVuY3Rpb24pKSh3cmFwcGVyQ29tcCk7XG4gIH07XG59OyIsImltcG9ydCB1cGRhdGUgZnJvbSAnLi91cGRhdGUnO1xuaW1wb3J0IHtjb21wb3NlfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHtvbk1vdW50LCBvblVuTW91bnR9IGZyb20gJy4vbGlmZUN5Y2xlcydcbmltcG9ydCB7aXNEZWVwRXF1YWwsIGlkZW50aXR5fSBmcm9tICcuL3V0aWwnO1xuXG4vKipcbiAqIENvbm5lY3QgY29tYmluYXRvcjogd2lsbCBjcmVhdGUgXCJjb250YWluZXJcIiBjb21wb25lbnQgd2hpY2ggd2lsbCBzdWJzY3JpYmUgdG8gYSBSZWR1eCBsaWtlIHN0b3JlLiBhbmQgdXBkYXRlIGl0cyBjaGlsZHJlbiB3aGVuZXZlciBhIHNwZWNpZmljIHNsaWNlIG9mIHN0YXRlIGNoYW5nZSB1bmRlciBzcGVjaWZpYyBjaXJjdW1zdGFuY2VzXG4gKiBAcGFyYW0gc3RvcmUge09iamVjdH0gLSBUaGUgc3RvcmUgKGltcGxlbWVudGluZyB0aGUgc2FtZSBhcGkgdGhhbiBSZWR1eCBzdG9yZVxuICogQHBhcmFtIGFjdGlvbnMge09iamVjdH0gW3t9XSAtIFRoZSBsaXN0IG9mIGFjdGlvbnMgdGhlIGNvbm5lY3RlZCBjb21wb25lbnQgd2lsbCBiZSBhYmxlIHRvIHRyaWdnZXJcbiAqIEBwYXJhbSBzbGljZVN0YXRlIHtGdW5jdGlvbn0gW3N0YXRlID0+IHN0YXRlXSAtIEEgZnVuY3Rpb24gd2hpY2ggdGFrZXMgYXMgYXJndW1lbnQgdGhlIHN0YXRlIGFuZCByZXR1cm4gYSBcInRyYW5zZm9ybWVkXCIgc3RhdGUgKGxpa2UgcGFydGlhbCwgZXRjKSByZWxldmFudCB0byB0aGUgY29udGFpbmVyXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IC0gQSBjb250YWluZXIgZmFjdG9yeSB3aXRoIHRoZSBmb2xsb3dpbmcgYXJndW1lbnRzOlxuICogIC0gY29tcDogdGhlIGNvbXBvbmVudCB0byB3cmFwIG5vdGUgdGhlIGFjdGlvbnMgb2JqZWN0IHdpbGwgYmUgcGFzc2VkIGFzIHNlY29uZCBhcmd1bWVudCBvZiB0aGUgY29tcG9uZW50IGZvciBjb252ZW5pZW5jZVxuICogIC0gbWFwU3RhdGVUb1Byb3A6IGEgZnVuY3Rpb24gd2hpY2ggdGFrZXMgYXMgYXJndW1lbnQgd2hhdCB0aGUgXCJzbGljZVN0YXRlXCIgZnVuY3Rpb24gcmV0dXJucyBhbmQgcmV0dXJucyBhbiBvYmplY3QgdG8gYmUgYmxlbmRlZCBpbnRvIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBjb21wb25lbnQgKGRlZmF1bHQgdG8gaWRlbnRpdHkgZnVuY3Rpb24pXG4gKiAgLSBzaG91bGRVcGRhdGU6IGEgZnVuY3Rpb24gd2hpY2ggdGFrZXMgYXMgYXJndW1lbnRzIHRoZSBwcmV2aW91cyBhbmQgdGhlIGN1cnJlbnQgdmVyc2lvbnMgb2Ygd2hhdCBcInNsaWNlU3RhdGVcIiBmdW5jdGlvbiByZXR1cm5zIHRvIHJldHVybnMgYSBib29sZWFuIGRlZmluaW5nIHdoZXRoZXIgdGhlIGNvbXBvbmVudCBzaG91bGQgYmUgdXBkYXRlZCAoZGVmYXVsdCB0byBhIGRlZXBFcXVhbCBjaGVjaylcbiAqL1xuZXhwb3J0IGRlZmF1bHQgIChzdG9yZSwgYWN0aW9ucyA9IHt9LCBzbGljZVN0YXRlID0gaWRlbnRpdHkpID0+XG4gIChjb21wLCBtYXBTdGF0ZVRvUHJvcCA9IGlkZW50aXR5LCBzaG91bGRVcGF0ZSA9IChhLCBiKSA9PiBpc0RlZXBFcXVhbChhLCBiKSA9PT0gZmFsc2UpID0+XG4gICAgKGluaXRQcm9wKSA9PiB7XG4gICAgICBsZXQgY29tcG9uZW50UHJvcHMgPSBpbml0UHJvcDtcbiAgICAgIGxldCB1cGRhdGVGdW5jLCBwcmV2aW91c1N0YXRlU2xpY2UsIHVuc3Vic2NyaWJlcjtcblxuICAgICAgY29uc3Qgd3JhcHBlckNvbXAgPSAocHJvcHMsIC4uLmFyZ3MpID0+IHtcbiAgICAgICAgcmV0dXJuIGNvbXAoT2JqZWN0LmFzc2lnbihwcm9wcywgbWFwU3RhdGVUb1Byb3Aoc2xpY2VTdGF0ZShzdG9yZS5nZXRTdGF0ZSgpKSkpLCBhY3Rpb25zLCAuLi5hcmdzKTtcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHN1YnNjcmliZSA9IG9uTW91bnQoKHZub2RlKSA9PiB7XG4gICAgICAgIHVwZGF0ZUZ1bmMgPSB1cGRhdGUod3JhcHBlckNvbXAsIHZub2RlKTtcbiAgICAgICAgdW5zdWJzY3JpYmVyID0gc3RvcmUuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICBjb25zdCBzdGF0ZVNsaWNlID0gc2xpY2VTdGF0ZShzdG9yZS5nZXRTdGF0ZSgpKTtcbiAgICAgICAgICBpZiAoc2hvdWxkVXBhdGUocHJldmlvdXNTdGF0ZVNsaWNlLCBzdGF0ZVNsaWNlKSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihjb21wb25lbnRQcm9wcywgbWFwU3RhdGVUb1Byb3Aoc3RhdGVTbGljZSkpO1xuICAgICAgICAgICAgdXBkYXRlRnVuYyhjb21wb25lbnRQcm9wcyk7XG4gICAgICAgICAgICBwcmV2aW91c1N0YXRlU2xpY2UgPSBzdGF0ZVNsaWNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgdW5zdWJzY3JpYmUgPSBvblVuTW91bnQoKCkgPT4ge1xuICAgICAgICB1bnN1YnNjcmliZXIoKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gY29tcG9zZShzdWJzY3JpYmUsIHVuc3Vic2NyaWJlKSh3cmFwcGVyQ29tcCk7XG4gICAgfSIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMpID0+IHtcbiAgLy90b2RvIGRlc3RydWN0IHdpdGggcmVzdCB7Li4ub3RoZXJQcm9wc30gaW5zdGVhZCBvZiBkZWxldGluZyBzdHVmZnNcbiAgY29uc3Qge2R4ID0gMSwgZHkgPSAxLCB4LCB5LCBwYW5lbENsYXNzZXMsIGNoaWxkcmVuLCBzdHlsZSA9ICcnfSA9IHByb3BzO1xuICBkZWxldGUgcHJvcHMuY2hpbGRyZW47XG4gIGRlbGV0ZSBwcm9wcy5wYW5lbENsYXNzZXM7XG4gIGRlbGV0ZSBwcm9wcy5keDtcbiAgZGVsZXRlIHByb3BzLmR5O1xuICBkZWxldGUgcHJvcHMueDtcbiAgZGVsZXRlIHByb3BzLnk7XG4gIGRlbGV0ZSBwcm9wcy5zdHlsZTtcblxuICBjb25zdCBwb3NpdGlvblN0eWxlID0gYFxuICAgIC0tZ3JpZC1jb2x1bW4tb2Zmc2V0OiAke3h9O1xuICAgIC0tZ3JpZC1yb3ctb2Zmc2V0OiAke3l9O1xuICAgIC0tZ3JpZC1yb3ctc3BhbjogJHtkeX07XG4gICAgLS1ncmlkLWNvbHVtbi1zcGFuOiAke2R4fTtcbiAgICAke3N0eWxlfVxuYDtcblxuICBjb25zdCBjbGFzc2VzID0gWydwYW5lbCddLmNvbmNhdChwYW5lbENsYXNzZXMpLmpvaW4oJyAnKTtcblxuICByZXR1cm4gKDxkaXYgey4uLnByb3BzfSBzdHlsZT17cG9zaXRpb25TdHlsZX0gY2xhc3M9e2NsYXNzZXN9PlxuICAgIHtjaGlsZHJlbn1cbiAgPC9kaXY+KTtcbn0iLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJ1xuaW1wb3J0IFBhbmVsIGZyb20gJy4uL3ZpZXdzL1BhbmVsJztcblxuZXhwb3J0IGRlZmF1bHQgKHt4LCB5LCBhZG9ybmVyU3RhdHVzfSkgPT4ge1xuICBjb25zdCBleHRyYUNsYXNzZXMgPSBbXTtcbiAgaWYgKGFkb3JuZXJTdGF0dXMgPT09IDEpIHtcbiAgICBleHRyYUNsYXNzZXMucHVzaCgndmFsaWQtcGFuZWwnKTtcbiAgfSBlbHNlIGlmIChhZG9ybmVyU3RhdHVzID09PSAtMSkge1xuICAgIGV4dHJhQ2xhc3Nlcy5wdXNoKCdpbnZhbGlkLXBhbmVsJyk7XG4gIH1cblxuICByZXR1cm4gPFBhbmVsIHBhbmVsQ2xhc3Nlcz17ZXh0cmFDbGFzc2VzfSB4PXt4fSB5PXt5fSBkeD17MX0gZHk9ezF9PjwvUGFuZWw+O1xufTsiLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJ1xuaW1wb3J0IEFkb3JuZXJQYW5lbCBmcm9tICcuLi92aWV3cy9BZG9ybmVyUGFuZWwnO1xuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMsIGdyaWQpID0+IHtcbiAgY29uc3Qge3gsIHl9ID0gcHJvcHM7XG4gIGNvbnN0IHthZG9ybmVyU3RhdHVzID0gMH0gPSBncmlkLmdldERhdGEoeCwgeSk7XG4gIHJldHVybiA8QWRvcm5lclBhbmVsIHg9e3h9IHk9e3l9IGFkb3JuZXJTdGF0dXM9e2Fkb3JuZXJTdGF0dXN9Lz5cbn0iLCJleHBvcnQgY29uc3QgUk9XUyA9IDQ7XG5leHBvcnQgY29uc3QgQ09MVU1OUyA9IDQ7IiwiaW1wb3J0IHtST1dTLCBDT0xVTU5TfSBmcm9tICcuLi9saWIvY29uc3QnO1xuaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgUGFuZWwgZnJvbSAnLi9QYW5lbCc7XG5cbmNvbnN0IHJlc2l6YWJsZSA9IENvbXAgPT4gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHt4LCB5LCBkeCwgZHksIGFkb3JuZXJTdGF0dXMsIG9uRHJhZ1N0YXJ0fSA9IHByb3BzO1xuICBjb25zdCB6SW5kZXggPSAoUk9XUyAtIHkpICogMTAgKyBDT0xVTU5TIC0geDtcbiAgY29uc3QgcGFuZWxDbGFzc2VzID0gWydkYXRhLXBhbmVsJ107XG5cbiAgLy90b2RvXG4gIGRlbGV0ZSBwcm9wcy5vbkRyYWdTdGFydDtcblxuICBpZiAoYWRvcm5lclN0YXR1cyAhPT0gMCkge1xuICAgIHBhbmVsQ2xhc3Nlcy5wdXNoKCdhY3RpdmUtcGFuZWwnKTtcbiAgfVxuXG4gIHJldHVybiA8UGFuZWwgeD17eH0geT17eX0gZHg9e2R4fSBkeT17ZHl9IHN0eWxlPXtgei1pbmRleDoke3pJbmRleH07YH0gcGFuZWxDbGFzc2VzPXtwYW5lbENsYXNzZXN9PlxuICAgIDxDb21wIHsuLi5wcm9wc30gLz5cbiAgICA8ZGl2IGNsYXNzPVwicmVzaXplLWhhbmRsZVwiIGRyYWdnYWJsZT1cInRydWVcIiBvbkRyYWdTdGFydD17b25EcmFnU3RhcnR9PjwvZGl2PlxuICA8L1BhbmVsPlxufTtcblxuZXhwb3J0IGNvbnN0IEVtcHR5UGFuZWwgPSByZXNpemFibGUocHJvcHMgPT4ge1xuICByZXR1cm4gKDxidXR0b24gb25DbGljaz17cHJvcHMub25DbGlja30+KzwvYnV0dG9uPik7XG59KTtcblxuZXhwb3J0IGNvbnN0IENoYXJ0UGFuZWwgPSByZXNpemFibGUocHJvcHMgPT57XG4gIHJldHVybiA8cD5UaGF0IGlzIGEgY2hhcnQ8L3A+O1xufSk7XG5cblxuZXhwb3J0IGNvbnN0IExpc3RQYW5lbCA9IHJlc2l6YWJsZShwcm9wcyA9PiB7XG4gIGNvbnN0IHtkYXRhID0ge319ID0gcHJvcHM7XG4gIHJldHVybiAoPGRpdiBjbGFzcz1cInBhbmVsLWNvbnRlbnRcIj5cbiAgICA8aGVhZGVyIGNsYXNzPVwicGFuZWwtaGVhZGVyXCI+XG4gICAgICA8aDI+e2RhdGEudGl0bGV9PC9oMj5cbiAgICA8L2hlYWRlcj5cbiAgICA8ZGl2IGNsYXNzPVwicGFuZWwtYm9keVwiPlxuICAgICAge3Byb3BzLmNoaWxkcmVufVxuICAgIDwvZGl2PlxuICA8L2Rpdj4pO1xufSk7IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5cbmV4cG9ydCBjb25zdCBJc3N1ZUNhcmQgPSAocHJvcHMpID0+IHtcbiAgY29uc3Qge2lzc3VlID0ge319ID0gcHJvcHM7XG4gIGNvbnN0IHtpZCwgc3RhdGUsIGNyZWF0ZWRfYXQsIG51bWJlciwgaHRtbF91cmwsIHRpdGxlfSA9IGlzc3VlO1xuICByZXR1cm4gPGFydGljbGUgY2xhc3M9XCJpc3N1ZVwiPlxuICAgIDxoZWFkZXI+XG4gICAgICA8YSBocmVmPXtodG1sX3VybH0+I3tudW1iZXJ9PC9hPlxuICAgICAgPGRpdj5cbiAgICAgICAgPGgzPnt0aXRsZX08L2gzPlxuICAgICAgICA8c21hbGw+Y3JlYXRlZCBhdDpcbiAgICAgICAgICA8dGltZT57Y3JlYXRlZF9hdH08L3RpbWU+XG4gICAgICAgIDwvc21hbGw+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxzcGFuPntzdGF0ZX08L3NwYW4+XG4gICAgPC9oZWFkZXI+XG4gIDwvYXJ0aWNsZT5cbn07XG5cblxuZXhwb3J0IGNvbnN0IElzc3Vlc0xpc3QgPSAocHJvcHMpID0+IHtcbiAgY29uc3Qge2lzc3VlcyA9IFtdfSA9IHByb3BzO1xuICByZXR1cm4gKDx1bCBjbGFzcz1cImlzc3Vlcy1saXN0XCI+XG4gICAge1xuICAgICAgaXNzdWVzLm1hcChpID0+IDxsaT48SXNzdWVDYXJkIGlzc3VlPXtpfS8+PC9saT4pXG4gICAgfVxuICA8L3VsPik7XG59OyIsImV4cG9ydCBjb25zdCB2YWx1ZXNGcm9tRGVmID0gKHJvd3MsIGNvbHVtbnMpID0+ICh7eCA9IDEsIHkgPSAxLCBkeCA9IDEsIGR5ID0gMX09e30pID0+IHtcbiAgY29uc3QgdmFsdWVzID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm93cyAqIGNvbHVtbnM7IGkrKykge1xuICAgIGNvbnN0IHIgPSBNYXRoLmZsb29yKGkgLyByb3dzKSArIDE7XG4gICAgY29uc3QgYyA9IGkgJSBjb2x1bW5zICsgMTtcbiAgICB2YWx1ZXMucHVzaChyID49IHkgJiYgciA8IHkgKyBkeSAmJiBjID49IHggJiYgYyA8IHggKyBkeCA/IDEgOiAwKTtcbiAgfVxuICByZXR1cm4gdmFsdWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGRlZkZyb21JbmRleCA9IChyb3dzLCBjb2x1bW5zKSA9PiAoaSkgPT4ge1xuICBjb25zdCB4ID0gaSAlIGNvbHVtbnMgKyAxO1xuICBjb25zdCB5ID0gTWF0aC5mbG9vcihpIC8gcm93cykgKyAxO1xuICByZXR1cm4ge3gsIHl9O1xufTtcblxuZXhwb3J0IGNvbnN0IGluZGV4RnJvbURlZiA9IChyb3dzLCBjb2x1bW5zKSA9PiAoeCwgeSkgPT4gKHkgLSAxKSAqIHJvd3MgKyB4IC0gMTtcblxuZXhwb3J0IGNvbnN0IEFyZWFGYWN0b3J5ID0gKHJvd3MsIGNvbHVtbnMpID0+IHtcbiAgY29uc3QgaVRvRGVmID0gZGVmRnJvbUluZGV4KHJvd3MsIGNvbHVtbnMpO1xuICBjb25zdCBkZWZUb0kgPSBpbmRleEZyb21EZWYocm93cywgY29sdW1ucyk7XG5cbiAgY29uc3QgZmFjdG9yeSA9IHZhbHVlcyA9PiBPYmplY3QuY3JlYXRlKFByb3RvLCB7XG4gICAgdmFsdWVzOiB7dmFsdWU6IFsuLi52YWx1ZXNdfSwgbGVuZ3RoOiB7XG4gICAgICBnZXQoKXtcbiAgICAgICAgcmV0dXJuIHZhbHVlcy5maWx0ZXIodiA9PiB2ID09PSAxKS5sZW5ndGhcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIGNvbnN0IFByb3RvID0ge1xuICAgIFtTeW1ib2wuaXRlcmF0b3JdKCl7XG4gICAgICBjb25zdCB2YWx1ZXMgPSB0aGlzLnZhbHVlcztcbiAgICAgIHJldHVybiAoZnVuY3Rpb24gKiAoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYgKHZhbHVlc1tpXSA9PT0gMSkge1xuICAgICAgICAgICAgeWllbGQgaVRvRGVmKGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICB9LFxuICAgIGludGVyc2VjdGlvbihhcmVhKXtcbiAgICAgIHJldHVybiBmYWN0b3J5KHRoaXMudmFsdWVzLm1hcCgodiwgaSkgPT4gdiAqIGFyZWEudmFsdWVzW2ldKSk7XG4gICAgfSxcbiAgICBpbmNsdWRlcyhhcmVhKXtcbiAgICAgIGNvbnN0IGlzT25lID0gdiA9PiB2ID09PSAxO1xuICAgICAgcmV0dXJuIHRoaXMuaW50ZXJzZWN0aW9uKGFyZWEpLnZhbHVlcy5maWx0ZXIoaXNPbmUpLmxlbmd0aCA9PT0gYXJlYS52YWx1ZXMuZmlsdGVyKGlzT25lKS5sZW5ndGg7XG4gICAgfSxcbiAgICBpc0luY2x1ZGVkKGFyZWEpe1xuICAgICAgcmV0dXJuIGFyZWEuaW5jbHVkZXModGhpcyk7XG4gICAgfSxcbiAgICB1bmlvbihhcmVhKXtcbiAgICAgIHJldHVybiBmYWN0b3J5KHRoaXMudmFsdWVzLm1hcCgodiwgaSkgPT4gdiArIGFyZWEudmFsdWVzW2ldID4gMCA/IDEgOiAwKSk7XG4gICAgfSxcbiAgICBjb21wbGVtZW50KCl7XG4gICAgICByZXR1cm4gZmFjdG9yeSh0aGlzLnZhbHVlcy5tYXAodiA9PiAxIC0gdikpO1xuICAgIH0sXG4gICAgZGVidWcoKXtcbiAgICAgIGxldCBwcmludCA9ICcnO1xuICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gcm93czsgaSsrKSB7XG4gICAgICAgIGxldCBsaW5lID0gW107XG4gICAgICAgIGZvciAobGV0IGogPSAxOyBqIDw9IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgIGNvbnN0IGluZGV4RnJvbURlZjIgPSBkZWZUb0koaiwgaSk7XG4gICAgICAgICAgbGluZS5wdXNoKHRoaXMudmFsdWVzW2luZGV4RnJvbURlZjJdKTtcbiAgICAgICAgfVxuICAgICAgICBwcmludCArPSBgXG4ke2xpbmUuam9pbignICcpfVxuYFxuICAgICAgfVxuICAgICAgY29uc29sZS5sb2cocHJpbnQpO1xuICAgIH1cbiAgfTtcbiAgcmV0dXJuIGZhY3Rvcnk7XG59O1xuXG5leHBvcnQgY29uc3QgR3JpZCA9ICh7cGFuZWxzRGF0YSA9IFtdLCByb3dzID0gNCwgY29sdW1ucyA9IDR9ID17fSkgPT4ge1xuICBjb25zdCBpVG9EZWYgPSBkZWZGcm9tSW5kZXgocm93cywgY29sdW1ucyk7XG4gIGNvbnN0IGFyZWEgPSBBcmVhRmFjdG9yeShyb3dzLCBjb2x1bW5zKTtcbiAgY29uc3QgdG9WYWx1ZXMgPSB2YWx1ZXNGcm9tRGVmKHJvd3MsIGNvbHVtbnMpO1xuICBsZXQgcGFuZWxzID0gWy4uLnBhbmVsc0RhdGFdO1xuICBpZiAocm93cyAqIGNvbHVtbnMubGVuZ3RoICE9PSBwYW5lbHNEYXRhLmxlbmd0aCkge1xuICAgIHBhbmVscyA9IChuZXcgQXJyYXkocm93cyAqIGNvbHVtbnMpKS5maWxsKDApLm1hcCgoXywgaW5kZXgpID0+IE9iamVjdC5hc3NpZ24oaVRvRGVmKGluZGV4KSwge1xuICAgICAgZHg6IDEsXG4gICAgICBkeTogMSxcbiAgICAgIGFkb3JuZXJTdGF0dXM6IDAsXG4gICAgICBkYXRhOiB7fVxuICAgIH0pKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKXtcbiAgICAgIHJldHVybiAoZnVuY3Rpb24gKiAoKSB7XG4gICAgICAgIGZvciAobGV0IHAgb2YgcGFuZWxzKSB7XG4gICAgICAgICAgeWllbGQgT2JqZWN0LmFzc2lnbih7fSwgcCk7XG4gICAgICAgIH1cbiAgICAgIH0pKCk7XG4gICAgfSxcbiAgICB1cGRhdGVBdCh4LCB5LCBkYXRhKXtcbiAgICAgIGNvbnN0IHAgPSBwYW5lbHMuZmluZChwID0+IHAueCA9PT0geCAmJiBwLnkgPT09IHkpO1xuICAgICAgT2JqZWN0LmFzc2lnbihwLCBkYXRhKTtcbiAgICAgIHJldHVybiBwO1xuICAgIH0sXG4gICAgcGFuZWwoeCwgeSl7XG4gICAgICByZXR1cm4gYXJlYSh0b1ZhbHVlcyhwYW5lbHMuZmluZChwID0+IHAueCA9PT0geCAmJiBwLnkgPT09IHkpKSk7XG4gICAgfSxcbiAgICBhcmVhKHgsIHksIGR4ID0gMSwgZHkgPSAxKXtcbiAgICAgIHJldHVybiBhcmVhKHRvVmFsdWVzKHt4LCB5LCBkeCwgZHl9KSk7XG4gICAgfSxcbiAgICBnZXREYXRhKHgsIHkpe1xuICAgICAgcmV0dXJuIHBhbmVscy5maW5kKHAgPT4gcC54ID09PSB4ICYmIHAueSA9PT0geSkgfHwge307XG4gICAgfVxuICB9O1xufTsiLCIvKiogRGV0ZWN0IGZyZWUgdmFyaWFibGUgYGdsb2JhbGAgZnJvbSBOb2RlLmpzLiAqL1xudmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbCAmJiBnbG9iYWwuT2JqZWN0ID09PSBPYmplY3QgJiYgZ2xvYmFsO1xuXG5leHBvcnQgZGVmYXVsdCBmcmVlR2xvYmFsO1xuIiwiaW1wb3J0IGZyZWVHbG9iYWwgZnJvbSAnLi9fZnJlZUdsb2JhbC5qcyc7XG5cbi8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgc2VsZmAuICovXG52YXIgZnJlZVNlbGYgPSB0eXBlb2Ygc2VsZiA9PSAnb2JqZWN0JyAmJiBzZWxmICYmIHNlbGYuT2JqZWN0ID09PSBPYmplY3QgJiYgc2VsZjtcblxuLyoqIFVzZWQgYXMgYSByZWZlcmVuY2UgdG8gdGhlIGdsb2JhbCBvYmplY3QuICovXG52YXIgcm9vdCA9IGZyZWVHbG9iYWwgfHwgZnJlZVNlbGYgfHwgRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcblxuZXhwb3J0IGRlZmF1bHQgcm9vdDtcbiIsImltcG9ydCByb290IGZyb20gJy4vX3Jvb3QuanMnO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBTeW1ib2wgPSByb290LlN5bWJvbDtcblxuZXhwb3J0IGRlZmF1bHQgU3ltYm9sO1xuIiwiaW1wb3J0IFN5bWJvbCBmcm9tICcuL19TeW1ib2wuanMnO1xuXG4vKiogVXNlZCBmb3IgYnVpbHQtaW4gbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGVcbiAqIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi83LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgbmF0aXZlT2JqZWN0VG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqIEJ1aWx0LWluIHZhbHVlIHJlZmVyZW5jZXMuICovXG52YXIgc3ltVG9TdHJpbmdUYWcgPSBTeW1ib2wgPyBTeW1ib2wudG9TdHJpbmdUYWcgOiB1bmRlZmluZWQ7XG5cbi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBiYXNlR2V0VGFnYCB3aGljaCBpZ25vcmVzIGBTeW1ib2wudG9TdHJpbmdUYWdgIHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcXVlcnkuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSByYXcgYHRvU3RyaW5nVGFnYC5cbiAqL1xuZnVuY3Rpb24gZ2V0UmF3VGFnKHZhbHVlKSB7XG4gIHZhciBpc093biA9IGhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIHN5bVRvU3RyaW5nVGFnKSxcbiAgICAgIHRhZyA9IHZhbHVlW3N5bVRvU3RyaW5nVGFnXTtcblxuICB0cnkge1xuICAgIHZhbHVlW3N5bVRvU3RyaW5nVGFnXSA9IHVuZGVmaW5lZDtcbiAgICB2YXIgdW5tYXNrZWQgPSB0cnVlO1xuICB9IGNhdGNoIChlKSB7fVxuXG4gIHZhciByZXN1bHQgPSBuYXRpdmVPYmplY3RUb1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgaWYgKHVubWFza2VkKSB7XG4gICAgaWYgKGlzT3duKSB7XG4gICAgICB2YWx1ZVtzeW1Ub1N0cmluZ1RhZ10gPSB0YWc7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlbGV0ZSB2YWx1ZVtzeW1Ub1N0cmluZ1RhZ107XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGdldFJhd1RhZztcbiIsIi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZVxuICogW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzcuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBuYXRpdmVPYmplY3RUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENvbnZlcnRzIGB2YWx1ZWAgdG8gYSBzdHJpbmcgdXNpbmcgYE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjb252ZXJ0LlxuICogQHJldHVybnMge3N0cmluZ30gUmV0dXJucyB0aGUgY29udmVydGVkIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcodmFsdWUpIHtcbiAgcmV0dXJuIG5hdGl2ZU9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBvYmplY3RUb1N0cmluZztcbiIsImltcG9ydCBTeW1ib2wgZnJvbSAnLi9fU3ltYm9sLmpzJztcbmltcG9ydCBnZXRSYXdUYWcgZnJvbSAnLi9fZ2V0UmF3VGFnLmpzJztcbmltcG9ydCBvYmplY3RUb1N0cmluZyBmcm9tICcuL19vYmplY3RUb1N0cmluZy5qcyc7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBudWxsVGFnID0gJ1tvYmplY3QgTnVsbF0nLFxuICAgIHVuZGVmaW5lZFRhZyA9ICdbb2JqZWN0IFVuZGVmaW5lZF0nO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBzeW1Ub1N0cmluZ1RhZyA9IFN5bWJvbCA/IFN5bWJvbC50b1N0cmluZ1RhZyA6IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgZ2V0VGFnYCB3aXRob3V0IGZhbGxiYWNrcyBmb3IgYnVnZ3kgZW52aXJvbm1lbnRzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIGB0b1N0cmluZ1RhZ2AuXG4gKi9cbmZ1bmN0aW9uIGJhc2VHZXRUYWcodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZFRhZyA6IG51bGxUYWc7XG4gIH1cbiAgcmV0dXJuIChzeW1Ub1N0cmluZ1RhZyAmJiBzeW1Ub1N0cmluZ1RhZyBpbiBPYmplY3QodmFsdWUpKVxuICAgID8gZ2V0UmF3VGFnKHZhbHVlKVxuICAgIDogb2JqZWN0VG9TdHJpbmcodmFsdWUpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBiYXNlR2V0VGFnO1xuIiwiLyoqXG4gKiBDcmVhdGVzIGEgdW5hcnkgZnVuY3Rpb24gdGhhdCBpbnZva2VzIGBmdW5jYCB3aXRoIGl0cyBhcmd1bWVudCB0cmFuc2Zvcm1lZC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gd3JhcC5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IHRyYW5zZm9ybSBUaGUgYXJndW1lbnQgdHJhbnNmb3JtLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIG92ZXJBcmcoZnVuYywgdHJhbnNmb3JtKSB7XG4gIHJldHVybiBmdW5jdGlvbihhcmcpIHtcbiAgICByZXR1cm4gZnVuYyh0cmFuc2Zvcm0oYXJnKSk7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IG92ZXJBcmc7XG4iLCJpbXBvcnQgb3ZlckFyZyBmcm9tICcuL19vdmVyQXJnLmpzJztcblxuLyoqIEJ1aWx0LWluIHZhbHVlIHJlZmVyZW5jZXMuICovXG52YXIgZ2V0UHJvdG90eXBlID0gb3ZlckFyZyhPYmplY3QuZ2V0UHJvdG90eXBlT2YsIE9iamVjdCk7XG5cbmV4cG9ydCBkZWZhdWx0IGdldFByb3RvdHlwZTtcbiIsIi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UuIEEgdmFsdWUgaXMgb2JqZWN0LWxpa2UgaWYgaXQncyBub3QgYG51bGxgXG4gKiBhbmQgaGFzIGEgYHR5cGVvZmAgcmVzdWx0IG9mIFwib2JqZWN0XCIuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBzaW5jZSA0LjAuMFxuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdExpa2Uoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdExpa2UoXy5ub29wKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc09iamVjdExpa2UobnVsbCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdExpa2UodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICE9IG51bGwgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnO1xufVxuXG5leHBvcnQgZGVmYXVsdCBpc09iamVjdExpa2U7XG4iLCJpbXBvcnQgYmFzZUdldFRhZyBmcm9tICcuL19iYXNlR2V0VGFnLmpzJztcbmltcG9ydCBnZXRQcm90b3R5cGUgZnJvbSAnLi9fZ2V0UHJvdG90eXBlLmpzJztcbmltcG9ydCBpc09iamVjdExpa2UgZnJvbSAnLi9pc09iamVjdExpa2UuanMnO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0VGFnID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBmdW5jUHJvdG8gPSBGdW5jdGlvbi5wcm90b3R5cGUsXG4gICAgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBkZWNvbXBpbGVkIHNvdXJjZSBvZiBmdW5jdGlvbnMuICovXG52YXIgZnVuY1RvU3RyaW5nID0gZnVuY1Byb3RvLnRvU3RyaW5nO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKiogVXNlZCB0byBpbmZlciB0aGUgYE9iamVjdGAgY29uc3RydWN0b3IuICovXG52YXIgb2JqZWN0Q3RvclN0cmluZyA9IGZ1bmNUb1N0cmluZy5jYWxsKE9iamVjdCk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBwbGFpbiBvYmplY3QsIHRoYXQgaXMsIGFuIG9iamVjdCBjcmVhdGVkIGJ5IHRoZVxuICogYE9iamVjdGAgY29uc3RydWN0b3Igb3Igb25lIHdpdGggYSBgW1tQcm90b3R5cGVdXWAgb2YgYG51bGxgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgMC44LjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgcGxhaW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIGZ1bmN0aW9uIEZvbygpIHtcbiAqICAgdGhpcy5hID0gMTtcbiAqIH1cbiAqXG4gKiBfLmlzUGxhaW5PYmplY3QobmV3IEZvbyk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzUGxhaW5PYmplY3QoeyAneCc6IDAsICd5JzogMCB9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzUGxhaW5PYmplY3QoT2JqZWN0LmNyZWF0ZShudWxsKSk7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbmZ1bmN0aW9uIGlzUGxhaW5PYmplY3QodmFsdWUpIHtcbiAgaWYgKCFpc09iamVjdExpa2UodmFsdWUpIHx8IGJhc2VHZXRUYWcodmFsdWUpICE9IG9iamVjdFRhZykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB2YXIgcHJvdG8gPSBnZXRQcm90b3R5cGUodmFsdWUpO1xuICBpZiAocHJvdG8gPT09IG51bGwpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICB2YXIgQ3RvciA9IGhhc093blByb3BlcnR5LmNhbGwocHJvdG8sICdjb25zdHJ1Y3RvcicpICYmIHByb3RvLmNvbnN0cnVjdG9yO1xuICByZXR1cm4gdHlwZW9mIEN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBDdG9yIGluc3RhbmNlb2YgQ3RvciAmJlxuICAgIGZ1bmNUb1N0cmluZy5jYWxsKEN0b3IpID09IG9iamVjdEN0b3JTdHJpbmc7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGlzUGxhaW5PYmplY3Q7XG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBzeW1ib2xPYnNlcnZhYmxlUG9ueWZpbGwocm9vdCkge1xuXHR2YXIgcmVzdWx0O1xuXHR2YXIgU3ltYm9sID0gcm9vdC5TeW1ib2w7XG5cblx0aWYgKHR5cGVvZiBTeW1ib2wgPT09ICdmdW5jdGlvbicpIHtcblx0XHRpZiAoU3ltYm9sLm9ic2VydmFibGUpIHtcblx0XHRcdHJlc3VsdCA9IFN5bWJvbC5vYnNlcnZhYmxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgPSBTeW1ib2woJ29ic2VydmFibGUnKTtcblx0XHRcdFN5bWJvbC5vYnNlcnZhYmxlID0gcmVzdWx0O1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRyZXN1bHQgPSAnQEBvYnNlcnZhYmxlJztcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59O1xuIiwiLyogZ2xvYmFsIHdpbmRvdyAqL1xuaW1wb3J0IHBvbnlmaWxsIGZyb20gJy4vcG9ueWZpbGwnO1xuXG52YXIgcm9vdDtcblxuaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gc2VsZjtcbn0gZWxzZSBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgcm9vdCA9IHdpbmRvdztcbn0gZWxzZSBpZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgcm9vdCA9IGdsb2JhbDtcbn0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgcm9vdCA9IG1vZHVsZTtcbn0gZWxzZSB7XG4gIHJvb3QgPSBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xufVxuXG52YXIgcmVzdWx0ID0gcG9ueWZpbGwocm9vdCk7XG5leHBvcnQgZGVmYXVsdCByZXN1bHQ7XG4iLCJpbXBvcnQgaXNQbGFpbk9iamVjdCBmcm9tICdsb2Rhc2gtZXMvaXNQbGFpbk9iamVjdCc7XG5pbXBvcnQgJCRvYnNlcnZhYmxlIGZyb20gJ3N5bWJvbC1vYnNlcnZhYmxlJztcblxuLyoqXG4gKiBUaGVzZSBhcmUgcHJpdmF0ZSBhY3Rpb24gdHlwZXMgcmVzZXJ2ZWQgYnkgUmVkdXguXG4gKiBGb3IgYW55IHVua25vd24gYWN0aW9ucywgeW91IG11c3QgcmV0dXJuIHRoZSBjdXJyZW50IHN0YXRlLlxuICogSWYgdGhlIGN1cnJlbnQgc3RhdGUgaXMgdW5kZWZpbmVkLCB5b3UgbXVzdCByZXR1cm4gdGhlIGluaXRpYWwgc3RhdGUuXG4gKiBEbyBub3QgcmVmZXJlbmNlIHRoZXNlIGFjdGlvbiB0eXBlcyBkaXJlY3RseSBpbiB5b3VyIGNvZGUuXG4gKi9cbmV4cG9ydCB2YXIgQWN0aW9uVHlwZXMgPSB7XG4gIElOSVQ6ICdAQHJlZHV4L0lOSVQnXG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBSZWR1eCBzdG9yZSB0aGF0IGhvbGRzIHRoZSBzdGF0ZSB0cmVlLlxuICogVGhlIG9ubHkgd2F5IHRvIGNoYW5nZSB0aGUgZGF0YSBpbiB0aGUgc3RvcmUgaXMgdG8gY2FsbCBgZGlzcGF0Y2goKWAgb24gaXQuXG4gKlxuICogVGhlcmUgc2hvdWxkIG9ubHkgYmUgYSBzaW5nbGUgc3RvcmUgaW4geW91ciBhcHAuIFRvIHNwZWNpZnkgaG93IGRpZmZlcmVudFxuICogcGFydHMgb2YgdGhlIHN0YXRlIHRyZWUgcmVzcG9uZCB0byBhY3Rpb25zLCB5b3UgbWF5IGNvbWJpbmUgc2V2ZXJhbCByZWR1Y2Vyc1xuICogaW50byBhIHNpbmdsZSByZWR1Y2VyIGZ1bmN0aW9uIGJ5IHVzaW5nIGBjb21iaW5lUmVkdWNlcnNgLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJlZHVjZXIgQSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIG5leHQgc3RhdGUgdHJlZSwgZ2l2ZW5cbiAqIHRoZSBjdXJyZW50IHN0YXRlIHRyZWUgYW5kIHRoZSBhY3Rpb24gdG8gaGFuZGxlLlxuICpcbiAqIEBwYXJhbSB7YW55fSBbcHJlbG9hZGVkU3RhdGVdIFRoZSBpbml0aWFsIHN0YXRlLiBZb3UgbWF5IG9wdGlvbmFsbHkgc3BlY2lmeSBpdFxuICogdG8gaHlkcmF0ZSB0aGUgc3RhdGUgZnJvbSB0aGUgc2VydmVyIGluIHVuaXZlcnNhbCBhcHBzLCBvciB0byByZXN0b3JlIGFcbiAqIHByZXZpb3VzbHkgc2VyaWFsaXplZCB1c2VyIHNlc3Npb24uXG4gKiBJZiB5b3UgdXNlIGBjb21iaW5lUmVkdWNlcnNgIHRvIHByb2R1Y2UgdGhlIHJvb3QgcmVkdWNlciBmdW5jdGlvbiwgdGhpcyBtdXN0IGJlXG4gKiBhbiBvYmplY3Qgd2l0aCB0aGUgc2FtZSBzaGFwZSBhcyBgY29tYmluZVJlZHVjZXJzYCBrZXlzLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVuaGFuY2VyIFRoZSBzdG9yZSBlbmhhbmNlci4gWW91IG1heSBvcHRpb25hbGx5IHNwZWNpZnkgaXRcbiAqIHRvIGVuaGFuY2UgdGhlIHN0b3JlIHdpdGggdGhpcmQtcGFydHkgY2FwYWJpbGl0aWVzIHN1Y2ggYXMgbWlkZGxld2FyZSxcbiAqIHRpbWUgdHJhdmVsLCBwZXJzaXN0ZW5jZSwgZXRjLiBUaGUgb25seSBzdG9yZSBlbmhhbmNlciB0aGF0IHNoaXBzIHdpdGggUmVkdXhcbiAqIGlzIGBhcHBseU1pZGRsZXdhcmUoKWAuXG4gKlxuICogQHJldHVybnMge1N0b3JlfSBBIFJlZHV4IHN0b3JlIHRoYXQgbGV0cyB5b3UgcmVhZCB0aGUgc3RhdGUsIGRpc3BhdGNoIGFjdGlvbnNcbiAqIGFuZCBzdWJzY3JpYmUgdG8gY2hhbmdlcy5cbiAqL1xuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY3JlYXRlU3RvcmUocmVkdWNlciwgcHJlbG9hZGVkU3RhdGUsIGVuaGFuY2VyKSB7XG4gIHZhciBfcmVmMjtcblxuICBpZiAodHlwZW9mIHByZWxvYWRlZFN0YXRlID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBlbmhhbmNlciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBlbmhhbmNlciA9IHByZWxvYWRlZFN0YXRlO1xuICAgIHByZWxvYWRlZFN0YXRlID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBlbmhhbmNlciAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIGVuaGFuY2VyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIHRoZSBlbmhhbmNlciB0byBiZSBhIGZ1bmN0aW9uLicpO1xuICAgIH1cblxuICAgIHJldHVybiBlbmhhbmNlcihjcmVhdGVTdG9yZSkocmVkdWNlciwgcHJlbG9hZGVkU3RhdGUpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiByZWR1Y2VyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCB0aGUgcmVkdWNlciB0byBiZSBhIGZ1bmN0aW9uLicpO1xuICB9XG5cbiAgdmFyIGN1cnJlbnRSZWR1Y2VyID0gcmVkdWNlcjtcbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IHByZWxvYWRlZFN0YXRlO1xuICB2YXIgY3VycmVudExpc3RlbmVycyA9IFtdO1xuICB2YXIgbmV4dExpc3RlbmVycyA9IGN1cnJlbnRMaXN0ZW5lcnM7XG4gIHZhciBpc0Rpc3BhdGNoaW5nID0gZmFsc2U7XG5cbiAgZnVuY3Rpb24gZW5zdXJlQ2FuTXV0YXRlTmV4dExpc3RlbmVycygpIHtcbiAgICBpZiAobmV4dExpc3RlbmVycyA9PT0gY3VycmVudExpc3RlbmVycykge1xuICAgICAgbmV4dExpc3RlbmVycyA9IGN1cnJlbnRMaXN0ZW5lcnMuc2xpY2UoKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVhZHMgdGhlIHN0YXRlIHRyZWUgbWFuYWdlZCBieSB0aGUgc3RvcmUuXG4gICAqXG4gICAqIEByZXR1cm5zIHthbnl9IFRoZSBjdXJyZW50IHN0YXRlIHRyZWUgb2YgeW91ciBhcHBsaWNhdGlvbi5cbiAgICovXG4gIGZ1bmN0aW9uIGdldFN0YXRlKCkge1xuICAgIHJldHVybiBjdXJyZW50U3RhdGU7XG4gIH1cblxuICAvKipcbiAgICogQWRkcyBhIGNoYW5nZSBsaXN0ZW5lci4gSXQgd2lsbCBiZSBjYWxsZWQgYW55IHRpbWUgYW4gYWN0aW9uIGlzIGRpc3BhdGNoZWQsXG4gICAqIGFuZCBzb21lIHBhcnQgb2YgdGhlIHN0YXRlIHRyZWUgbWF5IHBvdGVudGlhbGx5IGhhdmUgY2hhbmdlZC4gWW91IG1heSB0aGVuXG4gICAqIGNhbGwgYGdldFN0YXRlKClgIHRvIHJlYWQgdGhlIGN1cnJlbnQgc3RhdGUgdHJlZSBpbnNpZGUgdGhlIGNhbGxiYWNrLlxuICAgKlxuICAgKiBZb3UgbWF5IGNhbGwgYGRpc3BhdGNoKClgIGZyb20gYSBjaGFuZ2UgbGlzdGVuZXIsIHdpdGggdGhlIGZvbGxvd2luZ1xuICAgKiBjYXZlYXRzOlxuICAgKlxuICAgKiAxLiBUaGUgc3Vic2NyaXB0aW9ucyBhcmUgc25hcHNob3R0ZWQganVzdCBiZWZvcmUgZXZlcnkgYGRpc3BhdGNoKClgIGNhbGwuXG4gICAqIElmIHlvdSBzdWJzY3JpYmUgb3IgdW5zdWJzY3JpYmUgd2hpbGUgdGhlIGxpc3RlbmVycyBhcmUgYmVpbmcgaW52b2tlZCwgdGhpc1xuICAgKiB3aWxsIG5vdCBoYXZlIGFueSBlZmZlY3Qgb24gdGhlIGBkaXNwYXRjaCgpYCB0aGF0IGlzIGN1cnJlbnRseSBpbiBwcm9ncmVzcy5cbiAgICogSG93ZXZlciwgdGhlIG5leHQgYGRpc3BhdGNoKClgIGNhbGwsIHdoZXRoZXIgbmVzdGVkIG9yIG5vdCwgd2lsbCB1c2UgYSBtb3JlXG4gICAqIHJlY2VudCBzbmFwc2hvdCBvZiB0aGUgc3Vic2NyaXB0aW9uIGxpc3QuXG4gICAqXG4gICAqIDIuIFRoZSBsaXN0ZW5lciBzaG91bGQgbm90IGV4cGVjdCB0byBzZWUgYWxsIHN0YXRlIGNoYW5nZXMsIGFzIHRoZSBzdGF0ZVxuICAgKiBtaWdodCBoYXZlIGJlZW4gdXBkYXRlZCBtdWx0aXBsZSB0aW1lcyBkdXJpbmcgYSBuZXN0ZWQgYGRpc3BhdGNoKClgIGJlZm9yZVxuICAgKiB0aGUgbGlzdGVuZXIgaXMgY2FsbGVkLiBJdCBpcywgaG93ZXZlciwgZ3VhcmFudGVlZCB0aGF0IGFsbCBzdWJzY3JpYmVyc1xuICAgKiByZWdpc3RlcmVkIGJlZm9yZSB0aGUgYGRpc3BhdGNoKClgIHN0YXJ0ZWQgd2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgbGF0ZXN0XG4gICAqIHN0YXRlIGJ5IHRoZSB0aW1lIGl0IGV4aXRzLlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBBIGNhbGxiYWNrIHRvIGJlIGludm9rZWQgb24gZXZlcnkgZGlzcGF0Y2guXG4gICAqIEByZXR1cm5zIHtGdW5jdGlvbn0gQSBmdW5jdGlvbiB0byByZW1vdmUgdGhpcyBjaGFuZ2UgbGlzdGVuZXIuXG4gICAqL1xuICBmdW5jdGlvbiBzdWJzY3JpYmUobGlzdGVuZXIpIHtcbiAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGxpc3RlbmVyIHRvIGJlIGEgZnVuY3Rpb24uJyk7XG4gICAgfVxuXG4gICAgdmFyIGlzU3Vic2NyaWJlZCA9IHRydWU7XG5cbiAgICBlbnN1cmVDYW5NdXRhdGVOZXh0TGlzdGVuZXJzKCk7XG4gICAgbmV4dExpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcblxuICAgIHJldHVybiBmdW5jdGlvbiB1bnN1YnNjcmliZSgpIHtcbiAgICAgIGlmICghaXNTdWJzY3JpYmVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaXNTdWJzY3JpYmVkID0gZmFsc2U7XG5cbiAgICAgIGVuc3VyZUNhbk11dGF0ZU5leHRMaXN0ZW5lcnMoKTtcbiAgICAgIHZhciBpbmRleCA9IG5leHRMaXN0ZW5lcnMuaW5kZXhPZihsaXN0ZW5lcik7XG4gICAgICBuZXh0TGlzdGVuZXJzLnNwbGljZShpbmRleCwgMSk7XG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEaXNwYXRjaGVzIGFuIGFjdGlvbi4gSXQgaXMgdGhlIG9ubHkgd2F5IHRvIHRyaWdnZXIgYSBzdGF0ZSBjaGFuZ2UuXG4gICAqXG4gICAqIFRoZSBgcmVkdWNlcmAgZnVuY3Rpb24sIHVzZWQgdG8gY3JlYXRlIHRoZSBzdG9yZSwgd2lsbCBiZSBjYWxsZWQgd2l0aCB0aGVcbiAgICogY3VycmVudCBzdGF0ZSB0cmVlIGFuZCB0aGUgZ2l2ZW4gYGFjdGlvbmAuIEl0cyByZXR1cm4gdmFsdWUgd2lsbFxuICAgKiBiZSBjb25zaWRlcmVkIHRoZSAqKm5leHQqKiBzdGF0ZSBvZiB0aGUgdHJlZSwgYW5kIHRoZSBjaGFuZ2UgbGlzdGVuZXJzXG4gICAqIHdpbGwgYmUgbm90aWZpZWQuXG4gICAqXG4gICAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9ubHkgc3VwcG9ydHMgcGxhaW4gb2JqZWN0IGFjdGlvbnMuIElmIHlvdSB3YW50IHRvXG4gICAqIGRpc3BhdGNoIGEgUHJvbWlzZSwgYW4gT2JzZXJ2YWJsZSwgYSB0aHVuaywgb3Igc29tZXRoaW5nIGVsc2UsIHlvdSBuZWVkIHRvXG4gICAqIHdyYXAgeW91ciBzdG9yZSBjcmVhdGluZyBmdW5jdGlvbiBpbnRvIHRoZSBjb3JyZXNwb25kaW5nIG1pZGRsZXdhcmUuIEZvclxuICAgKiBleGFtcGxlLCBzZWUgdGhlIGRvY3VtZW50YXRpb24gZm9yIHRoZSBgcmVkdXgtdGh1bmtgIHBhY2thZ2UuIEV2ZW4gdGhlXG4gICAqIG1pZGRsZXdhcmUgd2lsbCBldmVudHVhbGx5IGRpc3BhdGNoIHBsYWluIG9iamVjdCBhY3Rpb25zIHVzaW5nIHRoaXMgbWV0aG9kLlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gYWN0aW9uIEEgcGxhaW4gb2JqZWN0IHJlcHJlc2VudGluZyDigJx3aGF0IGNoYW5nZWTigJ0uIEl0IGlzXG4gICAqIGEgZ29vZCBpZGVhIHRvIGtlZXAgYWN0aW9ucyBzZXJpYWxpemFibGUgc28geW91IGNhbiByZWNvcmQgYW5kIHJlcGxheSB1c2VyXG4gICAqIHNlc3Npb25zLCBvciB1c2UgdGhlIHRpbWUgdHJhdmVsbGluZyBgcmVkdXgtZGV2dG9vbHNgLiBBbiBhY3Rpb24gbXVzdCBoYXZlXG4gICAqIGEgYHR5cGVgIHByb3BlcnR5IHdoaWNoIG1heSBub3QgYmUgYHVuZGVmaW5lZGAuIEl0IGlzIGEgZ29vZCBpZGVhIHRvIHVzZVxuICAgKiBzdHJpbmcgY29uc3RhbnRzIGZvciBhY3Rpb24gdHlwZXMuXG4gICAqXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IEZvciBjb252ZW5pZW5jZSwgdGhlIHNhbWUgYWN0aW9uIG9iamVjdCB5b3UgZGlzcGF0Y2hlZC5cbiAgICpcbiAgICogTm90ZSB0aGF0LCBpZiB5b3UgdXNlIGEgY3VzdG9tIG1pZGRsZXdhcmUsIGl0IG1heSB3cmFwIGBkaXNwYXRjaCgpYCB0b1xuICAgKiByZXR1cm4gc29tZXRoaW5nIGVsc2UgKGZvciBleGFtcGxlLCBhIFByb21pc2UgeW91IGNhbiBhd2FpdCkuXG4gICAqL1xuICBmdW5jdGlvbiBkaXNwYXRjaChhY3Rpb24pIHtcbiAgICBpZiAoIWlzUGxhaW5PYmplY3QoYWN0aW9uKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBY3Rpb25zIG11c3QgYmUgcGxhaW4gb2JqZWN0cy4gJyArICdVc2UgY3VzdG9tIG1pZGRsZXdhcmUgZm9yIGFzeW5jIGFjdGlvbnMuJyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBhY3Rpb24udHlwZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWN0aW9ucyBtYXkgbm90IGhhdmUgYW4gdW5kZWZpbmVkIFwidHlwZVwiIHByb3BlcnR5LiAnICsgJ0hhdmUgeW91IG1pc3NwZWxsZWQgYSBjb25zdGFudD8nKTtcbiAgICB9XG5cbiAgICBpZiAoaXNEaXNwYXRjaGluZykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSZWR1Y2VycyBtYXkgbm90IGRpc3BhdGNoIGFjdGlvbnMuJyk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGlzRGlzcGF0Y2hpbmcgPSB0cnVlO1xuICAgICAgY3VycmVudFN0YXRlID0gY3VycmVudFJlZHVjZXIoY3VycmVudFN0YXRlLCBhY3Rpb24pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBpc0Rpc3BhdGNoaW5nID0gZmFsc2U7XG4gICAgfVxuXG4gICAgdmFyIGxpc3RlbmVycyA9IGN1cnJlbnRMaXN0ZW5lcnMgPSBuZXh0TGlzdGVuZXJzO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBsaXN0ZW5lcnNbaV0oKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYWN0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcGxhY2VzIHRoZSByZWR1Y2VyIGN1cnJlbnRseSB1c2VkIGJ5IHRoZSBzdG9yZSB0byBjYWxjdWxhdGUgdGhlIHN0YXRlLlxuICAgKlxuICAgKiBZb3UgbWlnaHQgbmVlZCB0aGlzIGlmIHlvdXIgYXBwIGltcGxlbWVudHMgY29kZSBzcGxpdHRpbmcgYW5kIHlvdSB3YW50IHRvXG4gICAqIGxvYWQgc29tZSBvZiB0aGUgcmVkdWNlcnMgZHluYW1pY2FsbHkuIFlvdSBtaWdodCBhbHNvIG5lZWQgdGhpcyBpZiB5b3VcbiAgICogaW1wbGVtZW50IGEgaG90IHJlbG9hZGluZyBtZWNoYW5pc20gZm9yIFJlZHV4LlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0UmVkdWNlciBUaGUgcmVkdWNlciBmb3IgdGhlIHN0b3JlIHRvIHVzZSBpbnN0ZWFkLlxuICAgKiBAcmV0dXJucyB7dm9pZH1cbiAgICovXG4gIGZ1bmN0aW9uIHJlcGxhY2VSZWR1Y2VyKG5leHRSZWR1Y2VyKSB7XG4gICAgaWYgKHR5cGVvZiBuZXh0UmVkdWNlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCB0aGUgbmV4dFJlZHVjZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICBjdXJyZW50UmVkdWNlciA9IG5leHRSZWR1Y2VyO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogQWN0aW9uVHlwZXMuSU5JVCB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnRlcm9wZXJhYmlsaXR5IHBvaW50IGZvciBvYnNlcnZhYmxlL3JlYWN0aXZlIGxpYnJhcmllcy5cbiAgICogQHJldHVybnMge29ic2VydmFibGV9IEEgbWluaW1hbCBvYnNlcnZhYmxlIG9mIHN0YXRlIGNoYW5nZXMuXG4gICAqIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWUgdGhlIG9ic2VydmFibGUgcHJvcG9zYWw6XG4gICAqIGh0dHBzOi8vZ2l0aHViLmNvbS96ZW5wYXJzaW5nL2VzLW9ic2VydmFibGVcbiAgICovXG4gIGZ1bmN0aW9uIG9ic2VydmFibGUoKSB7XG4gICAgdmFyIF9yZWY7XG5cbiAgICB2YXIgb3V0ZXJTdWJzY3JpYmUgPSBzdWJzY3JpYmU7XG4gICAgcmV0dXJuIF9yZWYgPSB7XG4gICAgICAvKipcbiAgICAgICAqIFRoZSBtaW5pbWFsIG9ic2VydmFibGUgc3Vic2NyaXB0aW9uIG1ldGhvZC5cbiAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvYnNlcnZlciBBbnkgb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgYXMgYW4gb2JzZXJ2ZXIuXG4gICAgICAgKiBUaGUgb2JzZXJ2ZXIgb2JqZWN0IHNob3VsZCBoYXZlIGEgYG5leHRgIG1ldGhvZC5cbiAgICAgICAqIEByZXR1cm5zIHtzdWJzY3JpcHRpb259IEFuIG9iamVjdCB3aXRoIGFuIGB1bnN1YnNjcmliZWAgbWV0aG9kIHRoYXQgY2FuXG4gICAgICAgKiBiZSB1c2VkIHRvIHVuc3Vic2NyaWJlIHRoZSBvYnNlcnZhYmxlIGZyb20gdGhlIHN0b3JlLCBhbmQgcHJldmVudCBmdXJ0aGVyXG4gICAgICAgKiBlbWlzc2lvbiBvZiB2YWx1ZXMgZnJvbSB0aGUgb2JzZXJ2YWJsZS5cbiAgICAgICAqL1xuICAgICAgc3Vic2NyaWJlOiBmdW5jdGlvbiBzdWJzY3JpYmUob2JzZXJ2ZXIpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYnNlcnZlciAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCB0aGUgb2JzZXJ2ZXIgdG8gYmUgYW4gb2JqZWN0LicpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb2JzZXJ2ZVN0YXRlKCkge1xuICAgICAgICAgIGlmIChvYnNlcnZlci5uZXh0KSB7XG4gICAgICAgICAgICBvYnNlcnZlci5uZXh0KGdldFN0YXRlKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG9ic2VydmVTdGF0ZSgpO1xuICAgICAgICB2YXIgdW5zdWJzY3JpYmUgPSBvdXRlclN1YnNjcmliZShvYnNlcnZlU3RhdGUpO1xuICAgICAgICByZXR1cm4geyB1bnN1YnNjcmliZTogdW5zdWJzY3JpYmUgfTtcbiAgICAgIH1cbiAgICB9LCBfcmVmWyQkb2JzZXJ2YWJsZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LCBfcmVmO1xuICB9XG5cbiAgLy8gV2hlbiBhIHN0b3JlIGlzIGNyZWF0ZWQsIGFuIFwiSU5JVFwiIGFjdGlvbiBpcyBkaXNwYXRjaGVkIHNvIHRoYXQgZXZlcnlcbiAgLy8gcmVkdWNlciByZXR1cm5zIHRoZWlyIGluaXRpYWwgc3RhdGUuIFRoaXMgZWZmZWN0aXZlbHkgcG9wdWxhdGVzXG4gIC8vIHRoZSBpbml0aWFsIHN0YXRlIHRyZWUuXG4gIGRpc3BhdGNoKHsgdHlwZTogQWN0aW9uVHlwZXMuSU5JVCB9KTtcblxuICByZXR1cm4gX3JlZjIgPSB7XG4gICAgZGlzcGF0Y2g6IGRpc3BhdGNoLFxuICAgIHN1YnNjcmliZTogc3Vic2NyaWJlLFxuICAgIGdldFN0YXRlOiBnZXRTdGF0ZSxcbiAgICByZXBsYWNlUmVkdWNlcjogcmVwbGFjZVJlZHVjZXJcbiAgfSwgX3JlZjJbJCRvYnNlcnZhYmxlXSA9IG9ic2VydmFibGUsIF9yZWYyO1xufSIsIi8qKlxuICogUHJpbnRzIGEgd2FybmluZyBpbiB0aGUgY29uc29sZSBpZiBpdCBleGlzdHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIHdhcm5pbmcgbWVzc2FnZS5cbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiB3YXJuaW5nKG1lc3NhZ2UpIHtcbiAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBjb25zb2xlLmVycm9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY29uc29sZS5lcnJvcihtZXNzYWdlKTtcbiAgfVxuICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgdHJ5IHtcbiAgICAvLyBUaGlzIGVycm9yIHdhcyB0aHJvd24gYXMgYSBjb252ZW5pZW5jZSBzbyB0aGF0IGlmIHlvdSBlbmFibGVcbiAgICAvLyBcImJyZWFrIG9uIGFsbCBleGNlcHRpb25zXCIgaW4geW91ciBjb25zb2xlLFxuICAgIC8vIGl0IHdvdWxkIHBhdXNlIHRoZSBleGVjdXRpb24gYXQgdGhpcyBsaW5lLlxuICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1lbXB0eSAqL1xuICB9IGNhdGNoIChlKSB7fVxuICAvKiBlc2xpbnQtZW5hYmxlIG5vLWVtcHR5ICovXG59IiwiLyoqXG4gKiBDb21wb3NlcyBzaW5nbGUtYXJndW1lbnQgZnVuY3Rpb25zIGZyb20gcmlnaHQgdG8gbGVmdC4gVGhlIHJpZ2h0bW9zdFxuICogZnVuY3Rpb24gY2FuIHRha2UgbXVsdGlwbGUgYXJndW1lbnRzIGFzIGl0IHByb3ZpZGVzIHRoZSBzaWduYXR1cmUgZm9yXG4gKiB0aGUgcmVzdWx0aW5nIGNvbXBvc2l0ZSBmdW5jdGlvbi5cbiAqXG4gKiBAcGFyYW0gey4uLkZ1bmN0aW9ufSBmdW5jcyBUaGUgZnVuY3Rpb25zIHRvIGNvbXBvc2UuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IEEgZnVuY3Rpb24gb2J0YWluZWQgYnkgY29tcG9zaW5nIHRoZSBhcmd1bWVudCBmdW5jdGlvbnNcbiAqIGZyb20gcmlnaHQgdG8gbGVmdC4gRm9yIGV4YW1wbGUsIGNvbXBvc2UoZiwgZywgaCkgaXMgaWRlbnRpY2FsIHRvIGRvaW5nXG4gKiAoLi4uYXJncykgPT4gZihnKGgoLi4uYXJncykpKS5cbiAqL1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb21wb3NlKCkge1xuICBmb3IgKHZhciBfbGVuID0gYXJndW1lbnRzLmxlbmd0aCwgZnVuY3MgPSBBcnJheShfbGVuKSwgX2tleSA9IDA7IF9rZXkgPCBfbGVuOyBfa2V5KyspIHtcbiAgICBmdW5jc1tfa2V5XSA9IGFyZ3VtZW50c1tfa2V5XTtcbiAgfVxuXG4gIGlmIChmdW5jcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKGFyZykge1xuICAgICAgcmV0dXJuIGFyZztcbiAgICB9O1xuICB9XG5cbiAgaWYgKGZ1bmNzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmdW5jc1swXTtcbiAgfVxuXG4gIHZhciBsYXN0ID0gZnVuY3NbZnVuY3MubGVuZ3RoIC0gMV07XG4gIHZhciByZXN0ID0gZnVuY3Muc2xpY2UoMCwgLTEpO1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiByZXN0LnJlZHVjZVJpZ2h0KGZ1bmN0aW9uIChjb21wb3NlZCwgZikge1xuICAgICAgcmV0dXJuIGYoY29tcG9zZWQpO1xuICAgIH0sIGxhc3QuYXBwbHkodW5kZWZpbmVkLCBhcmd1bWVudHMpKTtcbiAgfTtcbn0iLCJpbXBvcnQgY3JlYXRlU3RvcmUgZnJvbSAnLi9jcmVhdGVTdG9yZSc7XG5pbXBvcnQgY29tYmluZVJlZHVjZXJzIGZyb20gJy4vY29tYmluZVJlZHVjZXJzJztcbmltcG9ydCBiaW5kQWN0aW9uQ3JlYXRvcnMgZnJvbSAnLi9iaW5kQWN0aW9uQ3JlYXRvcnMnO1xuaW1wb3J0IGFwcGx5TWlkZGxld2FyZSBmcm9tICcuL2FwcGx5TWlkZGxld2FyZSc7XG5pbXBvcnQgY29tcG9zZSBmcm9tICcuL2NvbXBvc2UnO1xuaW1wb3J0IHdhcm5pbmcgZnJvbSAnLi91dGlscy93YXJuaW5nJztcblxuLypcbiogVGhpcyBpcyBhIGR1bW15IGZ1bmN0aW9uIHRvIGNoZWNrIGlmIHRoZSBmdW5jdGlvbiBuYW1lIGhhcyBiZWVuIGFsdGVyZWQgYnkgbWluaWZpY2F0aW9uLlxuKiBJZiB0aGUgZnVuY3Rpb24gaGFzIGJlZW4gbWluaWZpZWQgYW5kIE5PREVfRU5WICE9PSAncHJvZHVjdGlvbicsIHdhcm4gdGhlIHVzZXIuXG4qL1xuZnVuY3Rpb24gaXNDcnVzaGVkKCkge31cblxuaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicgJiYgdHlwZW9mIGlzQ3J1c2hlZC5uYW1lID09PSAnc3RyaW5nJyAmJiBpc0NydXNoZWQubmFtZSAhPT0gJ2lzQ3J1c2hlZCcpIHtcbiAgd2FybmluZygnWW91IGFyZSBjdXJyZW50bHkgdXNpbmcgbWluaWZpZWQgY29kZSBvdXRzaWRlIG9mIE5PREVfRU5WID09PSBcXCdwcm9kdWN0aW9uXFwnLiAnICsgJ1RoaXMgbWVhbnMgdGhhdCB5b3UgYXJlIHJ1bm5pbmcgYSBzbG93ZXIgZGV2ZWxvcG1lbnQgYnVpbGQgb2YgUmVkdXguICcgKyAnWW91IGNhbiB1c2UgbG9vc2UtZW52aWZ5IChodHRwczovL2dpdGh1Yi5jb20vemVydG9zaC9sb29zZS1lbnZpZnkpIGZvciBicm93c2VyaWZ5ICcgKyAnb3IgRGVmaW5lUGx1Z2luIGZvciB3ZWJwYWNrIChodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzMwMDMwMDMxKSAnICsgJ3RvIGVuc3VyZSB5b3UgaGF2ZSB0aGUgY29ycmVjdCBjb2RlIGZvciB5b3VyIHByb2R1Y3Rpb24gYnVpbGQuJyk7XG59XG5cbmV4cG9ydCB7IGNyZWF0ZVN0b3JlLCBjb21iaW5lUmVkdWNlcnMsIGJpbmRBY3Rpb25DcmVhdG9ycywgYXBwbHlNaWRkbGV3YXJlLCBjb21wb3NlIH07IiwiaW1wb3J0IHtHcmlkfSBmcm9tICcuLi9saWIvZ3JpZCc7XG5cbi8vIGNvbnN0IHN0YXRlID0ge1xuLy8gIHBhbmVsczpbIC4uLiB7XG4vLyAgICAgeCwgeSwgZHgsIGR5LCBhZG9ybmVyU3RhdHVzOjBcbi8vICB9XSxcbi8vICBhY3RpdmU6e3gseX1cbi8vIH1cblxuXG5leHBvcnQgZGVmYXVsdCAoZ3JpZCA9IEdyaWQoKSkgPT4gKHN0YXRlID0ge2FjdGl2ZTogbnVsbCwgcGFuZWxzOiBbLi4uZ3JpZF19LCBhY3Rpb24pID0+IHtcbiAgc3dpdGNoIChhY3Rpb24udHlwZSkge1xuICAgIGNhc2UgJ1NUQVJUX1JFU0laRSc6IHtcbiAgICAgIGNvbnN0IHt4LCB5fT1hY3Rpb247XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHthY3RpdmU6IHt4LCB5fX0pO1xuICAgIH1cbiAgICBjYXNlICdSRVNJWkVfT1ZFUic6IHtcbiAgICAgIGNvbnN0IHt4LCB5fSA9YWN0aW9uO1xuICAgICAgY29uc3Qge2FjdGl2ZX0gPSBzdGF0ZTtcbiAgICAgIGNvbnN0IHt4OnN0YXJ0WCwgeTpzdGFydFl9ID0gYWN0aXZlO1xuICAgICAgaWYgKHggPj0gc3RhcnRYICYmIHkgPj0gc3RhcnRZKSB7XG4gICAgICAgIGNvbnN0IGR4ID0geCAtIHN0YXJ0WCArIDE7XG4gICAgICAgIGNvbnN0IGR5ID0geSAtIHN0YXJ0WSArIDE7XG4gICAgICAgIGNvbnN0IGFjdGl2ZUFyZWEgPSBncmlkLmFyZWEoc3RhcnRYLCBzdGFydFksIGR4LCBkeSk7XG4gICAgICAgIGNvbnN0IGluYWN0aXZlQXJlYSA9IGFjdGl2ZUFyZWEuY29tcGxlbWVudCgpO1xuICAgICAgICBjb25zdCBhbGxCdXRTdGFydCA9IGdyaWQuYXJlYShzdGFydFgsIHN0YXJ0WSkuY29tcGxlbWVudCgpO1xuICAgICAgICBjb25zdCBpbnZhbGlkQ2VsbHNBcmVhID0gWy4uLmFsbEJ1dFN0YXJ0XVxuICAgICAgICAgIC5tYXAocCA9PiBncmlkLnBhbmVsKHAueCwgcC55KSlcbiAgICAgICAgICAuZmlsdGVyKHAgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW50ZXJzZWN0aW9uID0gcC5pbnRlcnNlY3Rpb24oYWN0aXZlQXJlYSk7XG4gICAgICAgICAgICByZXR1cm4gaW50ZXJzZWN0aW9uLmxlbmd0aCA+IDAgJiYgYWN0aXZlQXJlYS5pbmNsdWRlcyhwKSA9PT0gZmFsc2U7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAucmVkdWNlKChhY2MsIGN1cnJlbnQpID0+IGFjYy51bmlvbihjdXJyZW50KSwgZ3JpZC5hcmVhKDEsIDEsIDAsIDApKTtcblxuICAgICAgICBmb3IgKGxldCB7eCwgeX0gb2YgaW5hY3RpdmVBcmVhKSB7XG4gICAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogMH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQge3gsIHl9IG9mIGFjdGl2ZUFyZWEpIHtcbiAgICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAxfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCB7eCwgeX0gb2YgaW52YWxpZENlbGxzQXJlYSkge1xuICAgICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IC0xfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtwYW5lbHM6IFsuLi5ncmlkXX0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXNlICdFTkRfUkVTSVpFJzoge1xuICAgICAgY29uc3Qge3gsIHksIHN0YXJ0WCwgc3RhcnRZfSA9YWN0aW9uO1xuICAgICAgY29uc3QgZHggPSB4IC0gc3RhcnRYICsgMTtcbiAgICAgIGNvbnN0IGR5ID0geSAtIHN0YXJ0WSArIDE7XG4gICAgICBpZiAoeCA+PSBzdGFydFggJiYgeSA+PSBzdGFydFkpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlQXJlYSA9IGdyaWQuYXJlYShzdGFydFgsIHN0YXJ0WSwgZHgsIGR5KTtcbiAgICAgICAgY29uc3QgYWxsQnV0U3RhcnQgPSBncmlkLmFyZWEoc3RhcnRYLCBzdGFydFkpLmNvbXBsZW1lbnQoKTtcbiAgICAgICAgY29uc3QgaW52YWxpZENlbGxzQXJlYSA9IFsuLi5hbGxCdXRTdGFydF1cbiAgICAgICAgICAubWFwKHAgPT4gZ3JpZC5wYW5lbChwLngsIHAueSkpXG4gICAgICAgICAgLmZpbHRlcihwID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGludGVyc2VjdGlvbiA9IHAuaW50ZXJzZWN0aW9uKGFjdGl2ZUFyZWEpO1xuICAgICAgICAgICAgcmV0dXJuIGludGVyc2VjdGlvbi5sZW5ndGggPiAwICYmIGFjdGl2ZUFyZWEuaW5jbHVkZXMocCkgPT09IGZhbHNlO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnJlZHVjZSgoYWNjLCBjdXJyZW50KSA9PiBhY2MudW5pb24oY3VycmVudCksIGdyaWQuYXJlYSgxLCAxLCAwLCAwKSk7XG5cbiAgICAgICAgY29uc3QgW2Jhc2VDZWxsLCAuLi5vdGhlckNlbGxzXSA9IGFjdGl2ZUFyZWE7XG5cbiAgICAgICAgaWYgKGludmFsaWRDZWxsc0FyZWEubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgZ3JpZC51cGRhdGVBdChzdGFydFgsIHN0YXJ0WSwge2R4LCBkeX0pO1xuICAgICAgICAgIGZvciAoY29uc3Qge3gsIHl9IG9mIG90aGVyQ2VsbHMpIHtcbiAgICAgICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2R4OiAxLCBkeTogMX0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGxldCB7eCwgeX0gb2YgWy4uLmdyaWRdKSB7XG4gICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IDB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICAgIHBhbmVsczogWy4uLmdyaWRdLFxuICAgICAgICBhY3RpdmU6IG51bGxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjYXNlICdVUERBVEVfUEFORUxfREFUQSc6IHtcbiAgICAgIC8vdG9kbyByZW1vdmUgZGF0YUNvbmYgb2YgaGlkZGVuIHBhbmVscyA/XG4gICAgICBjb25zdCB7eCwgeSwgZGF0YX0gPSBhY3Rpb247XG4gICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHtkYXRhfSk7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtwYW5lbHM6IFsuLi5ncmlkXX0pO1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHN0YXRlO1xuICB9XG59O1xuXG4iLCJleHBvcnQgZGVmYXVsdCAoZ3JpZCkgPT4gKHN0YXRlID0ge2lzT3BlbjogZmFsc2V9LCBhY3Rpb24pID0+IHtcbiAgY29uc3Qge3R5cGUsIHRpdGxlLCBtb2RhbFR5cGUsIHgsIHl9ID0gYWN0aW9uO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdPUEVOX01PREFMJzoge1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7aXNPcGVuOiB0cnVlLCB0aXRsZSwgbW9kYWxUeXBlLCB4LCB5fSk7XG4gICAgfVxuICAgIGNhc2UgJ0NMT1NFX01PREFMJzoge1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7aXNPcGVuOiBmYWxzZSwgdGl0bGU6JycsIG1vZGFsVHlwZTonbm9uZSd9KTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgfVxufTsiLCJleHBvcnQgZGVmYXVsdCAoc3RhdGUgPSBbXSwgYWN0aW9uKSA9PiB7XG4gIGNvbnN0IHt0eXBlfSA9IGFjdGlvbjtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnQ1JFQVRFX1NNQVJUX0xJU1QnOiB7XG4gICAgICBjb25zdCB7eCwgeSwgdGFibGVTdGF0ZSwgaXRlbXN9ID0gYWN0aW9uO1xuICAgICAgcmV0dXJuIHN0YXRlLmNvbmNhdCh7eCwgeSwgdGFibGVTdGF0ZSwgaXRlbXN9KTtcbiAgICB9XG4gICAgY2FzZSAnVVBEQVRFX1NNQVJUX0xJU1QnOiB7XG4gICAgICBjb25zdCB7eCwgeSwgdGFibGVTdGF0ZSwgaXRlbXN9ID0gYWN0aW9uO1xuICAgICAgcmV0dXJuIHN0YXRlLm1hcCgoc2wpID0+IHtcbiAgICAgICAgaWYgKHNsLnggPT09IHggJiYgc2wueSA9PT0geSkge1xuICAgICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzbCwge3RhYmxlU3RhdGUsIGl0ZW1zfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHNsO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgfVxufTsiLCJpbXBvcnQgZ3JpZFJlZHVjZXIgZnJvbSAnLi9ncmlkJztcbmltcG9ydCBtb2RhbFJlZHVjZXIgZnJvbSAnLi9tb2RhbCc7XG5pbXBvcnQgc21hcnRMaXN0UmVkdWNlciBmcm9tICcuL3NtYXJ0TGlzdCc7XG5cbmV4cG9ydCBkZWZhdWx0IChncmlkKSA9PiAoc3RhdGUgPSB7fSwgYWN0aW9uKSA9PiAoe1xuICBncmlkOiBncmlkUmVkdWNlcihncmlkKShzdGF0ZS5ncmlkLCBhY3Rpb24pLFxuICBtb2RhbDogbW9kYWxSZWR1Y2VyKGdyaWQpKHN0YXRlLm1vZGFsLCBhY3Rpb24pLFxuICBzbWFydExpc3Q6IHNtYXJ0TGlzdFJlZHVjZXIoc3RhdGUuc21hcnRMaXN0LCBhY3Rpb24pXG59KTtcbiIsImNvbnN0IGFjdGlvbkNyZWF0b3IgPSBhY3Rpb25OYW1lID0+IG9wdHMgPT4gKE9iamVjdC5hc3NpZ24oe3R5cGU6IGFjdGlvbk5hbWV9LCBvcHRzKSlcblxuZXhwb3J0IGNvbnN0IHJlc2l6ZU92ZXIgPSBhY3Rpb25DcmVhdG9yKCdSRVNJWkVfT1ZFUicpO1xuZXhwb3J0IGNvbnN0IGVuZFJlc2l6ZSA9IGFjdGlvbkNyZWF0b3IoJ0VORF9SRVNJWkUnKTtcbmV4cG9ydCBjb25zdCBzdGFydFJlc2l6ZSA9IGFjdGlvbkNyZWF0b3IoJ1NUQVJUX1JFU0laRScpO1xuZXhwb3J0IGNvbnN0IG9wZW5Nb2RhbCA9IGFjdGlvbkNyZWF0b3IoJ09QRU5fTU9EQUwnKTtcbmV4cG9ydCBjb25zdCBjbG9zZU1vZGFsID0gYWN0aW9uQ3JlYXRvcignQ0xPU0VfTU9EQUwnKTtcbmV4cG9ydCBjb25zdCB1cGRhdGVQYW5lbERhdGEgPSBhY3Rpb25DcmVhdG9yKCdVUERBVEVfUEFORUxfREFUQScpO1xuZXhwb3J0IGNvbnN0IHVwZGF0ZVNtYXJ0TGlzdCA9IGFjdGlvbkNyZWF0b3IoJ1VQREFURV9TTUFSVF9MSVNUJyk7XG5leHBvcnQgY29uc3QgY3JlYXRlU21hcnRMaXN0ID0gYWN0aW9uQ3JlYXRvcignQ1JFQVRFX1NNQVJUX0xJU1QnKTtcbmV4cG9ydCBjb25zdCBiaW5kQWN0aW9ucyA9IChzdG9yZSkgPT4gKCB7XG4gIHJlc2l6ZU92ZXI6IChhcmcpID0+IHN0b3JlLmRpc3BhdGNoKHJlc2l6ZU92ZXIoYXJnKSksXG4gIGVuZFJlc2l6ZTogKGFyZykgPT4gc3RvcmUuZGlzcGF0Y2goZW5kUmVzaXplKGFyZykpLFxuICBzdGFydFJlc2l6ZTogKGFyZykgPT4gc3RvcmUuZGlzcGF0Y2goc3RhcnRSZXNpemUoYXJnKSksXG4gIG9wZW5Nb2RhbDogKGFyZ3MpID0+IHN0b3JlLmRpc3BhdGNoKG9wZW5Nb2RhbChhcmdzKSksXG4gIGNsb3NlTW9kYWw6IChhcmdzKSA9PiBzdG9yZS5kaXNwYXRjaChjbG9zZU1vZGFsKGFyZ3MpKSxcbiAgdXBkYXRlUGFuZWxEYXRhOiAoYXJncykgPT4gc3RvcmUuZGlzcGF0Y2godXBkYXRlUGFuZWxEYXRhKGFyZ3MpKSxcbiAgdXBkYXRlU21hcnRMaXN0OiAoYXJncykgPT4gc3RvcmUuZGlzcGF0Y2godXBkYXRlU21hcnRMaXN0KGFyZ3MpKSxcbiAgY3JlYXRlU21hcnRMaXN0OiAoYXJncykgPT4gc3RvcmUuZGlzcGF0Y2goY3JlYXRlU21hcnRMaXN0KGFyZ3MpKVxufSk7IiwiLyoqXG4gKiBpbmplY3QgdGhlIGdyaWQgaW5zdGFuY2UgYW5kIGFjdGlvbnMgaW50byBhIGNvbXBvbmVudCBhcyBzZWNvbmQgYW5kIHRoaXJkIGFyZ3VtZW50c1xuICovXG5leHBvcnQgZGVmYXVsdCAoZ3JpZCwgYWN0aW9ucykgPT4gQ29tcCA9PiAocHJvcHMsIC4uLmFyZ3MpID0+IENvbXAocHJvcHMsIGdyaWQsIGFjdGlvbnMsIC4uLmFyZ3MpOyIsImV4cG9ydCBmdW5jdGlvbiBzd2FwIChmKSB7XG4gIHJldHVybiAoYSwgYikgPT4gZihiLCBhKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvc2UgKGZpcnN0LCAuLi5mbnMpIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiBmbnMucmVkdWNlKChwcmV2aW91cywgY3VycmVudCkgPT4gY3VycmVudChwcmV2aW91cyksIGZpcnN0KC4uLmFyZ3MpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGN1cnJ5IChmbiwgYXJpdHlMZWZ0KSB7XG4gIGNvbnN0IGFyaXR5ID0gYXJpdHlMZWZ0IHx8IGZuLmxlbmd0aDtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgY29uc3QgYXJnTGVuZ3RoID0gYXJncy5sZW5ndGggfHwgMTtcbiAgICBpZiAoYXJpdHkgPT09IGFyZ0xlbmd0aCkge1xuICAgICAgcmV0dXJuIGZuKC4uLmFyZ3MpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBmdW5jID0gKC4uLm1vcmVBcmdzKSA9PiBmbiguLi5hcmdzLCAuLi5tb3JlQXJncyk7XG4gICAgICByZXR1cm4gY3VycnkoZnVuYywgYXJpdHkgLSBhcmdzLmxlbmd0aCk7XG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHkgKGZuKSB7XG4gIHJldHVybiAoLi4uYXJncykgPT4gZm4oLi4uYXJncyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0YXAgKGZuKSB7XG4gIHJldHVybiBhcmcgPT4ge1xuICAgIGZuKGFyZyk7XG4gICAgcmV0dXJuIGFyZztcbiAgfVxufSIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHBvaW50ZXIgKHBhdGgpIHtcblxuICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcblxuICBmdW5jdGlvbiBwYXJ0aWFsIChvYmogPSB7fSwgcGFydHMgPSBbXSkge1xuICAgIGNvbnN0IHAgPSBwYXJ0cy5zaGlmdCgpO1xuICAgIGNvbnN0IGN1cnJlbnQgPSBvYmpbcF07XG4gICAgcmV0dXJuIChjdXJyZW50ID09PSB1bmRlZmluZWQgfHwgcGFydHMubGVuZ3RoID09PSAwKSA/XG4gICAgICBjdXJyZW50IDogcGFydGlhbChjdXJyZW50LCBwYXJ0cyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXQgKHRhcmdldCwgbmV3VHJlZSkge1xuICAgIGxldCBjdXJyZW50ID0gdGFyZ2V0O1xuICAgIGNvbnN0IFtsZWFmLCAuLi5pbnRlcm1lZGlhdGVdID0gcGFydHMucmV2ZXJzZSgpO1xuICAgIGZvciAobGV0IGtleSBvZiBpbnRlcm1lZGlhdGUucmV2ZXJzZSgpKSB7XG4gICAgICBpZiAoY3VycmVudFtrZXldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY3VycmVudFtrZXldID0ge307XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50W2tleV07XG4gICAgICB9XG4gICAgfVxuICAgIGN1cnJlbnRbbGVhZl0gPSBPYmplY3QuYXNzaWduKGN1cnJlbnRbbGVhZl0gfHwge30sIG5ld1RyZWUpO1xuICAgIHJldHVybiB0YXJnZXQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdldCh0YXJnZXQpe1xuICAgICAgcmV0dXJuIHBhcnRpYWwodGFyZ2V0LCBbLi4ucGFydHNdKVxuICAgIH0sXG4gICAgc2V0XG4gIH1cbn07XG4iLCJpbXBvcnQge3N3YXB9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG5cbmZ1bmN0aW9uIHNvcnRCeVByb3BlcnR5IChwcm9wKSB7XG4gIGNvbnN0IHByb3BHZXR0ZXIgPSBwb2ludGVyKHByb3ApLmdldDtcbiAgcmV0dXJuIChhLCBiKSA9PiB7XG4gICAgY29uc3QgYVZhbCA9IHByb3BHZXR0ZXIoYSk7XG4gICAgY29uc3QgYlZhbCA9IHByb3BHZXR0ZXIoYik7XG5cbiAgICBpZiAoYVZhbCA9PT0gYlZhbCkge1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgaWYgKGJWYWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGlmIChhVmFsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIHJldHVybiBhVmFsIDwgYlZhbCA/IC0xIDogMTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBzb3J0RmFjdG9yeSAoe3BvaW50ZXIsIGRpcmVjdGlvbn0gPSB7fSkge1xuICBpZiAoIXBvaW50ZXIgfHwgZGlyZWN0aW9uID09PSAnbm9uZScpIHtcbiAgICByZXR1cm4gYXJyYXkgPT4gWy4uLmFycmF5XTtcbiAgfVxuXG4gIGNvbnN0IG9yZGVyRnVuYyA9IHNvcnRCeVByb3BlcnR5KHBvaW50ZXIpO1xuICBjb25zdCBjb21wYXJlRnVuYyA9IGRpcmVjdGlvbiA9PT0gJ2Rlc2MnID8gc3dhcChvcmRlckZ1bmMpIDogb3JkZXJGdW5jO1xuXG4gIHJldHVybiAoYXJyYXkpID0+IFsuLi5hcnJheV0uc29ydChjb21wYXJlRnVuYyk7XG59IiwiaW1wb3J0IHtjb21wb3NlfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHBvaW50ZXIgZnJvbSAnc21hcnQtdGFibGUtanNvbi1wb2ludGVyJztcblxuZnVuY3Rpb24gdHlwZUV4cHJlc3Npb24gKHR5cGUpIHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gQm9vbGVhbjtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIE51bWJlcjtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiAodmFsKSA9PiBuZXcgRGF0ZSh2YWwpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gY29tcG9zZShTdHJpbmcsICh2YWwpID0+IHZhbC50b0xvd2VyQ2FzZSgpKTtcbiAgfVxufVxuXG5jb25zdCBvcGVyYXRvcnMgPSB7XG4gIGluY2x1ZGVzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dC5pbmNsdWRlcyh2YWx1ZSk7XG4gIH0sXG4gIGlzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBPYmplY3QuaXModmFsdWUsIGlucHV0KTtcbiAgfSxcbiAgaXNOb3QodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+ICFPYmplY3QuaXModmFsdWUsIGlucHV0KTtcbiAgfSxcbiAgbHQodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0IDwgdmFsdWU7XG4gIH0sXG4gIGd0KHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dCA+IHZhbHVlO1xuICB9LFxuICBsdGUodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0IDw9IHZhbHVlO1xuICB9LFxuICBndGUodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0ID49IHZhbHVlO1xuICB9LFxuICBlcXVhbHModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IHZhbHVlID09IGlucHV0O1xuICB9LFxuICBub3RFcXVhbHModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IHZhbHVlICE9IGlucHV0O1xuICB9XG59O1xuXG5jb25zdCBldmVyeSA9IGZucyA9PiAoLi4uYXJncykgPT4gZm5zLmV2ZXJ5KGZuID0+IGZuKC4uLmFyZ3MpKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHByZWRpY2F0ZSAoe3ZhbHVlID0gJycsIG9wZXJhdG9yID0gJ2luY2x1ZGVzJywgdHlwZSA9ICdzdHJpbmcnfSkge1xuICBjb25zdCB0eXBlSXQgPSB0eXBlRXhwcmVzc2lvbih0eXBlKTtcbiAgY29uc3Qgb3BlcmF0ZU9uVHlwZWQgPSBjb21wb3NlKHR5cGVJdCwgb3BlcmF0b3JzW29wZXJhdG9yXSk7XG4gIGNvbnN0IHByZWRpY2F0ZUZ1bmMgPSBvcGVyYXRlT25UeXBlZCh2YWx1ZSk7XG4gIHJldHVybiBjb21wb3NlKHR5cGVJdCwgcHJlZGljYXRlRnVuYyk7XG59XG5cbi8vYXZvaWQgdXNlbGVzcyBmaWx0ZXIgbG9va3VwIChpbXByb3ZlIHBlcmYpXG5mdW5jdGlvbiBub3JtYWxpemVDbGF1c2VzIChjb25mKSB7XG4gIGNvbnN0IG91dHB1dCA9IHt9O1xuICBjb25zdCB2YWxpZFBhdGggPSBPYmplY3Qua2V5cyhjb25mKS5maWx0ZXIocGF0aCA9PiBBcnJheS5pc0FycmF5KGNvbmZbcGF0aF0pKTtcbiAgdmFsaWRQYXRoLmZvckVhY2gocGF0aCA9PiB7XG4gICAgY29uc3QgdmFsaWRDbGF1c2VzID0gY29uZltwYXRoXS5maWx0ZXIoYyA9PiBjLnZhbHVlICE9PSAnJyk7XG4gICAgaWYgKHZhbGlkQ2xhdXNlcy5sZW5ndGgpIHtcbiAgICAgIG91dHB1dFtwYXRoXSA9IHZhbGlkQ2xhdXNlcztcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBmaWx0ZXIgKGZpbHRlcikge1xuICBjb25zdCBub3JtYWxpemVkQ2xhdXNlcyA9IG5vcm1hbGl6ZUNsYXVzZXMoZmlsdGVyKTtcbiAgY29uc3QgZnVuY0xpc3QgPSBPYmplY3Qua2V5cyhub3JtYWxpemVkQ2xhdXNlcykubWFwKHBhdGggPT4ge1xuICAgIGNvbnN0IGdldHRlciA9IHBvaW50ZXIocGF0aCkuZ2V0O1xuICAgIGNvbnN0IGNsYXVzZXMgPSBub3JtYWxpemVkQ2xhdXNlc1twYXRoXS5tYXAocHJlZGljYXRlKTtcbiAgICByZXR1cm4gY29tcG9zZShnZXR0ZXIsIGV2ZXJ5KGNsYXVzZXMpKTtcbiAgfSk7XG4gIGNvbnN0IGZpbHRlclByZWRpY2F0ZSA9IGV2ZXJ5KGZ1bmNMaXN0KTtcblxuICByZXR1cm4gKGFycmF5KSA9PiBhcnJheS5maWx0ZXIoZmlsdGVyUHJlZGljYXRlKTtcbn0iLCJpbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoc2VhcmNoQ29uZiA9IHt9KSB7XG4gIGNvbnN0IHt2YWx1ZSwgc2NvcGUgPSBbXX0gPSBzZWFyY2hDb25mO1xuICBjb25zdCBzZWFyY2hQb2ludGVycyA9IHNjb3BlLm1hcChmaWVsZCA9PiBwb2ludGVyKGZpZWxkKS5nZXQpO1xuICBpZiAoIXNjb3BlLmxlbmd0aCB8fCAhdmFsdWUpIHtcbiAgICByZXR1cm4gYXJyYXkgPT4gYXJyYXk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGFycmF5ID0+IGFycmF5LmZpbHRlcihpdGVtID0+IHNlYXJjaFBvaW50ZXJzLnNvbWUocCA9PiBTdHJpbmcocChpdGVtKSkuaW5jbHVkZXMoU3RyaW5nKHZhbHVlKSkpKVxuICB9XG59IiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gc2xpY2VGYWN0b3J5ICh7cGFnZSA9IDEsIHNpemV9ID0ge30pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHNsaWNlRnVuY3Rpb24gKGFycmF5ID0gW10pIHtcbiAgICBjb25zdCBhY3R1YWxTaXplID0gc2l6ZSB8fCBhcnJheS5sZW5ndGg7XG4gICAgY29uc3Qgb2Zmc2V0ID0gKHBhZ2UgLSAxKSAqIGFjdHVhbFNpemU7XG4gICAgcmV0dXJuIGFycmF5LnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgYWN0dWFsU2l6ZSk7XG4gIH07XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gZW1pdHRlciAoKSB7XG5cbiAgY29uc3QgbGlzdGVuZXJzTGlzdHMgPSB7fTtcbiAgY29uc3QgaW5zdGFuY2UgPSB7XG4gICAgb24oZXZlbnQsIC4uLmxpc3RlbmVycyl7XG4gICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSAobGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdKS5jb25jYXQobGlzdGVuZXJzKTtcbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9LFxuICAgIGRpc3BhdGNoKGV2ZW50LCAuLi5hcmdzKXtcbiAgICAgIGNvbnN0IGxpc3RlbmVycyA9IGxpc3RlbmVyc0xpc3RzW2V2ZW50XSB8fCBbXTtcbiAgICAgIGZvciAobGV0IGxpc3RlbmVyIG9mIGxpc3RlbmVycykge1xuICAgICAgICBsaXN0ZW5lciguLi5hcmdzKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9LFxuICAgIG9mZihldmVudCwgLi4ubGlzdGVuZXJzKXtcbiAgICAgIGlmICghZXZlbnQpIHtcbiAgICAgICAgT2JqZWN0LmtleXMobGlzdGVuZXJzTGlzdHMpLmZvckVhY2goZXYgPT4gaW5zdGFuY2Uub2ZmKGV2KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBsaXN0ID0gbGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdO1xuICAgICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSBsaXN0ZW5lcnMubGVuZ3RoID8gbGlzdC5maWx0ZXIobGlzdGVuZXIgPT4gIWxpc3RlbmVycy5pbmNsdWRlcyhsaXN0ZW5lcikpIDogW107XG4gICAgICB9XG4gICAgICByZXR1cm4gaW5zdGFuY2U7XG4gICAgfVxuICB9O1xuICByZXR1cm4gaW5zdGFuY2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm94eUxpc3RlbmVyIChldmVudE1hcCkge1xuICByZXR1cm4gZnVuY3Rpb24gKHtlbWl0dGVyfSkge1xuXG4gICAgY29uc3QgcHJveHkgPSB7fTtcbiAgICBsZXQgZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuICAgIGZvciAobGV0IGV2IG9mIE9iamVjdC5rZXlzKGV2ZW50TWFwKSkge1xuICAgICAgY29uc3QgbWV0aG9kID0gZXZlbnRNYXBbZXZdO1xuICAgICAgZXZlbnRMaXN0ZW5lcnNbZXZdID0gW107XG4gICAgICBwcm94eVttZXRob2RdID0gZnVuY3Rpb24gKC4uLmxpc3RlbmVycykge1xuICAgICAgICBldmVudExpc3RlbmVyc1tldl0gPSBldmVudExpc3RlbmVyc1tldl0uY29uY2F0KGxpc3RlbmVycyk7XG4gICAgICAgIGVtaXR0ZXIub24oZXYsIC4uLmxpc3RlbmVycyk7XG4gICAgICAgIHJldHVybiBwcm94eTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJveHksIHtcbiAgICAgIG9mZihldil7XG4gICAgICAgIGlmICghZXYpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhldmVudExpc3RlbmVycykuZm9yRWFjaChldmVudE5hbWUgPT4gcHJveHkub2ZmKGV2ZW50TmFtZSkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChldmVudExpc3RlbmVyc1tldl0pIHtcbiAgICAgICAgICBlbWl0dGVyLm9mZihldiwgLi4uZXZlbnRMaXN0ZW5lcnNbZXZdKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcHJveHk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn0iLCJleHBvcnQgY29uc3QgVE9HR0xFX1NPUlQgPSAnVE9HR0xFX1NPUlQnO1xuZXhwb3J0IGNvbnN0IERJU1BMQVlfQ0hBTkdFRCA9ICdESVNQTEFZX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFBBR0VfQ0hBTkdFRCA9ICdDSEFOR0VfUEFHRSc7XG5leHBvcnQgY29uc3QgRVhFQ19DSEFOR0VEID0gJ0VYRUNfQ0hBTkdFRCc7XG5leHBvcnQgY29uc3QgRklMVEVSX0NIQU5HRUQgPSAnRklMVEVSX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFNVTU1BUllfQ0hBTkdFRCA9ICdTVU1NQVJZX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFNFQVJDSF9DSEFOR0VEID0gJ1NFQVJDSF9DSEFOR0VEJztcbmV4cG9ydCBjb25zdCBFWEVDX0VSUk9SID0gJ0VYRUNfRVJST1InOyIsImltcG9ydCBzbGljZSBmcm9tICcuLi9zbGljZSc7XG5pbXBvcnQge2N1cnJ5LCB0YXAsIGNvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuaW1wb3J0IHtlbWl0dGVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuaW1wb3J0IHNsaWNlRmFjdG9yeSBmcm9tICcuLi9zbGljZSc7XG5pbXBvcnQge1xuICBTVU1NQVJZX0NIQU5HRUQsXG4gIFRPR0dMRV9TT1JULFxuICBESVNQTEFZX0NIQU5HRUQsXG4gIFBBR0VfQ0hBTkdFRCxcbiAgRVhFQ19DSEFOR0VELFxuICBGSUxURVJfQ0hBTkdFRCxcbiAgU0VBUkNIX0NIQU5HRUQsXG4gIEVYRUNfRVJST1Jcbn0gZnJvbSAnLi4vZXZlbnRzJztcblxuZnVuY3Rpb24gY3VycmllZFBvaW50ZXIgKHBhdGgpIHtcbiAgY29uc3Qge2dldCwgc2V0fSA9IHBvaW50ZXIocGF0aCk7XG4gIHJldHVybiB7Z2V0LCBzZXQ6IGN1cnJ5KHNldCl9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe1xuICBzb3J0RmFjdG9yeSxcbiAgdGFibGVTdGF0ZSxcbiAgZGF0YSxcbiAgZmlsdGVyRmFjdG9yeSxcbiAgc2VhcmNoRmFjdG9yeVxufSkge1xuICBjb25zdCB0YWJsZSA9IGVtaXR0ZXIoKTtcbiAgY29uc3Qgc29ydFBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc29ydCcpO1xuICBjb25zdCBzbGljZVBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc2xpY2UnKTtcbiAgY29uc3QgZmlsdGVyUG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdmaWx0ZXInKTtcbiAgY29uc3Qgc2VhcmNoUG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdzZWFyY2gnKTtcblxuICBjb25zdCBzYWZlQXNzaWduID0gY3VycnkoKGJhc2UsIGV4dGVuc2lvbikgPT4gT2JqZWN0LmFzc2lnbih7fSwgYmFzZSwgZXh0ZW5zaW9uKSk7XG4gIGNvbnN0IGRpc3BhdGNoID0gY3VycnkodGFibGUuZGlzcGF0Y2guYmluZCh0YWJsZSksIDIpO1xuXG4gIGNvbnN0IGRpc3BhdGNoU3VtbWFyeSA9IChmaWx0ZXJlZCkgPT4ge1xuICAgIGRpc3BhdGNoKFNVTU1BUllfQ0hBTkdFRCwge1xuICAgICAgcGFnZTogdGFibGVTdGF0ZS5zbGljZS5wYWdlLFxuICAgICAgc2l6ZTogdGFibGVTdGF0ZS5zbGljZS5zaXplLFxuICAgICAgZmlsdGVyZWRDb3VudDogZmlsdGVyZWQubGVuZ3RoXG4gICAgfSk7XG4gIH07XG5cbiAgY29uc3QgZXhlYyA9ICh7cHJvY2Vzc2luZ0RlbGF5ID0gMjB9ID0ge30pID0+IHtcbiAgICB0YWJsZS5kaXNwYXRjaChFWEVDX0NIQU5HRUQsIHt3b3JraW5nOiB0cnVlfSk7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaWx0ZXJGdW5jID0gZmlsdGVyRmFjdG9yeShmaWx0ZXJQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IHNlYXJjaEZ1bmMgPSBzZWFyY2hGYWN0b3J5KHNlYXJjaFBvaW50ZXIuZ2V0KHRhYmxlU3RhdGUpKTtcbiAgICAgICAgY29uc3Qgc29ydEZ1bmMgPSBzb3J0RmFjdG9yeShzb3J0UG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICBjb25zdCBzbGljZUZ1bmMgPSBzbGljZUZhY3Rvcnkoc2xpY2VQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IGV4ZWNGdW5jID0gY29tcG9zZShmaWx0ZXJGdW5jLCBzZWFyY2hGdW5jLCB0YXAoZGlzcGF0Y2hTdW1tYXJ5KSwgc29ydEZ1bmMsIHNsaWNlRnVuYyk7XG4gICAgICAgIGNvbnN0IGRpc3BsYXllZCA9IGV4ZWNGdW5jKGRhdGEpO1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChESVNQTEFZX0NIQU5HRUQsIGRpc3BsYXllZC5tYXAoZCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHtpbmRleDogZGF0YS5pbmRleE9mKGQpLCB2YWx1ZTogZH07XG4gICAgICAgIH0pKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGFibGUuZGlzcGF0Y2goRVhFQ19FUlJPUiwgZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChFWEVDX0NIQU5HRUQsIHt3b3JraW5nOiBmYWxzZX0pO1xuICAgICAgfVxuICAgIH0sIHByb2Nlc3NpbmdEZWxheSk7XG4gIH07XG5cbiAgY29uc3QgdXBkYXRlVGFibGVTdGF0ZSA9IGN1cnJ5KChwdGVyLCBldiwgbmV3UGFydGlhbFN0YXRlKSA9PiBjb21wb3NlKFxuICAgIHNhZmVBc3NpZ24ocHRlci5nZXQodGFibGVTdGF0ZSkpLFxuICAgIHRhcChkaXNwYXRjaChldikpLFxuICAgIHB0ZXIuc2V0KHRhYmxlU3RhdGUpXG4gICkobmV3UGFydGlhbFN0YXRlKSk7XG5cbiAgY29uc3QgcmVzZXRUb0ZpcnN0UGFnZSA9ICgpID0+IHVwZGF0ZVRhYmxlU3RhdGUoc2xpY2VQb2ludGVyLCBQQUdFX0NIQU5HRUQsIHtwYWdlOiAxfSk7XG5cbiAgY29uc3QgdGFibGVPcGVyYXRpb24gPSAocHRlciwgZXYpID0+IGNvbXBvc2UoXG4gICAgdXBkYXRlVGFibGVTdGF0ZShwdGVyLCBldiksXG4gICAgcmVzZXRUb0ZpcnN0UGFnZSxcbiAgICAoKSA9PiB0YWJsZS5leGVjKCkgLy8gd2Ugd3JhcCB3aXRoaW4gYSBmdW5jdGlvbiBzbyB0YWJsZS5leGVjIGNhbiBiZSBvdmVyd3JpdHRlbiAod2hlbiB1c2luZyB3aXRoIGEgc2VydmVyIGZvciBleGFtcGxlKVxuICApO1xuXG4gIGNvbnN0IGFwaSA9IHtcbiAgICBzb3J0OiB0YWJsZU9wZXJhdGlvbihzb3J0UG9pbnRlciwgVE9HR0xFX1NPUlQpLFxuICAgIGZpbHRlcjogdGFibGVPcGVyYXRpb24oZmlsdGVyUG9pbnRlciwgRklMVEVSX0NIQU5HRUQpLFxuICAgIHNlYXJjaDogdGFibGVPcGVyYXRpb24oc2VhcmNoUG9pbnRlciwgU0VBUkNIX0NIQU5HRUQpLFxuICAgIHNsaWNlOiBjb21wb3NlKHVwZGF0ZVRhYmxlU3RhdGUoc2xpY2VQb2ludGVyLCBQQUdFX0NIQU5HRUQpLCAoKSA9PiB0YWJsZS5leGVjKCkpLFxuICAgIGV4ZWMsXG4gICAgZXZhbChzdGF0ZSA9IHRhYmxlU3RhdGUpe1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBjb25zdCBzb3J0RnVuYyA9IHNvcnRGYWN0b3J5KHNvcnRQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IHNlYXJjaEZ1bmMgPSBzZWFyY2hGYWN0b3J5KHNlYXJjaFBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgY29uc3QgZmlsdGVyRnVuYyA9IGZpbHRlckZhY3RvcnkoZmlsdGVyUG9pbnRlci5nZXQoc3RhdGUpKTtcbiAgICAgICAgICBjb25zdCBzbGljZUZ1bmMgPSBzbGljZUZhY3Rvcnkoc2xpY2VQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IGV4ZWNGdW5jID0gY29tcG9zZShmaWx0ZXJGdW5jLCBzZWFyY2hGdW5jLCBzb3J0RnVuYywgc2xpY2VGdW5jKTtcbiAgICAgICAgICByZXR1cm4gZXhlY0Z1bmMoZGF0YSkubWFwKGQgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogZGF0YS5pbmRleE9mKGQpLCB2YWx1ZTogZH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICBvbkRpc3BsYXlDaGFuZ2UoZm4pe1xuICAgICAgdGFibGUub24oRElTUExBWV9DSEFOR0VELCBmbik7XG4gICAgfSxcbiAgICBnZXRUYWJsZVN0YXRlKCl7XG4gICAgICBjb25zdCBzb3J0ID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zb3J0KTtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IE9iamVjdC5hc3NpZ24oe30sIHRhYmxlU3RhdGUuc2VhcmNoKTtcbiAgICAgIGNvbnN0IHNsaWNlID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zbGljZSk7XG4gICAgICBjb25zdCBmaWx0ZXIgPSB7fTtcbiAgICAgIGZvciAobGV0IHByb3AgaW4gdGFibGVTdGF0ZS5maWx0ZXIpIHtcbiAgICAgICAgZmlsdGVyW3Byb3BdID0gdGFibGVTdGF0ZS5maWx0ZXJbcHJvcF0ubWFwKHYgPT4gT2JqZWN0LmFzc2lnbih7fSwgdikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtzb3J0LCBzZWFyY2gsIHNsaWNlLCBmaWx0ZXJ9O1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBpbnN0YW5jZSA9IE9iamVjdC5hc3NpZ24odGFibGUsIGFwaSk7XG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGluc3RhbmNlLCAnbGVuZ3RoJywge1xuICAgIGdldCgpe1xuICAgICAgcmV0dXJuIGRhdGEubGVuZ3RoO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGluc3RhbmNlO1xufSIsImltcG9ydCBzb3J0IGZyb20gJ3NtYXJ0LXRhYmxlLXNvcnQnO1xuaW1wb3J0IGZpbHRlciBmcm9tICdzbWFydC10YWJsZS1maWx0ZXInO1xuaW1wb3J0IHNlYXJjaCBmcm9tICdzbWFydC10YWJsZS1zZWFyY2gnO1xuaW1wb3J0IHRhYmxlIGZyb20gJy4vZGlyZWN0aXZlcy90YWJsZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7XG4gIHNvcnRGYWN0b3J5ID0gc29ydCxcbiAgZmlsdGVyRmFjdG9yeSA9IGZpbHRlcixcbiAgc2VhcmNoRmFjdG9yeSA9IHNlYXJjaCxcbiAgdGFibGVTdGF0ZSA9IHtzb3J0OiB7fSwgc2xpY2U6IHtwYWdlOiAxfSwgZmlsdGVyOiB7fSwgc2VhcmNoOiB7fX0sXG4gIGRhdGEgPSBbXVxufSwgLi4udGFibGVEaXJlY3RpdmVzKSB7XG5cbiAgY29uc3QgY29yZVRhYmxlID0gdGFibGUoe3NvcnRGYWN0b3J5LCBmaWx0ZXJGYWN0b3J5LCB0YWJsZVN0YXRlLCBkYXRhLCBzZWFyY2hGYWN0b3J5fSk7XG5cbiAgcmV0dXJuIHRhYmxlRGlyZWN0aXZlcy5yZWR1Y2UoKGFjY3VtdWxhdG9yLCBuZXdkaXIpID0+IHtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihhY2N1bXVsYXRvciwgbmV3ZGlyKHtcbiAgICAgIHNvcnRGYWN0b3J5LFxuICAgICAgZmlsdGVyRmFjdG9yeSxcbiAgICAgIHNlYXJjaEZhY3RvcnksXG4gICAgICB0YWJsZVN0YXRlLFxuICAgICAgZGF0YSxcbiAgICAgIHRhYmxlOiBjb3JlVGFibGVcbiAgICB9KSk7XG4gIH0sIGNvcmVUYWJsZSk7XG59IiwiaW1wb3J0IHRhYmxlRGlyZWN0aXZlIGZyb20gJy4vc3JjL3RhYmxlJztcbmltcG9ydCBmaWx0ZXJEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9maWx0ZXInO1xuaW1wb3J0IHNlYXJjaERpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3NlYXJjaCc7XG5pbXBvcnQgc2xpY2VEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zbGljZSc7XG5pbXBvcnQgc29ydERpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3NvcnQnO1xuaW1wb3J0IHN1bW1hcnlEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zdW1tYXJ5JztcbmltcG9ydCB3b3JraW5nSW5kaWNhdG9yRGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvd29ya2luZ0luZGljYXRvcic7XG5cbmV4cG9ydCBjb25zdCBzZWFyY2ggPSBzZWFyY2hEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgc2xpY2UgPSBzbGljZURpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBzdW1tYXJ5ID0gc3VtbWFyeURpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBzb3J0ID0gc29ydERpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBmaWx0ZXIgPSBmaWx0ZXJEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgd29ya2luZ0luZGljYXRvciA9IHdvcmtpbmdJbmRpY2F0b3JEaXJlY3RpdmU7XG5leHBvcnQgY29uc3QgdGFibGUgPSB0YWJsZURpcmVjdGl2ZTtcbmV4cG9ydCBkZWZhdWx0IHRhYmxlO1xuIiwiZXhwb3J0IGRlZmF1bHQgW1xuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3Ny9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3N1wiLFxuICAgIFwiaWRcIjogMjMzMTIwNTQ4LFxuICAgIFwibnVtYmVyXCI6IDc3NyxcbiAgICBcInRpdGxlXCI6IFwiQWRqdXN0bWVudHMgZm9yIEFuZ3VsYXIgMS42XCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJNcldvb2tcIixcbiAgICAgIFwiaWRcIjogMjAyOTQwNDIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzIwMjk0MDQyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29va1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9Ncldvb2tcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA2LTAyVDA5OjA1OjA2WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDYtMDZUMTU6MDQ6NDJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzc3XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3XCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3LmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3LnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIkNhdGNoIHRpbWVvdXQgcHJvbWlzZSBvbiBjYW5jZWwgYmVjYXVzZSBpdCB3aWxsIHRocm93IGFuIGVycm9yIGluIEFuZ3VsYXIgMS42XCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzUvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NVwiLFxuICAgIFwiaWRcIjogMjMyOTM5MDI0LFxuICAgIFwibnVtYmVyXCI6IDc3NSxcbiAgICBcInRpdGxlXCI6IFwiSG93IHRvIHNvcnQgd2hlbiBtb3JlIHRoYW4gb25lIHNpbmdsZSBwcm9wZXJ0eSB2YWx1ZSBpcyBnaXZlbiBwcm8gY29sdW1uIFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiYnZhaGRhdFwiLFxuICAgICAgXCJpZFwiOiAzMTIyMTc3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS8zMTIyMTc3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vYnZhaGRhdFwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDYtMDFUMTY6MzY6MTNaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNi0wMVQxODo1Mzo0NFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIlVzaW5nIGBhbmd1bGFyanMgMS41LjlgIGFzc3VtZSB0d28gZ2l2ZW4gcHJvcGVydGllcyBzdWNoIGFzIGBmb29gIGFuZCBgYmFyYCBiZWluZyBib3VuZCB0byBhIHNpbmdsZSBjb2x1bW4uXFxyXFxuSXMgdGhlcmUgYW55IHdheSB0byBpbnN0cnVjdCBgc3Qtc29ydGAgdG8gZWl0aGVyIHNvcnQgYWNjb3JkaW5nIHRvIHRoZSBgZm9vYCBvciBgYmFyYCB2YWx1ZXMuIFRoYXQncyBzb21ldGhpbmcgYWxvbmcgdGhlIGZvbGxvd2luZyBsaW5lczpcXHJcXG5cXHJcXG5gYGBodG1sXFxyXFxuPHRoIHN0LXNvcnQ9XFxcIltmaXJzdE5hbWUsIGxhc3ROYW1lXVxcXCI+Zmlyc3QgbmFtZSA8YnIgLz4gbGFzdCBuYW1lPC90aD5cXHJcXG5gYGBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzRcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzQvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzQvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc0XCIsXG4gICAgXCJpZFwiOiAyMzAxMTg2NTMsXG4gICAgXCJudW1iZXJcIjogNzc0LFxuICAgIFwidGl0bGVcIjogXCJTbWFydCBUYWJsZSBwYWdpbmcgaXMgc2hvd2luZyBtb3JlIHBhZ2VzIHRoYW4gZXhwZWN0ZWRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIm1vc3RhZmFhc2FkXCIsXG4gICAgICBcImlkXCI6IDc2MjU1MzAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzc2MjU1MzA/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbW9zdGFmYWFzYWRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjI1ODYyNDIzLFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL25vdCUyMHJlcHJvZHVjaWJsZVwiLFxuICAgICAgICBcIm5hbWVcIjogXCJub3QgcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwiY29sb3JcIjogXCJlYjY0MjBcIixcbiAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBcImlkXCI6IDI1OTQzODUwNixcbiAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2xhYmVscy90byUyMGJlJTIwY2xvc2VkOiUyMGRvZXMlMjBub3QlMjBmb2xsb3clMjBndWlkZWxpbmVzXCIsXG4gICAgICAgIFwibmFtZVwiOiBcInRvIGJlIGNsb3NlZDogZG9lcyBub3QgZm9sbG93IGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImZiY2EwNFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH1cbiAgICBdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAzLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDUtMjBUMDA6NDE6NDFaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNS0yMlQxODozOTo1MVpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgYW0gdXNpbmcgU21hcnQgdGFibGUgaW4gYW5ndWxhcmpzIGFwcGxpY2F0aW9uLiBJbiB0aGUgcGFnaW5hdGlvbiBpdCBpcyBzaG93aW5nIGV4dHJhIHBhZ2VzIHdoaWNoIGRvbid0IGhhdmUgdGhlIGRhdGEuIEhvdyBjYW4gSSBkaXNwbGF5IHRoZSBleGFjdCBudW1iZXIgb2YgcGFnZXMgaW5zdGVhZCBvZiBleHRyYSBwYWdlcz9cXHJcXG5cXHJcXG5Gb3IgY2xhcmlmaWNhdGlvbiwgSSBoYXZlIDk0IHJlY29yZHMsIDE1IHBlciBwYWdlIHNvIHRoZXJlIHdpbGwgYmUgNyBwYWdlcyAsIGJ1dCB0aGUgcGFnaW5hdGlvbiBpcyBzaG93aW5nIDEwIHBhZ2VzLCBhZnRlciA3dGggcGFnZSB0aGVyZSBpcyBubyBkYXRhIGluIDgtMTB0aCBwYWdlcy5cXHJcXG5QbGVhc2Ugc3VnZ2VzdCBob3cgY2FuIEkgcmVzb2x2ZSB0aGlzLlxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3M1wiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzczL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3My9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3My9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczXCIsXG4gICAgXCJpZFwiOiAyMjcyNzU5MDAsXG4gICAgXCJudW1iZXJcIjogNzczLFxuICAgIFwidGl0bGVcIjogXCJGaXg6IFBhcnNlIGluaXRpYWwgcHJlZGljYXRlIGNvcnJlY3RseVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiZzAwZnktXCIsXG4gICAgICBcImlkXCI6IDg0MzgwNyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODQzODA3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9nMDBmeS1cIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA1LTA5VDA3OjM1OjE2WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDUtMDlUMDc6NDc6MzZaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzczXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczXCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczLmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczLnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIlRoaXMgYnVnIGNhdXNlZCBvdGhlciBwbHVnaW5zIG5vdCB0byB3b3JrIGNvcnJlY3RseS5cXHJcXG5UaGUgaW5pdGlhbCBwcmVkaWNhdGUgd2Fzbid0IHBhcnNlZCB0aGUgc2FtZSB3YXkgaXQgd2FzIHBhcnNlZCBhZnRlciBjbGljayAtIHdoaWNoIHJlc3VsdGVkIGluIHRoZSBhcnJvd3Mgbm90IHBvaW50aW5nIHRoZSByaWdodCBkaXJlY3Rpb24uXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MlwiLFxuICAgIFwiaWRcIjogMjI1NDIyOTkyLFxuICAgIFwibnVtYmVyXCI6IDc3MixcbiAgICBcInRpdGxlXCI6IFwiUmVmcmVzaCB0YWJsZSB3aXRoIHdpdGggb3V0IHBhZ2UgbG9hZFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic21vaGFtbWVkeWFzaW5cIixcbiAgICAgIFwiaWRcIjogMjU1NjUxNDIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzI1NTY1MTQyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3Ntb2hhbW1lZHlhc2luXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNS0wMVQxMTo0MjoxMVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA1LTAxVDE4OjEyOjQ3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGVsbG8sXFxyXFxuXFxyXFxuVGhpcyBpcyBub3QgYW4gaXNzdWUsXFxyXFxuXFxyXFxuSSB3YW50IHRvIGtub3cgaG93IHRvIHJlZnJlc2ggdGFibGUgd2l0aCBvdXQgcmVsb2FkIGNvbXBsZXRlIHBhZ2UuIGFuZCBpJ20gdXNpbmcgaHR0cCQgZm9yIENSVURcXHJcXG5cXHJcXG5wbGVhc2UgZ2l2ZSBtZSBhbnkgZXhhbXBsZSB3aGljaCBpcyB1c2luZyBzZXJ2ZXIgc2lkZSBkYXRhLlxcclxcblxcclxcbkFwcHJlY2lhdGUgZm9yIHF1aWNrIGFuZCBiZXN0IHJlc3BvbnNlLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcxL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzcxXCIsXG4gICAgXCJpZFwiOiAyMjUzMzE3ODYsXG4gICAgXCJudW1iZXJcIjogNzcxLFxuICAgIFwidGl0bGVcIjogXCJDdXN0b20gZmlsdGVyc1wiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwicmljaGFyZC1hdXN0aW5cIixcbiAgICAgIFwiaWRcIjogMTQzMTY0NjYsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0MzE2NDY2P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3JpY2hhcmQtYXVzdGluXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNC0zMFQxNDo0OTo1MlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA0LTMwVDE0OjQ5OjUyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc3MVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MVwiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MS5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MS5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzBcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzAvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzAvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcwXCIsXG4gICAgXCJpZFwiOiAyMjQxNjExOTUsXG4gICAgXCJudW1iZXJcIjogNzcwLFxuICAgIFwidGl0bGVcIjogXCJGaWx0ZXIgd2l0aCBjbGljayBvZiBhIGJ1dHRvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiRm9zc2lsMDFcIixcbiAgICAgIFwiaWRcIjogODgzMjY4NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODgzMjY4Nz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9Gb3NzaWwwMVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDQtMjVUMTQ6Mzg6MTZaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNC0yNlQxMjozNDo1M1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgd291bGQgbGlrZSB0byBmaWx0ZXIgc29tZSB0YWJsZSBjb2x1bW5zIGJ5IHRoZSBjbGljayBvZiBhIGJ1dHRvbi4gSXMgdGhpcyBwb3NzaWJsZSBhbmQgaWYgc28sIGhvdz9cXHJcXG5cXHJcXG5MZXRzIHNheSBJIGhhdmUgYSBjb2x1bW4gVVNFUlMgd2l0aCAzIHJvd3M6IEpvaG4sIEpvaG4sIFdpbGxpYW0uXFxyXFxuXFxyXFxuTm93IEkgaGF2ZSBhIGJ1dHRvbjpcXHJcXG5gPGJ1dHRvbiBuZy1jbGljaz1cXFwiZmlsdGVyKCdKb2huJylcXFwiPkpvaG48L2J1dHRvbj5gXFxyXFxuVGhpcyBzaG91bGQgbWFrZSB0aGUgdGFibGUgb25seSBzaG93IFVzZXJzLkpvaG4uXFxyXFxuXFxyXFxuVGhpcyBidXR0b24gd291bGQgcHJlZmVyYWJseSBiZSBwbGFjZWQgb3V0c2lkZSBvZiB0aGUgdGFibGUuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NjkvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc2OVwiLFxuICAgIFwiaWRcIjogMjIxNzUyNzIwLFxuICAgIFwibnVtYmVyXCI6IDc2OSxcbiAgICBcInRpdGxlXCI6IFwiU29ydGluZyB3aXRoIGFzeW5jaHJvbm91c2x5IHJlY2VpdmVkIGRhdGFcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImJsYWNraGVhcnRlZFwiLFxuICAgICAgXCJpZFwiOiA0NjAxNzE3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS80NjAxNzE3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9ibGFja2hlYXJ0ZWRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA0LTE0VDA2OjQ0OjA4WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDQtMTRUMTQ6MDE6MjZaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJJZiBkYXRhIGlzIHJlY2VpdmVkIGFzeW5jaHJvbm91c2x5IGFuZCBub3QgYXZhaWxhYmxlIGF0IHRoZSBtb21lbnQgb2YgdGFibGUgY3JlYXRpb24gLSB0YWJsZSBpcyBzb3J0ZWQgZGlmZmVyZW50bHkuXFxyXFxuXFxyXFxuRGF0YSBcXFwicmVjZWl2ZWRcXFwiXFxyXFxuJHNjb3BlLmRpc3BsYXllZC5wdXNoKHtcXHJcXG4gICAgICAgIGZpcnN0TmFtZTogXFxcIkExXFxcIixcXHJcXG4gICAgICAgIGJhbGFuY2U6IDMwMFxcclxcbiAgICAgIH0pO1xcclxcbiAgICAgICRzY29wZS5kaXNwbGF5ZWQucHVzaCh7XFxyXFxuICAgICAgICBmaXJzdE5hbWU6IFxcXCJBMlxcXCIsXFxyXFxuICAgICAgICBiYWxhbmNlOiAyMDBcXHJcXG4gICAgICB9KTtcXHJcXG4gICAgICAkc2NvcGUuZGlzcGxheWVkLnB1c2goe1xcclxcbiAgICAgICAgZmlyc3ROYW1lOiBcXFwiQTNcXFwiLFxcclxcbiAgICAgICAgYmFsYW5jZTogMTAwXFxyXFxuICAgICAgfSk7XFxyXFxuXFxyXFxuSWYgaXQgaXMgd2l0aGluICR0aW1lb3V0IHRhYmxlIHdpbGwgbG9vayBsaWtlLiBOb3RlIHNvcnRpbmcgaWNvbiBvbiBiYWxhbmNlIGNvbHVtbiBpcyB3cm9uZzpcXHJcXG5odHRwOi8vcGxua3IuY28vZWRpdC84QjBKeThicTFCRFBkblU2YkZHbD9wPXByZXZpZXdcXHJcXG5maXJzdCBuYW1lXFx0YmFsYW5jZVxcclxcbkExXFx0ICAgICAgICAgICAgICAgIDMwMFxcclxcbkEyXFx0ICAgICAgICAgICAgICAgIDIwMFxcclxcbkEzXFx0ICAgICAgICAgICAgICAgIDEwMFxcclxcblxcclxcbklmIGl0IGlzIHN5bmNocm9ub3VzOlxcclxcbmh0dHA6Ly9wbG5rci5jby9lZGl0L3J1ZjJMdW5ERjNwUVVNWENEMFp6P3A9cHJldmlld1xcclxcbmZpcnN0IG5hbWVcXHRiYWxhbmNlXFxyXFxuQTNcXHQgICAgICAgICAgICAgICAgMTAwXFxyXFxuQTJcXHQgICAgICAgICAgICAgICAgMjAwXFxyXFxuQTFcXHQgICAgICAgICAgICAgICAgMzAwXFxyXFxuXFxyXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NTRcIixcbiAgICBcImlkXCI6IDIxMTk0ODk2MyxcbiAgICBcIm51bWJlclwiOiA3NTQsXG4gICAgXCJ0aXRsZVwiOiBcImFsbG93IGltcGxpY2l0IHRydWUgYXR0cmlidXRlcyBpbiBzdFNvcnRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImRiZWluZGVyXCIsXG4gICAgICBcImlkXCI6IDM0Mjk1NSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMzQyOTU1P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2RiZWluZGVyXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMy0wNVQxMjoxNzoyN1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAzLTA1VDEyOjE3OjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc1NFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NFwiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NC5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NC5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJUaGlzIHdvdWxkIGFsbG93IHNob3J0ZXIgYXR0cmlidXRlcyBvbiB0aGUgc29ydCBhdHRyaWJ1dGVzLCBhbmQgZGVmYXVsdHMgXFxcIlxcXCIgdG8gdHJ1ZSBwcm92aWRlZCB0aGUgYXR0cmlidXRlIGlzIGRlZmluZWQuXFxyXFxuYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3QtZGVzY2VuZGluZy1maXJzdD1cXFwidHJ1ZVxcXCIgLz5gIHRvIGA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LWRlc2NlbmRpbmctZmlyc3QgLz5gIFxcclxcbmA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNraXAtbmF0dXJhbD1cXFwidHJ1ZVxcXCIgLz5gIHRvIGA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNraXAtbmF0dXJhbCAvPmAgXFxyXFxuYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3Qtc29ydC1kZWZhdWx0PVxcXCJ0cnVlXFxcIiAvPmAgdG8gYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3Qtc29ydC1kZWZhdWx0IC8+YCBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1My9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUzXCIsXG4gICAgXCJpZFwiOiAyMTE2MjY4MzQsXG4gICAgXCJudW1iZXJcIjogNzUzLFxuICAgIFwidGl0bGVcIjogXCJTYWZlIHNyYyB3YXRjaCBjb2xsZWN0aW9uXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJ2aWFuZGFudGVvc2N1cm9cIixcbiAgICAgIFwiaWRcIjogNDIzNTA3OSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczMuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvNDIzNTA3OT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm9cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vdmlhbmRhbnRlb3NjdXJvXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMy0wM1QwODozOTo0OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAzLTAzVDA4OjQwOjEzWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgdG8gYWxsIVxcclxcblxcclxcbkkgdXNlIHRoZSB4ZWRpdGFibGUgb24gZWFjaCBjZWxsLCBldmVyeSBlZGl0IGkgZW1pdCBhIHNvY2tldCBldmVudCB0aGF0IHJlZnJlc2ggZWxlbWVudHMgaW4gZXZlcnkgdXNlciBpcyAgdXNpbmcgdGhlIHRhYmxlLlxcclxcblxcclxcbkkgaGF2ZSBhIHByb2JsZW0gd2l0aCB0aGUgc3Qtc2FmZS1zcmMgYXR0cmlidXRlLlxcclxcblxcclxcbkkgYnVpbGQgdGhlIHRhYmxlIHdpdGggYW4gb2JqZWN0IGxpa2UgdGhpczpcXHJcXG5cXHJcXG5gYGBqYXZhc2NyaXB0XFxyXFxucm93cyA9IFtcXHJcXG4gIHtcXHJcXG4gICAgIGlkOiA0NTYsXFxyXFxuICAgICBkYXRhOiBbXFxyXFxuICAgICAgIHtcXHJcXG4gICAgICAgICAgdmFsdWU6ICcnLFxcclxcbiAgICAgICAgICBuYW1lOiAnJ1xcclxcbiAgICAgICAgfSxcXHJcXG4gICAgICAgIC4uLi5cXHJcXG4gICAgIF1cXHJcXG4gIH0sXFxyXFxuICB7IC4uLiB9LCBcXHJcXG4gIC4uLlxcclxcbl1cXHJcXG5gYGBcXHJcXG5cXHJcXG5Tby4uLiBpbiB0aGUgbmctcmVwZWF0IG9mIHRyIGVsZW1lbnRzIGkgbmVlZCB0aGUgaWQgYXR0cmlidXRlIG9mIGVhY2ggcm93LCBidXQgdGhlIHRkIGVsZW1lbnRzIGFyZSB0aG9zZSBvZiB0aGUgYXJyYXkgJ2RhdGEnIG9mIGVhY2ggcm93LlxcclxcblxcclxcbldoZW4gaSBlZGl0IGEgdmFsdWUsIHRoZSBzb2NrZXQgZXZlbnQgaXMgZW1pdHRlZCwgYnV0IHRoZSBjb2xsZWN0aW9uIG9uIHRoZSBvdGhlciB1c2VyIGlzIG5vdCByZWZyZXNoZWQuLi4gc28sIHRoZSB2YWx1ZXMgYXJlIG5vdCB1cGRhdGVkLiBCdXQgaWYgaSBhZGQgYSByb3csIHRoZSB0YWJsZSBvbiB0aGUgb3RoZXIgdXNlcnMgaXMgcmVmcmVzaGVkLi4uIG9ubHkgdGhlIHZhbHVlcyBpbiB0aGUgY2VsbHMgYXJlIG91dCBvZiBkYXRlLlxcclxcblxcclxcbklmIGkgZG9uJ3QgdXNlIHNtYXJ0IHRhYmxlIGFsbCB3b3JrcyBmaW5lLCBidXQgaSBwcmVmZXIgdGhlIHNtYXJ0IHRhYmxlLlxcclxcblxcclxcbkluIHRoZSBjb2RlIG9mIHNtYXJ0IHRhYmxlIHRoZXJlIGlzIGEgd2F0Y2gsIGJ1dCBpIG5lZWQgYSB3YXRjaGNvbGxlY3Rpb24sIGlzIGl0IHBvc3NpYmxlP1xcclxcblxcclxcbkhvdz9cXHJcXG5cXHJcXG5UaGFua3NcXHJcXG5cXHJcXG5NYXNzaW1vXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1MlwiLFxuICAgIFwiaWRcIjogMjA5OTQ5MzM3LFxuICAgIFwibnVtYmVyXCI6IDc1MixcbiAgICBcInRpdGxlXCI6IFwiVXBkYXRlIHNtYXJ0LXRhYmxlIGJ5IFdlYlNvY2tldFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiSHlwZXJGbHlcIixcbiAgICAgIFwiaWRcIjogODk5MzcwNSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODk5MzcwNT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9IeXBlckZseVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAyLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDItMjRUMDM6MTc6NDlaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMi0yNFQxMDo0NzoyNlpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIlRoZXJlIGFyZSAyIHRhYnMgaW4gdGhlIGNvbnRhaW5lci5cXHJcXG5FYWNoIHRhYiBoYXMgYSBzbWFydC10YWJsZSBpbiBpdC5cXHJcXG5cXHJcXG4gMS4gVXNlciBjbGlja3Mgb24gdGhlIHRhYi5cXHJcXG5cXHJcXG4gICAgXFx0JCgnYVtkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIl0nKS5vbignc2hvd24uYnMudGFiJywgZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHR2YXIgdGFyZ2V0ID0gJChlLnRhcmdldCkuYXR0cihcXFwiaHJlZlxcXCIpIC8vIGFjdGl2YXRlZCB0YWJcXHJcXG5cXHRcXHRcXHR2YXIgcmVsYXRlZFRhcmdldCA9ICQoZS5yZWxhdGVkVGFyZ2V0KS5hdHRyKFxcXCJocmVmXFxcIilcXHJcXG5cXHRcXHRcXHRpZiAodGFyZ2V0ID09IFxcXCIjdGFiMVxcXCIpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIxJykuZ2V0X3JlY29yZHMoKTtcXHJcXG5cXHRcXHRcXHR9IGVsc2UgaWYgKHRhcmdldCA9PSBcXFwiI3RhYjJcXFwiKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMicpLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH0pXFxyXFxuXFxyXFxuIDIuIENhbGwgc2VydmVyIHRvIGdldCBhbGwgcmVjb3JkIGFuZCBkaXNwbGF5IG9uIHRoZSB0YWJsZS4ob25seSBmaXJzdCB0aW1lKVxcclxcblxcclxcbiAgICBcXHQkc2NvcGUuZ290X3RhYjFfcmVjb3JkcyA9IGZhbHNlO1xcclxcblxcdFxcdCRzY29wZS5nZXRfcmVjb3JkcyA9IGZ1bmN0aW9uICgpIHtcXHJcXG5cXHRcXHRcXHRpZigkc2NvcGUuZ290X3RhYjFfcmVjb3JkcykgcmV0dXJuO1xcclxcblxcdFxcdFxcdHZhciB0b2RheSA9IG5ldyBEYXRlKCkudG9KU09OKCkuc2xpY2UoMCwxMCk7XFxyXFxuXFx0XFx0XFx0dmFyIHVybCA9IEZsYXNrLnVybF9mb3IoJ3JlY29yZGVyLnJlY29yZF9saXN0Jywge2luZm9fdHlwZTogMSwgZnJvbV9kYXRlOiB0b2RheSwgdG9fZGF0ZTogdG9kYXl9KTtcXHJcXG5cXHRcXHRcXHQkaHR0cC5nZXQodXJsKS5zdWNjZXNzKFxcclxcblxcdFxcdFxcdFxcdGZ1bmN0aW9uKGRhdGEpe1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS50YWIxX3JlY29yZHMgPSBkYXRhO1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3JkcyA9IFtdLmNvbmNhdCgkc2NvcGUudGFiMV9yZWNvcmRzKTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuZ290X3RhYjFfcmVjb3JkcyA9IHRydWU7XFxyXFxuXFx0XFx0XFx0XFx0fVxcclxcblxcdFxcdFxcdCkuZXJyb3IoZnVuY3Rpb24ocmVzcG9uc2Upe1xcclxcblxcdFxcdFxcdFxcdGFsZXJ0KHJlc3BvbnNlKTtcXHJcXG5cXHRcXHRcXHR9KS5maW5hbGx5KGZ1bmN0aW9uICgpe1xcclxcblxcdFxcdFxcdH0pO1xcclxcblxcdFxcdH1cXHJcXG5cXHJcXG4gMy4gSWYgdGhlcmUgaXMgYSBuZXcgcmVjb3JkLCBnZXQgdGhlIHJlY29yZCBmcm9tIFdlYlNvY2tldC5cXHJcXG5cXHJcXG4gICAgXFx0dmFyIHVybCA9IFxcXCJ3czovL1xcXCIgKyB3aW5kb3cubG9jYXRpb24uaHJlZi5yZXBsYWNlKC9odHRwcz86XFxcXC9cXFxcLy8sJycpLnJlcGxhY2UoL1xcXFwvLiovLCcnKSArIFxcXCIvd3NcXFwiO1xcclxcblxcdFxcdHZhciB3cyA9IG5ldyBXZWJTb2NrZXQodXJsKTtcXHJcXG5cXHRcXHR3cy5vbmVycm9yID0gZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHRhbGVydChlKTtcXHJcXG5cXHRcXHRcXHRjb25zb2xlLmxvZyhcXFwiV2ViU29ja2V0IEVycm9yXFxcIiArIGUpO1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKGUpO1xcclxcblxcdFxcdH1cXHJcXG5cXHRcXHR3cy5vbmNsb3NlID0gZnVuY3Rpb24gKCkge1xcclxcblxcdFxcdFxcdGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFxcXCJsb2dvXFxcIikuc3R5bGUuY29sb3IgPSBcXFwiZ3JheVxcXCI7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdHdzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChlKSB7XFxyXFxuXFx0XFx0XFx0dmFyIG9iaiA9IEpTT04ucGFyc2UoZS5kYXRhKTtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuYXBwZW5kX3JlY29yZChvYmouc3RhdGUsIG9iai5yZWNvcmQpO1xcclxcblxcdFxcdH1cXHJcXG4gICAgXFx0JHNjb3BlLmFwcGVuZF9yZWNvcmQgPSBmdW5jdGlvbihpbmZvX3R5cGUsIHJlY29yZCl7XFxyXFxuICAgICAgICBcXHRpZiAoaW5mb190eXBlID09IDEpIHtcXHJcXG4gICAgICAgICAgICBcXHRTY29wZXMuZ2V0KCd0YWIxJykudW5zaGlmdF9yZWNvcmQocmVjb3JkKTtcXHJcXG4gICAgICAgIFxcdH0gZWxzZSBpZiAoaW5mb190eXBlID09IDIpIHtcXHJcXG4gICAgICAgICAgICBcXHRTY29wZXMuZ2V0KCd0YWIyJykuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdChKU09OLnBhcnNlKHJlY29yZCkpO1xcclxcbiAgICAgICAgXFx0fVxcclxcbiAgICBcXHR9O1xcclxcblxcclxcbiA0LiBVbnNoaWZ0IHRoZSByZWNvcmQgb24gdGhlIHN0LXNhZmUtc3JjIGFuZCByZWZyZXNoIHRoZSB0YWJsZS5cXHJcXG5cXHJcXG4gICAgIFxcdCRzY29wZS51bnNoaWZ0X3JlY29yZCA9IGZ1bmN0aW9uIChyZWNvcmQpIHtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdChKU09OLnBhcnNlKHJlY29yZCkpO1xcclxcblxcdFxcdH07XFx0XFxyXFxuXFxyXFxuTXkgcXVlc3Rpb24gaXMgdGhlIHN0ZXAgNCBkaWQgbm90IHJlZnJlc2ggdGhlIHRhYmxlLlxcclxcbk9ubHkgaWYgSSBjbGljayBvbiBhbm90aGVyIHRhYiB0aGVuIGNsaWNrIG9uIHRoZSBvcmlnaW5hbCB0YWIuXFxyXFxuQnV0LCBjbGljayBvbiB0aGUgYnV0dG9uIGluIHRoZSB0YWIxIGl0IHdpbGwgdW5zaGlmdCBhIHJlY29yZCBhbmQgZGlzcGxheSBvbiB0aGUgZmlyc3Qgcm93IG9mIHRoZSB0YWJsZS5cXHJcXG5cXHJcXG4gICAgXFx0JHNjb3BlLmFkZFJhbmRvbUl0ZW0gPSBmdW5jdGlvbiBhZGRSYW5kb21JdGVtKCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicxJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFxyXFxuQWxzbywgSSBoYXZlIGEgcXVlc3Rpb24uXFxyXFxuV2h5IHRoZSBzdC1wYWdlc2l6ZWxpc3Q9XFxcIjEwLDUwLDEwMCwxMDAwXFxcIiBkaWQgbm90IHdvcmsgP1xcclxcblxcclxcbkkgaGF2ZSBbcGx1bmtlcl1bMV0gdG8gc2hvdyB0aGlzIHByb2JsZW0uIEJ1dCBJIGRvbid0IGtub3cgaG93IHRvIHNpbXVsYXRlIFdlYlNvY2tldC5cXHJcXG5cXHJcXG5cXHJcXG5IdG1sOlxcclxcblxcclxcbiAgICA8ZGl2IGlkPVxcXCJyaWdodF9jb250YWluZXJcXFwiIHN0eWxlPVxcXCJwb3NpdGlvbjogYWJzb2x1dGU7IHdpZHRoOiAzOCU7IGhlaWdodDogY2FsYygxMDAlIC0gMTA3cHgpOyByaWdodDogMHB4O1xcXCI+XFxyXFxuXFx0XFx0PHVsIGNsYXNzPVxcXCJuYXYgbmF2LXRhYnNcXFwiPlxcclxcblxcdFxcdFxcdDxsaSBjbGFzcz1cXFwiYWN0aXZlXFxcIj48YSBkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIiBocmVmPVxcXCIjdGFiMVxcXCI+dGFiMTwvYT48L2xpPlxcclxcblxcdFxcdFxcdDxsaSBjbGFzcz1cXFwiXFxcIj48YSBkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIiBocmVmPVxcXCIjdGFiMlxcXCI+dGFiMjwvYT48L2xpPlxcclxcblxcdFxcdDwvdWw+XFxyXFxuXFx0XFx0PGRpdiBjbGFzcz1cXFwidGFiLWNvbnRlbnRcXFwiPlxcclxcblxcdFxcdFxcdDxkaXYgaWQ9XFxcInRhYjFcXFwiIGNsYXNzPVxcXCJ0YWItcGFuZSBmYWRlIGluIGFjdGl2ZVxcXCIgbmctY29udHJvbGxlcj1cXFwidGFiMVxcXCIgc3R5bGU9XFxcInBvc2l0aW9uOiBhYnNvbHV0ZTsgd2lkdGg6IDEwMCU7IGhlaWdodDogY2FsYygxMDAlIC0gNDJweCk7IHRvcDogNDJweDtcXFwiPlxcclxcblxcdFxcdFxcdFxcdDxidXR0b24gdHlwZT1cXFwiYnV0dG9uXFxcIiBuZy1jbGljaz1cXFwiYWRkUmFuZG9tSXRlbShyb3cpXFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1zbSBidG4tc3VjY2Vzc1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PGkgY2xhc3M9XFxcImdseXBoaWNvbiBnbHlwaGljb24tcGx1c1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC9pPiBBZGQgcmFuZG9tIGl0ZW1cXHJcXG5cXHRcXHRcXHRcXHQ8L2J1dHRvbj5cXHJcXG5cXHRcXHRcXHRcXHQ8dGFibGUgc3QtdGFibGU9XFxcInRhYjFfcmVjb3Jkc1xcXCIgc3Qtc2FmZS1zcmM9XFxcInNhZmVfdGFiMV9yZWNvcmRzXFxcIiBjbGFzcz1cXFwidGFibGUgdGFibGUtc3RyaXBlZFxcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRoZWFkPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogIzJBNjZBQjsgY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPnRpbWU8L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD5kZXZpY2U8L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIHN0eWxlPVxcXCJiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD48aW5wdXQgc3Qtc2VhcmNoPVxcXCJ0aW1lXFxcIiBjbGFzcz1cXFwiZm9ybS1jb250cm9sXFxcIiBwbGFjZWhvbGRlcj1cXFwidGltZSBzZWFyY2ggLi4uXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiAvPjwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPjxpbnB1dCBzdC1zZWFyY2g9XFxcImRldmljZVxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgcGxhY2Vob2xkZXI9XFxcImRldmljZSBzZWFyY2ggLi4uXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiAvPjwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RoZWFkPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0Ym9keSBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgbmctcmVwZWF0PVxcXCJyZWNvcmQgaW4gdGFiMV9yZWNvcmRzXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGQ+eyRyZWNvcmQuX2RhdGV0aW1lJH08L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0ZD57JHJlY29yZC5fZGV2aWNlJH08L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90Ym9keT5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGZvb3Q+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRyPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdFxcdDx0ZCBjb2xzcGFuPVxcXCI0XFxcIiBjbGFzcz1cXFwidGV4dC1jZW50ZXJcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdFxcdFxcdDxkaXYgc3QtcGFnaW5hdGlvbj1cXFwiXFxcIiBzdC1pdGVtcy1ieS1wYWdlPVxcXCIxMFxcXCIgc3QtZGlzcGxheWVkLXBhZ2VzPVxcXCI3XFxcIiBzdC1wYWdlc2l6ZWxpc3Q9XFxcIjEwLDUwLDEwMCwxMDAwXFxcIj48L2Rpdj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHQ8L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90Zm9vdD5cXHJcXG5cXHRcXHRcXHRcXHQ8L3RhYmxlPlxcclxcblxcdFxcdFxcdDwvZGl2PlxcclxcblxcdFxcdFxcdDxkaXYgaWQ9XFxcInRhYjJcXFwiIGNsYXNzPVxcXCJ0YWItcGFuZSBmYWRlXFxcIiBuZy1jb250cm9sbGVyPVxcXCJ0YWIyXFxcIiBzdHlsZT1cXFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogMTAwJTsgaGVpZ2h0OiBjYWxjKDEwMCUgLSA0MnB4KTsgdG9wOiA0MnB4O1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0PHRhYmxlIHN0LXRhYmxlPVxcXCJ0YWIyX3JlY29yZHNcXFwiIHN0LXNhZmUtc3JjPVxcXCJzYWZlX3RhYjJfcmVjb3Jkc1xcXCIgY2xhc3M9XFxcInRhYmxlIHRhYmxlLXN0cmlwZWRcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6ICMyQTY2QUI7IGNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD50aW1lPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+ZGV2aWNlPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+PGlucHV0IHN0LXNlYXJjaD1cXFwidGltZVxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgcGxhY2Vob2xkZXI9XFxcInRpbWUgc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD48aW5wdXQgc3Qtc2VhcmNoPVxcXCJkZXZpY2VcXFwiIGNsYXNzPVxcXCJmb3JtLWNvbnRyb2xcXFwiIHBsYWNlaG9sZGVyPVxcXCJkZXZpY2Ugc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGJvZHkgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIG5nLXJlcGVhdD1cXFwicmVjb3JkIGluIHRhYjJfcmVjb3Jkc1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRkPnskcmVjb3JkLl9kYXRldGltZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGQ+eyRyZWNvcmQuX2RldmljZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGJvZHk+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRmb290PlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHQ8dGQgY29sc3Bhbj1cXFwiNFxcXCIgY2xhc3M9XFxcInRleHQtY2VudGVyXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHRcXHQ8ZGl2IHN0LXBhZ2luYXRpb249XFxcIlxcXCIgc3QtaXRlbXMtYnktcGFnZT1cXFwiMTBcXFwiIHN0LWRpc3BsYXllZC1wYWdlcz1cXFwiN1xcXCIgc3QtcGFnZXNpemVsaXN0PVxcXCIxMCw1MCwxMDAsMTAwMFxcXCI+PC9kaXY+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0XFx0PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGZvb3Q+XFxyXFxuXFx0XFx0XFx0XFx0PC90YWJsZT5cXHJcXG5cXHRcXHRcXHQ8L2Rpdj5cXHJcXG5cXHRcXHQ8L2Rpdj5cXHJcXG5cXHQ8L2Rpdj5cXHJcXG5cXHJcXG5KYXZhc2NyaXB0OlxcclxcblxcclxcbiAgICA8c2NyaXB0IHNyYz1cXFwiL3N0YXRpY3Mvc2NyaXB0cy9hbmd1bGFyLm1pbi5qc1xcXCI+PC9zY3JpcHQ+XFxyXFxuXFx0PHNjcmlwdCBzcmM9XFxcIi9zdGF0aWNzL3NjcmlwdHMvU21hcnQtVGFibGUtMi4xLjgvc21hcnQtdGFibGUubWluLmpzXFxcIj48L3NjcmlwdD5cXHJcXG5cXHQ8c2NyaXB0PlxcclxcblxcdHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnbWFwJywgWydzbWFydC10YWJsZSddKTtcXHJcXG5cXHRhcHAgPSBhbmd1bGFyLm1vZHVsZSgnbWFwJykuY29uZmlnKGZ1bmN0aW9uICgkaHR0cFByb3ZpZGVyLCAkaW50ZXJwb2xhdGVQcm92aWRlcikge1xcclxcblxcdFxcdCRodHRwUHJvdmlkZXIuZGVmYXVsdHMuaGVhZGVycy5jb21tb25bJ1gtUmVxdWVzdGVkLVdpdGgnXSA9ICdYTUxIdHRwUmVxdWVzdCc7XFxyXFxuXFx0XFx0JGludGVycG9sYXRlUHJvdmlkZXIuc3RhcnRTeW1ib2woJ3skJyk7XFxyXFxuXFx0XFx0JGludGVycG9sYXRlUHJvdmlkZXIuZW5kU3ltYm9sKCckfScpO1xcclxcblxcdH0pO1xcclxcblxcdGFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUpIHtcXHJcXG5cXHRcXHQkcm9vdFNjb3BlLiRvbignc2NvcGUuc3RvcmVkJywgZnVuY3Rpb24gKGV2ZW50LCBkYXRhKSB7XFxyXFxuXFx0XFx0XFx0Y29uc29sZS5sb2coXFxcInNjb3BlLnN0b3JlZFxcXCIsIGRhdGEpO1xcclxcblxcdFxcdH0pO1xcclxcblxcdH0pO1xcclxcblxcdGFwcC5jb250cm9sbGVyKCd0YWIxJywgWyckc2NvcGUnLCAnJGh0dHAnLCAnU2NvcGVzJywgZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsIFNjb3Blcykge1xcclxcblxcdFxcdFNjb3Blcy5zdG9yZSgndGFiMScsICRzY29wZSk7XFxyXFxuXFx0XFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSBmYWxzZTtcXHJcXG5cXHRcXHQkc2NvcGUuZ2V0X3JlY29yZHMgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0aWYoJHNjb3BlLmdvdF90YWIxX3JlY29yZHMpIHJldHVybjtcXHJcXG5cXHRcXHRcXHR2YXIgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSlNPTigpLnNsaWNlKDAsMTApO1xcclxcblxcdFxcdFxcdHZhciB1cmwgPSBGbGFzay51cmxfZm9yKCdyZWNvcmRlci5yZWNvcmRfbGlzdCcsIHtpbmZvX3R5cGU6IDEsIGZyb21fZGF0ZTogdG9kYXksIHRvX2RhdGU6IHRvZGF5fSk7XFxyXFxuXFx0XFx0XFx0JGh0dHAuZ2V0KHVybCkuc3VjY2VzcyhcXHJcXG5cXHRcXHRcXHRcXHRmdW5jdGlvbihkYXRhKXtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUudGFiMV9yZWNvcmRzID0gZGF0YTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMgPSBbXS5jb25jYXQoJHNjb3BlLnRhYjFfcmVjb3Jkcyk7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSB0cnVlO1xcclxcblxcdFxcdFxcdFxcdH1cXHJcXG5cXHRcXHRcXHQpLmVycm9yKGZ1bmN0aW9uKHJlc3BvbnNlKXtcXHJcXG5cXHRcXHRcXHRcXHRhbGVydChyZXNwb25zZSk7XFxyXFxuXFx0XFx0XFx0fSkuZmluYWxseShmdW5jdGlvbiAoKXtcXHJcXG5cXHRcXHRcXHR9KTtcXHJcXG5cXHRcXHR9XFxyXFxuXFx0XFx0JHNjb3BlLmFkZFJhbmRvbUl0ZW0gPSBmdW5jdGlvbiBhZGRSYW5kb21JdGVtKCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicxJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFx0XFx0JHNjb3BlLnVuc2hpZnRfcmVjb3JkID0gZnVuY3Rpb24gKHJlY29yZCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicyJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFx0XFx0JHNjb3BlLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0fV0pO1xcclxcblxcdGFwcC5jb250cm9sbGVyKCd0YWIyJywgWyckc2NvcGUnLCAnJGh0dHAnLCAnU2NvcGVzJywgZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsIFNjb3Blcykge1xcclxcblxcdFxcdFNjb3Blcy5zdG9yZSgndGFiMicsICRzY29wZSk7XFxyXFxuXFx0XFx0JHNjb3BlLmdvdF90YWIyX3JlY29yZHMgPSBmYWxzZTtcXHJcXG5cXHRcXHQkc2NvcGUuZ2V0X3JlY29yZHMgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0aWYoJHNjb3BlLmdvdF90YWIyX3JlY29yZHMpIHJldHVybjtcXHJcXG5cXHRcXHRcXHR2YXIgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSlNPTigpLnNsaWNlKDAsMTApO1xcclxcblxcdFxcdFxcdHZhciB1cmwgPSBGbGFzay51cmxfZm9yKCdyZWNvcmRlci5yZWNvcmRfbGlzdCcsIHtpbmZvX3R5cGU6IDIsIGZyb21fZGF0ZTogdG9kYXksIHRvX2RhdGU6IHRvZGF5fSk7XFxyXFxuXFx0XFx0XFx0JGh0dHAuZ2V0KHVybCkuc3VjY2VzcyhcXHJcXG5cXHRcXHRcXHRcXHRmdW5jdGlvbihkYXRhKXtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUudGFiMl9yZWNvcmRzID0gZGF0YTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIyX3JlY29yZHMgPSBbXS5jb25jYXQoJHNjb3BlLnRhYjJfcmVjb3Jkcyk7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLmdvdF90YWIyX3JlY29yZHMgPSB0cnVlO1xcclxcblxcdFxcdFxcdFxcdH1cXHJcXG5cXHRcXHRcXHQpLmVycm9yKGZ1bmN0aW9uKHJlc3BvbnNlKXtcXHJcXG5cXHRcXHRcXHRcXHRhbGVydChyZXNwb25zZSk7XFxyXFxuXFx0XFx0XFx0fSkuZmluYWxseShmdW5jdGlvbiAoKXtcXHJcXG5cXHRcXHRcXHR9KTtcXHJcXG5cXHRcXHR9O1xcclxcbiBcXHRcXHQkc2NvcGUudW5zaGlmdF9yZWNvcmQgPSBmdW5jdGlvbiAocmVjb3JkKSB7XFxyXFxuXFx0XFx0XFx0JHNjb3BlLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG5cXHRcXHR9O1xcclxcblxcdH1dKTtcXHJcXG5cXHRhcHAuY29udHJvbGxlcigncHJldmlldycsIFsnJHNjb3BlJywgJyRodHRwJywgJ1Njb3BlcycsIGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCBTY29wZXMpIHtcXHJcXG5cXHRcXHQkKCdhW2RhdGEtdG9nZ2xlPVxcXCJ0YWJcXFwiXScpLm9uKCdzaG93bi5icy50YWInLCBmdW5jdGlvbiAoZSkge1xcclxcblxcdFxcdFxcdHZhciB0YXJnZXQgPSAkKGUudGFyZ2V0KS5hdHRyKFxcXCJocmVmXFxcIikgLy8gYWN0aXZhdGVkIHRhYlxcclxcblxcdFxcdFxcdHZhciByZWxhdGVkVGFyZ2V0ID0gJChlLnJlbGF0ZWRUYXJnZXQpLmF0dHIoXFxcImhyZWZcXFwiKVxcclxcblxcdFxcdFxcdGlmICh0YXJnZXQgPT0gXFxcIiN0YWIxXFxcIikge1xcclxcblxcdFxcdFxcdFxcdFNjb3Blcy5nZXQoJ3RhYjEnKS5nZXRfcmVjb3JkcygpO1xcclxcblxcdFxcdFxcdH0gZWxzZSBpZiAodGFyZ2V0ID09IFxcXCIjdGFiMlxcXCIpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIyJykuZ2V0X3JlY29yZHMoKTtcXHJcXG5cXHRcXHRcXHR9XFxyXFxuXFx0XFx0fSlcXHJcXG5cXHRcXHQkc2NvcGUuYXBwZW5kX3JlY29yZCA9IGZ1bmN0aW9uKGluZm9fdHlwZSwgcmVjb3JkKXtcXHJcXG5cXHRcXHRcXHRpZiAoaW5mb190eXBlID09IDEpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIxJykudW5zaGlmdF9yZWNvcmQocmVjb3JkKTtcXHJcXG5cXHRcXHRcXHR9IGVsc2UgaWYgKGluZm9fdHlwZSA9PSAyKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMicpLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG5cXHRcXHRcXHR9XFxyXFxuXFx0XFx0fTtcXHJcXG5cXHRcXHR2YXIgdXJsID0gXFxcIndzOi8vXFxcIiArIHdpbmRvdy5sb2NhdGlvbi5ocmVmLnJlcGxhY2UoL2h0dHBzPzpcXFxcL1xcXFwvLywnJykucmVwbGFjZSgvXFxcXC8uKi8sJycpICsgXFxcIi93c1xcXCI7XFxyXFxuXFx0XFx0dmFyIHdzID0gbmV3IFdlYlNvY2tldCh1cmwpO1xcclxcblxcdFxcdHdzLm9uZXJyb3IgPSBmdW5jdGlvbiAoZSkge1xcclxcblxcdFxcdFxcdGFsZXJ0KGUpO1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKFxcXCJXZWJTb2NrZXQgRXJyb3JcXFwiICsgZSk7XFxyXFxuXFx0XFx0XFx0Y29uc29sZS5sb2coZSk7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdHdzLm9uY2xvc2UgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXFxcImxvZ29cXFwiKS5zdHlsZS5jb2xvciA9IFxcXCJncmF5XFxcIjtcXHJcXG5cXHRcXHR9XFxyXFxuXFx0XFx0d3Mub25tZXNzYWdlID0gZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHR2YXIgb2JqID0gSlNPTi5wYXJzZShlLmRhdGEpO1xcclxcblxcdFxcdFxcdCRzY29wZS5hcHBlbmRfcmVjb3JkKG9iai5zdGF0ZSwgb2JqLnJlY29yZCk7XFxyXFxuXFx0XFx0fVxcclxcblxcdH1dKTtcXHJcXG5cXHRcXHJcXG5cXHRhcHAuZmFjdG9yeSgnU2NvcGVzJywgZnVuY3Rpb24gKCRyb290U2NvcGUpIHtcXHJcXG5cXHRcXHR2YXIgbWVtID0ge307XFxyXFxuXFx0XFx0cmV0dXJuIHtcXHJcXG5cXHRcXHRcXHRzdG9yZTogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcXHJcXG5cXHRcXHRcXHRcXHQkcm9vdFNjb3BlLiRlbWl0KCdzY29wZS5zdG9yZWQnLCBrZXkpO1xcclxcblxcdFxcdFxcdFxcdG1lbVtrZXldID0gdmFsdWU7XFxyXFxuXFx0XFx0XFx0fSxcXHJcXG5cXHRcXHRcXHRnZXQ6IGZ1bmN0aW9uIChrZXkpIHtcXHJcXG5cXHRcXHRcXHRcXHRyZXR1cm4gbWVtW2tleV07XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH07XFxyXFxuXFx0fSk7XFxyXFxuXFx0PC9zY3JpcHQ+XFxyXFxuXFxyXFxuXFxyXFxuICBbMV06IGh0dHA6Ly9wbG5rci5jby9lZGl0L3dseXVIVlVRSE5tMlJjVk5HWUprP3A9cHJldmlld1wiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDhcIixcbiAgICBcImlkXCI6IDIwNzQ1MDExMSxcbiAgICBcIm51bWJlclwiOiA3NDgsXG4gICAgXCJ0aXRsZVwiOiBcInN0LXBlcnNpc3QgZXhhbXBsZSBpcyBub3Qgd29ya2luZyB3aXRoIHN0LXBpcGVcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImpvaG5pY29cIixcbiAgICAgIFwiaWRcIjogMTk1NjQ1OTIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE5NTY0NTkyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY29cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vam9obmljb1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiAyMjU4NjI0MjMsXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvbm90JTIwcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwibmFtZVwiOiBcIm5vdCByZXByb2R1Y2libGVcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImViNjQyMFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjU5NDM4NTA2LFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL3RvJTIwYmUlMjBjbG9zZWQ6JTIwZG9lcyUyMG5vdCUyMGZvbGxvdyUyMGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJuYW1lXCI6IFwidG8gYmUgY2xvc2VkOiBkb2VzIG5vdCBmb2xsb3cgZ3VpZGVsaW5lc1wiLFxuICAgICAgICBcImNvbG9yXCI6IFwiZmJjYTA0XCIsXG4gICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMi0xNFQwODozODo1NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTE0VDEzOjExOjU3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgLiB0aGlzIGV4YW1wbGUgaXMgbm90IHdvcmtpbmcgYXQgYWxsIHdpdGggc2VydmVyIHBhZ2luYXRpb24gXFxyXFxuaHR0cDovL3BsbmtyLmNvL2VkaXQvZWt3aU50P3A9cHJldmlld1xcclxcblxcclxcbml0IHNhdmVkIG9ubHkgdGhlIGRhdGEgb2YgZmlyc3QgcGFnZSBhbmQgZGVmYXVsdCBzb3J0IGluIGxvY2FsIHN0b3JhZ2UgYW5kIGRpZCBub3QgdXBkYXRlIHRoZSB0YWJsZVxcclxcblxcclxcbm15IHBpcGUgZnVuY3Rpb24gOlxcclxcblxcclxcblxcclxcbmAgICAgdGhpcy5jYWxsU2VydmVyID0gZnVuY3Rpb24gY2FsbFNlcnZlcih0YWJsZVN0YXRlKSB7XFxyXFxuXFxyXFxuICAgICAgICB2bS5pc0xvYWRpbmcgPSB0cnVlO1xcclxcbiAgICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XFxyXFxuICAgICAgICB2YXIgc3RhcnQgPSBwYWdpbmF0aW9uLnN0YXJ0IHx8IDA7ICBcXHJcXG4gICAgICAgIHZhciBudW1iZXIgPSBwYWdpbmF0aW9uLm51bWJlciB8fCAxMFxcclxcblxcclxcbiAgICAgICAgdm0uc3VibWl0ID0gZnVuY3Rpb24gKCl7XFxyXFxuICAgICAgICAgICAgdm0uaXNMb2FkaW5nID0gdHJ1ZTtcXHJcXG5cXHJcXG4gICAgICAgICAgICAkc2NvcGUuZmlsdGVyc0Zvcm0uJHNldFByaXN0aW5lKCk7XFxyXFxuICAgICAgICAgICAgc2VydmVyQ2FsbCgwLCAxMCwgdGFibGVTdGF0ZSxzZWFyY2hPYmopO1xcclxcbiAgICAgICAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XFxyXFxuICAgICAgICB9XFxyXFxuICAgICAgICBzZXJ2ZXJDYWxsKHN0YXJ0LCBudW1iZXIsIHRhYmxlU3RhdGUsc2VhcmNoT2JqKTtcXHJcXG5cXHJcXG4gICAgICB9O1xcclxcbmBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0Ny9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0N1wiLFxuICAgIFwiaWRcIjogMjA1ODQ5MTQxLFxuICAgIFwibnVtYmVyXCI6IDc0NyxcbiAgICBcInRpdGxlXCI6IFwiSXNzdWUgIzcyNyBzdC1waXBlIG5vdCB3b3JraW5nIHdpdGggc3Qtc2FmZS1zcmNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIkFsZXhOR1wiLFxuICAgICAgXCJpZFwiOiA4MjI4MTAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzgyMjgxMD92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkdcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vQWxleE5HXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkcvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4Tkcvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMi0wN1QxMDo0MDo1OFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTA3VDExOjA4OjEyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc0N1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0N1wiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0Ny5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0Ny5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCItIG9wdGlvbmFsIGFiaWxpdHkgdG8gcGlwZSBvbiBzYWZlY29weSBjaGFuZ2UgdXNpbmcgZXhpc3RpbmcgcGlwZUFmdGVyU2FmZUNvcHkgZmxhZyB1c2luZyB1bnByZXZlbnRQaXBlT25XYXRjaFwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ0L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDRcIixcbiAgICBcImlkXCI6IDIwNDExMTA3MCxcbiAgICBcIm51bWJlclwiOiA3NDQsXG4gICAgXCJ0aXRsZVwiOiBcInN0LXNvcnQgd2l0aCBmdW5jdGlvbiByZXR1cm5pbmcgYSBwcm9taXNlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJza2lkdmRcIixcbiAgICAgIFwiaWRcIjogNTgzMjUxMyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvNTgzMjUxMz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vc2tpZHZkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDIsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0zMFQxOTo0ODo0OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTAxVDEyOjUxOjAyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuXFxyXFxuSSBhbSB1c2luZyBhbmd1bGFyIHYxLjUuOSBhbmQgc21hcnQtdGFibGUgdjIuMS4wLiAgSSBoYXZlIHNlYXJjaGVkIGZvciBhbnN3ZXJzIHRvIG15IHF1ZXN0aW9uIGJlbG93LCBidXQgaGF2ZSBub3QgYmVlbiBhYmxlIHRvIGZpbmQgYW55IHRoYXQgYWRkcmVzcyB0aGUgc3BlY2lmaWMgcHJvbWlzZS9hc3luYyBhdHRyaWJ1dGVzIG9mIGl0IC0gYXBvbG9naWVzIGlmIHRoaXMgaGFzIGJlZW4gYWRkcmVzc2VkIHNvbWV3aGVyZSBhbmQvb3IgaXMgYSBkdXBsaWNhdGUgLSBpZiBzbywga2luZGx5IHBsZWFzZSByZWZlciBtZSB0aGVyZS5cXHJcXG5cXHJcXG5JIGhhdmUgYmVlbiB1c2luZyBib3RoIHN0LXRhYmxlPVxcXCJkaXNwbGF5ZWRJdGVtc1xcXCIgYW5kIHN0LXNhZmUtc3JjPVxcXCJpdGVtc1xcXCIgZGlyZWN0aXZlcyBpbiBjb21iaW5hdGlvbiB3aXRoIHN0LXNvcnQuICBUaGlzIGNvbWJpbmF0aW9uIHN1Y2Nlc3NmdWxseSBhbmQgcmVsaWFibHkgd29ya3MgZm9yIG5lYXJseSBhbGwgY29uZGl0aW9ucyBJIGhhdmUgcnVuIGFjcm9zcy4gIFRoaXMgaW5jbHVkZXMgc2NlbmFyaW9zIHdoZXJlIHRoZSBzdC1zb3J0IGlzIGZ1bmN0aW9uIGJhc2VkLiAgSG93ZXZlciwgSSByZWNlbnRseSBlbmNvdW50ZXJlZCBhbiBuZWVkIHRvIGhhdmUgYSBmdW5jdGlvbiBiYXNlZCBzdC1zb3J0IHRoYXQgcmV0dXJucyBhIHByb21pc2UgaW5zdGVhZCBvZiB0aGUgdmFsdWUgZGlyZWN0bHkgKGkuZS4gdGhlIGZ1bmN0aW9uIHdpbGwgYXN5bmNocm9ub3VzbHkgcmVzb2x2ZSB0aGUgdmFsdWUsIGF0IGEgc2xpZ2h0bHkgbGF0ZXIgdGltZSAtIHdoZW4gaXQgYmVjb21lcyBhdmFpbGFibGUpLlxcclxcblxcclxcbk15IHF1ZXN0aW9uIGlzLCBzaG91bGQgdGhlIHN0LXNvcnQgYmUgZXhwZWN0ZWQgdG8gcHJvZHVjZSBhIHByZWRpY3RhYmxlIG9yZGVyaW5nIG9mIHRoZSByb3dzIGluIHRoYXQgY2FzZT8gIElmIHNvLCBpdCBkb2VzIG5vdCBhcHBlYXIgdG8gYmUuICBJIGFtIHRoZW9yaXppbmcgdGhhdCB0aGlzIG1heSBiZSBkbyB0byB0aGUgZmFjdCB0aGF0IHRoZSBhc3NvY2lhdGVkIHZhbHVlcyBhcmUgbm90IGF2YWlsYWJsZSB0byB0aGUgc29ydCBhbGdvcml0aG0gYWxsIHVwIGZyb250IC0gYnV0IHJhdGhlciBzdHJhZ2dsZSBpbiBpbiBhbiB1bnByZWRpY3RhYmxlIG9yZGVyIGFuZCB0aW1lIGZyYW1lLiAgQnkgdGhlIHdheSwgbm8gZXJyb3JzIG9yIG90aGVyIGluZGljYXRpb25zIGFyZSByZXR1cm5lZCB0aGF0IGEgcHJvYmxlbSBtYXkgZXhpc3QuICBTaG91bGQgSSBleHBlY3QgdGhpcyB0byB3b3JrLCBvciBpcyB0aGlzIGEga25vd24gbGltaXRhdGlvbj8gIEFyZSB0aGVyZSBhZGRpdGlvbmFsIGl0ZW1zIHRoYXQgY2FuIGJlIGRvbmUgdG8gbWFrZSBpdCB3b3JrIG9uIG15IHBhcnQgb3Igb3RoZXJ3aXNlIC0gaWYgc28sIEknZCBncmVhdGx5IGFwcHJlY2lhdGUgYW55IHRpcHMgb3IgdGhvdWdodHMgeW91IG1heSBoYXZlP1xcclxcblxcclxcblRJQSFcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDJcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0Mi9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDIvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDIvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQyXCIsXG4gICAgXCJpZFwiOiAyMDA4Mjk1NTAsXG4gICAgXCJudW1iZXJcIjogNzQyLFxuICAgIFwidGl0bGVcIjogXCJzdC1zb3J0LWRlZmF1bHQgb3ZlcndyaXRlcyBzdC1wZXJzaXN0IHN0YXRlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJhbmd1c3R1c1wiLFxuICAgICAgXCJpZFwiOiA5MTM3ODEwLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS85MTM3ODEwP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VzdHVzXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0xNFQyMTowMzoxM1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTE0VDIxOjAzOjEzWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiKipXb3JraW5nIGV4YW1wbGU6KipcXHJcXG5odHRwOi8vcGxua3IuY28vZWRpdC9VSTVyOXI/cD1wcmV2aWV3XFxyXFxuSXQncyBhIGZvcmsgb2YgdGhlIGBzdC1wZXJzaXN0YCBleGFtcGxlOyBJJ3ZlIGFkZGVkIGBzdC1zb3J0LWRlZmF1bHRgIGZpZWxkIGFuZCB1cGRhdGVkIGBzbWFydC10YWJsZWAgdG8gYHYyLjEuOGAgKG1hc3RlciBhcyBvZiBub3cpLlxcclxcblxcclxcbioqUmVwcm9kdWN0aW9uOioqXFxyXFxuMS4gVXNlIHBhZ2luYXRpb24gYW5kIHNvcnQgYnkgYW55IGNvbHVtbi5cXHJcXG4yLiByZWZyZXNoIHByZXZpZXdcXHJcXG5cXHJcXG4qKlJlc3VsdDoqKlxcclxcblRoZSBwZXJzaXN0ZWQgc3RhdGUgaXMgYXBwbGllZCBiZWZvcmUgdGhlIGRlZmF1bHQgc29ydCBvcmRlciBpcyBhcHBsaWVkLlxcclxcbioqRXhwZWN0ZWQ6KipcXHJcXG5QZXJzaXN0ZWQgc3RhdGUgc2hvdWxkIGJlIGFwcGxpZWQgbGFzdCB0aHVzIG92ZXJ3cml0aW5nIGRlZmF1bHQgc3RhdGUgb3JkZXIuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDEvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0MVwiLFxuICAgIFwiaWRcIjogMjAwNjQyNDE4LFxuICAgIFwibnVtYmVyXCI6IDc0MSxcbiAgICBcInRpdGxlXCI6IFwiSXMgdGhlcmUgYXJlIGEgd2F5IGZvciBhIHN0cmljdCBzZWFyY2ggaW4gY3VzdG9tIGRpcmVjdGl2ZT8gXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJreXJvZGFiYXNlXCIsXG4gICAgICBcImlkXCI6IDI1MTAzMjQzLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS8yNTEwMzI0Mz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2t5cm9kYWJhc2VcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2Uvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2UvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMzU1Mjk4NTksXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvZW5oYW5jZW1lbnRcIixcbiAgICAgICAgXCJuYW1lXCI6IFwiZW5oYW5jZW1lbnRcIixcbiAgICAgICAgXCJjb2xvclwiOiBcIjg0YjZlYlwiLFxuICAgICAgICBcImRlZmF1bHRcIjogdHJ1ZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDYsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0xM1QxNDoyNzowMlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTE5VDA5OjAxOjE3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuXFxyXFxuR3JlYXQgbGliISA6KVxcclxcblxcclxcbklzIHRoZXJlIGFyZSBhIHdheSB0byBtYXRjaCB0aGUgZXhhY3Qgc2VhcmNoIHRlcm0gaW5zdGVhZCBvZiBhIHN1YnN0cmluZz9cXHJcXG5DdXJyZW50bHkgaWYgSSBzZWFyY2ggZm9yIElEID0gNCwgdGhlIHNlYXJjaCBmdW5jdGlvbiByZXR1cm5zIElEID0gNCBhbmQgSUQgPSA0MDAwLCBJRCA9IDQwMDEgZXRjLlxcclxcbkhlcmUgaXMgYSBjb2RlIHNuaXBwZXQ6IFxcclxcblxcclxcbmAgLmRpcmVjdGl2ZShcXFwiY3VzdG9tV2F0Y2hGaWx0ZXJzXFxcIiwgZnVuY3Rpb24gKCkge1xcclxcblxcclxcbiAgICByZXR1cm4ge1xcclxcbiAgICAgIHJlc3RyaWN0OiBcXFwiQVxcXCIsXFxyXFxuICAgICAgcmVxdWlyZTogXFxcIl5zdFRhYmxlXFxcIixcXHJcXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XFxyXFxuICAgICAgXFx0c2NvcGUuJHdhdGNoQ29sbGVjdGlvbihhdHRycy5jdXN0b21XYXRjaEZpbHRlcnMsIGZ1bmN0aW9uIChmaWx0ZXJzKSB7XFxyXFxuXFxyXFxuICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSB7fTtcXHJcXG5cXHJcXG4gICAgICAgICAgYW5ndWxhci5mb3JFYWNoKGZpbHRlcnMsIGZ1bmN0aW9uICh2YWwsIGZpbHRlcikge1xcclxcbiAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSB7XFxyXFxuICAgICAgICAgICAgICByZXR1cm47XFxyXFxuICAgICAgICAgICAgfVxcclxcblxcdFxcdFxcclxcbiAgICAgICAgICAgIGN0cmwuc2VhcmNoKHZhbC50b1N0cmluZygpLCBmaWx0ZXIpO1xcclxcbiAgICAgICAgICB9KTtcXHJcXG5cXHJcXG4gICAgICAgICAgY3RybC5waXBlKCk7XFxyXFxuXFxyXFxuICAgICAgICB9KTtcXHJcXG4gICAgICB9XFxyXFxuICAgIH07XFxyXFxuICB9KTtgXFxyXFxuXFxyXFxuUGxlYXNlIGFkdmlzZVwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM5L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzlcIixcbiAgICBcImlkXCI6IDE5OTI5NjgwOCxcbiAgICBcIm51bWJlclwiOiA3MzksXG4gICAgXCJ0aXRsZVwiOiBcIkhvdyBjYW4gSSBzZWxlY3QgcGFnZSBhbmQgc29ydCBtYW51YWxseSB3aXRoIHNlcnZlciBzaWRlIHBhZ2luYXRpb24gP1wiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiam9obmljb1wiLFxuICAgICAgXCJpZFwiOiAxOTU2NDU5MixcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTk1NjQ1OTI/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljb1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9qb2huaWNvXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0wNlQyMTo0NDozOVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTEwVDA3OjE0OjUyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgLiBpbSB1c2luZyBzbWFydCB0YWJsZSB3aXRoIHBhZ2luYXRpb24gaW4gc2VydmVyIHNpZGUuXFxyXFxuSSBhbSBrZWVwIHRoZSBzb3J0aW5nIGFuZCBwYWdpbmF0aW9uIGRldGFpbHMgaW4gbG9jYWwgc3RvcmFnZSBvciB1cmwgLFxcclxcbm15IHF1ZXN0aW9uIGlzIGhvdyBjYW4gSSBrZWVwIHRoZSBwYWdlIHdoZW4gdGhlIHVzZXIgd2FzIGFuZCB3aGVuIGhlIHdpbGwgY29tZSBiYWNrIHdpdGggdGhlIHNwZWNpZmljIHVybCBvciBqdXN0IGJhY2sgdG8gdGhlIHBhZ2UgaGUgd2lsbCBnZXQgdGhlIHNhbWUgcGFnZSBoZSB3YXMuP1xcclxcbnRoZSBzYW1lIGlzc3VlIGlzIHdpdGggU29ydGluZywgIEhvdyBjYW4gSSBzb3J0aW5nIGJ5IHVybCBwYXJhbWV0ZXJcXHJcXG5ob3cgY2FuIEkgZG8gdGhhdCwgICA/XFxyXFxuXFxyXFxuXFxyXFxudGh4IGZvciB0aGUgaGVscFwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzhcIixcbiAgICBcImlkXCI6IDE5NzQ5NzM4MixcbiAgICBcIm51bWJlclwiOiA3MzgsXG4gICAgXCJ0aXRsZVwiOiBcIkNhbid0IGxvYWQgaHR0cCBjb250ZW50IGZyb20gcGx1bmtlciB3aGVuIG9wZW5pbmcgdHV0b3JpYWwgc2l0ZSB2aWEgaHR0cHNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImFuYXRvbHkzMTRcIixcbiAgICAgIFwiaWRcIjogMTY0MTU5NCxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTY0MTU5ND92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FuYXRvbHkzMTRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTI1VDExOjMxOjMyWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMjVUMTE6MzE6MzJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJXaGVuIEkgb3BlbiB0aGUgZm9sbG93aW5nIHdlYnNpdGU6IGh0dHBzOi8vbG9yZW56b2ZveDMuZ2l0aHViLmlvL3NtYXJ0LXRhYmxlLXdlYnNpdGUvIHNvbWUgY29udGVudCBub3QgbG9hZGluZyBidXQgdGhyb3dpbmcgZXhjZXB0aW9uIGluIGEgamF2YXNjcmlwdCBjb25zb2xlOlxcclxcblxcclxcbj4gTWl4ZWQgQ29udGVudDogVGhlIHBhZ2UgYXQgJ2h0dHBzOi8vbG9yZW56b2ZveDMuZ2l0aHViLmlvL3NtYXJ0LXRhYmxlLXdlYnNpdGUvJyB3YXMgbG9hZGVkIG92ZXIgSFRUUFMsIGJ1dCByZXF1ZXN0ZWQgYW4gaW5zZWN1cmUgcmVzb3VyY2UgJ2h0dHA6Ly9lbWJlZC5wbG5rci5jby9TT2NVazEnLiBUaGlzIHJlcXVlc3QgaGFzIGJlZW4gYmxvY2tlZDsgdGhlIGNvbnRlbnQgbXVzdCBiZSBzZXJ2ZWQgb3ZlciBIVFRQUy5cXHJcXG5cXHJcXG5UbyBmaXggdGhpcyBhbGwgaHR0cDovL2V4YW1wbGUuY29tIGxpbmtzIHNob3VsZCBiZSBjaGFuZ2VkIHRvIC8vZXhhbXBsZS5jb21cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM3XCIsXG4gICAgXCJpZFwiOiAxOTY0NjE3MzYsXG4gICAgXCJudW1iZXJcIjogNzM3LFxuICAgIFwidGl0bGVcIjogXCJQb3NzaWJsZSBpc3N1ZSB3aXRoIHJlaW5pdGlhbGlzaW5nIHRoZSBzY29wZS5wYWdlcyBjb2xsZWN0aW9uIGluIHJlZHJhdyBmdW5jdGlvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic2FubnlqYWNvYnNzb25cIixcbiAgICAgIFwiaWRcIjogMTE3ODc4MzEsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzExNzg3ODMxP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3Nhbm55amFjb2Jzc29uXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMi0xOVQxNjo0MToxMVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEyLTIwVDEwOjA0OjAwWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiQW5ndWxhciB2ZXJzaW9uOiAxLjUuOFxcclxcblNtYXJ0IHRhYmxlIHZlcnNpb246IDIuMS44XFxyXFxuXFxyXFxuaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2Jsb2IvbWFzdGVyL3NyYy9zdFBhZ2luYXRpb24uanNcXHJcXG48cHJlPlxcclxcbm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxcclxcbiAgLmRpcmVjdGl2ZSgnc3RQYWdpbmF0aW9uJywgWydzdENvbmZpZycsIGZ1bmN0aW9uIChzdENvbmZpZykge1xcclxcbi4uLi5cXHJcXG4gICAgICAgIGZ1bmN0aW9uIHJlZHJhdyAoKSB7XFxyXFxuLi4uLlxcclxcbiAgICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xcclxcbi4uLi5cXHJcXG48L3ByZT5cXHJcXG5cXHJcXG5XaGVuIHVwZGF0aW5nIHRoZSA8Y29kZT5zdC1pdGVtcy1ieS1wYWdlPC9jb2RlPiB2YWx1ZSBhIDxjb2RlPnJlZHJhdygpPC9jb2RlPiBpcyB0cmlnZ2VyZWQuIEluIHRoZSBjYXNlIHRoZSBuZXcgdmFsdWUgaXMgdGhlIGxlbmd0aCBvZiB0aGUgaXRlbXMgaW4gdGhlIGJhY2tpbmcgY29sbGVjdGlvbiA8Y29kZT48L2NvZGU+IHRoZSA8Y29kZT5zY29wZS5wYWdlczwvY29kZT4gY29sbGVjdGlvbiBpcyByZWluaXRpYWxpc2VkLiBcXHJcXG5cXHJcXG5JdCBzZWVtcyB0byBtZSB0aGF0IHdlIGFyZSBsb29zaW5nIG91ciByZWZlcmVucyB0byB0aGUgPGNvZGU+c2NvcGUucGFnZXM8L2NvZGU+IGNvbGxlY3Rpb24gaW4gdGhlIHBhZ2luYXRpb24uaHRtbCB0ZW1wbGF0ZS4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9ibG9iL21hc3Rlci9kaXN0L3NtYXJ0LXRhYmxlLmpzIFxcclxcbjxwcmU+XFxyXFxubmcubW9kdWxlKCdzbWFydC10YWJsZScsIFtdKS5ydW4oWyckdGVtcGxhdGVDYWNoZScsIGZ1bmN0aW9uICgkdGVtcGxhdGVDYWNoZSkge1xcclxcbiAgICAkdGVtcGxhdGVDYWNoZS5wdXQoJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCcsXFxyXFxuLi4uLi48L3ByZT5cXHJcXG5cXHJcXG5JZiB3ZSBpbnN0ZWFkIG9mIHJlaW5pdGlhbGlzaW5nIHRoZSBjb2RlPnNjb3BlLnBhZ2VzPC9jb2RlPiBjb2xsZWN0aW9uIGluIHRoZSA8Y29kZT5yZWRyYXcoKTwvY29kZT4gZnVuY3Rpb24gd2Ugc2V0IHRoZSBsZW5ndGggdG8gemVybyA8Y29kZT5zY29wZS5wYWdlcy5sZW5ndGggPSAwOzwvY29kZT4gd2Ugd2lsbCBtYWludGFpbiBvdXIgcmVmZXJlbmNlcy4gV2hlbiBjaGFuZ2luZyB0aGUgdmFsdWUgZnJvbSB0aGUgbGVuZ3RoIG9mIHRoZSBiYWNraW5nIGNvbGxlY3Rpb24gdG8gc29tZSBvdGhlciB2YWx1ZSB0aGUgcGFnaW5hdGlvbiB3aWxsIHdvcmsuIFxcclxcblxcclxcbkkgZGlzY292ZXJlZCB0aGUgaXNzdWUgd2hlbiBhZGRpbmcgYSBcXFwidmlldyBhbGxcXFwiIG9wdGlvbiBmb3IgYSBzbWFydCB0YWJsZS4gSSB0cmllZCB3aXRoIC0xIHRvIHNob3cgYWxsLCBob3dldmVyIHRoYXQgY2F1c2VkIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24ubnVtYmVyT2ZQYWdlcyB0byBiZWNvbWUgbmVnYXRpdmUgd2l0aCBhbGwga2luZHMgb2Ygc2lkZSBlZmZlY3RzLlxcclxcblxcclxcbkknbSBuZXcgdG8gSmF2YVNjcmlwdCBhbmQgQW5ndWxhckpTIHNvIEkgbWF5IHZlcnkgd2VsbCBoYXZlIG1pc3N1bmRlcnN0b2QgdGhlIGlzc3VlLiAgXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzYvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNlwiLFxuICAgIFwiaWRcIjogMTk1MjA3NzMzLFxuICAgIFwibnVtYmVyXCI6IDczNixcbiAgICBcInRpdGxlXCI6IFwiU21hcnQgVGFibGUgcGFnZ2luZyByZWZyZXNoaW5nIElzc3VlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJoZW1yYWpyYXZcIixcbiAgICAgIFwiaWRcIjogMjMzOTY4MzQsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzIzMzk2ODM0P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdlwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9oZW1yYWpyYXZcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTEzVDA5OjU1OjU5WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMTVUMTA6Mjk6MDdaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSxcXHJcXG5ob3cgY2FuIGkgY29udHJvbCBwYWdlIHJlZnJlc2hpbmcgaW4gc21hcnQgdGFibGUgb24gcmVmaWxsIGluc2lkZSBhbmd1bGFyIGNvbnRyb2xsZXIgd2hlbiBhbnkgYWN0aW9uIHBlcmZvcm0uXFxyXFxuZm9yIGV4YSA6IC0gSSBhbSBvbiBwYWdlIG5vIDYgYW5kIGkgY2xhaW0gYW4gb3JkZXIgdGhlbiBjb250cm9sIGNvbWVzIG9uIGZpcnN0IHBhZ2Ugd2hlbiByZWZpbGwgc21hcnQgdGFibGUuXFxyXFxuc28gaG93IGNhbiBiZSBjb250cm9sIHRoaXMgcmVmcmVzaC4uLnBsZWFzZSBwcm92aWRlIG1lIHNvbHV0aW9uIGltbWVkaWF0ZWx5LlxcclxcblxcclxcblRoYW5rcyBpbiBhZHZhbmNlXFxyXFxuSGVtcmFqIFJhdlxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM1L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzVcIixcbiAgICBcImlkXCI6IDE5NTA4NTY3NSxcbiAgICBcIm51bWJlclwiOiA3MzUsXG4gICAgXCJ0aXRsZVwiOiBcInByb3BlcnR5IHdpdGggXFxcIi1cXFwiIGRhc2ggZG9lc250IHdvcmsgaW4gc2VhcmNoPyBPciBJIGFtIGRvaW5nIHNvbWV0aGluZyB3cm9uZyB3aXRoIHN0U2VhcmNoXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJnaW5hbWRhclwiLFxuICAgICAgXCJpZFwiOiA4NDUzNzksXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzg0NTM3OT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhclwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9naW5hbWRhclwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhci9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiA0LFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMTItMTJUMjE6MDY6NDhaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0xMi0xNVQwNzowMzoyNFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgaGF2ZSBqc29uIG9iamVjdCBhcyAgIFxcclxcbmBgYFt7XFxcInRhc2staWRcXFwiOjUyLFxcXCJ0YXNrLXByaW9yaXR5XFxcIjoxLFxcXCJ0YXNrLW5hbWVcXFwiOlxcXCJNb2RpZnkgUHJvdmluY2VcXFwiLFxcXCJ0YXNrLWRlc2NyaXB0aW9uXFxcIjpcXFwiXFxcIixcXFwidGFzay1zdGF0dXNcXFwiOlxcXCJJblByb2dyZXNzXFxcIn0sLi4uXSAgYGBgXFxyXFxuYW5kIGluIGh0bWwgaW0gcmVuZGVyaW5nIGl0cyBhc1xcclxcbmBgYFxcclxcbjxkaXYgY2xhc3M9XFxcIndpZGdldC1ib2R5XFxcIiBzdC10YWJsZT1cXFwiZGlzcGxheVdvcmtsaXN0XFxcIiBzdC1zYWZlLXNyYz1cXFwid29ya2xpc3RcXFwiICA+XFxyXFxuPHRhYmxlIGNsYXNzPVxcXCJ0YWJsZSB0YWJsZS1ib3JkZXJlZCB0YWJsZS1zdHJpcGVkIHRhYmxlLWNvbmRlbnNlZFxcXCI+XFxyXFxuPHRoZWFkPi4uPC90aGVhZD5cXHJcXG48dGJvZHk+XFxyXFxuPHRyIG5nLXJlcGVhdD1cXFwicm93IGluIGRpc3BsYXlXb3JrbGlzdFxcXCI+XFxyXFxuICAgPHRkIGNsYXNzPVxcXCJ0ZXh0LWNlbnRlclxcXCIgPlxcclxcbiAgIHt7IHJvd1sndGFzay1pZCddIH19XFxyXFxuICA8L3RkPlxcclxcbjwvdGFibGU+IGBgYCAgXFxyXFxuXFxyXFxuRXZlcnl0aGluZyB3b3JrcyBmaW5lLCBub3cgd2hlbiBpbSB0cnlpbmcgdG8gZmlsdGVyIGJhc2VkIG9uIHByZWRpY2F0ZSBhcyAgXFxyXFxuPHRoPlxcclxcbiAgIDxpbnB1dCBzdC1zZWFyY2g9XFxcIid0YXNrLWlkJ1xcXCIgcGxhY2Vob2xkZXI9XFxcInNlYXJjaCBmb3IgdGFza0lkXFxcIlxcclxcbiAgY2xhc3M9XFxcImlucHV0LXNtIGZvcm0tY29udHJvbFxcXCIgdHlwZT1cXFwic2VhcmNoXFxcIi8+XFxyXFxuICA8L3RoPiAgXFxyXFxuYGBgICBcXHJcXG5JIGdldCBhbmd1bGFyLmpzOjEwMTUwIFR5cGVFcnJvcjogJHBhcnNlKC4uLikuYXNzaWduIGlzIG5vdCBhIGZ1bmN0aW9uXFxyXFxuXFxyXFxuXFxcImFuZ3VsYXJcXFwiOiBcXFwifjEuMlxcXCIsXFxyXFxuYW5ndWxhci1zbWFydC10YWJsZTogXFxcIl4yLjEuOFxcXCIsXFxyXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNFwiLFxuICAgIFwiaWRcIjogMTkyODQyOTAwLFxuICAgIFwibnVtYmVyXCI6IDczNCxcbiAgICBcInRpdGxlXCI6IFwic3QtcGlwZSB3aXRoIGRlZmF1bHQtc29ydC1jb2x1bW4gY2F1c2VzIGRvdWJsZSB4aHIgcmVxdWVzdCB3aGVuIGluaXRpYWxpemluZyB0YWJsZS5cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcInd6b2V0XCIsXG4gICAgICBcImlkXCI6IDI0ODE5ODIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzI0ODE5ODI/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vd3pvZXRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTAxVDEzOjExOjUzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMTJUMTI6MDk6NDJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSxcXHJcXG5cXHJcXG5XZSBhcmUgd29ya2luZyB3aXRoIHlvdXIgcGx1Z2luIHdoaWNoIGlzIHJlYWxseSBhd2Vzb21lLiBcXHJcXG5XZSBqdXN0IGZvdW5kIHRoYXQgd2hlbiBoYXZpbmcgYSBkZWZhdWx0LXNvcnQgZmllbGQgc2V0IHRvIHRydWUsIHRoZSBwaXBlIGlzIGNhbGxlZCB0d2ljZSwgY2F1c2luZyBkYXRhIGJlIGxvYWRlZCB0d2ljZSB1cG9uIGluaXRpYWxpemluZyBvZiB0aGUgcGFnZS4gXFxyXFxuXFxyXFxuSXQgaXMgdG90YWxseSBub3QgYSBzaG93c3RvcHBlciwgYnV0IEkgZ3Vlc3MgaXQgaXNuJ3QgdmVyeSBlZmZpY2llbnQgYXMgd2VsbC5cXHJcXG5cXHJcXG5XZSB1c2UgYW5ndWxhciDLhjEuNS44IGFuZCBhbmd1bGFyLXNtYXJ0LXRhYmxlIMuGMi4xLjguXFxyXFxuXFxyXFxuVGhhbmtzIGZvciB5b3VyIGVmZm9ydCBpbiB0aGlzIHBsdWdpbiFcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczMy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzczM1wiLFxuICAgIFwiaWRcIjogMTkyMTMyOTUwLFxuICAgIFwibnVtYmVyXCI6IDczMyxcbiAgICBcInRpdGxlXCI6IFwiRXh0ZW5kIHNlbGVjdGlvbiB3aXRoIHNoaWZ0LWNsaWNrXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJSaG9iYWxcIixcbiAgICAgIFwiaWRcIjogMTQ5MTMyOTcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0OTEzMjk3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9SaG9iYWxcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTExLTI4VDIyOjE5OjUzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTEtMjhUMjI6MTk6NTNaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzMzXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzXCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzLmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzLnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIlNlbGVjdGlvbiBjYW4gYmUgZXh0ZW5kZWQgd2l0aCBzaGlmdC1jbGljay5cXHJcXG5cXHJcXG5FeHRlbnNpb24gbWVhbnMgdGhhdCB0aGUgc3RhdGUgb2YgdGhlIGxhc3Qgcm93IHRoYXQgd2FzIHNlbGVjdGVkIGlzIGV4dGVuZGVkIHRocm91Z2ggdG8gdGhlIGN1cnJlbnRseVxcclxcbnNlbGVjdGVkIHJvdywgc28gYWxsIHJvd3MgaW4gYmV0d2VlbiB3aWxsIGVpdGhlciBiZSBzZWxlY3RlZCBvciBkZXNlbGVjdGVkLiBJZiB0aGVyZSB3YXMgbm8gcHJldmlvdXNseVxcclxcbnNlbGVjdGVkIHJvdywgc2hpZnQtY2xpY2sgd2lsbCBqdXN0IHNlbGVjdCB0aGUgY3VycmVudCByb3cuXFxyXFxuXFxyXFxuVG8gZ2V0IHRvIGEgZGVmaW5lZCBzdGF0ZSBvbiBwYWdpbmcgLyBmaWx0ZXJpbmcgLyBzb3J0aW5nLCBzZWxlY3Rpb25zIGFyZSBjbGVhcmVkIHdoZW4gZW50ZXJpbmcgcGlwZSgpIGlmIHRoZXJlIHdlcmUgYW55LiBPdGhlcndpc2UsIHRoZXJlIGNvdWxkIHJlbWFpbiBzZWxlY3RlZCBvYmplY3RzIHRoYXQgYXJlIG5vdCB2aXNpYmxlLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjhcIixcbiAgICBcImlkXCI6IDE4NjI2NDg0OCxcbiAgICBcIm51bWJlclwiOiA3MjgsXG4gICAgXCJ0aXRsZVwiOiBcImdldCBvbmNsaWNrIHBhZ2luYXRpb24gaW4gY29udHJvbGxlclwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiZG9uaTExMVwiLFxuICAgICAgXCJpZFwiOiAyMjgxNzI3NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMjI4MTcyNzc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9kb25pMTExXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0zMVQxMTo0ODoyMFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTMxVDE4OjIxOjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSSBuZWVkIHRvIGRldGVjdCB0aGUgY3VycmVudCBwYWdpbmF0aW9uIGJ5IHRoZSBjb250cm9sbGVyIG9uIHRoZSBvbmNsaWNrIHBhZ2luYXRpb24uXFxyXFxuSXMgdGhlcmUgYW55IHdheSB0byBkbyBpdD9cXHJcXG5cXHJcXG5UaGFuayB5b3VcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyNy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI3XCIsXG4gICAgXCJpZFwiOiAxODQxNjgwODMsXG4gICAgXCJudW1iZXJcIjogNzI3LFxuICAgIFwidGl0bGVcIjogXCJzdC1waXBlIG5vdCB3b3JraW5nIHdpdGggc3Qtc2FmZS1zcmNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImRhbmllbGUtYm90dGVsbGlcIixcbiAgICAgIFwiaWRcIjogODc2MDM1MyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODc2MDM1Mz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2RhbmllbGUtYm90dGVsbGlcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogNCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEwLTIwVDA4OjQyOjEzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDItMDhUMTY6MTQ6MzBaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSB0aGVyZSFcXG5JIGhhdmUgYSBwcm9ibGVtIHVzaW5nIHNtYXJ0IHRhYmxlIHVzaW5nIHN0LXNhZmUtc3JjIGFuZCBzdC1waXBlIHRvZ2V0aGVyLlxcbkFzIGxvbmcgYXMgSSdtIHVzaW5nIHN0LXRhYmxlIGFuZCBzdC1zYWZlLXNyYyBkaXJlY3RpdmVzLCBJIGNhbiBzZWUgYWxsIHRoZSBpdGVtcyBpbiB0aGUgdGFibGUuXFxuQXMgbG9uZyBhcyBJJ20gdXNpbmcgc3QtdGFibGUgYW5kIHN0LXBpcGUgZGlyZWN0aXZlcywgSSBjYW4gc2VlIGFsbCB0aGUgaXRlbXMgaW4gdGhlIHRhYmxlLlxcbkJVVCB1c2luZyBzdC10YWJsZSwgc3Qtc2FmZS1zcmMgYW5kIHN0LXBpcGUgZGlyZWN0aXZlcywgbm8gaXRlbSBpcyBzaG93biBpbiB0aGUgdGFibGUuXFxuXFxuSSB0cmllZCB0aGUgc29sdXRpb24gc2hvd24gaW4gaXNzdWUgIzI0MiBidXQgaXQgZGlkbid0IHdvcmsuXFxuSW4gaXNzdWUgIzIzOCBqb3NoaWppbWl0IGhhZCBteSBzYW1lIHByb2JsZW0gYnV0IHRoZSBzb2x1dGlvbiB3YXM6IGRpc2NhcmQgc3Qtc2FmZS1zcmMuIEZvciBtZSBpdCdzIG5vdCBwb3NzaWJsZSBiZWNhdXNlIEkgbmVlZCB0byBmaWx0ZXIgbXkgdGFibGUuXFxuXFxuWW91IGNhbiBmaW5kIG15IGV4YW1wbGUgY29kZSBoZXJlOlxcbmh0dHA6Ly9wbG5rci5jby9lZGl0L05xRDQ3UT9wPXByZXZpZXdcXG5cXG5UaGFua3MgOilcXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjVcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyNS9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjUvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjUvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI1XCIsXG4gICAgXCJpZFwiOiAxODM3NzM4NTAsXG4gICAgXCJudW1iZXJcIjogNzI1LFxuICAgIFwidGl0bGVcIjogXCJHbyB0byBzcGVjaWZpYyBwYWdlIGFmdGVyIGN1c3RvbSBmaWx0ZXJcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImFhbGFyY29uZ1wiLFxuICAgICAgXCJpZFwiOiAxOTU1ODU4NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTk1NTg1ODc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FhbGFyY29uZ1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiAyMjU4NjI0MjMsXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvbm90JTIwcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwibmFtZVwiOiBcIm5vdCByZXByb2R1Y2libGVcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImViNjQyMFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjU5NDM4NTA2LFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL3RvJTIwYmUlMjBjbG9zZWQ6JTIwZG9lcyUyMG5vdCUyMGZvbGxvdyUyMGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJuYW1lXCI6IFwidG8gYmUgY2xvc2VkOiBkb2VzIG5vdCBmb2xsb3cgZ3VpZGVsaW5lc1wiLFxuICAgICAgICBcImNvbG9yXCI6IFwiZmJjYTA0XCIsXG4gICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0xOFQxODo1OTozOFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTMwVDIxOjU3OjQ0WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkuXFxuXFxuSSdtIHVzaW5nIHRoZSBzbWFydCB0YWJsZSB3aXRoIGFuIGFwaSBhbmQgYWxzbyBpbmNsdWRlIGEgY3VzdG9tIGZpbHRlciBkaXJlY3RpdmUgc28gaSBjYW4gZmlsdGVyIGJ5IGRpZmZlcmVudCBjb2x1bW5zIGFuZCBpcyB3b3JraW5nIG9rLiBXaGVuIGkgY2xpY2sgb24gYSByb3cgaSBnbyB0byBhbm90aGVyIHBhZ2UgdG8gc2VlIG1vcmUgaW5mb3JtYXRpb24sIGluIHRoaXMgbmV3IHBhZ2UgdGhlcmVzIGEgXFxcImdvIGJhY2tcXFwiIGJ1dHRvbiAsIHNvIGkgc3RvcmUgdGhlIHRhYmxlIGNvbGxlY3Rpb24gb24gYSBzZXJ2aWNlIHNvIHdoZW4gaSBcXFwiZ28gYmFja1xcXCIgaSByZXN1bWUgdGhlIGNvbGxlY3Rpb24gd2l0aG91dCBjYWxsaW5nIHRoZSBhcGkgYW5kIHRoZSBjdXN0b20gZmlsdGVycyBydW5zIGFnYWluIGJlY2F1c2UgaSBnb3QgdGhlbSBzdG9yZWQgYWxzbyBvbiBhIHNlcnZpY2UuIFRoZSBpc3N1ZSB0aGF0IGkgY2FudCBzb2x2ZSBpcyB0byBnbyB0byBhbiBzcGVjaWZpYyBwYWdlIGFmdGVyIHRoZSBjdXN0b20gZmlsdGVyIGlzIGV4ZWN1dGUuXFxuXFxuSSB0cnkgdG8gdXNlIHRoZSBjb250cm9sbGVyLnNsaWNlKCkgd2F0Y2hpbmcgdGhlIGN0bHIuZ2V0RmlsdGVyZWRDb2xsZWN0aW9uIGJ1dCB0aGUgY3VzdG9tIGZpbHRlciBvdmVycmlkZSB0aGUgcGFnZSBjaGFuZ2VzIHRoYXQgdGhlIHNsaWRlIGZ1bmN0aW9uIG1ha2UuIEFsc28gaSB0cnkgdG8gdXNlIGEgcGVyc2lzdCBkaXJlY3RpdmUgb24gbG9jYWxzdG9yYWdlIGJ1dCBpcyB0aGUgc2FtZSwgdGhlIGN1c3RvbSBmaWx0ZXIgZXhlY3V0ZSBhbmQgb3ZlcnJpZGUgdGhlIGxvYWQgb2YgdGhlIGxvY2Fsc3RvcmFnZSBjb2xsZWN0aW9uIG92ZXJyaWRpbmcgdGhlIHBhZ2UuXFxuXFxuaXMgVGhlcmUgYSB3YXkgdG8gc2V0IGFuIHNwZWNpZmljIHBhZ2UgYWZ0ZXIgdGhlIGN1c3RvbSBmaWx0ZXI/IGZyb20gdGhlIGN1c3RvbSBmaWx0ZXIgZGlyZWN0aXZlIHRoZXJlcyBhIHdheSB0byBhY2Nlc3MgdGhlIHRhYmxlU3RhdGU/XFxuXFxubXkgY3VzdG9tIGZpbHRlciBsb29rcyBzaW1pbGFyIHRvIChvZiBjb3Vyc2Ugd2l0aCBzb21lIGN1c3RvbSBsb2dpYyk6XFxuXFxuYGBgIGphdmFzY3JpcHRcXG4uZmlsdGVyKCdjdXN0b21GaWx0ZXInLCBbJyRmaWx0ZXInLCBmdW5jdGlvbiAoJGZpbHRlcikge1xcbiAgIHJldHVybiBmdW5jdGlvbiBjdXN0b21GaWx0ZXIoYXJyYXksIGV4cHJlc3Npb24pIHtcXG4gICAgIHJldHVybiBvdXRwdXQ7XFxuICAgIH07XFxufV0pO1xcbmBgYFxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyM1wiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIzL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMy9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMy9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjNcIixcbiAgICBcImlkXCI6IDE4MjY3Mzg3MyxcbiAgICBcIm51bWJlclwiOiA3MjMsXG4gICAgXCJ0aXRsZVwiOiBcIkhpZ2hsaWdodCBzZWFyY2ggdGVybT9cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImtkdW1vdmljXCIsXG4gICAgICBcImlkXCI6IDQ1MDM2ODAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzQ1MDM2ODA/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWNcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20va2R1bW92aWNcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWMvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEwLTEzVDAxOjM1OjMyWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTAtMTNUMDE6MzU6MzJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIb3dkeSxcXG5cXG5JcyB0aGVyZSBhIHdheSB0byBoaWdobGlnaHQgdGhlIG1hdGNoaW5nIHNlYXJjaCB0ZXJtIHdpdGhpbiBhIHRhYmxlIGNlbGw/IEkgYW0gaW1hZ2luaW5nIHRoYXQgYW55IHRleHQgd2l0aGluIGEgdGFibGUgY2VsbCB0aGF0IG1hdGNoZXMgdGhlIHNlYXJjaCBxdWVyeSB3b3VsZCBiZSBlbmNsb3NlZCBpbiBhIHNwYW4gdGhhdCBjb3VsZCB0aGVuIGJlIHN0eWxlZCB3aXRoIGEgYmFja2dyb3VuZCBjb2xvciwgZXRjLlxcblxcbkRvZXMgdGhpcyBmdW5jdGlvbmFsaXR5IGV4aXN0P1xcblxcblRoYW5rcy5cXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjJcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMi9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjIvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjIvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIyXCIsXG4gICAgXCJpZFwiOiAxODI0ODEyNTYsXG4gICAgXCJudW1iZXJcIjogNzIyLFxuICAgIFwidGl0bGVcIjogXCJOZXcgRmVhdHVyZSBSZXF1ZXN0IDo6IFNlbGVjdCBBbGwgQnV0dG9uIHdpdGggdGhlIFRhYmxlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJoYXJzaGlsZFwiLFxuICAgICAgXCJpZFwiOiA4NTc3MjE1LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS84NTc3MjE1P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2hhcnNoaWxkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0xMlQwOTo0NTo0NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTIxVDA5OjAwOjUwWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxuXFxuVGhpcyB0YWxrcyBhYm91dCB0aGUgc2ltaWxhciBjb25jZXJucyBhcyBtZW50aW9uZWQgaGVyZSA6LSBodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzI3MFxcblxcblRoZSBwcm92aWRlZCBkaXJlY3RpdmUgYWxzbyB3b3JrcyBsaWtlIGEgY2hhcm0uXFxuXFxuQnV0LCBpIGFtIHdvbmRlcmluZyBpZiBpdCBwb3NzaWJsZSB0byBpbmNsdWRlIGFuIGF1dG8tc2VsZWN0aW9uIGJ1dHRvbiB3aXRoIHRoZSBsaWJyYXJ5IGFuZCB0aGVuIG1heSBiZSB0b2dnbGluZyBpdHMgdXNhZ2VzIHdpdGggdGhlIGhlbHAgb2YgcHJvcGVydHkuXFxuXFxuSSBzZWFyY2hlZCBxdWl0ZSBhIGJpdCBidXQgbm90IGZvdW5kIGFueSBzdWNoIHJlcXVlc3QgbWFkZSBlYXJsaWVyLiBZb3UgY2FuIGRpc2NhcmQgaXQgaWYgc29tZXRoaW5nIGxpa2UgdGhpcyBoYXMgYWxyZWFkeSBiZWVuIGFkcmVzc2VkXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTYvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNlwiLFxuICAgIFwiaWRcIjogMTc3NzA1NDcwLFxuICAgIFwibnVtYmVyXCI6IDcxNixcbiAgICBcInRpdGxlXCI6IFwiQW5ndWxhciBTbWFydCBUYWJsZSBSZWxvYWQgRGF0YSBhbmQgUmVzZXQgRmlsdGVycyBBbG9uZyBXaXRoIFBhZ2luYXRpb24oV2l0aG91dCBzdC1waXBlKVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwibmltYW50aGFoYXJzaGFuYVwiLFxuICAgICAgXCJpZFwiOiAxMDg2NDU5OCxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTA4NjQ1OTg/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9uaW1hbnRoYWhhcnNoYW5hXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDIsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0wOS0xOVQwNToxNzo1OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTA5LTIxVDA2OjAzOjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSSBoYXZlIHRoZSBzbWFydCB0YWJsZSB3aXRoIEFqYXggbG9hZGVkIGRhdGEgd2hlcmUgSSB3YW50IHRvIHJlc2V0IGZpbHRlcnMgYW5kIHJlbG9hZCBteSBkYXRhIGNvbGxlY3Rpb24gd2l0aCByZXNldCBvZiBwYWdpbmF0aW9uIGFzIHdlbGwgd2hlbiBhIGJ1dHRvbiBpcyBjbGlja2VkLiBNeSBjb2RlIGlzIGdpdmVuIGJlbG93LlxcblxcbioqSFRNTCoqXFxuXFxuYDxidXR0b24gbmctY2xpY2s9XFxcInJlc2V0RmlsdGVycygpO1xcXCIgdHlwZT1cXFwiYnV0dG9uXFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1pbmZvXFxcIj5SZXNldDwvYnV0dG9uPmBcXG5cXG4qKkpTKipcXG5cXG5gYGBcXG5cXG4kc2NvcGUucmVzZXRGaWx0ZXJzID0gZnVuY3Rpb24gKCkge1xcbiAgICAgICAgICAgICRzY29wZS5yb3dDb2xsZWN0aW9uID0gW107XFxuICAgICAgICAgICAgJHNjb3BlLmRpc3BsYXllZENvbGxlY3Rpb24gPSBbXTtcXG4gICAgICAgICAgICAkc2NvcGUucHJvZHVjdF90eXBlID0gbnVsbDtcXG4gICAgICAgICAgICAkc2NvcGUucHJvZHVjdF9jYXRlZ29yeSA9IG51bGw7XFxuICAgICAgICAgICAgJHNjb3BlLnNlYXJjaCA9IG51bGw7XFxuICAgICAgICAgICAgJHNjb3BlLnJvd0NvbGxlY3Rpb24gPSBuZXdfZGF0YTtcXG4gICAgICAgIH07XFxuYGBgXFxuXFxuSG93ZXZlciBJIGNhbid0IGdldCB0aGlzIG1hbmFnZWQgc2luY2UgcGFnaW5hdGlvbiBhbmQgZmlsdGVycyBhcmUgbm90IHJlc2V0dGluZy5cXG5cXG5JIGhhdmUgc2VlbiB0aGUgZm9sbG93aW5nIGJ1dCBJJ20gbm90IHN1cmUgaG93IGFjdHVhbGx5IHRoZSB0YWJsZVN0YXRlIE9iamVjdCBjYW4gYmUgYWNjZXNzZWQgc2luY2UgaXQncyB1bmRlZmluZWQgd2hlbiBJIGxvZyBpdCBvbiB0aGUgY29uc29sZSBhbmQgYWxzbyAqKkknbSBub3QgdXNpbmcgc3QtcGlwZSBkaXJlY3RpdmUqKi5cXG5cXG5gYGBcXG50YWJsZVN0YXRlID0gY3RybC50YWJsZVN0YXRlKClcXG50YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSB7fVxcbnRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDBcXG5gYGBcXG5cXG5QbGVhc2UgSGVscC4uLlxcblxcblRoYW5rIFlvdS5cXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTRcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTQvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTQvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE0XCIsXG4gICAgXCJpZFwiOiAxNzU5MDY1NzksXG4gICAgXCJudW1iZXJcIjogNzE0LFxuICAgIFwidGl0bGVcIjogXCJFeGNlbCBsaWtlIHRhYmxlIGNlbGwgc2VsZWN0aW9uXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJzdGFubGV5eHUyMDA1XCIsXG4gICAgICBcImlkXCI6IDUxNjI2ODcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzUxNjI2ODc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9zdGFubGV5eHUyMDA1XCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0wOS0wOVQwMTo0MTo1NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTA5LTA5VDAzOjAwOjExWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiRGVhciBEZXZlbG9wZXJzLFxcblxcbkknZCBsaWtlIHRvIGFzayB3aGV0aGVyIHRoZXJlIGlzIGFueSB3YXkgKG9yIHBsdWdpbikgdG8gZW5oYW5jZSB0YWJsZSBzZWxlY3RpbmcuIEkgd2FudCB0byBzZWxlY3QgdGFibGUgbGlrZSB3aGF0IHdlIGluIEV4Y2VsIGRvLiBJbiBjb25jcmV0ZTogXFxuLSBUaGUgc2VsZWN0aW9uIHdpbGwgaGF2ZSBhIGNvbG9yZWQgYm9yZGVyXFxuLSBXaGVuIHByZXNzIENUUkwrQywgZGF0YSB3aXRob3V0IGZvcm1hdCB3aWxsIGJlIGNvcGllZCBpbnRvIGNsaXBib2FyZC5cXG5cXG5JIGtub3cgSGFuZHNPblRhYmxlIChodHRwczovL2hhbmRzb250YWJsZS5jb20vZXhhbXBsZXMuaHRtbD9oZWFkZXJzKSBpcyBxdWl0ZSBnb29kIGF0IHRoaXMsIGJ1dCBpdHMgcGVyZm9ybWFuY2UgaXMgYSBuaWdodG1hcmUuIEknZCBsaWtlIHRvIHVzZSBteSBmYXZvcml0ZSBTbWFydC1UYWJsZSB0byBkZWxpdmVyIG5ldyBwcm9qZWN0cywgc28gSSdtIGFza2luZyA7LSlcXG5cIlxuICB9XG5dIiwiaW1wb3J0IHN0IGZyb20gJ3NtYXJ0LXRhYmxlLWNvcmUnO1xuaW1wb3J0IGRhdGEgZnJvbSAnLi4vbW9ja0RhdGEnO1xuXG5leHBvcnQgZGVmYXVsdCAoc3RvcmUsIGFjdGlvbnMpID0+IHtcblxuICBjb25zdCBzbWFydExpc3RSZWdpc3RyeSA9IFtdO1xuXG4gIGNvbnN0IGhhcyA9ICh4LCB5KSA9PiBzbWFydExpc3RSZWdpc3RyeS5maW5kKChpdGVtKSA9PiB4ID09PSBpdGVtLnggJiYgeSA9PT0gaXRlbS55KSAhPT0gdm9pZCAwO1xuXG4gIGNvbnN0IGdldCA9ICh4LCB5KSA9PiBzbWFydExpc3RSZWdpc3RyeS5maW5kKGl0ZW0gPT4geCA9PT0gaXRlbS54ICYmIHkgPT09IGl0ZW0ueSkuc21hcnRMaXN0O1xuXG4gIGNvbnN0IGluc3RhbmNlID0ge1xuICAgIGdldFNtYXJ0TGlzdCh4LCB5KXtcbiAgICAgIGlmICghaGFzKHgsIHkpKSB7XG4gICAgICAgIGNvbnN0IHNtYXJ0TGlzdCA9IHN0KHtkYXRhfSk7XG4gICAgICAgIHNtYXJ0TGlzdC5vbkRpc3BsYXlDaGFuZ2UoaXRlbXMgPT4ge1xuICAgICAgICAgIGFjdGlvbnMudXBkYXRlU21hcnRMaXN0KHtcbiAgICAgICAgICAgIHgsIHksXG4gICAgICAgICAgICB0YWJsZVN0YXRlOiBzbWFydExpc3QuZ2V0VGFibGVTdGF0ZSgpLFxuICAgICAgICAgICAgaXRlbXNcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNtYXJ0TGlzdFJlZ2lzdHJ5LnB1c2goe3gsIHksIHNtYXJ0TGlzdH0pO1xuICAgICAgICBhY3Rpb25zLmNyZWF0ZVNtYXJ0TGlzdCh7eCwgeSwgdGFibGVTdGF0ZTogc21hcnRMaXN0LmdldFRhYmxlU3RhdGUoKSwgaXRlbXM6IFtdfSk7XG4gICAgICAgIHNtYXJ0TGlzdC5leGVjKCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBnZXQoeCwgeSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHN0YXRlID0gc3RvcmUuZ2V0U3RhdGUoKTtcbiAgY29uc3Qgc21hcnRMaXN0U3RhdGVzID0gc3RhdGUuc21hcnRMaXN0IHx8IFtdO1xuXG4gIGZvcihsZXQge3gseX0gb2Ygc21hcnRMaXN0U3RhdGVzKXtcbiAgICBjb25zdCBzbWFydExpc3QgPSBzdCh7ZGF0YX0pO1xuICAgIHNtYXJ0TGlzdC5vbkRpc3BsYXlDaGFuZ2UoaXRlbXMgPT4ge1xuICAgICAgYWN0aW9ucy51cGRhdGVTbWFydExpc3Qoe1xuICAgICAgICB4LCB5LFxuICAgICAgICB0YWJsZVN0YXRlOiBzbWFydExpc3QuZ2V0VGFibGVTdGF0ZSgpLFxuICAgICAgICBpdGVtc1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgc21hcnRMaXN0UmVnaXN0cnkucHVzaCh7eCwgeSwgc21hcnRMaXN0fSk7XG4gICAgc21hcnRMaXN0LmV4ZWMoKTtcbiAgICAvLyBzZXRUaW1lb3V0KCAoKSA9PiBzbWFydExpc3QuZXhlYygpLDIwMCApO1xuICB9XG5cbiAgcmV0dXJuIGluc3RhbmNlO1xufTsiLCJpbXBvcnQge0dyaWR9IGZyb20gJy4vZ3JpZCc7XG5pbXBvcnQge2NyZWF0ZVN0b3JlfSBmcm9tICdyZWR1eCc7XG5pbXBvcnQgcmVkdWNlciBmcm9tICcuLi9yZWR1Y2Vycy9pbmRleCc7XG5pbXBvcnQge1JPV1MsIENPTFVNTlN9IGZyb20gJy4vY29uc3QnO1xuaW1wb3J0IHtjb25uZWN0fSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge2JpbmRBY3Rpb25zfSBmcm9tICcuLi9hY3Rpb25zL2luZGV4JztcbmltcG9ydCBncmlkaWZ5IGZyb20gJy4uL2NvbWJpbmF0b3JzL2dyaWRJbmplY3RlZCc7XG5pbXBvcnQgc21hcnRMaXN0UmVnaXN0cnkgZnJvbSAnLi9zbWFydExpc3RSZWdpc3RyeSc7XG5cblxuY29uc3QgZ3JpZCA9IEdyaWQoe3Jvd3M6IFJPV1MsIGNvbHVtbnM6IENPTFVNTlN9KTtcblxuLy90b2RvIGR1bW15IGZvciB0ZXN0XG5ncmlkLnVwZGF0ZUF0KDEsIDEsIHtkeDogMiwgZHk6IDQsIGRhdGE6e3RpdGxlOid0ZXN0Jyx0eXBlOidsaXN0Jyxzb3VyY2U6J2lzc3Vlcyd9fSk7XG5cblxuY29uc3QgaW5pdGlhbFN0YXRlID0ge1xuICBncmlkOiB7XG4gICAgcGFuZWxzOiBbLi4uZ3JpZF0sXG4gICAgYWN0aXZlOiBudWxsLFxuICB9LFxuICBzbWFydExpc3Q6IFt7eDogMSwgeTogMX1dXG59O1xuXG5jb25zdCBzdG9yZSA9IGNyZWF0ZVN0b3JlKHJlZHVjZXIoZ3JpZCksIGluaXRpYWxTdGF0ZSxcbiAgd2luZG93Ll9fUkVEVVhfREVWVE9PTFNfRVhURU5TSU9OX18gJiYgd2luZG93Ll9fUkVEVVhfREVWVE9PTFNfRVhURU5TSU9OX18oKSk7XG5jb25zdCBhY3Rpb25zID0gYmluZEFjdGlvbnMoc3RvcmUpO1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIGdyaWRpZnk6IGdyaWRpZnkoZ3JpZCwgYWN0aW9ucyksXG4gIHN0b3JlLFxuICBjb25uZWN0OiAoc2xpY2VTdGF0ZSkgPT4gY29ubmVjdChzdG9yZSwgYWN0aW9ucywgc2xpY2VTdGF0ZSksXG4gIHNtYXJ0TGlzdFJlZ2lzdHJ5OiBzbWFydExpc3RSZWdpc3RyeShzdG9yZSwgYWN0aW9ucylcbn0iLCJpbXBvcnQge0lzc3Vlc0xpc3R9IGZyb20gJy4uL3ZpZXdzL0lzc3VlcydcbmltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEFwcCBmcm9tICcuLi9saWIvc3RvcmUnO1xuXG5cbmNvbnN0IGNvbm5lY3RUb1NtYXJ0TGlzdCA9ICh4LCB5KSA9PiBBcHAuY29ubmVjdChzdGF0ZSA9PiBzdGF0ZS5zbWFydExpc3QuZmluZChzbCA9PiBzbC54ID09PSB4ICYmIHNsLnkgPT09IHkpKTtcblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzKSA9PiB7XG5cbiAgY29uc3Qge3gsIHl9ID0gcHJvcHM7XG4gIGNvbnN0IHNtYXJ0VGFibGUgPSBBcHAuc21hcnRMaXN0UmVnaXN0cnkuZ2V0U21hcnRMaXN0KHgsIHkpO1xuICBjb25zdCBjb25uZWN0ID0gY29ubmVjdFRvU21hcnRMaXN0KHgsIHkpO1xuXG4gIGNvbnN0IENvbXAgPSBjb25uZWN0KCh7aXRlbXM9W119KSA9PiAoXG4gICAgPGRpdiBjbGFzcz1cImlzc3Vlcy1jb250YWluZXJcIj5cbiAgICAgIDxidXR0b24gb25DbGljaz17ZXYgPT4ge1xuICAgICAgICBzbWFydFRhYmxlLnNvcnQoe3BvaW50ZXI6ICd0aXRsZScsIGRpcmVjdGlvbjpbJ2FzYycsJ2Rlc2MnXVtNYXRoLnJhbmRvbSgpID4gMC41ID8gMSA6MF19KVxuICAgICAgfX0+Y2xpY2tcbiAgICAgIDwvYnV0dG9uPlxuICAgICAgPElzc3Vlc0xpc3QgaXNzdWVzPXtpdGVtcy5tYXAoaT0+aS52YWx1ZSl9IC8+XG4gICAgPC9kaXY+KSk7XG5cbiAgcmV0dXJuIDxDb21wLz47XG59IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge0VtcHR5UGFuZWwsIExpc3RQYW5lbCwgQ2hhcnRQYW5lbH0gZnJvbSAnLi4vdmlld3MvUmVzaXphYmxlRGF0YVBhbmVsJztcbmltcG9ydCBTbWFydElzc3Vlc0xpc3QgZnJvbSAnLi9TbWFydElzc3VlTGlzdCc7XG5cbmV4cG9ydCBjb25zdCBFbXB0eURhdGFQYW5lbCA9IChwcm9wcywgZ3JpZCwgYWN0aW9ucykgPT4ge1xuICBjb25zdCB7eCwgeSwgb25EcmFnU3RhcnR9ID0gcHJvcHM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcblxuICBjb25zdCBvbkNsaWNrID0gXyA9PiB7XG4gICAgYWN0aW9ucy5vcGVuTW9kYWwoe3gsIHksIHRpdGxlOiAnQ3JlYXRlIG5ldyBkYXRhIHBhbmVsJywgbW9kYWxUeXBlOiAnY3JlYXRlUGFuZWxEYXRhJ30pO1xuICB9O1xuXG4gIHJldHVybiA8RW1wdHlQYW5lbCB7Li4ucGFuZWxEYXRhfSBvbkNsaWNrPXtvbkNsaWNrfSBvbkRyYWdTdGFydD17b25EcmFnU3RhcnR9Lz47XG59O1xuXG5leHBvcnQgY29uc3QgRGF0YUxpc3RQYW5lbCA9IChwcm9wcywgZ3JpZCkgPT4ge1xuICBjb25zdCB7eCwgeSwgb25EcmFnU3RhcnR9ID0gcHJvcHM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgcmV0dXJuICg8TGlzdFBhbmVsIG9uRHJhZ1N0YXJ0PXtvbkRyYWdTdGFydH0gey4uLnBhbmVsRGF0YX0gPlxuICAgIDxTbWFydElzc3Vlc0xpc3QgeD17eH0geT17eX0gLz5cbiAgPC9MaXN0UGFuZWw+KTtcbn07XG5cbmV4cG9ydCBjb25zdCBDaGFydERhdGFQYW5lbCA9IChwcm9wcywgZ3JpZCkgPT4ge1xuICBjb25zdCB7eCwgeSwgb25EcmFnU3RhcnR9ID0gcHJvcHM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcblxuICByZXR1cm4gPENoYXJ0UGFuZWwgb25EcmFnU3RhcnQ9e29uRHJhZ1N0YXJ0fSB7Li4ucGFuZWxEYXRhfS8+XG59O1xuXG5jb25zdCBnZXREYXRhUGFuZWwgPSAodHlwZSkgPT4ge1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdjaGFydCc6XG4gICAgICByZXR1cm4gQ2hhcnREYXRhUGFuZWw7XG4gICAgY2FzZSAnbGlzdCc6XG4gICAgICByZXR1cm4gRGF0YUxpc3RQYW5lbDtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIEVtcHR5RGF0YVBhbmVsO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgRGF0YVBhbmVsID0gKHByb3BzLCBncmlkLCBhY3Rpb25zKSA9PiB7XG4gIGNvbnN0IHt4LCB5fSA9IHByb3BzO1xuICBjb25zdCBwYW5lbERhdGEgPSBncmlkLmdldERhdGEoeCwgeSk7XG4gIGNvbnN0IHtkYXRhID0ge319PXBhbmVsRGF0YTtcblxuICBjb25zdCBvbkRyYWdTdGFydCA9IGV2ID0+IHtcbiAgICBldi5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdtb3ZlJztcbiAgICBldi5kYXRhVHJhbnNmZXIuc2V0RGF0YSgndGV4dC9wbGFpbicsIEpTT04uc3RyaW5naWZ5KHt4LCB5fSkpO1xuICAgIGFjdGlvbnMuc3RhcnRSZXNpemUoe3gsIHl9KTtcbiAgfTtcblxuICBjb25zdCBQYW5lbCA9IGdldERhdGFQYW5lbChkYXRhLnR5cGUpO1xuXG4gIHJldHVybiBQYW5lbChPYmplY3QuYXNzaWduKHtvbkRyYWdTdGFydH0sIHByb3BzKSwgZ3JpZCwgYWN0aW9ucyk7XG59O1xuXG4iLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcblxuZXhwb3J0IGRlZmF1bHQgcHJvcHMgPT4ge1xuICBjb25zdCB7aXNPcGVuLCBjbG9zZU1vZGFsLCB0aXRsZX0gPSBwcm9wcztcbiAgY29uc3Qgb25LZXlEb3duID0gKHtjb2RlfSkgPT4ge1xuICAgIGlmKGNvZGUgPT09ICdFc2NhcGUnKXtcbiAgICAgIGNsb3NlTW9kYWwoKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuICg8ZGl2IGFyaWEtaGlkZGVuPXtTdHJpbmcoIWlzT3Blbil9IG9uS2V5RG93bj17b25LZXlEb3dufSBjbGFzcz1cIm1vZGFsXCI+XG4gICAgPGhlYWRlcj5cbiAgICAgIDxoMj57dGl0bGV9PC9oMj5cbiAgICAgIDxidXR0b24gb25DbGljaz17Y2xvc2VNb2RhbH0+WDwvYnV0dG9uPlxuICAgIDwvaGVhZGVyPlxuICAgIHtwcm9wcy5jaGlsZHJlbn1cbiAgPC9kaXY+KVxufTsiLCJpbXBvcnQge2gsIG9uTW91bnQsIHdpdGhTdGF0ZX0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IE1vZGFsIGZyb20gJy4vTW9kYWwnO1xuXG5jb25zdCBhdXRvZm9jdXMgPSBvbk1vdW50KCh2bm9kZSk9PntcbiAgdm5vZGUuZG9tLmZvY3VzKCk7XG59KTtcbmNvbnN0IEF1dG9mb2N1c0lucHV0ID0gYXV0b2ZvY3VzKHByb3BzID0+IDxpbnB1dCB7Li4ucHJvcHN9IC8+KTtcblxuY29uc3QgU291cmNlVHlwZVNlbGVjdCA9IHByb3BzID0+IHtcbiAgY29uc3Qge29uVXBkYXRlfSA9IHByb3BzO1xuICByZXR1cm4gPGxhYmVsPlxuICAgIDxzcGFuPlNvdXJjZSB0eXBlPC9zcGFuPlxuICAgIDxzZWxlY3QgcmVxdWlyZWQ9XCJ0cnVlXCIgb25DaGFuZ2U9e2V2ID0+IG9uVXBkYXRlKHtzb3VyY2U6IGV2LnRhcmdldC52YWx1ZX0pfSBuYW1lPVwic291cmNlVHlwZVwiPlxuICAgICAgPG9wdGlvbiB2YWx1ZT1cIlwiPi08L29wdGlvbj5cbiAgICAgIDxvcHRpb24gdmFsdWU9XCJpc3N1ZXNcIj5Jc3N1ZXM8L29wdGlvbj5cbiAgICAgIDxvcHRpb24gdmFsdWU9XCJwcnNcIj5QdWxsIHJlcXVlc3Q8L29wdGlvbj5cbiAgICA8L3NlbGVjdD5cbiAgPC9sYWJlbD5cbn07XG5cbmNvbnN0IExpc3RJbnB1dCA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gKDxkaXY+XG4gICAgPFNvdXJjZVR5cGVTZWxlY3Qgey4uLnByb3BzfSAvPlxuICA8L2Rpdj4pO1xufTtcbmNvbnN0IENoYXJ0SW5wdXQgPSAoKSA9PiA8cD5DaGFydCBJbnB1dDwvcD47XG5jb25zdCBBZ2dyZWdhdGlvbklucHV0ID0gKCkgPT4gPHA+QWdncmVnYXRpb25JbnB1dDwvcD47XG5jb25zdCBOb1R5cGVJbnB1dCA9ICgpID0+IDxwPlNlbGVjdCBhIHBhbmVsIHR5cGUgPC9wPjtcblxuY29uc3QgZ2V0SW5wdXRTZWN0aW9uID0gKGRhdGEgPSB7fSkgPT4ge1xuICBjb25zdCB7dHlwZX0gPSBkYXRhO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdsaXN0JzpcbiAgICAgIHJldHVybiBMaXN0SW5wdXQ7XG4gICAgY2FzZSAnY2hhcnQnOlxuICAgICAgcmV0dXJuIENoYXJ0SW5wdXQ7XG4gICAgY2FzZSAnYWdncmVnYXRpb24nOlxuICAgICAgcmV0dXJuIEFnZ3JlZ2F0aW9uSW5wdXQ7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBOb1R5cGVJbnB1dDtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IFR5cGVTZWN0aW9uID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtkYXRhLCBvblVwZGF0ZX0gPSBwcm9wcztcbiAgY29uc3QgSW5wdXRTZWN0aW9uID0gZ2V0SW5wdXRTZWN0aW9uKGRhdGEpO1xuICBjb25zdCB1cGRhdGUgPSAoZXYpID0+IHtcbiAgICBvblVwZGF0ZSh7dHlwZTogZXYudGFyZ2V0LnZhbHVlfSk7XG4gIH07XG4gIHJldHVybiAoXG4gICAgPGRpdj5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPHNwYW4+UGFuZWwgdHlwZTo8L3NwYW4+XG4gICAgICAgIDxzZWxlY3Qgb25DaGFuZ2U9e3VwZGF0ZX0gcmVxdWlyZWQ9XCJ0cnVlXCIgbmFtZT1cInR5cGVcIj5cbiAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiXCI+IC08L29wdGlvbj5cbiAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibGlzdFwiPkxpc3Q8L29wdGlvbj5cbiAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY2hhcnRcIj5DaGFydDwvb3B0aW9uPlxuICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJhZ2dyZWdhdGlvblwiPkFnZ3JlZ2F0aW9uPC9vcHRpb24+XG4gICAgICAgIDwvc2VsZWN0PlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxJbnB1dFNlY3Rpb24gZGF0YT17ZGF0YX0gb25VcGRhdGU9e29uVXBkYXRlfS8+XG4gICAgPC9kaXY+KTtcbn07XG5cbmV4cG9ydCBjb25zdCBFZGl0RGF0YVBhbmVsRm9ybSA9IChwcm9wcykgPT4ge1xuICBjb25zdCB7ZGF0YSwgb25VcGRhdGUsIG9uU3VibWl0fT1wcm9wcztcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzPVwibW9kYWwtY29udGVudFwiPlxuICAgICAgPGZvcm0gb25TdWJtaXQ9e29uU3VibWl0fT5cbiAgICAgICAgPGxhYmVsPlxuICAgICAgICAgIDxzcGFuPlBhbmVsIHRpdGxlOjwvc3Bhbj5cbiAgICAgICAgICA8QXV0b2ZvY3VzSW5wdXQgb25DaGFuZ2U9e2V2ID0+IG9uVXBkYXRlKHt0aXRsZTogZXYudGFyZ2V0LnZhbHVlfSl9IG5hbWU9XCJ0aXRsZVwiIHJlcXVpcmVkPVwidHJ1ZVwiLz5cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPFR5cGVTZWN0aW9uIGRhdGE9e2RhdGF9IG9uVXBkYXRlPXtvblVwZGF0ZX0vPlxuICAgICAgICA8YnV0dG9uPkNyZWF0ZTwvYnV0dG9uPlxuICAgICAgPC9mb3JtPlxuICAgIDwvZGl2Pik7XG59O1xuXG5leHBvcnQgY29uc3QgRWRpdERhdGFQYW5lbE1vZGFsID0gKHByb3BzKSA9PiB7XG5cbiAgY29uc3QgVXBkYXRhYmxlRm9ybVNlY3Rpb24gPSB3aXRoU3RhdGUoKHByb3BzLCB1cGRhdGUpID0+IHtcbiAgICBjb25zdCB7ZGF0YSA9IHt9fSA9IHByb3BzO1xuICAgIGNvbnN0IG9uVXBkYXRlID0gKHZhbCkgPT4ge1xuICAgICAgT2JqZWN0LmFzc2lnbihkYXRhLHZhbCk7XG4gICAgICB1cGRhdGUoT2JqZWN0LmFzc2lnbihwcm9wcyx7ZGF0YX0pKTtcbiAgICB9O1xuICAgIHJldHVybiA8RWRpdERhdGFQYW5lbEZvcm0gb25VcGRhdGU9e29uVXBkYXRlfSB7Li4ucHJvcHN9Lz47XG4gIH0pO1xuXG4gIHJldHVybiAoPE1vZGFsIGlzT3Blbj17cHJvcHMuaXNPcGVufSBjbG9zZU1vZGFsPXtwcm9wcy5jbG9zZU1vZGFsfSB0aXRsZT17cHJvcHMudGl0bGV9PlxuICAgIDxVcGRhdGFibGVGb3JtU2VjdGlvbiB7Li4ucHJvcHN9Lz5cbiAgPC9Nb2RhbD4pO1xufTtcblxuIiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge0VkaXREYXRhUGFuZWxNb2RhbH0gZnJvbSAnLi4vdmlld3MvRWRpdERhdGFQYW5lbEZvcm0nO1xuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMsIGdyaWQsIGFjdGlvbnMpID0+IHtcbiAgY29uc3Qge3gsIHksIGRhdGEgPSB7fSwgbW9kYWxUeXBlfSA9IHByb3BzO1xuICBjb25zdCBvblN1Ym1pdCA9IGV2ID0+IHtcbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGFjdGlvbnMudXBkYXRlUGFuZWxEYXRhKHt4LCB5LCBkYXRhOiBkYXRhfSk7XG4gICAgY29uc3Qge3R5cGV9ID0gZGF0YTtcbiAgICBpZiAodHlwZSA9PT0gJ2xpc3QnKSB7XG5cbiAgICB9XG4gICAgYWN0aW9ucy5jbG9zZU1vZGFsKCk7XG4gIH07XG5cbiAgcmV0dXJuIDxFZGl0RGF0YVBhbmVsTW9kYWwgZGF0YT17ZGF0YX0gY2xvc2VNb2RhbD17YWN0aW9ucy5jbG9zZU1vZGFsfSB7Li4ucHJvcHN9IG9uU3VibWl0PXtvblN1Ym1pdH0vPlxufVxuXG5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEVkaXRQYW5lbERhdGFNb2RhbCBmcm9tICcuLi9jb21wb25lbnRzL0VkaXRQYW5lbERhdGFNb2RhbCc7XG5pbXBvcnQge2RlZmF1bHQgYXMgTW9kYWxWaWV3fSAgZnJvbSAnLi4vdmlld3MvTW9kYWwnO1xuXG5leHBvcnQgY29uc3QgRW1wdHlNb2RhbCA9IChwcm9wcywgZ3JpZCwgYWN0aW9ucykgPT4ge1xuICByZXR1cm4gKDxNb2RhbFZpZXcgaXNPcGVuPXtwcm9wcy5pc09wZW59IGNsb3NlTW9kYWw9e2FjdGlvbnMuY2xvc2VNb2RhbH0+XG4gICAgPGRpdj48L2Rpdj5cbiAgPC9Nb2RhbFZpZXc+KTtcbn07XG5cblxuZXhwb3J0IGRlZmF1bHQgTW9kYWwgPSAocHJvcHMsIGdyaWQsIGFjdGlvbnMpID0+IHtcbiAgY29uc3Qge21vZGFsVHlwZX0gPSBwcm9wcztcbiAgY29uc3QgTW9kYWxDb21wb25lbnQgPSBtb2RhbFR5cGUgPT09ICdjcmVhdGVQYW5lbERhdGEnID8gRWRpdFBhbmVsRGF0YU1vZGFsIDogRW1wdHlNb2RhbDtcbiAgcmV0dXJuIE1vZGFsQ29tcG9uZW50KHByb3BzLCBncmlkLCBhY3Rpb25zKTtcbn07IiwiaW1wb3J0IHttb3VudCwgaH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEFkb3JuZXJQYW5lbCBmcm9tICcuL2NvbXBvbmVudHMvQWRvcm5lclBhbmVsJztcbmltcG9ydCB7RGF0YVBhbmVsfSBmcm9tICcuL2NvbXBvbmVudHMvUmVzaXphYmxlRGF0YVBhbmVsJztcbmltcG9ydCB7Uk9XUywgQ09MVU1OU30gZnJvbSAnLi9saWIvY29uc3QnO1xuaW1wb3J0IEFwcCBmcm9tICcuL2xpYi9zdG9yZSc7XG5pbXBvcnQgTW9kYWwgZnJvbSAnLi9jb21wb25lbnRzL01vZGFsLmpzJztcbmltcG9ydCB7Y29tcG9zZX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJ1xuXG5jb25zdCB7c3RvcmUsIGNvbm5lY3QsIGdyaWRpZnl9ID0gQXBwO1xuXG5jb25zdCBjb25uZWN0VG9Nb2RhbCA9IGNvbm5lY3Qoc3RhdGUgPT4gc3RhdGUubW9kYWwpO1xuY29uc3QgU2lkZU1vZGFsID0gY29tcG9zZShncmlkaWZ5LGNvbm5lY3RUb01vZGFsKShNb2RhbCk7XG5cbmNvbnN0IGdldENvb3Jkc0Zyb21Nb3VzZUV2ZW50ID0gKGNvbHVtbnMsIHJvd3MpID0+IChldikgPT4ge1xuICBjb25zdCB7Y3VycmVudFRhcmdldCwgb2Zmc2V0WCwgb2Zmc2V0WX0gPSBldjtcbiAgY29uc3Qge29mZnNldFdpZHRoLCBvZmZzZXRIZWlnaHR9ID0gY3VycmVudFRhcmdldDtcbiAgbGV0IHhwaXggPSBvZmZzZXRYO1xuICBsZXQgeXBpeCA9IG9mZnNldFk7XG4gIGxldCB7dGFyZ2V0fSA9IGV2O1xuICB3aGlsZSAodGFyZ2V0ICE9PSBjdXJyZW50VGFyZ2V0KSB7XG4gICAgeHBpeCArPSB0YXJnZXQub2Zmc2V0TGVmdDtcbiAgICB5cGl4ICs9IHRhcmdldC5vZmZzZXRUb3A7XG4gICAgdGFyZ2V0ID0gdGFyZ2V0Lm9mZnNldFBhcmVudDtcbiAgfVxuICBjb25zdCB4ID0gTWF0aC5mbG9vcigoeHBpeCAvIG9mZnNldFdpZHRoKSAqIENPTFVNTlMpICsgMTtcbiAgY29uc3QgeSA9IE1hdGguZmxvb3IoKHlwaXggLyBvZmZzZXRIZWlnaHQpICogUk9XUykgKyAxO1xuICByZXR1cm4ge3gsIHl9O1xufTtcblxuY29uc3QgQ29udGFpbmVyID0gZ3JpZGlmeSgoe3BhbmVsc30sIGdyaWQsIGFjdGlvbnMpID0+IHtcblxuICAvL2NyZWF0ZSBzdWJzY3JpcHRpb24gdG8gcGFuZWwoeCx5KVxuICBjb25zdCBmaW5kUGFuZWxGcm9tU3RhdGUgPSAoeCwgeSkgPT4gc3RhdGUgPT4gc3RhdGUuZ3JpZC5wYW5lbHMuZmluZCgoe3g6cHgsIHk6cHl9KSA9PiB4ID09PSBweCAmJiB5ID09PSBweSk7XG4gIGNvbnN0IHN1YnNjcmliZVRvID0gKHgsIHkpID0+IGNvbm5lY3QoZmluZFBhbmVsRnJvbVN0YXRlKHgsIHkpKTtcbiAgY29uc3Qgc3Vic2NyaWJlRnVuY3Rpb25zID0gcGFuZWxzLm1hcCgoe3gsIHl9KSA9PiBjb21wb3NlKGdyaWRpZnksIHN1YnNjcmliZVRvKHgsIHkpKSk7XG5cbiAgLy9jcmVhdGUgY29ubmVjdGVkIGNvbXBvbmVudHNcbiAgY29uc3QgQWRvcm5lclBhbmVsQ29tcG9uZW50cyA9IHN1YnNjcmliZUZ1bmN0aW9ucy5tYXAoc3Vic2NyaWJlID0+IHN1YnNjcmliZShBZG9ybmVyUGFuZWwpKTtcbiAgY29uc3QgRGF0YVBhbmVsQ29tcG9uZW50cyA9IHN1YnNjcmliZUZ1bmN0aW9ucy5tYXAoc3Vic2NyaWJlID0+IHN1YnNjcmliZShEYXRhUGFuZWwpKTtcblxuICBjb25zdCBjb29yZHMgPSBnZXRDb29yZHNGcm9tTW91c2VFdmVudChDT0xVTU5TLCBST1dTKTtcblxuICBjb25zdCBvbkRyYWdPdmVyID0gKGV2KSA9PiB7XG4gICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCB7eCwgeX0gPSBjb29yZHMoZXYpO1xuICAgIGFjdGlvbnMucmVzaXplT3Zlcigoe3gsIHl9KSk7XG4gIH07XG5cbiAgY29uc3Qgb25Ecm9wID0gZXYgPT4ge1xuICAgIGNvbnN0IHtkYXRhVHJhbnNmZXJ9ID0gZXY7XG4gICAgY29uc3QgZGF0YSA9IGRhdGFUcmFuc2Zlci5nZXREYXRhKCd0ZXh0L3BsYWluJyk7XG4gICAgY29uc3QgSnNvbkRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgIGNvbnN0IHt4OnN0YXJ0WCwgeTpzdGFydFl9ID0gSnNvbkRhdGE7XG4gICAgaWYgKHN0YXJ0WCAmJiBzdGFydFkpIHtcbiAgICAgIGNvbnN0IHt4LCB5fSA9IGNvb3Jkcyhldik7XG4gICAgICBhY3Rpb25zLmVuZFJlc2l6ZSgoe3gsIHN0YXJ0WCwgeSwgc3RhcnRZfSkpO1xuICAgIH1cbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICB9O1xuXG4gIHJldHVybiAoPGRpdiBjbGFzcz1cImdyaWQtY29udGFpbmVyXCI+XG4gICAgPGRpdiBjbGFzcz1cImdyaWQgYWRvcm5lci1sYXllclwiPlxuICAgICAge1xuICAgICAgICBBZG9ybmVyUGFuZWxDb21wb25lbnRzLm1hcChQYW5lbCA9PiA8UGFuZWwvPilcbiAgICAgIH1cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZ3JpZCBkYXRhLWxheWVyXCIgb25EcmFnb3Zlcj17b25EcmFnT3Zlcn0gb25Ecm9wPXtvbkRyb3B9PlxuICAgICAge1xuICAgICAgICBEYXRhUGFuZWxDb21wb25lbnRzLm1hcChQYW5lbCA9PiA8UGFuZWwvPilcbiAgICAgIH1cbiAgICA8L2Rpdj5cbiAgICA8U2lkZU1vZGFsIC8+XG4gIDwvZGl2Pik7XG59KTtcblxuY29uc3Qge2dyaWQ6e3BhbmVsc319ID0gc3RvcmUuZ2V0U3RhdGUoKTtcblxubW91bnQoQ29udGFpbmVyLCB7XG4gIHBhbmVsczogcGFuZWxzXG59LCBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWFpbicpKTtcbiJdLCJuYW1lcyI6WyJtb3VudCIsIkFkb3JuZXJQYW5lbCIsIlN5bWJvbCIsIm9iamVjdFByb3RvIiwiaGFzT3duUHJvcGVydHkiLCJzeW1Ub1N0cmluZ1RhZyIsIm5hdGl2ZU9iamVjdFRvU3RyaW5nIiwicm9vdCIsInBvbnlmaWxsIiwiJCRvYnNlcnZhYmxlIiwic3dhcCIsImNvbXBvc2UiLCJjdXJyeSIsInRhcCIsInBvaW50ZXIiLCJmaWx0ZXIiLCJzb3J0RmFjdG9yeSIsInNvcnQiLCJzZWFyY2giLCJ0YWJsZSIsInN0Iiwic3RvcmUiLCJncmlkaWZ5IiwiY29ubmVjdCIsIm9uVXBkYXRlIiwidXBkYXRlIiwiTW9kYWwiLCJNb2RhbFZpZXciXSwibWFwcGluZ3MiOiJBQUFBLE1BQU0sZUFBZSxHQUFHLENBQUMsS0FBSyxNQUFNO0VBQ2xDLFFBQVEsRUFBRSxNQUFNO0VBQ2hCLFFBQVEsRUFBRSxFQUFFO0VBQ1osS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO0VBQ2QsU0FBUyxFQUFFLENBQUM7Q0FDYixDQUFDLENBQUM7Ozs7Ozs7OztBQVNILEFBQWdCLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsR0FBRyxRQUFRLEVBQUU7RUFDeEQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLEtBQUs7SUFDbkQsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3RCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7R0FDbEMsRUFBRSxFQUFFLENBQUM7S0FDSCxHQUFHLENBQUMsS0FBSyxJQUFJOztNQUVaLE1BQU0sSUFBSSxHQUFHLE9BQU8sS0FBSyxDQUFDO01BQzFCLE9BQU8sSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLEtBQUssVUFBVSxHQUFHLEtBQUssR0FBRyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7S0FDbEYsQ0FBQyxDQUFDOztFQUVMLElBQUksT0FBTyxRQUFRLEtBQUssVUFBVSxFQUFFO0lBQ2xDLE9BQU87TUFDTCxR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
