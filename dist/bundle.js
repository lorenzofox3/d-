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

function swap (f) {
  return (a, b) => f(b, a);
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

/**
 * Create a function which will trigger an update of the component with the passed state
 * @param comp {Function} - the component to update
 * @param initialVNode - the initial virtual dom node related to the component (ie once it has been mounted)
 * @returns {Function} - the update function
 */
var update = (comp, initialVNode) => {
  let oldNode = initialVNode;
  return (props, ...args) => {
    const mount$$1 = oldNode.dom.parentNode;
    const newNode = comp(Object.assign({children: oldNode.children || []}, oldNode.props, props), ...args);
    const nextBatch = render(oldNode, newNode, mount$$1);

    // danger zone !!!!
    // change by keeping the same reference so the eventual parent node does not need to be "aware" tree may have changed downstream: oldNode may be the child of someone ...(well that is a tree data structure after all :P )
    oldNode = Object.assign(oldNode || {}, newNode);
    // end danger zone

    nextTick(_ => {
      for (let op of nextBatch) {
        op();
      }
    });
    return newNode;
  };
};

const lifeCycleFactory = method => curry((fn, comp) => (props, ...args) => {
  const n = comp(props, ...args);
  const applyFn = () => fn(n, ...args);
  const current = n[method];
  n[method] = current ? compose(current, applyFn) : applyFn;
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

/**
 * Combinator to create a "stateful component": ie it will have its own state and the ability to update its own tree
 * @param comp {Function} - the component
 * @returns {Function} - a new wrapped component
 */
var withState = (comp) => () => {
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

/**
 * Combinator to create a Elm like app
 * @param view {Function} - a component which takes as arguments the current model and the list of updates
 * @returns {Function} - a Elm like application whose properties "model", "updates" and "subscriptions" will define the related domain specific objects
 */

/**
 * Connect combinator: will create "container" component which will subscribe to a Redux like store. and update its children whenever a specific slice of state change under specific circumstances
 * @param store {Object} - The store (implementing the same api than Redux store
 * @param sliceState {Function} [state => state] - A function which takes as argument the state and return a "transformed" state (like partial, etc) relevant to the container
 * @returns {Function} - A container factory with the following arguments:
 *  - mapStateToProp: a function which takes as argument what the "sliceState" function returns and returns an object to be blended into the properties of the component (default to identity function)
 *  - shouldUpdate: a function which takes as arguments the previous and the current versions of what "sliceState" function returns to returns a boolean defining whether the component should be updated (default to a deepEqual check)
 */
var connect = (store, sliceState = identity) =>
  (comp, mapStateToProp = identity, shouldUpate = (a, b) => isDeepEqual(a, b) === false) =>
    (initProp) => {
      let componentProps = initProp;
      let updateFunc, previousStateSlice, unsubscriber;

      const wrapperComp = (props, ...args) => {
        return comp(Object.assign(props, mapStateToProp(sliceState(store.getState()))), ...args);
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

const ROWS = 4;
const COLUMNS = 4;

const setCustomProperties = vnode => {
  const {props, dom} = vnode;
  const {x, y, dx, dy, z} = (props || {});
  if (dom) {
    dom.style.setProperty('--grid-column-offset', x);
    dom.style.setProperty('--grid-row-offset', y);
    dom.style.setProperty('--grid-column-span', dx);
    dom.style.setProperty('--grid-row-span', dy);
    if (z) {
      dom.style.setProperty('z-index', z);
    }
  }
};

var panel = compose(onMount(setCustomProperties), onUpdate(setCustomProperties));

var AdornerPanel$1 = panel(({x, y, adornerStatus}) => {
  const classes = ['panel'];
  if (adornerStatus === 1) {
    classes.push('valid-panel');
  } else if (adornerStatus === -1) {
    classes.push('invalid-panel');
  }
  return h( 'div', { class: classes.join(' '), x: x, y: y, dx: 1, dy: 1 });
});

var AdornerPanel = (props, {grid}) => {
  const {x, y} = props;
  const {adornerStatus = 0} = grid.getData(x, y);
  return h( AdornerPanel$1, { x: x, y: y, adornerStatus: adornerStatus })
};

const Bin2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "bin2" ), h( 'path', { d: "M6 32h20l2-22H4zM20 4V0h-8v4H2v6l2-2h24l2 2V4H20zm-2 0h-4V2h4v2z" }))
))};





const Bubbles = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "36", height: "32", viewBox: "0 0 36 32" }, h( 'title', null, "bubbles" ), h( 'path', { d: "M34 28.161a3.65 3.65 0 0 0 2 3.256v.498a7.42 7.42 0 0 1-6.414-2.251c-.819.218-1.688.336-2.587.336-4.971 0-9-3.582-9-8s4.029-8 9-8 9 3.582 9 8c0 1.73-.618 3.331-1.667 4.64a3.635 3.635 0 0 0-.333 1.522zM16 0c8.702 0 15.781 5.644 15.995 12.672A12.262 12.262 0 0 0 27 11.625c-2.986 0-5.807 1.045-7.942 2.943-2.214 1.968-3.433 4.607-3.433 7.432 0 1.396.298 2.747.867 3.993a19.66 19.66 0 0 1-2.987-.151C10.068 29.279 5.966 29.895 2 29.986v-.841C4.142 28.096 6 26.184 6 24c0-.305-.024-.604-.068-.897C2.313 20.72 0 17.079 0 13 0 5.82 7.163 0 16 0z" }))
))};













const Cross = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "cross" ), h( 'path', { d: "M31.708 25.708L22 16l9.708-9.708a1 1 0 0 0 0-1.414L27.122.292a1 1 0 0 0-1.414-.001L16 9.999 6.292.291a.998.998 0 0 0-1.414.001L.292 4.878a1 1 0 0 0 0 1.414L10 16 .292 25.708a.999.999 0 0 0 0 1.414l4.586 4.586a1 1 0 0 0 1.414 0L16 22l9.708 9.708a1 1 0 0 0 1.414 0l4.586-4.586a.999.999 0 0 0 0-1.414z" }))
))};



const Embed2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "40", height: "32", viewBox: "0 0 40 32" }, h( 'title', null, "embed2" ), h( 'path', { d: "M26 23l3 3 10-10L29 6l-3 3 7 7zM14 9l-3-3L1 16l10 10 3-3-7-7zM21.916 4.704l2.171.592-6 22.001-2.171-.592 6-22.001z" }))
))};

const Enlarge = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "enlarge" ), h( 'path', { d: "M32 0H19l5 5-6 6 3 3 6-6 5 5zM32 32V19l-5 5-6-6-3 3 6 6-5 5zM0 32h13l-5-5 6-6-3-3-6 6-5-5zM0 0v13l5-5 6 6 3-3-6-6 5-5z" }))
))};

