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

if ("dev" !== 'production' && typeof isCrushed.name === 'string' && isCrushed.name !== 'isCrushed') {
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

const ROWS = 4;
const COLUMNS = 4;

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

function proxyListener (eventMap) {
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
	proxyListener: proxyListener
});

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
    const {grid: {active}} = store.getState();
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

var store = createStore(reducer(grid), initialState, applyMiddleware(syncRegistries));

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

const {proxyListener: proxyListener$1, emitter:createEmitter} = events;

const EXPANDED_CHANGED = 'EXPANDED_CHANGED';
const proxy = proxyListener$1({[EXPANDED_CHANGED]: 'onExpandedChange'});

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

const findPanelFromState = (x, y) => state => state.grid.panels.find(({x: px, y: py}) => x === px && y === py);

const AdornerGrid = (props, services) => {
  const {panels = []} = props;
  const {connect: connect$$1} = services;
  const subscribeTo = (x, y) => connect$$1(findPanelFromState(x, y));
  const PanelComponents = panels.map(({x, y}) => subscribeTo(x, y)(props => AdornerPanel(props, services)));

  return h( 'div', { class: "grid adorner-layer" },
    PanelComponents.map(Panel => h( Panel, null ))
  );
};

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

const DataGrid = (props, services) => {
  const {panels = []} = props;
  const {connect: connect$$1, actions} = services;
  const subscribeTo = (x, y) => connect$$1(findPanelFromState(x, y));
  const PanelComponents = panels.map(({x, y}) => subscribeTo(x, y)(props => DataPanel(props, services)));

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

  return h( 'div', { class: "grid data-layer", onDragover: onDragOver, onDrop: onDrop },
    PanelComponents.map(Panel => h( Panel, null ))
  );
};

const connectToModal = services.connect(state => state.modal);
const SideModal = compose(inject, connectToModal)(Modal$1);
const Container = inject(({panels}, services$$1) => {

  const Adorners = props => AdornerGrid(props, services$$1);

  const DataGridPanels = props => DataGrid(props, services$$1);

  return (h( 'div', { class: "grid-container" },
    h( Adorners, { panels: panels }),
    h( DataGridPanels, { panels: panels }),
    h( SideModal, null )
  ));
});

const {grid: {panels}} = services.store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlcyI6WyIuLi9ub2RlX21vZHVsZXMvZmxhY28vbGliL2guanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtb3BlcmF0b3JzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi91dGlsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi9kb21VdGlsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi90cmF2ZXJzZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9mbGFjby9saWIvdHJlZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9mbGFjby9saWIvdXBkYXRlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi9saWZlQ3ljbGVzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi93aXRoU3RhdGUuanMiLCIuLi9ub2RlX21vZHVsZXMvZmxhY28vbGliL2Nvbm5lY3QuanMiLCJjb21wb25lbnRzL2ljb25zLmpzIiwidmlld3MvTW9kYWwuanMiLCJ2aWV3cy9FZGl0RGF0YVBhbmVsRm9ybS5qcyIsImNvbXBvbmVudHMvRWRpdFBhbmVsRGF0YU1vZGFsLmpzIiwidmlld3MvQ29uZmlybWF0aW9uTW9kYWwuanMiLCJjb21wb25lbnRzL0NvbmZpcm1hdGlvbk1vZGFsLmpzIiwiY29tcG9uZW50cy9Nb2RhbC5qcyIsImFjdGlvbnMvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19mcmVlR2xvYmFsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fcm9vdC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX1N5bWJvbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX2dldFJhd1RhZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX29iamVjdFRvU3RyaW5nLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fYmFzZUdldFRhZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX292ZXJBcmcuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19nZXRQcm90b3R5cGUuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL2lzT2JqZWN0TGlrZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvaXNQbGFpbk9iamVjdC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zeW1ib2wtb2JzZXJ2YWJsZS9lcy9wb255ZmlsbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zeW1ib2wtb2JzZXJ2YWJsZS9lcy9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWR1eC9lcy9jcmVhdGVTdG9yZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWR1eC9lcy91dGlscy93YXJuaW5nLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlZHV4L2VzL2NvbXBvc2UuanMiLCIuLi9ub2RlX21vZHVsZXMvcmVkdXgvZXMvYXBwbHlNaWRkbGV3YXJlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlZHV4L2VzL2luZGV4LmpzIiwibGliL2dyaWQuanMiLCJsaWIvY29uc3RhbnRzLmpzIiwic2VydmljZXMvZ3JpZC5qcyIsInJlZHVjZXJzL2dyaWQuanMiLCJyZWR1Y2Vycy9tb2RhbC5qcyIsInJlZHVjZXJzL3NtYXJ0TGlzdC5qcyIsInJlZHVjZXJzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1zb3J0L2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWZpbHRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1zZWFyY2gvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9zcmMvc2xpY2UuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtZXZlbnRzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2V2ZW50cy5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1jb3JlL3NyYy9kaXJlY3RpdmVzL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvaW5kZXguanMiLCJtb2NrRGF0YS5qcyIsInNlcnZpY2VzL3NtYXJ0TGlzdFJlZ2lzdHJ5LmpzIiwic2VydmljZXMvc3RvcmUuanMiLCJzZXJ2aWNlcy9hY3Rpb25zLmpzIiwic2VydmljZXMvaW5kZXguanMiLCJsaWIvZGkuanMiLCJ2aWV3cy9QYW5lbC5qcyIsInZpZXdzL0Fkb3JuZXJQYW5lbC5qcyIsImNvbXBvbmVudHMvQWRvcm5lclBhbmVsLmpzIiwidmlld3MvRmxleGlibGVEYXRhUGFuZWwuanMiLCJ2aWV3cy9FbXB0eURhdGFQYW5lbC5qcyIsImNvbXBvbmVudHMvRmxleGlibGVEYXRhUGFuZWwuanMiLCJjb21wb25lbnRzL0VtcHR5RGF0YVBhbmVsLmpzIiwidmlld3MvTGlzdERhdGFQYW5lbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9scnRpc3RlL2NvbW1vbi9lbGVtZW50LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvY29tbW9uL3V0aWwuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9leHBhbmRhYmxlL2V4cGFuZGFibGUuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9jb21tb24vc2luZ2xlQWN0aXZlSXRlbUxpc3QuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9tZW51L21lbnVJdGVtLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvbWVudS9tZW51LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvZHJvcGRvd24vZHJvcGRvd24uanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9tZW51L21lbnViYXIuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9hY2NvcmRpb24vYWNjb3JkaW9uLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvaW5kZXguanMiLCJ1aS1raXQvZHJvcGRvd24uanMiLCJ2aWV3cy9Jc3N1ZXMuanMiLCJjb21wb25lbnRzL1NtYXJ0SXNzdWVMaXN0LmpzIiwiY29tcG9uZW50cy9MaXN0RGF0YVBhbmVsLmpzIiwidmlld3MvQ2hhcnREYXRhUGFuZWwuanMiLCJjb21wb25lbnRzL0NoYXJ0RGF0YVBhbmVsLmpzIiwiY29tcG9uZW50cy9EYXRhUGFuZWwuanMiLCJjb21wb25lbnRzL2dyaWQuanMiLCJpbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBjcmVhdGVUZXh0Vk5vZGUgPSAodmFsdWUpID0+ICh7XG4gIG5vZGVUeXBlOiAnVGV4dCcsXG4gIGNoaWxkcmVuOiBbXSxcbiAgcHJvcHM6IHt2YWx1ZX0sXG4gIGxpZmVDeWNsZTogMFxufSk7XG5cbi8qKlxuICogVHJhbnNmb3JtIGh5cGVyc2NyaXB0IGludG8gdmlydHVhbCBkb20gbm9kZVxuICogQHBhcmFtIG5vZGVUeXBlIHtGdW5jdGlvbiwgU3RyaW5nfSAtIHRoZSBIVE1MIHRhZyBpZiBzdHJpbmcsIGEgY29tcG9uZW50IG9yIGNvbWJpbmF0b3Igb3RoZXJ3aXNlXG4gKiBAcGFyYW0gcHJvcHMge09iamVjdH0gLSB0aGUgbGlzdCBvZiBwcm9wZXJ0aWVzL2F0dHJpYnV0ZXMgYXNzb2NpYXRlZCB0byB0aGUgcmVsYXRlZCBub2RlXG4gKiBAcGFyYW0gY2hpbGRyZW4gLSB0aGUgdmlydHVhbCBkb20gbm9kZXMgcmVsYXRlZCB0byB0aGUgY3VycmVudCBub2RlIGNoaWxkcmVuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSAtIGEgdmlydHVhbCBkb20gbm9kZVxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBoIChub2RlVHlwZSwgcHJvcHMsIC4uLmNoaWxkcmVuKSB7XG4gIGNvbnN0IGZsYXRDaGlsZHJlbiA9IGNoaWxkcmVuLnJlZHVjZSgoYWNjLCBjaGlsZCkgPT4ge1xuICAgIGNvbnN0IGNoaWxkcmVuQXJyYXkgPSBBcnJheS5pc0FycmF5KGNoaWxkKSA/IGNoaWxkIDogW2NoaWxkXTtcbiAgICByZXR1cm4gYWNjLmNvbmNhdChjaGlsZHJlbkFycmF5KTtcbiAgfSwgW10pXG4gICAgLm1hcChjaGlsZCA9PiB7XG4gICAgICAvLyBub3JtYWxpemUgdGV4dCBub2RlIHRvIGhhdmUgc2FtZSBzdHJ1Y3R1cmUgdGhhbiByZWd1bGFyIGRvbSBub2Rlc1xuICAgICAgY29uc3QgdHlwZSA9IHR5cGVvZiBjaGlsZDtcbiAgICAgIHJldHVybiB0eXBlID09PSAnb2JqZWN0JyB8fCB0eXBlID09PSAnZnVuY3Rpb24nID8gY2hpbGQgOiBjcmVhdGVUZXh0Vk5vZGUoY2hpbGQpO1xuICAgIH0pO1xuXG4gIGlmICh0eXBlb2Ygbm9kZVR5cGUgIT09ICdmdW5jdGlvbicpIHsvL3JlZ3VsYXIgaHRtbC90ZXh0IG5vZGVcbiAgICByZXR1cm4ge1xuICAgICAgbm9kZVR5cGUsXG4gICAgICBwcm9wczogcHJvcHMsXG4gICAgICBjaGlsZHJlbjogZmxhdENoaWxkcmVuLFxuICAgICAgbGlmZUN5Y2xlOiAwXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBmdWxsUHJvcHMgPSBPYmplY3QuYXNzaWduKHtjaGlsZHJlbjogZmxhdENoaWxkcmVufSwgcHJvcHMpO1xuICAgIGNvbnN0IGNvbXAgPSBub2RlVHlwZShmdWxsUHJvcHMpO1xuICAgIHJldHVybiB0eXBlb2YgY29tcCAhPT0gJ2Z1bmN0aW9uJyA/IGNvbXAgOiBoKGNvbXAsIHByb3BzLCAuLi5mbGF0Q2hpbGRyZW4pOyAvL2Z1bmN0aW9uYWwgY29tcCB2cyBjb21iaW5hdG9yIChIT0MpXG4gIH1cbn07IiwiZXhwb3J0IGZ1bmN0aW9uIHN3YXAgKGYpIHtcbiAgcmV0dXJuIChhLCBiKSA9PiBmKGIsIGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZSAoZmlyc3QsIC4uLmZucykge1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IGZucy5yZWR1Y2UoKHByZXZpb3VzLCBjdXJyZW50KSA9PiBjdXJyZW50KHByZXZpb3VzKSwgZmlyc3QoLi4uYXJncykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3VycnkgKGZuLCBhcml0eUxlZnQpIHtcbiAgY29uc3QgYXJpdHkgPSBhcml0eUxlZnQgfHwgZm4ubGVuZ3RoO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjb25zdCBhcmdMZW5ndGggPSBhcmdzLmxlbmd0aCB8fCAxO1xuICAgIGlmIChhcml0eSA9PT0gYXJnTGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZm4oLi4uYXJncyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGZ1bmMgPSAoLi4ubW9yZUFyZ3MpID0+IGZuKC4uLmFyZ3MsIC4uLm1vcmVBcmdzKTtcbiAgICAgIHJldHVybiBjdXJyeShmdW5jLCBhcml0eSAtIGFyZ3MubGVuZ3RoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseSAoZm4pIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiBmbiguLi5hcmdzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhcCAoZm4pIHtcbiAgcmV0dXJuIGFyZyA9PiB7XG4gICAgZm4oYXJnKTtcbiAgICByZXR1cm4gYXJnO1xuICB9XG59IiwiZXhwb3J0IGNvbnN0IG5leHRUaWNrID0gZm4gPT4gc2V0VGltZW91dChmbiwgMCk7XG5cbmV4cG9ydCBjb25zdCBwYWlyaWZ5ID0gaG9sZGVyID0+IGtleSA9PiBba2V5LCBob2xkZXJba2V5XV07XG5cbmV4cG9ydCBjb25zdCBpc1NoYWxsb3dFcXVhbCA9IChhLCBiKSA9PiB7XG4gIGNvbnN0IGFLZXlzID0gT2JqZWN0LmtleXMoYSk7XG4gIGNvbnN0IGJLZXlzID0gT2JqZWN0LmtleXMoYik7XG4gIHJldHVybiBhS2V5cy5sZW5ndGggPT09IGJLZXlzLmxlbmd0aCAmJiBhS2V5cy5ldmVyeSgoaykgPT4gYVtrXSA9PT0gYltrXSk7XG59O1xuXG5jb25zdCBvd25LZXlzID0gb2JqID0+IE9iamVjdC5rZXlzKG9iaikuZmlsdGVyKGsgPT4gb2JqLmhhc093blByb3BlcnR5KGspKTtcblxuZXhwb3J0IGNvbnN0IGlzRGVlcEVxdWFsID0gKGEsIGIpID0+IHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBhO1xuXG4gIC8vc2hvcnQgcGF0aChzKVxuICBpZiAoYSA9PT0gYikge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHR5cGUgIT09IHR5cGVvZiBiKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGEgPT09IGI7XG4gIH1cblxuICAvLyBvYmplY3RzIC4uLlxuICBpZiAoYSA9PT0gbnVsbCB8fCBiID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkpIHtcbiAgICByZXR1cm4gYS5sZW5ndGggJiYgYi5sZW5ndGggJiYgYS5ldmVyeSgoaXRlbSwgaSkgPT4gaXNEZWVwRXF1YWwoYVtpXSwgYltpXSkpO1xuICB9XG5cbiAgY29uc3QgYUtleXMgPSBvd25LZXlzKGEpO1xuICBjb25zdCBiS2V5cyA9IG93bktleXMoYik7XG4gIHJldHVybiBhS2V5cy5sZW5ndGggPT09IGJLZXlzLmxlbmd0aCAmJiBhS2V5cy5ldmVyeShrID0+IGlzRGVlcEVxdWFsKGFba10sIGJba10pKTtcbn07XG5cbmV4cG9ydCBjb25zdCBpZGVudGl0eSA9IGEgPT4gYTtcblxuZXhwb3J0IGNvbnN0IG5vb3AgPSBfID0+IHtcbn07XG4iLCJpbXBvcnQge3RhcH0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcblxuY29uc3QgU1ZHX05QID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcblxuY29uc3QgdXBkYXRlRG9tTm9kZUZhY3RvcnkgPSAobWV0aG9kKSA9PiAoaXRlbXMpID0+IHRhcChkb21Ob2RlID0+IHtcbiAgZm9yIChsZXQgcGFpciBvZiBpdGVtcykge1xuICAgIGRvbU5vZGVbbWV0aG9kXSguLi5wYWlyKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCByZW1vdmVFdmVudExpc3RlbmVycyA9IHVwZGF0ZURvbU5vZGVGYWN0b3J5KCdyZW1vdmVFdmVudExpc3RlbmVyJyk7XG5cbmV4cG9ydCBjb25zdCBhZGRFdmVudExpc3RlbmVycyA9IHVwZGF0ZURvbU5vZGVGYWN0b3J5KCdhZGRFdmVudExpc3RlbmVyJyk7XG5cbmV4cG9ydCBjb25zdCBzZXRBdHRyaWJ1dGVzID0gKGl0ZW1zKSA9PiB0YXAoKGRvbU5vZGUpID0+IHtcbiAgY29uc3QgYXR0cmlidXRlcyA9IGl0ZW1zLmZpbHRlcigoW2tleSwgdmFsdWVdKSA9PiB0eXBlb2YgdmFsdWUgIT09ICdmdW5jdGlvbicpO1xuICBmb3IgKGxldCBba2V5LCB2YWx1ZV0gb2YgYXR0cmlidXRlcykge1xuICAgIHZhbHVlID09PSBmYWxzZSA/IGRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKGtleSkgOiBkb21Ob2RlLnNldEF0dHJpYnV0ZShrZXksIHZhbHVlKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCByZW1vdmVBdHRyaWJ1dGVzID0gKGl0ZW1zKSA9PiB0YXAoZG9tTm9kZSA9PiB7XG4gIGZvciAobGV0IGF0dHIgb2YgaXRlbXMpIHtcbiAgICBkb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCBzZXRUZXh0Tm9kZSA9IHZhbCA9PiBub2RlID0+IG5vZGUudGV4dENvbnRlbnQgPSB2YWw7XG5cbmV4cG9ydCBjb25zdCBjcmVhdGVEb21Ob2RlID0gKHZub2RlLCBwYXJlbnQpID0+IHtcbiAgaWYgKHZub2RlLm5vZGVUeXBlID09PSAnc3ZnJykge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHX05QLCB2bm9kZS5ub2RlVHlwZSk7XG4gIH0gZWxzZSBpZiAodm5vZGUubm9kZVR5cGUgPT09ICdUZXh0Jykge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2bm9kZS5ub2RlVHlwZSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHBhcmVudC5uYW1lc3BhY2VVUkkgPT09IFNWR19OUCA/IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTlAsIHZub2RlLm5vZGVUeXBlKSA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodm5vZGUubm9kZVR5cGUpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0RXZlbnRMaXN0ZW5lcnMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKHByb3BzKVxuICAgIC5maWx0ZXIoayA9PiBrLnN1YnN0cigwLCAyKSA9PT0gJ29uJylcbiAgICAubWFwKGsgPT4gW2suc3Vic3RyKDIpLnRvTG93ZXJDYXNlKCksIHByb3BzW2tdXSk7XG59O1xuIiwiZXhwb3J0IGNvbnN0IHRyYXZlcnNlID0gZnVuY3Rpb24gKiAodm5vZGUpIHtcbiAgeWllbGQgdm5vZGU7XG4gIGlmICh2bm9kZS5jaGlsZHJlbiAmJiB2bm9kZS5jaGlsZHJlbi5sZW5ndGgpIHtcbiAgICBmb3IgKGxldCBjaGlsZCBvZiB2bm9kZS5jaGlsZHJlbikge1xuICAgICAgeWllbGQgKiB0cmF2ZXJzZShjaGlsZCk7XG4gICAgfVxuICB9XG59OyIsImltcG9ydCB7Y29tcG9zZSwgY3Vycnl9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge1xuICBpc1NoYWxsb3dFcXVhbCxcbiAgcGFpcmlmeSxcbiAgbmV4dFRpY2ssXG4gIG5vb3Bcbn0gZnJvbSAnLi91dGlsJztcbmltcG9ydCB7XG4gIHJlbW92ZUF0dHJpYnV0ZXMsXG4gIHNldEF0dHJpYnV0ZXMsXG4gIHNldFRleHROb2RlLFxuICBjcmVhdGVEb21Ob2RlLFxuICByZW1vdmVFdmVudExpc3RlbmVycyxcbiAgYWRkRXZlbnRMaXN0ZW5lcnMsXG4gIGdldEV2ZW50TGlzdGVuZXJzLFxufSBmcm9tICcuL2RvbVV0aWwnO1xuaW1wb3J0IHt0cmF2ZXJzZX0gZnJvbSAnLi90cmF2ZXJzZSc7XG5cbmNvbnN0IHVwZGF0ZUV2ZW50TGlzdGVuZXJzID0gKHtwcm9wczpuZXdOb2RlUHJvcHN9PXt9LCB7cHJvcHM6b2xkTm9kZVByb3BzfT17fSkgPT4ge1xuICBjb25zdCBuZXdOb2RlRXZlbnRzID0gZ2V0RXZlbnRMaXN0ZW5lcnMobmV3Tm9kZVByb3BzIHx8IHt9KTtcbiAgY29uc3Qgb2xkTm9kZUV2ZW50cyA9IGdldEV2ZW50TGlzdGVuZXJzKG9sZE5vZGVQcm9wcyB8fCB7fSk7XG5cbiAgcmV0dXJuIG5ld05vZGVFdmVudHMubGVuZ3RoIHx8IG9sZE5vZGVFdmVudHMubGVuZ3RoID9cbiAgICBjb21wb3NlKFxuICAgICAgcmVtb3ZlRXZlbnRMaXN0ZW5lcnMob2xkTm9kZUV2ZW50cyksXG4gICAgICBhZGRFdmVudExpc3RlbmVycyhuZXdOb2RlRXZlbnRzKVxuICAgICkgOiBub29wO1xufTtcblxuY29uc3QgdXBkYXRlQXR0cmlidXRlcyA9IChuZXdWTm9kZSwgb2xkVk5vZGUpID0+IHtcbiAgY29uc3QgbmV3Vk5vZGVQcm9wcyA9IG5ld1ZOb2RlLnByb3BzIHx8IHt9O1xuICBjb25zdCBvbGRWTm9kZVByb3BzID0gb2xkVk5vZGUucHJvcHMgfHwge307XG5cbiAgaWYgKGlzU2hhbGxvd0VxdWFsKG5ld1ZOb2RlUHJvcHMsIG9sZFZOb2RlUHJvcHMpKSB7XG4gICAgcmV0dXJuIG5vb3A7XG4gIH1cblxuICBpZiAobmV3Vk5vZGUubm9kZVR5cGUgPT09ICdUZXh0Jykge1xuICAgIHJldHVybiBzZXRUZXh0Tm9kZShuZXdWTm9kZS5wcm9wcy52YWx1ZSk7XG4gIH1cblxuICBjb25zdCBuZXdOb2RlS2V5cyA9IE9iamVjdC5rZXlzKG5ld1ZOb2RlUHJvcHMpO1xuICBjb25zdCBvbGROb2RlS2V5cyA9IE9iamVjdC5rZXlzKG9sZFZOb2RlUHJvcHMpO1xuICBjb25zdCBhdHRyaWJ1dGVzVG9SZW1vdmUgPSBvbGROb2RlS2V5cy5maWx0ZXIoayA9PiAhbmV3Tm9kZUtleXMuaW5jbHVkZXMoaykpO1xuXG4gIHJldHVybiBjb21wb3NlKFxuICAgIHJlbW92ZUF0dHJpYnV0ZXMoYXR0cmlidXRlc1RvUmVtb3ZlKSxcbiAgICBzZXRBdHRyaWJ1dGVzKG5ld05vZGVLZXlzLm1hcChwYWlyaWZ5KG5ld1ZOb2RlUHJvcHMpKSlcbiAgKTtcbn07XG5cbmNvbnN0IGRvbUZhY3RvcnkgPSBjcmVhdGVEb21Ob2RlO1xuXG4vLyBhcHBseSB2bm9kZSBkaWZmaW5nIHRvIGFjdHVhbCBkb20gbm9kZSAoaWYgbmV3IG5vZGUgPT4gaXQgd2lsbCBiZSBtb3VudGVkIGludG8gdGhlIHBhcmVudClcbmNvbnN0IGRvbWlmeSA9IChvbGRWbm9kZSwgbmV3Vm5vZGUsIHBhcmVudERvbU5vZGUpID0+IHtcbiAgaWYgKCFvbGRWbm9kZSkgey8vdGhlcmUgaXMgbm8gcHJldmlvdXMgdm5vZGVcbiAgICBpZiAobmV3Vm5vZGUpIHsvL25ldyBub2RlID0+IHdlIGluc2VydFxuICAgICAgbmV3Vm5vZGUuZG9tID0gcGFyZW50RG9tTm9kZS5hcHBlbmRDaGlsZChkb21GYWN0b3J5KG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKSk7XG4gICAgICBuZXdWbm9kZS5saWZlQ3ljbGUgPSAxO1xuICAgICAgcmV0dXJuIHt2bm9kZTogbmV3Vm5vZGUsIGdhcmJhZ2U6IG51bGx9O1xuICAgIH0gZWxzZSB7Ly9lbHNlIChpcnJlbGV2YW50KVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvcGVyYXRpb24nKVxuICAgIH1cbiAgfSBlbHNlIHsvL3RoZXJlIGlzIGEgcHJldmlvdXMgdm5vZGVcbiAgICBpZiAoIW5ld1Zub2RlKSB7Ly93ZSBtdXN0IHJlbW92ZSB0aGUgcmVsYXRlZCBkb20gbm9kZVxuICAgICAgcGFyZW50RG9tTm9kZS5yZW1vdmVDaGlsZChvbGRWbm9kZS5kb20pO1xuICAgICAgcmV0dXJuICh7Z2FyYmFnZTogb2xkVm5vZGUsIGRvbTogbnVsbH0pO1xuICAgIH0gZWxzZSBpZiAobmV3Vm5vZGUubm9kZVR5cGUgIT09IG9sZFZub2RlLm5vZGVUeXBlKSB7Ly9pdCBtdXN0IGJlIHJlcGxhY2VkXG4gICAgICBuZXdWbm9kZS5kb20gPSBkb21GYWN0b3J5KG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKTtcbiAgICAgIG5ld1Zub2RlLmxpZmVDeWNsZSA9IDE7XG4gICAgICBwYXJlbnREb21Ob2RlLnJlcGxhY2VDaGlsZChuZXdWbm9kZS5kb20sIG9sZFZub2RlLmRvbSk7XG4gICAgICByZXR1cm4ge2dhcmJhZ2U6IG9sZFZub2RlLCB2bm9kZTogbmV3Vm5vZGV9O1xuICAgIH0gZWxzZSB7Ly8gb25seSB1cGRhdGUgYXR0cmlidXRlc1xuICAgICAgbmV3Vm5vZGUuZG9tID0gb2xkVm5vZGUuZG9tO1xuICAgICAgLy8gcGFzcyB0aGUgdW5Nb3VudEhvb2tcbiAgICAgIGlmKG9sZFZub2RlLm9uVW5Nb3VudCl7XG4gICAgICAgIG5ld1Zub2RlLm9uVW5Nb3VudCA9IG9sZFZub2RlLm9uVW5Nb3VudDtcbiAgICAgIH1cbiAgICAgIG5ld1Zub2RlLmxpZmVDeWNsZSA9IG9sZFZub2RlLmxpZmVDeWNsZSArIDE7XG4gICAgICByZXR1cm4ge2dhcmJhZ2U6IG51bGwsIHZub2RlOiBuZXdWbm9kZX07XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIHJlbmRlciBhIHZpcnR1YWwgZG9tIG5vZGUsIGRpZmZpbmcgaXQgd2l0aCBpdHMgcHJldmlvdXMgdmVyc2lvbiwgbW91bnRpbmcgaXQgaW4gYSBwYXJlbnQgZG9tIG5vZGVcbiAqIEBwYXJhbSBvbGRWbm9kZVxuICogQHBhcmFtIG5ld1Zub2RlXG4gKiBAcGFyYW0gcGFyZW50RG9tTm9kZVxuICogQHBhcmFtIG9uTmV4dFRpY2sgY29sbGVjdCBvcGVyYXRpb25zIHRvIGJlIHByb2Nlc3NlZCBvbiBuZXh0IHRpY2tcbiAqIEByZXR1cm5zIHtBcnJheX1cbiAqL1xuZXhwb3J0IGNvbnN0IHJlbmRlciA9IChvbGRWbm9kZSwgbmV3Vm5vZGUsIHBhcmVudERvbU5vZGUsIG9uTmV4dFRpY2sgPSBbXSkgPT4ge1xuXG4gIC8vMS4gdHJhbnNmb3JtIHRoZSBuZXcgdm5vZGUgdG8gYSB2bm9kZSBjb25uZWN0ZWQgdG8gYW4gYWN0dWFsIGRvbSBlbGVtZW50IGJhc2VkIG9uIHZub2RlIHZlcnNpb25zIGRpZmZpbmdcbiAgLy8gaS4gbm90ZSBhdCB0aGlzIHN0ZXAgb2NjdXIgZG9tIGluc2VydGlvbnMvcmVtb3ZhbHNcbiAgLy8gaWkuIGl0IG1heSBjb2xsZWN0IHN1YiB0cmVlIHRvIGJlIGRyb3BwZWQgKG9yIFwidW5tb3VudGVkXCIpXG4gIGNvbnN0IHt2bm9kZSwgZ2FyYmFnZX0gPSBkb21pZnkob2xkVm5vZGUsIG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKTtcblxuICBpZiAoZ2FyYmFnZSAhPT0gbnVsbCkge1xuICAgIC8vIGRlZmVyIHVubW91bnQgbGlmZWN5Y2xlIGFzIGl0IGlzIG5vdCBcInZpc3VhbFwiXG4gICAgZm9yIChsZXQgZyBvZiB0cmF2ZXJzZShnYXJiYWdlKSkge1xuICAgICAgaWYgKGcub25Vbk1vdW50KSB7XG4gICAgICAgIG9uTmV4dFRpY2sucHVzaChnLm9uVW5Nb3VudCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy9Ob3JtYWxpc2F0aW9uIG9mIG9sZCBub2RlIChpbiBjYXNlIG9mIGEgcmVwbGFjZSB3ZSB3aWxsIGNvbnNpZGVyIG9sZCBub2RlIGFzIGVtcHR5IG5vZGUgKG5vIGNoaWxkcmVuLCBubyBwcm9wcykpXG4gIGNvbnN0IHRlbXBPbGROb2RlID0gZ2FyYmFnZSAhPT0gbnVsbCB8fCAhb2xkVm5vZGUgPyB7bGVuZ3RoOiAwLCBjaGlsZHJlbjogW10sIHByb3BzOiB7fX0gOiBvbGRWbm9kZTtcblxuICBpZiAodm5vZGUpIHtcblxuICAgIC8vMi4gdXBkYXRlIGRvbSBhdHRyaWJ1dGVzIGJhc2VkIG9uIHZub2RlIHByb3AgZGlmZmluZy5cbiAgICAvL3N5bmNcbiAgICBpZiAodm5vZGUub25VcGRhdGUgJiYgdm5vZGUubGlmZUN5Y2xlID4gMSkge1xuICAgICAgdm5vZGUub25VcGRhdGUoKTtcbiAgICB9XG5cbiAgICB1cGRhdGVBdHRyaWJ1dGVzKHZub2RlLCB0ZW1wT2xkTm9kZSkodm5vZGUuZG9tKTtcblxuICAgIC8vZmFzdCBwYXRoXG4gICAgaWYgKHZub2RlLm5vZGVUeXBlID09PSAnVGV4dCcpIHtcbiAgICAgIHJldHVybiBvbk5leHRUaWNrO1xuICAgIH1cblxuICAgIGlmICh2bm9kZS5vbk1vdW50ICYmIHZub2RlLmxpZmVDeWNsZSA9PT0gMSkge1xuICAgICAgb25OZXh0VGljay5wdXNoKCgpID0+IHZub2RlLm9uTW91bnQoKSk7XG4gICAgfVxuXG4gICAgY29uc3QgY2hpbGRyZW5Db3VudCA9IE1hdGgubWF4KHRlbXBPbGROb2RlLmNoaWxkcmVuLmxlbmd0aCwgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoKTtcblxuICAgIC8vYXN5bmMgd2lsbCBiZSBkZWZlcnJlZCBhcyBpdCBpcyBub3QgXCJ2aXN1YWxcIlxuICAgIGNvbnN0IHNldExpc3RlbmVycyA9IHVwZGF0ZUV2ZW50TGlzdGVuZXJzKHZub2RlLCB0ZW1wT2xkTm9kZSk7XG4gICAgaWYgKHNldExpc3RlbmVycyAhPT0gbm9vcCkge1xuICAgICAgb25OZXh0VGljay5wdXNoKCgpID0+IHNldExpc3RlbmVycyh2bm9kZS5kb20pKTtcbiAgICB9XG5cbiAgICAvLzMgcmVjdXJzaXZlbHkgdHJhdmVyc2UgY2hpbGRyZW4gdG8gdXBkYXRlIGRvbSBhbmQgY29sbGVjdCBmdW5jdGlvbnMgdG8gcHJvY2VzcyBvbiBuZXh0IHRpY2tcbiAgICBpZiAoY2hpbGRyZW5Db3VudCA+IDApIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW5Db3VudDsgaSsrKSB7XG4gICAgICAgIC8vIHdlIHBhc3Mgb25OZXh0VGljayBhcyByZWZlcmVuY2UgKGltcHJvdmUgcGVyZjogbWVtb3J5ICsgc3BlZWQpXG4gICAgICAgIHJlbmRlcih0ZW1wT2xkTm9kZS5jaGlsZHJlbltpXSwgdm5vZGUuY2hpbGRyZW5baV0sIHZub2RlLmRvbSwgb25OZXh0VGljayk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9uTmV4dFRpY2s7XG59O1xuXG5leHBvcnQgY29uc3QgaHlkcmF0ZSA9ICh2bm9kZSwgZG9tKSA9PiB7XG4gICd1c2Ugc3RyaWN0JztcbiAgY29uc3QgaHlkcmF0ZWQgPSBPYmplY3QuYXNzaWduKHt9LCB2bm9kZSk7XG4gIGNvbnN0IGRvbUNoaWxkcmVuID0gQXJyYXkuZnJvbShkb20uY2hpbGROb2RlcykuZmlsdGVyKG4gPT4gbi5ub2RlVHlwZSAhPT0gMyB8fCBuLm5vZGVWYWx1ZS50cmltKCkgIT09ICcnKTtcbiAgaHlkcmF0ZWQuZG9tID0gZG9tO1xuICBoeWRyYXRlZC5jaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQsIGkpID0+IGh5ZHJhdGUoY2hpbGQsIGRvbUNoaWxkcmVuW2ldKSk7XG4gIHJldHVybiBoeWRyYXRlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBtb3VudCA9IGN1cnJ5KChjb21wLCBpbml0UHJvcCwgcm9vdCkgPT4ge1xuICBjb25zdCB2bm9kZSA9IGNvbXAubm9kZVR5cGUgIT09IHZvaWQgMCA/IGNvbXAgOiBjb21wKGluaXRQcm9wIHx8IHt9KTtcbiAgY29uc3Qgb2xkVk5vZGUgPSByb290LmNoaWxkcmVuLmxlbmd0aCA/IGh5ZHJhdGUodm5vZGUsIHJvb3QuY2hpbGRyZW5bMF0pIDogbnVsbDtcbiAgY29uc3QgYmF0Y2ggPSByZW5kZXIob2xkVk5vZGUsIHZub2RlLCByb290KTtcbiAgbmV4dFRpY2soKCkgPT4ge1xuICAgIGZvciAobGV0IG9wIG9mIGJhdGNoKSB7XG4gICAgICBvcCgpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiB2bm9kZTtcbn0pOyIsImltcG9ydCB7cmVuZGVyfSBmcm9tICcuL3RyZWUnO1xuaW1wb3J0IHtuZXh0VGlja30gZnJvbSAnLi91dGlsJztcblxuLyoqXG4gKiBDcmVhdGUgYSBmdW5jdGlvbiB3aGljaCB3aWxsIHRyaWdnZXIgYW4gdXBkYXRlIG9mIHRoZSBjb21wb25lbnQgd2l0aCB0aGUgcGFzc2VkIHN0YXRlXG4gKiBAcGFyYW0gY29tcCB7RnVuY3Rpb259IC0gdGhlIGNvbXBvbmVudCB0byB1cGRhdGVcbiAqIEBwYXJhbSBpbml0aWFsVk5vZGUgLSB0aGUgaW5pdGlhbCB2aXJ0dWFsIGRvbSBub2RlIHJlbGF0ZWQgdG8gdGhlIGNvbXBvbmVudCAoaWUgb25jZSBpdCBoYXMgYmVlbiBtb3VudGVkKVxuICogQHJldHVybnMge0Z1bmN0aW9ufSAtIHRoZSB1cGRhdGUgZnVuY3Rpb25cbiAqL1xuZXhwb3J0IGRlZmF1bHQgKGNvbXAsIGluaXRpYWxWTm9kZSkgPT4ge1xuICBsZXQgb2xkTm9kZSA9IGluaXRpYWxWTm9kZTtcbiAgcmV0dXJuIChwcm9wcywgLi4uYXJncykgPT4ge1xuICAgIGNvbnN0IG1vdW50ID0gb2xkTm9kZS5kb20ucGFyZW50Tm9kZTtcbiAgICBjb25zdCBuZXdOb2RlID0gY29tcChPYmplY3QuYXNzaWduKHtjaGlsZHJlbjogb2xkTm9kZS5jaGlsZHJlbiB8fCBbXX0sIG9sZE5vZGUucHJvcHMsIHByb3BzKSwgLi4uYXJncyk7XG4gICAgY29uc3QgbmV4dEJhdGNoID0gcmVuZGVyKG9sZE5vZGUsIG5ld05vZGUsIG1vdW50KTtcblxuICAgIC8vIGRhbmdlciB6b25lICEhISFcbiAgICAvLyBjaGFuZ2UgYnkga2VlcGluZyB0aGUgc2FtZSByZWZlcmVuY2Ugc28gdGhlIGV2ZW50dWFsIHBhcmVudCBub2RlIGRvZXMgbm90IG5lZWQgdG8gYmUgXCJhd2FyZVwiIHRyZWUgbWF5IGhhdmUgY2hhbmdlZCBkb3duc3RyZWFtOiBvbGROb2RlIG1heSBiZSB0aGUgY2hpbGQgb2Ygc29tZW9uZSAuLi4od2VsbCB0aGF0IGlzIGEgdHJlZSBkYXRhIHN0cnVjdHVyZSBhZnRlciBhbGwgOlAgKVxuICAgIG9sZE5vZGUgPSBPYmplY3QuYXNzaWduKG9sZE5vZGUgfHwge30sIG5ld05vZGUpO1xuICAgIC8vIGVuZCBkYW5nZXIgem9uZVxuXG4gICAgbmV4dFRpY2soXyA9PiB7XG4gICAgICBmb3IgKGxldCBvcCBvZiBuZXh0QmF0Y2gpIHtcbiAgICAgICAgb3AoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gbmV3Tm9kZTtcbiAgfTtcbn07IiwiaW1wb3J0IHtjdXJyeSwgY29tcG9zZX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcblxuY29uc3QgbGlmZUN5Y2xlRmFjdG9yeSA9IG1ldGhvZCA9PiBjdXJyeSgoZm4sIGNvbXApID0+IChwcm9wcywgLi4uYXJncykgPT4ge1xuICBjb25zdCBuID0gY29tcChwcm9wcywgLi4uYXJncyk7XG4gIGNvbnN0IGFwcGx5Rm4gPSAoKSA9PiBmbihuLCAuLi5hcmdzKTtcbiAgY29uc3QgY3VycmVudCA9IG5bbWV0aG9kXTtcbiAgblttZXRob2RdID0gY3VycmVudCA/IGNvbXBvc2UoY3VycmVudCwgYXBwbHlGbikgOiBhcHBseUZuO1xuICByZXR1cm4gbjtcbn0pO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IHdoZW4gdGhlIGNvbXBvbmVudCBpcyBtb3VudGVkXG4gKi9cbmV4cG9ydCBjb25zdCBvbk1vdW50ID0gbGlmZUN5Y2xlRmFjdG9yeSgnb25Nb3VudCcpO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IHdoZW4gdGhlIGNvbXBvbmVudCBpcyB1bm1vdW50ZWRcbiAqL1xuZXhwb3J0IGNvbnN0IG9uVW5Nb3VudCA9IGxpZmVDeWNsZUZhY3RvcnkoJ29uVW5Nb3VudCcpO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IGJlZm9yZSB0aGUgY29tcG9uZW50IGlzIHVwZGF0ZWRcbiAqL1xuZXhwb3J0IGNvbnN0IG9uVXBkYXRlID0gbGlmZUN5Y2xlRmFjdG9yeSgnb25VcGRhdGUnKTsiLCJpbXBvcnQgdXBkYXRlIGZyb20gJy4vdXBkYXRlJztcbmltcG9ydCB7b25Nb3VudCwgb25VcGRhdGV9IGZyb20gJy4vbGlmZUN5Y2xlcyc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5cbi8qKlxuICogQ29tYmluYXRvciB0byBjcmVhdGUgYSBcInN0YXRlZnVsIGNvbXBvbmVudFwiOiBpZSBpdCB3aWxsIGhhdmUgaXRzIG93biBzdGF0ZSBhbmQgdGhlIGFiaWxpdHkgdG8gdXBkYXRlIGl0cyBvd24gdHJlZVxuICogQHBhcmFtIGNvbXAge0Z1bmN0aW9ufSAtIHRoZSBjb21wb25lbnRcbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gLSBhIG5ldyB3cmFwcGVkIGNvbXBvbmVudFxuICovXG5leHBvcnQgZGVmYXVsdCAgKGNvbXApID0+ICgpID0+IHtcbiAgbGV0IHVwZGF0ZUZ1bmM7XG4gIGNvbnN0IHdyYXBwZXJDb21wID0gKHByb3BzLCAuLi5hcmdzKSA9PiB7XG4gICAgLy9sYXp5IGV2YWx1YXRlIHVwZGF0ZUZ1bmMgKHRvIG1ha2Ugc3VyZSBpdCBpcyBkZWZpbmVkXG4gICAgY29uc3Qgc2V0U3RhdGUgPSAobmV3U3RhdGUpID0+IHVwZGF0ZUZ1bmMobmV3U3RhdGUpO1xuICAgIHJldHVybiBjb21wKHByb3BzLCBzZXRTdGF0ZSwgLi4uYXJncyk7XG4gIH07XG4gIGNvbnN0IHNldFVwZGF0ZUZ1bmN0aW9uID0gKHZub2RlKSA9PiB7XG4gICAgdXBkYXRlRnVuYyA9IHVwZGF0ZSh3cmFwcGVyQ29tcCwgdm5vZGUpO1xuICB9O1xuXG4gIHJldHVybiBjb21wb3NlKG9uTW91bnQoc2V0VXBkYXRlRnVuY3Rpb24pLCBvblVwZGF0ZShzZXRVcGRhdGVGdW5jdGlvbikpKHdyYXBwZXJDb21wKTtcbn07IiwiaW1wb3J0IHVwZGF0ZSBmcm9tICcuL3VwZGF0ZSc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge29uTW91bnQsIG9uVW5Nb3VudH0gZnJvbSAnLi9saWZlQ3ljbGVzJ1xuaW1wb3J0IHtpc0RlZXBFcXVhbCwgaWRlbnRpdHl9IGZyb20gJy4vdXRpbCc7XG5cbi8qKlxuICogQ29ubmVjdCBjb21iaW5hdG9yOiB3aWxsIGNyZWF0ZSBcImNvbnRhaW5lclwiIGNvbXBvbmVudCB3aGljaCB3aWxsIHN1YnNjcmliZSB0byBhIFJlZHV4IGxpa2Ugc3RvcmUuIGFuZCB1cGRhdGUgaXRzIGNoaWxkcmVuIHdoZW5ldmVyIGEgc3BlY2lmaWMgc2xpY2Ugb2Ygc3RhdGUgY2hhbmdlIHVuZGVyIHNwZWNpZmljIGNpcmN1bXN0YW5jZXNcbiAqIEBwYXJhbSBzdG9yZSB7T2JqZWN0fSAtIFRoZSBzdG9yZSAoaW1wbGVtZW50aW5nIHRoZSBzYW1lIGFwaSB0aGFuIFJlZHV4IHN0b3JlXG4gKiBAcGFyYW0gc2xpY2VTdGF0ZSB7RnVuY3Rpb259IFtzdGF0ZSA9PiBzdGF0ZV0gLSBBIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGFzIGFyZ3VtZW50IHRoZSBzdGF0ZSBhbmQgcmV0dXJuIGEgXCJ0cmFuc2Zvcm1lZFwiIHN0YXRlIChsaWtlIHBhcnRpYWwsIGV0YykgcmVsZXZhbnQgdG8gdGhlIGNvbnRhaW5lclxuICogQHJldHVybnMge0Z1bmN0aW9ufSAtIEEgY29udGFpbmVyIGZhY3Rvcnkgd2l0aCB0aGUgZm9sbG93aW5nIGFyZ3VtZW50czpcbiAqICAtIG1hcFN0YXRlVG9Qcm9wOiBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGFzIGFyZ3VtZW50IHdoYXQgdGhlIFwic2xpY2VTdGF0ZVwiIGZ1bmN0aW9uIHJldHVybnMgYW5kIHJldHVybnMgYW4gb2JqZWN0IHRvIGJlIGJsZW5kZWQgaW50byB0aGUgcHJvcGVydGllcyBvZiB0aGUgY29tcG9uZW50IChkZWZhdWx0IHRvIGlkZW50aXR5IGZ1bmN0aW9uKVxuICogIC0gc2hvdWxkVXBkYXRlOiBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGFzIGFyZ3VtZW50cyB0aGUgcHJldmlvdXMgYW5kIHRoZSBjdXJyZW50IHZlcnNpb25zIG9mIHdoYXQgXCJzbGljZVN0YXRlXCIgZnVuY3Rpb24gcmV0dXJucyB0byByZXR1cm5zIGEgYm9vbGVhbiBkZWZpbmluZyB3aGV0aGVyIHRoZSBjb21wb25lbnQgc2hvdWxkIGJlIHVwZGF0ZWQgKGRlZmF1bHQgdG8gYSBkZWVwRXF1YWwgY2hlY2spXG4gKi9cbmV4cG9ydCBkZWZhdWx0ICAoc3RvcmUsIHNsaWNlU3RhdGUgPSBpZGVudGl0eSkgPT5cbiAgKGNvbXAsIG1hcFN0YXRlVG9Qcm9wID0gaWRlbnRpdHksIHNob3VsZFVwYXRlID0gKGEsIGIpID0+IGlzRGVlcEVxdWFsKGEsIGIpID09PSBmYWxzZSkgPT5cbiAgICAoaW5pdFByb3ApID0+IHtcbiAgICAgIGxldCBjb21wb25lbnRQcm9wcyA9IGluaXRQcm9wO1xuICAgICAgbGV0IHVwZGF0ZUZ1bmMsIHByZXZpb3VzU3RhdGVTbGljZSwgdW5zdWJzY3JpYmVyO1xuXG4gICAgICBjb25zdCB3cmFwcGVyQ29tcCA9IChwcm9wcywgLi4uYXJncykgPT4ge1xuICAgICAgICByZXR1cm4gY29tcChPYmplY3QuYXNzaWduKHByb3BzLCBtYXBTdGF0ZVRvUHJvcChzbGljZVN0YXRlKHN0b3JlLmdldFN0YXRlKCkpKSksIC4uLmFyZ3MpO1xuICAgICAgfTtcblxuICAgICAgY29uc3Qgc3Vic2NyaWJlID0gb25Nb3VudCgodm5vZGUpID0+IHtcbiAgICAgICAgdXBkYXRlRnVuYyA9IHVwZGF0ZSh3cmFwcGVyQ29tcCwgdm5vZGUpO1xuICAgICAgICB1bnN1YnNjcmliZXIgPSBzdG9yZS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0YXRlU2xpY2UgPSBzbGljZVN0YXRlKHN0b3JlLmdldFN0YXRlKCkpO1xuICAgICAgICAgIGlmIChzaG91bGRVcGF0ZShwcmV2aW91c1N0YXRlU2xpY2UsIHN0YXRlU2xpY2UpID09PSB0cnVlKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbXBvbmVudFByb3BzLCBtYXBTdGF0ZVRvUHJvcChzdGF0ZVNsaWNlKSk7XG4gICAgICAgICAgICB1cGRhdGVGdW5jKGNvbXBvbmVudFByb3BzKTtcbiAgICAgICAgICAgIHByZXZpb3VzU3RhdGVTbGljZSA9IHN0YXRlU2xpY2U7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB1bnN1YnNjcmliZSA9IG9uVW5Nb3VudCgoKSA9PiB7XG4gICAgICAgIHVuc3Vic2NyaWJlcigpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBjb21wb3NlKHN1YnNjcmliZSwgdW5zdWJzY3JpYmUpKHdyYXBwZXJDb21wKTtcbiAgICB9IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5leHBvcnQgY29uc3QgQWRkcmVzc0Jvb2sgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+YWRkcmVzcy1ib29rPC90aXRsZT48cGF0aCBkPVwiTTYgMHYzMmgyNFYwSDZ6bTEyIDguMDFhMy45OSAzLjk5IDAgMSAxIDAgNy45OCAzLjk5IDMuOTkgMCAwIDEgMC03Ljk4ek0yNCAyNEgxMnYtMmE0IDQgMCAwIDEgNC00aDRhNCA0IDAgMCAxIDQgNHYyek0yIDJoM3Y2SDJWMnpNMiAxMGgzdjZIMnYtNnpNMiAxOGgzdjZIMnYtNnpNMiAyNmgzdjZIMnYtNnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBCaW4yID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmJpbjI8L3RpdGxlPjxwYXRoIGQ9XCJNNiAzMmgyMGwyLTIySDR6TTIwIDRWMGgtOHY0SDJ2NmwyLTJoMjRsMiAyVjRIMjB6bS0yIDBoLTRWMmg0djJ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgQm9va21hcmsgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+Ym9va21hcms8L3RpdGxlPjxwYXRoIGQ9XCJNNiAwdjMybDEwLTEwIDEwIDEwVjB6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgQm9va21hcmtzID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmJvb2ttYXJrczwvdGl0bGU+PHBhdGggZD1cIk04IDR2MjhsMTAtMTAgMTAgMTBWNHptMTYtNEg0djI4bDItMlYyaDE4elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEJ1YmJsZXMgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzZcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzYgMzJcIj48dGl0bGU+YnViYmxlczwvdGl0bGU+PHBhdGggZD1cIk0zNCAyOC4xNjFhMy42NSAzLjY1IDAgMCAwIDIgMy4yNTZ2LjQ5OGE3LjQyIDcuNDIgMCAwIDEtNi40MTQtMi4yNTFjLS44MTkuMjE4LTEuNjg4LjMzNi0yLjU4Ny4zMzYtNC45NzEgMC05LTMuNTgyLTktOHM0LjAyOS04IDktOCA5IDMuNTgyIDkgOGMwIDEuNzMtLjYxOCAzLjMzMS0xLjY2NyA0LjY0YTMuNjM1IDMuNjM1IDAgMCAwLS4zMzMgMS41MjJ6TTE2IDBjOC43MDIgMCAxNS43ODEgNS42NDQgMTUuOTk1IDEyLjY3MkExMi4yNjIgMTIuMjYyIDAgMCAwIDI3IDExLjYyNWMtMi45ODYgMC01LjgwNyAxLjA0NS03Ljk0MiAyLjk0My0yLjIxNCAxLjk2OC0zLjQzMyA0LjYwNy0zLjQzMyA3LjQzMiAwIDEuMzk2LjI5OCAyLjc0Ny44NjcgMy45OTNhMTkuNjYgMTkuNjYgMCAwIDEtMi45ODctLjE1MUMxMC4wNjggMjkuMjc5IDUuOTY2IDI5Ljg5NSAyIDI5Ljk4NnYtLjg0MUM0LjE0MiAyOC4wOTYgNiAyNi4xODQgNiAyNGMwLS4zMDUtLjAyNC0uNjA0LS4wNjgtLjg5N0MyLjMxMyAyMC43MiAwIDE3LjA3OSAwIDEzIDAgNS44MiA3LjE2MyAwIDE2IDB6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgQ2hlY2tib3hDaGVja2VkID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmNoZWNrYm94LWNoZWNrZWQ8L3RpdGxlPjxwYXRoIGQ9XCJNMjggMEg0QzEuOCAwIDAgMS44IDAgNHYyNGMwIDIuMiAxLjggNCA0IDRoMjRjMi4yIDAgNC0xLjggNC00VjRjMC0yLjItMS44LTQtNC00ek0xNCAyNC44MjhsLTcuNDE0LTcuNDE0IDIuODI4LTIuODI4TDE0IDE5LjE3Mmw5LjU4Ni05LjU4NiAyLjgyOCAyLjgyOEwxNCAyNC44Mjh6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgQ2hlY2tib3hVbmNoZWNrZWQgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+Y2hlY2tib3gtdW5jaGVja2VkPC90aXRsZT48cGF0aCBkPVwiTTI4IDBINEMxLjggMCAwIDEuOCAwIDR2MjRjMCAyLjIgMS44IDQgNCA0aDI0YzIuMiAwIDQtMS44IDQtNFY0YzAtMi4yLTEuOC00LTQtNHptMCAyOEg0VjRoMjR2MjR6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgQ2hlY2ttYXJrID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmNoZWNrbWFyazwvdGl0bGU+PHBhdGggZD1cIk0yNyA0TDEyIDE5bC03LTctNSA1IDEyIDEyTDMyIDl6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgQ2hlY2ttYXJrMiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5jaGVja21hcmsyPC90aXRsZT48cGF0aCBkPVwiTTEyLjQyIDI4LjY3OEwtLjAxMyAxNi40NGw2LjE2OC02LjA3MSA2LjI2NSA2LjE2N0wyNS44NDYgMy4zMjJsNi4xNjggNi4wNzFMMTIuNDIgMjguNjc4ek0zLjM3MiAxNi40NDFsOS4wNDggOC45MDVMMjguNjI4IDkuMzkzbC0yLjc4Mi0yLjczOUwxMi40MiAxOS44NjhsLTYuMjY1LTYuMTY3LTIuNzgyIDIuNzM5elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IENvZyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5jb2c8L3RpdGxlPjxwYXRoIGQ9XCJNMjkuMTgxIDE5LjA3Yy0xLjY3OS0yLjkwOC0uNjY5LTYuNjM0IDIuMjU1LTguMzI4bC0zLjE0NS01LjQ0N2E2LjAyMiA2LjAyMiAwIDAgMS0zLjA1OC44MjljLTMuMzYxIDAtNi4wODUtMi43NDItNi4wODUtNi4xMjVoLTYuMjg5YTYuMDIzIDYuMDIzIDAgMCAxLS44MTEgMy4wN0MxMC4zNjkgNS45NzcgNi42MzcgNi45NjYgMy43MDkgNS4yOEwuNTY1IDEwLjcyN2E2LjAyMyA2LjAyMyAwIDAgMSAyLjI0NiAyLjIzNGMxLjY3NiAyLjkwMy42NzIgNi42MjMtMi4yNDEgOC4zMTlsMy4xNDUgNS40NDdhNi4wMjIgNi4wMjIgMCAwIDEgMy4wNDQtLjgyYzMuMzUgMCA2LjA2NyAyLjcyNSA2LjA4NCA2LjA5Mmg2LjI4OWE2LjAzMiA2LjAzMiAwIDAgMSAuODExLTMuMDM4YzEuNjc2LTIuOTAzIDUuMzk5LTMuODk0IDguMzI1LTIuMjE5bDMuMTQ1LTUuNDQ3YTYuMDMyIDYuMDMyIDAgMCAxLTIuMjMyLTIuMjI2ek0xNiAyMi40NzlBNi40OCA2LjQ4IDAgMSAxIDE2IDkuNTJhNi40OCA2LjQ4IDAgMCAxIDAgMTIuOTU5elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IENvbm5lY3Rpb24gPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiNDBcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgNDAgMzJcIj48dGl0bGU+Y29ubmVjdGlvbjwvdGl0bGU+PHBhdGggZD1cIk0yMCAxOGMzLjMwOCAwIDYuMzA4IDEuMzQ2IDguNDgxIDMuNTE5bC0yLjgyNyAyLjgyN0MyNC4yMDUgMjIuODk3IDIyLjIwNSAyMiAyMCAyMnMtNC4yMDYuODk3LTUuNjU0IDIuMzQ2bC0yLjgyNy0yLjgyN0ExMS45NjMgMTEuOTYzIDAgMCAxIDIwIDE4ek01Ljg1OCAxNS44NThDOS42MzUgMTIuMDgxIDE0LjY1OCAxMCAyMCAxMHMxMC4zNjUgMi4wOCAxNC4xNDIgNS44NThsLTIuODI4IDIuODI4QzI4LjI5MiAxNS42NjQgMjQuMjc0IDE0IDIwIDE0cy04LjI5MiAxLjY2NC0xMS4zMTQgNC42ODZsLTIuODI4LTIuODI4ek0zMC44OTkgNC4yMDFhMjcuODkgMjcuODkgMCAwIDEgOC44OTkgNmwtMi44MjggMi44MjhDMzIuNDM3IDguNDk2IDI2LjQxIDYgMTkuOTk5IDZTNy41NjEgOC40OTYgMy4wMjggMTMuMDI5TC4yIDEwLjIwMUEyNy45MTcgMjcuOTE3IDAgMCAxIDE5Ljk5OCAyYzMuNzc5IDAgNy40NDYuNzQxIDEwLjg5OSAyLjIwMXpNMTggMjhhMiAyIDAgMSAxIDMuOTk5LS4wMDFBMiAyIDAgMCAxIDE4IDI4elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IENyb3NzID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmNyb3NzPC90aXRsZT48cGF0aCBkPVwiTTMxLjcwOCAyNS43MDhMMjIgMTZsOS43MDgtOS43MDhhMSAxIDAgMCAwIDAtMS40MTRMMjcuMTIyLjI5MmExIDEgMCAwIDAtMS40MTQtLjAwMUwxNiA5Ljk5OSA2LjI5Mi4yOTFhLjk5OC45OTggMCAwIDAtMS40MTQuMDAxTC4yOTIgNC44NzhhMSAxIDAgMCAwIDAgMS40MTRMMTAgMTYgLjI5MiAyNS43MDhhLjk5OS45OTkgMCAwIDAgMCAxLjQxNGw0LjU4NiA0LjU4NmExIDEgMCAwIDAgMS40MTQgMEwxNiAyMmw5LjcwOCA5LjcwOGExIDEgMCAwIDAgMS40MTQgMGw0LjU4Ni00LjU4NmEuOTk5Ljk5OSAwIDAgMCAwLTEuNDE0elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEVtYmVkID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmVtYmVkPC90aXRsZT48cGF0aCBkPVwiTTE4IDIzbDMgMyAxMC0xMEwyMSA2bC0zIDMgNyA3ek0xNCA5bC0zLTNMMSAxNmwxMCAxMCAzLTMtNy03elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEVtYmVkMiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCI0MFwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCA0MCAzMlwiPjx0aXRsZT5lbWJlZDI8L3RpdGxlPjxwYXRoIGQ9XCJNMjYgMjNsMyAzIDEwLTEwTDI5IDZsLTMgMyA3IDd6TTE0IDlsLTMtM0wxIDE2bDEwIDEwIDMtMy03LTd6TTIxLjkxNiA0LjcwNGwyLjE3MS41OTItNiAyMi4wMDEtMi4xNzEtLjU5MiA2LTIyLjAwMXpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBFbmxhcmdlID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmVubGFyZ2U8L3RpdGxlPjxwYXRoIGQ9XCJNMzIgMEgxOWw1IDUtNiA2IDMgMyA2LTYgNSA1ek0zMiAzMlYxOWwtNSA1LTYtNi0zIDMgNiA2LTUgNXpNMCAzMmgxM2wtNS01IDYtNi0zLTMtNiA2LTUtNXpNMCAwdjEzbDUtNSA2IDYgMy0zLTYtNiA1LTV6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgRW5sYXJnZTIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+ZW5sYXJnZTI8L3RpdGxlPjxwYXRoIGQ9XCJNMzIgMzJIMTlsNS01LTYtNiAzLTMgNiA2IDUtNXpNMTEgMTRMNSA4bC01IDVWMGgxM0w4IDVsNiA2elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEVxdWFsaXplciA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5lcXVhbGl6ZXI8L3RpdGxlPjxwYXRoIGQ9XCJNMTQgNHYtLjVjMC0uODI1LS42NzUtMS41LTEuNS0xLjVoLTVDNi42NzUgMiA2IDIuNjc1IDYgMy41VjRIMHY0aDZ2LjVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWg1Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41VjhoMThWNEgxNHpNOCA4VjRoNHY0SDh6bTE4IDUuNWMwLS44MjUtLjY3NS0xLjUtMS41LTEuNWgtNWMtLjgyNSAwLTEuNS42NzUtMS41IDEuNXYuNUgwdjRoMTh2LjVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWg1Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41VjE4aDZ2LTRoLTZ2LS41ek0yMCAxOHYtNGg0djRoLTR6bS02IDUuNWMwLS44MjUtLjY3NS0xLjUtMS41LTEuNWgtNWMtLjgyNSAwLTEuNS42NzUtMS41IDEuNXYuNUgwdjRoNnYuNWMwIC44MjUuNjc1IDEuNSAxLjUgMS41aDVjLjgyNSAwIDEuNS0uNjc1IDEuNS0xLjVWMjhoMTh2LTRIMTR2LS41ek04IDI4di00aDR2NEg4elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEVxdWFsaXplcjIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+ZXF1YWxpemVyMjwvdGl0bGU+PHBhdGggZD1cIk0yOCAxNGguNWMuODI1IDAgMS41LS42NzUgMS41LTEuNXYtNWMwLS44MjUtLjY3NS0xLjUtMS41LTEuNUgyOFYwaC00djZoLS41Yy0uODI1IDAtMS41LjY3NS0xLjUgMS41djVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWguNXYxOGg0VjE0em0tNC02aDR2NGgtNFY4em0tNS41IDE4Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41di01YzAtLjgyNS0uNjc1LTEuNS0xLjUtMS41SDE4VjBoLTR2MThoLS41Yy0uODI1IDAtMS41LjY3NS0xLjUgMS41djVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWguNXY2aDR2LTZoLjV6TTE0IDIwaDR2NGgtNHYtNHptLTUuNS02Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41di01QzEwIDYuNjc1IDkuMzI1IDYgOC41IDZIOFYwSDR2NmgtLjVDMi42NzUgNiAyIDYuNjc1IDIgNy41djVjMCAuODI1LjY3NSAxLjUgMS41IDEuNUg0djE4aDRWMTRoLjV6TTQgOGg0djRINFY4elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEZpbHRlciA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5maWx0ZXI8L3RpdGxlPjxwYXRoIGQ9XCJNMTYgMEM3LjE2MyAwIDAgMi4yMzkgMCA1djNsMTIgMTJ2MTBjMCAxLjEwNSAxLjc5MSAyIDQgMnM0LS44OTUgNC0yVjIwTDMyIDhWNWMwLTIuNzYxLTcuMTYzLTUtMTYtNXpNMi45NSA0LjMzOGMuNzQ4LS40MjcgMS43OTktLjgzMiAzLjA0LTEuMTcxQzguNzM4IDIuNDE1IDEyLjI5MyAyIDE2LjAwMSAyczcuMjYyLjQxNCAxMC4wMTEgMS4xNjdjMS4yNDEuMzQgMi4yOTIuNzQ1IDMuMDQgMS4xNzEuNDk0LjI4MS43Ni41MTkuODg0LjY2Mi0uMTI0LjE0Mi0uMzkxLjM4LS44ODQuNjYyLS43NDguNDI3LTEuOC44MzItMy4wNCAxLjE3MUMyMy4yNjQgNy41ODUgMTkuNzA5IDggMTYuMDAxIDhTOC43MzkgNy41ODYgNS45OSA2LjgzM2MtMS4yNC0uMzQtMi4yOTItLjc0NS0zLjA0LTEuMTcxLS40OTQtLjI4Mi0uNzYtLjUxOS0uODg0LS42NjIuMTI0LS4xNDIuMzkxLS4zOC44ODQtLjY2MnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBGaXJlID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmZpcmU8L3RpdGxlPjxwYXRoIGQ9XCJNMTAuMDMxIDMyYy0yLjEzMy00LjQzOC0uOTk3LTYuOTgxLjY0Mi05LjM3NiAxLjc5NS0yLjYyNCAyLjI1OC01LjIyMSAyLjI1OC01LjIyMXMxLjQxMSAxLjgzNC44NDcgNC43MDNjMi40OTMtMi43NzUgMi45NjMtNy4xOTYgMi41ODctOC44ODlDMjIgMTcuMTU1IDI0LjQwOCAyNS42ODEgMjEuMTYzIDMyYzE3LjI2Mi05Ljc2NyA0LjI5NC0yNC4zOCAyLjAzNi0yNi4wMjcuNzUzIDEuNjQ2Ljg5NSA0LjQzMy0uNjI1IDUuNzg1QzIwLjAwMSAxLjk5OSAxMy42MzctLjAwMSAxMy42MzctLjAwMWMuNzUzIDUuMDMzLTIuNzI4IDEwLjUzNi02LjA4NCAxNC42NDgtLjExOC0yLjAwNy0uMjQzLTMuMzkyLTEuMjk4LTUuMzEyLS4yMzcgMy42NDYtMy4wMjMgNi42MTctMy43NzcgMTAuMjctMS4wMjIgNC45NDYuNzY1IDguNTY4IDcuNTU1IDEyLjM5NHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBGbGFnID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmZsYWc8L3RpdGxlPjxwYXRoIGQ9XCJNMCAwaDR2MzJIMFYwek0yNiAyMC4wOTRjMi41ODIgMCA0LjgzLS42MjUgNi0xLjU0N3YtMTZjLTEuMTcuOTIyLTMuNDE4IDEuNTQ3LTYgMS41NDdzLTQuODMtLjYyNS02LTEuNTQ3djE2YzEuMTcuOTIyIDMuNDE4IDEuNTQ3IDYgMS41NDd6TTE5IDEuMDE2QzE3LjUzNC4zOTMgMTUuMzkgMCAxMyAwIDkuOTg4IDAgNy4zNjUuNjI1IDYgMS41NDd2MTZDNy4zNjUgMTYuNjI1IDkuOTg4IDE2IDEzIDE2YzIuMzkgMCA0LjUzNC4zOTMgNiAxLjAxNnYtMTZ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgR2l0aHViID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmdpdGh1YjwvdGl0bGU+PHBhdGggZD1cIk0xNiAuMzk1Yy04LjgzNiAwLTE2IDcuMTYzLTE2IDE2IDAgNy4wNjkgNC41ODUgMTMuMDY3IDEwLjk0MiAxNS4xODIuOC4xNDggMS4wOTQtLjM0NyAxLjA5NC0uNzcgMC0uMzgxLS4wMTUtMS42NDItLjAyMi0yLjk3OS00LjQ1Mi45NjgtNS4zOTEtMS44ODgtNS4zOTEtMS44ODgtLjcyOC0xLjg0OS0xLjc3Ni0yLjM0MS0xLjc3Ni0yLjM0MS0xLjQ1Mi0uOTkzLjExLS45NzMuMTEtLjk3MyAxLjYwNi4xMTMgMi40NTIgMS42NDkgMi40NTIgMS42NDkgMS40MjcgMi40NDYgMy43NDMgMS43MzkgNC42NTYgMS4zMy4xNDMtMS4wMzQuNTU4LTEuNzQgMS4wMTYtMi4xNC0zLjU1NC0uNDA0LTcuMjktMS43NzctNy4yOS03LjkwNyAwLTEuNzQ3LjYyNS0zLjE3NCAxLjY0OS00LjI5NS0uMTY2LS40MDMtLjcxNC0yLjAzLjE1NS00LjIzNCAwIDAgMS4zNDQtLjQzIDQuNDAxIDEuNjRhMTUuMzUzIDE1LjM1MyAwIDAgMSA0LjAwNS0uNTM5YzEuMzU5LjAwNiAyLjcyOS4xODQgNC4wMDguNTM5IDMuMDU0LTIuMDcgNC4zOTUtMS42NCA0LjM5NS0xLjY0Ljg3MSAyLjIwNC4zMjMgMy44MzEuMTU3IDQuMjM0IDEuMDI2IDEuMTIgMS42NDcgMi41NDggMS42NDcgNC4yOTUgMCA2LjE0NS0zLjc0MyA3LjQ5OC03LjMwNiA3Ljg5NS41NzQuNDk3IDEuMDg1IDEuNDcgMS4wODUgMi45NjMgMCAyLjE0MS0uMDE5IDMuODY0LS4wMTkgNC4zOTEgMCAuNDI2LjI4OC45MjUgMS4wOTkuNzY4QzI3LjQyMSAyOS40NTcgMzIgMjMuNDYyIDMyIDE2LjM5NWMwLTguODM3LTcuMTY0LTE2LTE2LTE2elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEhhbW1lciA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5oYW1tZXI8L3RpdGxlPjxwYXRoIGQ9XCJNMzEuNTYyIDI1LjkwNWwtOS40MjMtOS40MjNhMS41MDUgMS41MDUgMCAwIDAtMi4xMjEgMGwtLjcwNy43MDctNS43NS01Ljc1TDIzIDJIMTNMOC41NjEgNi40MzkgOC4xMjIgNkg2LjAwMXYyLjEyMWwuNDM5LjQzOS02LjQzOSA2LjQzOSA1IDUgNi40MzktNi40MzkgNS43NSA1Ljc1LS43MDcuNzA3YTEuNTA1IDEuNTA1IDAgMCAwIDAgMi4xMjFsOS40MjMgOS40MjNhMS41MDUgMS41MDUgMCAwIDAgMi4xMjEgMGwzLjUzNS0zLjUzNWExLjUwNSAxLjUwNSAwIDAgMCAwLTIuMTIxelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IExpbmsgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+bGluazwvdGl0bGU+PHBhdGggZD1cIk0xMy43NTcgMTkuODY4YTEuNjIgMS42MiAwIDAgMS0xLjE0OS0uNDc2Yy0yLjk3My0yLjk3My0yLjk3My03LjgxIDAtMTAuNzgzbDYtNkMyMC4wNDggMS4xNjkgMjEuOTYzLjM3NiAyNCAuMzc2czMuOTUxLjc5MyA1LjM5MiAyLjIzM2MyLjk3MyAyLjk3MyAyLjk3MyA3LjgxIDAgMTAuNzgzbC0yLjc0MyAyLjc0M2ExLjYyNCAxLjYyNCAwIDEgMS0yLjI5OC0yLjI5OGwyLjc0My0yLjc0M2E0LjM4IDQuMzggMCAwIDAgMC02LjE4N2MtLjgyNi0uODI2LTEuOTI1LTEuMjgxLTMuMDk0LTEuMjgxcy0yLjI2Ny40NTUtMy4wOTQgMS4yODFsLTYgNmE0LjM4IDQuMzggMCAwIDAgMCA2LjE4NyAxLjYyNCAxLjYyNCAwIDAgMS0xLjE0OSAyLjc3NHpcIi8+PHBhdGggZD1cIk04IDMxLjYyNWE3LjU3NSA3LjU3NSAwIDAgMS01LjM5Mi0yLjIzM2MtMi45NzMtMi45NzMtMi45NzMtNy44MSAwLTEwLjc4M2wyLjc0My0yLjc0M2ExLjYyNCAxLjYyNCAwIDEgMSAyLjI5OCAyLjI5OGwtMi43NDMgMi43NDNhNC4zOCA0LjM4IDAgMCAwIDAgNi4xODdjLjgyNi44MjYgMS45MjUgMS4yODEgMy4wOTQgMS4yODFzMi4yNjctLjQ1NSAzLjA5NC0xLjI4MWw2LTZhNC4zOCA0LjM4IDAgMCAwIDAtNi4xODcgMS42MjQgMS42MjQgMCAxIDEgMi4yOTgtMi4yOThjMi45NzMgMi45NzMgMi45NzMgNy44MSAwIDEwLjc4M2wtNiA2QTcuNTc1IDcuNTc1IDAgMCAxIDggMzEuNjI1elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IExpc3QgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+bGlzdDwvdGl0bGU+PHBhdGggZD1cIk0wIDBoOHY4SDB6bTEyIDJoMjB2NEgxMnpNMCAxMmg4djhIMHptMTIgMmgyMHY0SDEyek0wIDI0aDh2OEgwem0xMiAyaDIwdjRIMTJ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgTG9jayA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5sb2NrPC90aXRsZT48cGF0aCBkPVwiTTE4LjUgMTRIMThWOGMwLTMuMzA4LTIuNjkyLTYtNi02SDhDNC42OTIgMiAyIDQuNjkyIDIgOHY2aC0uNWMtLjgyNSAwLTEuNS42NzUtMS41IDEuNXYxNWMwIC44MjUuNjc1IDEuNSAxLjUgMS41aDE3Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41di0xNWMwLS44MjUtLjY3NS0xLjUtMS41LTEuNXpNNiA4YzAtMS4xMDMuODk3LTIgMi0yaDRjMS4xMDMgMCAyIC44OTcgMiAydjZINlY4elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IE1lbnUyID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjQ0XCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDQ0IDMyXCI+PHRpdGxlPm1lbnUyPC90aXRsZT48cGF0aCBkPVwiTTAgNmgyOHY2SDBWNnptMCA4aDI4djZIMHYtNnptMCA4aDI4djZIMHYtNnpNMzEgMThsNiA2IDYtNnpNNDMgMTZsLTYtNi02IDZ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgTWV0ZXIyID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPm1ldGVyMjwvdGl0bGU+PHBhdGggZD1cIk0xNiAwQzcuMTYzIDAgMCA3LjE2MyAwIDE2czcuMTYzIDE2IDE2IDE2IDE2LTcuMTYzIDE2LTE2UzI0LjgzNyAwIDE2IDB6TTkuNDY0IDI2LjA2N0E4Ljk4IDguOTggMCAwIDAgMTAgMjNhOS4wMDIgOS4wMDIgMCAwIDAtNS45MTMtOC40NTYgMTEuOTEzIDExLjkxMyAwIDAgMSAzLjQyNy03LjAyOUM5Ljc4MSA1LjI0OSAxMi43OTQgNCAxNS45OTkgNHM2LjIxOSAxLjI0OCA4LjQ4NSAzLjUxNWExMS45MTQgMTEuOTE0IDAgMCAxIDMuNDI4IDcuMDI5IDkuMDAzIDkuMDAzIDAgMCAwLTUuMzc3IDExLjUyM0MyMC42MDcgMjcuMzI1IDE4LjM1NSAyOCAxNS45OTkgMjhzLTQuNjA4LS42NzUtNi41MzYtMS45MzN6bTcuNzc4LTYuMDM2Yy40MzQuMTA5Ljc1OC41MDMuNzU4Ljk2OXYyYzAgLjU1LS40NSAxLTEgMWgtMmMtLjU1IDAtMS0uNDUtMS0xdi0yYzAtLjQ2Ni4zMjQtLjg2Ljc1OC0uOTY5TDE1LjUgNmgxbC43NDIgMTQuMDMxelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IE5vdGlmaWNhdGlvbiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5ub3RpZmljYXRpb248L3RpdGxlPjxwYXRoIGQ9XCJNMTYgM2MtMy40NzIgMC02LjczNyAxLjM1Mi05LjE5MiAzLjgwOFMzIDEyLjUyOCAzIDE2YzAgMy40NzIgMS4zNTIgNi43MzcgMy44MDggOS4xOTJTMTIuNTI4IDI5IDE2IDI5YzMuNDcyIDAgNi43MzctMS4zNTIgOS4xOTItMy44MDhTMjkgMTkuNDcyIDI5IDE2YzAtMy40NzItMS4zNTItNi43MzctMy44MDgtOS4xOTJTMTkuNDcyIDMgMTYgM3ptMC0zYzguODM3IDAgMTYgNy4xNjMgMTYgMTZzLTcuMTYzIDE2LTE2IDE2UzAgMjQuODM3IDAgMTYgNy4xNjMgMCAxNiAwem0tMiAyMmg0djRoLTR6bTAtMTZoNHYxMmgtNHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBQaWVDaGFydCA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5waWUtY2hhcnQ8L3RpdGxlPjxwYXRoIGQ9XCJNMTQgMThWNEM2LjI2OCA0IDAgMTAuMjY4IDAgMThzNi4yNjggMTQgMTQgMTQgMTQtNi4yNjggMTQtMTRhMTMuOTQgMTMuOTQgMCAwIDAtMS40NzYtNi4yNjJMMTQgMTh6TTI4LjUyNCA3LjczOEMyNi4yMjUgMy4xNSAyMS40ODEgMCAxNiAwdjE0bDEyLjUyNC02LjI2MnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBQcmljZVRhZyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5wcmljZS10YWc8L3RpdGxlPjxwYXRoIGQ9XCJNMzAuNSAwaC0xMmMtLjgyNSAwLTEuOTc3LjQ3Ny0yLjU2MSAxLjA2MUwxLjA2IDE1Ljk0YTEuNTA1IDEuNTA1IDAgMCAwIDAgMi4xMjFMMTMuOTM5IDMwLjk0YTEuNTA1IDEuNTA1IDAgMCAwIDIuMTIxIDBsMTQuODc5LTE0Ljg3OUMzMS41MjIgMTUuNDc4IDMyIDE0LjMyNSAzMiAxMy41di0xMmMwLS44MjUtLjY3NS0xLjUtMS41LTEuNXpNMjMgMTJhMyAzIDAgMSAxIDAtNiAzIDMgMCAwIDEgMCA2elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFByaWNlVGFncyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCI0MFwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCA0MCAzMlwiPjx0aXRsZT5wcmljZS10YWdzPC90aXRsZT48cGF0aCBkPVwiTTM4LjUgMGgtMTJjLS44MjUgMC0xLjk3Ny40NzctMi41NjEgMS4wNjFMOS4wNiAxNS45NGExLjUwNSAxLjUwNSAwIDAgMCAwIDIuMTIxTDIxLjkzOSAzMC45NGExLjUwNSAxLjUwNSAwIDAgMCAyLjEyMSAwbDE0Ljg3OS0xNC44NzlDMzkuNTIyIDE1LjQ3OCA0MCAxNC4zMjUgNDAgMTMuNXYtMTJjMC0uODI1LS42NzUtMS41LTEuNS0xLjV6TTMxIDEyYTMgMyAwIDEgMSAwLTYgMyAzIDAgMCAxIDAgNnpcIi8+PHBhdGggZD1cIk00IDE3TDIxIDBoLTIuNWMtLjgyNSAwLTEuOTc3LjQ3Ny0yLjU2MSAxLjA2MUwxLjA2IDE1Ljk0YTEuNTA1IDEuNTA1IDAgMCAwIDAgMi4xMjFMMTMuOTM5IDMwLjk0YTEuNTA1IDEuNTA1IDAgMCAwIDIuMTIxIDBsLjkzOS0uOTM5LTEzLTEzelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFByb2ZpbGUgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+cHJvZmlsZTwvdGl0bGU+PHBhdGggZD1cIk0yNyAwSDNDMS4zNSAwIDAgMS4zNSAwIDN2MjZjMCAxLjY1IDEuMzUgMyAzIDNoMjRjMS42NSAwIDMtMS4zNSAzLTNWM2MwLTEuNjUtMS4zNS0zLTMtM3ptLTEgMjhINFY0aDIydjI0ek04IDE4aDE0djJIOHptMCA0aDE0djJIOHptMi0xM2EzIDMgMCAxIDEgNiAwIDMgMyAwIDAgMS02IDB6bTUgM2gtNGMtMS42NSAwLTMgLjktMyAydjJoMTB2LTJjMC0xLjEtMS4zNS0yLTMtMnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBTaGFyZTIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c2hhcmUyPC90aXRsZT48cGF0aCBkPVwiTTI3IDIyYTQuOTg1IDQuOTg1IDAgMCAwLTMuNTk0IDEuNTI2TDkuOTM3IDE2Ljc5MmE1LjAzNSA1LjAzNSAwIDAgMCAwLTEuNTgybDEzLjQ2OS02LjczNGE1IDUgMCAxIDAtMS4zNDMtMi42ODNMOC41OTQgMTIuNTI3QTUgNSAwIDEgMCA1IDIxLjAwMWE0Ljk4NSA0Ljk4NSAwIDAgMCAzLjU5NC0xLjUyNmwxMy40NjkgNi43MzRBNSA1IDAgMSAwIDI3IDIyelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFNpZ21hID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnNpZ21hPC90aXRsZT48cGF0aCBkPVwiTTI5LjQyNSAyMi45NkwzMC44MTIgMjBIMzJsLTIgMTJIMHYtMi4zMmwxMC4zNjEtMTIuMjI1TDAgNy4wOTRWMGgzMC42MjVMMzIgOGgtMS4wNzRsLS41ODUtMS4yMTVDMjkuMjM3IDQuNDkyIDI4LjQwNyA0IDI2IDRINS4zMTJsMTEuMDMzIDExLjAzM0w3LjA1MSAyNkgyNGMzLjYyNSAwIDQuNTgzLTEuMjk5IDUuNDI1LTMuMDR6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU29ydEFtb3VudEFzYyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5zb3J0LWFtb3VudC1hc2M8L3RpdGxlPjxwYXRoIGQ9XCJNMTAgMjRWMEg2djI0SDFsNyA3IDctN2gtNXpcIi8+PHBhdGggZD1cIk0xNCAxOGgxOHY0SDE0di00ek0xNCAxMmgxNHY0SDE0di00ek0xNCA2aDEwdjRIMTRWNnpNMTQgMGg2djRoLTZWMHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBTdGFyRW1wdHkgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c3Rhci1lbXB0eTwvdGl0bGU+PHBhdGggZD1cIk0zMiAxMi40MDhsLTExLjA1Ni0xLjYwN0wxNiAuNzgzbC00Ljk0NCAxMC4wMThMMCAxMi40MDhsOCA3Ljc5OC0xLjg4OSAxMS4wMTFMMTYgMjYuMDE4bDkuODg5IDUuMTk5TDI0IDIwLjIwNmw4LTcuNzk4ek0xNiAyMy41NDdsLTYuOTgzIDMuNjcxIDEuMzM0LTcuNzc2LTUuNjUtNS41MDcgNy44MDgtMS4xMzQgMy40OTItNy4wNzUgMy40OTIgNy4wNzUgNy44MDcgMS4xMzQtNS42NSA1LjUwNyAxLjMzNCA3Ljc3Ni02Ljk4My0zLjY3MXpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBTdGFyRnVsbCA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5zdGFyLWZ1bGw8L3RpdGxlPjxwYXRoIGQ9XCJNMzIgMTIuNDA4bC0xMS4wNTYtMS42MDdMMTYgLjc4M2wtNC45NDQgMTAuMDE4TDAgMTIuNDA4bDggNy43OTgtMS44ODkgMTEuMDExTDE2IDI2LjAxOGw5Ljg4OSA1LjE5OUwyNCAyMC4yMDZsOC03Ljc5OHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBTdGFyRnVsbDIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c3Rhci1mdWxsMjwvdGl0bGU+PHBhdGggZD1cIk0zMiAxMi40MDhsLTExLjA1Ni0xLjYwN0wxNiAuNzgzbC00Ljk0NCAxMC4wMThMMCAxMi40MDhsOCA3Ljc5OC0xLjg4OSAxMS4wMTFMMTYgMjYuMDE4bDkuODg5IDUuMTk5TDI0IDIwLjIwNmw4LTcuNzk4elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFN0YXRzQmFycyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5zdGF0cy1iYXJzPC90aXRsZT48cGF0aCBkPVwiTTAgMjZoMzJ2NEgwem00LThoNHY2SDR6bTYtOGg0djE0aC00em02IDZoNHY4aC00em02LTEyaDR2MjBoLTR6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU3RhdHNCYXJzMiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5zdGF0cy1iYXJzMjwvdGl0bGU+PHBhdGggZD1cIk05IDEySDNjLS41NSAwLTEgLjQ1LTEgMXYxOGMwIC41NS40NSAxIDEgMWg2Yy41NSAwIDEtLjQ1IDEtMVYxM2MwLS41NS0uNDUtMS0xLTF6bTAgMThIM3YtOGg2djh6TTE5IDhoLTZjLS41NSAwLTEgLjQ1LTEgMXYyMmMwIC41NS40NSAxIDEgMWg2Yy41NSAwIDEtLjQ1IDEtMVY5YzAtLjU1LS40NS0xLTEtMXptMCAyMmgtNlYyMGg2djEwek0yOSA0aC02Yy0uNTUgMC0xIC40NS0xIDF2MjZjMCAuNTUuNDUgMSAxIDFoNmMuNTUgMCAxLS40NSAxLTFWNWMwLS41NS0uNDUtMS0xLTF6bTAgMjZoLTZWMThoNnYxMnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBTdGF0c0RvdHMgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c3RhdHMtZG90czwvdGl0bGU+PHBhdGggZD1cIk00IDI4aDI4djRIMFYwaDR6bTUtMmEzIDMgMCAxIDEgLjI2Mi01Ljk4OGwzLjIyNS01LjM3NWEzIDMgMCAxIDEgNS4wMjYgMGwzLjIyNSA1LjM3NWEzLjIzOCAzLjIzOCAwIDAgMSAuNDYtLjAwNWw1LjMyNC05LjMxNmEzIDMgMCAxIDEgMi4yOCAxLjMwMmwtNS4zMjQgOS4zMTZhMyAzIDAgMSAxLTQuOTkxLjA1M2wtMy4yMjUtNS4zNzVjLS4wODYuMDA3LS4xNzQuMDEyLS4yNjIuMDEycy0uMTc2LS4wMDUtLjI2Mi0uMDEybC0zLjIyNSA1LjM3NUEzIDMgMCAwIDEgOSAyNS45OTl6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU3dpdGNoID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnN3aXRjaDwvdGl0bGU+PHBhdGggZD1cIk0yMCA0LjU4MVY4LjgzYTEwIDEwIDAgMCAxIDMuMDcxIDIuMDk5QzI0Ljk2IDEyLjgxOCAyNiAxNS4zMjkgMjYgMThzLTEuMDQgNS4xODItMi45MjkgNy4wNzFDMjEuMTgyIDI2Ljk2IDE4LjY3MSAyOCAxNiAyOHMtNS4xODItMS4wNC03LjA3MS0yLjkyOUM3LjA0IDIzLjE4MiA2IDIwLjY3MSA2IDE4czEuMDQtNS4xODIgMi45MjktNy4wNzFBOS45ODIgOS45ODIgMCAwIDEgMTIgOC44M1Y0LjU4MUM2LjIxNyA2LjMwMiAyIDExLjY1OCAyIDE4YzAgNy43MzIgNi4yNjggMTQgMTQgMTRzMTQtNi4yNjggMTQtMTRjMC02LjM0Mi00LjIxNy0xMS42OTgtMTAtMTMuNDE5ek0xNCAwaDR2MTZoLTR6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgVHJlZSA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT50cmVlPC90aXRsZT48cGF0aCBkPVwiTTMwLjUgMjRIMzB2LTYuNWMwLTEuOTMtMS41Ny0zLjUtMy41LTMuNUgxOHYtNGguNWMuODI1IDAgMS41LS42NzUgMS41LTEuNXYtNWMwLS44MjUtLjY3NS0xLjUtMS41LTEuNWgtNWMtLjgyNSAwLTEuNS42NzUtMS41IDEuNXY1YzAgLjgyNS42NzUgMS41IDEuNSAxLjVoLjV2NEg1LjVDMy41NyAxNCAyIDE1LjU3IDIgMTcuNVYyNGgtLjVjLS44MjUgMC0xLjUuNjc1LTEuNSAxLjV2NWMwIC44MjUuNjc1IDEuNSAxLjUgMS41aDVjLjgyNSAwIDEuNS0uNjc1IDEuNS0xLjV2LTVjMC0uODI1LS42NzUtMS41LTEuNS0xLjVINnYtNmg4djZoLS41Yy0uODI1IDAtMS41LjY3NS0xLjUgMS41djVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWg1Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41di01YzAtLjgyNS0uNjc1LTEuNS0xLjUtMS41SDE4di02aDh2NmgtLjVjLS44MjUgMC0xLjUuNjc1LTEuNSAxLjV2NWMwIC44MjUuNjc1IDEuNSAxLjUgMS41aDVjLjgyNSAwIDEuNS0uNjc1IDEuNS0xLjV2LTVjMC0uODI1LS42NzUtMS41LTEuNS0xLjV6TTYgMzBIMnYtNGg0djR6bTEyIDBoLTR2LTRoNHY0ek0xNCA4VjRoNHY0aC00em0xNiAyMmgtNHYtNGg0djR6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgVW5sb2NrZWQgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+dW5sb2NrZWQ8L3RpdGxlPjxwYXRoIGQ9XCJNMjQgMmMzLjMwOCAwIDYgMi42OTIgNiA2djZoLTRWOGMwLTEuMTAzLS44OTctMi0yLTJoLTRjLTEuMTAzIDAtMiAuODk3LTIgMnY2aC41Yy44MjUgMCAxLjUuNjc1IDEuNSAxLjV2MTVjMCAuODI1LS42NzUgMS41LTEuNSAxLjVoLTE3Qy42NzUgMzIgMCAzMS4zMjUgMCAzMC41di0xNWMwLS44MjUuNjc1LTEuNSAxLjUtMS41SDE0VjhjMC0zLjMwOCAyLjY5Mi02IDYtNmg0elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFVzZXJDaGVjayA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT51c2VyLWNoZWNrPC90aXRsZT48cGF0aCBkPVwiTTMwIDE5bC05IDktMy0zLTIgMiA1IDUgMTEtMTF6XCIvPjxwYXRoIGQ9XCJNMTQgMjRoMTB2LTMuNTk4Yy0yLjEwMS0xLjIyNS00Ljg4NS0yLjA2Ni04LTIuMzIxdi0xLjY0OWMyLjIwMy0xLjI0MiA0LTQuMzM3IDQtNy40MzIgMC00Ljk3MSAwLTktNi05UzggNC4wMjkgOCA5YzAgMy4wOTYgMS43OTcgNi4xOTEgNCA3LjQzMnYxLjY0OWMtNi43ODQuNTU1LTEyIDMuODg4LTEyIDcuOTE4aDE0di0yelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFVzZXIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+dXNlcjwvdGl0bGU+PHBhdGggZD1cIk0xOCAyMi4wODJ2LTEuNjQ5YzIuMjAzLTEuMjQxIDQtNC4zMzcgNC03LjQzMiAwLTQuOTcxIDAtOS02LTlzLTYgNC4wMjktNiA5YzAgMy4wOTYgMS43OTcgNi4xOTEgNCA3LjQzMnYxLjY0OUM3LjIxNiAyMi42MzcgMiAyNS45NyAyIDMwaDI4YzAtNC4wMy01LjIxNi03LjM2NC0xMi03LjkxOHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBVc2VycyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzNlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzNiAzMlwiPjx0aXRsZT51c2VyczwvdGl0bGU+PHBhdGggZD1cIk0yNCAyNC4wODJ2LTEuNjQ5YzIuMjAzLTEuMjQxIDQtNC4zMzcgNC03LjQzMiAwLTQuOTcxIDAtOS02LTlzLTYgNC4wMjktNiA5YzAgMy4wOTYgMS43OTcgNi4xOTEgNCA3LjQzMnYxLjY0OUMxMy4yMTYgMjQuNjM3IDggMjcuOTcgOCAzMmgyOGMwLTQuMDMtNS4yMTYtNy4zNjQtMTItNy45MTh6XCIvPjxwYXRoIGQ9XCJNMTAuMjI1IDI0Ljg1NGMxLjcyOC0xLjEzIDMuODc3LTEuOTg5IDYuMjQzLTIuNTEzYTExLjMzIDExLjMzIDAgMCAxLTEuMjY1LTEuODQ0Yy0uOTUtMS43MjYtMS40NTMtMy42MjctMS40NTMtNS40OTcgMC0yLjY4OSAwLTUuMjI4Ljk1Ni03LjMwNS45MjgtMi4wMTYgMi41OTgtMy4yNjUgNC45NzYtMy43MzRDMTkuMTUzIDEuNTcxIDE3Ljc0NiAwIDE0IDAgOCAwIDggNC4wMjkgOCA5YzAgMy4wOTYgMS43OTcgNi4xOTEgNCA3LjQzMnYxLjY0OWMtNi43ODQuNTU1LTEyIDMuODg4LTEyIDcuOTE4aDguNzE5Yy40NTQtLjQwMy45NTYtLjc4NyAxLjUwNi0xLjE0NnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBXYXJuaW5nID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPndhcm5pbmc8L3RpdGxlPjxwYXRoIGQ9XCJNMTYgMi44OTlsMTMuNDA5IDI2LjcyNkgyLjU5TDE1Ljk5OSAyLjg5OXpNMTYgMGMtLjY5IDAtMS4zNzkuNDY1LTEuOTAzIDEuMzk1TC40MzggMjguNjE3Qy0uNjA4IDMwLjQ3Ny4yODIgMzIgMi40MTYgMzJoMjcuMTY2YzIuMTM0IDAgMy4wMjUtMS41MjIgMS45NzgtMy4zODNMMTcuOTAxIDEuMzk1QzE3LjM3OC40NjUgMTYuNjg4IDAgMTUuOTk4IDB6XCIvPjxwYXRoIGQ9XCJNMTggMjZhMiAyIDAgMSAxLTMuOTk5LjAwMUEyIDIgMCAwIDEgMTggMjZ6TTE2IDIyYTIgMiAwIDAgMS0yLTJ2LTZhMiAyIDAgMSAxIDQgMHY2YTIgMiAwIDAgMS0yIDJ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgV3JlbmNoID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPndyZW5jaDwvdGl0bGU+PHBhdGggZD1cIk0zMS4zNDIgMjUuNTU5TDE2Ljk1IDEzLjIyM0E5IDkgMCAwIDAgNi4zODcuMzg3bDUuMiA1LjJhMi4wMDUgMi4wMDUgMCAwIDEgMCAyLjgyOGwtMy4xNzIgMy4xNzJhMi4wMDUgMi4wMDUgMCAwIDEtMi44MjggMGwtNS4yLTUuMkE5IDkgMCAwIDAgMTMuMjIzIDE2Ljk1bDEyLjMzNiAxNC4zOTJhMS44MjggMS44MjggMCAwIDAgMi43MTYuMTA0bDMuMTcyLTMuMTcyYy43NzgtLjc3OC43MzEtMi0uMTA0LTIuNzE2elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IHtDcm9zc30gZnJvbSAnLi4vY29tcG9uZW50cy9pY29ucyc7XG5cbmNvbnN0IG1vZGFsID0gQ29tcCA9PiBwcm9wcyA9PiB7XG4gIGNvbnN0IHtpc09wZW4sIGNsb3NlTW9kYWwsIHRpdGxlfSA9IHByb3BzO1xuICBjb25zdCBvbktleURvd24gPSAoe2NvZGV9KSA9PiB7XG4gICAgaWYgKGNvZGUgPT09ICdFc2NhcGUnKSB7XG4gICAgICBjbG9zZU1vZGFsKCk7XG4gICAgfVxuICB9O1xuXG4gIHJldHVybiAoPGRpdiBhcmlhLWhpZGRlbj17U3RyaW5nKCFpc09wZW4pfSBvbktleURvd249e29uS2V5RG93bn0gY2xhc3M9XCJtb2RhbFwiPlxuICAgIDxoZWFkZXI+XG4gICAgICA8aDI+e3RpdGxlfTwvaDI+XG4gICAgICA8YnV0dG9uIG9uQ2xpY2s9e2Nsb3NlTW9kYWx9PjxDcm9zcz48L0Nyb3NzPjwvYnV0dG9uPlxuICAgIDwvaGVhZGVyPlxuICAgIDxkaXYgY2xhc3M9XCJibHVycnktYmFja2dyb3VuZFwiPjwvZGl2PlxuICAgIDxDb21wIHsuLi5wcm9wc30vPlxuICA8L2Rpdj4pXG59O1xuXG5leHBvcnQgZGVmYXVsdCBtb2RhbDsiLCJpbXBvcnQge2gsIG9uTW91bnQsIHdpdGhTdGF0ZX0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IG1vZGFsIGZyb20gJy4vTW9kYWwnO1xuaW1wb3J0IHtjb21wb3NlfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHtUcmVlLCBTdGFyRnVsbCwgTm90aWZpY2F0aW9uLCBVc2VycywgRW1iZWQyfSBmcm9tICcuLi9jb21wb25lbnRzL2ljb25zJztcblxuY29uc3QgYXV0b2ZvY3VzID0gb25Nb3VudCgodm5vZGUpID0+IHtcbiAgdm5vZGUuZG9tLmZvY3VzKCk7XG59KTtcbmNvbnN0IEF1dG9mb2N1c0lucHV0ID0gYXV0b2ZvY3VzKHByb3BzID0+IHtcbiAgZGVsZXRlIHByb3BzLmNoaWxkcmVuO1xuICByZXR1cm4gPGlucHV0IHsuLi5wcm9wc30gLz5cbn0pO1xuY29uc3Qgc3RhdGVmdWxsTW9kYWwgPSBjb21wb3NlKHdpdGhTdGF0ZSwgbW9kYWwpO1xuXG5jb25zdCBTb3VyY2VUeXBlU2VsZWN0ID0gcHJvcHMgPT4ge1xuICBjb25zdCB7b25VcGRhdGV9ID0gcHJvcHM7XG4gIGNvbnN0IGNoYW5nZVZhbHVlID0gZXYgPT4gb25VcGRhdGUoe3NvdXJjZTogZXYudGFyZ2V0LnZhbHVlfSk7XG4gIHJldHVybiA8ZmllbGRzZXQ+XG4gICAgPGxlZ2VuZD5TZWxlY3QgYSBkYXRhIHNvdXJjZTo8L2xlZ2VuZD5cbiAgICA8ZGl2PlxuICAgICAgPGxhYmVsPlxuICAgICAgICA8aW5wdXQgcmVxdWlyZWQgY2xhc3M9XCJ2aXN1YWxseWhpZGRlblwiIG9uQ2hhbmdlPXtjaGFuZ2VWYWx1ZX0gdmFsdWU9XCJpc3N1ZXNcIiBuYW1lPVwic291cmNlVHlwZVwiIHR5cGU9XCJyYWRpb1wiLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhbHVlLWljb25cIj5cbiAgICAgICAgICA8Tm90aWZpY2F0aW9uLz5cbiAgICAgICAgICA8c3Bhbj5Jc3N1ZXM8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPGlucHV0IHJlcXVpcmVkIGNsYXNzPVwidmlzdWFsbHloaWRkZW5cIiBvbkNoYW5nZT17Y2hhbmdlVmFsdWV9IHZhbHVlPVwicHJzXCIgbmFtZT1cInNvdXJjZVR5cGVcIiB0eXBlPVwicmFkaW9cIi8+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJ2YWx1ZS1pY29uXCI+XG4gICAgICAgICAgPFRyZWUvPlxuICAgICAgICAgIDxzcGFuPlB1bGwgcmVxdWVzdHM8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPGlucHV0IHJlcXVpcmVkIG9uQ2hhbmdlPXtjaGFuZ2VWYWx1ZX0gY2xhc3M9XCJ2aXN1YWxseWhpZGRlblwiIHZhbHVlPVwic3RhcmdhemVyc1wiIG5hbWU9XCJzb3VyY2VUeXBlXCJcbiAgICAgICAgICAgICAgIHR5cGU9XCJyYWRpb1wiLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhbHVlLWljb25cIj5cbiAgICAgICAgICA8U3RhckZ1bGwvPlxuICAgICAgICAgIDxzcGFuPlN0YXJnYXplcnM8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPGlucHV0IHJlcXVpcmVkIG9uQ2hhbmdlPXtjaGFuZ2VWYWx1ZX0gY2xhc3M9XCJ2aXN1YWxseWhpZGRlblwiIHZhbHVlPVwiY29udHJpYnV0b3JzXCIgbmFtZT1cInNvdXJjZVR5cGVcIlxuICAgICAgICAgICAgICAgdHlwZT1cInJhZGlvXCIvPlxuICAgICAgICA8ZGl2IGNsYXNzPVwidmFsdWUtaWNvblwiPlxuICAgICAgICAgIDxVc2Vycy8+XG4gICAgICAgICAgPHNwYW4+Q29udHJpYnV0b3JzPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvbGFiZWw+XG4gICAgICA8bGFiZWw+XG4gICAgICAgIDxpbnB1dCByZXF1aXJlZCBvbkNoYW5nZT17Y2hhbmdlVmFsdWV9IGNsYXNzPVwidmlzdWFsbHloaWRkZW5cIiB2YWx1ZT1cImNvbW1pdHNcIiBuYW1lPVwic291cmNlVHlwZVwiIHR5cGU9XCJyYWRpb1wiLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhbHVlLWljb25cIj5cbiAgICAgICAgICA8RW1iZWQyLz5cbiAgICAgICAgICA8c3Bhbj5Db21taXRzPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvbGFiZWw+XG4gICAgPC9kaXY+XG4gIDwvZmllbGRzZXQ+XG59O1xuXG5leHBvcnQgY29uc3QgQ3JlYXRlU21hcnRMaXN0Rm9ybSA9IChwcm9wcykgPT4ge1xuICBjb25zdCB7b25VcGRhdGUsIG9uU3VibWl0fSA9IHByb3BzO1xuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XG4gICAgICA8Zm9ybSBvblN1Ym1pdD17b25TdWJtaXR9PlxuICAgICAgICA8bGFiZWw+XG4gICAgICAgICAgPHNwYW4+UGFuZWwgdGl0bGU6PC9zcGFuPlxuICAgICAgICAgIDxBdXRvZm9jdXNJbnB1dCBvbkNoYW5nZT17ZXYgPT4gb25VcGRhdGUoe3RpdGxlOiBldi50YXJnZXQudmFsdWV9KX0gbmFtZT1cInRpdGxlXCIgcmVxdWlyZWQ9XCJ0cnVlXCIvPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8U291cmNlVHlwZVNlbGVjdCB7Li4ucHJvcHN9Lz5cbiAgICAgICAgPGJ1dHRvbj5DcmVhdGU8L2J1dHRvbj5cbiAgICAgIDwvZm9ybT5cbiAgICA8L2Rpdj4pO1xufTtcblxuZXhwb3J0IGNvbnN0IENyZWF0ZVNtYXJ0Q2hhcnRGb3JtID0gcHJvcHMgPT4ge1xuICBjb25zdCB7b25TdWJtaXQsIG9uVXBkYXRlfSA9IHByb3BzO1xuICByZXR1cm4gPGRpdiBjbGFzcz1cIm1vZGFsLWNvbnRlbnRcIj5cbiAgICA8Zm9ybSBvblN1Ym1pdD17b25TdWJtaXR9PlxuICAgICAgPGxhYmVsPlxuICAgICAgICA8c3Bhbj5QYW5lbCB0aXRsZTo8L3NwYW4+XG4gICAgICAgIDxBdXRvZm9jdXNJbnB1dCBvbkNoYW5nZT17ZXYgPT4gb25VcGRhdGUoe3RpdGxlOiBldi50YXJnZXQudmFsdWV9KX0gbmFtZT1cInRpdGxlXCIgcmVxdWlyZWQ9XCJ0cnVlXCIvPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxidXR0b24+Q3JlYXRlPC9idXR0b24+XG4gICAgPC9mb3JtPlxuICA8L2Rpdj47XG59O1xuXG5jb25zdCBtb2RhbEZvcm0gPSBDb21wID0+IHByb3BzID0+IHtcbiAgY29uc3QgVWRwYXRhYmxlQ29tcCA9IHN0YXRlZnVsbE1vZGFsKChwcm9wcywgdXBkYXRlKSA9PiB7XG4gICAgY29uc3Qge2RhdGF9ID0gcHJvcHM7XG4gICAgY29uc3Qgb25VcGRhdGUgPSB2YWwgPT4ge1xuICAgICAgT2JqZWN0LmFzc2lnbihkYXRhLCB2YWwpO1xuICAgICAgdXBkYXRlKHtkYXRhLCAuLi5wcm9wc30pO1xuICAgIH07XG4gICAgcmV0dXJuIENvbXAoe29uVXBkYXRlLCAuLi5wcm9wc30pO1xuICB9KTtcbiAgcmV0dXJuIFVkcGF0YWJsZUNvbXAocHJvcHMpO1xufTtcblxuZXhwb3J0IGNvbnN0IENyZWF0ZVNtYXJ0TGlzdERhdGFQYW5lbCA9IG1vZGFsRm9ybShDcmVhdGVTbWFydExpc3RGb3JtKTtcbmV4cG9ydCBjb25zdCBDcmVhdGVTbWFydENoYXJ0RGF0YVBhbmVsID0gbW9kYWxGb3JtKENyZWF0ZVNtYXJ0Q2hhcnRGb3JtKVxuXG4iLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcbmltcG9ydCB7Q3JlYXRlU21hcnRMaXN0RGF0YVBhbmVsLCBDcmVhdGVTbWFydENoYXJ0RGF0YVBhbmVsfSBmcm9tICcuLi92aWV3cy9FZGl0RGF0YVBhbmVsRm9ybSc7XG5cbmNvbnN0IENyZWF0ZURhdGFQYW5lbCA9IChDb21wLCBkZWZhdWx0RGF0YSkgPT4gKHByb3BzLCB7YWN0aW9uc30pID0+IHtcbiAgY29uc3Qge3gsIHksIGRhdGEgPSBkZWZhdWx0RGF0YX0gPSBwcm9wcztcbiAgY29uc3Qgb25TdWJtaXQgPSBldiA9PiB7XG4gICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICBhY3Rpb25zLnVwZGF0ZVBhbmVsRGF0YSh7eCwgeSwgZGF0YX0pO1xuICAgIGFjdGlvbnMuY2xvc2VNb2RhbCgpO1xuICB9O1xuICByZXR1cm4gQ29tcCh7ZGF0YSwgY2xvc2VNb2RhbDogYWN0aW9ucy5jbG9zZU1vZGFsLCBvblN1Ym1pdCwgLi4ucHJvcHN9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBDcmVhdGVTbWFydExpc3RNb2RhbCA9IENyZWF0ZURhdGFQYW5lbChDcmVhdGVTbWFydExpc3REYXRhUGFuZWwsIHt0eXBlOiAnbGlzdCcsIHNob3dUb29sQmFyOiB0cnVlfSk7XG5cbmV4cG9ydCBjb25zdCBDcmVhdGVTbWFydENoYXJ0TW9kYWwgPSBDcmVhdGVEYXRhUGFuZWwoQ3JlYXRlU21hcnRDaGFydERhdGFQYW5lbCwge3R5cGU6J2NoYXJ0Jywgc2hvd1Rvb2xCYXI6dHJ1ZX0pO1xuXG5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IG1vZGFsIGZyb20gJy4vTW9kYWwnO1xuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMpID0+IHtcbiAgY29uc3Qge2Nsb3NlTW9kYWwsIGV4ZWN1dGVBY3Rpb24sIG1lc3NhZ2V9ID0gcHJvcHM7XG4gIGNvbnN0IGNvbmZpcm0gPSBfID0+IHtcbiAgICBjbG9zZU1vZGFsKCk7XG4gICAgZXhlY3V0ZUFjdGlvbigpO1xuICB9O1xuICBjb25zdCBDb21wID0gbW9kYWwocHJvcHMgPT5cbiAgICA8ZGl2PlxuICAgICAgPHA+e21lc3NhZ2V9PC9wPlxuICAgICAgPGRpdj5cbiAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtjb25maXJtfT5Db25maXJtPC9idXR0b24+XG4gICAgICAgIDxidXR0b24gb25DbGljaz17Y2xvc2VNb2RhbH0+Q2FuY2VsPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj4pO1xuICByZXR1cm4gQ29tcCh7dGl0bGU6ICdBdHRlbnRpb24gIScsIC4uLnByb3BzfSk7XG59OyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IENvbWZpcm1hdGlvbk1vZGFsIGZyb20gJy4uL3ZpZXdzL0NvbmZpcm1hdGlvbk1vZGFsJztcblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzLCB7YWN0aW9uc30pID0+IDxDb21maXJtYXRpb25Nb2RhbCBjbG9zZU1vZGFsPXthY3Rpb25zLmNsb3NlTW9kYWx9IHsuLi5wcm9wc30gLz5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IHtDcmVhdGVTbWFydExpc3RNb2RhbCwgQ3JlYXRlU21hcnRDaGFydE1vZGFsfSBmcm9tICcuL0VkaXRQYW5lbERhdGFNb2RhbCc7XG5pbXBvcnQgQ29uZmlybWF0aW9uTW9kYWwgZnJvbSAnLi9Db25maXJtYXRpb25Nb2RhbCc7XG5pbXBvcnQge2RlZmF1bHQgYXMgTW9kYWxWaWV3fSAgZnJvbSAnLi4vdmlld3MvTW9kYWwnO1xuXG5cbmV4cG9ydCBjb25zdCBFbXB0eU1vZGFsID0gTW9kYWxWaWV3KChwcm9wcykgPT4ge1xuICAgIHJldHVybiA8ZGl2PjwvZGl2Pjtcbn0pO1xuXG5jb25zdCBnZXRNb2RhbENvbXBvbmVudCA9IChtb2RhbFR5cGUpID0+IHtcbiAgc3dpdGNoIChtb2RhbFR5cGUpIHtcbiAgICBjYXNlICdjcmVhdGVTbWFydExpc3RQYW5lbERhdGEnOlxuICAgICAgcmV0dXJuIENyZWF0ZVNtYXJ0TGlzdE1vZGFsO1xuICAgIGNhc2UgJ2NyZWF0ZVNtYXJ0Q2hhcnRQYW5lbERhdGEnOlxuICAgICAgcmV0dXJuIENyZWF0ZVNtYXJ0Q2hhcnRNb2RhbDtcbiAgICBjYXNlICdhc2tDb25maXJtYXRpb24nOlxuICAgICAgcmV0dXJuIENvbmZpcm1hdGlvbk1vZGFsO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gRW1wdHlNb2RhbDtcbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgTW9kYWwgPSAocHJvcHMsIHNlcnZpY2VzKSA9PiB7XG4gIGNvbnN0IHttb2RhbFR5cGV9ID0gcHJvcHM7XG4gIGNvbnN0IE1vZGFsQ29tcG9uZW50ID0gZ2V0TW9kYWxDb21wb25lbnQobW9kYWxUeXBlKTtcbiAgcmV0dXJuIE1vZGFsQ29tcG9uZW50KHByb3BzLCBzZXJ2aWNlcyk7XG59OyIsImNvbnN0IGFjdGlvbkNyZWF0b3IgPSBhY3Rpb25OYW1lID0+IG9wdHMgPT4gKE9iamVjdC5hc3NpZ24oe3R5cGU6IGFjdGlvbk5hbWV9LCBvcHRzKSlcblxuZXhwb3J0IGNvbnN0IGRyYWdPdmVyID0gYWN0aW9uQ3JlYXRvcignRFJBR19PVkVSJyk7XG5leHBvcnQgY29uc3QgZW5kUmVzaXplID0gYWN0aW9uQ3JlYXRvcignRU5EX1JFU0laRScpO1xuZXhwb3J0IGNvbnN0IHN0YXJ0UmVzaXplID0gYWN0aW9uQ3JlYXRvcignU1RBUlRfUkVTSVpFJyk7XG5leHBvcnQgY29uc3Qgc3RhcnRNb3ZlID0gYWN0aW9uQ3JlYXRvcignU1RBUlRfTU9WRScpO1xuZXhwb3J0IGNvbnN0IGVuZE1vdmUgPSBhY3Rpb25DcmVhdG9yKCdFTkRfTU9WRScpO1xuZXhwb3J0IGNvbnN0IG9wZW5Nb2RhbCA9IGFjdGlvbkNyZWF0b3IoJ09QRU5fTU9EQUwnKTtcbmV4cG9ydCBjb25zdCBjbG9zZU1vZGFsID0gYWN0aW9uQ3JlYXRvcignQ0xPU0VfTU9EQUwnKTtcbmV4cG9ydCBjb25zdCB1cGRhdGVQYW5lbERhdGEgPSBhY3Rpb25DcmVhdG9yKCdVUERBVEVfUEFORUxfREFUQScpO1xuZXhwb3J0IGNvbnN0IHVwZGF0ZVNtYXJ0TGlzdCA9IGFjdGlvbkNyZWF0b3IoJ1VQREFURV9TTUFSVF9MSVNUJyk7XG5leHBvcnQgY29uc3QgY3JlYXRlU21hcnRMaXN0ID0gYWN0aW9uQ3JlYXRvcignQ1JFQVRFX1NNQVJUX0xJU1QnKTtcbmV4cG9ydCBjb25zdCByZXNldFBhbmVsID0gYWN0aW9uQ3JlYXRvcignUkVTRVRfUEFORUwnKTtcbmV4cG9ydCBjb25zdCByZW1vdmVTbWFydExpc3QgPSBhY3Rpb25DcmVhdG9yKCdSRU1PVkVfU01BUlRfTElTVCcpOyIsIi8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgZ2xvYmFsYCBmcm9tIE5vZGUuanMuICovXG52YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsICYmIGdsb2JhbC5PYmplY3QgPT09IE9iamVjdCAmJiBnbG9iYWw7XG5cbmV4cG9ydCBkZWZhdWx0IGZyZWVHbG9iYWw7XG4iLCJpbXBvcnQgZnJlZUdsb2JhbCBmcm9tICcuL19mcmVlR2xvYmFsLmpzJztcblxuLyoqIERldGVjdCBmcmVlIHZhcmlhYmxlIGBzZWxmYC4gKi9cbnZhciBmcmVlU2VsZiA9IHR5cGVvZiBzZWxmID09ICdvYmplY3QnICYmIHNlbGYgJiYgc2VsZi5PYmplY3QgPT09IE9iamVjdCAmJiBzZWxmO1xuXG4vKiogVXNlZCBhcyBhIHJlZmVyZW5jZSB0byB0aGUgZ2xvYmFsIG9iamVjdC4gKi9cbnZhciByb290ID0gZnJlZUdsb2JhbCB8fCBmcmVlU2VsZiB8fCBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuXG5leHBvcnQgZGVmYXVsdCByb290O1xuIiwiaW1wb3J0IHJvb3QgZnJvbSAnLi9fcm9vdC5qcyc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIFN5bWJvbCA9IHJvb3QuU3ltYm9sO1xuXG5leHBvcnQgZGVmYXVsdCBTeW1ib2w7XG4iLCJpbXBvcnQgU3ltYm9sIGZyb20gJy4vX1N5bWJvbC5qcyc7XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZVxuICogW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzcuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBuYXRpdmVPYmplY3RUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBzeW1Ub1N0cmluZ1RhZyA9IFN5bWJvbCA/IFN5bWJvbC50b1N0cmluZ1RhZyA6IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VHZXRUYWdgIHdoaWNoIGlnbm9yZXMgYFN5bWJvbC50b1N0cmluZ1RhZ2AgdmFsdWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHJhdyBgdG9TdHJpbmdUYWdgLlxuICovXG5mdW5jdGlvbiBnZXRSYXdUYWcodmFsdWUpIHtcbiAgdmFyIGlzT3duID0gaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgc3ltVG9TdHJpbmdUYWcpLFxuICAgICAgdGFnID0gdmFsdWVbc3ltVG9TdHJpbmdUYWddO1xuXG4gIHRyeSB7XG4gICAgdmFsdWVbc3ltVG9TdHJpbmdUYWddID0gdW5kZWZpbmVkO1xuICAgIHZhciB1bm1hc2tlZCA9IHRydWU7XG4gIH0gY2F0Y2ggKGUpIHt9XG5cbiAgdmFyIHJlc3VsdCA9IG5hdGl2ZU9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICBpZiAodW5tYXNrZWQpIHtcbiAgICBpZiAoaXNPd24pIHtcbiAgICAgIHZhbHVlW3N5bVRvU3RyaW5nVGFnXSA9IHRhZztcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIHZhbHVlW3N5bVRvU3RyaW5nVGFnXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZ2V0UmF3VGFnO1xuIiwiLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlXG4gKiBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNy4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG5hdGl2ZU9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ29udmVydHMgYHZhbHVlYCB0byBhIHN0cmluZyB1c2luZyBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNvbnZlcnQuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBjb252ZXJ0ZWQgc3RyaW5nLlxuICovXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyh2YWx1ZSkge1xuICByZXR1cm4gbmF0aXZlT2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IG9iamVjdFRvU3RyaW5nO1xuIiwiaW1wb3J0IFN5bWJvbCBmcm9tICcuL19TeW1ib2wuanMnO1xuaW1wb3J0IGdldFJhd1RhZyBmcm9tICcuL19nZXRSYXdUYWcuanMnO1xuaW1wb3J0IG9iamVjdFRvU3RyaW5nIGZyb20gJy4vX29iamVjdFRvU3RyaW5nLmpzJztcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIG51bGxUYWcgPSAnW29iamVjdCBOdWxsXScsXG4gICAgdW5kZWZpbmVkVGFnID0gJ1tvYmplY3QgVW5kZWZpbmVkXSc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIHN5bVRvU3RyaW5nVGFnID0gU3ltYm9sID8gU3ltYm9sLnRvU3RyaW5nVGFnIDogdW5kZWZpbmVkO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBnZXRUYWdgIHdpdGhvdXQgZmFsbGJhY2tzIGZvciBidWdneSBlbnZpcm9ubWVudHMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHF1ZXJ5LlxuICogQHJldHVybnMge3N0cmluZ30gUmV0dXJucyB0aGUgYHRvU3RyaW5nVGFnYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUdldFRhZyh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkVGFnIDogbnVsbFRhZztcbiAgfVxuICByZXR1cm4gKHN5bVRvU3RyaW5nVGFnICYmIHN5bVRvU3RyaW5nVGFnIGluIE9iamVjdCh2YWx1ZSkpXG4gICAgPyBnZXRSYXdUYWcodmFsdWUpXG4gICAgOiBvYmplY3RUb1N0cmluZyh2YWx1ZSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGJhc2VHZXRUYWc7XG4iLCIvKipcbiAqIENyZWF0ZXMgYSB1bmFyeSBmdW5jdGlvbiB0aGF0IGludm9rZXMgYGZ1bmNgIHdpdGggaXRzIGFyZ3VtZW50IHRyYW5zZm9ybWVkLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byB3cmFwLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gdHJhbnNmb3JtIFRoZSBhcmd1bWVudCB0cmFuc2Zvcm0uXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gb3ZlckFyZyhmdW5jLCB0cmFuc2Zvcm0pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGFyZykge1xuICAgIHJldHVybiBmdW5jKHRyYW5zZm9ybShhcmcpKTtcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgb3ZlckFyZztcbiIsImltcG9ydCBvdmVyQXJnIGZyb20gJy4vX292ZXJBcmcuanMnO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBnZXRQcm90b3R5cGUgPSBvdmVyQXJnKE9iamVjdC5nZXRQcm90b3R5cGVPZiwgT2JqZWN0KTtcblxuZXhwb3J0IGRlZmF1bHQgZ2V0UHJvdG90eXBlO1xuIiwiLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZS4gQSB2YWx1ZSBpcyBvYmplY3QtbGlrZSBpZiBpdCdzIG5vdCBgbnVsbGBcbiAqIGFuZCBoYXMgYSBgdHlwZW9mYCByZXN1bHQgb2YgXCJvYmplY3RcIi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZSwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZSh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdExpa2UoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShfLm5vb3ApO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgIT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCc7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGlzT2JqZWN0TGlrZTtcbiIsImltcG9ydCBiYXNlR2V0VGFnIGZyb20gJy4vX2Jhc2VHZXRUYWcuanMnO1xuaW1wb3J0IGdldFByb3RvdHlwZSBmcm9tICcuL19nZXRQcm90b3R5cGUuanMnO1xuaW1wb3J0IGlzT2JqZWN0TGlrZSBmcm9tICcuL2lzT2JqZWN0TGlrZS5qcyc7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RUYWcgPSAnW29iamVjdCBPYmplY3RdJztcblxuLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNQcm90byA9IEZ1bmN0aW9uLnByb3RvdHlwZSxcbiAgICBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9ucy4gKi9cbnZhciBmdW5jVG9TdHJpbmcgPSBmdW5jUHJvdG8udG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKiBVc2VkIHRvIGluZmVyIHRoZSBgT2JqZWN0YCBjb25zdHJ1Y3Rvci4gKi9cbnZhciBvYmplY3RDdG9yU3RyaW5nID0gZnVuY1RvU3RyaW5nLmNhbGwoT2JqZWN0KTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHBsYWluIG9iamVjdCwgdGhhdCBpcywgYW4gb2JqZWN0IGNyZWF0ZWQgYnkgdGhlXG4gKiBgT2JqZWN0YCBjb25zdHJ1Y3RvciBvciBvbmUgd2l0aCBhIGBbW1Byb3RvdHlwZV1dYCBvZiBgbnVsbGAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBzaW5jZSAwLjguMFxuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBwbGFpbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogfVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChuZXcgRm9vKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc1BsYWluT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdCh7ICd4JzogMCwgJ3knOiAwIH0pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChPYmplY3QuY3JlYXRlKG51bGwpKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaXNQbGFpbk9iamVjdCh2YWx1ZSkge1xuICBpZiAoIWlzT2JqZWN0TGlrZSh2YWx1ZSkgfHwgYmFzZUdldFRhZyh2YWx1ZSkgIT0gb2JqZWN0VGFnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciBwcm90byA9IGdldFByb3RvdHlwZSh2YWx1ZSk7XG4gIGlmIChwcm90byA9PT0gbnVsbCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHZhciBDdG9yID0gaGFzT3duUHJvcGVydHkuY2FsbChwcm90bywgJ2NvbnN0cnVjdG9yJykgJiYgcHJvdG8uY29uc3RydWN0b3I7XG4gIHJldHVybiB0eXBlb2YgQ3RvciA9PSAnZnVuY3Rpb24nICYmIEN0b3IgaW5zdGFuY2VvZiBDdG9yICYmXG4gICAgZnVuY1RvU3RyaW5nLmNhbGwoQ3RvcikgPT0gb2JqZWN0Q3RvclN0cmluZztcbn1cblxuZXhwb3J0IGRlZmF1bHQgaXNQbGFpbk9iamVjdDtcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHN5bWJvbE9ic2VydmFibGVQb255ZmlsbChyb290KSB7XG5cdHZhciByZXN1bHQ7XG5cdHZhciBTeW1ib2wgPSByb290LlN5bWJvbDtcblxuXHRpZiAodHlwZW9mIFN5bWJvbCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdGlmIChTeW1ib2wub2JzZXJ2YWJsZSkge1xuXHRcdFx0cmVzdWx0ID0gU3ltYm9sLm9ic2VydmFibGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IFN5bWJvbCgnb2JzZXJ2YWJsZScpO1xuXHRcdFx0U3ltYm9sLm9ic2VydmFibGUgPSByZXN1bHQ7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJlc3VsdCA9ICdAQG9ic2VydmFibGUnO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn07XG4iLCIvKiBnbG9iYWwgd2luZG93ICovXG5pbXBvcnQgcG9ueWZpbGwgZnJvbSAnLi9wb255ZmlsbCc7XG5cbnZhciByb290O1xuXG5pZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7XG4gIHJvb3QgPSBzZWxmO1xufSBlbHNlIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gZ2xvYmFsO1xufSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gbW9kdWxlO1xufSBlbHNlIHtcbiAgcm9vdCA9IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG59XG5cbnZhciByZXN1bHQgPSBwb255ZmlsbChyb290KTtcbmV4cG9ydCBkZWZhdWx0IHJlc3VsdDtcbiIsImltcG9ydCBpc1BsYWluT2JqZWN0IGZyb20gJ2xvZGFzaC1lcy9pc1BsYWluT2JqZWN0JztcbmltcG9ydCAkJG9ic2VydmFibGUgZnJvbSAnc3ltYm9sLW9ic2VydmFibGUnO1xuXG4vKipcbiAqIFRoZXNlIGFyZSBwcml2YXRlIGFjdGlvbiB0eXBlcyByZXNlcnZlZCBieSBSZWR1eC5cbiAqIEZvciBhbnkgdW5rbm93biBhY3Rpb25zLCB5b3UgbXVzdCByZXR1cm4gdGhlIGN1cnJlbnQgc3RhdGUuXG4gKiBJZiB0aGUgY3VycmVudCBzdGF0ZSBpcyB1bmRlZmluZWQsIHlvdSBtdXN0IHJldHVybiB0aGUgaW5pdGlhbCBzdGF0ZS5cbiAqIERvIG5vdCByZWZlcmVuY2UgdGhlc2UgYWN0aW9uIHR5cGVzIGRpcmVjdGx5IGluIHlvdXIgY29kZS5cbiAqL1xuZXhwb3J0IHZhciBBY3Rpb25UeXBlcyA9IHtcbiAgSU5JVDogJ0BAcmVkdXgvSU5JVCdcblxuICAvKipcbiAgICogQ3JlYXRlcyBhIFJlZHV4IHN0b3JlIHRoYXQgaG9sZHMgdGhlIHN0YXRlIHRyZWUuXG4gICAqIFRoZSBvbmx5IHdheSB0byBjaGFuZ2UgdGhlIGRhdGEgaW4gdGhlIHN0b3JlIGlzIHRvIGNhbGwgYGRpc3BhdGNoKClgIG9uIGl0LlxuICAgKlxuICAgKiBUaGVyZSBzaG91bGQgb25seSBiZSBhIHNpbmdsZSBzdG9yZSBpbiB5b3VyIGFwcC4gVG8gc3BlY2lmeSBob3cgZGlmZmVyZW50XG4gICAqIHBhcnRzIG9mIHRoZSBzdGF0ZSB0cmVlIHJlc3BvbmQgdG8gYWN0aW9ucywgeW91IG1heSBjb21iaW5lIHNldmVyYWwgcmVkdWNlcnNcbiAgICogaW50byBhIHNpbmdsZSByZWR1Y2VyIGZ1bmN0aW9uIGJ5IHVzaW5nIGBjb21iaW5lUmVkdWNlcnNgLlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSByZWR1Y2VyIEEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBuZXh0IHN0YXRlIHRyZWUsIGdpdmVuXG4gICAqIHRoZSBjdXJyZW50IHN0YXRlIHRyZWUgYW5kIHRoZSBhY3Rpb24gdG8gaGFuZGxlLlxuICAgKlxuICAgKiBAcGFyYW0ge2FueX0gW3ByZWxvYWRlZFN0YXRlXSBUaGUgaW5pdGlhbCBzdGF0ZS4gWW91IG1heSBvcHRpb25hbGx5IHNwZWNpZnkgaXRcbiAgICogdG8gaHlkcmF0ZSB0aGUgc3RhdGUgZnJvbSB0aGUgc2VydmVyIGluIHVuaXZlcnNhbCBhcHBzLCBvciB0byByZXN0b3JlIGFcbiAgICogcHJldmlvdXNseSBzZXJpYWxpemVkIHVzZXIgc2Vzc2lvbi5cbiAgICogSWYgeW91IHVzZSBgY29tYmluZVJlZHVjZXJzYCB0byBwcm9kdWNlIHRoZSByb290IHJlZHVjZXIgZnVuY3Rpb24sIHRoaXMgbXVzdCBiZVxuICAgKiBhbiBvYmplY3Qgd2l0aCB0aGUgc2FtZSBzaGFwZSBhcyBgY29tYmluZVJlZHVjZXJzYCBrZXlzLlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZW5oYW5jZXJdIFRoZSBzdG9yZSBlbmhhbmNlci4gWW91IG1heSBvcHRpb25hbGx5IHNwZWNpZnkgaXRcbiAgICogdG8gZW5oYW5jZSB0aGUgc3RvcmUgd2l0aCB0aGlyZC1wYXJ0eSBjYXBhYmlsaXRpZXMgc3VjaCBhcyBtaWRkbGV3YXJlLFxuICAgKiB0aW1lIHRyYXZlbCwgcGVyc2lzdGVuY2UsIGV0Yy4gVGhlIG9ubHkgc3RvcmUgZW5oYW5jZXIgdGhhdCBzaGlwcyB3aXRoIFJlZHV4XG4gICAqIGlzIGBhcHBseU1pZGRsZXdhcmUoKWAuXG4gICAqXG4gICAqIEByZXR1cm5zIHtTdG9yZX0gQSBSZWR1eCBzdG9yZSB0aGF0IGxldHMgeW91IHJlYWQgdGhlIHN0YXRlLCBkaXNwYXRjaCBhY3Rpb25zXG4gICAqIGFuZCBzdWJzY3JpYmUgdG8gY2hhbmdlcy5cbiAgICovXG59O2V4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNyZWF0ZVN0b3JlKHJlZHVjZXIsIHByZWxvYWRlZFN0YXRlLCBlbmhhbmNlcikge1xuICB2YXIgX3JlZjI7XG5cbiAgaWYgKHR5cGVvZiBwcmVsb2FkZWRTdGF0ZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgZW5oYW5jZXIgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgZW5oYW5jZXIgPSBwcmVsb2FkZWRTdGF0ZTtcbiAgICBwcmVsb2FkZWRTdGF0ZSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICh0eXBlb2YgZW5oYW5jZXIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKHR5cGVvZiBlbmhhbmNlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCB0aGUgZW5oYW5jZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZW5oYW5jZXIoY3JlYXRlU3RvcmUpKHJlZHVjZXIsIHByZWxvYWRlZFN0YXRlKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgcmVkdWNlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgdGhlIHJlZHVjZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgfVxuXG4gIHZhciBjdXJyZW50UmVkdWNlciA9IHJlZHVjZXI7XG4gIHZhciBjdXJyZW50U3RhdGUgPSBwcmVsb2FkZWRTdGF0ZTtcbiAgdmFyIGN1cnJlbnRMaXN0ZW5lcnMgPSBbXTtcbiAgdmFyIG5leHRMaXN0ZW5lcnMgPSBjdXJyZW50TGlzdGVuZXJzO1xuICB2YXIgaXNEaXNwYXRjaGluZyA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGVuc3VyZUNhbk11dGF0ZU5leHRMaXN0ZW5lcnMoKSB7XG4gICAgaWYgKG5leHRMaXN0ZW5lcnMgPT09IGN1cnJlbnRMaXN0ZW5lcnMpIHtcbiAgICAgIG5leHRMaXN0ZW5lcnMgPSBjdXJyZW50TGlzdGVuZXJzLnNsaWNlKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlYWRzIHRoZSBzdGF0ZSB0cmVlIG1hbmFnZWQgYnkgdGhlIHN0b3JlLlxuICAgKlxuICAgKiBAcmV0dXJucyB7YW55fSBUaGUgY3VycmVudCBzdGF0ZSB0cmVlIG9mIHlvdXIgYXBwbGljYXRpb24uXG4gICAqL1xuICBmdW5jdGlvbiBnZXRTdGF0ZSgpIHtcbiAgICByZXR1cm4gY3VycmVudFN0YXRlO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgYSBjaGFuZ2UgbGlzdGVuZXIuIEl0IHdpbGwgYmUgY2FsbGVkIGFueSB0aW1lIGFuIGFjdGlvbiBpcyBkaXNwYXRjaGVkLFxuICAgKiBhbmQgc29tZSBwYXJ0IG9mIHRoZSBzdGF0ZSB0cmVlIG1heSBwb3RlbnRpYWxseSBoYXZlIGNoYW5nZWQuIFlvdSBtYXkgdGhlblxuICAgKiBjYWxsIGBnZXRTdGF0ZSgpYCB0byByZWFkIHRoZSBjdXJyZW50IHN0YXRlIHRyZWUgaW5zaWRlIHRoZSBjYWxsYmFjay5cbiAgICpcbiAgICogWW91IG1heSBjYWxsIGBkaXNwYXRjaCgpYCBmcm9tIGEgY2hhbmdlIGxpc3RlbmVyLCB3aXRoIHRoZSBmb2xsb3dpbmdcbiAgICogY2F2ZWF0czpcbiAgICpcbiAgICogMS4gVGhlIHN1YnNjcmlwdGlvbnMgYXJlIHNuYXBzaG90dGVkIGp1c3QgYmVmb3JlIGV2ZXJ5IGBkaXNwYXRjaCgpYCBjYWxsLlxuICAgKiBJZiB5b3Ugc3Vic2NyaWJlIG9yIHVuc3Vic2NyaWJlIHdoaWxlIHRoZSBsaXN0ZW5lcnMgYXJlIGJlaW5nIGludm9rZWQsIHRoaXNcbiAgICogd2lsbCBub3QgaGF2ZSBhbnkgZWZmZWN0IG9uIHRoZSBgZGlzcGF0Y2goKWAgdGhhdCBpcyBjdXJyZW50bHkgaW4gcHJvZ3Jlc3MuXG4gICAqIEhvd2V2ZXIsIHRoZSBuZXh0IGBkaXNwYXRjaCgpYCBjYWxsLCB3aGV0aGVyIG5lc3RlZCBvciBub3QsIHdpbGwgdXNlIGEgbW9yZVxuICAgKiByZWNlbnQgc25hcHNob3Qgb2YgdGhlIHN1YnNjcmlwdGlvbiBsaXN0LlxuICAgKlxuICAgKiAyLiBUaGUgbGlzdGVuZXIgc2hvdWxkIG5vdCBleHBlY3QgdG8gc2VlIGFsbCBzdGF0ZSBjaGFuZ2VzLCBhcyB0aGUgc3RhdGVcbiAgICogbWlnaHQgaGF2ZSBiZWVuIHVwZGF0ZWQgbXVsdGlwbGUgdGltZXMgZHVyaW5nIGEgbmVzdGVkIGBkaXNwYXRjaCgpYCBiZWZvcmVcbiAgICogdGhlIGxpc3RlbmVyIGlzIGNhbGxlZC4gSXQgaXMsIGhvd2V2ZXIsIGd1YXJhbnRlZWQgdGhhdCBhbGwgc3Vic2NyaWJlcnNcbiAgICogcmVnaXN0ZXJlZCBiZWZvcmUgdGhlIGBkaXNwYXRjaCgpYCBzdGFydGVkIHdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGxhdGVzdFxuICAgKiBzdGF0ZSBieSB0aGUgdGltZSBpdCBleGl0cy5cbiAgICpcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgQSBjYWxsYmFjayB0byBiZSBpbnZva2VkIG9uIGV2ZXJ5IGRpc3BhdGNoLlxuICAgKiBAcmV0dXJucyB7RnVuY3Rpb259IEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoaXMgY2hhbmdlIGxpc3RlbmVyLlxuICAgKi9cbiAgZnVuY3Rpb24gc3Vic2NyaWJlKGxpc3RlbmVyKSB7XG4gICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBsaXN0ZW5lciB0byBiZSBhIGZ1bmN0aW9uLicpO1xuICAgIH1cblxuICAgIHZhciBpc1N1YnNjcmliZWQgPSB0cnVlO1xuXG4gICAgZW5zdXJlQ2FuTXV0YXRlTmV4dExpc3RlbmVycygpO1xuICAgIG5leHRMaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gdW5zdWJzY3JpYmUoKSB7XG4gICAgICBpZiAoIWlzU3Vic2NyaWJlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlzU3Vic2NyaWJlZCA9IGZhbHNlO1xuXG4gICAgICBlbnN1cmVDYW5NdXRhdGVOZXh0TGlzdGVuZXJzKCk7XG4gICAgICB2YXIgaW5kZXggPSBuZXh0TGlzdGVuZXJzLmluZGV4T2YobGlzdGVuZXIpO1xuICAgICAgbmV4dExpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRGlzcGF0Y2hlcyBhbiBhY3Rpb24uIEl0IGlzIHRoZSBvbmx5IHdheSB0byB0cmlnZ2VyIGEgc3RhdGUgY2hhbmdlLlxuICAgKlxuICAgKiBUaGUgYHJlZHVjZXJgIGZ1bmN0aW9uLCB1c2VkIHRvIGNyZWF0ZSB0aGUgc3RvcmUsIHdpbGwgYmUgY2FsbGVkIHdpdGggdGhlXG4gICAqIGN1cnJlbnQgc3RhdGUgdHJlZSBhbmQgdGhlIGdpdmVuIGBhY3Rpb25gLiBJdHMgcmV0dXJuIHZhbHVlIHdpbGxcbiAgICogYmUgY29uc2lkZXJlZCB0aGUgKipuZXh0Kiogc3RhdGUgb2YgdGhlIHRyZWUsIGFuZCB0aGUgY2hhbmdlIGxpc3RlbmVyc1xuICAgKiB3aWxsIGJlIG5vdGlmaWVkLlxuICAgKlxuICAgKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvbmx5IHN1cHBvcnRzIHBsYWluIG9iamVjdCBhY3Rpb25zLiBJZiB5b3Ugd2FudCB0b1xuICAgKiBkaXNwYXRjaCBhIFByb21pc2UsIGFuIE9ic2VydmFibGUsIGEgdGh1bmssIG9yIHNvbWV0aGluZyBlbHNlLCB5b3UgbmVlZCB0b1xuICAgKiB3cmFwIHlvdXIgc3RvcmUgY3JlYXRpbmcgZnVuY3Rpb24gaW50byB0aGUgY29ycmVzcG9uZGluZyBtaWRkbGV3YXJlLiBGb3JcbiAgICogZXhhbXBsZSwgc2VlIHRoZSBkb2N1bWVudGF0aW9uIGZvciB0aGUgYHJlZHV4LXRodW5rYCBwYWNrYWdlLiBFdmVuIHRoZVxuICAgKiBtaWRkbGV3YXJlIHdpbGwgZXZlbnR1YWxseSBkaXNwYXRjaCBwbGFpbiBvYmplY3QgYWN0aW9ucyB1c2luZyB0aGlzIG1ldGhvZC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IGFjdGlvbiBBIHBsYWluIG9iamVjdCByZXByZXNlbnRpbmcg4oCcd2hhdCBjaGFuZ2Vk4oCdLiBJdCBpc1xuICAgKiBhIGdvb2QgaWRlYSB0byBrZWVwIGFjdGlvbnMgc2VyaWFsaXphYmxlIHNvIHlvdSBjYW4gcmVjb3JkIGFuZCByZXBsYXkgdXNlclxuICAgKiBzZXNzaW9ucywgb3IgdXNlIHRoZSB0aW1lIHRyYXZlbGxpbmcgYHJlZHV4LWRldnRvb2xzYC4gQW4gYWN0aW9uIG11c3QgaGF2ZVxuICAgKiBhIGB0eXBlYCBwcm9wZXJ0eSB3aGljaCBtYXkgbm90IGJlIGB1bmRlZmluZWRgLiBJdCBpcyBhIGdvb2QgaWRlYSB0byB1c2VcbiAgICogc3RyaW5nIGNvbnN0YW50cyBmb3IgYWN0aW9uIHR5cGVzLlxuICAgKlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBGb3IgY29udmVuaWVuY2UsIHRoZSBzYW1lIGFjdGlvbiBvYmplY3QgeW91IGRpc3BhdGNoZWQuXG4gICAqXG4gICAqIE5vdGUgdGhhdCwgaWYgeW91IHVzZSBhIGN1c3RvbSBtaWRkbGV3YXJlLCBpdCBtYXkgd3JhcCBgZGlzcGF0Y2goKWAgdG9cbiAgICogcmV0dXJuIHNvbWV0aGluZyBlbHNlIChmb3IgZXhhbXBsZSwgYSBQcm9taXNlIHlvdSBjYW4gYXdhaXQpLlxuICAgKi9cbiAgZnVuY3Rpb24gZGlzcGF0Y2goYWN0aW9uKSB7XG4gICAgaWYgKCFpc1BsYWluT2JqZWN0KGFjdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWN0aW9ucyBtdXN0IGJlIHBsYWluIG9iamVjdHMuICcgKyAnVXNlIGN1c3RvbSBtaWRkbGV3YXJlIGZvciBhc3luYyBhY3Rpb25zLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgYWN0aW9uLnR5cGUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FjdGlvbnMgbWF5IG5vdCBoYXZlIGFuIHVuZGVmaW5lZCBcInR5cGVcIiBwcm9wZXJ0eS4gJyArICdIYXZlIHlvdSBtaXNzcGVsbGVkIGEgY29uc3RhbnQ/Jyk7XG4gICAgfVxuXG4gICAgaWYgKGlzRGlzcGF0Y2hpbmcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUmVkdWNlcnMgbWF5IG5vdCBkaXNwYXRjaCBhY3Rpb25zLicpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBpc0Rpc3BhdGNoaW5nID0gdHJ1ZTtcbiAgICAgIGN1cnJlbnRTdGF0ZSA9IGN1cnJlbnRSZWR1Y2VyKGN1cnJlbnRTdGF0ZSwgYWN0aW9uKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaXNEaXNwYXRjaGluZyA9IGZhbHNlO1xuICAgIH1cblxuICAgIHZhciBsaXN0ZW5lcnMgPSBjdXJyZW50TGlzdGVuZXJzID0gbmV4dExpc3RlbmVycztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3RlbmVycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGxpc3RlbmVyID0gbGlzdGVuZXJzW2ldO1xuICAgICAgbGlzdGVuZXIoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYWN0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcGxhY2VzIHRoZSByZWR1Y2VyIGN1cnJlbnRseSB1c2VkIGJ5IHRoZSBzdG9yZSB0byBjYWxjdWxhdGUgdGhlIHN0YXRlLlxuICAgKlxuICAgKiBZb3UgbWlnaHQgbmVlZCB0aGlzIGlmIHlvdXIgYXBwIGltcGxlbWVudHMgY29kZSBzcGxpdHRpbmcgYW5kIHlvdSB3YW50IHRvXG4gICAqIGxvYWQgc29tZSBvZiB0aGUgcmVkdWNlcnMgZHluYW1pY2FsbHkuIFlvdSBtaWdodCBhbHNvIG5lZWQgdGhpcyBpZiB5b3VcbiAgICogaW1wbGVtZW50IGEgaG90IHJlbG9hZGluZyBtZWNoYW5pc20gZm9yIFJlZHV4LlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0UmVkdWNlciBUaGUgcmVkdWNlciBmb3IgdGhlIHN0b3JlIHRvIHVzZSBpbnN0ZWFkLlxuICAgKiBAcmV0dXJucyB7dm9pZH1cbiAgICovXG4gIGZ1bmN0aW9uIHJlcGxhY2VSZWR1Y2VyKG5leHRSZWR1Y2VyKSB7XG4gICAgaWYgKHR5cGVvZiBuZXh0UmVkdWNlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCB0aGUgbmV4dFJlZHVjZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICBjdXJyZW50UmVkdWNlciA9IG5leHRSZWR1Y2VyO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogQWN0aW9uVHlwZXMuSU5JVCB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnRlcm9wZXJhYmlsaXR5IHBvaW50IGZvciBvYnNlcnZhYmxlL3JlYWN0aXZlIGxpYnJhcmllcy5cbiAgICogQHJldHVybnMge29ic2VydmFibGV9IEEgbWluaW1hbCBvYnNlcnZhYmxlIG9mIHN0YXRlIGNoYW5nZXMuXG4gICAqIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWUgdGhlIG9ic2VydmFibGUgcHJvcG9zYWw6XG4gICAqIGh0dHBzOi8vZ2l0aHViLmNvbS90YzM5L3Byb3Bvc2FsLW9ic2VydmFibGVcbiAgICovXG4gIGZ1bmN0aW9uIG9ic2VydmFibGUoKSB7XG4gICAgdmFyIF9yZWY7XG5cbiAgICB2YXIgb3V0ZXJTdWJzY3JpYmUgPSBzdWJzY3JpYmU7XG4gICAgcmV0dXJuIF9yZWYgPSB7XG4gICAgICAvKipcbiAgICAgICAqIFRoZSBtaW5pbWFsIG9ic2VydmFibGUgc3Vic2NyaXB0aW9uIG1ldGhvZC5cbiAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvYnNlcnZlciBBbnkgb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgYXMgYW4gb2JzZXJ2ZXIuXG4gICAgICAgKiBUaGUgb2JzZXJ2ZXIgb2JqZWN0IHNob3VsZCBoYXZlIGEgYG5leHRgIG1ldGhvZC5cbiAgICAgICAqIEByZXR1cm5zIHtzdWJzY3JpcHRpb259IEFuIG9iamVjdCB3aXRoIGFuIGB1bnN1YnNjcmliZWAgbWV0aG9kIHRoYXQgY2FuXG4gICAgICAgKiBiZSB1c2VkIHRvIHVuc3Vic2NyaWJlIHRoZSBvYnNlcnZhYmxlIGZyb20gdGhlIHN0b3JlLCBhbmQgcHJldmVudCBmdXJ0aGVyXG4gICAgICAgKiBlbWlzc2lvbiBvZiB2YWx1ZXMgZnJvbSB0aGUgb2JzZXJ2YWJsZS5cbiAgICAgICAqL1xuICAgICAgc3Vic2NyaWJlOiBmdW5jdGlvbiBzdWJzY3JpYmUob2JzZXJ2ZXIpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYnNlcnZlciAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCB0aGUgb2JzZXJ2ZXIgdG8gYmUgYW4gb2JqZWN0LicpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb2JzZXJ2ZVN0YXRlKCkge1xuICAgICAgICAgIGlmIChvYnNlcnZlci5uZXh0KSB7XG4gICAgICAgICAgICBvYnNlcnZlci5uZXh0KGdldFN0YXRlKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG9ic2VydmVTdGF0ZSgpO1xuICAgICAgICB2YXIgdW5zdWJzY3JpYmUgPSBvdXRlclN1YnNjcmliZShvYnNlcnZlU3RhdGUpO1xuICAgICAgICByZXR1cm4geyB1bnN1YnNjcmliZTogdW5zdWJzY3JpYmUgfTtcbiAgICAgIH1cbiAgICB9LCBfcmVmWyQkb2JzZXJ2YWJsZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LCBfcmVmO1xuICB9XG5cbiAgLy8gV2hlbiBhIHN0b3JlIGlzIGNyZWF0ZWQsIGFuIFwiSU5JVFwiIGFjdGlvbiBpcyBkaXNwYXRjaGVkIHNvIHRoYXQgZXZlcnlcbiAgLy8gcmVkdWNlciByZXR1cm5zIHRoZWlyIGluaXRpYWwgc3RhdGUuIFRoaXMgZWZmZWN0aXZlbHkgcG9wdWxhdGVzXG4gIC8vIHRoZSBpbml0aWFsIHN0YXRlIHRyZWUuXG4gIGRpc3BhdGNoKHsgdHlwZTogQWN0aW9uVHlwZXMuSU5JVCB9KTtcblxuICByZXR1cm4gX3JlZjIgPSB7XG4gICAgZGlzcGF0Y2g6IGRpc3BhdGNoLFxuICAgIHN1YnNjcmliZTogc3Vic2NyaWJlLFxuICAgIGdldFN0YXRlOiBnZXRTdGF0ZSxcbiAgICByZXBsYWNlUmVkdWNlcjogcmVwbGFjZVJlZHVjZXJcbiAgfSwgX3JlZjJbJCRvYnNlcnZhYmxlXSA9IG9ic2VydmFibGUsIF9yZWYyO1xufSIsIi8qKlxuICogUHJpbnRzIGEgd2FybmluZyBpbiB0aGUgY29uc29sZSBpZiBpdCBleGlzdHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIHdhcm5pbmcgbWVzc2FnZS5cbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiB3YXJuaW5nKG1lc3NhZ2UpIHtcbiAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBjb25zb2xlLmVycm9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY29uc29sZS5lcnJvcihtZXNzYWdlKTtcbiAgfVxuICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgdHJ5IHtcbiAgICAvLyBUaGlzIGVycm9yIHdhcyB0aHJvd24gYXMgYSBjb252ZW5pZW5jZSBzbyB0aGF0IGlmIHlvdSBlbmFibGVcbiAgICAvLyBcImJyZWFrIG9uIGFsbCBleGNlcHRpb25zXCIgaW4geW91ciBjb25zb2xlLFxuICAgIC8vIGl0IHdvdWxkIHBhdXNlIHRoZSBleGVjdXRpb24gYXQgdGhpcyBsaW5lLlxuICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1lbXB0eSAqL1xuICB9IGNhdGNoIChlKSB7fVxuICAvKiBlc2xpbnQtZW5hYmxlIG5vLWVtcHR5ICovXG59IiwiLyoqXG4gKiBDb21wb3NlcyBzaW5nbGUtYXJndW1lbnQgZnVuY3Rpb25zIGZyb20gcmlnaHQgdG8gbGVmdC4gVGhlIHJpZ2h0bW9zdFxuICogZnVuY3Rpb24gY2FuIHRha2UgbXVsdGlwbGUgYXJndW1lbnRzIGFzIGl0IHByb3ZpZGVzIHRoZSBzaWduYXR1cmUgZm9yXG4gKiB0aGUgcmVzdWx0aW5nIGNvbXBvc2l0ZSBmdW5jdGlvbi5cbiAqXG4gKiBAcGFyYW0gey4uLkZ1bmN0aW9ufSBmdW5jcyBUaGUgZnVuY3Rpb25zIHRvIGNvbXBvc2UuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IEEgZnVuY3Rpb24gb2J0YWluZWQgYnkgY29tcG9zaW5nIHRoZSBhcmd1bWVudCBmdW5jdGlvbnNcbiAqIGZyb20gcmlnaHQgdG8gbGVmdC4gRm9yIGV4YW1wbGUsIGNvbXBvc2UoZiwgZywgaCkgaXMgaWRlbnRpY2FsIHRvIGRvaW5nXG4gKiAoLi4uYXJncykgPT4gZihnKGgoLi4uYXJncykpKS5cbiAqL1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb21wb3NlKCkge1xuICBmb3IgKHZhciBfbGVuID0gYXJndW1lbnRzLmxlbmd0aCwgZnVuY3MgPSBBcnJheShfbGVuKSwgX2tleSA9IDA7IF9rZXkgPCBfbGVuOyBfa2V5KyspIHtcbiAgICBmdW5jc1tfa2V5XSA9IGFyZ3VtZW50c1tfa2V5XTtcbiAgfVxuXG4gIGlmIChmdW5jcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKGFyZykge1xuICAgICAgcmV0dXJuIGFyZztcbiAgICB9O1xuICB9XG5cbiAgaWYgKGZ1bmNzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmdW5jc1swXTtcbiAgfVxuXG4gIHJldHVybiBmdW5jcy5yZWR1Y2UoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGEoYi5hcHBseSh1bmRlZmluZWQsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH0pO1xufSIsInZhciBfZXh0ZW5kcyA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gKHRhcmdldCkgeyBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykgeyB2YXIgc291cmNlID0gYXJndW1lbnRzW2ldOyBmb3IgKHZhciBrZXkgaW4gc291cmNlKSB7IGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc291cmNlLCBrZXkpKSB7IHRhcmdldFtrZXldID0gc291cmNlW2tleV07IH0gfSB9IHJldHVybiB0YXJnZXQ7IH07XG5cbmltcG9ydCBjb21wb3NlIGZyb20gJy4vY29tcG9zZSc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0b3JlIGVuaGFuY2VyIHRoYXQgYXBwbGllcyBtaWRkbGV3YXJlIHRvIHRoZSBkaXNwYXRjaCBtZXRob2RcbiAqIG9mIHRoZSBSZWR1eCBzdG9yZS4gVGhpcyBpcyBoYW5keSBmb3IgYSB2YXJpZXR5IG9mIHRhc2tzLCBzdWNoIGFzIGV4cHJlc3NpbmdcbiAqIGFzeW5jaHJvbm91cyBhY3Rpb25zIGluIGEgY29uY2lzZSBtYW5uZXIsIG9yIGxvZ2dpbmcgZXZlcnkgYWN0aW9uIHBheWxvYWQuXG4gKlxuICogU2VlIGByZWR1eC10aHVua2AgcGFja2FnZSBhcyBhbiBleGFtcGxlIG9mIHRoZSBSZWR1eCBtaWRkbGV3YXJlLlxuICpcbiAqIEJlY2F1c2UgbWlkZGxld2FyZSBpcyBwb3RlbnRpYWxseSBhc3luY2hyb25vdXMsIHRoaXMgc2hvdWxkIGJlIHRoZSBmaXJzdFxuICogc3RvcmUgZW5oYW5jZXIgaW4gdGhlIGNvbXBvc2l0aW9uIGNoYWluLlxuICpcbiAqIE5vdGUgdGhhdCBlYWNoIG1pZGRsZXdhcmUgd2lsbCBiZSBnaXZlbiB0aGUgYGRpc3BhdGNoYCBhbmQgYGdldFN0YXRlYCBmdW5jdGlvbnNcbiAqIGFzIG5hbWVkIGFyZ3VtZW50cy5cbiAqXG4gKiBAcGFyYW0gey4uLkZ1bmN0aW9ufSBtaWRkbGV3YXJlcyBUaGUgbWlkZGxld2FyZSBjaGFpbiB0byBiZSBhcHBsaWVkLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBBIHN0b3JlIGVuaGFuY2VyIGFwcGx5aW5nIHRoZSBtaWRkbGV3YXJlLlxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBhcHBseU1pZGRsZXdhcmUoKSB7XG4gIGZvciAodmFyIF9sZW4gPSBhcmd1bWVudHMubGVuZ3RoLCBtaWRkbGV3YXJlcyA9IEFycmF5KF9sZW4pLCBfa2V5ID0gMDsgX2tleSA8IF9sZW47IF9rZXkrKykge1xuICAgIG1pZGRsZXdhcmVzW19rZXldID0gYXJndW1lbnRzW19rZXldO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIChjcmVhdGVTdG9yZSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAocmVkdWNlciwgcHJlbG9hZGVkU3RhdGUsIGVuaGFuY2VyKSB7XG4gICAgICB2YXIgc3RvcmUgPSBjcmVhdGVTdG9yZShyZWR1Y2VyLCBwcmVsb2FkZWRTdGF0ZSwgZW5oYW5jZXIpO1xuICAgICAgdmFyIF9kaXNwYXRjaCA9IHN0b3JlLmRpc3BhdGNoO1xuICAgICAgdmFyIGNoYWluID0gW107XG5cbiAgICAgIHZhciBtaWRkbGV3YXJlQVBJID0ge1xuICAgICAgICBnZXRTdGF0ZTogc3RvcmUuZ2V0U3RhdGUsXG4gICAgICAgIGRpc3BhdGNoOiBmdW5jdGlvbiBkaXNwYXRjaChhY3Rpb24pIHtcbiAgICAgICAgICByZXR1cm4gX2Rpc3BhdGNoKGFjdGlvbik7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjaGFpbiA9IG1pZGRsZXdhcmVzLm1hcChmdW5jdGlvbiAobWlkZGxld2FyZSkge1xuICAgICAgICByZXR1cm4gbWlkZGxld2FyZShtaWRkbGV3YXJlQVBJKTtcbiAgICAgIH0pO1xuICAgICAgX2Rpc3BhdGNoID0gY29tcG9zZS5hcHBseSh1bmRlZmluZWQsIGNoYWluKShzdG9yZS5kaXNwYXRjaCk7XG5cbiAgICAgIHJldHVybiBfZXh0ZW5kcyh7fSwgc3RvcmUsIHtcbiAgICAgICAgZGlzcGF0Y2g6IF9kaXNwYXRjaFxuICAgICAgfSk7XG4gICAgfTtcbiAgfTtcbn0iLCJpbXBvcnQgY3JlYXRlU3RvcmUgZnJvbSAnLi9jcmVhdGVTdG9yZSc7XG5pbXBvcnQgY29tYmluZVJlZHVjZXJzIGZyb20gJy4vY29tYmluZVJlZHVjZXJzJztcbmltcG9ydCBiaW5kQWN0aW9uQ3JlYXRvcnMgZnJvbSAnLi9iaW5kQWN0aW9uQ3JlYXRvcnMnO1xuaW1wb3J0IGFwcGx5TWlkZGxld2FyZSBmcm9tICcuL2FwcGx5TWlkZGxld2FyZSc7XG5pbXBvcnQgY29tcG9zZSBmcm9tICcuL2NvbXBvc2UnO1xuaW1wb3J0IHdhcm5pbmcgZnJvbSAnLi91dGlscy93YXJuaW5nJztcblxuLypcbiogVGhpcyBpcyBhIGR1bW15IGZ1bmN0aW9uIHRvIGNoZWNrIGlmIHRoZSBmdW5jdGlvbiBuYW1lIGhhcyBiZWVuIGFsdGVyZWQgYnkgbWluaWZpY2F0aW9uLlxuKiBJZiB0aGUgZnVuY3Rpb24gaGFzIGJlZW4gbWluaWZpZWQgYW5kIE5PREVfRU5WICE9PSAncHJvZHVjdGlvbicsIHdhcm4gdGhlIHVzZXIuXG4qL1xuZnVuY3Rpb24gaXNDcnVzaGVkKCkge31cblxuaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicgJiYgdHlwZW9mIGlzQ3J1c2hlZC5uYW1lID09PSAnc3RyaW5nJyAmJiBpc0NydXNoZWQubmFtZSAhPT0gJ2lzQ3J1c2hlZCcpIHtcbiAgd2FybmluZygnWW91IGFyZSBjdXJyZW50bHkgdXNpbmcgbWluaWZpZWQgY29kZSBvdXRzaWRlIG9mIE5PREVfRU5WID09PSBcXCdwcm9kdWN0aW9uXFwnLiAnICsgJ1RoaXMgbWVhbnMgdGhhdCB5b3UgYXJlIHJ1bm5pbmcgYSBzbG93ZXIgZGV2ZWxvcG1lbnQgYnVpbGQgb2YgUmVkdXguICcgKyAnWW91IGNhbiB1c2UgbG9vc2UtZW52aWZ5IChodHRwczovL2dpdGh1Yi5jb20vemVydG9zaC9sb29zZS1lbnZpZnkpIGZvciBicm93c2VyaWZ5ICcgKyAnb3IgRGVmaW5lUGx1Z2luIGZvciB3ZWJwYWNrIChodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzMwMDMwMDMxKSAnICsgJ3RvIGVuc3VyZSB5b3UgaGF2ZSB0aGUgY29ycmVjdCBjb2RlIGZvciB5b3VyIHByb2R1Y3Rpb24gYnVpbGQuJyk7XG59XG5cbmV4cG9ydCB7IGNyZWF0ZVN0b3JlLCBjb21iaW5lUmVkdWNlcnMsIGJpbmRBY3Rpb25DcmVhdG9ycywgYXBwbHlNaWRkbGV3YXJlLCBjb21wb3NlIH07IiwiZXhwb3J0IGNvbnN0IHZhbHVlc0Zyb21EZWYgPSAocm93cywgY29sdW1ucykgPT4gKHt4ID0gMSwgeSA9IDEsIGR4ID0gMSwgZHkgPSAxfT17fSkgPT4ge1xuICBjb25zdCB2YWx1ZXMgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3dzICogY29sdW1uczsgaSsrKSB7XG4gICAgY29uc3QgciA9IE1hdGguZmxvb3IoaSAvIHJvd3MpICsgMTtcbiAgICBjb25zdCBjID0gaSAlIGNvbHVtbnMgKyAxO1xuICAgIHZhbHVlcy5wdXNoKHIgPj0geSAmJiByIDwgeSArIGR5ICYmIGMgPj0geCAmJiBjIDwgeCArIGR4ID8gMSA6IDApO1xuICB9XG4gIHJldHVybiB2YWx1ZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZGVmRnJvbUluZGV4ID0gKHJvd3MsIGNvbHVtbnMpID0+IChpKSA9PiB7XG4gIGNvbnN0IHggPSBpICUgY29sdW1ucyArIDE7XG4gIGNvbnN0IHkgPSBNYXRoLmZsb29yKGkgLyByb3dzKSArIDE7XG4gIHJldHVybiB7eCwgeX07XG59O1xuXG5leHBvcnQgY29uc3QgaW5kZXhGcm9tRGVmID0gKHJvd3MsIGNvbHVtbnMpID0+ICh4LCB5KSA9PiAoeSAtIDEpICogcm93cyArIHggLSAxO1xuXG5leHBvcnQgY29uc3QgQXJlYUZhY3RvcnkgPSAocm93cywgY29sdW1ucykgPT4ge1xuICBjb25zdCBpVG9EZWYgPSBkZWZGcm9tSW5kZXgocm93cywgY29sdW1ucyk7XG4gIGNvbnN0IGRlZlRvSSA9IGluZGV4RnJvbURlZihyb3dzLCBjb2x1bW5zKTtcblxuICBjb25zdCBmYWN0b3J5ID0gdmFsdWVzID0+IE9iamVjdC5jcmVhdGUoUHJvdG8sIHtcbiAgICB2YWx1ZXM6IHt2YWx1ZTogWy4uLnZhbHVlc119LCBsZW5ndGg6IHtcbiAgICAgIGdldCgpe1xuICAgICAgICByZXR1cm4gdmFsdWVzLmZpbHRlcih2ID0+IHYgPT09IDEpLmxlbmd0aFxuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgY29uc3QgUHJvdG8gPSB7XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKXtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHRoaXMudmFsdWVzO1xuICAgICAgcmV0dXJuIChmdW5jdGlvbiAqICgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAodmFsdWVzW2ldID09PSAxKSB7XG4gICAgICAgICAgICB5aWVsZCBpVG9EZWYoaSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgIH0sXG4gICAgaW50ZXJzZWN0aW9uKGFyZWEpe1xuICAgICAgcmV0dXJuIGZhY3RvcnkodGhpcy52YWx1ZXMubWFwKCh2LCBpKSA9PiB2ICogYXJlYS52YWx1ZXNbaV0pKTtcbiAgICB9LFxuICAgIGluY2x1ZGVzKGFyZWEpe1xuICAgICAgY29uc3QgaXNPbmUgPSB2ID0+IHYgPT09IDE7XG4gICAgICByZXR1cm4gdGhpcy5pbnRlcnNlY3Rpb24oYXJlYSkudmFsdWVzLmZpbHRlcihpc09uZSkubGVuZ3RoID09PSBhcmVhLnZhbHVlcy5maWx0ZXIoaXNPbmUpLmxlbmd0aDtcbiAgICB9LFxuICAgIGlzSW5jbHVkZWQoYXJlYSl7XG4gICAgICByZXR1cm4gYXJlYS5pbmNsdWRlcyh0aGlzKTtcbiAgICB9LFxuICAgIHVuaW9uKGFyZWEpe1xuICAgICAgcmV0dXJuIGZhY3RvcnkodGhpcy52YWx1ZXMubWFwKCh2LCBpKSA9PiB2ICsgYXJlYS52YWx1ZXNbaV0gPiAwID8gMSA6IDApKTtcbiAgICB9LFxuICAgIGNvbXBsZW1lbnQoKXtcbiAgICAgIHJldHVybiBmYWN0b3J5KHRoaXMudmFsdWVzLm1hcCh2ID0+IDEgLSB2KSk7XG4gICAgfSxcbiAgICBkZWJ1Zygpe1xuICAgICAgbGV0IHByaW50ID0gJyc7XG4gICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSByb3dzOyBpKyspIHtcbiAgICAgICAgbGV0IGxpbmUgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaiA9IDE7IGogPD0gY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgY29uc3QgaW5kZXhGcm9tRGVmMiA9IGRlZlRvSShqLCBpKTtcbiAgICAgICAgICBsaW5lLnB1c2godGhpcy52YWx1ZXNbaW5kZXhGcm9tRGVmMl0pO1xuICAgICAgICB9XG4gICAgICAgIHByaW50ICs9IGBcbiR7bGluZS5qb2luKCcgJyl9XG5gXG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhwcmludCk7XG4gICAgfVxuICB9O1xuICByZXR1cm4gZmFjdG9yeTtcbn07XG5cbmV4cG9ydCBjb25zdCBHcmlkID0gKHtwYW5lbHNEYXRhID0gW10sIHJvd3MgPSA0LCBjb2x1bW5zID0gNH0gPXt9KSA9PiB7XG4gIGNvbnN0IGlUb0RlZiA9IGRlZkZyb21JbmRleChyb3dzLCBjb2x1bW5zKTtcbiAgY29uc3QgYXJlYSA9IEFyZWFGYWN0b3J5KHJvd3MsIGNvbHVtbnMpO1xuICBjb25zdCB0b1ZhbHVlcyA9IHZhbHVlc0Zyb21EZWYocm93cywgY29sdW1ucyk7XG4gIGxldCBwYW5lbHMgPSBbLi4ucGFuZWxzRGF0YV07XG4gIGlmIChyb3dzICogY29sdW1ucy5sZW5ndGggIT09IHBhbmVsc0RhdGEubGVuZ3RoKSB7XG4gICAgcGFuZWxzID0gKG5ldyBBcnJheShyb3dzICogY29sdW1ucykpLmZpbGwoMCkubWFwKChfLCBpbmRleCkgPT4gT2JqZWN0LmFzc2lnbihpVG9EZWYoaW5kZXgpLCB7XG4gICAgICBkeDogMSxcbiAgICAgIGR5OiAxLFxuICAgICAgYWRvcm5lclN0YXR1czogMCxcbiAgICAgIGRhdGE6IHt9XG4gICAgfSkpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpe1xuICAgICAgcmV0dXJuIChmdW5jdGlvbiAqICgpIHtcbiAgICAgICAgZm9yIChsZXQgcCBvZiBwYW5lbHMpIHtcbiAgICAgICAgICB5aWVsZCBPYmplY3QuYXNzaWduKHt9LCBwKTtcbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICB9LFxuICAgIHVwZGF0ZUF0KHgsIHksIGRhdGEpe1xuICAgICAgY29uc3QgcCA9IHBhbmVscy5maW5kKHAgPT4gcC54ID09PSB4ICYmIHAueSA9PT0geSk7XG4gICAgICBPYmplY3QuYXNzaWduKHAsIGRhdGEpO1xuICAgICAgcmV0dXJuIHA7XG4gICAgfSxcbiAgICBwYW5lbCh4LCB5KXtcbiAgICAgIHJldHVybiBhcmVhKHRvVmFsdWVzKHBhbmVscy5maW5kKHAgPT4gcC54ID09PSB4ICYmIHAueSA9PT0geSkpKTtcbiAgICB9LFxuICAgIGFyZWEoeCwgeSwgZHggPSAxLCBkeSA9IDEpe1xuICAgICAgcmV0dXJuIGFyZWEodG9WYWx1ZXMoe3gsIHksIGR4LCBkeX0pKTtcbiAgICB9LFxuICAgIGdldERhdGEoeCwgeSl7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSxwYW5lbHMuZmluZChwID0+IHAueCA9PT0geCAmJiBwLnkgPT09IHkpIHx8IHt9KTtcbiAgICB9XG4gIH07XG59OyIsImV4cG9ydCBjb25zdCBST1dTID0gNDtcbmV4cG9ydCBjb25zdCBDT0xVTU5TID0gNDsiLCJpbXBvcnQge0dyaWR9IGZyb20gJy4uL2xpYi9ncmlkJztcbmltcG9ydCB7Uk9XUywgQ09MVU1OU30gZnJvbSAnLi4vbGliL2NvbnN0YW50cyc7XG5cbmV4cG9ydCBkZWZhdWx0IEdyaWQoe3Jvd3M6IFJPV1MsIGNvbHVtbnM6IENPTFVNTlN9KTtcbiIsImltcG9ydCB7R3JpZH0gZnJvbSAnLi4vbGliL2dyaWQnO1xuXG5leHBvcnQgZGVmYXVsdCAoZ3JpZCA9IEdyaWQoKSkgPT4gKHN0YXRlID0ge2FjdGl2ZTogbnVsbCwgcGFuZWxzOiBbLi4uZ3JpZF19LCBhY3Rpb24pID0+IHtcblxuICBjb25zdCByZXNpemVPdmVyID0gKHN0YXRlLCBhY3Rpb24pID0+IHtcbiAgICBjb25zdCB7eCwgeX0gPWFjdGlvbjtcbiAgICBjb25zdCB7YWN0aXZlfSA9IHN0YXRlO1xuICAgIGNvbnN0IHt4OnN0YXJ0WCwgeTpzdGFydFl9ID0gYWN0aXZlO1xuICAgIGlmICh4ID49IHN0YXJ0WCAmJiB5ID49IHN0YXJ0WSkge1xuICAgICAgY29uc3QgZHggPSB4IC0gc3RhcnRYICsgMTtcbiAgICAgIGNvbnN0IGR5ID0geSAtIHN0YXJ0WSArIDE7XG4gICAgICBjb25zdCBhY3RpdmVBcmVhID0gZ3JpZC5hcmVhKHN0YXJ0WCwgc3RhcnRZLCBkeCwgZHkpO1xuICAgICAgY29uc3QgaW5hY3RpdmVBcmVhID0gYWN0aXZlQXJlYS5jb21wbGVtZW50KCk7XG4gICAgICBjb25zdCBhbGxCdXRTdGFydCA9IGdyaWQuYXJlYShzdGFydFgsIHN0YXJ0WSkuY29tcGxlbWVudCgpO1xuICAgICAgY29uc3QgaW52YWxpZENlbGxzQXJlYSA9IFsuLi5hbGxCdXRTdGFydF1cbiAgICAgICAgLm1hcChwID0+IGdyaWQucGFuZWwocC54LCBwLnkpKVxuICAgICAgICAuZmlsdGVyKHAgPT4ge1xuICAgICAgICAgIGNvbnN0IGludGVyc2VjdGlvbiA9IHAuaW50ZXJzZWN0aW9uKGFjdGl2ZUFyZWEpO1xuICAgICAgICAgIHJldHVybiBpbnRlcnNlY3Rpb24ubGVuZ3RoID4gMCAmJiBhY3RpdmVBcmVhLmluY2x1ZGVzKHApID09PSBmYWxzZTtcbiAgICAgICAgfSlcbiAgICAgICAgLnJlZHVjZSgoYWNjLCBjdXJyZW50KSA9PiBhY2MudW5pb24oY3VycmVudCksIGdyaWQuYXJlYSgxLCAxLCAwLCAwKSk7XG5cbiAgICAgIGZvciAobGV0IHt4LCB5fSBvZiBpbmFjdGl2ZUFyZWEpIHtcbiAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogMH0pO1xuICAgICAgfVxuXG4gICAgICBmb3IgKGxldCB7eCwgeX0gb2YgYWN0aXZlQXJlYSkge1xuICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAxfSk7XG4gICAgICB9XG5cbiAgICAgIGZvciAobGV0IHt4LCB5fSBvZiBpbnZhbGlkQ2VsbHNBcmVhKSB7XG4gICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IC0xfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge1xuICAgICAgICBhY3RpdmU6IE9iamVjdC5hc3NpZ24oe30sIGFjdGl2ZSwge3ZhbGlkOiBpbnZhbGlkQ2VsbHNBcmVhLmxlbmd0aCA9PT0gMH0pLFxuICAgICAgICBwYW5lbHM6IFsuLi5ncmlkXVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHN0YXRlLCB7YWN0aXZlOiBPYmplY3QuYXNzaWduKHt9LCBhY3RpdmUsIHt2YWxpZDogZmFsc2V9KX0pO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBtb3ZlT3ZlciA9IChzdGF0ZSwgYWN0aW9uKSA9PiB7XG4gICAgY29uc3Qge3gsIHl9ID1hY3Rpb247XG4gICAgY29uc3Qge2FjdGl2ZX0gPSBzdGF0ZTtcbiAgICBjb25zdCB7eDpzdGFydFgsIHk6c3RhcnRZfSA9IGFjdGl2ZTtcblxuICAgIGNvbnN0IHtkeCwgZHl9ID0gZ3JpZC5nZXREYXRhKHN0YXJ0WCwgc3RhcnRZKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsUGFuZWwgPSBncmlkLnBhbmVsKHN0YXJ0WCwgc3RhcnRZKTtcbiAgICBjb25zdCBleHBlY3RlZEFyZWEgPSBncmlkLmFyZWEoeCwgeSwgZHgsIGR5KTtcbiAgICBjb25zdCBhY3RpdmVBcmVhID0gb3JpZ2luYWxQYW5lbC51bmlvbihleHBlY3RlZEFyZWEpO1xuICAgIGxldCBpbnZhbGlkQXJlYTtcblxuICAgIGlmIChleHBlY3RlZEFyZWEubGVuZ3RoIDwgb3JpZ2luYWxQYW5lbC5sZW5ndGgpIHtcbiAgICAgIGludmFsaWRBcmVhID0gYWN0aXZlQXJlYTtcbiAgICB9IGVsc2Uge1xuICAgICAgaW52YWxpZEFyZWEgPSBbLi4ub3JpZ2luYWxQYW5lbC5jb21wbGVtZW50KCldXG4gICAgICAgIC5tYXAoYSA9PiBncmlkLnBhbmVsKGEueCwgYS55KSlcbiAgICAgICAgLmZpbHRlcihwID0+IHtcbiAgICAgICAgICBjb25zdCBpbnRlcnNlY3Rpb24gPSBwLmludGVyc2VjdGlvbihleHBlY3RlZEFyZWEpO1xuICAgICAgICAgIHJldHVybiBpbnRlcnNlY3Rpb24ubGVuZ3RoID4gMCAmJiBleHBlY3RlZEFyZWEuaW5jbHVkZXMocCkgPT09IGZhbHNlO1xuICAgICAgICB9KVxuICAgICAgICAucmVkdWNlKChhY2MsIGN1cnJlbnQpID0+IGFjYy51bmlvbihjdXJyZW50KSwgZ3JpZC5hcmVhKDEsIDEsIDAsIDApKTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmFjdGl2ZUFyZWEgPSBhY3RpdmVBcmVhLmNvbXBsZW1lbnQoKTtcblxuICAgIGZvciAobGV0IHt4LCB5fSBvZiBpbmFjdGl2ZUFyZWEpIHtcbiAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IDB9KTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCB7eCwgeX0gb2YgYWN0aXZlQXJlYSkge1xuICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogMX0pO1xuICAgIH1cblxuICAgIGZvciAobGV0IHt4LCB5fSBvZiBpbnZhbGlkQXJlYSkge1xuICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogLTF9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtcbiAgICAgIHBhbmVsczogWy4uLmdyaWRdLFxuICAgICAgYWN0aXZlOiBPYmplY3QuYXNzaWduKHt9LCBhY3RpdmUsIHt2YWxpZDogaW52YWxpZEFyZWEubGVuZ3RoID09PSAwfSlcbiAgICB9KTtcbiAgfTtcblxuICBzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG4gICAgY2FzZSAnU1RBUlRfUkVTSVpFJzoge1xuICAgICAgY29uc3Qge3gsIHl9PWFjdGlvbjtcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge2FjdGl2ZToge3gsIHksIG9wZXJhdGlvbjogJ3Jlc2l6ZSd9fSk7XG4gICAgfVxuICAgIGNhc2UgJ1NUQVJUX01PVkUnOiB7XG4gICAgICBjb25zdCB7eCwgeX09YWN0aW9uO1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7YWN0aXZlOiB7eCwgeSwgb3BlcmF0aW9uOiAnbW92ZSd9fSk7XG4gICAgfVxuICAgIGNhc2UgJ0RSQUdfT1ZFUic6IHtcbiAgICAgIGNvbnN0IHthY3RpdmUgPSB7fX0gPSBzdGF0ZTtcbiAgICAgIGlmICghYWN0aXZlLm9wZXJhdGlvbikge1xuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gYWN0aXZlLm9wZXJhdGlvbiA9PT0gJ21vdmUnID8gbW92ZU92ZXIoc3RhdGUsIGFjdGlvbikgOiByZXNpemVPdmVyKHN0YXRlLCBhY3Rpb24pO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXNlICdFTkRfUkVTSVpFJzoge1xuICAgICAgY29uc3Qge3gsIHksIHN0YXJ0WCwgc3RhcnRZfSA9YWN0aW9uO1xuICAgICAgY29uc3QgZHggPSB4IC0gc3RhcnRYICsgMTtcbiAgICAgIGNvbnN0IGR5ID0geSAtIHN0YXJ0WSArIDE7XG4gICAgICBjb25zdCB7YWN0aXZlfSA9c3RhdGU7XG4gICAgICBpZiAoYWN0aXZlLnZhbGlkID09PSB0cnVlKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZUFyZWEgPSBncmlkLmFyZWEoc3RhcnRYLCBzdGFydFksIGR4LCBkeSk7XG4gICAgICAgIGNvbnN0IFtiYXNlQ2VsbCwgLi4ub3RoZXJDZWxsc10gPSBhY3RpdmVBcmVhO1xuICAgICAgICBncmlkLnVwZGF0ZUF0KHN0YXJ0WCwgc3RhcnRZLCB7ZHgsIGR5fSk7XG4gICAgICAgIGZvciAoY29uc3Qge3gsIHl9IG9mIG90aGVyQ2VsbHMpIHtcbiAgICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHtkeDogMSwgZHk6IDF9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZm9yIChsZXQge3gsIHl9IG9mIFsuLi5ncmlkXSkge1xuICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAwfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge1xuICAgICAgICBwYW5lbHM6IFsuLi5ncmlkXSxcbiAgICAgICAgYWN0aXZlOiBudWxsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY2FzZSAnRU5EX01PVkUnOiB7XG4gICAgICBjb25zdCB7eCwgeSwgc3RhcnRYLCBzdGFydFl9ID1hY3Rpb247XG4gICAgICBjb25zdCBkZWx0YVggPSBzdGFydFggLSB4O1xuICAgICAgY29uc3QgZGVsdGFZID0gc3RhcnRZIC0geTtcbiAgICAgIGNvbnN0IHthY3RpdmV9ID1zdGF0ZTtcbiAgICAgIGlmIChhY3RpdmUudmFsaWQgPT09IHRydWUpIHtcbiAgICAgICAgY29uc3Qgc3RhcnREYXRhID0gZ3JpZC5nZXREYXRhKHN0YXJ0WCwgc3RhcnRZKTtcbiAgICAgICAgY29uc3Qge2R4LCBkeX0gPXN0YXJ0RGF0YTtcbiAgICAgICAgY29uc3QgY2xhaW1lZEFyZWEgPSBncmlkLmFyZWEoeCwgeSwgZHgsIGR5KTtcbiAgICAgICAgZm9yICh7eDogY3gsIHk6IGN5fSBvZiBjbGFpbWVkQXJlYSkge1xuICAgICAgICAgIGNvbnN0IG5ld1ggPSBjeCArIGRlbHRhWDtcbiAgICAgICAgICBjb25zdCBuZXdZID0gY3kgKyBkZWx0YVk7XG4gICAgICAgICAgY29uc3QgbmV3RGF0YSA9IE9iamVjdC5hc3NpZ24oZ3JpZC5nZXREYXRhKGN4LCBjeSksIHt4OiBuZXdYLCB5OiBuZXdZfSk7XG4gICAgICAgICAgZ3JpZC51cGRhdGVBdChuZXdYLCBuZXdZLCBuZXdEYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIE9iamVjdC5hc3NpZ24oc3RhcnREYXRhLCB7eCwgeX0pKTtcbiAgICAgIH1cbiAgICAgIGZvciAobGV0IHt4LCB5fSBvZiBbLi4uZ3JpZF0pIHtcbiAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogMH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtcbiAgICAgICAgcGFuZWxzOiBbLi4uZ3JpZF0sXG4gICAgICAgIGFjdGl2ZTogbnVsbFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNhc2UgJ1VQREFURV9QQU5FTF9EQVRBJzoge1xuICAgICAgY29uc3Qge3gsIHksIGRhdGF9ID0gYWN0aW9uO1xuICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7ZGF0YX0pO1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7cGFuZWxzOiBbLi4uZ3JpZF19KTtcbiAgICB9XG4gICAgY2FzZSAnUkVTRVRfUEFORUwnOiB7XG4gICAgICBjb25zdCB7eCwgeX0gPSBhY3Rpb247XG4gICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHtkYXRhOiB7fX0pO1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7cGFuZWxzOiBbLi4uZ3JpZF19KTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgfVxufTtcblxuIiwiZXhwb3J0IGRlZmF1bHQgKGdyaWQpID0+IChzdGF0ZSA9IHtpc09wZW46IGZhbHNlfSwgYWN0aW9uKSA9PiB7XG4gIGNvbnN0IHt0eXBlfSA9IGFjdGlvbjtcbiAgY29uc3QgbW9kYWxEYXRhID0gey4uLmFjdGlvbn07XG4gIGRlbGV0ZSAgbW9kYWxEYXRhLnR5cGU7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ09QRU5fTU9EQUwnOiB7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIG1vZGFsRGF0YSwge2lzT3BlbjogdHJ1ZX0pO1xuICAgIH1cbiAgICBjYXNlICdDTE9TRV9NT0RBTCc6IHtcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwgbW9kYWxEYXRhLCB7aXNPcGVuOiBmYWxzZSwgdGl0bGU6ICcnLCBtb2RhbFR5cGU6ICdub25lJ30pO1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHN0YXRlO1xuICB9XG59OyIsImV4cG9ydCBkZWZhdWx0IChzdGF0ZSA9IFtdLCBhY3Rpb24pID0+IHtcbiAgY29uc3Qge3R5cGV9ID0gYWN0aW9uO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdDUkVBVEVfU01BUlRfTElTVCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5LCB0YWJsZVN0YXRlLCBpdGVtc30gPSBhY3Rpb247XG4gICAgICByZXR1cm4gc3RhdGUuY29uY2F0KHt4LCB5LCB0YWJsZVN0YXRlLCBpdGVtc30pO1xuICAgIH1cbiAgICBjYXNlICdVUERBVEVfU01BUlRfTElTVCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5LCB0YWJsZVN0YXRlLCBpdGVtc30gPSBhY3Rpb247XG4gICAgICByZXR1cm4gc3RhdGUubWFwKChzbCkgPT4ge1xuICAgICAgICBpZiAoc2wueCA9PT0geCAmJiBzbC55ID09PSB5KSB7XG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHNsLCB7dGFibGVTdGF0ZSwgaXRlbXN9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gc2w7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBjYXNlICdSRU1PVkVfU01BUlRfTElTVCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5fSA9IGFjdGlvbjtcbiAgICAgIHJldHVybiBzdGF0ZS5maWx0ZXIoZiA9PiBmLnggIT09IHggfHwgZi55ICE9PSB5KTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgfVxufTsiLCJpbXBvcnQgZ3JpZFJlZHVjZXIgZnJvbSAnLi9ncmlkJztcbmltcG9ydCBtb2RhbFJlZHVjZXIgZnJvbSAnLi9tb2RhbCc7XG5pbXBvcnQgc21hcnRMaXN0UmVkdWNlciBmcm9tICcuL3NtYXJ0TGlzdCc7XG5cbmV4cG9ydCBkZWZhdWx0IChncmlkKSA9PiAoc3RhdGUgPSB7fSwgYWN0aW9uKSA9PiAoe1xuICBncmlkOiBncmlkUmVkdWNlcihncmlkKShzdGF0ZS5ncmlkLCBhY3Rpb24pLFxuICBtb2RhbDogbW9kYWxSZWR1Y2VyKGdyaWQpKHN0YXRlLm1vZGFsLCBhY3Rpb24pLFxuICBzbWFydExpc3Q6IHNtYXJ0TGlzdFJlZHVjZXIoc3RhdGUuc21hcnRMaXN0LCBhY3Rpb24pXG59KTtcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHBvaW50ZXIgKHBhdGgpIHtcblxuICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcblxuICBmdW5jdGlvbiBwYXJ0aWFsIChvYmogPSB7fSwgcGFydHMgPSBbXSkge1xuICAgIGNvbnN0IHAgPSBwYXJ0cy5zaGlmdCgpO1xuICAgIGNvbnN0IGN1cnJlbnQgPSBvYmpbcF07XG4gICAgcmV0dXJuIChjdXJyZW50ID09PSB1bmRlZmluZWQgfHwgcGFydHMubGVuZ3RoID09PSAwKSA/XG4gICAgICBjdXJyZW50IDogcGFydGlhbChjdXJyZW50LCBwYXJ0cyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXQgKHRhcmdldCwgbmV3VHJlZSkge1xuICAgIGxldCBjdXJyZW50ID0gdGFyZ2V0O1xuICAgIGNvbnN0IFtsZWFmLCAuLi5pbnRlcm1lZGlhdGVdID0gcGFydHMucmV2ZXJzZSgpO1xuICAgIGZvciAobGV0IGtleSBvZiBpbnRlcm1lZGlhdGUucmV2ZXJzZSgpKSB7XG4gICAgICBpZiAoY3VycmVudFtrZXldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY3VycmVudFtrZXldID0ge307XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50W2tleV07XG4gICAgICB9XG4gICAgfVxuICAgIGN1cnJlbnRbbGVhZl0gPSBPYmplY3QuYXNzaWduKGN1cnJlbnRbbGVhZl0gfHwge30sIG5ld1RyZWUpO1xuICAgIHJldHVybiB0YXJnZXQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdldCh0YXJnZXQpe1xuICAgICAgcmV0dXJuIHBhcnRpYWwodGFyZ2V0LCBbLi4ucGFydHNdKVxuICAgIH0sXG4gICAgc2V0XG4gIH1cbn07XG4iLCJpbXBvcnQge3N3YXB9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG5cbmZ1bmN0aW9uIHNvcnRCeVByb3BlcnR5IChwcm9wKSB7XG4gIGNvbnN0IHByb3BHZXR0ZXIgPSBwb2ludGVyKHByb3ApLmdldDtcbiAgcmV0dXJuIChhLCBiKSA9PiB7XG4gICAgY29uc3QgYVZhbCA9IHByb3BHZXR0ZXIoYSk7XG4gICAgY29uc3QgYlZhbCA9IHByb3BHZXR0ZXIoYik7XG5cbiAgICBpZiAoYVZhbCA9PT0gYlZhbCkge1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgaWYgKGJWYWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGlmIChhVmFsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIHJldHVybiBhVmFsIDwgYlZhbCA/IC0xIDogMTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBzb3J0RmFjdG9yeSAoe3BvaW50ZXIsIGRpcmVjdGlvbn0gPSB7fSkge1xuICBpZiAoIXBvaW50ZXIgfHwgZGlyZWN0aW9uID09PSAnbm9uZScpIHtcbiAgICByZXR1cm4gYXJyYXkgPT4gWy4uLmFycmF5XTtcbiAgfVxuXG4gIGNvbnN0IG9yZGVyRnVuYyA9IHNvcnRCeVByb3BlcnR5KHBvaW50ZXIpO1xuICBjb25zdCBjb21wYXJlRnVuYyA9IGRpcmVjdGlvbiA9PT0gJ2Rlc2MnID8gc3dhcChvcmRlckZ1bmMpIDogb3JkZXJGdW5jO1xuXG4gIHJldHVybiAoYXJyYXkpID0+IFsuLi5hcnJheV0uc29ydChjb21wYXJlRnVuYyk7XG59IiwiaW1wb3J0IHtjb21wb3NlfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHBvaW50ZXIgZnJvbSAnc21hcnQtdGFibGUtanNvbi1wb2ludGVyJztcblxuZnVuY3Rpb24gdHlwZUV4cHJlc3Npb24gKHR5cGUpIHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gQm9vbGVhbjtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIE51bWJlcjtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiAodmFsKSA9PiBuZXcgRGF0ZSh2YWwpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gY29tcG9zZShTdHJpbmcsICh2YWwpID0+IHZhbC50b0xvd2VyQ2FzZSgpKTtcbiAgfVxufVxuXG5jb25zdCBvcGVyYXRvcnMgPSB7XG4gIGluY2x1ZGVzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dC5pbmNsdWRlcyh2YWx1ZSk7XG4gIH0sXG4gIGlzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBPYmplY3QuaXModmFsdWUsIGlucHV0KTtcbiAgfSxcbiAgaXNOb3QodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+ICFPYmplY3QuaXModmFsdWUsIGlucHV0KTtcbiAgfSxcbiAgbHQodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0IDwgdmFsdWU7XG4gIH0sXG4gIGd0KHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dCA+IHZhbHVlO1xuICB9LFxuICBsdGUodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0IDw9IHZhbHVlO1xuICB9LFxuICBndGUodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0ID49IHZhbHVlO1xuICB9LFxuICBlcXVhbHModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IHZhbHVlID09IGlucHV0O1xuICB9LFxuICBub3RFcXVhbHModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IHZhbHVlICE9IGlucHV0O1xuICB9XG59O1xuXG5jb25zdCBldmVyeSA9IGZucyA9PiAoLi4uYXJncykgPT4gZm5zLmV2ZXJ5KGZuID0+IGZuKC4uLmFyZ3MpKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHByZWRpY2F0ZSAoe3ZhbHVlID0gJycsIG9wZXJhdG9yID0gJ2luY2x1ZGVzJywgdHlwZSA9ICdzdHJpbmcnfSkge1xuICBjb25zdCB0eXBlSXQgPSB0eXBlRXhwcmVzc2lvbih0eXBlKTtcbiAgY29uc3Qgb3BlcmF0ZU9uVHlwZWQgPSBjb21wb3NlKHR5cGVJdCwgb3BlcmF0b3JzW29wZXJhdG9yXSk7XG4gIGNvbnN0IHByZWRpY2F0ZUZ1bmMgPSBvcGVyYXRlT25UeXBlZCh2YWx1ZSk7XG4gIHJldHVybiBjb21wb3NlKHR5cGVJdCwgcHJlZGljYXRlRnVuYyk7XG59XG5cbi8vYXZvaWQgdXNlbGVzcyBmaWx0ZXIgbG9va3VwIChpbXByb3ZlIHBlcmYpXG5mdW5jdGlvbiBub3JtYWxpemVDbGF1c2VzIChjb25mKSB7XG4gIGNvbnN0IG91dHB1dCA9IHt9O1xuICBjb25zdCB2YWxpZFBhdGggPSBPYmplY3Qua2V5cyhjb25mKS5maWx0ZXIocGF0aCA9PiBBcnJheS5pc0FycmF5KGNvbmZbcGF0aF0pKTtcbiAgdmFsaWRQYXRoLmZvckVhY2gocGF0aCA9PiB7XG4gICAgY29uc3QgdmFsaWRDbGF1c2VzID0gY29uZltwYXRoXS5maWx0ZXIoYyA9PiBjLnZhbHVlICE9PSAnJyk7XG4gICAgaWYgKHZhbGlkQ2xhdXNlcy5sZW5ndGgpIHtcbiAgICAgIG91dHB1dFtwYXRoXSA9IHZhbGlkQ2xhdXNlcztcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBmaWx0ZXIgKGZpbHRlcikge1xuICBjb25zdCBub3JtYWxpemVkQ2xhdXNlcyA9IG5vcm1hbGl6ZUNsYXVzZXMoZmlsdGVyKTtcbiAgY29uc3QgZnVuY0xpc3QgPSBPYmplY3Qua2V5cyhub3JtYWxpemVkQ2xhdXNlcykubWFwKHBhdGggPT4ge1xuICAgIGNvbnN0IGdldHRlciA9IHBvaW50ZXIocGF0aCkuZ2V0O1xuICAgIGNvbnN0IGNsYXVzZXMgPSBub3JtYWxpemVkQ2xhdXNlc1twYXRoXS5tYXAocHJlZGljYXRlKTtcbiAgICByZXR1cm4gY29tcG9zZShnZXR0ZXIsIGV2ZXJ5KGNsYXVzZXMpKTtcbiAgfSk7XG4gIGNvbnN0IGZpbHRlclByZWRpY2F0ZSA9IGV2ZXJ5KGZ1bmNMaXN0KTtcblxuICByZXR1cm4gKGFycmF5KSA9PiBhcnJheS5maWx0ZXIoZmlsdGVyUHJlZGljYXRlKTtcbn0iLCJpbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoc2VhcmNoQ29uZiA9IHt9KSB7XG4gIGNvbnN0IHt2YWx1ZSwgc2NvcGUgPSBbXX0gPSBzZWFyY2hDb25mO1xuICBjb25zdCBzZWFyY2hQb2ludGVycyA9IHNjb3BlLm1hcChmaWVsZCA9PiBwb2ludGVyKGZpZWxkKS5nZXQpO1xuICBpZiAoIXNjb3BlLmxlbmd0aCB8fCAhdmFsdWUpIHtcbiAgICByZXR1cm4gYXJyYXkgPT4gYXJyYXk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGFycmF5ID0+IGFycmF5LmZpbHRlcihpdGVtID0+IHNlYXJjaFBvaW50ZXJzLnNvbWUocCA9PiBTdHJpbmcocChpdGVtKSkuaW5jbHVkZXMoU3RyaW5nKHZhbHVlKSkpKVxuICB9XG59IiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gc2xpY2VGYWN0b3J5ICh7cGFnZSA9IDEsIHNpemV9ID0ge30pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHNsaWNlRnVuY3Rpb24gKGFycmF5ID0gW10pIHtcbiAgICBjb25zdCBhY3R1YWxTaXplID0gc2l6ZSB8fCBhcnJheS5sZW5ndGg7XG4gICAgY29uc3Qgb2Zmc2V0ID0gKHBhZ2UgLSAxKSAqIGFjdHVhbFNpemU7XG4gICAgcmV0dXJuIGFycmF5LnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgYWN0dWFsU2l6ZSk7XG4gIH07XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gZW1pdHRlciAoKSB7XG5cbiAgY29uc3QgbGlzdGVuZXJzTGlzdHMgPSB7fTtcbiAgY29uc3QgaW5zdGFuY2UgPSB7XG4gICAgb24oZXZlbnQsIC4uLmxpc3RlbmVycyl7XG4gICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSAobGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdKS5jb25jYXQobGlzdGVuZXJzKTtcbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9LFxuICAgIGRpc3BhdGNoKGV2ZW50LCAuLi5hcmdzKXtcbiAgICAgIGNvbnN0IGxpc3RlbmVycyA9IGxpc3RlbmVyc0xpc3RzW2V2ZW50XSB8fCBbXTtcbiAgICAgIGZvciAobGV0IGxpc3RlbmVyIG9mIGxpc3RlbmVycykge1xuICAgICAgICBsaXN0ZW5lciguLi5hcmdzKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9LFxuICAgIG9mZihldmVudCwgLi4ubGlzdGVuZXJzKXtcbiAgICAgIGlmICghZXZlbnQpIHtcbiAgICAgICAgT2JqZWN0LmtleXMobGlzdGVuZXJzTGlzdHMpLmZvckVhY2goZXYgPT4gaW5zdGFuY2Uub2ZmKGV2KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBsaXN0ID0gbGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdO1xuICAgICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSBsaXN0ZW5lcnMubGVuZ3RoID8gbGlzdC5maWx0ZXIobGlzdGVuZXIgPT4gIWxpc3RlbmVycy5pbmNsdWRlcyhsaXN0ZW5lcikpIDogW107XG4gICAgICB9XG4gICAgICByZXR1cm4gaW5zdGFuY2U7XG4gICAgfVxuICB9O1xuICByZXR1cm4gaW5zdGFuY2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm94eUxpc3RlbmVyIChldmVudE1hcCkge1xuICByZXR1cm4gZnVuY3Rpb24gKHtlbWl0dGVyfSkge1xuXG4gICAgY29uc3QgcHJveHkgPSB7fTtcbiAgICBsZXQgZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuICAgIGZvciAobGV0IGV2IG9mIE9iamVjdC5rZXlzKGV2ZW50TWFwKSkge1xuICAgICAgY29uc3QgbWV0aG9kID0gZXZlbnRNYXBbZXZdO1xuICAgICAgZXZlbnRMaXN0ZW5lcnNbZXZdID0gW107XG4gICAgICBwcm94eVttZXRob2RdID0gZnVuY3Rpb24gKC4uLmxpc3RlbmVycykge1xuICAgICAgICBldmVudExpc3RlbmVyc1tldl0gPSBldmVudExpc3RlbmVyc1tldl0uY29uY2F0KGxpc3RlbmVycyk7XG4gICAgICAgIGVtaXR0ZXIub24oZXYsIC4uLmxpc3RlbmVycyk7XG4gICAgICAgIHJldHVybiBwcm94eTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJveHksIHtcbiAgICAgIG9mZihldil7XG4gICAgICAgIGlmICghZXYpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhldmVudExpc3RlbmVycykuZm9yRWFjaChldmVudE5hbWUgPT4gcHJveHkub2ZmKGV2ZW50TmFtZSkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChldmVudExpc3RlbmVyc1tldl0pIHtcbiAgICAgICAgICBlbWl0dGVyLm9mZihldiwgLi4uZXZlbnRMaXN0ZW5lcnNbZXZdKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcHJveHk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn0iLCJleHBvcnQgY29uc3QgVE9HR0xFX1NPUlQgPSAnVE9HR0xFX1NPUlQnO1xuZXhwb3J0IGNvbnN0IERJU1BMQVlfQ0hBTkdFRCA9ICdESVNQTEFZX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFBBR0VfQ0hBTkdFRCA9ICdDSEFOR0VfUEFHRSc7XG5leHBvcnQgY29uc3QgRVhFQ19DSEFOR0VEID0gJ0VYRUNfQ0hBTkdFRCc7XG5leHBvcnQgY29uc3QgRklMVEVSX0NIQU5HRUQgPSAnRklMVEVSX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFNVTU1BUllfQ0hBTkdFRCA9ICdTVU1NQVJZX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFNFQVJDSF9DSEFOR0VEID0gJ1NFQVJDSF9DSEFOR0VEJztcbmV4cG9ydCBjb25zdCBFWEVDX0VSUk9SID0gJ0VYRUNfRVJST1InOyIsImltcG9ydCBzbGljZSBmcm9tICcuLi9zbGljZSc7XG5pbXBvcnQge2N1cnJ5LCB0YXAsIGNvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuaW1wb3J0IHtlbWl0dGVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuaW1wb3J0IHNsaWNlRmFjdG9yeSBmcm9tICcuLi9zbGljZSc7XG5pbXBvcnQge1xuICBTVU1NQVJZX0NIQU5HRUQsXG4gIFRPR0dMRV9TT1JULFxuICBESVNQTEFZX0NIQU5HRUQsXG4gIFBBR0VfQ0hBTkdFRCxcbiAgRVhFQ19DSEFOR0VELFxuICBGSUxURVJfQ0hBTkdFRCxcbiAgU0VBUkNIX0NIQU5HRUQsXG4gIEVYRUNfRVJST1Jcbn0gZnJvbSAnLi4vZXZlbnRzJztcblxuZnVuY3Rpb24gY3VycmllZFBvaW50ZXIgKHBhdGgpIHtcbiAgY29uc3Qge2dldCwgc2V0fSA9IHBvaW50ZXIocGF0aCk7XG4gIHJldHVybiB7Z2V0LCBzZXQ6IGN1cnJ5KHNldCl9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe1xuICBzb3J0RmFjdG9yeSxcbiAgdGFibGVTdGF0ZSxcbiAgZGF0YSxcbiAgZmlsdGVyRmFjdG9yeSxcbiAgc2VhcmNoRmFjdG9yeVxufSkge1xuICBjb25zdCB0YWJsZSA9IGVtaXR0ZXIoKTtcbiAgY29uc3Qgc29ydFBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc29ydCcpO1xuICBjb25zdCBzbGljZVBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc2xpY2UnKTtcbiAgY29uc3QgZmlsdGVyUG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdmaWx0ZXInKTtcbiAgY29uc3Qgc2VhcmNoUG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdzZWFyY2gnKTtcblxuICBjb25zdCBzYWZlQXNzaWduID0gY3VycnkoKGJhc2UsIGV4dGVuc2lvbikgPT4gT2JqZWN0LmFzc2lnbih7fSwgYmFzZSwgZXh0ZW5zaW9uKSk7XG4gIGNvbnN0IGRpc3BhdGNoID0gY3VycnkodGFibGUuZGlzcGF0Y2guYmluZCh0YWJsZSksIDIpO1xuXG4gIGNvbnN0IGRpc3BhdGNoU3VtbWFyeSA9IChmaWx0ZXJlZCkgPT4ge1xuICAgIGRpc3BhdGNoKFNVTU1BUllfQ0hBTkdFRCwge1xuICAgICAgcGFnZTogdGFibGVTdGF0ZS5zbGljZS5wYWdlLFxuICAgICAgc2l6ZTogdGFibGVTdGF0ZS5zbGljZS5zaXplLFxuICAgICAgZmlsdGVyZWRDb3VudDogZmlsdGVyZWQubGVuZ3RoXG4gICAgfSk7XG4gIH07XG5cbiAgY29uc3QgZXhlYyA9ICh7cHJvY2Vzc2luZ0RlbGF5ID0gMjB9ID0ge30pID0+IHtcbiAgICB0YWJsZS5kaXNwYXRjaChFWEVDX0NIQU5HRUQsIHt3b3JraW5nOiB0cnVlfSk7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaWx0ZXJGdW5jID0gZmlsdGVyRmFjdG9yeShmaWx0ZXJQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IHNlYXJjaEZ1bmMgPSBzZWFyY2hGYWN0b3J5KHNlYXJjaFBvaW50ZXIuZ2V0KHRhYmxlU3RhdGUpKTtcbiAgICAgICAgY29uc3Qgc29ydEZ1bmMgPSBzb3J0RmFjdG9yeShzb3J0UG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICBjb25zdCBzbGljZUZ1bmMgPSBzbGljZUZhY3Rvcnkoc2xpY2VQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IGV4ZWNGdW5jID0gY29tcG9zZShmaWx0ZXJGdW5jLCBzZWFyY2hGdW5jLCB0YXAoZGlzcGF0Y2hTdW1tYXJ5KSwgc29ydEZ1bmMsIHNsaWNlRnVuYyk7XG4gICAgICAgIGNvbnN0IGRpc3BsYXllZCA9IGV4ZWNGdW5jKGRhdGEpO1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChESVNQTEFZX0NIQU5HRUQsIGRpc3BsYXllZC5tYXAoZCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHtpbmRleDogZGF0YS5pbmRleE9mKGQpLCB2YWx1ZTogZH07XG4gICAgICAgIH0pKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGFibGUuZGlzcGF0Y2goRVhFQ19FUlJPUiwgZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChFWEVDX0NIQU5HRUQsIHt3b3JraW5nOiBmYWxzZX0pO1xuICAgICAgfVxuICAgIH0sIHByb2Nlc3NpbmdEZWxheSk7XG4gIH07XG5cbiAgY29uc3QgdXBkYXRlVGFibGVTdGF0ZSA9IGN1cnJ5KChwdGVyLCBldiwgbmV3UGFydGlhbFN0YXRlKSA9PiBjb21wb3NlKFxuICAgIHNhZmVBc3NpZ24ocHRlci5nZXQodGFibGVTdGF0ZSkpLFxuICAgIHRhcChkaXNwYXRjaChldikpLFxuICAgIHB0ZXIuc2V0KHRhYmxlU3RhdGUpXG4gICkobmV3UGFydGlhbFN0YXRlKSk7XG5cbiAgY29uc3QgcmVzZXRUb0ZpcnN0UGFnZSA9ICgpID0+IHVwZGF0ZVRhYmxlU3RhdGUoc2xpY2VQb2ludGVyLCBQQUdFX0NIQU5HRUQsIHtwYWdlOiAxfSk7XG5cbiAgY29uc3QgdGFibGVPcGVyYXRpb24gPSAocHRlciwgZXYpID0+IGNvbXBvc2UoXG4gICAgdXBkYXRlVGFibGVTdGF0ZShwdGVyLCBldiksXG4gICAgcmVzZXRUb0ZpcnN0UGFnZSxcbiAgICAoKSA9PiB0YWJsZS5leGVjKCkgLy8gd2Ugd3JhcCB3aXRoaW4gYSBmdW5jdGlvbiBzbyB0YWJsZS5leGVjIGNhbiBiZSBvdmVyd3JpdHRlbiAod2hlbiB1c2luZyB3aXRoIGEgc2VydmVyIGZvciBleGFtcGxlKVxuICApO1xuXG4gIGNvbnN0IGFwaSA9IHtcbiAgICBzb3J0OiB0YWJsZU9wZXJhdGlvbihzb3J0UG9pbnRlciwgVE9HR0xFX1NPUlQpLFxuICAgIGZpbHRlcjogdGFibGVPcGVyYXRpb24oZmlsdGVyUG9pbnRlciwgRklMVEVSX0NIQU5HRUQpLFxuICAgIHNlYXJjaDogdGFibGVPcGVyYXRpb24oc2VhcmNoUG9pbnRlciwgU0VBUkNIX0NIQU5HRUQpLFxuICAgIHNsaWNlOiBjb21wb3NlKHVwZGF0ZVRhYmxlU3RhdGUoc2xpY2VQb2ludGVyLCBQQUdFX0NIQU5HRUQpLCAoKSA9PiB0YWJsZS5leGVjKCkpLFxuICAgIGV4ZWMsXG4gICAgZXZhbChzdGF0ZSA9IHRhYmxlU3RhdGUpe1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBjb25zdCBzb3J0RnVuYyA9IHNvcnRGYWN0b3J5KHNvcnRQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IHNlYXJjaEZ1bmMgPSBzZWFyY2hGYWN0b3J5KHNlYXJjaFBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgY29uc3QgZmlsdGVyRnVuYyA9IGZpbHRlckZhY3RvcnkoZmlsdGVyUG9pbnRlci5nZXQoc3RhdGUpKTtcbiAgICAgICAgICBjb25zdCBzbGljZUZ1bmMgPSBzbGljZUZhY3Rvcnkoc2xpY2VQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IGV4ZWNGdW5jID0gY29tcG9zZShmaWx0ZXJGdW5jLCBzZWFyY2hGdW5jLCBzb3J0RnVuYywgc2xpY2VGdW5jKTtcbiAgICAgICAgICByZXR1cm4gZXhlY0Z1bmMoZGF0YSkubWFwKGQgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogZGF0YS5pbmRleE9mKGQpLCB2YWx1ZTogZH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICBvbkRpc3BsYXlDaGFuZ2UoZm4pe1xuICAgICAgdGFibGUub24oRElTUExBWV9DSEFOR0VELCBmbik7XG4gICAgfSxcbiAgICBnZXRUYWJsZVN0YXRlKCl7XG4gICAgICBjb25zdCBzb3J0ID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zb3J0KTtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IE9iamVjdC5hc3NpZ24oe30sIHRhYmxlU3RhdGUuc2VhcmNoKTtcbiAgICAgIGNvbnN0IHNsaWNlID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zbGljZSk7XG4gICAgICBjb25zdCBmaWx0ZXIgPSB7fTtcbiAgICAgIGZvciAobGV0IHByb3AgaW4gdGFibGVTdGF0ZS5maWx0ZXIpIHtcbiAgICAgICAgZmlsdGVyW3Byb3BdID0gdGFibGVTdGF0ZS5maWx0ZXJbcHJvcF0ubWFwKHYgPT4gT2JqZWN0LmFzc2lnbih7fSwgdikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtzb3J0LCBzZWFyY2gsIHNsaWNlLCBmaWx0ZXJ9O1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBpbnN0YW5jZSA9IE9iamVjdC5hc3NpZ24odGFibGUsIGFwaSk7XG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGluc3RhbmNlLCAnbGVuZ3RoJywge1xuICAgIGdldCgpe1xuICAgICAgcmV0dXJuIGRhdGEubGVuZ3RoO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGluc3RhbmNlO1xufSIsImltcG9ydCBzb3J0IGZyb20gJ3NtYXJ0LXRhYmxlLXNvcnQnO1xuaW1wb3J0IGZpbHRlciBmcm9tICdzbWFydC10YWJsZS1maWx0ZXInO1xuaW1wb3J0IHNlYXJjaCBmcm9tICdzbWFydC10YWJsZS1zZWFyY2gnO1xuaW1wb3J0IHRhYmxlIGZyb20gJy4vZGlyZWN0aXZlcy90YWJsZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7XG4gIHNvcnRGYWN0b3J5ID0gc29ydCxcbiAgZmlsdGVyRmFjdG9yeSA9IGZpbHRlcixcbiAgc2VhcmNoRmFjdG9yeSA9IHNlYXJjaCxcbiAgdGFibGVTdGF0ZSA9IHtzb3J0OiB7fSwgc2xpY2U6IHtwYWdlOiAxfSwgZmlsdGVyOiB7fSwgc2VhcmNoOiB7fX0sXG4gIGRhdGEgPSBbXVxufSwgLi4udGFibGVEaXJlY3RpdmVzKSB7XG5cbiAgY29uc3QgY29yZVRhYmxlID0gdGFibGUoe3NvcnRGYWN0b3J5LCBmaWx0ZXJGYWN0b3J5LCB0YWJsZVN0YXRlLCBkYXRhLCBzZWFyY2hGYWN0b3J5fSk7XG5cbiAgcmV0dXJuIHRhYmxlRGlyZWN0aXZlcy5yZWR1Y2UoKGFjY3VtdWxhdG9yLCBuZXdkaXIpID0+IHtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihhY2N1bXVsYXRvciwgbmV3ZGlyKHtcbiAgICAgIHNvcnRGYWN0b3J5LFxuICAgICAgZmlsdGVyRmFjdG9yeSxcbiAgICAgIHNlYXJjaEZhY3RvcnksXG4gICAgICB0YWJsZVN0YXRlLFxuICAgICAgZGF0YSxcbiAgICAgIHRhYmxlOiBjb3JlVGFibGVcbiAgICB9KSk7XG4gIH0sIGNvcmVUYWJsZSk7XG59IiwiaW1wb3J0IHRhYmxlRGlyZWN0aXZlIGZyb20gJy4vc3JjL3RhYmxlJztcbmltcG9ydCBmaWx0ZXJEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9maWx0ZXInO1xuaW1wb3J0IHNlYXJjaERpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3NlYXJjaCc7XG5pbXBvcnQgc2xpY2VEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zbGljZSc7XG5pbXBvcnQgc29ydERpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3NvcnQnO1xuaW1wb3J0IHN1bW1hcnlEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zdW1tYXJ5JztcbmltcG9ydCB3b3JraW5nSW5kaWNhdG9yRGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvd29ya2luZ0luZGljYXRvcic7XG5cbmV4cG9ydCBjb25zdCBzZWFyY2ggPSBzZWFyY2hEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgc2xpY2UgPSBzbGljZURpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBzdW1tYXJ5ID0gc3VtbWFyeURpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBzb3J0ID0gc29ydERpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBmaWx0ZXIgPSBmaWx0ZXJEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgd29ya2luZ0luZGljYXRvciA9IHdvcmtpbmdJbmRpY2F0b3JEaXJlY3RpdmU7XG5leHBvcnQgY29uc3QgdGFibGUgPSB0YWJsZURpcmVjdGl2ZTtcbmV4cG9ydCBkZWZhdWx0IHRhYmxlO1xuIiwiZXhwb3J0IGRlZmF1bHQgW1xuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3Ny9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3N1wiLFxuICAgIFwiaWRcIjogMjMzMTIwNTQ4LFxuICAgIFwibnVtYmVyXCI6IDc3NyxcbiAgICBcInRpdGxlXCI6IFwiQWRqdXN0bWVudHMgZm9yIEFuZ3VsYXIgMS42XCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJNcldvb2tcIixcbiAgICAgIFwiaWRcIjogMjAyOTQwNDIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzIwMjk0MDQyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29va1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9Ncldvb2tcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA2LTAyVDA5OjA1OjA2WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDYtMDZUMTU6MDQ6NDJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzc3XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3XCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3LmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3LnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIkNhdGNoIHRpbWVvdXQgcHJvbWlzZSBvbiBjYW5jZWwgYmVjYXVzZSBpdCB3aWxsIHRocm93IGFuIGVycm9yIGluIEFuZ3VsYXIgMS42XCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzUvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NVwiLFxuICAgIFwiaWRcIjogMjMyOTM5MDI0LFxuICAgIFwibnVtYmVyXCI6IDc3NSxcbiAgICBcInRpdGxlXCI6IFwiSG93IHRvIHNvcnQgd2hlbiBtb3JlIHRoYW4gb25lIHNpbmdsZSBwcm9wZXJ0eSB2YWx1ZSBpcyBnaXZlbiBwcm8gY29sdW1uIFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiYnZhaGRhdFwiLFxuICAgICAgXCJpZFwiOiAzMTIyMTc3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS8zMTIyMTc3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vYnZhaGRhdFwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDYtMDFUMTY6MzY6MTNaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNi0wMVQxODo1Mzo0NFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIlVzaW5nIGBhbmd1bGFyanMgMS41LjlgIGFzc3VtZSB0d28gZ2l2ZW4gcHJvcGVydGllcyBzdWNoIGFzIGBmb29gIGFuZCBgYmFyYCBiZWluZyBib3VuZCB0byBhIHNpbmdsZSBjb2x1bW4uXFxyXFxuSXMgdGhlcmUgYW55IHdheSB0byBpbnN0cnVjdCBgc3Qtc29ydGAgdG8gZWl0aGVyIHNvcnQgYWNjb3JkaW5nIHRvIHRoZSBgZm9vYCBvciBgYmFyYCB2YWx1ZXMuIFRoYXQncyBzb21ldGhpbmcgYWxvbmcgdGhlIGZvbGxvd2luZyBsaW5lczpcXHJcXG5cXHJcXG5gYGBodG1sXFxyXFxuPHRoIHN0LXNvcnQ9XFxcIltmaXJzdE5hbWUsIGxhc3ROYW1lXVxcXCI+Zmlyc3QgbmFtZSA8YnIgLz4gbGFzdCBuYW1lPC90aD5cXHJcXG5gYGBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzRcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzQvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzQvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc0XCIsXG4gICAgXCJpZFwiOiAyMzAxMTg2NTMsXG4gICAgXCJudW1iZXJcIjogNzc0LFxuICAgIFwidGl0bGVcIjogXCJTbWFydCBUYWJsZSBwYWdpbmcgaXMgc2hvd2luZyBtb3JlIHBhZ2VzIHRoYW4gZXhwZWN0ZWRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIm1vc3RhZmFhc2FkXCIsXG4gICAgICBcImlkXCI6IDc2MjU1MzAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzc2MjU1MzA/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbW9zdGFmYWFzYWRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjI1ODYyNDIzLFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL25vdCUyMHJlcHJvZHVjaWJsZVwiLFxuICAgICAgICBcIm5hbWVcIjogXCJub3QgcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwiY29sb3JcIjogXCJlYjY0MjBcIixcbiAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBcImlkXCI6IDI1OTQzODUwNixcbiAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2xhYmVscy90byUyMGJlJTIwY2xvc2VkOiUyMGRvZXMlMjBub3QlMjBmb2xsb3clMjBndWlkZWxpbmVzXCIsXG4gICAgICAgIFwibmFtZVwiOiBcInRvIGJlIGNsb3NlZDogZG9lcyBub3QgZm9sbG93IGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImZiY2EwNFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH1cbiAgICBdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAzLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDUtMjBUMDA6NDE6NDFaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNS0yMlQxODozOTo1MVpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgYW0gdXNpbmcgU21hcnQgdGFibGUgaW4gYW5ndWxhcmpzIGFwcGxpY2F0aW9uLiBJbiB0aGUgcGFnaW5hdGlvbiBpdCBpcyBzaG93aW5nIGV4dHJhIHBhZ2VzIHdoaWNoIGRvbid0IGhhdmUgdGhlIGRhdGEuIEhvdyBjYW4gSSBkaXNwbGF5IHRoZSBleGFjdCBudW1iZXIgb2YgcGFnZXMgaW5zdGVhZCBvZiBleHRyYSBwYWdlcz9cXHJcXG5cXHJcXG5Gb3IgY2xhcmlmaWNhdGlvbiwgSSBoYXZlIDk0IHJlY29yZHMsIDE1IHBlciBwYWdlIHNvIHRoZXJlIHdpbGwgYmUgNyBwYWdlcyAsIGJ1dCB0aGUgcGFnaW5hdGlvbiBpcyBzaG93aW5nIDEwIHBhZ2VzLCBhZnRlciA3dGggcGFnZSB0aGVyZSBpcyBubyBkYXRhIGluIDgtMTB0aCBwYWdlcy5cXHJcXG5QbGVhc2Ugc3VnZ2VzdCBob3cgY2FuIEkgcmVzb2x2ZSB0aGlzLlxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3M1wiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzczL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3My9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3My9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczXCIsXG4gICAgXCJpZFwiOiAyMjcyNzU5MDAsXG4gICAgXCJudW1iZXJcIjogNzczLFxuICAgIFwidGl0bGVcIjogXCJGaXg6IFBhcnNlIGluaXRpYWwgcHJlZGljYXRlIGNvcnJlY3RseVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiZzAwZnktXCIsXG4gICAgICBcImlkXCI6IDg0MzgwNyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODQzODA3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9nMDBmeS1cIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA1LTA5VDA3OjM1OjE2WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDUtMDlUMDc6NDc6MzZaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzczXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczXCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczLmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczLnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIlRoaXMgYnVnIGNhdXNlZCBvdGhlciBwbHVnaW5zIG5vdCB0byB3b3JrIGNvcnJlY3RseS5cXHJcXG5UaGUgaW5pdGlhbCBwcmVkaWNhdGUgd2Fzbid0IHBhcnNlZCB0aGUgc2FtZSB3YXkgaXQgd2FzIHBhcnNlZCBhZnRlciBjbGljayAtIHdoaWNoIHJlc3VsdGVkIGluIHRoZSBhcnJvd3Mgbm90IHBvaW50aW5nIHRoZSByaWdodCBkaXJlY3Rpb24uXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MlwiLFxuICAgIFwiaWRcIjogMjI1NDIyOTkyLFxuICAgIFwibnVtYmVyXCI6IDc3MixcbiAgICBcInRpdGxlXCI6IFwiUmVmcmVzaCB0YWJsZSB3aXRoIHdpdGggb3V0IHBhZ2UgbG9hZFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic21vaGFtbWVkeWFzaW5cIixcbiAgICAgIFwiaWRcIjogMjU1NjUxNDIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzI1NTY1MTQyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3Ntb2hhbW1lZHlhc2luXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNS0wMVQxMTo0MjoxMVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA1LTAxVDE4OjEyOjQ3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGVsbG8sXFxyXFxuXFxyXFxuVGhpcyBpcyBub3QgYW4gaXNzdWUsXFxyXFxuXFxyXFxuSSB3YW50IHRvIGtub3cgaG93IHRvIHJlZnJlc2ggdGFibGUgd2l0aCBvdXQgcmVsb2FkIGNvbXBsZXRlIHBhZ2UuIGFuZCBpJ20gdXNpbmcgaHR0cCQgZm9yIENSVURcXHJcXG5cXHJcXG5wbGVhc2UgZ2l2ZSBtZSBhbnkgZXhhbXBsZSB3aGljaCBpcyB1c2luZyBzZXJ2ZXIgc2lkZSBkYXRhLlxcclxcblxcclxcbkFwcHJlY2lhdGUgZm9yIHF1aWNrIGFuZCBiZXN0IHJlc3BvbnNlLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcxL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzcxXCIsXG4gICAgXCJpZFwiOiAyMjUzMzE3ODYsXG4gICAgXCJudW1iZXJcIjogNzcxLFxuICAgIFwidGl0bGVcIjogXCJDdXN0b20gZmlsdGVyc1wiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwicmljaGFyZC1hdXN0aW5cIixcbiAgICAgIFwiaWRcIjogMTQzMTY0NjYsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0MzE2NDY2P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3JpY2hhcmQtYXVzdGluXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNC0zMFQxNDo0OTo1MlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA0LTMwVDE0OjQ5OjUyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc3MVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MVwiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MS5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MS5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzBcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzAvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzAvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcwXCIsXG4gICAgXCJpZFwiOiAyMjQxNjExOTUsXG4gICAgXCJudW1iZXJcIjogNzcwLFxuICAgIFwidGl0bGVcIjogXCJGaWx0ZXIgd2l0aCBjbGljayBvZiBhIGJ1dHRvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiRm9zc2lsMDFcIixcbiAgICAgIFwiaWRcIjogODgzMjY4NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODgzMjY4Nz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9Gb3NzaWwwMVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDQtMjVUMTQ6Mzg6MTZaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNC0yNlQxMjozNDo1M1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgd291bGQgbGlrZSB0byBmaWx0ZXIgc29tZSB0YWJsZSBjb2x1bW5zIGJ5IHRoZSBjbGljayBvZiBhIGJ1dHRvbi4gSXMgdGhpcyBwb3NzaWJsZSBhbmQgaWYgc28sIGhvdz9cXHJcXG5cXHJcXG5MZXRzIHNheSBJIGhhdmUgYSBjb2x1bW4gVVNFUlMgd2l0aCAzIHJvd3M6IEpvaG4sIEpvaG4sIFdpbGxpYW0uXFxyXFxuXFxyXFxuTm93IEkgaGF2ZSBhIGJ1dHRvbjpcXHJcXG5gPGJ1dHRvbiBuZy1jbGljaz1cXFwiZmlsdGVyKCdKb2huJylcXFwiPkpvaG48L2J1dHRvbj5gXFxyXFxuVGhpcyBzaG91bGQgbWFrZSB0aGUgdGFibGUgb25seSBzaG93IFVzZXJzLkpvaG4uXFxyXFxuXFxyXFxuVGhpcyBidXR0b24gd291bGQgcHJlZmVyYWJseSBiZSBwbGFjZWQgb3V0c2lkZSBvZiB0aGUgdGFibGUuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NjkvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc2OVwiLFxuICAgIFwiaWRcIjogMjIxNzUyNzIwLFxuICAgIFwibnVtYmVyXCI6IDc2OSxcbiAgICBcInRpdGxlXCI6IFwiU29ydGluZyB3aXRoIGFzeW5jaHJvbm91c2x5IHJlY2VpdmVkIGRhdGFcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImJsYWNraGVhcnRlZFwiLFxuICAgICAgXCJpZFwiOiA0NjAxNzE3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS80NjAxNzE3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9ibGFja2hlYXJ0ZWRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA0LTE0VDA2OjQ0OjA4WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDQtMTRUMTQ6MDE6MjZaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJJZiBkYXRhIGlzIHJlY2VpdmVkIGFzeW5jaHJvbm91c2x5IGFuZCBub3QgYXZhaWxhYmxlIGF0IHRoZSBtb21lbnQgb2YgdGFibGUgY3JlYXRpb24gLSB0YWJsZSBpcyBzb3J0ZWQgZGlmZmVyZW50bHkuXFxyXFxuXFxyXFxuRGF0YSBcXFwicmVjZWl2ZWRcXFwiXFxyXFxuJHNjb3BlLmRpc3BsYXllZC5wdXNoKHtcXHJcXG4gICAgICAgIGZpcnN0TmFtZTogXFxcIkExXFxcIixcXHJcXG4gICAgICAgIGJhbGFuY2U6IDMwMFxcclxcbiAgICAgIH0pO1xcclxcbiAgICAgICRzY29wZS5kaXNwbGF5ZWQucHVzaCh7XFxyXFxuICAgICAgICBmaXJzdE5hbWU6IFxcXCJBMlxcXCIsXFxyXFxuICAgICAgICBiYWxhbmNlOiAyMDBcXHJcXG4gICAgICB9KTtcXHJcXG4gICAgICAkc2NvcGUuZGlzcGxheWVkLnB1c2goe1xcclxcbiAgICAgICAgZmlyc3ROYW1lOiBcXFwiQTNcXFwiLFxcclxcbiAgICAgICAgYmFsYW5jZTogMTAwXFxyXFxuICAgICAgfSk7XFxyXFxuXFxyXFxuSWYgaXQgaXMgd2l0aGluICR0aW1lb3V0IHRhYmxlIHdpbGwgbG9vayBsaWtlLiBOb3RlIHNvcnRpbmcgaWNvbiBvbiBiYWxhbmNlIGNvbHVtbiBpcyB3cm9uZzpcXHJcXG5odHRwOi8vcGxua3IuY28vZWRpdC84QjBKeThicTFCRFBkblU2YkZHbD9wPXByZXZpZXdcXHJcXG5maXJzdCBuYW1lXFx0YmFsYW5jZVxcclxcbkExXFx0ICAgICAgICAgICAgICAgIDMwMFxcclxcbkEyXFx0ICAgICAgICAgICAgICAgIDIwMFxcclxcbkEzXFx0ICAgICAgICAgICAgICAgIDEwMFxcclxcblxcclxcbklmIGl0IGlzIHN5bmNocm9ub3VzOlxcclxcbmh0dHA6Ly9wbG5rci5jby9lZGl0L3J1ZjJMdW5ERjNwUVVNWENEMFp6P3A9cHJldmlld1xcclxcbmZpcnN0IG5hbWVcXHRiYWxhbmNlXFxyXFxuQTNcXHQgICAgICAgICAgICAgICAgMTAwXFxyXFxuQTJcXHQgICAgICAgICAgICAgICAgMjAwXFxyXFxuQTFcXHQgICAgICAgICAgICAgICAgMzAwXFxyXFxuXFxyXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NTRcIixcbiAgICBcImlkXCI6IDIxMTk0ODk2MyxcbiAgICBcIm51bWJlclwiOiA3NTQsXG4gICAgXCJ0aXRsZVwiOiBcImFsbG93IGltcGxpY2l0IHRydWUgYXR0cmlidXRlcyBpbiBzdFNvcnRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImRiZWluZGVyXCIsXG4gICAgICBcImlkXCI6IDM0Mjk1NSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMzQyOTU1P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2RiZWluZGVyXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMy0wNVQxMjoxNzoyN1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAzLTA1VDEyOjE3OjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc1NFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NFwiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NC5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NC5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJUaGlzIHdvdWxkIGFsbG93IHNob3J0ZXIgYXR0cmlidXRlcyBvbiB0aGUgc29ydCBhdHRyaWJ1dGVzLCBhbmQgZGVmYXVsdHMgXFxcIlxcXCIgdG8gdHJ1ZSBwcm92aWRlZCB0aGUgYXR0cmlidXRlIGlzIGRlZmluZWQuXFxyXFxuYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3QtZGVzY2VuZGluZy1maXJzdD1cXFwidHJ1ZVxcXCIgLz5gIHRvIGA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LWRlc2NlbmRpbmctZmlyc3QgLz5gIFxcclxcbmA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNraXAtbmF0dXJhbD1cXFwidHJ1ZVxcXCIgLz5gIHRvIGA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNraXAtbmF0dXJhbCAvPmAgXFxyXFxuYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3Qtc29ydC1kZWZhdWx0PVxcXCJ0cnVlXFxcIiAvPmAgdG8gYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3Qtc29ydC1kZWZhdWx0IC8+YCBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1My9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUzXCIsXG4gICAgXCJpZFwiOiAyMTE2MjY4MzQsXG4gICAgXCJudW1iZXJcIjogNzUzLFxuICAgIFwidGl0bGVcIjogXCJTYWZlIHNyYyB3YXRjaCBjb2xsZWN0aW9uXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJ2aWFuZGFudGVvc2N1cm9cIixcbiAgICAgIFwiaWRcIjogNDIzNTA3OSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczMuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvNDIzNTA3OT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm9cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vdmlhbmRhbnRlb3NjdXJvXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMy0wM1QwODozOTo0OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAzLTAzVDA4OjQwOjEzWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgdG8gYWxsIVxcclxcblxcclxcbkkgdXNlIHRoZSB4ZWRpdGFibGUgb24gZWFjaCBjZWxsLCBldmVyeSBlZGl0IGkgZW1pdCBhIHNvY2tldCBldmVudCB0aGF0IHJlZnJlc2ggZWxlbWVudHMgaW4gZXZlcnkgdXNlciBpcyAgdXNpbmcgdGhlIHRhYmxlLlxcclxcblxcclxcbkkgaGF2ZSBhIHByb2JsZW0gd2l0aCB0aGUgc3Qtc2FmZS1zcmMgYXR0cmlidXRlLlxcclxcblxcclxcbkkgYnVpbGQgdGhlIHRhYmxlIHdpdGggYW4gb2JqZWN0IGxpa2UgdGhpczpcXHJcXG5cXHJcXG5gYGBqYXZhc2NyaXB0XFxyXFxucm93cyA9IFtcXHJcXG4gIHtcXHJcXG4gICAgIGlkOiA0NTYsXFxyXFxuICAgICBkYXRhOiBbXFxyXFxuICAgICAgIHtcXHJcXG4gICAgICAgICAgdmFsdWU6ICcnLFxcclxcbiAgICAgICAgICBuYW1lOiAnJ1xcclxcbiAgICAgICAgfSxcXHJcXG4gICAgICAgIC4uLi5cXHJcXG4gICAgIF1cXHJcXG4gIH0sXFxyXFxuICB7IC4uLiB9LCBcXHJcXG4gIC4uLlxcclxcbl1cXHJcXG5gYGBcXHJcXG5cXHJcXG5Tby4uLiBpbiB0aGUgbmctcmVwZWF0IG9mIHRyIGVsZW1lbnRzIGkgbmVlZCB0aGUgaWQgYXR0cmlidXRlIG9mIGVhY2ggcm93LCBidXQgdGhlIHRkIGVsZW1lbnRzIGFyZSB0aG9zZSBvZiB0aGUgYXJyYXkgJ2RhdGEnIG9mIGVhY2ggcm93LlxcclxcblxcclxcbldoZW4gaSBlZGl0IGEgdmFsdWUsIHRoZSBzb2NrZXQgZXZlbnQgaXMgZW1pdHRlZCwgYnV0IHRoZSBjb2xsZWN0aW9uIG9uIHRoZSBvdGhlciB1c2VyIGlzIG5vdCByZWZyZXNoZWQuLi4gc28sIHRoZSB2YWx1ZXMgYXJlIG5vdCB1cGRhdGVkLiBCdXQgaWYgaSBhZGQgYSByb3csIHRoZSB0YWJsZSBvbiB0aGUgb3RoZXIgdXNlcnMgaXMgcmVmcmVzaGVkLi4uIG9ubHkgdGhlIHZhbHVlcyBpbiB0aGUgY2VsbHMgYXJlIG91dCBvZiBkYXRlLlxcclxcblxcclxcbklmIGkgZG9uJ3QgdXNlIHNtYXJ0IHRhYmxlIGFsbCB3b3JrcyBmaW5lLCBidXQgaSBwcmVmZXIgdGhlIHNtYXJ0IHRhYmxlLlxcclxcblxcclxcbkluIHRoZSBjb2RlIG9mIHNtYXJ0IHRhYmxlIHRoZXJlIGlzIGEgd2F0Y2gsIGJ1dCBpIG5lZWQgYSB3YXRjaGNvbGxlY3Rpb24sIGlzIGl0IHBvc3NpYmxlP1xcclxcblxcclxcbkhvdz9cXHJcXG5cXHJcXG5UaGFua3NcXHJcXG5cXHJcXG5NYXNzaW1vXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1MlwiLFxuICAgIFwiaWRcIjogMjA5OTQ5MzM3LFxuICAgIFwibnVtYmVyXCI6IDc1MixcbiAgICBcInRpdGxlXCI6IFwiVXBkYXRlIHNtYXJ0LXRhYmxlIGJ5IFdlYlNvY2tldFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiSHlwZXJGbHlcIixcbiAgICAgIFwiaWRcIjogODk5MzcwNSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODk5MzcwNT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9IeXBlckZseVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAyLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDItMjRUMDM6MTc6NDlaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMi0yNFQxMDo0NzoyNlpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIlRoZXJlIGFyZSAyIHRhYnMgaW4gdGhlIGNvbnRhaW5lci5cXHJcXG5FYWNoIHRhYiBoYXMgYSBzbWFydC10YWJsZSBpbiBpdC5cXHJcXG5cXHJcXG4gMS4gVXNlciBjbGlja3Mgb24gdGhlIHRhYi5cXHJcXG5cXHJcXG4gICAgXFx0JCgnYVtkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIl0nKS5vbignc2hvd24uYnMudGFiJywgZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHR2YXIgdGFyZ2V0ID0gJChlLnRhcmdldCkuYXR0cihcXFwiaHJlZlxcXCIpIC8vIGFjdGl2YXRlZCB0YWJcXHJcXG5cXHRcXHRcXHR2YXIgcmVsYXRlZFRhcmdldCA9ICQoZS5yZWxhdGVkVGFyZ2V0KS5hdHRyKFxcXCJocmVmXFxcIilcXHJcXG5cXHRcXHRcXHRpZiAodGFyZ2V0ID09IFxcXCIjdGFiMVxcXCIpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIxJykuZ2V0X3JlY29yZHMoKTtcXHJcXG5cXHRcXHRcXHR9IGVsc2UgaWYgKHRhcmdldCA9PSBcXFwiI3RhYjJcXFwiKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMicpLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH0pXFxyXFxuXFxyXFxuIDIuIENhbGwgc2VydmVyIHRvIGdldCBhbGwgcmVjb3JkIGFuZCBkaXNwbGF5IG9uIHRoZSB0YWJsZS4ob25seSBmaXJzdCB0aW1lKVxcclxcblxcclxcbiAgICBcXHQkc2NvcGUuZ290X3RhYjFfcmVjb3JkcyA9IGZhbHNlO1xcclxcblxcdFxcdCRzY29wZS5nZXRfcmVjb3JkcyA9IGZ1bmN0aW9uICgpIHtcXHJcXG5cXHRcXHRcXHRpZigkc2NvcGUuZ290X3RhYjFfcmVjb3JkcykgcmV0dXJuO1xcclxcblxcdFxcdFxcdHZhciB0b2RheSA9IG5ldyBEYXRlKCkudG9KU09OKCkuc2xpY2UoMCwxMCk7XFxyXFxuXFx0XFx0XFx0dmFyIHVybCA9IEZsYXNrLnVybF9mb3IoJ3JlY29yZGVyLnJlY29yZF9saXN0Jywge2luZm9fdHlwZTogMSwgZnJvbV9kYXRlOiB0b2RheSwgdG9fZGF0ZTogdG9kYXl9KTtcXHJcXG5cXHRcXHRcXHQkaHR0cC5nZXQodXJsKS5zdWNjZXNzKFxcclxcblxcdFxcdFxcdFxcdGZ1bmN0aW9uKGRhdGEpe1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS50YWIxX3JlY29yZHMgPSBkYXRhO1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3JkcyA9IFtdLmNvbmNhdCgkc2NvcGUudGFiMV9yZWNvcmRzKTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuZ290X3RhYjFfcmVjb3JkcyA9IHRydWU7XFxyXFxuXFx0XFx0XFx0XFx0fVxcclxcblxcdFxcdFxcdCkuZXJyb3IoZnVuY3Rpb24ocmVzcG9uc2Upe1xcclxcblxcdFxcdFxcdFxcdGFsZXJ0KHJlc3BvbnNlKTtcXHJcXG5cXHRcXHRcXHR9KS5maW5hbGx5KGZ1bmN0aW9uICgpe1xcclxcblxcdFxcdFxcdH0pO1xcclxcblxcdFxcdH1cXHJcXG5cXHJcXG4gMy4gSWYgdGhlcmUgaXMgYSBuZXcgcmVjb3JkLCBnZXQgdGhlIHJlY29yZCBmcm9tIFdlYlNvY2tldC5cXHJcXG5cXHJcXG4gICAgXFx0dmFyIHVybCA9IFxcXCJ3czovL1xcXCIgKyB3aW5kb3cubG9jYXRpb24uaHJlZi5yZXBsYWNlKC9odHRwcz86XFxcXC9cXFxcLy8sJycpLnJlcGxhY2UoL1xcXFwvLiovLCcnKSArIFxcXCIvd3NcXFwiO1xcclxcblxcdFxcdHZhciB3cyA9IG5ldyBXZWJTb2NrZXQodXJsKTtcXHJcXG5cXHRcXHR3cy5vbmVycm9yID0gZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHRhbGVydChlKTtcXHJcXG5cXHRcXHRcXHRjb25zb2xlLmxvZyhcXFwiV2ViU29ja2V0IEVycm9yXFxcIiArIGUpO1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKGUpO1xcclxcblxcdFxcdH1cXHJcXG5cXHRcXHR3cy5vbmNsb3NlID0gZnVuY3Rpb24gKCkge1xcclxcblxcdFxcdFxcdGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFxcXCJsb2dvXFxcIikuc3R5bGUuY29sb3IgPSBcXFwiZ3JheVxcXCI7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdHdzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChlKSB7XFxyXFxuXFx0XFx0XFx0dmFyIG9iaiA9IEpTT04ucGFyc2UoZS5kYXRhKTtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuYXBwZW5kX3JlY29yZChvYmouc3RhdGUsIG9iai5yZWNvcmQpO1xcclxcblxcdFxcdH1cXHJcXG4gICAgXFx0JHNjb3BlLmFwcGVuZF9yZWNvcmQgPSBmdW5jdGlvbihpbmZvX3R5cGUsIHJlY29yZCl7XFxyXFxuICAgICAgICBcXHRpZiAoaW5mb190eXBlID09IDEpIHtcXHJcXG4gICAgICAgICAgICBcXHRTY29wZXMuZ2V0KCd0YWIxJykudW5zaGlmdF9yZWNvcmQocmVjb3JkKTtcXHJcXG4gICAgICAgIFxcdH0gZWxzZSBpZiAoaW5mb190eXBlID09IDIpIHtcXHJcXG4gICAgICAgICAgICBcXHRTY29wZXMuZ2V0KCd0YWIyJykuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdChKU09OLnBhcnNlKHJlY29yZCkpO1xcclxcbiAgICAgICAgXFx0fVxcclxcbiAgICBcXHR9O1xcclxcblxcclxcbiA0LiBVbnNoaWZ0IHRoZSByZWNvcmQgb24gdGhlIHN0LXNhZmUtc3JjIGFuZCByZWZyZXNoIHRoZSB0YWJsZS5cXHJcXG5cXHJcXG4gICAgIFxcdCRzY29wZS51bnNoaWZ0X3JlY29yZCA9IGZ1bmN0aW9uIChyZWNvcmQpIHtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdChKU09OLnBhcnNlKHJlY29yZCkpO1xcclxcblxcdFxcdH07XFx0XFxyXFxuXFxyXFxuTXkgcXVlc3Rpb24gaXMgdGhlIHN0ZXAgNCBkaWQgbm90IHJlZnJlc2ggdGhlIHRhYmxlLlxcclxcbk9ubHkgaWYgSSBjbGljayBvbiBhbm90aGVyIHRhYiB0aGVuIGNsaWNrIG9uIHRoZSBvcmlnaW5hbCB0YWIuXFxyXFxuQnV0LCBjbGljayBvbiB0aGUgYnV0dG9uIGluIHRoZSB0YWIxIGl0IHdpbGwgdW5zaGlmdCBhIHJlY29yZCBhbmQgZGlzcGxheSBvbiB0aGUgZmlyc3Qgcm93IG9mIHRoZSB0YWJsZS5cXHJcXG5cXHJcXG4gICAgXFx0JHNjb3BlLmFkZFJhbmRvbUl0ZW0gPSBmdW5jdGlvbiBhZGRSYW5kb21JdGVtKCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicxJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFxyXFxuQWxzbywgSSBoYXZlIGEgcXVlc3Rpb24uXFxyXFxuV2h5IHRoZSBzdC1wYWdlc2l6ZWxpc3Q9XFxcIjEwLDUwLDEwMCwxMDAwXFxcIiBkaWQgbm90IHdvcmsgP1xcclxcblxcclxcbkkgaGF2ZSBbcGx1bmtlcl1bMV0gdG8gc2hvdyB0aGlzIHByb2JsZW0uIEJ1dCBJIGRvbid0IGtub3cgaG93IHRvIHNpbXVsYXRlIFdlYlNvY2tldC5cXHJcXG5cXHJcXG5cXHJcXG5IdG1sOlxcclxcblxcclxcbiAgICA8ZGl2IGlkPVxcXCJyaWdodF9jb250YWluZXJcXFwiIHN0eWxlPVxcXCJwb3NpdGlvbjogYWJzb2x1dGU7IHdpZHRoOiAzOCU7IGhlaWdodDogY2FsYygxMDAlIC0gMTA3cHgpOyByaWdodDogMHB4O1xcXCI+XFxyXFxuXFx0XFx0PHVsIGNsYXNzPVxcXCJuYXYgbmF2LXRhYnNcXFwiPlxcclxcblxcdFxcdFxcdDxsaSBjbGFzcz1cXFwiYWN0aXZlXFxcIj48YSBkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIiBocmVmPVxcXCIjdGFiMVxcXCI+dGFiMTwvYT48L2xpPlxcclxcblxcdFxcdFxcdDxsaSBjbGFzcz1cXFwiXFxcIj48YSBkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIiBocmVmPVxcXCIjdGFiMlxcXCI+dGFiMjwvYT48L2xpPlxcclxcblxcdFxcdDwvdWw+XFxyXFxuXFx0XFx0PGRpdiBjbGFzcz1cXFwidGFiLWNvbnRlbnRcXFwiPlxcclxcblxcdFxcdFxcdDxkaXYgaWQ9XFxcInRhYjFcXFwiIGNsYXNzPVxcXCJ0YWItcGFuZSBmYWRlIGluIGFjdGl2ZVxcXCIgbmctY29udHJvbGxlcj1cXFwidGFiMVxcXCIgc3R5bGU9XFxcInBvc2l0aW9uOiBhYnNvbHV0ZTsgd2lkdGg6IDEwMCU7IGhlaWdodDogY2FsYygxMDAlIC0gNDJweCk7IHRvcDogNDJweDtcXFwiPlxcclxcblxcdFxcdFxcdFxcdDxidXR0b24gdHlwZT1cXFwiYnV0dG9uXFxcIiBuZy1jbGljaz1cXFwiYWRkUmFuZG9tSXRlbShyb3cpXFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1zbSBidG4tc3VjY2Vzc1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PGkgY2xhc3M9XFxcImdseXBoaWNvbiBnbHlwaGljb24tcGx1c1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC9pPiBBZGQgcmFuZG9tIGl0ZW1cXHJcXG5cXHRcXHRcXHRcXHQ8L2J1dHRvbj5cXHJcXG5cXHRcXHRcXHRcXHQ8dGFibGUgc3QtdGFibGU9XFxcInRhYjFfcmVjb3Jkc1xcXCIgc3Qtc2FmZS1zcmM9XFxcInNhZmVfdGFiMV9yZWNvcmRzXFxcIiBjbGFzcz1cXFwidGFibGUgdGFibGUtc3RyaXBlZFxcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRoZWFkPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogIzJBNjZBQjsgY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPnRpbWU8L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD5kZXZpY2U8L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIHN0eWxlPVxcXCJiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD48aW5wdXQgc3Qtc2VhcmNoPVxcXCJ0aW1lXFxcIiBjbGFzcz1cXFwiZm9ybS1jb250cm9sXFxcIiBwbGFjZWhvbGRlcj1cXFwidGltZSBzZWFyY2ggLi4uXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiAvPjwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPjxpbnB1dCBzdC1zZWFyY2g9XFxcImRldmljZVxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgcGxhY2Vob2xkZXI9XFxcImRldmljZSBzZWFyY2ggLi4uXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiAvPjwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RoZWFkPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0Ym9keSBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgbmctcmVwZWF0PVxcXCJyZWNvcmQgaW4gdGFiMV9yZWNvcmRzXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGQ+eyRyZWNvcmQuX2RhdGV0aW1lJH08L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0ZD57JHJlY29yZC5fZGV2aWNlJH08L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90Ym9keT5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGZvb3Q+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRyPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdFxcdDx0ZCBjb2xzcGFuPVxcXCI0XFxcIiBjbGFzcz1cXFwidGV4dC1jZW50ZXJcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdFxcdFxcdDxkaXYgc3QtcGFnaW5hdGlvbj1cXFwiXFxcIiBzdC1pdGVtcy1ieS1wYWdlPVxcXCIxMFxcXCIgc3QtZGlzcGxheWVkLXBhZ2VzPVxcXCI3XFxcIiBzdC1wYWdlc2l6ZWxpc3Q9XFxcIjEwLDUwLDEwMCwxMDAwXFxcIj48L2Rpdj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHQ8L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90Zm9vdD5cXHJcXG5cXHRcXHRcXHRcXHQ8L3RhYmxlPlxcclxcblxcdFxcdFxcdDwvZGl2PlxcclxcblxcdFxcdFxcdDxkaXYgaWQ9XFxcInRhYjJcXFwiIGNsYXNzPVxcXCJ0YWItcGFuZSBmYWRlXFxcIiBuZy1jb250cm9sbGVyPVxcXCJ0YWIyXFxcIiBzdHlsZT1cXFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogMTAwJTsgaGVpZ2h0OiBjYWxjKDEwMCUgLSA0MnB4KTsgdG9wOiA0MnB4O1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0PHRhYmxlIHN0LXRhYmxlPVxcXCJ0YWIyX3JlY29yZHNcXFwiIHN0LXNhZmUtc3JjPVxcXCJzYWZlX3RhYjJfcmVjb3Jkc1xcXCIgY2xhc3M9XFxcInRhYmxlIHRhYmxlLXN0cmlwZWRcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6ICMyQTY2QUI7IGNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD50aW1lPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+ZGV2aWNlPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+PGlucHV0IHN0LXNlYXJjaD1cXFwidGltZVxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgcGxhY2Vob2xkZXI9XFxcInRpbWUgc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD48aW5wdXQgc3Qtc2VhcmNoPVxcXCJkZXZpY2VcXFwiIGNsYXNzPVxcXCJmb3JtLWNvbnRyb2xcXFwiIHBsYWNlaG9sZGVyPVxcXCJkZXZpY2Ugc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGJvZHkgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIG5nLXJlcGVhdD1cXFwicmVjb3JkIGluIHRhYjJfcmVjb3Jkc1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRkPnskcmVjb3JkLl9kYXRldGltZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGQ+eyRyZWNvcmQuX2RldmljZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGJvZHk+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRmb290PlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHQ8dGQgY29sc3Bhbj1cXFwiNFxcXCIgY2xhc3M9XFxcInRleHQtY2VudGVyXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHRcXHQ8ZGl2IHN0LXBhZ2luYXRpb249XFxcIlxcXCIgc3QtaXRlbXMtYnktcGFnZT1cXFwiMTBcXFwiIHN0LWRpc3BsYXllZC1wYWdlcz1cXFwiN1xcXCIgc3QtcGFnZXNpemVsaXN0PVxcXCIxMCw1MCwxMDAsMTAwMFxcXCI+PC9kaXY+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0XFx0PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGZvb3Q+XFxyXFxuXFx0XFx0XFx0XFx0PC90YWJsZT5cXHJcXG5cXHRcXHRcXHQ8L2Rpdj5cXHJcXG5cXHRcXHQ8L2Rpdj5cXHJcXG5cXHQ8L2Rpdj5cXHJcXG5cXHJcXG5KYXZhc2NyaXB0OlxcclxcblxcclxcbiAgICA8c2NyaXB0IHNyYz1cXFwiL3N0YXRpY3Mvc2NyaXB0cy9hbmd1bGFyLm1pbi5qc1xcXCI+PC9zY3JpcHQ+XFxyXFxuXFx0PHNjcmlwdCBzcmM9XFxcIi9zdGF0aWNzL3NjcmlwdHMvU21hcnQtVGFibGUtMi4xLjgvc21hcnQtdGFibGUubWluLmpzXFxcIj48L3NjcmlwdD5cXHJcXG5cXHQ8c2NyaXB0PlxcclxcblxcdHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnbWFwJywgWydzbWFydC10YWJsZSddKTtcXHJcXG5cXHRhcHAgPSBhbmd1bGFyLm1vZHVsZSgnbWFwJykuY29uZmlnKGZ1bmN0aW9uICgkaHR0cFByb3ZpZGVyLCAkaW50ZXJwb2xhdGVQcm92aWRlcikge1xcclxcblxcdFxcdCRodHRwUHJvdmlkZXIuZGVmYXVsdHMuaGVhZGVycy5jb21tb25bJ1gtUmVxdWVzdGVkLVdpdGgnXSA9ICdYTUxIdHRwUmVxdWVzdCc7XFxyXFxuXFx0XFx0JGludGVycG9sYXRlUHJvdmlkZXIuc3RhcnRTeW1ib2woJ3skJyk7XFxyXFxuXFx0XFx0JGludGVycG9sYXRlUHJvdmlkZXIuZW5kU3ltYm9sKCckfScpO1xcclxcblxcdH0pO1xcclxcblxcdGFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUpIHtcXHJcXG5cXHRcXHQkcm9vdFNjb3BlLiRvbignc2NvcGUuc3RvcmVkJywgZnVuY3Rpb24gKGV2ZW50LCBkYXRhKSB7XFxyXFxuXFx0XFx0XFx0Y29uc29sZS5sb2coXFxcInNjb3BlLnN0b3JlZFxcXCIsIGRhdGEpO1xcclxcblxcdFxcdH0pO1xcclxcblxcdH0pO1xcclxcblxcdGFwcC5jb250cm9sbGVyKCd0YWIxJywgWyckc2NvcGUnLCAnJGh0dHAnLCAnU2NvcGVzJywgZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsIFNjb3Blcykge1xcclxcblxcdFxcdFNjb3Blcy5zdG9yZSgndGFiMScsICRzY29wZSk7XFxyXFxuXFx0XFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSBmYWxzZTtcXHJcXG5cXHRcXHQkc2NvcGUuZ2V0X3JlY29yZHMgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0aWYoJHNjb3BlLmdvdF90YWIxX3JlY29yZHMpIHJldHVybjtcXHJcXG5cXHRcXHRcXHR2YXIgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSlNPTigpLnNsaWNlKDAsMTApO1xcclxcblxcdFxcdFxcdHZhciB1cmwgPSBGbGFzay51cmxfZm9yKCdyZWNvcmRlci5yZWNvcmRfbGlzdCcsIHtpbmZvX3R5cGU6IDEsIGZyb21fZGF0ZTogdG9kYXksIHRvX2RhdGU6IHRvZGF5fSk7XFxyXFxuXFx0XFx0XFx0JGh0dHAuZ2V0KHVybCkuc3VjY2VzcyhcXHJcXG5cXHRcXHRcXHRcXHRmdW5jdGlvbihkYXRhKXtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUudGFiMV9yZWNvcmRzID0gZGF0YTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMgPSBbXS5jb25jYXQoJHNjb3BlLnRhYjFfcmVjb3Jkcyk7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSB0cnVlO1xcclxcblxcdFxcdFxcdFxcdH1cXHJcXG5cXHRcXHRcXHQpLmVycm9yKGZ1bmN0aW9uKHJlc3BvbnNlKXtcXHJcXG5cXHRcXHRcXHRcXHRhbGVydChyZXNwb25zZSk7XFxyXFxuXFx0XFx0XFx0fSkuZmluYWxseShmdW5jdGlvbiAoKXtcXHJcXG5cXHRcXHRcXHR9KTtcXHJcXG5cXHRcXHR9XFxyXFxuXFx0XFx0JHNjb3BlLmFkZFJhbmRvbUl0ZW0gPSBmdW5jdGlvbiBhZGRSYW5kb21JdGVtKCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicxJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFx0XFx0JHNjb3BlLnVuc2hpZnRfcmVjb3JkID0gZnVuY3Rpb24gKHJlY29yZCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicyJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFx0XFx0JHNjb3BlLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0fV0pO1xcclxcblxcdGFwcC5jb250cm9sbGVyKCd0YWIyJywgWyckc2NvcGUnLCAnJGh0dHAnLCAnU2NvcGVzJywgZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsIFNjb3Blcykge1xcclxcblxcdFxcdFNjb3Blcy5zdG9yZSgndGFiMicsICRzY29wZSk7XFxyXFxuXFx0XFx0JHNjb3BlLmdvdF90YWIyX3JlY29yZHMgPSBmYWxzZTtcXHJcXG5cXHRcXHQkc2NvcGUuZ2V0X3JlY29yZHMgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0aWYoJHNjb3BlLmdvdF90YWIyX3JlY29yZHMpIHJldHVybjtcXHJcXG5cXHRcXHRcXHR2YXIgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSlNPTigpLnNsaWNlKDAsMTApO1xcclxcblxcdFxcdFxcdHZhciB1cmwgPSBGbGFzay51cmxfZm9yKCdyZWNvcmRlci5yZWNvcmRfbGlzdCcsIHtpbmZvX3R5cGU6IDIsIGZyb21fZGF0ZTogdG9kYXksIHRvX2RhdGU6IHRvZGF5fSk7XFxyXFxuXFx0XFx0XFx0JGh0dHAuZ2V0KHVybCkuc3VjY2VzcyhcXHJcXG5cXHRcXHRcXHRcXHRmdW5jdGlvbihkYXRhKXtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUudGFiMl9yZWNvcmRzID0gZGF0YTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIyX3JlY29yZHMgPSBbXS5jb25jYXQoJHNjb3BlLnRhYjJfcmVjb3Jkcyk7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLmdvdF90YWIyX3JlY29yZHMgPSB0cnVlO1xcclxcblxcdFxcdFxcdFxcdH1cXHJcXG5cXHRcXHRcXHQpLmVycm9yKGZ1bmN0aW9uKHJlc3BvbnNlKXtcXHJcXG5cXHRcXHRcXHRcXHRhbGVydChyZXNwb25zZSk7XFxyXFxuXFx0XFx0XFx0fSkuZmluYWxseShmdW5jdGlvbiAoKXtcXHJcXG5cXHRcXHRcXHR9KTtcXHJcXG5cXHRcXHR9O1xcclxcbiBcXHRcXHQkc2NvcGUudW5zaGlmdF9yZWNvcmQgPSBmdW5jdGlvbiAocmVjb3JkKSB7XFxyXFxuXFx0XFx0XFx0JHNjb3BlLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG5cXHRcXHR9O1xcclxcblxcdH1dKTtcXHJcXG5cXHRhcHAuY29udHJvbGxlcigncHJldmlldycsIFsnJHNjb3BlJywgJyRodHRwJywgJ1Njb3BlcycsIGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCBTY29wZXMpIHtcXHJcXG5cXHRcXHQkKCdhW2RhdGEtdG9nZ2xlPVxcXCJ0YWJcXFwiXScpLm9uKCdzaG93bi5icy50YWInLCBmdW5jdGlvbiAoZSkge1xcclxcblxcdFxcdFxcdHZhciB0YXJnZXQgPSAkKGUudGFyZ2V0KS5hdHRyKFxcXCJocmVmXFxcIikgLy8gYWN0aXZhdGVkIHRhYlxcclxcblxcdFxcdFxcdHZhciByZWxhdGVkVGFyZ2V0ID0gJChlLnJlbGF0ZWRUYXJnZXQpLmF0dHIoXFxcImhyZWZcXFwiKVxcclxcblxcdFxcdFxcdGlmICh0YXJnZXQgPT0gXFxcIiN0YWIxXFxcIikge1xcclxcblxcdFxcdFxcdFxcdFNjb3Blcy5nZXQoJ3RhYjEnKS5nZXRfcmVjb3JkcygpO1xcclxcblxcdFxcdFxcdH0gZWxzZSBpZiAodGFyZ2V0ID09IFxcXCIjdGFiMlxcXCIpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIyJykuZ2V0X3JlY29yZHMoKTtcXHJcXG5cXHRcXHRcXHR9XFxyXFxuXFx0XFx0fSlcXHJcXG5cXHRcXHQkc2NvcGUuYXBwZW5kX3JlY29yZCA9IGZ1bmN0aW9uKGluZm9fdHlwZSwgcmVjb3JkKXtcXHJcXG5cXHRcXHRcXHRpZiAoaW5mb190eXBlID09IDEpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIxJykudW5zaGlmdF9yZWNvcmQocmVjb3JkKTtcXHJcXG5cXHRcXHRcXHR9IGVsc2UgaWYgKGluZm9fdHlwZSA9PSAyKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMicpLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG5cXHRcXHRcXHR9XFxyXFxuXFx0XFx0fTtcXHJcXG5cXHRcXHR2YXIgdXJsID0gXFxcIndzOi8vXFxcIiArIHdpbmRvdy5sb2NhdGlvbi5ocmVmLnJlcGxhY2UoL2h0dHBzPzpcXFxcL1xcXFwvLywnJykucmVwbGFjZSgvXFxcXC8uKi8sJycpICsgXFxcIi93c1xcXCI7XFxyXFxuXFx0XFx0dmFyIHdzID0gbmV3IFdlYlNvY2tldCh1cmwpO1xcclxcblxcdFxcdHdzLm9uZXJyb3IgPSBmdW5jdGlvbiAoZSkge1xcclxcblxcdFxcdFxcdGFsZXJ0KGUpO1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKFxcXCJXZWJTb2NrZXQgRXJyb3JcXFwiICsgZSk7XFxyXFxuXFx0XFx0XFx0Y29uc29sZS5sb2coZSk7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdHdzLm9uY2xvc2UgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXFxcImxvZ29cXFwiKS5zdHlsZS5jb2xvciA9IFxcXCJncmF5XFxcIjtcXHJcXG5cXHRcXHR9XFxyXFxuXFx0XFx0d3Mub25tZXNzYWdlID0gZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHR2YXIgb2JqID0gSlNPTi5wYXJzZShlLmRhdGEpO1xcclxcblxcdFxcdFxcdCRzY29wZS5hcHBlbmRfcmVjb3JkKG9iai5zdGF0ZSwgb2JqLnJlY29yZCk7XFxyXFxuXFx0XFx0fVxcclxcblxcdH1dKTtcXHJcXG5cXHRcXHJcXG5cXHRhcHAuZmFjdG9yeSgnU2NvcGVzJywgZnVuY3Rpb24gKCRyb290U2NvcGUpIHtcXHJcXG5cXHRcXHR2YXIgbWVtID0ge307XFxyXFxuXFx0XFx0cmV0dXJuIHtcXHJcXG5cXHRcXHRcXHRzdG9yZTogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcXHJcXG5cXHRcXHRcXHRcXHQkcm9vdFNjb3BlLiRlbWl0KCdzY29wZS5zdG9yZWQnLCBrZXkpO1xcclxcblxcdFxcdFxcdFxcdG1lbVtrZXldID0gdmFsdWU7XFxyXFxuXFx0XFx0XFx0fSxcXHJcXG5cXHRcXHRcXHRnZXQ6IGZ1bmN0aW9uIChrZXkpIHtcXHJcXG5cXHRcXHRcXHRcXHRyZXR1cm4gbWVtW2tleV07XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH07XFxyXFxuXFx0fSk7XFxyXFxuXFx0PC9zY3JpcHQ+XFxyXFxuXFxyXFxuXFxyXFxuICBbMV06IGh0dHA6Ly9wbG5rci5jby9lZGl0L3dseXVIVlVRSE5tMlJjVk5HWUprP3A9cHJldmlld1wiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDhcIixcbiAgICBcImlkXCI6IDIwNzQ1MDExMSxcbiAgICBcIm51bWJlclwiOiA3NDgsXG4gICAgXCJ0aXRsZVwiOiBcInN0LXBlcnNpc3QgZXhhbXBsZSBpcyBub3Qgd29ya2luZyB3aXRoIHN0LXBpcGVcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImpvaG5pY29cIixcbiAgICAgIFwiaWRcIjogMTk1NjQ1OTIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE5NTY0NTkyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY29cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vam9obmljb1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiAyMjU4NjI0MjMsXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvbm90JTIwcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwibmFtZVwiOiBcIm5vdCByZXByb2R1Y2libGVcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImViNjQyMFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjU5NDM4NTA2LFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL3RvJTIwYmUlMjBjbG9zZWQ6JTIwZG9lcyUyMG5vdCUyMGZvbGxvdyUyMGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJuYW1lXCI6IFwidG8gYmUgY2xvc2VkOiBkb2VzIG5vdCBmb2xsb3cgZ3VpZGVsaW5lc1wiLFxuICAgICAgICBcImNvbG9yXCI6IFwiZmJjYTA0XCIsXG4gICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMi0xNFQwODozODo1NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTE0VDEzOjExOjU3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgLiB0aGlzIGV4YW1wbGUgaXMgbm90IHdvcmtpbmcgYXQgYWxsIHdpdGggc2VydmVyIHBhZ2luYXRpb24gXFxyXFxuaHR0cDovL3BsbmtyLmNvL2VkaXQvZWt3aU50P3A9cHJldmlld1xcclxcblxcclxcbml0IHNhdmVkIG9ubHkgdGhlIGRhdGEgb2YgZmlyc3QgcGFnZSBhbmQgZGVmYXVsdCBzb3J0IGluIGxvY2FsIHN0b3JhZ2UgYW5kIGRpZCBub3QgdXBkYXRlIHRoZSB0YWJsZVxcclxcblxcclxcbm15IHBpcGUgZnVuY3Rpb24gOlxcclxcblxcclxcblxcclxcbmAgICAgdGhpcy5jYWxsU2VydmVyID0gZnVuY3Rpb24gY2FsbFNlcnZlcih0YWJsZVN0YXRlKSB7XFxyXFxuXFxyXFxuICAgICAgICB2bS5pc0xvYWRpbmcgPSB0cnVlO1xcclxcbiAgICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XFxyXFxuICAgICAgICB2YXIgc3RhcnQgPSBwYWdpbmF0aW9uLnN0YXJ0IHx8IDA7ICBcXHJcXG4gICAgICAgIHZhciBudW1iZXIgPSBwYWdpbmF0aW9uLm51bWJlciB8fCAxMFxcclxcblxcclxcbiAgICAgICAgdm0uc3VibWl0ID0gZnVuY3Rpb24gKCl7XFxyXFxuICAgICAgICAgICAgdm0uaXNMb2FkaW5nID0gdHJ1ZTtcXHJcXG5cXHJcXG4gICAgICAgICAgICAkc2NvcGUuZmlsdGVyc0Zvcm0uJHNldFByaXN0aW5lKCk7XFxyXFxuICAgICAgICAgICAgc2VydmVyQ2FsbCgwLCAxMCwgdGFibGVTdGF0ZSxzZWFyY2hPYmopO1xcclxcbiAgICAgICAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XFxyXFxuICAgICAgICB9XFxyXFxuICAgICAgICBzZXJ2ZXJDYWxsKHN0YXJ0LCBudW1iZXIsIHRhYmxlU3RhdGUsc2VhcmNoT2JqKTtcXHJcXG5cXHJcXG4gICAgICB9O1xcclxcbmBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0Ny9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0N1wiLFxuICAgIFwiaWRcIjogMjA1ODQ5MTQxLFxuICAgIFwibnVtYmVyXCI6IDc0NyxcbiAgICBcInRpdGxlXCI6IFwiSXNzdWUgIzcyNyBzdC1waXBlIG5vdCB3b3JraW5nIHdpdGggc3Qtc2FmZS1zcmNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIkFsZXhOR1wiLFxuICAgICAgXCJpZFwiOiA4MjI4MTAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzgyMjgxMD92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkdcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vQWxleE5HXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkcvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4Tkcvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMi0wN1QxMDo0MDo1OFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTA3VDExOjA4OjEyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc0N1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0N1wiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0Ny5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0Ny5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCItIG9wdGlvbmFsIGFiaWxpdHkgdG8gcGlwZSBvbiBzYWZlY29weSBjaGFuZ2UgdXNpbmcgZXhpc3RpbmcgcGlwZUFmdGVyU2FmZUNvcHkgZmxhZyB1c2luZyB1bnByZXZlbnRQaXBlT25XYXRjaFwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ0L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDRcIixcbiAgICBcImlkXCI6IDIwNDExMTA3MCxcbiAgICBcIm51bWJlclwiOiA3NDQsXG4gICAgXCJ0aXRsZVwiOiBcInN0LXNvcnQgd2l0aCBmdW5jdGlvbiByZXR1cm5pbmcgYSBwcm9taXNlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJza2lkdmRcIixcbiAgICAgIFwiaWRcIjogNTgzMjUxMyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvNTgzMjUxMz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vc2tpZHZkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDIsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0zMFQxOTo0ODo0OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTAxVDEyOjUxOjAyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuXFxyXFxuSSBhbSB1c2luZyBhbmd1bGFyIHYxLjUuOSBhbmQgc21hcnQtdGFibGUgdjIuMS4wLiAgSSBoYXZlIHNlYXJjaGVkIGZvciBhbnN3ZXJzIHRvIG15IHF1ZXN0aW9uIGJlbG93LCBidXQgaGF2ZSBub3QgYmVlbiBhYmxlIHRvIGZpbmQgYW55IHRoYXQgYWRkcmVzcyB0aGUgc3BlY2lmaWMgcHJvbWlzZS9hc3luYyBhdHRyaWJ1dGVzIG9mIGl0IC0gYXBvbG9naWVzIGlmIHRoaXMgaGFzIGJlZW4gYWRkcmVzc2VkIHNvbWV3aGVyZSBhbmQvb3IgaXMgYSBkdXBsaWNhdGUgLSBpZiBzbywga2luZGx5IHBsZWFzZSByZWZlciBtZSB0aGVyZS5cXHJcXG5cXHJcXG5JIGhhdmUgYmVlbiB1c2luZyBib3RoIHN0LXRhYmxlPVxcXCJkaXNwbGF5ZWRJdGVtc1xcXCIgYW5kIHN0LXNhZmUtc3JjPVxcXCJpdGVtc1xcXCIgZGlyZWN0aXZlcyBpbiBjb21iaW5hdGlvbiB3aXRoIHN0LXNvcnQuICBUaGlzIGNvbWJpbmF0aW9uIHN1Y2Nlc3NmdWxseSBhbmQgcmVsaWFibHkgd29ya3MgZm9yIG5lYXJseSBhbGwgY29uZGl0aW9ucyBJIGhhdmUgcnVuIGFjcm9zcy4gIFRoaXMgaW5jbHVkZXMgc2NlbmFyaW9zIHdoZXJlIHRoZSBzdC1zb3J0IGlzIGZ1bmN0aW9uIGJhc2VkLiAgSG93ZXZlciwgSSByZWNlbnRseSBlbmNvdW50ZXJlZCBhbiBuZWVkIHRvIGhhdmUgYSBmdW5jdGlvbiBiYXNlZCBzdC1zb3J0IHRoYXQgcmV0dXJucyBhIHByb21pc2UgaW5zdGVhZCBvZiB0aGUgdmFsdWUgZGlyZWN0bHkgKGkuZS4gdGhlIGZ1bmN0aW9uIHdpbGwgYXN5bmNocm9ub3VzbHkgcmVzb2x2ZSB0aGUgdmFsdWUsIGF0IGEgc2xpZ2h0bHkgbGF0ZXIgdGltZSAtIHdoZW4gaXQgYmVjb21lcyBhdmFpbGFibGUpLlxcclxcblxcclxcbk15IHF1ZXN0aW9uIGlzLCBzaG91bGQgdGhlIHN0LXNvcnQgYmUgZXhwZWN0ZWQgdG8gcHJvZHVjZSBhIHByZWRpY3RhYmxlIG9yZGVyaW5nIG9mIHRoZSByb3dzIGluIHRoYXQgY2FzZT8gIElmIHNvLCBpdCBkb2VzIG5vdCBhcHBlYXIgdG8gYmUuICBJIGFtIHRoZW9yaXppbmcgdGhhdCB0aGlzIG1heSBiZSBkbyB0byB0aGUgZmFjdCB0aGF0IHRoZSBhc3NvY2lhdGVkIHZhbHVlcyBhcmUgbm90IGF2YWlsYWJsZSB0byB0aGUgc29ydCBhbGdvcml0aG0gYWxsIHVwIGZyb250IC0gYnV0IHJhdGhlciBzdHJhZ2dsZSBpbiBpbiBhbiB1bnByZWRpY3RhYmxlIG9yZGVyIGFuZCB0aW1lIGZyYW1lLiAgQnkgdGhlIHdheSwgbm8gZXJyb3JzIG9yIG90aGVyIGluZGljYXRpb25zIGFyZSByZXR1cm5lZCB0aGF0IGEgcHJvYmxlbSBtYXkgZXhpc3QuICBTaG91bGQgSSBleHBlY3QgdGhpcyB0byB3b3JrLCBvciBpcyB0aGlzIGEga25vd24gbGltaXRhdGlvbj8gIEFyZSB0aGVyZSBhZGRpdGlvbmFsIGl0ZW1zIHRoYXQgY2FuIGJlIGRvbmUgdG8gbWFrZSBpdCB3b3JrIG9uIG15IHBhcnQgb3Igb3RoZXJ3aXNlIC0gaWYgc28sIEknZCBncmVhdGx5IGFwcHJlY2lhdGUgYW55IHRpcHMgb3IgdGhvdWdodHMgeW91IG1heSBoYXZlP1xcclxcblxcclxcblRJQSFcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDJcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0Mi9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDIvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDIvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQyXCIsXG4gICAgXCJpZFwiOiAyMDA4Mjk1NTAsXG4gICAgXCJudW1iZXJcIjogNzQyLFxuICAgIFwidGl0bGVcIjogXCJzdC1zb3J0LWRlZmF1bHQgb3ZlcndyaXRlcyBzdC1wZXJzaXN0IHN0YXRlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJhbmd1c3R1c1wiLFxuICAgICAgXCJpZFwiOiA5MTM3ODEwLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS85MTM3ODEwP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VzdHVzXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0xNFQyMTowMzoxM1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTE0VDIxOjAzOjEzWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiKipXb3JraW5nIGV4YW1wbGU6KipcXHJcXG5odHRwOi8vcGxua3IuY28vZWRpdC9VSTVyOXI/cD1wcmV2aWV3XFxyXFxuSXQncyBhIGZvcmsgb2YgdGhlIGBzdC1wZXJzaXN0YCBleGFtcGxlOyBJJ3ZlIGFkZGVkIGBzdC1zb3J0LWRlZmF1bHRgIGZpZWxkIGFuZCB1cGRhdGVkIGBzbWFydC10YWJsZWAgdG8gYHYyLjEuOGAgKG1hc3RlciBhcyBvZiBub3cpLlxcclxcblxcclxcbioqUmVwcm9kdWN0aW9uOioqXFxyXFxuMS4gVXNlIHBhZ2luYXRpb24gYW5kIHNvcnQgYnkgYW55IGNvbHVtbi5cXHJcXG4yLiByZWZyZXNoIHByZXZpZXdcXHJcXG5cXHJcXG4qKlJlc3VsdDoqKlxcclxcblRoZSBwZXJzaXN0ZWQgc3RhdGUgaXMgYXBwbGllZCBiZWZvcmUgdGhlIGRlZmF1bHQgc29ydCBvcmRlciBpcyBhcHBsaWVkLlxcclxcbioqRXhwZWN0ZWQ6KipcXHJcXG5QZXJzaXN0ZWQgc3RhdGUgc2hvdWxkIGJlIGFwcGxpZWQgbGFzdCB0aHVzIG92ZXJ3cml0aW5nIGRlZmF1bHQgc3RhdGUgb3JkZXIuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDEvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0MVwiLFxuICAgIFwiaWRcIjogMjAwNjQyNDE4LFxuICAgIFwibnVtYmVyXCI6IDc0MSxcbiAgICBcInRpdGxlXCI6IFwiSXMgdGhlcmUgYXJlIGEgd2F5IGZvciBhIHN0cmljdCBzZWFyY2ggaW4gY3VzdG9tIGRpcmVjdGl2ZT8gXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJreXJvZGFiYXNlXCIsXG4gICAgICBcImlkXCI6IDI1MTAzMjQzLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS8yNTEwMzI0Mz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2t5cm9kYWJhc2VcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2Uvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2UvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMzU1Mjk4NTksXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvZW5oYW5jZW1lbnRcIixcbiAgICAgICAgXCJuYW1lXCI6IFwiZW5oYW5jZW1lbnRcIixcbiAgICAgICAgXCJjb2xvclwiOiBcIjg0YjZlYlwiLFxuICAgICAgICBcImRlZmF1bHRcIjogdHJ1ZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDYsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0xM1QxNDoyNzowMlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTE5VDA5OjAxOjE3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuXFxyXFxuR3JlYXQgbGliISA6KVxcclxcblxcclxcbklzIHRoZXJlIGFyZSBhIHdheSB0byBtYXRjaCB0aGUgZXhhY3Qgc2VhcmNoIHRlcm0gaW5zdGVhZCBvZiBhIHN1YnN0cmluZz9cXHJcXG5DdXJyZW50bHkgaWYgSSBzZWFyY2ggZm9yIElEID0gNCwgdGhlIHNlYXJjaCBmdW5jdGlvbiByZXR1cm5zIElEID0gNCBhbmQgSUQgPSA0MDAwLCBJRCA9IDQwMDEgZXRjLlxcclxcbkhlcmUgaXMgYSBjb2RlIHNuaXBwZXQ6IFxcclxcblxcclxcbmAgLmRpcmVjdGl2ZShcXFwiY3VzdG9tV2F0Y2hGaWx0ZXJzXFxcIiwgZnVuY3Rpb24gKCkge1xcclxcblxcclxcbiAgICByZXR1cm4ge1xcclxcbiAgICAgIHJlc3RyaWN0OiBcXFwiQVxcXCIsXFxyXFxuICAgICAgcmVxdWlyZTogXFxcIl5zdFRhYmxlXFxcIixcXHJcXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XFxyXFxuICAgICAgXFx0c2NvcGUuJHdhdGNoQ29sbGVjdGlvbihhdHRycy5jdXN0b21XYXRjaEZpbHRlcnMsIGZ1bmN0aW9uIChmaWx0ZXJzKSB7XFxyXFxuXFxyXFxuICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSB7fTtcXHJcXG5cXHJcXG4gICAgICAgICAgYW5ndWxhci5mb3JFYWNoKGZpbHRlcnMsIGZ1bmN0aW9uICh2YWwsIGZpbHRlcikge1xcclxcbiAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSB7XFxyXFxuICAgICAgICAgICAgICByZXR1cm47XFxyXFxuICAgICAgICAgICAgfVxcclxcblxcdFxcdFxcclxcbiAgICAgICAgICAgIGN0cmwuc2VhcmNoKHZhbC50b1N0cmluZygpLCBmaWx0ZXIpO1xcclxcbiAgICAgICAgICB9KTtcXHJcXG5cXHJcXG4gICAgICAgICAgY3RybC5waXBlKCk7XFxyXFxuXFxyXFxuICAgICAgICB9KTtcXHJcXG4gICAgICB9XFxyXFxuICAgIH07XFxyXFxuICB9KTtgXFxyXFxuXFxyXFxuUGxlYXNlIGFkdmlzZVwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM5L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzlcIixcbiAgICBcImlkXCI6IDE5OTI5NjgwOCxcbiAgICBcIm51bWJlclwiOiA3MzksXG4gICAgXCJ0aXRsZVwiOiBcIkhvdyBjYW4gSSBzZWxlY3QgcGFnZSBhbmQgc29ydCBtYW51YWxseSB3aXRoIHNlcnZlciBzaWRlIHBhZ2luYXRpb24gP1wiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiam9obmljb1wiLFxuICAgICAgXCJpZFwiOiAxOTU2NDU5MixcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTk1NjQ1OTI/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljb1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9qb2huaWNvXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0wNlQyMTo0NDozOVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTEwVDA3OjE0OjUyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgLiBpbSB1c2luZyBzbWFydCB0YWJsZSB3aXRoIHBhZ2luYXRpb24gaW4gc2VydmVyIHNpZGUuXFxyXFxuSSBhbSBrZWVwIHRoZSBzb3J0aW5nIGFuZCBwYWdpbmF0aW9uIGRldGFpbHMgaW4gbG9jYWwgc3RvcmFnZSBvciB1cmwgLFxcclxcbm15IHF1ZXN0aW9uIGlzIGhvdyBjYW4gSSBrZWVwIHRoZSBwYWdlIHdoZW4gdGhlIHVzZXIgd2FzIGFuZCB3aGVuIGhlIHdpbGwgY29tZSBiYWNrIHdpdGggdGhlIHNwZWNpZmljIHVybCBvciBqdXN0IGJhY2sgdG8gdGhlIHBhZ2UgaGUgd2lsbCBnZXQgdGhlIHNhbWUgcGFnZSBoZSB3YXMuP1xcclxcbnRoZSBzYW1lIGlzc3VlIGlzIHdpdGggU29ydGluZywgIEhvdyBjYW4gSSBzb3J0aW5nIGJ5IHVybCBwYXJhbWV0ZXJcXHJcXG5ob3cgY2FuIEkgZG8gdGhhdCwgICA/XFxyXFxuXFxyXFxuXFxyXFxudGh4IGZvciB0aGUgaGVscFwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzhcIixcbiAgICBcImlkXCI6IDE5NzQ5NzM4MixcbiAgICBcIm51bWJlclwiOiA3MzgsXG4gICAgXCJ0aXRsZVwiOiBcIkNhbid0IGxvYWQgaHR0cCBjb250ZW50IGZyb20gcGx1bmtlciB3aGVuIG9wZW5pbmcgdHV0b3JpYWwgc2l0ZSB2aWEgaHR0cHNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImFuYXRvbHkzMTRcIixcbiAgICAgIFwiaWRcIjogMTY0MTU5NCxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTY0MTU5ND92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FuYXRvbHkzMTRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTI1VDExOjMxOjMyWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMjVUMTE6MzE6MzJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJXaGVuIEkgb3BlbiB0aGUgZm9sbG93aW5nIHdlYnNpdGU6IGh0dHBzOi8vbG9yZW56b2ZveDMuZ2l0aHViLmlvL3NtYXJ0LXRhYmxlLXdlYnNpdGUvIHNvbWUgY29udGVudCBub3QgbG9hZGluZyBidXQgdGhyb3dpbmcgZXhjZXB0aW9uIGluIGEgamF2YXNjcmlwdCBjb25zb2xlOlxcclxcblxcclxcbj4gTWl4ZWQgQ29udGVudDogVGhlIHBhZ2UgYXQgJ2h0dHBzOi8vbG9yZW56b2ZveDMuZ2l0aHViLmlvL3NtYXJ0LXRhYmxlLXdlYnNpdGUvJyB3YXMgbG9hZGVkIG92ZXIgSFRUUFMsIGJ1dCByZXF1ZXN0ZWQgYW4gaW5zZWN1cmUgcmVzb3VyY2UgJ2h0dHA6Ly9lbWJlZC5wbG5rci5jby9TT2NVazEnLiBUaGlzIHJlcXVlc3QgaGFzIGJlZW4gYmxvY2tlZDsgdGhlIGNvbnRlbnQgbXVzdCBiZSBzZXJ2ZWQgb3ZlciBIVFRQUy5cXHJcXG5cXHJcXG5UbyBmaXggdGhpcyBhbGwgaHR0cDovL2V4YW1wbGUuY29tIGxpbmtzIHNob3VsZCBiZSBjaGFuZ2VkIHRvIC8vZXhhbXBsZS5jb21cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM3XCIsXG4gICAgXCJpZFwiOiAxOTY0NjE3MzYsXG4gICAgXCJudW1iZXJcIjogNzM3LFxuICAgIFwidGl0bGVcIjogXCJQb3NzaWJsZSBpc3N1ZSB3aXRoIHJlaW5pdGlhbGlzaW5nIHRoZSBzY29wZS5wYWdlcyBjb2xsZWN0aW9uIGluIHJlZHJhdyBmdW5jdGlvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic2FubnlqYWNvYnNzb25cIixcbiAgICAgIFwiaWRcIjogMTE3ODc4MzEsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzExNzg3ODMxP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3Nhbm55amFjb2Jzc29uXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMi0xOVQxNjo0MToxMVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEyLTIwVDEwOjA0OjAwWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiQW5ndWxhciB2ZXJzaW9uOiAxLjUuOFxcclxcblNtYXJ0IHRhYmxlIHZlcnNpb246IDIuMS44XFxyXFxuXFxyXFxuaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2Jsb2IvbWFzdGVyL3NyYy9zdFBhZ2luYXRpb24uanNcXHJcXG48cHJlPlxcclxcbm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxcclxcbiAgLmRpcmVjdGl2ZSgnc3RQYWdpbmF0aW9uJywgWydzdENvbmZpZycsIGZ1bmN0aW9uIChzdENvbmZpZykge1xcclxcbi4uLi5cXHJcXG4gICAgICAgIGZ1bmN0aW9uIHJlZHJhdyAoKSB7XFxyXFxuLi4uLlxcclxcbiAgICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xcclxcbi4uLi5cXHJcXG48L3ByZT5cXHJcXG5cXHJcXG5XaGVuIHVwZGF0aW5nIHRoZSA8Y29kZT5zdC1pdGVtcy1ieS1wYWdlPC9jb2RlPiB2YWx1ZSBhIDxjb2RlPnJlZHJhdygpPC9jb2RlPiBpcyB0cmlnZ2VyZWQuIEluIHRoZSBjYXNlIHRoZSBuZXcgdmFsdWUgaXMgdGhlIGxlbmd0aCBvZiB0aGUgaXRlbXMgaW4gdGhlIGJhY2tpbmcgY29sbGVjdGlvbiA8Y29kZT48L2NvZGU+IHRoZSA8Y29kZT5zY29wZS5wYWdlczwvY29kZT4gY29sbGVjdGlvbiBpcyByZWluaXRpYWxpc2VkLiBcXHJcXG5cXHJcXG5JdCBzZWVtcyB0byBtZSB0aGF0IHdlIGFyZSBsb29zaW5nIG91ciByZWZlcmVucyB0byB0aGUgPGNvZGU+c2NvcGUucGFnZXM8L2NvZGU+IGNvbGxlY3Rpb24gaW4gdGhlIHBhZ2luYXRpb24uaHRtbCB0ZW1wbGF0ZS4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9ibG9iL21hc3Rlci9kaXN0L3NtYXJ0LXRhYmxlLmpzIFxcclxcbjxwcmU+XFxyXFxubmcubW9kdWxlKCdzbWFydC10YWJsZScsIFtdKS5ydW4oWyckdGVtcGxhdGVDYWNoZScsIGZ1bmN0aW9uICgkdGVtcGxhdGVDYWNoZSkge1xcclxcbiAgICAkdGVtcGxhdGVDYWNoZS5wdXQoJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCcsXFxyXFxuLi4uLi48L3ByZT5cXHJcXG5cXHJcXG5JZiB3ZSBpbnN0ZWFkIG9mIHJlaW5pdGlhbGlzaW5nIHRoZSBjb2RlPnNjb3BlLnBhZ2VzPC9jb2RlPiBjb2xsZWN0aW9uIGluIHRoZSA8Y29kZT5yZWRyYXcoKTwvY29kZT4gZnVuY3Rpb24gd2Ugc2V0IHRoZSBsZW5ndGggdG8gemVybyA8Y29kZT5zY29wZS5wYWdlcy5sZW5ndGggPSAwOzwvY29kZT4gd2Ugd2lsbCBtYWludGFpbiBvdXIgcmVmZXJlbmNlcy4gV2hlbiBjaGFuZ2luZyB0aGUgdmFsdWUgZnJvbSB0aGUgbGVuZ3RoIG9mIHRoZSBiYWNraW5nIGNvbGxlY3Rpb24gdG8gc29tZSBvdGhlciB2YWx1ZSB0aGUgcGFnaW5hdGlvbiB3aWxsIHdvcmsuIFxcclxcblxcclxcbkkgZGlzY292ZXJlZCB0aGUgaXNzdWUgd2hlbiBhZGRpbmcgYSBcXFwidmlldyBhbGxcXFwiIG9wdGlvbiBmb3IgYSBzbWFydCB0YWJsZS4gSSB0cmllZCB3aXRoIC0xIHRvIHNob3cgYWxsLCBob3dldmVyIHRoYXQgY2F1c2VkIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24ubnVtYmVyT2ZQYWdlcyB0byBiZWNvbWUgbmVnYXRpdmUgd2l0aCBhbGwga2luZHMgb2Ygc2lkZSBlZmZlY3RzLlxcclxcblxcclxcbkknbSBuZXcgdG8gSmF2YVNjcmlwdCBhbmQgQW5ndWxhckpTIHNvIEkgbWF5IHZlcnkgd2VsbCBoYXZlIG1pc3N1bmRlcnN0b2QgdGhlIGlzc3VlLiAgXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzYvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNlwiLFxuICAgIFwiaWRcIjogMTk1MjA3NzMzLFxuICAgIFwibnVtYmVyXCI6IDczNixcbiAgICBcInRpdGxlXCI6IFwiU21hcnQgVGFibGUgcGFnZ2luZyByZWZyZXNoaW5nIElzc3VlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJoZW1yYWpyYXZcIixcbiAgICAgIFwiaWRcIjogMjMzOTY4MzQsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzIzMzk2ODM0P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdlwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9oZW1yYWpyYXZcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTEzVDA5OjU1OjU5WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMTVUMTA6Mjk6MDdaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSxcXHJcXG5ob3cgY2FuIGkgY29udHJvbCBwYWdlIHJlZnJlc2hpbmcgaW4gc21hcnQgdGFibGUgb24gcmVmaWxsIGluc2lkZSBhbmd1bGFyIGNvbnRyb2xsZXIgd2hlbiBhbnkgYWN0aW9uIHBlcmZvcm0uXFxyXFxuZm9yIGV4YSA6IC0gSSBhbSBvbiBwYWdlIG5vIDYgYW5kIGkgY2xhaW0gYW4gb3JkZXIgdGhlbiBjb250cm9sIGNvbWVzIG9uIGZpcnN0IHBhZ2Ugd2hlbiByZWZpbGwgc21hcnQgdGFibGUuXFxyXFxuc28gaG93IGNhbiBiZSBjb250cm9sIHRoaXMgcmVmcmVzaC4uLnBsZWFzZSBwcm92aWRlIG1lIHNvbHV0aW9uIGltbWVkaWF0ZWx5LlxcclxcblxcclxcblRoYW5rcyBpbiBhZHZhbmNlXFxyXFxuSGVtcmFqIFJhdlxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM1L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzVcIixcbiAgICBcImlkXCI6IDE5NTA4NTY3NSxcbiAgICBcIm51bWJlclwiOiA3MzUsXG4gICAgXCJ0aXRsZVwiOiBcInByb3BlcnR5IHdpdGggXFxcIi1cXFwiIGRhc2ggZG9lc250IHdvcmsgaW4gc2VhcmNoPyBPciBJIGFtIGRvaW5nIHNvbWV0aGluZyB3cm9uZyB3aXRoIHN0U2VhcmNoXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJnaW5hbWRhclwiLFxuICAgICAgXCJpZFwiOiA4NDUzNzksXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzg0NTM3OT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhclwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9naW5hbWRhclwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhci9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiA0LFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMTItMTJUMjE6MDY6NDhaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0xMi0xNVQwNzowMzoyNFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgaGF2ZSBqc29uIG9iamVjdCBhcyAgIFxcclxcbmBgYFt7XFxcInRhc2staWRcXFwiOjUyLFxcXCJ0YXNrLXByaW9yaXR5XFxcIjoxLFxcXCJ0YXNrLW5hbWVcXFwiOlxcXCJNb2RpZnkgUHJvdmluY2VcXFwiLFxcXCJ0YXNrLWRlc2NyaXB0aW9uXFxcIjpcXFwiXFxcIixcXFwidGFzay1zdGF0dXNcXFwiOlxcXCJJblByb2dyZXNzXFxcIn0sLi4uXSAgYGBgXFxyXFxuYW5kIGluIGh0bWwgaW0gcmVuZGVyaW5nIGl0cyBhc1xcclxcbmBgYFxcclxcbjxkaXYgY2xhc3M9XFxcIndpZGdldC1ib2R5XFxcIiBzdC10YWJsZT1cXFwiZGlzcGxheVdvcmtsaXN0XFxcIiBzdC1zYWZlLXNyYz1cXFwid29ya2xpc3RcXFwiICA+XFxyXFxuPHRhYmxlIGNsYXNzPVxcXCJ0YWJsZSB0YWJsZS1ib3JkZXJlZCB0YWJsZS1zdHJpcGVkIHRhYmxlLWNvbmRlbnNlZFxcXCI+XFxyXFxuPHRoZWFkPi4uPC90aGVhZD5cXHJcXG48dGJvZHk+XFxyXFxuPHRyIG5nLXJlcGVhdD1cXFwicm93IGluIGRpc3BsYXlXb3JrbGlzdFxcXCI+XFxyXFxuICAgPHRkIGNsYXNzPVxcXCJ0ZXh0LWNlbnRlclxcXCIgPlxcclxcbiAgIHt7IHJvd1sndGFzay1pZCddIH19XFxyXFxuICA8L3RkPlxcclxcbjwvdGFibGU+IGBgYCAgXFxyXFxuXFxyXFxuRXZlcnl0aGluZyB3b3JrcyBmaW5lLCBub3cgd2hlbiBpbSB0cnlpbmcgdG8gZmlsdGVyIGJhc2VkIG9uIHByZWRpY2F0ZSBhcyAgXFxyXFxuPHRoPlxcclxcbiAgIDxpbnB1dCBzdC1zZWFyY2g9XFxcIid0YXNrLWlkJ1xcXCIgcGxhY2Vob2xkZXI9XFxcInNlYXJjaCBmb3IgdGFza0lkXFxcIlxcclxcbiAgY2xhc3M9XFxcImlucHV0LXNtIGZvcm0tY29udHJvbFxcXCIgdHlwZT1cXFwic2VhcmNoXFxcIi8+XFxyXFxuICA8L3RoPiAgXFxyXFxuYGBgICBcXHJcXG5JIGdldCBhbmd1bGFyLmpzOjEwMTUwIFR5cGVFcnJvcjogJHBhcnNlKC4uLikuYXNzaWduIGlzIG5vdCBhIGZ1bmN0aW9uXFxyXFxuXFxyXFxuXFxcImFuZ3VsYXJcXFwiOiBcXFwifjEuMlxcXCIsXFxyXFxuYW5ndWxhci1zbWFydC10YWJsZTogXFxcIl4yLjEuOFxcXCIsXFxyXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNFwiLFxuICAgIFwiaWRcIjogMTkyODQyOTAwLFxuICAgIFwibnVtYmVyXCI6IDczNCxcbiAgICBcInRpdGxlXCI6IFwic3QtcGlwZSB3aXRoIGRlZmF1bHQtc29ydC1jb2x1bW4gY2F1c2VzIGRvdWJsZSB4aHIgcmVxdWVzdCB3aGVuIGluaXRpYWxpemluZyB0YWJsZS5cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcInd6b2V0XCIsXG4gICAgICBcImlkXCI6IDI0ODE5ODIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzI0ODE5ODI/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vd3pvZXRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTAxVDEzOjExOjUzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMTJUMTI6MDk6NDJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSxcXHJcXG5cXHJcXG5XZSBhcmUgd29ya2luZyB3aXRoIHlvdXIgcGx1Z2luIHdoaWNoIGlzIHJlYWxseSBhd2Vzb21lLiBcXHJcXG5XZSBqdXN0IGZvdW5kIHRoYXQgd2hlbiBoYXZpbmcgYSBkZWZhdWx0LXNvcnQgZmllbGQgc2V0IHRvIHRydWUsIHRoZSBwaXBlIGlzIGNhbGxlZCB0d2ljZSwgY2F1c2luZyBkYXRhIGJlIGxvYWRlZCB0d2ljZSB1cG9uIGluaXRpYWxpemluZyBvZiB0aGUgcGFnZS4gXFxyXFxuXFxyXFxuSXQgaXMgdG90YWxseSBub3QgYSBzaG93c3RvcHBlciwgYnV0IEkgZ3Vlc3MgaXQgaXNuJ3QgdmVyeSBlZmZpY2llbnQgYXMgd2VsbC5cXHJcXG5cXHJcXG5XZSB1c2UgYW5ndWxhciDLhjEuNS44IGFuZCBhbmd1bGFyLXNtYXJ0LXRhYmxlIMuGMi4xLjguXFxyXFxuXFxyXFxuVGhhbmtzIGZvciB5b3VyIGVmZm9ydCBpbiB0aGlzIHBsdWdpbiFcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczMy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzczM1wiLFxuICAgIFwiaWRcIjogMTkyMTMyOTUwLFxuICAgIFwibnVtYmVyXCI6IDczMyxcbiAgICBcInRpdGxlXCI6IFwiRXh0ZW5kIHNlbGVjdGlvbiB3aXRoIHNoaWZ0LWNsaWNrXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJSaG9iYWxcIixcbiAgICAgIFwiaWRcIjogMTQ5MTMyOTcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0OTEzMjk3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9SaG9iYWxcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTExLTI4VDIyOjE5OjUzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTEtMjhUMjI6MTk6NTNaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzMzXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzXCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzLmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzLnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIlNlbGVjdGlvbiBjYW4gYmUgZXh0ZW5kZWQgd2l0aCBzaGlmdC1jbGljay5cXHJcXG5cXHJcXG5FeHRlbnNpb24gbWVhbnMgdGhhdCB0aGUgc3RhdGUgb2YgdGhlIGxhc3Qgcm93IHRoYXQgd2FzIHNlbGVjdGVkIGlzIGV4dGVuZGVkIHRocm91Z2ggdG8gdGhlIGN1cnJlbnRseVxcclxcbnNlbGVjdGVkIHJvdywgc28gYWxsIHJvd3MgaW4gYmV0d2VlbiB3aWxsIGVpdGhlciBiZSBzZWxlY3RlZCBvciBkZXNlbGVjdGVkLiBJZiB0aGVyZSB3YXMgbm8gcHJldmlvdXNseVxcclxcbnNlbGVjdGVkIHJvdywgc2hpZnQtY2xpY2sgd2lsbCBqdXN0IHNlbGVjdCB0aGUgY3VycmVudCByb3cuXFxyXFxuXFxyXFxuVG8gZ2V0IHRvIGEgZGVmaW5lZCBzdGF0ZSBvbiBwYWdpbmcgLyBmaWx0ZXJpbmcgLyBzb3J0aW5nLCBzZWxlY3Rpb25zIGFyZSBjbGVhcmVkIHdoZW4gZW50ZXJpbmcgcGlwZSgpIGlmIHRoZXJlIHdlcmUgYW55LiBPdGhlcndpc2UsIHRoZXJlIGNvdWxkIHJlbWFpbiBzZWxlY3RlZCBvYmplY3RzIHRoYXQgYXJlIG5vdCB2aXNpYmxlLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjhcIixcbiAgICBcImlkXCI6IDE4NjI2NDg0OCxcbiAgICBcIm51bWJlclwiOiA3MjgsXG4gICAgXCJ0aXRsZVwiOiBcImdldCBvbmNsaWNrIHBhZ2luYXRpb24gaW4gY29udHJvbGxlclwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiZG9uaTExMVwiLFxuICAgICAgXCJpZFwiOiAyMjgxNzI3NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMjI4MTcyNzc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9kb25pMTExXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0zMVQxMTo0ODoyMFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTMxVDE4OjIxOjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSSBuZWVkIHRvIGRldGVjdCB0aGUgY3VycmVudCBwYWdpbmF0aW9uIGJ5IHRoZSBjb250cm9sbGVyIG9uIHRoZSBvbmNsaWNrIHBhZ2luYXRpb24uXFxyXFxuSXMgdGhlcmUgYW55IHdheSB0byBkbyBpdD9cXHJcXG5cXHJcXG5UaGFuayB5b3VcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyNy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI3XCIsXG4gICAgXCJpZFwiOiAxODQxNjgwODMsXG4gICAgXCJudW1iZXJcIjogNzI3LFxuICAgIFwidGl0bGVcIjogXCJzdC1waXBlIG5vdCB3b3JraW5nIHdpdGggc3Qtc2FmZS1zcmNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImRhbmllbGUtYm90dGVsbGlcIixcbiAgICAgIFwiaWRcIjogODc2MDM1MyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODc2MDM1Mz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2RhbmllbGUtYm90dGVsbGlcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogNCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEwLTIwVDA4OjQyOjEzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDItMDhUMTY6MTQ6MzBaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSB0aGVyZSFcXG5JIGhhdmUgYSBwcm9ibGVtIHVzaW5nIHNtYXJ0IHRhYmxlIHVzaW5nIHN0LXNhZmUtc3JjIGFuZCBzdC1waXBlIHRvZ2V0aGVyLlxcbkFzIGxvbmcgYXMgSSdtIHVzaW5nIHN0LXRhYmxlIGFuZCBzdC1zYWZlLXNyYyBkaXJlY3RpdmVzLCBJIGNhbiBzZWUgYWxsIHRoZSBpdGVtcyBpbiB0aGUgdGFibGUuXFxuQXMgbG9uZyBhcyBJJ20gdXNpbmcgc3QtdGFibGUgYW5kIHN0LXBpcGUgZGlyZWN0aXZlcywgSSBjYW4gc2VlIGFsbCB0aGUgaXRlbXMgaW4gdGhlIHRhYmxlLlxcbkJVVCB1c2luZyBzdC10YWJsZSwgc3Qtc2FmZS1zcmMgYW5kIHN0LXBpcGUgZGlyZWN0aXZlcywgbm8gaXRlbSBpcyBzaG93biBpbiB0aGUgdGFibGUuXFxuXFxuSSB0cmllZCB0aGUgc29sdXRpb24gc2hvd24gaW4gaXNzdWUgIzI0MiBidXQgaXQgZGlkbid0IHdvcmsuXFxuSW4gaXNzdWUgIzIzOCBqb3NoaWppbWl0IGhhZCBteSBzYW1lIHByb2JsZW0gYnV0IHRoZSBzb2x1dGlvbiB3YXM6IGRpc2NhcmQgc3Qtc2FmZS1zcmMuIEZvciBtZSBpdCdzIG5vdCBwb3NzaWJsZSBiZWNhdXNlIEkgbmVlZCB0byBmaWx0ZXIgbXkgdGFibGUuXFxuXFxuWW91IGNhbiBmaW5kIG15IGV4YW1wbGUgY29kZSBoZXJlOlxcbmh0dHA6Ly9wbG5rci5jby9lZGl0L05xRDQ3UT9wPXByZXZpZXdcXG5cXG5UaGFua3MgOilcXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjVcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyNS9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjUvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjUvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI1XCIsXG4gICAgXCJpZFwiOiAxODM3NzM4NTAsXG4gICAgXCJudW1iZXJcIjogNzI1LFxuICAgIFwidGl0bGVcIjogXCJHbyB0byBzcGVjaWZpYyBwYWdlIGFmdGVyIGN1c3RvbSBmaWx0ZXJcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImFhbGFyY29uZ1wiLFxuICAgICAgXCJpZFwiOiAxOTU1ODU4NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTk1NTg1ODc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FhbGFyY29uZ1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiAyMjU4NjI0MjMsXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvbm90JTIwcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwibmFtZVwiOiBcIm5vdCByZXByb2R1Y2libGVcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImViNjQyMFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjU5NDM4NTA2LFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL3RvJTIwYmUlMjBjbG9zZWQ6JTIwZG9lcyUyMG5vdCUyMGZvbGxvdyUyMGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJuYW1lXCI6IFwidG8gYmUgY2xvc2VkOiBkb2VzIG5vdCBmb2xsb3cgZ3VpZGVsaW5lc1wiLFxuICAgICAgICBcImNvbG9yXCI6IFwiZmJjYTA0XCIsXG4gICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0xOFQxODo1OTozOFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTMwVDIxOjU3OjQ0WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkuXFxuXFxuSSdtIHVzaW5nIHRoZSBzbWFydCB0YWJsZSB3aXRoIGFuIGFwaSBhbmQgYWxzbyBpbmNsdWRlIGEgY3VzdG9tIGZpbHRlciBkaXJlY3RpdmUgc28gaSBjYW4gZmlsdGVyIGJ5IGRpZmZlcmVudCBjb2x1bW5zIGFuZCBpcyB3b3JraW5nIG9rLiBXaGVuIGkgY2xpY2sgb24gYSByb3cgaSBnbyB0byBhbm90aGVyIHBhZ2UgdG8gc2VlIG1vcmUgaW5mb3JtYXRpb24sIGluIHRoaXMgbmV3IHBhZ2UgdGhlcmVzIGEgXFxcImdvIGJhY2tcXFwiIGJ1dHRvbiAsIHNvIGkgc3RvcmUgdGhlIHRhYmxlIGNvbGxlY3Rpb24gb24gYSBzZXJ2aWNlIHNvIHdoZW4gaSBcXFwiZ28gYmFja1xcXCIgaSByZXN1bWUgdGhlIGNvbGxlY3Rpb24gd2l0aG91dCBjYWxsaW5nIHRoZSBhcGkgYW5kIHRoZSBjdXN0b20gZmlsdGVycyBydW5zIGFnYWluIGJlY2F1c2UgaSBnb3QgdGhlbSBzdG9yZWQgYWxzbyBvbiBhIHNlcnZpY2UuIFRoZSBpc3N1ZSB0aGF0IGkgY2FudCBzb2x2ZSBpcyB0byBnbyB0byBhbiBzcGVjaWZpYyBwYWdlIGFmdGVyIHRoZSBjdXN0b20gZmlsdGVyIGlzIGV4ZWN1dGUuXFxuXFxuSSB0cnkgdG8gdXNlIHRoZSBjb250cm9sbGVyLnNsaWNlKCkgd2F0Y2hpbmcgdGhlIGN0bHIuZ2V0RmlsdGVyZWRDb2xsZWN0aW9uIGJ1dCB0aGUgY3VzdG9tIGZpbHRlciBvdmVycmlkZSB0aGUgcGFnZSBjaGFuZ2VzIHRoYXQgdGhlIHNsaWRlIGZ1bmN0aW9uIG1ha2UuIEFsc28gaSB0cnkgdG8gdXNlIGEgcGVyc2lzdCBkaXJlY3RpdmUgb24gbG9jYWxzdG9yYWdlIGJ1dCBpcyB0aGUgc2FtZSwgdGhlIGN1c3RvbSBmaWx0ZXIgZXhlY3V0ZSBhbmQgb3ZlcnJpZGUgdGhlIGxvYWQgb2YgdGhlIGxvY2Fsc3RvcmFnZSBjb2xsZWN0aW9uIG92ZXJyaWRpbmcgdGhlIHBhZ2UuXFxuXFxuaXMgVGhlcmUgYSB3YXkgdG8gc2V0IGFuIHNwZWNpZmljIHBhZ2UgYWZ0ZXIgdGhlIGN1c3RvbSBmaWx0ZXI/IGZyb20gdGhlIGN1c3RvbSBmaWx0ZXIgZGlyZWN0aXZlIHRoZXJlcyBhIHdheSB0byBhY2Nlc3MgdGhlIHRhYmxlU3RhdGU/XFxuXFxubXkgY3VzdG9tIGZpbHRlciBsb29rcyBzaW1pbGFyIHRvIChvZiBjb3Vyc2Ugd2l0aCBzb21lIGN1c3RvbSBsb2dpYyk6XFxuXFxuYGBgIGphdmFzY3JpcHRcXG4uZmlsdGVyKCdjdXN0b21GaWx0ZXInLCBbJyRmaWx0ZXInLCBmdW5jdGlvbiAoJGZpbHRlcikge1xcbiAgIHJldHVybiBmdW5jdGlvbiBjdXN0b21GaWx0ZXIoYXJyYXksIGV4cHJlc3Npb24pIHtcXG4gICAgIHJldHVybiBvdXRwdXQ7XFxuICAgIH07XFxufV0pO1xcbmBgYFxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyM1wiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIzL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMy9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMy9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjNcIixcbiAgICBcImlkXCI6IDE4MjY3Mzg3MyxcbiAgICBcIm51bWJlclwiOiA3MjMsXG4gICAgXCJ0aXRsZVwiOiBcIkhpZ2hsaWdodCBzZWFyY2ggdGVybT9cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImtkdW1vdmljXCIsXG4gICAgICBcImlkXCI6IDQ1MDM2ODAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzQ1MDM2ODA/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWNcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20va2R1bW92aWNcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWMvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEwLTEzVDAxOjM1OjMyWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTAtMTNUMDE6MzU6MzJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIb3dkeSxcXG5cXG5JcyB0aGVyZSBhIHdheSB0byBoaWdobGlnaHQgdGhlIG1hdGNoaW5nIHNlYXJjaCB0ZXJtIHdpdGhpbiBhIHRhYmxlIGNlbGw/IEkgYW0gaW1hZ2luaW5nIHRoYXQgYW55IHRleHQgd2l0aGluIGEgdGFibGUgY2VsbCB0aGF0IG1hdGNoZXMgdGhlIHNlYXJjaCBxdWVyeSB3b3VsZCBiZSBlbmNsb3NlZCBpbiBhIHNwYW4gdGhhdCBjb3VsZCB0aGVuIGJlIHN0eWxlZCB3aXRoIGEgYmFja2dyb3VuZCBjb2xvciwgZXRjLlxcblxcbkRvZXMgdGhpcyBmdW5jdGlvbmFsaXR5IGV4aXN0P1xcblxcblRoYW5rcy5cXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjJcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMi9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjIvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjIvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIyXCIsXG4gICAgXCJpZFwiOiAxODI0ODEyNTYsXG4gICAgXCJudW1iZXJcIjogNzIyLFxuICAgIFwidGl0bGVcIjogXCJOZXcgRmVhdHVyZSBSZXF1ZXN0IDo6IFNlbGVjdCBBbGwgQnV0dG9uIHdpdGggdGhlIFRhYmxlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJoYXJzaGlsZFwiLFxuICAgICAgXCJpZFwiOiA4NTc3MjE1LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS84NTc3MjE1P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2hhcnNoaWxkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0xMlQwOTo0NTo0NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTIxVDA5OjAwOjUwWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxuXFxuVGhpcyB0YWxrcyBhYm91dCB0aGUgc2ltaWxhciBjb25jZXJucyBhcyBtZW50aW9uZWQgaGVyZSA6LSBodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzI3MFxcblxcblRoZSBwcm92aWRlZCBkaXJlY3RpdmUgYWxzbyB3b3JrcyBsaWtlIGEgY2hhcm0uXFxuXFxuQnV0LCBpIGFtIHdvbmRlcmluZyBpZiBpdCBwb3NzaWJsZSB0byBpbmNsdWRlIGFuIGF1dG8tc2VsZWN0aW9uIGJ1dHRvbiB3aXRoIHRoZSBsaWJyYXJ5IGFuZCB0aGVuIG1heSBiZSB0b2dnbGluZyBpdHMgdXNhZ2VzIHdpdGggdGhlIGhlbHAgb2YgcHJvcGVydHkuXFxuXFxuSSBzZWFyY2hlZCBxdWl0ZSBhIGJpdCBidXQgbm90IGZvdW5kIGFueSBzdWNoIHJlcXVlc3QgbWFkZSBlYXJsaWVyLiBZb3UgY2FuIGRpc2NhcmQgaXQgaWYgc29tZXRoaW5nIGxpa2UgdGhpcyBoYXMgYWxyZWFkeSBiZWVuIGFkcmVzc2VkXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTYvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNlwiLFxuICAgIFwiaWRcIjogMTc3NzA1NDcwLFxuICAgIFwibnVtYmVyXCI6IDcxNixcbiAgICBcInRpdGxlXCI6IFwiQW5ndWxhciBTbWFydCBUYWJsZSBSZWxvYWQgRGF0YSBhbmQgUmVzZXQgRmlsdGVycyBBbG9uZyBXaXRoIFBhZ2luYXRpb24oV2l0aG91dCBzdC1waXBlKVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwibmltYW50aGFoYXJzaGFuYVwiLFxuICAgICAgXCJpZFwiOiAxMDg2NDU5OCxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTA4NjQ1OTg/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9uaW1hbnRoYWhhcnNoYW5hXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDIsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0wOS0xOVQwNToxNzo1OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTA5LTIxVDA2OjAzOjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSSBoYXZlIHRoZSBzbWFydCB0YWJsZSB3aXRoIEFqYXggbG9hZGVkIGRhdGEgd2hlcmUgSSB3YW50IHRvIHJlc2V0IGZpbHRlcnMgYW5kIHJlbG9hZCBteSBkYXRhIGNvbGxlY3Rpb24gd2l0aCByZXNldCBvZiBwYWdpbmF0aW9uIGFzIHdlbGwgd2hlbiBhIGJ1dHRvbiBpcyBjbGlja2VkLiBNeSBjb2RlIGlzIGdpdmVuIGJlbG93LlxcblxcbioqSFRNTCoqXFxuXFxuYDxidXR0b24gbmctY2xpY2s9XFxcInJlc2V0RmlsdGVycygpO1xcXCIgdHlwZT1cXFwiYnV0dG9uXFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1pbmZvXFxcIj5SZXNldDwvYnV0dG9uPmBcXG5cXG4qKkpTKipcXG5cXG5gYGBcXG5cXG4kc2NvcGUucmVzZXRGaWx0ZXJzID0gZnVuY3Rpb24gKCkge1xcbiAgICAgICAgICAgICRzY29wZS5yb3dDb2xsZWN0aW9uID0gW107XFxuICAgICAgICAgICAgJHNjb3BlLmRpc3BsYXllZENvbGxlY3Rpb24gPSBbXTtcXG4gICAgICAgICAgICAkc2NvcGUucHJvZHVjdF90eXBlID0gbnVsbDtcXG4gICAgICAgICAgICAkc2NvcGUucHJvZHVjdF9jYXRlZ29yeSA9IG51bGw7XFxuICAgICAgICAgICAgJHNjb3BlLnNlYXJjaCA9IG51bGw7XFxuICAgICAgICAgICAgJHNjb3BlLnJvd0NvbGxlY3Rpb24gPSBuZXdfZGF0YTtcXG4gICAgICAgIH07XFxuYGBgXFxuXFxuSG93ZXZlciBJIGNhbid0IGdldCB0aGlzIG1hbmFnZWQgc2luY2UgcGFnaW5hdGlvbiBhbmQgZmlsdGVycyBhcmUgbm90IHJlc2V0dGluZy5cXG5cXG5JIGhhdmUgc2VlbiB0aGUgZm9sbG93aW5nIGJ1dCBJJ20gbm90IHN1cmUgaG93IGFjdHVhbGx5IHRoZSB0YWJsZVN0YXRlIE9iamVjdCBjYW4gYmUgYWNjZXNzZWQgc2luY2UgaXQncyB1bmRlZmluZWQgd2hlbiBJIGxvZyBpdCBvbiB0aGUgY29uc29sZSBhbmQgYWxzbyAqKkknbSBub3QgdXNpbmcgc3QtcGlwZSBkaXJlY3RpdmUqKi5cXG5cXG5gYGBcXG50YWJsZVN0YXRlID0gY3RybC50YWJsZVN0YXRlKClcXG50YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSB7fVxcbnRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDBcXG5gYGBcXG5cXG5QbGVhc2UgSGVscC4uLlxcblxcblRoYW5rIFlvdS5cXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTRcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTQvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTQvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE0XCIsXG4gICAgXCJpZFwiOiAxNzU5MDY1NzksXG4gICAgXCJudW1iZXJcIjogNzE0LFxuICAgIFwidGl0bGVcIjogXCJFeGNlbCBsaWtlIHRhYmxlIGNlbGwgc2VsZWN0aW9uXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJzdGFubGV5eHUyMDA1XCIsXG4gICAgICBcImlkXCI6IDUxNjI2ODcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzUxNjI2ODc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9zdGFubGV5eHUyMDA1XCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0wOS0wOVQwMTo0MTo1NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTA5LTA5VDAzOjAwOjExWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiRGVhciBEZXZlbG9wZXJzLFxcblxcbkknZCBsaWtlIHRvIGFzayB3aGV0aGVyIHRoZXJlIGlzIGFueSB3YXkgKG9yIHBsdWdpbikgdG8gZW5oYW5jZSB0YWJsZSBzZWxlY3RpbmcuIEkgd2FudCB0byBzZWxlY3QgdGFibGUgbGlrZSB3aGF0IHdlIGluIEV4Y2VsIGRvLiBJbiBjb25jcmV0ZTogXFxuLSBUaGUgc2VsZWN0aW9uIHdpbGwgaGF2ZSBhIGNvbG9yZWQgYm9yZGVyXFxuLSBXaGVuIHByZXNzIENUUkwrQywgZGF0YSB3aXRob3V0IGZvcm1hdCB3aWxsIGJlIGNvcGllZCBpbnRvIGNsaXBib2FyZC5cXG5cXG5JIGtub3cgSGFuZHNPblRhYmxlIChodHRwczovL2hhbmRzb250YWJsZS5jb20vZXhhbXBsZXMuaHRtbD9oZWFkZXJzKSBpcyBxdWl0ZSBnb29kIGF0IHRoaXMsIGJ1dCBpdHMgcGVyZm9ybWFuY2UgaXMgYSBuaWdodG1hcmUuIEknZCBsaWtlIHRvIHVzZSBteSBmYXZvcml0ZSBTbWFydC1UYWJsZSB0byBkZWxpdmVyIG5ldyBwcm9qZWN0cywgc28gSSdtIGFza2luZyA7LSlcXG5cIlxuICB9XG5dIiwiaW1wb3J0IHN0IGZyb20gJ3NtYXJ0LXRhYmxlLWNvcmUnO1xuaW1wb3J0IGRhdGEgZnJvbSAnLi4vbW9ja0RhdGEnO1xuXG5pbXBvcnQgZ3JpZCBmcm9tICcuL2dyaWQnO1xuaW1wb3J0IGFjdGlvbnMgZnJvbSAnLi9hY3Rpb25zJztcblxuY29uc3Qgc21hcnRMaXN0UmVnaXN0cnkgPSBbXTtcbmNvbnN0IG1hdGNoWFkgPSAoeCwgeSkgPT4gKGl0ZW0pID0+IHggPT09IGl0ZW0ueCAmJiB5ID09PSBpdGVtLnk7XG5jb25zdCBnZXQgPSAoeCwgeSkgPT4gc21hcnRMaXN0UmVnaXN0cnkuZmluZChtYXRjaFhZKHgsIHkpKTtcbmNvbnN0IGhhcyA9ICh4LCB5KSA9PiBnZXQoeCwgeSkgIT09IHZvaWQgMDtcblxuY29uc3QgZXh0ZW5kZWRTbWFydExpc3QgPSAoIG9wdHMgPT4ge1xuICBjb25zdCB7eCwgeX0gPSBvcHRzO1xuICBjb25zdCBpbnN0YW5jZSA9IHN0KG9wdHMpO1xuICByZXR1cm4gT2JqZWN0LmFzc2lnbihpbnN0YW5jZSwge1xuICAgIHJlbW92ZTogKCkgPT4ge1xuICAgICAgc21hcnRMaXN0UmVnaXN0cnkuc3BsaWNlKHNtYXJ0TGlzdFJlZ2lzdHJ5LmluZGV4T2YoaW5zdGFuY2UpLCAxKTtcbiAgICAgIGFjdGlvbnMucmVtb3ZlU21hcnRMaXN0KHt4LCB5fSk7XG4gICAgfVxuICB9KVxufSk7XG5cbmNvbnN0IGluc3RhbmNlID0ge1xuICBmaW5kT3JDcmVhdGUoeCwgeSl7XG4gICAgaWYgKCFoYXMoeCwgeSkpIHtcbiAgICAgIGNvbnN0IHNtYXJ0TGlzdCA9IGV4dGVuZGVkU21hcnRMaXN0KHtkYXRhLCB4LCB5fSk7XG4gICAgICBzbWFydExpc3Qub24oJ0VYRUNfQ0hBTkdFRCcsICh7d29ya2luZ30pID0+IHtcbiAgICAgICAgY29uc3Qge2RhdGE6cGFuZWxEYXRhfSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgICAgICAgYWN0aW9ucy51cGRhdGVQYW5lbERhdGEoe3gsIHksIGRhdGE6IE9iamVjdC5hc3NpZ24oe30sIHBhbmVsRGF0YSwge3Byb2Nlc3Npbmc6IHdvcmtpbmd9KX0pO1xuICAgICAgfSk7XG4gICAgICBzbWFydExpc3Qub25EaXNwbGF5Q2hhbmdlKGl0ZW1zID0+IHtcbiAgICAgICAgYWN0aW9ucy51cGRhdGVTbWFydExpc3Qoe1xuICAgICAgICAgIHgsIHksXG4gICAgICAgICAgdGFibGVTdGF0ZTogc21hcnRMaXN0LmdldFRhYmxlU3RhdGUoKSxcbiAgICAgICAgICBpdGVtc1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgICAgc21hcnRMaXN0UmVnaXN0cnkucHVzaCh7eCwgeSwgc21hcnRMaXN0fSk7XG4gICAgICBhY3Rpb25zLmNyZWF0ZVNtYXJ0TGlzdCh7eCwgeSwgdGFibGVTdGF0ZTogc21hcnRMaXN0LmdldFRhYmxlU3RhdGUoKSwgaXRlbXM6IFtdfSk7XG4gICAgICBzbWFydExpc3QuZXhlYygpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0KHgsIHkpLnNtYXJ0TGlzdDtcbiAgfSxcbiAgZmluZCh4LCB5KXtcbiAgICBjb25zdCBzbCA9IGdldCh4LCB5KTtcbiAgICByZXR1cm4gc2wgIT09IHZvaWQgMCA/IHNsLnNtYXJ0TGlzdCA6IHNsO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBpbnN0YW5jZTtcblxuXG4iLCJpbXBvcnQge2NyZWF0ZVN0b3JlLCBhcHBseU1pZGRsZXdhcmUsIGNvbXBvc2V9IGZyb20gJ3JlZHV4JztcbmltcG9ydCBncmlkIGZyb20gJy4vZ3JpZCc7XG5pbXBvcnQgcmVkdWNlciBmcm9tICcuLi9yZWR1Y2Vycy9pbmRleCc7XG5pbXBvcnQgc21hcnRMaXN0UmVnaXN0cnkgZnJvbSAnLi9zbWFydExpc3RSZWdpc3RyeSc7XG5cbmNvbnN0IGluaXRpYWxTdGF0ZSA9IHtcbiAgZ3JpZDoge1xuICAgIHBhbmVsczogWy4uLmdyaWRdLFxuICAgIGFjdGl2ZTogbnVsbCxcbiAgfSxcbiAgc21hcnRMaXN0OiBbXVxufTtcblxuLyoqXG4gKiB0aGlzIHdpbGwgdXBkYXRlIHRoZSBkaWZmZXJlbnQgcmVnaXN0cmllcyB3aGVuIHBhbmVsIHBvc2l0aW9uaW5nIGNoYW5nZVxuICovXG5jb25zdCBzeW5jUmVnaXN0cmllcyA9IChzdG9yZSkgPT4gbmV4dCA9PiBhY3Rpb24gPT4ge1xuICBjb25zdCB7dHlwZSwgeCwgeSwgc3RhcnRYLCBzdGFydFl9ID0gYWN0aW9uO1xuICBpZiAodHlwZSA9PT0gJ1JFU0VUX1BBTkVMJykge1xuICAgIGNvbnN0IHNsID0gc21hcnRMaXN0UmVnaXN0cnkuZmluZCh4LCB5KTtcbiAgICBpZiAoc2wpIHtcbiAgICAgIHNsLnJlbW92ZSgpO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnRU5EX01PVkUnKSB7XG4gICAgY29uc3Qge2dyaWQ6IHthY3RpdmV9fSA9IHN0b3JlLmdldFN0YXRlKCk7XG4gICAgaWYgKGFjdGl2ZS52YWxpZCA9PT0gdHJ1ZSkge1xuICAgICAgY29uc3Qgb2xkU2wgPSBzbWFydExpc3RSZWdpc3RyeS5maW5kKHN0YXJ0WCwgc3RhcnRZKTtcbiAgICAgIGNvbnN0IG5ld1NsID0gc21hcnRMaXN0UmVnaXN0cnkuZmluZCh4LCB5KTtcbiAgICAgIGlmIChvbGRTbCkge1xuICAgICAgICBvbGRTbC5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICAgIGlmIChuZXdTbCkge1xuICAgICAgICBuZXdTbC5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmV4dChhY3Rpb24pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgY3JlYXRlU3RvcmUocmVkdWNlcihncmlkKSwgaW5pdGlhbFN0YXRlLCBhcHBseU1pZGRsZXdhcmUoc3luY1JlZ2lzdHJpZXMpKTtcbiIsImltcG9ydCAqIGFzIGFjdGlvbnMgZnJvbSAnLi4vYWN0aW9ucy9pbmRleCc7XG5pbXBvcnQgc3RvcmUgZnJvbSAnLi9zdG9yZSc7XG5cbmNvbnN0IG91dHB1dCA9IHt9O1xuXG5mb3IobGV0IGFjdGlvbiBvZiBPYmplY3Qua2V5cyhhY3Rpb25zKSl7XG4gIG91dHB1dFthY3Rpb25dID0gYXJncyA9PiBzdG9yZS5kaXNwYXRjaChhY3Rpb25zW2FjdGlvbl0oYXJncykpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBvdXRwdXQ7IiwiaW1wb3J0IGFjdGlvbnMgZnJvbSAnLi9hY3Rpb25zJztcbmltcG9ydCBncmlkIGZyb20gJy4vZ3JpZCc7XG5pbXBvcnQgc21hcnRMaXN0cyBmcm9tICcuL3NtYXJ0TGlzdFJlZ2lzdHJ5JztcbmltcG9ydCBzdG9yZSBmcm9tICcuL3N0b3JlJztcbmltcG9ydCB7Y29ubmVjdH0gZnJvbSAnZmxhY28nO1xuXG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgYWN0aW9ucyxcbiAgZ3JpZCxcbiAgc21hcnRMaXN0cyxcbiAgc3RvcmUsXG4gIGNvbm5lY3Q6IHNsaWNlU3RhdGUgPT4gY29ubmVjdChzdG9yZSwgc2xpY2VTdGF0ZSlcbn07IiwiaW1wb3J0IHNlcnZpY2VzIGZyb20gJy4uL3NlcnZpY2VzL2luZGV4J1xuXG5leHBvcnQgZGVmYXVsdCBDb21wID0+IHByb3BzID0+IENvbXAocHJvcHMsIHNlcnZpY2VzKTsiLCJpbXBvcnQge2gsIG9uTW91bnQsIG9uVXBkYXRlfSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge1JPV1MsIENPTFVNTlN9IGZyb20gJy4uL2xpYi9jb25zdGFudHMnO1xuXG5jb25zdCBzZXRDdXN0b21Qcm9wZXJ0aWVzID0gdm5vZGUgPT4ge1xuICBjb25zdCB7cHJvcHMsIGRvbX0gPSB2bm9kZTtcbiAgY29uc3Qge3gsIHksIGR4LCBkeSwgen0gPSAocHJvcHMgfHwge30pO1xuICBpZiAoZG9tKSB7XG4gICAgZG9tLnN0eWxlLnNldFByb3BlcnR5KCctLWdyaWQtY29sdW1uLW9mZnNldCcsIHgpO1xuICAgIGRvbS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1ncmlkLXJvdy1vZmZzZXQnLCB5KTtcbiAgICBkb20uc3R5bGUuc2V0UHJvcGVydHkoJy0tZ3JpZC1jb2x1bW4tc3BhbicsIGR4KTtcbiAgICBkb20uc3R5bGUuc2V0UHJvcGVydHkoJy0tZ3JpZC1yb3ctc3BhbicsIGR5KTtcbiAgICBpZiAoeikge1xuICAgICAgZG9tLnN0eWxlLnNldFByb3BlcnR5KCd6LWluZGV4Jywgeik7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlKG9uTW91bnQoc2V0Q3VzdG9tUHJvcGVydGllcyksIG9uVXBkYXRlKHNldEN1c3RvbVByb3BlcnRpZXMpKTsiLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJ1xuaW1wb3J0IHBhbmVsIGZyb20gJy4uL3ZpZXdzL1BhbmVsJztcblxuZXhwb3J0IGRlZmF1bHQgcGFuZWwoKHt4LCB5LCBhZG9ybmVyU3RhdHVzfSkgPT4ge1xuICBjb25zdCBjbGFzc2VzID0gWydwYW5lbCddO1xuICBpZiAoYWRvcm5lclN0YXR1cyA9PT0gMSkge1xuICAgIGNsYXNzZXMucHVzaCgndmFsaWQtcGFuZWwnKTtcbiAgfSBlbHNlIGlmIChhZG9ybmVyU3RhdHVzID09PSAtMSkge1xuICAgIGNsYXNzZXMucHVzaCgnaW52YWxpZC1wYW5lbCcpO1xuICB9XG4gIHJldHVybiA8ZGl2IGNsYXNzPXtjbGFzc2VzLmpvaW4oJyAnKX0geD17eH0geT17eX0gZHg9ezF9IGR5PXsxfT48L2Rpdj47XG59KTsiLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJ1xuaW1wb3J0IEFkb3JuZXJQYW5lbCBmcm9tICcuLi92aWV3cy9BZG9ybmVyUGFuZWwnO1xuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMsIHtncmlkfSkgPT4ge1xuICBjb25zdCB7eCwgeX0gPSBwcm9wcztcbiAgY29uc3Qge2Fkb3JuZXJTdGF0dXMgPSAwfSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgcmV0dXJuIDxBZG9ybmVyUGFuZWwgeD17eH0geT17eX0gYWRvcm5lclN0YXR1cz17YWRvcm5lclN0YXR1c30vPlxufSIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IHBhbmVsIGZyb20gJy4vUGFuZWwnO1xuaW1wb3J0IHtST1dTLCBDT0xVTU5TfSBmcm9tICcuLi9saWIvY29uc3RhbnRzJ1xuaW1wb3J0IHtFbmxhcmdlLCBFbmxhcmdlMn0gZnJvbSAnLi4vY29tcG9uZW50cy9pY29ucyc7XG5cbmV4cG9ydCBkZWZhdWx0IENvbXAgPT4gcGFuZWwoKHByb3BzKSA9PiB7XG4gIGNvbnN0IHt4LCB5LCBkeCA9IDEsIGR5ID0gMSwgYWRvcm5lclN0YXR1cywgb25SZXNpemVTdGFydCwgb25Nb3ZlU3RhcnR9ID0gcHJvcHM7XG4gIGNvbnN0IHogPSAoUk9XUyAtIHkpICogMTAgKyBDT0xVTU5TIC0geDtcbiAgY29uc3QgcGFuZWxDbGFzc2VzID0gWydwYW5lbCcsICdkYXRhLXBhbmVsJ107XG5cbiAgaWYgKGFkb3JuZXJTdGF0dXMgIT09IDApIHtcbiAgICBwYW5lbENsYXNzZXMucHVzaCgnYWN0aXZlLXBhbmVsJyk7XG4gIH1cblxuICByZXR1cm4gKDxkaXYgeD17eH0geT17eX0gZHg9e2R4fSBkeT17ZHl9IHo9e3p9IGNsYXNzPXtwYW5lbENsYXNzZXMuam9pbignICcpfT5cbiAgICA8ZGl2IGNsYXNzPVwibW92ZS1oYW5kbGVcIiBkcmFnZ2FibGU9XCJ0cnVlXCIgb25EcmFnU3RhcnQ9e29uTW92ZVN0YXJ0fT5cbiAgICAgIDxFbmxhcmdlLz5cbiAgICA8L2Rpdj5cbiAgICA8Q29tcCB7Li4ucHJvcHN9IC8+XG4gICAgPGRpdiBjbGFzcz1cInJlc2l6ZS1oYW5kbGVcIiBkcmFnZ2FibGU9XCJ0cnVlXCIgb25EcmFnU3RhcnQ9e29uUmVzaXplU3RhcnR9PlxuICAgICAgPEVubGFyZ2UyLz5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+KTtcbn0pOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IHtTdGF0c0JhcnMsIExpc3QsIFNpZ21hfSBmcm9tICcuLi9jb21wb25lbnRzL2ljb25zJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUocHJvcHMgPT5cbiAgPGRpdiBjbGFzcz1cImVtcHR5LXBhbmVsLXRvb2xiYXJcIj5cbiAgICA8YnV0dG9uIG9uQ2xpY2s9e3Byb3BzLmNyZWF0ZVNtYXJ0TGlzdH0+PExpc3QvPjwvYnV0dG9uPlxuICAgIDxidXR0b24gb25DbGljaz17cHJvcHMuY3JlYXRlU21hcnRDaGFydH0+PFN0YXRzQmFycy8+PC9idXR0b24+XG4gICAgPGJ1dHRvbiBvbkNsaWNrPXtwcm9wcy5jcmVhdGVTbWFydEFnZ3JlZ2F0aW9ufT48U2lnbWEvPjwvYnV0dG9uPlxuICA8L2Rpdj4pOyIsImV4cG9ydCBkZWZhdWx0IChDb21wKSA9PiAocHJvcHMsIHNlcnZpY2VzKSA9PiB7XG4gIGNvbnN0IHt4LCB5fSA9IHByb3BzO1xuICBjb25zdCB7YWN0aW9uc30gPSBzZXJ2aWNlcztcblxuICBjb25zdCBvblJlc2l6ZVN0YXJ0ID0gZXYgPT4ge1xuICAgIGV2LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ2NvcHknO1xuICAgIGV2LmRhdGFUcmFuc2Zlci5zZXREYXRhKCd0ZXh0L3BsYWluJywgSlNPTi5zdHJpbmdpZnkoe3gsIHksIG9wZXJhdGlvbjogJ3Jlc2l6ZSd9KSk7XG4gICAgYWN0aW9ucy5zdGFydFJlc2l6ZSh7eCwgeX0pO1xuICB9O1xuXG4gIGNvbnN0IG9uTW92ZVN0YXJ0ID0gZXYgPT4ge1xuICAgIGV2LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuICAgIGV2LmRhdGFUcmFuc2Zlci5zZXREYXRhKCd0ZXh0L3BsYWluJywgSlNPTi5zdHJpbmdpZnkoe3gsIHksIG9wZXJhdGlvbjogJ21vdmUnfSkpO1xuICAgIGFjdGlvbnMuc3RhcnRNb3ZlKHt4LCB5fSk7XG4gIH07XG5cbiAgcmV0dXJuIENvbXAoe29uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0LCAuLi5wcm9wc30sIHNlcnZpY2VzKTtcbn07XG5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEVtcHR5RGF0YVBhbmVsIGZyb20gJy4uL3ZpZXdzL0VtcHR5RGF0YVBhbmVsJztcbmltcG9ydCBmbGV4aWJsZSBmcm9tICcuL0ZsZXhpYmxlRGF0YVBhbmVsJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUoKHByb3BzLCB7Z3JpZCwgYWN0aW9uc30pID0+IHtcbiAgY29uc3Qge3gsIHksIG9uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0fSA9IHByb3BzO1xuICBjb25zdCBwYW5lbERhdGEgPSBncmlkLmdldERhdGEoeCwgeSk7XG5cbiAgY29uc3QgY3JlYXRlU21hcnRMaXN0ID0gXyA9PiB7XG4gICAgYWN0aW9ucy5vcGVuTW9kYWwoe3gsIHksIHRpdGxlOiAnQ3JlYXRlIG5ldyBkYXRhIHBhbmVsJywgbW9kYWxUeXBlOiAnY3JlYXRlU21hcnRMaXN0UGFuZWxEYXRhJ30pO1xuICB9O1xuXG4gIGNvbnN0IGNyZWF0ZVNtYXJ0Q2hhcnQgPSBfID0+IHtcbiAgICBhY3Rpb25zLm9wZW5Nb2RhbCh7eCwgeSwgdGl0bGU6ICdDcmVhdGUgbmV3IENoYXJ0IGRhdGEgcGFuZWwnLCBtb2RhbFR5cGU6ICdjcmVhdGVTbWFydENoYXJ0UGFuZWxEYXRhJ30pXG4gIH07XG5cbiAgcmV0dXJuIDxFbXB0eURhdGFQYW5lbCB7Li4ucGFuZWxEYXRhfSBvbk1vdmVTdGFydD17b25Nb3ZlU3RhcnR9IGNyZWF0ZVNtYXJ0TGlzdD17Y3JlYXRlU21hcnRMaXN0fVxuICAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZVNtYXJ0Q2hhcnQ9e2NyZWF0ZVNtYXJ0Q2hhcnR9XG4gICAgICAgICAgICAgICAgICAgICAgICAgb25SZXNpemVTdGFydD17b25SZXNpemVTdGFydH0vPjtcbn0pOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IHtFcXVhbGl6ZXIsIEJpbjIsIFdyZW5jaH0gZnJvbSAnLi4vY29tcG9uZW50cy9pY29ucyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZsZXhpYmxlKHByb3BzID0+IHtcbiAgY29uc3Qge2RhdGEgPSB7fSwgb25SZXNldCwgb25FZGl0LCBvblRvZ2dsZVRvb2xCYXJ9ID0gcHJvcHM7XG4gIGNvbnN0IHtwcm9jZXNzaW5nID0gZmFsc2V9ID0gZGF0YTtcbiAgY29uc3Qgc2hvd1Rvb2xiYXIgPSBTdHJpbmcoZGF0YS5zaG93VG9vbEJhciA9PT0gdHJ1ZSk7XG4gIC8vdG9kbyBhcmlhLWNvbnRyb2xzXG4gIHJldHVybiAoPGRpdiBjbGFzcz1cInBhbmVsLWNvbnRlbnRcIj5cbiAgICA8aGVhZGVyIGNsYXNzPVwicGFuZWwtaGVhZGVyXCI+XG4gICAgICA8aDI+e2RhdGEudGl0bGV9PC9oMj5cbiAgICAgIDxidXR0b24gYXJpYS1oYXNwb3B1cD1cInRydWVcIiBhcmlhLXByZXNzZWQ9e3Nob3dUb29sYmFyfSBhcmlhLWV4cGFuZGVkPXtzaG93VG9vbGJhcn0gb25DbGljaz17b25Ub2dnbGVUb29sQmFyfT48V3JlbmNoLz48L2J1dHRvbj5cbiAgICAgIDxidXR0b24gb25DbGljaz17b25FZGl0fT48RXF1YWxpemVyLz48L2J1dHRvbj5cbiAgICAgIDxidXR0b24gb25DbGljaz17b25SZXNldH0+PEJpbjIvPlxuICAgICAgPC9idXR0b24+XG4gICAgPC9oZWFkZXI+XG4gICAgPGRpdiBjbGFzcz1cInBhbmVsLWJvZHlcIj5cbiAgICAgIDxkaXYgYXJpYS1oaWRkZW49e1N0cmluZyghcHJvY2Vzc2luZyl9IGNsYXNzPVwicHJvY2Vzc2luZy1vdmVybGF5XCI+XG4gICAgICAgIFByb2Nlc3NpbmcgLi4uXG4gICAgICA8L2Rpdj5cbiAgICAgIHtwcm9wcy5jaGlsZHJlbn1cbiAgICA8L2Rpdj5cbiAgPC9kaXY+KTtcbn0pOyIsImltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuY29uc3Qge3Byb3h5TGlzdGVuZXIsIGVtaXR0ZXI6Y3JlYXRlRW1pdHRlcn0gPWV2ZW50cztcblxuY29uc3QgRE9NX0NMSUNLID0gJ0RPTV9DTElDSyc7XG5jb25zdCBET01fS0VZRE9XTiA9ICdET01fS0VZRE9XTic7XG5jb25zdCBET01fRk9DVVMgPSAnRE9NX0ZPQ1VTJztcblxuY29uc3QgZG9tTGlzdGVuZXIgPSBwcm94eUxpc3RlbmVyKHtcbiAgW0RPTV9DTElDS106ICdvbmNsaWNrJyxcbiAgW0RPTV9LRVlET1dOXTogJ29ua2V5ZG93bicsXG4gIFtET01fRk9DVVNdOiAnb25mb2N1cydcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCAoe2VsZW1lbnQsIGVtaXR0ZXIgPSBjcmVhdGVFbWl0dGVyKCl9KSA9PiB7XG5cbiAgaWYgKCFlbGVtZW50KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdhIGRvbSBlbGVtZW50IG11c3QgYmUgcHJvdmlkZWQnKTtcbiAgfVxuXG4gIGNvbnN0IGRvbUxpc3RlbmVySGFuZGxlciA9IChldmVudE5hbWUpID0+IChldikgPT4gZW1pdHRlci5kaXNwYXRjaChldmVudE5hbWUsIGV2KTtcblxuICBjb25zdCBsaXN0ZW5lciA9IGRvbUxpc3RlbmVyKHtlbWl0dGVyfSk7XG4gIGNvbnN0IGNsaWNrTGlzdGVuZXIgPSBkb21MaXN0ZW5lckhhbmRsZXIoRE9NX0NMSUNLKTtcbiAgY29uc3Qga2V5ZG93bkxpc3RlbmVyID0gZG9tTGlzdGVuZXJIYW5kbGVyKERPTV9LRVlET1dOKTtcbiAgY29uc3QgZm9jdXNMaXN0ZW5lciA9IGRvbUxpc3RlbmVySGFuZGxlcihET01fRk9DVVMpO1xuXG4gIGNvbnN0IGFwaSA9IHtcbiAgICBlbGVtZW50KCl7XG4gICAgICByZXR1cm4gZWxlbWVudDtcbiAgICB9LFxuICAgIGF0dHIoYXR0cmlidXRlTmFtZSwgdmFsdWUpe1xuICAgICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHJpYnV0ZU5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoYXR0cmlidXRlTmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0sXG4gICAgYWRkQ2xhc3MoLi4uY2xhc3NOYW1lcyl7XG4gICAgICBlbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uY2xhc3NOYW1lcyk7XG4gICAgfSxcbiAgICByZW1vdmVDbGFzcyguLi5jbGFzc05hbWVzKXtcbiAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5jbGFzc05hbWVzKTtcbiAgICB9LFxuICAgIGNsZWFuKCl7XG4gICAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tMaXN0ZW5lcik7XG4gICAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBrZXlkb3duTGlzdGVuZXIpO1xuICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdmb2N1cycsIGZvY3VzTGlzdGVuZXIpO1xuICAgICAgbGlzdGVuZXIub2ZmKERPTV9DTElDSyk7XG4gICAgICBsaXN0ZW5lci5vZmYoRE9NX0tFWURPV04pO1xuICAgICAgbGlzdGVuZXIub2ZmKERPTV9GT0NVUyk7XG4gICAgfVxuICB9O1xuXG4gIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGlja0xpc3RlbmVyKTtcbiAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywga2V5ZG93bkxpc3RlbmVyKTtcbiAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsIGZvY3VzTGlzdGVuZXIpO1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKGxpc3RlbmVyLCBhcGkpO1xufTsiLCJjb25zdCBrZXkgPSBldiA9PiAoe2tleTogZXYua2V5LCBrZXlDb2RlOiBldi5rZXlDb2RlLCBjb2RlOiBldi5jb2RlfSk7XG5jb25zdCBjaGVja0tleSA9IChrZXlOYW1lLCBrZXlDb2RlKSA9PiBldiA9PiB7XG4gIGNvbnN0IGsgPSBrZXkoZXYpO1xuICByZXR1cm4gay5rZXkgPyBrLmtleSA9PT0ga2V5TmFtZSA6IGsua2V5Q29kZSA9PT0ga2V5Q29kZTtcbn07XG5cbmV4cG9ydCBjb25zdCBpc0Fycm93TGVmdCA9IGNoZWNrS2V5KCdBcnJvd0xlZnQnLCAzNyk7XG5leHBvcnQgY29uc3QgaXNBcnJvd1VwID0gY2hlY2tLZXkoJ0Fycm93VXAnLCAzOCk7XG5leHBvcnQgY29uc3QgaXNBcnJvd1JpZ2h0ID0gY2hlY2tLZXkoJ0Fycm93UmlnaHQnLCAzOSk7XG5leHBvcnQgY29uc3QgaXNBcnJvd0Rvd24gPSBjaGVja0tleSgnQXJyb3dEb3duJywgNDApO1xuZXhwb3J0IGNvbnN0IGlzRXNjYXBlID0gY2hlY2tLZXkoJ0VzY2FwZScsIDI3KTtcbmV4cG9ydCBjb25zdCBpc0VudGVyID0gY2hlY2tLZXkoJ0VudGVyJywgMTMpO1xuZXhwb3J0IGNvbnN0IGlzU3BhY2UgPSBldiA9PiB7XG4gIGNvbnN0IGsgPSBrZXkoZXYpO1xuICByZXR1cm4gay5jb2RlID8gay5jb2RlID09PSAnU3BhY2UnIDogay5rZXlDb2RlID09PSAzMjtcbn07IiwiaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ3NtYXJ0LXRhYmxlLWV2ZW50cyc7XG5pbXBvcnQgZWxlbWVudENvbXBvbmVudCBmcm9tICcuLi9jb21tb24vZWxlbWVudCc7XG5pbXBvcnQgKiBhcyBjaGVja0tleXMgZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCB7cHJveHlMaXN0ZW5lciwgZW1pdHRlcjpjcmVhdGVFbWl0dGVyfSA9IGV2ZW50cztcblxuY29uc3QgRVhQQU5ERURfQ0hBTkdFRCA9ICdFWFBBTkRFRF9DSEFOR0VEJztcbmNvbnN0IHByb3h5ID0gcHJveHlMaXN0ZW5lcih7W0VYUEFOREVEX0NIQU5HRURdOiAnb25FeHBhbmRlZENoYW5nZSd9KTtcblxuY29uc3QgZXhwYW5kYWJsZUZhY3RvcnkgPSAoe2VtaXR0ZXIgPSBjcmVhdGVFbWl0dGVyKCksIGV4cGFuZGVkfSkgPT4ge1xuICBjb25zdCBzdGF0ZSA9IHtleHBhbmRlZH07XG4gIGNvbnN0IGRpc3BhdGNoID0gKCkgPT4gZW1pdHRlci5kaXNwYXRjaChFWFBBTkRFRF9DSEFOR0VELCBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSkpO1xuICBjb25zdCBzZXRBbmREaXNwYXRjaCA9ICh2YWwpID0+ICgpID0+IHtcbiAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHN0YXRlLmV4cGFuZGVkID0gdmFsO1xuICAgIH1cbiAgICBkaXNwYXRjaCgpO1xuICB9O1xuICBjb25zdCB0YXJnZXQgPSBwcm94eSh7ZW1pdHRlcn0pO1xuICByZXR1cm4gT2JqZWN0LmFzc2lnbih0YXJnZXQsIHtcbiAgICBleHBhbmQ6IHNldEFuZERpc3BhdGNoKHRydWUpLFxuICAgIGNvbGxhcHNlOiBzZXRBbmREaXNwYXRjaChmYWxzZSksXG4gICAgdG9nZ2xlKCl7XG4gICAgICBzdGF0ZS5leHBhbmRlZCA9ICFzdGF0ZS5leHBhbmRlZDtcbiAgICAgIGRpc3BhdGNoKCk7XG4gICAgfSxcbiAgICByZWZyZXNoKCl7XG4gICAgICBkaXNwYXRjaCgpO1xuICAgIH0sXG4gICAgY2xlYW4oKXtcbiAgICAgIHRhcmdldC5vZmYoKTtcbiAgICB9XG4gIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgICh7ZXhwYW5kS2V5ID0gJ2lzQXJyb3dEb3duJywgY29sbGFwc2VLZXkgPSAnaXNBcnJvd1VwJ30gPSB7fSkgPT5cbiAgKHtlbGVtZW50fSkgPT4ge1xuICAgIGNvbnN0IGV4cGFuZGVyID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbYXJpYS1leHBhbmRlZF0nKTtcbiAgICBjb25zdCBleHBhbmRlZCA9IGV4cGFuZGVyLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpICE9PSAnZmFsc2UnO1xuXG4gICAgY29uc3QgZW1pdHRlciA9IGNyZWF0ZUVtaXR0ZXIoKTtcblxuICAgIGNvbnN0IGV4cGFuZGFibGVDb21wID0gZXhwYW5kYWJsZUZhY3Rvcnkoe2VtaXR0ZXIsIGV4cGFuZGVkfSk7XG4gICAgY29uc3QgZWxlbWVudENvbXAgPSBlbGVtZW50Q29tcG9uZW50KHtlbGVtZW50LCBlbWl0dGVyfSk7XG5cbiAgICBjb25zdCBleHBhbmRhYmxlSWQgPSBleHBhbmRlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnKSB8fCAnJztcbiAgICBjb25zdCBleHBhbmRhYmxlID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKGAjJHtleHBhbmRhYmxlSWR9YCkgfHwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZXhwYW5kYWJsZUlkKTtcblxuICAgIGNvbnN0IGV4cGFuZGVyQ29tcCA9IGVsZW1lbnRDb21wb25lbnQoe2VsZW1lbnQ6IGV4cGFuZGVyLCBlbWl0dGVyOiBjcmVhdGVFbWl0dGVyKCl9KTtcbiAgICBjb25zdCBleHBhbmRlZENvbXAgPSBlbGVtZW50Q29tcG9uZW50KHtlbGVtZW50OiBleHBhbmRhYmxlLCBlbWl0dGVyOiBjcmVhdGVFbWl0dGVyKCl9KTtcblxuICAgIGV4cGFuZGFibGVDb21wLm9uRXhwYW5kZWRDaGFuZ2UoKHtleHBhbmRlZH0pID0+IHtcbiAgICAgIGV4cGFuZGVyQ29tcC5hdHRyKCdhcmlhLWV4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgZXhwYW5kZWRDb21wLmF0dHIoJ2FyaWEtaGlkZGVuJywgIWV4cGFuZGVkKTtcbiAgICB9KTtcblxuICAgIGV4cGFuZGVyQ29tcC5vbmtleWRvd24oKGV2KSA9PiB7XG4gICAgICBpZiAoY2hlY2tLZXlzLmlzRW50ZXIoZXYpIHx8IGNoZWNrS2V5cy5pc1NwYWNlKGV2KSkge1xuICAgICAgICBleHBhbmRhYmxlQ29tcC50b2dnbGUoKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoY29sbGFwc2VLZXkgJiYgY2hlY2tLZXlzW2NvbGxhcHNlS2V5XShldikpIHtcbiAgICAgICAgZXhwYW5kYWJsZUNvbXAuY29sbGFwc2UoKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoZXhwYW5kS2V5ICYmIGNoZWNrS2V5c1tleHBhbmRLZXldKGV2KSkge1xuICAgICAgICBleHBhbmRhYmxlQ29tcC5leHBhbmQoKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGV4cGFuZGVyQ29tcC5vbmNsaWNrKChldikgPT4ge1xuICAgICAgY29uc3Qge2NsaWVudFgsIGNsaWVudFl9ID0gZXY7XG4gICAgICAvLyB0byBkaWZmZXJlbnRpYXRlIGEgY2xpY2sgZ2VuZXJhdGVkIGZyb20gYSBrZXlwcmVzcyBvciBhbiBhY3R1YWwgY2xpY2tcbiAgICAgIC8vIHByZXZlbnREZWZhdWx0IGRvZXMgbm90IHNlZW0gZW5vdWdoIG9uIEZGXG4gICAgICBpZiAoY2xpZW50WCAhPT0gMCAmJiBjbGllbnRZICE9PSAwKSB7XG4gICAgICAgIGV4cGFuZGFibGVDb21wLnRvZ2dsZSgpXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBleHBhbmRhYmxlQ29tcC5yZWZyZXNoKCk7XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgZXhwYW5kYWJsZUNvbXAsIGVsZW1lbnRDb21wLCB7XG4gICAgICBleHBhbmRlcigpe1xuICAgICAgICByZXR1cm4gZXhwYW5kZXJDb21wO1xuICAgICAgfSxcbiAgICAgIGV4cGFuZGFibGUoKXtcbiAgICAgICAgcmV0dXJuIGV4cGFuZGVkQ29tcDtcbiAgICAgIH0sXG4gICAgICBjbGVhbigpe1xuICAgICAgICBlbGVtZW50Q29tcC5jbGVhbigpO1xuICAgICAgICBleHBhbmRlckNvbXAuY2xlYW4oKTtcbiAgICAgICAgZXhwYW5kZWRDb21wLmNsZWFuKCk7XG4gICAgICAgIGV4cGFuZGFibGVDb21wLmNsZWFuKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07IiwiaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ3NtYXJ0LXRhYmxlLWV2ZW50cyc7XG5cbmNvbnN0IHtwcm94eUxpc3RlbmVyLCBlbWl0dGVyOmNyZWF0ZUVtaXR0ZXJ9ID0gZXZlbnRzO1xuXG5jb25zdCBBQ1RJVkVfSVRFTV9DSEFOR0VEID0gJ0FDVElWRV9JVEVNX0NIQU5HRUQnO1xuY29uc3QgcHJveHkgPSBwcm94eUxpc3RlbmVyKHtbQUNUSVZFX0lURU1fQ0hBTkdFRF06ICdvbkFjdGl2ZUl0ZW1DaGFuZ2UnfSk7XG5cbmV4cG9ydCBkZWZhdWx0ICh7ZW1pdHRlciA9IGNyZWF0ZUVtaXR0ZXIoKSwgYWN0aXZlSXRlbSA9IDAsIGl0ZW1Db3VudH0pID0+IHtcbiAgY29uc3Qgc3RhdGUgPSB7YWN0aXZlSXRlbSwgaXRlbUNvdW50fTtcbiAgY29uc3QgZXZlbnQgPSBwcm94eSh7ZW1pdHRlcn0pO1xuICBjb25zdCBkaXNwYXRjaCA9ICgpID0+IGVtaXR0ZXIuZGlzcGF0Y2goQUNUSVZFX0lURU1fQ0hBTkdFRCwgT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUpKTtcbiAgY29uc3QgYXBpID0ge1xuICAgIGFjdGl2YXRlSXRlbShpbmRleCl7XG4gICAgICBzdGF0ZS5hY3RpdmVJdGVtID0gaW5kZXggPCAwID8gaXRlbUNvdW50IC0gMSA6IGluZGV4ICUgaXRlbUNvdW50O1xuICAgICAgZGlzcGF0Y2goKTtcbiAgICB9LFxuICAgIGFjdGl2YXRlTmV4dEl0ZW0oKXtcbiAgICAgIGFwaS5hY3RpdmF0ZUl0ZW0oc3RhdGUuYWN0aXZlSXRlbSArIDEpO1xuICAgIH0sXG4gICAgYWN0aXZhdGVQcmV2aW91c0l0ZW0oKXtcbiAgICAgIGFwaS5hY3RpdmF0ZUl0ZW0oc3RhdGUuYWN0aXZlSXRlbSAtIDEpO1xuICAgIH0sXG4gICAgcmVmcmVzaCgpe1xuICAgICAgZGlzcGF0Y2goKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24oZXZlbnQsIGFwaSk7XG59OyIsImltcG9ydCBlbGVtZW50Q29tcCBmcm9tICcuLi9jb21tb24vZWxlbWVudCc7XG5pbXBvcnQgKiBhcyBjaGVja0tleXMgZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCBjcmVhdGVNZW51SXRlbSA9ICh7cHJldmlvdXNLZXksIG5leHRLZXl9KSA9PlxuICAoe21lbnUsIGVsZW1lbnQsIGluZGV4fSkgPT4ge1xuICAgIGNvbnN0IGNvbXAgPSBlbGVtZW50Q29tcCh7ZWxlbWVudH0pO1xuICAgIGNvbXAuYXR0cigncm9sZScsICdtZW51aXRlbScpO1xuICAgIGNvbXAub25jbGljaygoKSA9PiB7XG4gICAgICBtZW51LmFjdGl2YXRlSXRlbShpbmRleCk7XG4gICAgfSk7XG4gICAgY29tcC5vbmtleWRvd24oKGV2KSA9PiB7XG4gICAgICBpZiAoY2hlY2tLZXlzW25leHRLZXldKGV2KSkge1xuICAgICAgICBtZW51LmFjdGl2YXRlTmV4dEl0ZW0oKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hlY2tLZXlzW3ByZXZpb3VzS2V5XShldikpIHtcbiAgICAgICAgbWVudS5hY3RpdmF0ZVByZXZpb3VzSXRlbSgpO1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgbWVudS5vbkFjdGl2ZUl0ZW1DaGFuZ2UoKHthY3RpdmVJdGVtfSkgPT4ge1xuICAgICAgaWYgKGFjdGl2ZUl0ZW0gPT09IGluZGV4KSB7XG4gICAgICAgIGFjdGl2YXRlZCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVhY3RpdmF0ZWQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGFjdGl2YXRlZCA9ICgpID0+IHtcbiAgICAgIGNvbXAuYXR0cigndGFiaW5kZXgnLCAnMCcpO1xuICAgICAgZWxlbWVudC5mb2N1cygpO1xuICAgIH07XG5cbiAgICBjb25zdCBkZWFjdGl2YXRlZCA9ICgpID0+IHtcbiAgICAgIGNvbXAuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcbiAgICB9O1xuICAgIHJldHVybiBjb21wO1xuICB9O1xuXG5cbmV4cG9ydCBjb25zdCB2ZXJ0aWNhbE1lbnVJdGVtID0gY3JlYXRlTWVudUl0ZW0oe3ByZXZpb3VzS2V5OiAnaXNBcnJvd1VwJywgbmV4dEtleTogJ2lzQXJyb3dEb3duJ30pO1xuZXhwb3J0IGNvbnN0IGhvcml6b250YWxNZW51SXRlbSA9IGNyZWF0ZU1lbnVJdGVtKHtwcmV2aW91c0tleTogJ2lzQXJyb3dMZWZ0JywgbmV4dEtleTogJ2lzQXJyb3dSaWdodCd9KTsiLCJpbXBvcnQgaXRlbUxpc3QgZnJvbSAnLi4vY29tbW9uL3NpbmdsZUFjdGl2ZUl0ZW1MaXN0JztcbmltcG9ydCB7dmVydGljYWxNZW51SXRlbX0gZnJvbSAnLi9tZW51SXRlbSdcbmltcG9ydCBlbGVtZW50RmFjdG9yeSBmcm9tICcuLi9jb21tb24vZWxlbWVudCc7XG5pbXBvcnQge2VtaXR0ZXIgYXMgY3JlYXRlRW1pdHRlcn0gZnJvbSAnc21hcnQtdGFibGUtZXZlbnRzJztcblxuZXhwb3J0IGRlZmF1bHQgKG1lbnVJdGVtRmFjdG9yeSA9IHZlcnRpY2FsTWVudUl0ZW0pID0+XG4gICh7ZWxlbWVudH0pID0+IHtcbiAgICBjb25zdCBlbWl0dGVyID0gY3JlYXRlRW1pdHRlcigpO1xuICAgIGNvbnN0IG1lbnVJdGVtcyA9IEFycmF5LmZyb20oZWxlbWVudC5jaGlsZHJlbikuZmlsdGVyKGNoaWxkID0+IGNoaWxkLmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnbWVudWl0ZW0nKTtcbiAgICBjb25zdCBsaXN0Q29tcCA9IGl0ZW1MaXN0KHtlbWl0dGVyLCBpdGVtQ291bnQ6IG1lbnVJdGVtcy5sZW5ndGh9KTtcbiAgICBjb25zdCBtZW51Q29tcCA9IGVsZW1lbnRGYWN0b3J5KHtlbGVtZW50LCBlbWl0dGVyfSk7XG5cbiAgICBtZW51Q29tcC5hdHRyKCdyb2xlJywgJ21lbnUnKTtcblxuICAgIGNvbnN0IG1lbnVJdGVtQ29tcHMgPSBtZW51SXRlbXMubWFwKChlbGVtZW50LCBpbmRleCkgPT4gbWVudUl0ZW1GYWN0b3J5KHttZW51OiBsaXN0Q29tcCwgZWxlbWVudCwgaW5kZXh9KSk7XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgbGlzdENvbXAsIG1lbnVDb21wLCB7XG4gICAgICBpdGVtKGluZGV4KXtcbiAgICAgICAgcmV0dXJuIG1lbnVJdGVtQ29tcHNbaW5kZXhdO1xuICAgICAgfSxcbiAgICAgIGNsZWFuKCl7XG4gICAgICAgIGxpc3RDb21wLm9mZigpO1xuICAgICAgICBtZW51Q29tcC5jbGVhbigpO1xuICAgICAgICBtZW51SXRlbUNvbXBzLmZvckVhY2goY29tcCA9PiB7XG4gICAgICAgICAgY29tcC5jbGVhbigpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcblxuIiwiaW1wb3J0IG1lbnUgZnJvbSAnLi4vbWVudS9tZW51JztcbmltcG9ydCBleHBhbmRhYmxlRmFjdG9yeSBmcm9tICcuLi9leHBhbmRhYmxlL2V4cGFuZGFibGUnO1xuaW1wb3J0IHtpc0VzY2FwZX0gZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCB2ZXJ0aWNhbE1lbnUgPSBtZW51KCk7XG5jb25zdCBleHBhbmRhYmxlID0gZXhwYW5kYWJsZUZhY3RvcnkoKTtcblxuZXhwb3J0IGRlZmF1bHQgKHtlbGVtZW50fSkgPT4ge1xuICBjb25zdCBleHBhbmRhYmxlQ29tcCA9IGV4cGFuZGFibGUoe2VsZW1lbnR9KTtcbiAgZXhwYW5kYWJsZUNvbXAuZXhwYW5kZXIoKS5hdHRyKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcbiAgY29uc3QgbWVudUNvbXAgPSB2ZXJ0aWNhbE1lbnUoe2VsZW1lbnQ6IGV4cGFuZGFibGVDb21wLmV4cGFuZGFibGUoKS5lbGVtZW50KCl9KTtcblxuICBleHBhbmRhYmxlQ29tcC5vbkV4cGFuZGVkQ2hhbmdlKCh7ZXhwYW5kZWR9KSA9PiB7XG4gICAgaWYgKGV4cGFuZGVkKSB7XG4gICAgICBtZW51Q29tcC5hY3RpdmF0ZUl0ZW0oMCk7XG4gICAgfVxuICB9KTtcblxuICBtZW51Q29tcC5vbmtleWRvd24oZXYgPT4ge1xuICAgIGlmIChpc0VzY2FwZShldikpIHtcbiAgICAgIGV4cGFuZGFibGVDb21wLmNvbGxhcHNlKCk7XG4gICAgICBleHBhbmRhYmxlQ29tcC5leHBhbmRlcigpLmVsZW1lbnQoKS5mb2N1cygpO1xuICAgIH1cbiAgfSk7XG5cbiAgZXhwYW5kYWJsZUNvbXAucmVmcmVzaCgpO1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBleHBhbmRhYmxlQ29tcCwge1xuICAgIG1lbnUoKXtcbiAgICAgIHJldHVybiBtZW51Q29tcDtcbiAgICB9LFxuICAgIGNsZWFuKCl7XG4gICAgICBleHBhbmRhYmxlQ29tcC5jbGVhbigpO1xuICAgICAgbWVudUNvbXAuY2xlYW4oKTtcbiAgICB9XG4gIH0pO1xufTsiLCJpbXBvcnQgbWVudUZhY3RvcnkgZnJvbSAnLi9tZW51JztcbmltcG9ydCBkcm9wZG93biBmcm9tICcuLi9kcm9wZG93bi9kcm9wZG93bic7XG5pbXBvcnQge2hvcml6b250YWxNZW51SXRlbX0gZnJvbSAnLi9tZW51SXRlbSc7XG5cbmNvbnN0IGhvcml6b250YWxNZW51ID0gbWVudUZhY3RvcnkoaG9yaXpvbnRhbE1lbnVJdGVtKTtcblxuXG5jb25zdCByZWd1bGFyU3ViTWVudSA9ICh7aW5kZXgsIG1lbnV9KSA9PiBtZW51Lml0ZW0oaW5kZXgpO1xuXG5jb25zdCBkcm9wRG93blN1Yk1lbnUgPSAoe2luZGV4LCBlbGVtZW50LCBtZW51fSkgPT4ge1xuICBjb25zdCBzdWJNZW51Q29tcCA9IGRyb3Bkb3duKHtlbGVtZW50fSk7XG4gIG1lbnUub25BY3RpdmVJdGVtQ2hhbmdlKCh7YWN0aXZlSXRlbX0pID0+IHtcbiAgICBpZiAoYWN0aXZlSXRlbSAhPT0gaW5kZXgpIHtcbiAgICAgIHN1Yk1lbnVDb21wLmV4cGFuZGVyKCkuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcbiAgICAgIHN1Yk1lbnVDb21wLmNvbGxhcHNlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1Yk1lbnVDb21wLmF0dHIoJ3RhYmluZGV4JywgJy0xJyk7XG4gICAgICBzdWJNZW51Q29tcC5leHBhbmRlcigpLmF0dHIoJ3RhYmluZGV4JywgJzAnKTtcbiAgICAgIHN1Yk1lbnVDb21wLmV4cGFuZGVyKCkuZWxlbWVudCgpLmZvY3VzKCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHN1Yk1lbnVDb21wO1xufTtcblxuY29uc3QgY3JlYXRlU3ViTWVudUNvbXBvbmVudCA9IChhcmcpID0+IHtcbiAgY29uc3Qge2VsZW1lbnR9ID1hcmc7XG4gIHJldHVybiBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPW1lbnVdJykgIT09IG51bGwgP1xuICAgIGRyb3BEb3duU3ViTWVudShhcmcpIDpcbiAgICByZWd1bGFyU3ViTWVudShhcmcpO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgICh7ZWxlbWVudH0pID0+IHtcbiAgY29uc3QgbWVudWJhckNvbXAgPSBob3Jpem9udGFsTWVudSh7ZWxlbWVudH0pO1xuICBtZW51YmFyQ29tcC5hdHRyKCdyb2xlJywgJ21lbnViYXInKTtcbiAgY29uc3Qgc3ViTWVudXMgPSBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGRyZW4pLm1hcCgoZWxlbWVudCwgaW5kZXgpID0+IGNyZWF0ZVN1Yk1lbnVDb21wb25lbnQoe1xuICAgIGluZGV4LFxuICAgIGVsZW1lbnQsXG4gICAgbWVudTogbWVudWJhckNvbXBcbiAgfSkpO1xuXG4gIG1lbnViYXJDb21wLnJlZnJlc2goKTtcblxuICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgbWVudWJhckNvbXAsIHtcbiAgICBpdGVtKGluZGV4KXtcbiAgICAgIHJldHVybiBzdWJNZW51c1tpbmRleF07XG4gICAgfSxcbiAgICBjbGVhbigpe1xuICAgICAgbWVudWJhckNvbXAuY2xlYW4oKTtcbiAgICAgIHN1Yk1lbnVzLmZvckVhY2goc20gPT4gc20uY2xlYW4oKSk7XG4gICAgfVxuICB9KTtcbn07IiwiaW1wb3J0IGVsZW1lbnRGYWN0b3J5IGZyb20gJy4uL2NvbW1vbi9lbGVtZW50JztcbmltcG9ydCBpdGVtTGlzdCBmcm9tICcuLi9jb21tb24vc2luZ2xlQWN0aXZlSXRlbUxpc3QnO1xuaW1wb3J0IHtlbWl0dGVyIGFzIGNyZWF0ZUVtaXR0ZXJ9IGZyb20gJ3NtYXJ0LXRhYmxlLWV2ZW50cyc7XG5pbXBvcnQgZXhwYW5kYWJsZUZhY3RvcnkgZnJvbSAnLi4vZXhwYW5kYWJsZS9leHBhbmRhYmxlJztcbmltcG9ydCB7aXNBcnJvd0Rvd24sIGlzQXJyb3dVcH0gZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCBleHBhbmRhYmxlID0gZXhwYW5kYWJsZUZhY3Rvcnkoe2V4cGFuZEtleTogJycsIGNvbGxhcHNlS2V5OiAnJ30pO1xuXG5leHBvcnQgZGVmYXVsdCAoe2VsZW1lbnR9KSA9PiB7XG4gIGNvbnN0IGVtaXR0ZXIgPSBjcmVhdGVFbWl0dGVyKCk7XG4gIGNvbnN0IGFjY29yZGlvbkhlYWRlcnMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWxydGlzdGUtYWNjb3JkaW9uLWhlYWRlcl0nKTtcbiAgY29uc3QgaXRlbUxpc3RDb21wID0gaXRlbUxpc3Qoe2l0ZW1Db3VudDogYWNjb3JkaW9uSGVhZGVycy5sZW5ndGh9KTtcbiAgY29uc3QgY29udGFpbmVyQ29tcCA9IGVsZW1lbnRGYWN0b3J5KHtlbGVtZW50LCBlbWl0dGVyfSk7XG5cbiAgY29uc3QgZXhwYW5kYWJsZXMgPSBbLi4uYWNjb3JkaW9uSGVhZGVyc10ubWFwKGVsZW1lbnQgPT4gZXhwYW5kYWJsZSh7ZWxlbWVudH0pKTtcblxuICBleHBhbmRhYmxlcy5mb3JFYWNoKChleHAsIGluZGV4KSA9PiB7XG4gICAgLy8gbGV0IGV4cGFuZGVkXG4gICAgY29uc3QgZXhwYW5kZXIgPSBleHAuZXhwYW5kZXIoKTtcbiAgICBleHBhbmRlci5vbmtleWRvd24oZXYgPT4ge1xuICAgICAgaWYgKGlzQXJyb3dEb3duKGV2KSkge1xuICAgICAgICBpdGVtTGlzdENvbXAuYWN0aXZhdGVOZXh0SXRlbSgpO1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfSBlbHNlIGlmIChpc0Fycm93VXAoZXYpKSB7XG4gICAgICAgIGl0ZW1MaXN0Q29tcC5hY3RpdmF0ZVByZXZpb3VzSXRlbSgpO1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZXhwYW5kZXIub25mb2N1cyhfID0+IHtcbiAgICAgIGl0ZW1MaXN0Q29tcC5hY3RpdmF0ZUl0ZW0oaW5kZXgpO1xuICAgIH0pO1xuXG4gICAgaXRlbUxpc3RDb21wLm9uQWN0aXZlSXRlbUNoYW5nZSgoe2FjdGl2ZUl0ZW19KSA9PiB7XG4gICAgICBpZiAoYWN0aXZlSXRlbSA9PT0gaW5kZXgpIHtcbiAgICAgICAgZXhwLmV4cGFuZGVyKCkuZWxlbWVudCgpLmZvY3VzKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBpdGVtTGlzdENvbXAsIGNvbnRhaW5lckNvbXAsIHtcbiAgICBzZWN0aW9uKGluZGV4KXtcbiAgICAgIHJldHVybiBleHBhbmRhYmxlc1tpbmRleF1cbiAgICB9LFxuICAgIGNsZWFuKCl7XG4gICAgICBpdGVtTGlzdENvbXAub2ZmKCk7XG4gICAgICBjb250YWluZXJDb21wLmNsZWFuKCk7XG4gICAgICBleHBhbmRhYmxlcy5mb3JFYWNoKGl0ZW0gPT4gaXRlbS5jbGVhbigpKTtcbiAgICB9XG4gIH0pO1xufTsiLCJpbXBvcnQgZXhwYW5kYWJsZUZhY3RvcnkgZnJvbSAnLi9leHBhbmRhYmxlL2V4cGFuZGFibGUnO1xuaW1wb3J0IHRhYmxpc3RGYWN0b3J5IGZyb20gJy4vdGFibGlzdC90YWJsaXN0JztcbmltcG9ydCBkcm9wZG93bkZhY3RvcnkgZnJvbSAnLi9kcm9wZG93bi9kcm9wZG93bic7XG5pbXBvcnQgbWVudWJhckZhY3RvcnkgZnJvbSAnLi9tZW51L21lbnViYXInO1xuaW1wb3J0IGFjY29yZGlvbkZhY3RvcnkgZnJvbSAnLi9hY2NvcmRpb24vYWNjb3JkaW9uJztcbmltcG9ydCBlbGVtZW50RmFjdG9yeSBmcm9tICcuL2NvbW1vbi9lbGVtZW50JztcblxuZXhwb3J0IGNvbnN0IGV4cGFuZGFibGUgPSBleHBhbmRhYmxlRmFjdG9yeSgpO1xuZXhwb3J0IGNvbnN0IGRyb3Bkb3duID0gZHJvcGRvd25GYWN0b3J5O1xuZXhwb3J0IGNvbnN0IHRhYmxpc3QgPSB0YWJsaXN0RmFjdG9yeTtcbmV4cG9ydCBjb25zdCBtZW51YmFyID0gbWVudWJhckZhY3Rvcnk7XG5leHBvcnQgY29uc3QgYWNjb3JkaW9uID0gYWNjb3JkaW9uRmFjdG9yeTtcbmV4cG9ydCBjb25zdCBlbGVtZW50ID0gZWxlbWVudEZhY3Rvcnk7IiwiaW1wb3J0IHtoLCBvbk1vdW50LCBvblVwZGF0ZSwgb25Vbk1vdW50fSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge2Ryb3Bkb3dufSBmcm9tICdscnRpc3RlJztcblxuY29uc3QgZHJvcGRvd25pZnkgPSBDb21wID0+IHtcbiAgbGV0IGRkO1xuXG4gIGNvbnN0IG1vdW50ID0gb25Nb3VudCh2bm9kZSA9PiB7XG4gICAgZGQgPSBkcm9wZG93bih7ZWxlbWVudDogdm5vZGUuZG9tfSk7XG4gIH0pO1xuXG4gIGNvbnN0IG9udXBkYXRlID0gb25VcGRhdGUobiA9PiB7XG4gICAgaWYgKGRkKSB7XG4gICAgICBkZC5jbGVhbigpXG4gICAgfVxuICAgIGRkID0gZHJvcGRvd24oe2VsZW1lbnQ6IG4uZG9tfSk7XG4gICAgZGQuY29sbGFwc2UoKTtcbiAgfSk7XG5cbiAgY29uc3QgdW5tb3VudCA9IG9uVW5Nb3VudChfID0+IGRkLmNsZWFuKCkpO1xuXG4gIHJldHVybiB1bm1vdW50KG1vdW50KG9udXBkYXRlKENvbXApKSk7XG59O1xuXG5leHBvcnQgY29uc3QgRHJvcGRvd24gPSBkcm9wZG93bmlmeShwcm9wcyA9PiB7XG4gIGNvbnN0IHtjaGlsZHJlbn0gPXByb3BzO1xuICBkZWxldGUgcHJvcHMuY2hpbGRyZW47XG4gIHJldHVybiA8ZGl2IGNsYXNzPVwiZHJvcGRvd25cIiB7Li4ucHJvcHN9PlxuICAgIHtjaGlsZHJlbn1cbiAgPC9kaXY+XG59KTtcblxuZXhwb3J0IGNvbnN0IE1lbnVCdXR0b24gPSBwcm9wcyA9PiB7XG4gIGNvbnN0IHtjaGlsZHJlbn0gPXByb3BzO1xuICBkZWxldGUgcHJvcHMuY2hpbGRyZW47XG4gIHJldHVybiA8YnV0dG9uIGFyaWEtaGFzcG9wdXA9XCJ0cnVlXCIgYXJpYS1leHBhbmRlZD1cImZhbHNlXCIgdHlwZT1cImJ1dHRvblwiIHsuLi5wcm9wc30+XG4gICAge2NoaWxkcmVufVxuICA8L2J1dHRvbj5cbn07XG5cbmV4cG9ydCBjb25zdCBNZW51ID0gcHJvcHMgPT4ge1xuICBjb25zdCB7Y2hpbGRyZW59ID1wcm9wcztcbiAgZGVsZXRlIHByb3BzLmNoaWxkcmVuO1xuICByZXR1cm4gPHVsIHJvbGU9XCJtZW51XCIgey4uLnByb3BzfT5cbiAgICB7Y2hpbGRyZW59XG4gIDwvdWw+XG59O1xuXG5leHBvcnQgY29uc3QgTWVudUl0ZW0gPSBwcm9wcyA9PiB7XG4gIGNvbnN0IHtjaGlsZHJlbiwgYWN0aXZhdGVJdGVtfSA9IHByb3BzO1xuICBjb25zdCBvbktleURvd24gPSBldiA9PiB7XG4gICAgY29uc3Qge2NvZGV9ID0gZXY7XG4gICAgaWYgKGNvZGUgPT09ICdFbnRlcicgfHwgY29kZSA9PT0gJ1NwYWNlJykge1xuICAgICAgYWN0aXZhdGVJdGVtKCk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IG9uQ2xpY2sgPSBfID0+IHtcbiAgICBhY3RpdmF0ZUl0ZW0oKTtcbiAgfTtcblxuICBkZWxldGUgcHJvcHMuY2hpbGRyZW47XG4gIHJldHVybiA8bGkgb25LZXlEb3duPXtvbktleURvd259IG9uQ2xpY2s9e29uQ2xpY2t9IHJvbGU9XCJtZW51aXRlbVwiPlxuICAgIHtjaGlsZHJlbn1cbiAgPC9saT5cbn07IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge0Ryb3Bkb3duLCBNZW51QnV0dG9uLCBNZW51LCBNZW51SXRlbX0gZnJvbSAnLi4vdWkta2l0L2Ryb3Bkb3duJ1xuaW1wb3J0IHtCdWJibGVzLCBOb3RpZmljYXRpb24sIFNvcnRBbW91bnRBc2N9IGZyb20gJy4uL2NvbXBvbmVudHMvaWNvbnMnO1xuXG5leHBvcnQgY29uc3QgSXNzdWVDYXJkID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtpc3N1ZSA9IHt9fSA9IHByb3BzO1xuICBjb25zdCB7c3RhdGUsIGNyZWF0ZWRfYXQsIHVzZXIsIG51bWJlciwgaHRtbF91cmwsIHRpdGxlLCBjb21tZW50c30gPSBpc3N1ZTtcbiAgY29uc3QgY2xhc3NlcyA9IHN0YXRlID09PSAnb3BlbicgPyBbJ3ZhbGlkJ10gOiBbJ2ludmFsaWQnXTtcbiAgcmV0dXJuIDxhcnRpY2xlIGNsYXNzPVwiaXNzdWVcIj5cbiAgICA8aDM+e3RpdGxlfTwvaDM+XG4gICAgPGEgcmVsPVwic2VsZlwiIGhyZWY9e2h0bWxfdXJsfT4je251bWJlcn08L2E+XG4gICAgPGRpdiBjbGFzcz1cInN0YXR1c1wiPlxuICAgICAgPE5vdGlmaWNhdGlvbiBjbGFzc2VzPXtjbGFzc2VzfS8+XG4gICAgICA8c3BhbiBjbGFzcz17Y2xhc3Nlcy5qb2luKCcnKX0+e3N0YXRlfTwvc3Bhbj5cbiAgICA8L2Rpdj5cbiAgICA8cCBjbGFzcz1cIm1ldGFcIj5vcGVuZWQgb25cbiAgICAgIDx0aW1lPiB7KG5ldyBEYXRlKGNyZWF0ZWRfYXQpKS50b0RhdGVTdHJpbmcoKX0gPC90aW1lPlxuICAgICAgYnkgPGEgcmVsPVwiYXV0aG9yXCIgaHJlZj17dXNlci5odG1sX3VybH0+e3VzZXIubG9naW59PC9hPlxuICAgIDwvcD5cbiAgICA8cCBjbGFzcz1cImNvbW1lbnRzXCI+XG4gICAgICA8QnViYmxlcy8+XG4gICAgICA8c3Bhbj57Y29tbWVudHN9PC9zcGFuPlxuICAgIDwvcD5cbiAgPC9hcnRpY2xlPlxufTtcblxuLy90b2RvIGdlbmVyYXRlIGlkIGZvciBkcm9wZG93bnNcbmV4cG9ydCBjb25zdCBJc3N1ZXNMaXN0ID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtpc3N1ZXMgPSBbXSwgc21hcnRMaXN0LCBzaG93VG9vbEJhcn0gPSBwcm9wcztcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzPVwiaXNzdWVzLWxpc3QtY29udGFpbmVyXCI+XG4gICAgICA8ZGl2IGFyaWEtaGlkZGVuPXtTdHJpbmcoc2hvd1Rvb2xCYXIgIT09IHRydWUpfSByb2xlPVwidG9vbGJhclwiPlxuICAgICAgICA8RHJvcGRvd24gaWQ9XCJkcm9wZG93bi1zYW1wbGVcIj5cbiAgICAgICAgICA8TWVudUJ1dHRvbiBhcmlhLWNvbnRyb2xzPVwibWVudVwiPjxTb3J0QW1vdW50QXNjLz48L01lbnVCdXR0b24+XG4gICAgICAgICAgPE1lbnUgaWQ9XCJtZW51XCI+XG4gICAgICAgICAgICA8TWVudUl0ZW0gYWN0aXZhdGVJdGVtPXtfID0+IHNtYXJ0TGlzdC5zb3J0KHtwb2ludGVyOiAnY3JlYXRlZF9hdCcsIGRpcmVjdGlvbjogJ2Rlc2MnfSkgfT4gTmV3ZXN0PC9NZW51SXRlbT5cbiAgICAgICAgICAgIDxNZW51SXRlbSBhY3RpdmF0ZUl0ZW09e18gPT4gc21hcnRMaXN0LnNvcnQoe3BvaW50ZXI6ICdjcmVhdGVkX2F0JywgZGlyZWN0aW9uOiAnYXNjJ30pIH0+T2xkZXN0PC9NZW51SXRlbT5cbiAgICAgICAgICAgIDxNZW51SXRlbSBhY3RpdmF0ZUl0ZW09e18gPT4gc21hcnRMaXN0LnNvcnQoe3BvaW50ZXI6ICdjb21tZW50cycsIGRpcmVjdGlvbjogJ2Rlc2MnfSkgfT5Nb3N0XG4gICAgICAgICAgICAgIGNvbW1lbnRlZDwvTWVudUl0ZW0+XG4gICAgICAgICAgICA8TWVudUl0ZW0gYWN0aXZhdGVJdGVtPXtfID0+IHNtYXJ0TGlzdC5zb3J0KHtwb2ludGVyOiAnY29tbWVudHMnLCBkaXJlY3Rpb246ICdhc2MnfSkgfT5MZWFzdFxuICAgICAgICAgICAgICBjb21tZW50ZWQ8L01lbnVJdGVtPlxuICAgICAgICAgICAgPE1lbnVJdGVtIGFjdGl2YXRlSXRlbT17XyA9PiBzbWFydExpc3Quc29ydCh7cG9pbnRlcjogJ3VwZGF0ZWRfYXQnLCBkaXJlY3Rpb246ICdkZXNjJ30pIH0+UmVjZW50bHlcbiAgICAgICAgICAgICAgdXBkYXRlZDwvTWVudUl0ZW0+XG4gICAgICAgICAgICA8TWVudUl0ZW0gYWN0aXZhdGVJdGVtPXtfID0+IHNtYXJ0TGlzdC5zb3J0KHtwb2ludGVyOiAndXBkYXRlZF9hdCcsIGRpcmVjdGlvbjogJ2FzYyd9KSB9PkxlYXN0IHJlY2VudGx5XG4gICAgICAgICAgICAgIHVwZGF0ZWQ8L01lbnVJdGVtPlxuICAgICAgICAgIDwvTWVudT5cbiAgICAgICAgPC9Ecm9wZG93bj5cbiAgICAgIDwvZGl2PlxuICAgICAgPHVsIGNsYXNzPVwiaXNzdWVzLWxpc3RcIj5cbiAgICAgICAge1xuICAgICAgICAgIGlzc3Vlcy5tYXAoaSA9PiA8bGk+PElzc3VlQ2FyZCBpc3N1ZT17aX0vPjwvbGk+KVxuICAgICAgICB9XG4gICAgICA8L3VsPlxuICAgICAgPGRpdiBjbGFzcz1cImZha2UtYm9yZGVyXCI+PC9kaXY+XG4gICAgPC9kaXY+KTtcbn07IiwiaW1wb3J0IHtJc3N1ZXNMaXN0fSBmcm9tICcuLi92aWV3cy9Jc3N1ZXMnXG5pbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcblxuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMpID0+IHtcbiAgY29uc3Qge3NtYXJ0TGlzdCwgaXRlbXMgPVtdLCBkYXRhPXt9fSA9IHByb3BzO1xuICBjb25zdCB7c2hvd1Rvb2xCYXJ9ID0gZGF0YTtcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzPVwiaXNzdWVzLWNvbnRhaW5lclwiPlxuICAgICAgPElzc3Vlc0xpc3Qgc2hvd1Rvb2xCYXI9e3Nob3dUb29sQmFyfSBzbWFydExpc3Q9e3NtYXJ0TGlzdH0gaXNzdWVzPXtpdGVtcy5tYXAoaSA9PiBpLnZhbHVlKX0vPlxuICAgIDwvZGl2Pik7XG5cbn0iLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcbmltcG9ydCBMaXN0RGF0YVBhbmVsIGZyb20gJy4uL3ZpZXdzL0xpc3REYXRhUGFuZWwnO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IFNtYXJ0SXNzdWVzTGlzdCBmcm9tICcuL1NtYXJ0SXNzdWVMaXN0JztcblxuLy90b2RvXG5jb25zdCBEdW1teUxpc3QgPSAoKSA9PiA8ZGl2PlxuICA8cD5FcnJvcjogbGlzdCB0eXBlIG5vdCBzdXBwb3J0ZWQ8L3A+XG48L2Rpdj47XG5cblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUoKChwcm9wcywgc2VydmljZXMpID0+IHtcbiAgY29uc3Qge2dyaWQsIHNtYXJ0TGlzdHMsIGNvbm5lY3QsIGFjdGlvbnN9ID0gc2VydmljZXM7XG4gIGNvbnN0IHt4LCB5LCBvblJlc2l6ZVN0YXJ0LCBvbk1vdmVTdGFydH0gPSBwcm9wcztcbiAgY29uc3QgcGFuZWxEYXRhID0gZ3JpZC5nZXREYXRhKHgsIHkpO1xuICBjb25zdCBzbWFydExpc3QgPSBzbWFydExpc3RzLmZpbmRPckNyZWF0ZSh4LCB5KTtcbiAgY29uc3QgY29ubmVjdEZ1bmMgPSBjb25uZWN0KHN0YXRlID0+IHN0YXRlLnNtYXJ0TGlzdC5maW5kKHNsID0+IHNsLnggPT09IHggJiYgc2wueSA9PT0geSkpO1xuXG4gIGNvbnN0IFNtYXJ0TGlzdENvbXBvbmVudCA9IGNvbm5lY3RGdW5jKChwcm9wcykgPT4gZ2V0TGlzdENvbXBvbmVudChwYW5lbERhdGEuZGF0YS5zb3VyY2UpKHByb3BzLCBzZXJ2aWNlcykpO1xuXG4gIGNvbnN0IGNsaWNrUmVzZXQgPSBfID0+IHtcbiAgICBhY3Rpb25zLm9wZW5Nb2RhbCh7XG4gICAgICBtb2RhbFR5cGU6ICdhc2tDb25maXJtYXRpb24nLFxuICAgICAgbWVzc2FnZTogYFlvdSBhcmUgYWJvdXQgdG8gbG9zZSB0aGUgZGF0YSByZWxhdGVkIHRvIHRoZSBwYW5lbCBcIiR7cGFuZWxEYXRhLmRhdGEudGl0bGV9XCIuIEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBwcm9jZWVkID9gLFxuICAgICAgZXhlY3V0ZUFjdGlvbjogKCkgPT4ge1xuICAgICAgICBhY3Rpb25zLnJlc2V0UGFuZWwoe3gsIHl9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcblxuICBjb25zdCBjbGlja0VkaXQgPSBfID0+IHtcbiAgICBhY3Rpb25zLmVkaXRQYW5lbCh7eCwgeX0pO1xuICAgIHNtYXJ0TGlzdC5yZW1vdmUoKTtcbiAgfTtcblxuICBjb25zdCBjbGlja1RvZ2dsZVRvb2xCYXIgPSBfID0+IHtcbiAgICBjb25zdCB7ZGF0YSA9IHt9fSA9IHBhbmVsRGF0YTtcbiAgICBhY3Rpb25zLnVwZGF0ZVBhbmVsRGF0YSh7XG4gICAgICB4LCB5LCBkYXRhOiBPYmplY3QuYXNzaWduKHt9LCBkYXRhLCB7XG4gICAgICAgIHNob3dUb29sQmFyOiAhZGF0YS5zaG93VG9vbEJhclxuICAgICAgfSlcbiAgICB9KTtcbiAgfTtcblxuICByZXR1cm4gKDxMaXN0RGF0YVBhbmVsIG9uVG9nZ2xlVG9vbEJhcj17Y2xpY2tUb2dnbGVUb29sQmFyfSBvbkVkaXQ9e2NsaWNrRWRpdH0gb25SZXNldD17Y2xpY2tSZXNldH1cbiAgICAgICAgICAgICAgICAgICAgICAgICBvbk1vdmVTdGFydD17b25Nb3ZlU3RhcnR9XG4gICAgICAgICAgICAgICAgICAgICAgICAgb25SZXNpemVTdGFydD17b25SZXNpemVTdGFydH0gey4uLnBhbmVsRGF0YX0gPlxuICAgIDxTbWFydExpc3RDb21wb25lbnQgey4uLnBhbmVsRGF0YX0gc21hcnRMaXN0PXtzbWFydExpc3R9IHg9e3h9IHk9e3l9Lz5cbiAgPC9MaXN0RGF0YVBhbmVsPik7XG59KSk7XG5cbmNvbnN0IGdldExpc3RDb21wb25lbnQgPSAoc291cmNlKSA9PiB7XG4gIHN3aXRjaCAoc291cmNlKSB7XG4gICAgY2FzZSAnaXNzdWVzJzpcbiAgICAgIHJldHVybiBTbWFydElzc3Vlc0xpc3Q7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBEdW1teUxpc3Q7XG4gIH1cbn07IiwiaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge0VxdWFsaXplciwgQmluMiwgV3JlbmNofSBmcm9tICcuLi9jb21wb25lbnRzL2ljb25zJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUocHJvcHMgPT4ge1xuICBjb25zdCB7ZGF0YSA9IHt9LCBvblJlc2V0LCBvbkVkaXQsIG9uVG9nZ2xlVG9vbEJhcn0gPSBwcm9wcztcbiAgY29uc3Qge3Byb2Nlc3NpbmcgPSBmYWxzZX0gPSBkYXRhO1xuICBjb25zdCBzaG93VG9vbGJhciA9IFN0cmluZyhkYXRhLnNob3dUb29sQmFyID09PSB0cnVlKTtcbiAgLy90b2RvIGFyaWEtY29udHJvbHNcbiAgcmV0dXJuICg8ZGl2IGNsYXNzPVwicGFuZWwtY29udGVudFwiPlxuICAgIDxoZWFkZXIgY2xhc3M9XCJwYW5lbC1oZWFkZXJcIj5cbiAgICAgIDxoMj57ZGF0YS50aXRsZX08L2gyPlxuICAgICAgPGJ1dHRvbiBhcmlhLWhhc3BvcHVwPVwidHJ1ZVwiIGFyaWEtcHJlc3NlZD17c2hvd1Rvb2xiYXJ9IGFyaWEtZXhwYW5kZWQ9e3Nob3dUb29sYmFyfSBvbkNsaWNrPXtvblRvZ2dsZVRvb2xCYXJ9PjxXcmVuY2gvPjwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtvbkVkaXR9PjxFcXVhbGl6ZXIvPjwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtvblJlc2V0fT48QmluMi8+XG4gICAgICA8L2J1dHRvbj5cbiAgICA8L2hlYWRlcj5cbiAgICA8ZGl2IGNsYXNzPVwicGFuZWwtYm9keVwiPlxuICAgICAgPGRpdiBhcmlhLWhpZGRlbj17U3RyaW5nKCFwcm9jZXNzaW5nKX0gY2xhc3M9XCJwcm9jZXNzaW5nLW92ZXJsYXlcIj5cbiAgICAgICAgUHJvY2Vzc2luZyAuLi5cbiAgICAgIDwvZGl2PlxuICAgICAge3Byb3BzLmNoaWxkcmVufVxuICAgIDwvZGl2PlxuICA8L2Rpdj4pO1xufSk7IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgQ2hhcnREYXRhUGFuZWwgZnJvbSAnLi4vdmlld3MvQ2hhcnREYXRhUGFuZWwnO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuXG5leHBvcnQgZGVmYXVsdCBmbGV4aWJsZSgocHJvcHMsIHtncmlkfSkgPT4ge1xuICBjb25zdCB7eCwgeSwgb25SZXNpemVTdGFydCwgb25Nb3ZlU3RhcnR9ID0gcHJvcHM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgcmV0dXJuIDxDaGFydERhdGFQYW5lbCBvbk1vdmVTdGFydD17b25Nb3ZlU3RhcnR9IG9uUmVzaXplU3RhcnQ9e29uUmVzaXplU3RhcnR9IHsuLi5wYW5lbERhdGF9Lz5cbn0pOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEVtcHR5RGF0YVBhbmVsIGZyb20gJy4vRW1wdHlEYXRhUGFuZWwnO1xuaW1wb3J0IExpc3REYXRhUGFuZWwgZnJvbSAnLi9MaXN0RGF0YVBhbmVsJztcbmltcG9ydCBDaGFydERhdGFQYW5lbCBmcm9tICcuL0NoYXJ0RGF0YVBhbmVsJztcblxuY29uc3QgZ2V0RGF0YVBhbmVsID0gKHR5cGUpID0+IHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnY2hhcnQnOlxuICAgICAgcmV0dXJuIENoYXJ0RGF0YVBhbmVsO1xuICAgIGNhc2UgJ2xpc3QnOlxuICAgICAgcmV0dXJuIExpc3REYXRhUGFuZWw7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBFbXB0eURhdGFQYW5lbDtcbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzLCBzZXJ2aWNlcykgPT4ge1xuICBjb25zdCB7eCwgeX0gPSBwcm9wcztcbiAgY29uc3Qge2dyaWR9ID0gc2VydmljZXM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgY29uc3Qge2RhdGEgPSB7fX09cGFuZWxEYXRhO1xuICBjb25zdCBQYW5lbCA9IGdldERhdGFQYW5lbChkYXRhLnR5cGUpO1xuICByZXR1cm4gUGFuZWwocHJvcHMsIHNlcnZpY2VzKTtcbn07IiwiaW1wb3J0IHtoLCBjb25uZWN0fSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgQWRvcm5lclBhbmVsIGZyb20gJy4vQWRvcm5lclBhbmVsJztcbmltcG9ydCBEYXRhUGFuZWwgZnJvbSAnLi9EYXRhUGFuZWwnO1xuaW1wb3J0IHtST1dTLCBDT0xVTU5TfSBmcm9tICcuLi9saWIvY29uc3RhbnRzJztcblxuY29uc3QgZmluZFBhbmVsRnJvbVN0YXRlID0gKHgsIHkpID0+IHN0YXRlID0+IHN0YXRlLmdyaWQucGFuZWxzLmZpbmQoKHt4OiBweCwgeTogcHl9KSA9PiB4ID09PSBweCAmJiB5ID09PSBweSk7XG5cbmV4cG9ydCBjb25zdCBBZG9ybmVyR3JpZCA9IChwcm9wcywgc2VydmljZXMpID0+IHtcbiAgY29uc3Qge3BhbmVscyA9IFtdfSA9IHByb3BzO1xuICBjb25zdCB7Y29ubmVjdH0gPSBzZXJ2aWNlcztcbiAgY29uc3Qgc3Vic2NyaWJlVG8gPSAoeCwgeSkgPT4gY29ubmVjdChmaW5kUGFuZWxGcm9tU3RhdGUoeCwgeSkpO1xuICBjb25zdCBQYW5lbENvbXBvbmVudHMgPSBwYW5lbHMubWFwKCh7eCwgeX0pID0+IHN1YnNjcmliZVRvKHgsIHkpKHByb3BzID0+IEFkb3JuZXJQYW5lbChwcm9wcywgc2VydmljZXMpKSk7XG5cbiAgcmV0dXJuIDxkaXYgY2xhc3M9XCJncmlkIGFkb3JuZXItbGF5ZXJcIj5cbiAgICB7XG4gICAgICBQYW5lbENvbXBvbmVudHMubWFwKFBhbmVsID0+IDxQYW5lbC8+KVxuICAgIH1cbiAgPC9kaXY+O1xufTtcblxuY29uc3QgZ2V0Q29vcmRzRnJvbU1vdXNlRXZlbnQgPSAoY29sdW1ucywgcm93cykgPT4gKGV2KSA9PiB7XG4gIGNvbnN0IHtjdXJyZW50VGFyZ2V0LCBvZmZzZXRYLCBvZmZzZXRZfSA9IGV2O1xuICBjb25zdCB7b2Zmc2V0V2lkdGgsIG9mZnNldEhlaWdodH0gPSBjdXJyZW50VGFyZ2V0O1xuICBsZXQgeHBpeCA9IG9mZnNldFg7XG4gIGxldCB5cGl4ID0gb2Zmc2V0WTtcbiAgbGV0IHt0YXJnZXR9ID0gZXY7XG4gIHdoaWxlICh0YXJnZXQgIT09IGN1cnJlbnRUYXJnZXQgJiYgdGFyZ2V0ICE9PSB2b2lkIDApIHtcbiAgICB4cGl4ICs9IHRhcmdldC5vZmZzZXRMZWZ0O1xuICAgIHlwaXggKz0gdGFyZ2V0Lm9mZnNldFRvcDtcbiAgICB0YXJnZXQgPSB0YXJnZXQub2Zmc2V0UGFyZW50O1xuICB9XG4gIGNvbnN0IHggPSBNYXRoLmZsb29yKCh4cGl4IC8gb2Zmc2V0V2lkdGgpICogQ09MVU1OUykgKyAxO1xuICBjb25zdCB5ID0gTWF0aC5mbG9vcigoeXBpeCAvIG9mZnNldEhlaWdodCkgKiBST1dTKSArIDE7XG4gIHJldHVybiB7eCwgeX07XG59O1xuXG5leHBvcnQgY29uc3QgRGF0YUdyaWQgPSAocHJvcHMsIHNlcnZpY2VzKSA9PiB7XG4gIGNvbnN0IHtwYW5lbHMgPSBbXX0gPSBwcm9wcztcbiAgY29uc3Qge2Nvbm5lY3QsIGFjdGlvbnN9ID0gc2VydmljZXM7XG4gIGNvbnN0IHN1YnNjcmliZVRvID0gKHgsIHkpID0+IGNvbm5lY3QoZmluZFBhbmVsRnJvbVN0YXRlKHgsIHkpKTtcbiAgY29uc3QgUGFuZWxDb21wb25lbnRzID0gcGFuZWxzLm1hcCgoe3gsIHl9KSA9PiBzdWJzY3JpYmVUbyh4LCB5KShwcm9wcyA9PiBEYXRhUGFuZWwocHJvcHMsIHNlcnZpY2VzKSkpO1xuXG4gIGNvbnN0IGNvb3JkcyA9IGdldENvb3Jkc0Zyb21Nb3VzZUV2ZW50KENPTFVNTlMsIFJPV1MpO1xuXG4gIGNvbnN0IG9uRHJhZ092ZXIgPSAoZXYpID0+IHtcbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHt4LCB5fSA9IGNvb3Jkcyhldik7XG4gICAgYWN0aW9ucy5kcmFnT3Zlcigoe3gsIHl9KSk7XG4gIH07XG5cbiAgY29uc3Qgb25Ecm9wID0gZXYgPT4ge1xuICAgIGNvbnN0IHtkYXRhVHJhbnNmZXJ9ID0gZXY7XG4gICAgY29uc3QgZGF0YSA9IGRhdGFUcmFuc2Zlci5nZXREYXRhKCd0ZXh0L3BsYWluJyk7XG4gICAgY29uc3QgSnNvbkRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgIGNvbnN0IHt4OiBzdGFydFgsIHk6IHN0YXJ0WSwgb3BlcmF0aW9ufSA9IEpzb25EYXRhO1xuICAgIGlmIChzdGFydFggJiYgc3RhcnRZICYmIFsnbW92ZScsICdyZXNpemUnXS5pbmNsdWRlcyhvcGVyYXRpb24pKSB7XG4gICAgICBjb25zdCB7eCwgeX0gPSBjb29yZHMoZXYpO1xuICAgICAgY29uc3QgYXJncyA9IHt4LCBzdGFydFgsIHksIHN0YXJ0WX07XG4gICAgICBpZiAob3BlcmF0aW9uID09PSAncmVzaXplJykge1xuICAgICAgICBhY3Rpb25zLmVuZFJlc2l6ZShhcmdzKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBhY3Rpb25zLmVuZE1vdmUoYXJncyk7XG4gICAgICB9XG4gICAgfVxuICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gIH07XG5cbiAgcmV0dXJuIDxkaXYgY2xhc3M9XCJncmlkIGRhdGEtbGF5ZXJcIiBvbkRyYWdvdmVyPXtvbkRyYWdPdmVyfSBvbkRyb3A9e29uRHJvcH0+XG4gICAge1xuICAgICAgUGFuZWxDb21wb25lbnRzLm1hcChQYW5lbCA9PiA8UGFuZWwvPilcbiAgICB9XG4gIDwvZGl2Pjtcbn07IiwiaW1wb3J0IHttb3VudCwgaH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IE1vZGFsIGZyb20gJy4vY29tcG9uZW50cy9Nb2RhbC5qcyc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycydcbmltcG9ydCBzZXJ2aWNlcyBmcm9tICcuL3NlcnZpY2VzL2luZGV4J1xuaW1wb3J0IGluamVjdCBmcm9tICcuL2xpYi9kaS5qcyc7XG5pbXBvcnQge0Fkb3JuZXJHcmlkLCBEYXRhR3JpZH0gZnJvbSAnLi9jb21wb25lbnRzL2dyaWQnO1xuXG5jb25zdCBjb25uZWN0VG9Nb2RhbCA9IHNlcnZpY2VzLmNvbm5lY3Qoc3RhdGUgPT4gc3RhdGUubW9kYWwpO1xuY29uc3QgU2lkZU1vZGFsID0gY29tcG9zZShpbmplY3QsIGNvbm5lY3RUb01vZGFsKShNb2RhbCk7XG5jb25zdCBDb250YWluZXIgPSBpbmplY3QoKHtwYW5lbHN9LCBzZXJ2aWNlcykgPT4ge1xuXG4gIGNvbnN0IEFkb3JuZXJzID0gcHJvcHMgPT4gQWRvcm5lckdyaWQocHJvcHMsIHNlcnZpY2VzKTtcblxuICBjb25zdCBEYXRhR3JpZFBhbmVscyA9IHByb3BzID0+IERhdGFHcmlkKHByb3BzLCBzZXJ2aWNlcyk7XG5cbiAgcmV0dXJuICg8ZGl2IGNsYXNzPVwiZ3JpZC1jb250YWluZXJcIj5cbiAgICA8QWRvcm5lcnMgcGFuZWxzPXtwYW5lbHN9Lz5cbiAgICA8RGF0YUdyaWRQYW5lbHMgcGFuZWxzPXtwYW5lbHN9Lz5cbiAgICA8U2lkZU1vZGFsIC8+XG4gIDwvZGl2Pik7XG59KTtcblxuY29uc3Qge2dyaWQ6IHtwYW5lbHN9fSA9IHNlcnZpY2VzLnN0b3JlLmdldFN0YXRlKCk7XG5cbm1vdW50KENvbnRhaW5lciwge1xuICBwYW5lbHM6IHBhbmVsc1xufSwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21haW4nKSk7XG4iXSwibmFtZXMiOlsibW91bnQiLCJtb2RhbCIsIm9uVXBkYXRlIiwidXBkYXRlIiwiTW9kYWxWaWV3IiwiU3ltYm9sIiwib2JqZWN0UHJvdG8iLCJoYXNPd25Qcm9wZXJ0eSIsInN5bVRvU3RyaW5nVGFnIiwibmF0aXZlT2JqZWN0VG9TdHJpbmciLCJyb290IiwicG9ueWZpbGwiLCIkJG9ic2VydmFibGUiLCJjb21wb3NlIiwicG9pbnRlciIsImZpbHRlciIsInNvcnRGYWN0b3J5Iiwic29ydCIsInNlYXJjaCIsInRhYmxlIiwic3QiLCJhY3Rpb25zIiwic21hcnRMaXN0UmVnaXN0cnkiLCJzbWFydExpc3RzIiwiQWRvcm5lclBhbmVsIiwiZmxleGlibGUiLCJFbXB0eURhdGFQYW5lbCIsInByb3h5TGlzdGVuZXIiLCJjcmVhdGVFbWl0dGVyIiwiZW1pdHRlciIsImVsZW1lbnRDb21wb25lbnQiLCJjaGVja0tleXMuaXNFbnRlciIsImNoZWNrS2V5cy5pc1NwYWNlIiwicHJveHkiLCJlbGVtZW50Q29tcCIsIm1lbnUiLCJleHBhbmRhYmxlIiwiZXhwYW5kYWJsZUZhY3RvcnkiLCJkcm9wZG93bkZhY3RvcnkiLCJjb25uZWN0IiwiTGlzdERhdGFQYW5lbCIsIkNoYXJ0RGF0YVBhbmVsIiwiTW9kYWwiLCJzZXJ2aWNlcyJdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUFLLE1BQU07RUFDbEMsUUFBUSxFQUFFLE1BQU07RUFDaEIsUUFBUSxFQUFFLEVBQUU7RUFDWixLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7RUFDZCxTQUFTLEVBQUUsQ0FBQztDQUNiLENBQUMsQ0FBQzs7Ozs7Ozs7O0FBU0gsQUFBZSxTQUFTLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsUUFBUSxFQUFFO0VBQ3ZELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLO0lBQ25ELE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0QsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0dBQ2xDLEVBQUUsRUFBRSxDQUFDO0tBQ0gsR0FBRyxDQUFDLEtBQUssSUFBSTs7TUFFWixNQUFN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