const Enlarge2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "enlarge2" ), h( 'path', { d: "M32 32H19l5-5-6-6 3-3 6 6 5-5zM11 14L5 8l-5 5V0h13L8 5l6 6z" }))
))};

const Equalizer = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "equalizer" ), h( 'path', { d: "M14 4v-.5c0-.825-.675-1.5-1.5-1.5h-5C6.675 2 6 2.675 6 3.5V4H0v4h6v.5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5V8h18V4H14zM8 8V4h4v4H8zm18 5.5c0-.825-.675-1.5-1.5-1.5h-5c-.825 0-1.5.675-1.5 1.5v.5H0v4h18v.5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5V18h6v-4h-6v-.5zM20 18v-4h4v4h-4zm-6 5.5c0-.825-.675-1.5-1.5-1.5h-5c-.825 0-1.5.675-1.5 1.5v.5H0v4h6v.5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5V28h18v-4H14v-.5zM8 28v-4h4v4H8z" }))
))};















const List = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "list" ), h( 'path', { d: "M0 0h8v8H0zm12 2h20v4H12zM0 12h8v8H0zm12 2h20v4H12zM0 24h8v8H0zm12 2h20v4H12z" }))
))};







const Notification = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "notification" ), h( 'path', { d: "M16 3c-3.472 0-6.737 1.352-9.192 3.808S3 12.528 3 16c0 3.472 1.352 6.737 3.808 9.192S12.528 29 16 29c3.472 0 6.737-1.352 9.192-3.808S29 19.472 29 16c0-3.472-1.352-6.737-3.808-9.192S19.472 3 16 3zm0-3c8.837 0 16 7.163 16 16s-7.163 16-16 16S0 24.837 0 16 7.163 0 16 0zm-2 22h4v4h-4zm0-16h4v12h-4z" }))
))};











const Sigma = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "sigma" ), h( 'path', { d: "M29.425 22.96L30.812 20H32l-2 12H0v-2.32l10.361-12.225L0 7.094V0h30.625L32 8h-1.074l-.585-1.215C29.237 4.492 28.407 4 26 4H5.312l11.033 11.033L7.051 26H24c3.625 0 4.583-1.299 5.425-3.04z" }))
))};

const SortAmountAsc = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "sort-amount-asc" ), h( 'path', { d: "M10 24V0H6v24H1l7 7 7-7h-5z" }), h( 'path', { d: "M14 18h18v4H14v-4zM14 12h14v4H14v-4zM14 6h10v4H14V6zM14 0h6v4h-6V0z" }))
))};



const StarFull = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "star-full" ), h( 'path', { d: "M32 12.408l-11.056-1.607L16 .783l-4.944 10.018L0 12.408l8 7.798-1.889 11.011L16 26.018l9.889 5.199L24 20.206l8-7.798z" }))
))};



const StatsBars = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "stats-bars" ), h( 'path', { d: "M0 26h32v4H0zm4-8h4v6H4zm6-8h4v14h-4zm6 6h4v8h-4zm6-12h4v20h-4z" }))
))};







const Tree = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "tree" ), h( 'path', { d: "M30.5 24H30v-6.5c0-1.93-1.57-3.5-3.5-3.5H18v-4h.5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5h-5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h.5v4H5.5C3.57 14 2 15.57 2 17.5V24h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5H6v-6h8v6h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5H18v-6h8v6h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5zM6 30H2v-4h4v4zm12 0h-4v-4h4v4zM14 8V4h4v4h-4zm16 22h-4v-4h4v4z" }))
))};







const Users = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "36", height: "32", viewBox: "0 0 36 32" }, h( 'title', null, "users" ), h( 'path', { d: "M24 24.082v-1.649c2.203-1.241 4-4.337 4-7.432 0-4.971 0-9-6-9s-6 4.029-6 9c0 3.096 1.797 6.191 4 7.432v1.649C13.216 24.637 8 27.97 8 32h28c0-4.03-5.216-7.364-12-7.918z" }), h( 'path', { d: "M10.225 24.854c1.728-1.13 3.877-1.989 6.243-2.513a11.33 11.33 0 0 1-1.265-1.844c-.95-1.726-1.453-3.627-1.453-5.497 0-2.689 0-5.228.956-7.305.928-2.016 2.598-3.265 4.976-3.734C19.153 1.571 17.746 0 14 0 8 0 8 4.029 8 9c0 3.096 1.797 6.191 4 7.432v1.649c-6.784.555-12 3.888-12 7.918h8.719c.454-.403.956-.787 1.506-1.146z" }))
))};



const Wrench = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (h( 'span', { class: classes },
h( 'svg', { width: "32", height: "32", viewBox: "0 0 32 32" }, h( 'title', null, "wrench" ), h( 'path', { d: "M31.342 25.559L16.95 13.223A9 9 0 0 0 6.387.387l5.2 5.2a2.005 2.005 0 0 1 0 2.828l-3.172 3.172a2.005 2.005 0 0 1-2.828 0l-5.2-5.2A9 9 0 0 0 13.223 16.95l12.336 14.392a1.828 1.828 0 0 0 2.716.104l3.172-3.172c.778-.778.731-2-.104-2.716z" }))
))};

var flexible = Comp => panel((props) => {
  const {x, y, dx = 1, dy = 1, adornerStatus, onResizeStart, onMoveStart} = props;
  const z = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['panel', 'data-panel'];

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return (h( 'div', { x: x, y: y, dx: dx, dy: dy, z: z, class: panelClasses.join(' ') },
    h( 'div', { class: "move-handle", draggable: "true", onDragStart: onMoveStart },
      h( Enlarge, null )
    ),
    h( Comp, props),
    h( 'div', { class: "resize-handle", draggable: "true", onDragStart: onResizeStart },
      h( Enlarge2, null )
    )
  ));
});

var EmptyDataPanel$1 = flexible(props =>
  h( 'div', { class: "empty-panel-toolbar" },
    h( 'button', { onClick: props.createSmartList }, h( List, null )),
    h( 'button', { onClick: props.createSmartChart }, h( StatsBars, null )),
    h( 'button', { onClick: props.createSmartAggregation }, h( Sigma, null ))
  ));

var flexible$1 = (Comp) => (props, services) => {
  const {x, y} = props;
  const {actions} = services;

  const onResizeStart = ev => {
    ev.dataTransfer.dropEffect = 'copy';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y, operation: 'resize'}));
    actions.startResize({x, y});
  };

  const onMoveStart = ev => {
    ev.dataTransfer.dropEffect = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y, operation: 'move'}));
    actions.startMove({x, y});
  };

  return Comp(Object.assign({}, {onResizeStart, onMoveStart}, props), services);
};

var EmptyDataPanel = flexible$1((props, {grid, actions}) => {
  const {x, y, onResizeStart, onMoveStart} = props;
  const panelData = grid.getData(x, y);

  const createSmartList = _ => {
    actions.openModal({x, y, title: 'Create new data panel', modalType: 'createSmartListPanelData'});
  };

  const createSmartChart = _ => {
    actions.openModal({x, y, title: 'Create new Chart data panel', modalType: 'createSmartChartPanelData'});
  };

  return h( EmptyDataPanel$1, Object.assign({}, panelData, { onMoveStart: onMoveStart, createSmartList: createSmartList, createSmartChart: createSmartChart, onResizeStart: onResizeStart }));
});

var ListDataPanel$1 = flexible(props => {
  const {data = {}, onReset, onEdit, onToggleToolBar} = props;
  const {processing = false} = data;
  const showToolbar = String(data.showToolBar === true);
  //todo aria-controls
  return (h( 'div', { class: "panel-content" },
    h( 'header', { class: "panel-header" },
      h( 'h2', null, data.title ),
      h( 'button', { 'aria-haspopup': "true", 'aria-pressed': showToolbar, 'aria-expanded': showToolbar, onClick: onToggleToolBar }, h( Wrench, null )),
      h( 'button', { onClick: onEdit }, h( Equalizer, null )),
      h( 'button', { onClick: onReset }, h( Bin2, null )
      )
    ),
    h( 'div', { class: "panel-body" },
      h( 'div', { 'aria-hidden': String(!processing), class: "processing-overlay" }, "Processing ..."),
      props.children
    )
  ));
});

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

function proxyListener$1 (eventMap) {
  return function ({emitter}) {

    const proxy = {};
    let eventListeners = {};

    for (let ev of Object.keys(eventMap)) {
      const method = eventMap[ev];
      eventListeners[ev] = [];
      proxy[method] = function (...listeners) {
        eventListeners[ev] = eventListeners[ev].concat(listeners);
        emitter.on(ev, ...listeners);
        return proxy;
      };
    }

    return Object.assign(proxy, {
      off(ev){
        if (!ev) {
          Object.keys(eventListeners).forEach(eventName => proxy.off(eventName));
        }
        if (eventListeners[ev]) {
          emitter.off(ev, ...eventListeners[ev]);
        }
        return proxy;
      }
    });
  }
}

var events = Object.freeze({
	emitter: emitter,
	proxyListener: proxyListener$1
});

const {proxyListener: proxyListener$2, emitter:createEmitter$1} =events;

const DOM_CLICK = 'DOM_CLICK';
const DOM_KEYDOWN = 'DOM_KEYDOWN';
const DOM_FOCUS = 'DOM_FOCUS';

const domListener = proxyListener$2({
  [DOM_CLICK]: 'onclick',
  [DOM_KEYDOWN]: 'onkeydown',
  [DOM_FOCUS]: 'onfocus'
});

var elementFactory = ({element, emitter: emitter$$1 = createEmitter$1()}) => {

  if (!element) {
    throw new Error('a dom element must be provided');
  }

  const domListenerHandler = (eventName) => (ev) => emitter$$1.dispatch(eventName, ev);

  const listener = domListener({emitter: emitter$$1});
  const clickListener = domListenerHandler(DOM_CLICK);
  const keydownListener = domListenerHandler(DOM_KEYDOWN);
  const focusListener = domListenerHandler(DOM_FOCUS);

  const api = {
    element(){
      return element;
    },
    attr(attributeName, value){
      if (value === void 0) {
        return element.getAttribute(attributeName);
      } else {
        element.setAttribute(attributeName, value);
      }
    },
    addClass(...classNames){
      element.classList.add(...classNames);
    },
    removeClass(...classNames){
      element.classList.remove(...classNames);
    },
    clean(){
      element.removeEventListener('click', clickListener);
      element.removeEventListener('keydown', keydownListener);
      element.removeEventListener('focus', focusListener);
      listener.off(DOM_CLICK);
      listener.off(DOM_KEYDOWN);
      listener.off(DOM_FOCUS);
    }
  };

  element.addEventListener('click', clickListener);
  element.addEventListener('keydown', keydownListener);
  element.addEventListener('focus', focusListener);

  return Object.assign(listener, api);
};

const key = ev => ({key: ev.key, keyCode: ev.keyCode, code: ev.code});
const checkKey = (keyName, keyCode) => ev => {
  const k = key(ev);
  return k.key ? k.key === keyName : k.keyCode === keyCode;
};

const isArrowLeft = checkKey('ArrowLeft', 37);
const isArrowUp = checkKey('ArrowUp', 38);
const isArrowRight = checkKey('ArrowRight', 39);
const isArrowDown = checkKey('ArrowDown', 40);
const isEscape = checkKey('Escape', 27);
const isEnter = checkKey('Enter', 13);
const isSpace = ev => {
  const k = key(ev);
  return k.code ? k.code === 'Space' : k.keyCode === 32;
};

var checkKeys = Object.freeze({
	isArrowLeft: isArrowLeft,
	isArrowUp: isArrowUp,
	isArrowRight: isArrowRight,
	isArrowDown: isArrowDown,
	isEscape: isEscape,
	isEnter: isEnter,
	isSpace: isSpace
});

const {proxyListener, emitter:createEmitter} = events;

const EXPANDED_CHANGED = 'EXPANDED_CHANGED';
const proxy = proxyListener({[EXPANDED_CHANGED]: 'onExpandedChange'});

const expandableFactory = ({emitter: emitter$$1 = createEmitter(), expanded}) => {
  const state = {expanded};
  const dispatch = () => emitter$$1.dispatch(EXPANDED_CHANGED, Object.assign({}, state));
  const setAndDispatch = (val) => () => {
    if (val !== undefined) {
      state.expanded = val;
    }
    dispatch();
  };
  const target = proxy({emitter: emitter$$1});
  return Object.assign(target, {
    expand: setAndDispatch(true),
    collapse: setAndDispatch(false),
    toggle(){
      state.expanded = !state.expanded;
      dispatch();
    },
    refresh(){
      dispatch();
    },
    clean(){
      target.off();
    }
  });
};

var expandableFactory$1 = ({expandKey = 'isArrowDown', collapseKey = 'isArrowUp'} = {}) =>
  ({element}) => {
    const expander = element.querySelector('[aria-expanded]');
    const expanded = expander.getAttribute('aria-expanded') !== 'false';

    const emitter$$1 = createEmitter();

    const expandableComp = expandableFactory({emitter: emitter$$1, expanded});
    const elementComp = elementFactory({element, emitter: emitter$$1});

    const expandableId = expander.getAttribute('aria-controls') || '';
    const expandable = element.querySelector(`#${expandableId}`) || document.getElementById(expandableId);

    const expanderComp = elementFactory({element: expander, emitter: createEmitter()});
    const expandedComp = elementFactory({element: expandable, emitter: createEmitter()});

    expandableComp.onExpandedChange(({expanded}) => {
      expanderComp.attr('aria-expanded', expanded);
      expandedComp.attr('aria-hidden', !expanded);
    });

    expanderComp.onkeydown((ev) => {
      if (isEnter(ev) || isSpace(ev)) {
        expandableComp.toggle();
        ev.preventDefault();
      } else if (collapseKey && checkKeys[collapseKey](ev)) {
        expandableComp.collapse();
        ev.preventDefault();
      } else if (expandKey && checkKeys[expandKey](ev)) {
        expandableComp.expand();
        ev.preventDefault();
      }
    });

    expanderComp.onclick((ev) => {
      const {clientX, clientY} = ev;
      // to differentiate a click generated from a keypress or an actual click
      // preventDefault does not seem enough on FF
      if (clientX !== 0 && clientY !== 0) {
        expandableComp.toggle();
      }
    });

    expandableComp.refresh();

    return Object.assign({}, expandableComp, elementComp, {
      expander(){
        return expanderComp;
      },
      expandable(){
        return expandedComp;
      },
      clean(){
        elementComp.clean();
        expanderComp.clean();
        expandedComp.clean();
        expandableComp.clean();
      }
    });
  };

const {proxyListener: proxyListener$3, emitter:createEmitter$2} = events;

const ACTIVE_ITEM_CHANGED = 'ACTIVE_ITEM_CHANGED';
const proxy$1 = proxyListener$3({[ACTIVE_ITEM_CHANGED]: 'onActiveItemChange'});

var itemList = ({emitter: emitter$$1 = createEmitter$2(), activeItem = 0, itemCount}) => {
  const state = {activeItem, itemCount};
  const event = proxy$1({emitter: emitter$$1});
  const dispatch = () => emitter$$1.dispatch(ACTIVE_ITEM_CHANGED, Object.assign({}, state));
  const api = {
    activateItem(index){
      state.activeItem = index < 0 ? itemCount - 1 : index % itemCount;
      dispatch();
    },
    activateNextItem(){
      api.activateItem(state.activeItem + 1);
    },
    activatePreviousItem(){
      api.activateItem(state.activeItem - 1);
    },
    refresh(){
      dispatch();
    }
  };

  return Object.assign(event, api);
};

const createMenuItem = ({previousKey, nextKey}) =>
  ({menu, element, index}) => {
    const comp = elementFactory({element});
    comp.attr('role', 'menuitem');
    comp.onclick(() => {
      menu.activateItem(index);
    });
    comp.onkeydown((ev) => {
      if (checkKeys[nextKey](ev)) {
        menu.activateNextItem();
        ev.preventDefault();
      } else if (checkKeys[previousKey](ev)) {
        menu.activatePreviousItem();
        ev.preventDefault();
      }
    });

    menu.onActiveItemChange(({activeItem}) => {
      if (activeItem === index) {
        activated();
      } else {
        deactivated();
      }
    });

    const activated = () => {
      comp.attr('tabindex', '0');
      element.focus();
    };

    const deactivated = () => {
      comp.attr('tabindex', '-1');
    };
    return comp;
  };


const verticalMenuItem = createMenuItem({previousKey: 'isArrowUp', nextKey: 'isArrowDown'});
const horizontalMenuItem = createMenuItem({previousKey: 'isArrowLeft', nextKey: 'isArrowRight'});

var menuFactory = (menuItemFactory = verticalMenuItem) =>
  ({element}) => {
    const emitter$$1 = emitter();
    const menuItems = Array.from(element.children).filter(child => child.getAttribute('role') === 'menuitem');
    const listComp = itemList({emitter: emitter$$1, itemCount: menuItems.length});
    const menuComp = elementFactory({element, emitter: emitter$$1});

    menuComp.attr('role', 'menu');

    const menuItemComps = menuItems.map((element, index) => menuItemFactory({menu: listComp, element, index}));

    return Object.assign({}, listComp, menuComp, {
      item(index){
        return menuItemComps[index];
      },
      clean(){
        listComp.off();
        menuComp.clean();
        menuItemComps.forEach(comp => {
          comp.clean();
        });
      }
    });
  };

const verticalMenu = menuFactory();
const expandable$1 = expandableFactory$1();

var dropdown$1 = ({element}) => {
  const expandableComp = expandable$1({element});
  expandableComp.expander().attr('aria-haspopup', 'true');
  const menuComp = verticalMenu({element: expandableComp.expandable().element()});

  expandableComp.onExpandedChange(({expanded}) => {
    if (expanded) {
      menuComp.activateItem(0);
    }
  });

  menuComp.onkeydown(ev => {
    if (isEscape(ev)) {
      expandableComp.collapse();
      expandableComp.expander().element().focus();
    }
  });

  expandableComp.refresh();

  return Object.assign({}, expandableComp, {
    menu(){
      return menuComp;
    },
    clean(){
      expandableComp.clean();
      menuComp.clean();
    }
  });
};

const horizontalMenu = menuFactory(horizontalMenuItem);

const expandable$2 = expandableFactory$1({expandKey: '', collapseKey: ''});

const expandable = expandableFactory$1();
const dropdown = dropdown$1;

const dropdownify = Comp => {
  let dd;

  const mount$$1 = onMount(vnode => {
    dd = dropdown({element: vnode.dom});
  });

  const onupdate = onUpdate(n => {
    if (dd) {
      dd.clean();
    }
    dd = dropdown({element: n.dom});
    dd.collapse();
  });

  const unmount = onUnMount(_ => dd.clean());

  return unmount(mount$$1(onupdate(Comp)));
};

const Dropdown = dropdownify(props => {
  const {children} =props;
  delete props.children;
  return h( 'div', Object.assign({}, { class: "dropdown" }, props),
    children
  )
});

const MenuButton = props => {
  const {children} =props;
  delete props.children;
  return h( 'button', Object.assign({}, { 'aria-haspopup': "true", 'aria-expanded': "false", type: "button" }, props),
    children
  )
};

const Menu = props => {
  const {children} =props;
  delete props.children;
  return h( 'ul', Object.assign({}, { role: "menu" }, props),
    children
  )
};

const MenuItem = props => {
  const {children, activateItem} = props;
  const onKeyDown = ev => {
    const {code} = ev;
    if (code === 'Enter' || code === 'Space') {
      activateItem();
    }
  };

  const onClick = _ => {
    activateItem();
  };

  delete props.children;
  return h( 'li', { onKeyDown: onKeyDown, onClick: onClick, role: "menuitem" },
    children
  )
};

const IssueCard = (props) => {
  const {issue = {}} = props;
  const {state, created_at, user, number, html_url, title, comments} = issue;
  const classes = state === 'open' ? ['valid'] : ['invalid'];
  return h( 'article', { class: "issue" },
    h( 'h3', null, title ),
    h( 'a', { rel: "self", href: html_url }, "#", number),
    h( 'div', { class: "status" },
      h( Notification, { classes: classes }),
      h( 'span', { class: classes.join('') }, state)
    ),
    h( 'p', { class: "meta" }, "opened on ", h( 'time', null, " ", (new Date(created_at)).toDateString(), " " ), "by ", h( 'a', { rel: "author", href: user.html_url }, user.login)
    ),
    h( 'p', { class: "comments" },
      h( Bubbles, null ),
      h( 'span', null, comments )
    )
  )
};

//todo generate id for dropdowns
const IssuesList = (props) => {
  const {issues = [], smartList, showToolBar} = props;
  return (
    h( 'div', { class: "issues-list-container" },
      h( 'div', { 'aria-hidden': String(showToolBar !== true), role: "toolbar" },
        h( Dropdown, { id: "dropdown-sample" },
          h( MenuButton, { 'aria-controls': "menu" }, h( SortAmountAsc, null )),
          h( Menu, { id: "menu" },
            h( MenuItem, { activateItem: _ => smartList.sort({pointer: 'created_at', direction: 'desc'}) }, " Newest"),
            h( MenuItem, { activateItem: _ => smartList.sort({pointer: 'created_at', direction: 'asc'}) }, "Oldest"),
            h( MenuItem, { activateItem: _ => smartList.sort({pointer: 'comments', direction: 'desc'}) }, "Most commented"),
            h( MenuItem, { activateItem: _ => smartList.sort({pointer: 'comments', direction: 'asc'}) }, "Least commented"),
            h( MenuItem, { activateItem: _ => smartList.sort({pointer: 'updated_at', direction: 'desc'}) }, "Recently updated"),
            h( MenuItem, { activateItem: _ => smartList.sort({pointer: 'updated_at', direction: 'asc'}) }, "Least recently updated")
          )
        )
      ),
      h( 'ul', { class: "issues-list" },
        issues.map(i => h( 'li', null, h( IssueCard, { issue: i }) ))
      ),
      h( 'div', { class: "fake-border" })
    ));
};

var SmartIssuesList = (props) => {
  const {smartList, items =[], data={}} = props;
  const {showToolBar} = data;
  return (
    h( 'div', { class: "issues-container" },
      h( IssuesList, { showToolBar: showToolBar, smartList: smartList, issues: items.map(i => i.value) })
    ));

};

//todo
const DummyList = () => h( 'div', null,
  h( 'p', null, "Error: list type not supported" )
);


var ListDataPanel = flexible$1(((props, services) => {
  const {grid, smartLists, connect: connect$$1, actions} = services;
  const {x, y, onResizeStart, onMoveStart} = props;
  const panelData = grid.getData(x, y);
  const smartList = smartLists.findOrCreate(x, y);
  const connectFunc = connect$$1(state => state.smartList.find(sl => sl.x === x && sl.y === y));

  const SmartListComponent = connectFunc((props) => getListComponent(panelData.data.source)(props, services));

  const clickReset = _ => {
    actions.openModal({
      modalType: 'askConfirmation',
      message: `You are about to lose the data related to the panel "${panelData.data.title}". Are you sure you want to proceed ?`,
      executeAction: () => {
        actions.resetPanel({x, y});
      }
    });
  };

  const clickEdit = _ => {
    actions.editPanel({x, y});
    smartList.remove();
  };

  const clickToggleToolBar = _ => {
    const {data = {}} = panelData;
    actions.updatePanelData({
      x, y, data: Object.assign({}, data, {
        showToolBar: !data.showToolBar
      })
    });
  };

  return (h( ListDataPanel$1, Object.assign({}, { onToggleToolBar: clickToggleToolBar, onEdit: clickEdit, onReset: clickReset, onMoveStart: onMoveStart, onResizeStart: onResizeStart }, panelData),
    h( SmartListComponent, Object.assign({}, panelData, { smartList: smartList, x: x, y: y }))
  ));
}));

const getListComponent = (source) => {
  switch (source) {
    case 'issues':
      return SmartIssuesList;
    default:
      return DummyList;
  }
};

var ChartDataPanel$1 = flexible(props => {
  const {data = {}, onReset, onEdit, onToggleToolBar} = props;
  const {processing = false} = data;
  const showToolbar = String(data.showToolBar === true);
  //todo aria-controls
  return (h( 'div', { class: "panel-content" },
    h( 'header', { class: "panel-header" },
      h( 'h2', null, data.title ),
      h( 'button', { 'aria-haspopup': "true", 'aria-pressed': showToolbar, 'aria-expanded': showToolbar, onClick: onToggleToolBar }, h( Wrench, null )),
      h( 'button', { onClick: onEdit }, h( Equalizer, null )),
      h( 'button', { onClick: onReset }, h( Bin2, null )
      )
    ),
    h( 'div', { class: "panel-body" },
      h( 'div', { 'aria-hidden': String(!processing), class: "processing-overlay" }, "Processing ..."),
      props.children
    )
  ));
});

var ChartDataPanel = flexible$1((props, {grid}) => {
  const {x, y, onResizeStart, onMoveStart} = props;
  const panelData = grid.getData(x, y);
  return h( ChartDataPanel$1, Object.assign({}, { onMoveStart: onMoveStart, onResizeStart: onResizeStart }, panelData))
});

const getDataPanel = (type) => {
  switch (type) {
    case 'chart':
      return ChartDataPanel;
    case 'list':
      return ListDataPanel;
    default:
      return EmptyDataPanel;
  }
};

var DataPanel = (props, services) => {
  const {x, y} = props;
  const {grid} = services;
  const panelData = grid.getData(x, y);
  const {data = {}}=panelData;
  const Panel = getDataPanel(data.type);
  return Panel(props, services);
};

const modal$1 = Comp => props => {
  const {isOpen, closeModal, title} = props;
  const onKeyDown = ({code}) => {
    if (code === 'Escape') {
      closeModal();
    }
  };

  return (h( 'div', { 'aria-hidden': String(!isOpen), onKeyDown: onKeyDown, class: "modal" },
    h( 'header', null,
      h( 'h2', null, title ),
      h( 'button', { onClick: closeModal }, h( Cross, null ))
    ),
    h( 'div', { class: "blurry-background" }),
    h( Comp, props)
  ))
};

const autofocus = onMount((vnode) => {
  vnode.dom.focus();
});
const AutofocusInput = autofocus(props => {
  delete props.children;
  return h( 'input', props)
});
const statefullModal = compose(withState, modal$1);

const SourceTypeSelect = props => {
  const {onUpdate: onUpdate$$1} = props;
  const changeValue = ev => onUpdate$$1({source: ev.target.value});
  return h( 'fieldset', null,
    h( 'legend', null, "Select a data source:" ),
    h( 'div', null,
      h( 'label', null,
        h( 'input', { required: true, class: "visuallyhidden", onChange: changeValue, value: "issues", name: "sourceType", type: "radio" }),
        h( 'div', { class: "value-icon" },
          h( Notification, null ),
          h( 'span', null, "Issues" )
        )
      ),
      h( 'label', null,
        h( 'input', { required: true, class: "visuallyhidden", onChange: changeValue, value: "prs", name: "sourceType", type: "radio" }),
        h( 'div', { class: "value-icon" },
          h( Tree, null ),
          h( 'span', null, "Pull requests" )
        )
      ),
      h( 'label', null,
        h( 'input', { required: true, onChange: changeValue, class: "visuallyhidden", value: "stargazers", name: "sourceType", type: "radio" }),
        h( 'div', { class: "value-icon" },
          h( StarFull, null ),
          h( 'span', null, "Stargazers" )
        )
      ),
      h( 'label', null,
        h( 'input', { required: true, onChange: changeValue, class: "visuallyhidden", value: "contributors", name: "sourceType", type: "radio" }),
        h( 'div', { class: "value-icon" },
          h( Users, null ),
          h( 'span', null, "Contributors" )
        )
      ),
      h( 'label', null,
        h( 'input', { required: true, onChange: changeValue, class: "visuallyhidden", value: "commits", name: "sourceType", type: "radio" }),
        h( 'div', { class: "value-icon" },
          h( Embed2, null ),
          h( 'span', null, "Commits" )
        )
      )
    )
  )
};

const CreateSmartListForm = (props) => {
  const {onUpdate: onUpdate$$1, onSubmit} = props;
  return (
    h( 'div', { class: "modal-content" },
      h( 'form', { onSubmit: onSubmit },
        h( 'label', null,
          h( 'span', null, "Panel title:" ),
          h( AutofocusInput, { onChange: ev => onUpdate$$1({title: ev.target.value}), name: "title", required: "true" })
        ),
        h( SourceTypeSelect, props),
        h( 'button', null, "Create" )
      )
    ));
};

const CreateSmartChartForm = props => {
  const {onSubmit, onUpdate: onUpdate$$1} = props;
  return h( 'div', { class: "modal-content" },
    h( 'form', { onSubmit: onSubmit },
      h( 'label', null,
        h( 'span', null, "Panel title:" ),
        h( AutofocusInput, { onChange: ev => onUpdate$$1({title: ev.target.value}), name: "title", required: "true" })
      ),
      h( 'button', null, "Create" )
    )
  );
};

const modalForm = Comp => props => {
  const UdpatableComp = statefullModal((props, update$$1) => {
    const {data} = props;
    const onUpdate$$1 = val => {
      Object.assign(data, val);
      update$$1(Object.assign({}, {data}, props));
    };
    return Comp(Object.assign({}, {onUpdate: onUpdate$$1}, props));
  });
  return UdpatableComp(props);
};

const CreateSmartListDataPanel = modalForm(CreateSmartListForm);
const CreateSmartChartDataPanel = modalForm(CreateSmartChartForm);

const CreateDataPanel = (Comp, defaultData) => (props, {actions}) => {
  const {x, y, data = defaultData} = props;
  const onSubmit = ev => {
    ev.preventDefault();
    actions.updatePanelData({x, y, data});
    actions.closeModal();
  };
  return Comp(Object.assign({}, {data, closeModal: actions.closeModal, onSubmit}, props));
};

const CreateSmartListModal = CreateDataPanel(CreateSmartListDataPanel, {type: 'list', showToolBar: true});

const CreateSmartChartModal = CreateDataPanel(CreateSmartChartDataPanel, {type:'chart', showToolBar:true});

var ComfirmationModal = (props) => {
  const {closeModal, executeAction, message} = props;
  const confirm = _ => {
    closeModal();
    executeAction();
  };
  const Comp = modal$1(props =>
    h( 'div', null,
      h( 'p', null, message ),
      h( 'div', null,
        h( 'button', { onClick: confirm }, "Confirm"),
        h( 'button', { onClick: closeModal }, "Cancel")
      )
    ));
  return Comp(Object.assign({}, {title: 'Attention !'}, props));
};

var ConfirmationModal = (props, {actions}) => h( ComfirmationModal, Object.assign({}, { closeModal: actions.closeModal }, props));

const EmptyModal = modal$1((props) => {
    return h( 'div', null );
});

const getModalComponent = (modalType) => {
  switch (modalType) {
    case 'createSmartListPanelData':
      return CreateSmartListModal;
    case 'createSmartChartPanelData':
      return CreateSmartChartModal;
    case 'askConfirmation':
      return ConfirmationModal;
    default:
      return EmptyModal;
  }
};

var Modal$1 = Modal = (props, services) => {
  const {modalType} = props;
  const ModalComponent = getModalComponent(modalType);
  return ModalComponent(props, services);
};

const actionCreator = actionName => opts => (Object.assign({type: actionName}, opts));

const dragOver = actionCreator('DRAG_OVER');
const endResize = actionCreator('END_RESIZE');
const startResize = actionCreator('START_RESIZE');
const startMove = actionCreator('START_MOVE');
const endMove = actionCreator('END_MOVE');
const openModal = actionCreator('OPEN_MODAL');
const closeModal = actionCreator('CLOSE_MODAL');
const updatePanelData = actionCreator('UPDATE_PANEL_DATA');
const updateSmartList = actionCreator('UPDATE_SMART_LIST');
const createSmartList = actionCreator('CREATE_SMART_LIST');
const resetPanel = actionCreator('RESET_PANEL');
const removeSmartList = actionCreator('REMOVE_SMART_LIST');

var actions$1 = Object.freeze({
	dragOver: dragOver,
	endResize: endResize,
	startResize: startResize,
	startMove: startMove,
	endMove: endMove,
	openModal: openModal,
	closeModal: closeModal,
	updatePanelData: updatePanelData,
	updateSmartList: updateSmartList,
	createSmartList: createSmartList,
	resetPanel: resetPanel,
	removeSmartList: removeSmartList
});

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Built-in value references. */
var Symbol$1 = root.Symbol;

/** Used for built-in method references. */
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

/** `Object#toString` result references. */
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

/** Built-in value references. */
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

/** `Object#toString` result references. */
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

/**
 * These are private action types reserved by Redux.
 * For any unknown actions, you must return the current state.
 * If the current state is undefined, you must return the initial state.
 * Do not reference these action types directly in your code.
 */
var ActionTypes = {
  INIT: '@@redux/INIT'

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
   * @param {Function} [enhancer] The store enhancer. You may optionally specify it
   * to enhance the store with third-party capabilities such as middleware,
   * time travel, persistence, etc. The only store enhancer that ships with Redux
   * is `applyMiddleware()`.
   *
   * @returns {Store} A Redux store that lets you read the state, dispatch actions
   * and subscribe to changes.
   */
};function createStore(reducer, preloadedState, enhancer) {
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
      var listener = listeners[i];
      listener();
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
   * https://github.com/tc39/proposal-observable
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

function compose$1() {
  for (var _len = arguments.length, funcs = Array(_len), _key = 0; _key < _len; _key++) {
    funcs[_key] = arguments[_key];
  }

  if (funcs.length === 0) {
    return function (arg) {
      return arg;
    };
  }

  if (funcs.length === 1) {
    return funcs[0];
  }

  return funcs.reduce(function (a, b) {
    return function () {
      return a(b.apply(undefined, arguments));
    };
  });
}

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

/**
 * Creates a store enhancer that applies middleware to the dispatch method
 * of the Redux store. This is handy for a variety of tasks, such as expressing
 * asynchronous actions in a concise manner, or logging every action payload.
 *
 * See `redux-thunk` package as an example of the Redux middleware.
 *
 * Because middleware is potentially asynchronous, this should be the first
 * store enhancer in the composition chain.
 *
 * Note that each middleware will be given the `dispatch` and `getState` functions
 * as named arguments.
 *
 * @param {...Function} middlewares The middleware chain to be applied.
 * @returns {Function} A store enhancer applying the middleware.
 */
function applyMiddleware() {
  for (var _len = arguments.length, middlewares = Array(_len), _key = 0; _key < _len; _key++) {
    middlewares[_key] = arguments[_key];
  }

  return function (createStore) {
    return function (reducer, preloadedState, enhancer) {
      var store = createStore(reducer, preloadedState, enhancer);
      var _dispatch = store.dispatch;
      var chain = [];

      var middlewareAPI = {
        getState: store.getState,
        dispatch: function dispatch(action) {
          return _dispatch(action);
        }
      };
      chain = middlewares.map(function (middleware) {
        return middleware(middlewareAPI);
      });
      _dispatch = compose$1.apply(undefined, chain)(store.dispatch);

      return _extends({}, store, {
        dispatch: _dispatch
      });
    };
  };
}

/*
* This is a dummy function to check if the function name has been altered by minification.
* If the function has been minified and NODE_ENV !== 'production', warn the user.
*/
function isCrushed() {}

if ("production" !== 'production' && typeof isCrushed.name === 'string' && isCrushed.name !== 'isCrushed') {
  warning('You are currently using minified code outside of NODE_ENV === \'production\'. ' + 'This means that you are running a slower development build of Redux. ' + 'You can use loose-envify (https://github.com/zertosh/loose-envify) for browserify ' + 'or DefinePlugin for webpack (http://stackoverflow.com/questions/30030031) ' + 'to ensure you have the correct code for your production build.');
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
      return Object.assign({},panels.find(p => p.x === x && p.y === y) || {});
    }
  };
};

var grid = Grid({rows: ROWS, columns: COLUMNS});

var gridReducer = (grid = Grid()) => (state = {active: null, panels: [...grid]}, action) => {

  const resizeOver = (state, action) => {
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

      return Object.assign({}, state, {
        active: Object.assign({}, active, {valid: invalidCellsArea.length === 0}),
        panels: [...grid]
      });
    } else {
      return Object.assign(state, {active: Object.assign({}, active, {valid: false})});
    }
  };

  const moveOver = (state, action) => {
    const {x, y} =action;
    const {active} = state;
    const {x:startX, y:startY} = active;

    const {dx, dy} = grid.getData(startX, startY);

    const originalPanel = grid.panel(startX, startY);
    const expectedArea = grid.area(x, y, dx, dy);
    const activeArea = originalPanel.union(expectedArea);
    let invalidArea;

    if (expectedArea.length < originalPanel.length) {
      invalidArea = activeArea;
    } else {
      invalidArea = [...originalPanel.complement()]
        .map(a => grid.panel(a.x, a.y))
        .filter(p => {
          const intersection = p.intersection(expectedArea);
          return intersection.length > 0 && expectedArea.includes(p) === false;
        })
        .reduce((acc, current) => acc.union(current), grid.area(1, 1, 0, 0));
    }

    const inactiveArea = activeArea.complement();

    for (let {x, y} of inactiveArea) {
      grid.updateAt(x, y, {adornerStatus: 0});
    }

    for (let {x, y} of activeArea) {
      grid.updateAt(x, y, {adornerStatus: 1});
    }

    for (let {x, y} of invalidArea) {
      grid.updateAt(x, y, {adornerStatus: -1});
    }

    return Object.assign({}, state, {
      panels: [...grid],
      active: Object.assign({}, active, {valid: invalidArea.length === 0})
    });
  };

  switch (action.type) {
    case 'START_RESIZE': {
      const {x, y}=action;
      return Object.assign({}, state, {active: {x, y, operation: 'resize'}});
    }
    case 'START_MOVE': {
      const {x, y}=action;
      return Object.assign({}, state, {active: {x, y, operation: 'move'}});
    }
    case 'DRAG_OVER': {
      const {active = {}} = state;
      if (!active.operation) {
        return state;
      } else {
        return active.operation === 'move' ? moveOver(state, action) : resizeOver(state, action);
      }
    }
    case 'END_RESIZE': {
      const {x, y, startX, startY} =action;
      const dx = x - startX + 1;
      const dy = y - startY + 1;
      const {active} =state;
      if (active.valid === true) {
        const activeArea = grid.area(startX, startY, dx, dy);
        const [baseCell, ...otherCells] = activeArea;
        grid.updateAt(startX, startY, {dx, dy});
        for (const {x, y} of otherCells) {
          grid.updateAt(x, y, {dx: 1, dy: 1});
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
    case 'END_MOVE': {
      const {x, y, startX, startY} =action;
      const deltaX = startX - x;
      const deltaY = startY - y;
      const {active} =state;
      if (active.valid === true) {
        const startData = grid.getData(startX, startY);
        const {dx, dy} =startData;
        const claimedArea = grid.area(x, y, dx, dy);
        for ({x: cx, y: cy} of claimedArea) {
          const newX = cx + deltaX;
          const newY = cy + deltaY;
          const newData = Object.assign(grid.getData(cx, cy), {x: newX, y: newY});
          grid.updateAt(newX, newY, newData);
        }
        grid.updateAt(x, y, Object.assign(startData, {x, y}));
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
      const {x, y, data} = action;
      grid.updateAt(x, y, {data});
      return Object.assign({}, state, {panels: [...grid]});
    }
    case 'RESET_PANEL': {
      const {x, y} = action;
      grid.updateAt(x, y, {data: {}});
      return Object.assign({}, state, {panels: [...grid]});
    }
    default:
      return state;
  }
};

var modalReducer = (grid) => (state = {isOpen: false}, action) => {
  const {type} = action;
  const modalData = Object.assign({}, action);
  delete  modalData.type;
  switch (type) {
    case 'OPEN_MODAL': {
      return Object.assign({}, state, modalData, {isOpen: true});
    }
    case 'CLOSE_MODAL': {
      return Object.assign({}, state, modalData, {isOpen: false, title: '', modalType: 'none'});
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
    case 'REMOVE_SMART_LIST': {
      const {x, y} = action;
      return state.filter(f => f.x !== x || f.y !== y);
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
  const compareFunc = direction === 'desc' ? swap(orderFunc) : orderFunc;

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
      return compose(String, (val) => val.toLowerCase());
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
  const operateOnTyped = compose(typeIt, operators[operator]);
  const predicateFunc = operateOnTyped(value);
  return compose(typeIt, predicateFunc);
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
    return compose(getter, every(clauses));
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
  return {get, set: curry(set)};
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

  const safeAssign = curry((base, extension) => Object.assign({}, base, extension));
  const dispatch = curry(table.dispatch.bind(table), 2);

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
        const execFunc = compose(filterFunc, searchFunc, tap(dispatchSummary), sortFunc, sliceFunc);
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

  const updateTableState = curry((pter, ev, newPartialState) => compose(
    safeAssign(pter.get(tableState)),
    tap(dispatch(ev)),
    pter.set(tableState)
  )(newPartialState));

  const resetToFirstPage = () => updateTableState(slicePointer, PAGE_CHANGED, {page: 1});

  const tableOperation = (pter, ev) => compose(
    updateTableState(pter, ev),
    resetToFirstPage,
    () => table.exec() // we wrap within a function so table.exec can be overwritten (when using with a server for example)
  );

  const api = {
    sort: tableOperation(sortPointer, TOGGLE_SORT),
    filter: tableOperation(filterPointer, FILTER_CHANGED),
    search: tableOperation(searchPointer, SEARCH_CHANGED),
    slice: compose(updateTableState(slicePointer, PAGE_CHANGED), () => table.exec()),
    exec,
    eval(state = tableState){
      return Promise.resolve()
        .then(function () {
          const sortFunc = sortFactory(sortPointer.get(state));
          const searchFunc = searchFactory(searchPointer.get(state));
          const filterFunc = filterFactory(filterPointer.get(state));
          const sliceFunc = sliceFactory(slicePointer.get(state));
          const execFunc = compose(filterFunc, searchFunc, sortFunc, sliceFunc);
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
  sortFactory: sortFactory$$1 = sortFactory,
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

const smartListRegistry = [];
const matchXY = (x, y) => (item) => x === item.x && y === item.y;
const get = (x, y) => smartListRegistry.find(matchXY(x, y));
const has = (x, y) => get(x, y) !== void 0;

const extendedSmartList = ( opts => {
  const {x, y} = opts;
  const instance = table(opts);
  return Object.assign(instance, {
    remove: () => {
      smartListRegistry.splice(smartListRegistry.indexOf(instance), 1);
      output.removeSmartList({x, y});
    }
  })
});

const instance = {
  findOrCreate(x, y){
    if (!has(x, y)) {
      const smartList = extendedSmartList({data, x, y});
      smartList.on('EXEC_CHANGED', ({working}) => {
        const {data:panelData} = grid.getData(x, y);
        output.updatePanelData({x, y, data: Object.assign({}, panelData, {processing: working})});
      });
      smartList.onDisplayChange(items => {
        output.updateSmartList({
          x, y,
          tableState: smartList.getTableState(),
          items
        });
      });
      smartListRegistry.push({x, y, smartList});
      output.createSmartList({x, y, tableState: smartList.getTableState(), items: []});
      smartList.exec();
    }
    return get(x, y).smartList;
  },
  find(x, y){
    const sl = get(x, y);
    return sl !== void 0 ? sl.smartList : sl;
  }
};

const initialState = {
  grid: {
    panels: [...grid],
    active: null,
  },
  smartList: []
};

/**
 * this will update the different registries when panel positioning change
 */
const syncRegistries = (store) => next => action => {
  const {type, x, y, startX, startY} = action;
  if (type === 'RESET_PANEL') {
    const sl = instance.find(x, y);
    if (sl) {
      sl.remove();
    }
  } else if (type === 'END_MOVE') {
    const {grid:{active}} = store.getState();
    if (active.valid === true) {
      const oldSl = instance.find(startX, startY);
      const newSl = instance.find(x, y);
      if (oldSl) {
        oldSl.remove();
      }
      if (newSl) {
        newSl.remove();
      }
    }
  }

  return next(action);
};

var store = createStore(reducer(grid), initialState,
  compose$1(
    applyMiddleware(syncRegistries),
    window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
  )
);

const output = {};

for(let action of Object.keys(actions$1)){
  output[action] = args => store.dispatch(actions$1[action](args));
}

var services = {
  actions: output,
  grid,
  smartLists: instance,
  store,
  connect: sliceState => connect(store, sliceState)
};

var inject = Comp => props => Comp(props, services);

const connectToModal = services.connect(state => state.modal);
const SideModal = compose(inject, connectToModal)(Modal$1);

const getCoordsFromMouseEvent = (columns, rows) => (ev) => {
  const {currentTarget, offsetX, offsetY} = ev;
  const {offsetWidth, offsetHeight} = currentTarget;
  let xpix = offsetX;
  let ypix = offsetY;
  let {target} = ev;
  while (target !== currentTarget && target !== void 0) {
    xpix += target.offsetLeft;
    ypix += target.offsetTop;
    target = target.offsetParent;
  }
  const x = Math.floor((xpix / offsetWidth) * COLUMNS) + 1;
  const y = Math.floor((ypix / offsetHeight) * ROWS) + 1;
  return {x, y};
};

const Container = inject(({panels}, services$$1) => {
  const {actions, connect: connect$$1} = services$$1;
  //create subscription to panel(x,y)
  const findPanelFromState = (x, y) => state => state.grid.panels.find(({x: px, y: py}) => x === px && y === py);
  const subscribeTo = (x, y) => connect$$1(findPanelFromState(x, y));
  const subscribeFunctions = panels.map(({x, y}) => compose(inject, subscribeTo(x, y)));

  //create connected components
  const AdornerPanelComponents = subscribeFunctions.map(subscribe => subscribe(AdornerPanel));
  const DataPanelComponents = subscribeFunctions.map(subscribe => subscribe(DataPanel));

  const coords = getCoordsFromMouseEvent(COLUMNS, ROWS);

  const onDragOver = (ev) => {
    ev.preventDefault();
    const {x, y} = coords(ev);
    actions.dragOver(({x, y}));
  };

  const onDrop = ev => {
    const {dataTransfer} = ev;
    const data = dataTransfer.getData('text/plain');
    const JsonData = JSON.parse(data);
    const {x: startX, y: startY, operation} = JsonData;
    if (startX && startY && ['move', 'resize'].includes(operation)) {
      const {x, y} = coords(ev);
      const args = {x, startX, y, startY};
      if (operation === 'resize') {
        actions.endResize(args);
      }
      else {
        actions.endMove(args);
      }
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

const {grid: {panels}} = services.store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));
//# sourceMappingURL=bundle.js.map
