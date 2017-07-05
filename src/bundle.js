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

var AdornerPanel = (props, {grid}) => {
  const {x, y} = props;
  const {adornerStatus = 0} = grid.getData(x, y);
  return h( AdornerPanel$1, { x: x, y: y, adornerStatus: adornerStatus })
};

const ROWS = 4;
const COLUMNS = 4;

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

const flexible = Comp => (props) => {
  const {x, y, dx, dy, adornerStatus, onResizeStart, onMoveStart} = props;
  const zIndex = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['data-panel'];

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return h( Panel, { x: x, y: y, dx: dx, dy: dy, style: `z-index:${zIndex};`, panelClasses: panelClasses },
    h( 'div', { class: "move-handle", draggable: "true", onDragStart: onMoveStart },
      h( Enlarge, null )
    ),
    h( Comp, props),
    h( 'div', { class: "resize-handle", draggable: "true", onDragStart: onResizeStart },
      h( Enlarge2, null )
    )
  )
};

var EmptyDataPanel$1 = flexible(props =>
  h( 'div', { class: "empty-panel-toolbar" },
    h( 'button', { onClick: props.createSmartList }, h( List, null )),
    h( 'button', { onClick: props.createSmartChart }, h( StatsBars, null )),
    h( 'button', { onClick: props.createSmartAggregation }, h( Sigma, null ))
  ));

var flexible$2 = (Comp) => (props, services) => {
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

  return Comp(Object.assign(props, {onResizeStart, onMoveStart}), services);
};

var EmptyDataPanel = flexible$2((props, {grid, actions}) => {
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

var elementFactory = ({element, emitter$$1 = createEmitter$1()}) => {

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

const expandableFactory = ({emitter$$1 = createEmitter(), expanded}) => {
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

var itemList = ({emitter$$1 = createEmitter$2(), activeItem = 0, itemCount}) => {
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

const DummyList = () => h( 'div', null,
  h( 'p', null, "Error: list type not supported" )
);


var ListDataPanel = flexible$2(((props, services) => {
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

var ChartDataPanel = flexible$2((props, {grid}) => {
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
const AutofocusInput = autofocus(props => h( 'input', props));
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
  return (h( 'div', { class: "modal-content" },
    h( 'form', { onSubmit: onSubmit },
      h( 'label', null,
        h( 'span', null, "Panel title:" ),
        h( AutofocusInput, { onChange: ev => onUpdate$$1({title: ev.target.value}), name: "title", required: "true" })
      ),
      h( 'button', null, "Create" )
    )
  ));
};

const CreateSmartListDataPanel = props => {
  const UpdatableFormSection = statefullModal((props, update$$1) => {
    const {data} = props;
    const onUpdate$$1 = (val) => {
      Object.assign(data, val);
      update$$1(Object.assign({}, {data}, props));
    };
    return CreateSmartListForm(Object.assign({}, {onUpdate: onUpdate$$1}, props));
  });
  return UpdatableFormSection(props);
};

const CreateSmartChartDataPanel = props => {
  const UpdatableFormSection = statefullModal((props, update$$1) => {
    const {data} = props;
    const onUpdate$$1 = val => {
      Object.assign(data, val);
      update$$1(Object.assign({}, {data}, props));
    };
    return CreateSmartChartForm(Object.assign({}, {onUpdate: onUpdate$$1}, props))
  });

  return UpdatableFormSection(props);
};

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
        h( 'button', { onClick: confirm }, " Confirm"),
        h( 'button', { onClick: closeModal }, " Cancel")
      )
    ));
  return h( Comp, Object.assign({}, { title: "Attention !" }, props))
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
  const {type, title, modalType, x, y} = action;
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

const Container = inject(({panels}, {actions, connect: connect$$1}) => {

  //create subscription to panel(x,y)
  const findPanelFromState = (x, y) => state => state.grid.panels.find(({x:px, y:py}) => x === px && y === py);
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
    const {x:startX, y:startY, operation} = JsonData;
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

const {grid:{panels}} = services.store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlcyI6WyIuLi9ub2RlX21vZHVsZXMvZmxhY28vbGliL2guanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtb3BlcmF0b3JzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi91dGlsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi9kb21VdGlsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi90cmF2ZXJzZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9mbGFjby9saWIvdHJlZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9mbGFjby9saWIvdXBkYXRlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi9saWZlQ3ljbGVzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2ZsYWNvL2xpYi93aXRoU3RhdGUuanMiLCIuLi9ub2RlX21vZHVsZXMvZmxhY28vbGliL2Nvbm5lY3QuanMiLCJ2aWV3cy9QYW5lbC5qcyIsInZpZXdzL0Fkb3JuZXJQYW5lbC5qcyIsImNvbXBvbmVudHMvQWRvcm5lclBhbmVsLmpzIiwibGliL2NvbnN0YW50cy5qcyIsImNvbXBvbmVudHMvaWNvbnMuanMiLCJ2aWV3cy9GbGV4aWJsZURhdGFQYW5lbC5qcyIsInZpZXdzL0VtcHR5RGF0YVBhbmVsLmpzIiwiY29tcG9uZW50cy9GbGV4aWJsZURhdGFQYW5lbC5qcyIsImNvbXBvbmVudHMvRW1wdHlEYXRhUGFuZWwuanMiLCJ2aWV3cy9MaXN0RGF0YVBhbmVsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWV2ZW50cy9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9scnRpc3RlL2NvbW1vbi9lbGVtZW50LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvY29tbW9uL3V0aWwuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9leHBhbmRhYmxlL2V4cGFuZGFibGUuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9jb21tb24vc2luZ2xlQWN0aXZlSXRlbUxpc3QuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9tZW51L21lbnVJdGVtLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvbWVudS9tZW51LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvZHJvcGRvd24vZHJvcGRvd24uanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9tZW51L21lbnViYXIuanMiLCIuLi9ub2RlX21vZHVsZXMvbHJ0aXN0ZS9hY2NvcmRpb24vYWNjb3JkaW9uLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xydGlzdGUvaW5kZXguanMiLCJ1aS1raXQvZHJvcGRvd24uanMiLCJ2aWV3cy9Jc3N1ZXMuanMiLCJjb21wb25lbnRzL1NtYXJ0SXNzdWVMaXN0LmpzIiwiY29tcG9uZW50cy9MaXN0RGF0YVBhbmVsLmpzIiwidmlld3MvQ2hhcnREYXRhUGFuZWwuanMiLCJjb21wb25lbnRzL0NoYXJ0RGF0YVBhbmVsLmpzIiwiY29tcG9uZW50cy9EYXRhUGFuZWwuanMiLCJ2aWV3cy9Nb2RhbC5qcyIsInZpZXdzL0VkaXREYXRhUGFuZWxGb3JtLmpzIiwiY29tcG9uZW50cy9FZGl0UGFuZWxEYXRhTW9kYWwuanMiLCJ2aWV3cy9Db25maXJtYXRpb25Nb2RhbC5qcyIsImNvbXBvbmVudHMvQ29uZmlybWF0aW9uTW9kYWwuanMiLCJjb21wb25lbnRzL01vZGFsLmpzIiwiYWN0aW9ucy9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX2ZyZWVHbG9iYWwuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19yb290LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fU3ltYm9sLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fZ2V0UmF3VGFnLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fb2JqZWN0VG9TdHJpbmcuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19iYXNlR2V0VGFnLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fb3ZlckFyZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX2dldFByb3RvdHlwZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvaXNPYmplY3RMaWtlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9pc1BsYWluT2JqZWN0LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3N5bWJvbC1vYnNlcnZhYmxlL2VzL3BvbnlmaWxsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3N5bWJvbC1vYnNlcnZhYmxlL2VzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlZHV4L2VzL2NyZWF0ZVN0b3JlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlZHV4L2VzL3V0aWxzL3dhcm5pbmcuanMiLCIuLi9ub2RlX21vZHVsZXMvcmVkdXgvZXMvY29tcG9zZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWR1eC9lcy9hcHBseU1pZGRsZXdhcmUuanMiLCIuLi9ub2RlX21vZHVsZXMvcmVkdXgvZXMvaW5kZXguanMiLCJsaWIvZ3JpZC5qcyIsInNlcnZpY2VzL2dyaWQuanMiLCJyZWR1Y2Vycy9ncmlkLmpzIiwicmVkdWNlcnMvbW9kYWwuanMiLCJyZWR1Y2Vycy9zbWFydExpc3QuanMiLCJyZWR1Y2Vycy9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1qc29uLXBvaW50ZXIvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtc29ydC9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1maWx0ZXIvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtc2VhcmNoL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL3NsaWNlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2V2ZW50cy5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1jb3JlL3NyYy9kaXJlY3RpdmVzL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvaW5kZXguanMiLCJtb2NrRGF0YS5qcyIsInNlcnZpY2VzL3NtYXJ0TGlzdFJlZ2lzdHJ5LmpzIiwic2VydmljZXMvc3RvcmUuanMiLCJzZXJ2aWNlcy9hY3Rpb25zLmpzIiwic2VydmljZXMvaW5kZXguanMiLCJsaWIvZGkuanMiLCJpbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBjcmVhdGVUZXh0Vk5vZGUgPSAodmFsdWUpID0+ICh7XG4gIG5vZGVUeXBlOiAnVGV4dCcsXG4gIGNoaWxkcmVuOiBbXSxcbiAgcHJvcHM6IHt2YWx1ZX0sXG4gIGxpZmVDeWNsZTogMFxufSk7XG5cbi8qKlxuICogVHJhbnNmb3JtIGh5cGVyc2NyaXB0IGludG8gdmlydHVhbCBkb20gbm9kZVxuICogQHBhcmFtIG5vZGVUeXBlIHtGdW5jdGlvbiwgU3RyaW5nfSAtIHRoZSBIVE1MIHRhZyBpZiBzdHJpbmcsIGEgY29tcG9uZW50IG9yIGNvbWJpbmF0b3Igb3RoZXJ3aXNlXG4gKiBAcGFyYW0gcHJvcHMge09iamVjdH0gLSB0aGUgbGlzdCBvZiBwcm9wZXJ0aWVzL2F0dHJpYnV0ZXMgYXNzb2NpYXRlZCB0byB0aGUgcmVsYXRlZCBub2RlXG4gKiBAcGFyYW0gY2hpbGRyZW4gLSB0aGUgdmlydHVhbCBkb20gbm9kZXMgcmVsYXRlZCB0byB0aGUgY3VycmVudCBub2RlIGNoaWxkcmVuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSAtIGEgdmlydHVhbCBkb20gbm9kZVxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBoIChub2RlVHlwZSwgcHJvcHMsIC4uLmNoaWxkcmVuKSB7XG4gIGNvbnN0IGZsYXRDaGlsZHJlbiA9IGNoaWxkcmVuLnJlZHVjZSgoYWNjLCBjaGlsZCkgPT4ge1xuICAgIGNvbnN0IGNoaWxkcmVuQXJyYXkgPSBBcnJheS5pc0FycmF5KGNoaWxkKSA/IGNoaWxkIDogW2NoaWxkXTtcbiAgICByZXR1cm4gYWNjLmNvbmNhdChjaGlsZHJlbkFycmF5KTtcbiAgfSwgW10pXG4gICAgLm1hcChjaGlsZCA9PiB7XG4gICAgICAvLyBub3JtYWxpemUgdGV4dCBub2RlIHRvIGhhdmUgc2FtZSBzdHJ1Y3R1cmUgdGhhbiByZWd1bGFyIGRvbSBub2Rlc1xuICAgICAgY29uc3QgdHlwZSA9IHR5cGVvZiBjaGlsZDtcbiAgICAgIHJldHVybiB0eXBlID09PSAnb2JqZWN0JyB8fCB0eXBlID09PSAnZnVuY3Rpb24nID8gY2hpbGQgOiBjcmVhdGVUZXh0Vk5vZGUoY2hpbGQpO1xuICAgIH0pO1xuXG4gIGlmICh0eXBlb2Ygbm9kZVR5cGUgIT09ICdmdW5jdGlvbicpIHsvL3JlZ3VsYXIgaHRtbC90ZXh0IG5vZGVcbiAgICByZXR1cm4ge1xuICAgICAgbm9kZVR5cGUsXG4gICAgICBwcm9wczogcHJvcHMsXG4gICAgICBjaGlsZHJlbjogZmxhdENoaWxkcmVuLFxuICAgICAgbGlmZUN5Y2xlOiAwXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBmdWxsUHJvcHMgPSBPYmplY3QuYXNzaWduKHtjaGlsZHJlbjogZmxhdENoaWxkcmVufSwgcHJvcHMpO1xuICAgIGNvbnN0IGNvbXAgPSBub2RlVHlwZShmdWxsUHJvcHMpO1xuICAgIHJldHVybiB0eXBlb2YgY29tcCAhPT0gJ2Z1bmN0aW9uJyA/IGNvbXAgOiBoKGNvbXAsIHByb3BzLCAuLi5mbGF0Q2hpbGRyZW4pOyAvL2Z1bmN0aW9uYWwgY29tcCB2cyBjb21iaW5hdG9yIChIT0MpXG4gIH1cbn07IiwiZXhwb3J0IGZ1bmN0aW9uIHN3YXAgKGYpIHtcbiAgcmV0dXJuIChhLCBiKSA9PiBmKGIsIGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZSAoZmlyc3QsIC4uLmZucykge1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IGZucy5yZWR1Y2UoKHByZXZpb3VzLCBjdXJyZW50KSA9PiBjdXJyZW50KHByZXZpb3VzKSwgZmlyc3QoLi4uYXJncykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3VycnkgKGZuLCBhcml0eUxlZnQpIHtcbiAgY29uc3QgYXJpdHkgPSBhcml0eUxlZnQgfHwgZm4ubGVuZ3RoO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjb25zdCBhcmdMZW5ndGggPSBhcmdzLmxlbmd0aCB8fCAxO1xuICAgIGlmIChhcml0eSA9PT0gYXJnTGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZm4oLi4uYXJncyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGZ1bmMgPSAoLi4ubW9yZUFyZ3MpID0+IGZuKC4uLmFyZ3MsIC4uLm1vcmVBcmdzKTtcbiAgICAgIHJldHVybiBjdXJyeShmdW5jLCBhcml0eSAtIGFyZ3MubGVuZ3RoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseSAoZm4pIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiBmbiguLi5hcmdzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhcCAoZm4pIHtcbiAgcmV0dXJuIGFyZyA9PiB7XG4gICAgZm4oYXJnKTtcbiAgICByZXR1cm4gYXJnO1xuICB9XG59IiwiZXhwb3J0IGNvbnN0IG5leHRUaWNrID0gZm4gPT4gc2V0VGltZW91dChmbiwgMCk7XG5cbmV4cG9ydCBjb25zdCBwYWlyaWZ5ID0gaG9sZGVyID0+IGtleSA9PiBba2V5LCBob2xkZXJba2V5XV07XG5cbmV4cG9ydCBjb25zdCBpc1NoYWxsb3dFcXVhbCA9IChhLCBiKSA9PiB7XG4gIGNvbnN0IGFLZXlzID0gT2JqZWN0LmtleXMoYSk7XG4gIGNvbnN0IGJLZXlzID0gT2JqZWN0LmtleXMoYik7XG4gIHJldHVybiBhS2V5cy5sZW5ndGggPT09IGJLZXlzLmxlbmd0aCAmJiBhS2V5cy5ldmVyeSgoaykgPT4gYVtrXSA9PT0gYltrXSk7XG59O1xuXG5jb25zdCBvd25LZXlzID0gb2JqID0+IE9iamVjdC5rZXlzKG9iaikuZmlsdGVyKGsgPT4gb2JqLmhhc093blByb3BlcnR5KGspKTtcblxuZXhwb3J0IGNvbnN0IGlzRGVlcEVxdWFsID0gKGEsIGIpID0+IHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBhO1xuXG4gIC8vc2hvcnQgcGF0aChzKVxuICBpZiAoYSA9PT0gYikge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHR5cGUgIT09IHR5cGVvZiBiKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGEgPT09IGI7XG4gIH1cblxuICAvLyBvYmplY3RzIC4uLlxuICBpZiAoYSA9PT0gbnVsbCB8fCBiID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkpIHtcbiAgICByZXR1cm4gYS5sZW5ndGggJiYgYi5sZW5ndGggJiYgYS5ldmVyeSgoaXRlbSwgaSkgPT4gaXNEZWVwRXF1YWwoYVtpXSwgYltpXSkpO1xuICB9XG5cbiAgY29uc3QgYUtleXMgPSBvd25LZXlzKGEpO1xuICBjb25zdCBiS2V5cyA9IG93bktleXMoYik7XG4gIHJldHVybiBhS2V5cy5sZW5ndGggPT09IGJLZXlzLmxlbmd0aCAmJiBhS2V5cy5ldmVyeShrID0+IGlzRGVlcEVxdWFsKGFba10sIGJba10pKTtcbn07XG5cbmV4cG9ydCBjb25zdCBpZGVudGl0eSA9IGEgPT4gYTtcblxuZXhwb3J0IGNvbnN0IG5vb3AgPSBfID0+IHtcbn07XG4iLCJpbXBvcnQge3RhcH0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcblxuY29uc3QgU1ZHX05QID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcblxuY29uc3QgdXBkYXRlRG9tTm9kZUZhY3RvcnkgPSAobWV0aG9kKSA9PiAoaXRlbXMpID0+IHRhcChkb21Ob2RlID0+IHtcbiAgZm9yIChsZXQgcGFpciBvZiBpdGVtcykge1xuICAgIGRvbU5vZGVbbWV0aG9kXSguLi5wYWlyKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCByZW1vdmVFdmVudExpc3RlbmVycyA9IHVwZGF0ZURvbU5vZGVGYWN0b3J5KCdyZW1vdmVFdmVudExpc3RlbmVyJyk7XG5cbmV4cG9ydCBjb25zdCBhZGRFdmVudExpc3RlbmVycyA9IHVwZGF0ZURvbU5vZGVGYWN0b3J5KCdhZGRFdmVudExpc3RlbmVyJyk7XG5cbmV4cG9ydCBjb25zdCBzZXRBdHRyaWJ1dGVzID0gKGl0ZW1zKSA9PiB0YXAoKGRvbU5vZGUpID0+IHtcbiAgY29uc3QgYXR0cmlidXRlcyA9IGl0ZW1zLmZpbHRlcigoW2tleSwgdmFsdWVdKSA9PiB0eXBlb2YgdmFsdWUgIT09ICdmdW5jdGlvbicpO1xuICBmb3IgKGxldCBba2V5LCB2YWx1ZV0gb2YgYXR0cmlidXRlcykge1xuICAgIHZhbHVlID09PSBmYWxzZSA/IGRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKGtleSkgOiBkb21Ob2RlLnNldEF0dHJpYnV0ZShrZXksIHZhbHVlKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCByZW1vdmVBdHRyaWJ1dGVzID0gKGl0ZW1zKSA9PiB0YXAoZG9tTm9kZSA9PiB7XG4gIGZvciAobGV0IGF0dHIgb2YgaXRlbXMpIHtcbiAgICBkb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCBzZXRUZXh0Tm9kZSA9IHZhbCA9PiBub2RlID0+IG5vZGUudGV4dENvbnRlbnQgPSB2YWw7XG5cbmV4cG9ydCBjb25zdCBjcmVhdGVEb21Ob2RlID0gKHZub2RlLCBwYXJlbnQpID0+IHtcbiAgaWYgKHZub2RlLm5vZGVUeXBlID09PSAnc3ZnJykge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHX05QLCB2bm9kZS5ub2RlVHlwZSk7XG4gIH0gZWxzZSBpZiAodm5vZGUubm9kZVR5cGUgPT09ICdUZXh0Jykge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2bm9kZS5ub2RlVHlwZSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHBhcmVudC5uYW1lc3BhY2VVUkkgPT09IFNWR19OUCA/IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTlAsIHZub2RlLm5vZGVUeXBlKSA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodm5vZGUubm9kZVR5cGUpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0RXZlbnRMaXN0ZW5lcnMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKHByb3BzKVxuICAgIC5maWx0ZXIoayA9PiBrLnN1YnN0cigwLCAyKSA9PT0gJ29uJylcbiAgICAubWFwKGsgPT4gW2suc3Vic3RyKDIpLnRvTG93ZXJDYXNlKCksIHByb3BzW2tdXSk7XG59O1xuIiwiZXhwb3J0IGNvbnN0IHRyYXZlcnNlID0gZnVuY3Rpb24gKiAodm5vZGUpIHtcbiAgeWllbGQgdm5vZGU7XG4gIGlmICh2bm9kZS5jaGlsZHJlbiAmJiB2bm9kZS5jaGlsZHJlbi5sZW5ndGgpIHtcbiAgICBmb3IgKGxldCBjaGlsZCBvZiB2bm9kZS5jaGlsZHJlbikge1xuICAgICAgeWllbGQgKiB0cmF2ZXJzZShjaGlsZCk7XG4gICAgfVxuICB9XG59OyIsImltcG9ydCB7Y29tcG9zZSwgY3Vycnl9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge1xuICBpc1NoYWxsb3dFcXVhbCxcbiAgcGFpcmlmeSxcbiAgbmV4dFRpY2ssXG4gIG5vb3Bcbn0gZnJvbSAnLi91dGlsJztcbmltcG9ydCB7XG4gIHJlbW92ZUF0dHJpYnV0ZXMsXG4gIHNldEF0dHJpYnV0ZXMsXG4gIHNldFRleHROb2RlLFxuICBjcmVhdGVEb21Ob2RlLFxuICByZW1vdmVFdmVudExpc3RlbmVycyxcbiAgYWRkRXZlbnRMaXN0ZW5lcnMsXG4gIGdldEV2ZW50TGlzdGVuZXJzLFxufSBmcm9tICcuL2RvbVV0aWwnO1xuaW1wb3J0IHt0cmF2ZXJzZX0gZnJvbSAnLi90cmF2ZXJzZSc7XG5cbmNvbnN0IHVwZGF0ZUV2ZW50TGlzdGVuZXJzID0gKHtwcm9wczpuZXdOb2RlUHJvcHN9PXt9LCB7cHJvcHM6b2xkTm9kZVByb3BzfT17fSkgPT4ge1xuICBjb25zdCBuZXdOb2RlRXZlbnRzID0gZ2V0RXZlbnRMaXN0ZW5lcnMobmV3Tm9kZVByb3BzIHx8IHt9KTtcbiAgY29uc3Qgb2xkTm9kZUV2ZW50cyA9IGdldEV2ZW50TGlzdGVuZXJzKG9sZE5vZGVQcm9wcyB8fCB7fSk7XG5cbiAgcmV0dXJuIG5ld05vZGVFdmVudHMubGVuZ3RoIHx8IG9sZE5vZGVFdmVudHMubGVuZ3RoID9cbiAgICBjb21wb3NlKFxuICAgICAgcmVtb3ZlRXZlbnRMaXN0ZW5lcnMob2xkTm9kZUV2ZW50cyksXG4gICAgICBhZGRFdmVudExpc3RlbmVycyhuZXdOb2RlRXZlbnRzKVxuICAgICkgOiBub29wO1xufTtcblxuY29uc3QgdXBkYXRlQXR0cmlidXRlcyA9IChuZXdWTm9kZSwgb2xkVk5vZGUpID0+IHtcbiAgY29uc3QgbmV3Vk5vZGVQcm9wcyA9IG5ld1ZOb2RlLnByb3BzIHx8IHt9O1xuICBjb25zdCBvbGRWTm9kZVByb3BzID0gb2xkVk5vZGUucHJvcHMgfHwge307XG5cbiAgaWYgKGlzU2hhbGxvd0VxdWFsKG5ld1ZOb2RlUHJvcHMsIG9sZFZOb2RlUHJvcHMpKSB7XG4gICAgcmV0dXJuIG5vb3A7XG4gIH1cblxuICBpZiAobmV3Vk5vZGUubm9kZVR5cGUgPT09ICdUZXh0Jykge1xuICAgIHJldHVybiBzZXRUZXh0Tm9kZShuZXdWTm9kZS5wcm9wcy52YWx1ZSk7XG4gIH1cblxuICBjb25zdCBuZXdOb2RlS2V5cyA9IE9iamVjdC5rZXlzKG5ld1ZOb2RlUHJvcHMpO1xuICBjb25zdCBvbGROb2RlS2V5cyA9IE9iamVjdC5rZXlzKG9sZFZOb2RlUHJvcHMpO1xuICBjb25zdCBhdHRyaWJ1dGVzVG9SZW1vdmUgPSBvbGROb2RlS2V5cy5maWx0ZXIoayA9PiAhbmV3Tm9kZUtleXMuaW5jbHVkZXMoaykpO1xuXG4gIHJldHVybiBjb21wb3NlKFxuICAgIHJlbW92ZUF0dHJpYnV0ZXMoYXR0cmlidXRlc1RvUmVtb3ZlKSxcbiAgICBzZXRBdHRyaWJ1dGVzKG5ld05vZGVLZXlzLm1hcChwYWlyaWZ5KG5ld1ZOb2RlUHJvcHMpKSlcbiAgKTtcbn07XG5cbmNvbnN0IGRvbUZhY3RvcnkgPSBjcmVhdGVEb21Ob2RlO1xuXG4vLyBhcHBseSB2bm9kZSBkaWZmaW5nIHRvIGFjdHVhbCBkb20gbm9kZSAoaWYgbmV3IG5vZGUgPT4gaXQgd2lsbCBiZSBtb3VudGVkIGludG8gdGhlIHBhcmVudClcbmNvbnN0IGRvbWlmeSA9IChvbGRWbm9kZSwgbmV3Vm5vZGUsIHBhcmVudERvbU5vZGUpID0+IHtcbiAgaWYgKCFvbGRWbm9kZSkgey8vdGhlcmUgaXMgbm8gcHJldmlvdXMgdm5vZGVcbiAgICBpZiAobmV3Vm5vZGUpIHsvL25ldyBub2RlID0+IHdlIGluc2VydFxuICAgICAgbmV3Vm5vZGUuZG9tID0gcGFyZW50RG9tTm9kZS5hcHBlbmRDaGlsZChkb21GYWN0b3J5KG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKSk7XG4gICAgICBuZXdWbm9kZS5saWZlQ3ljbGUgPSAxO1xuICAgICAgcmV0dXJuIHt2bm9kZTogbmV3Vm5vZGUsIGdhcmJhZ2U6IG51bGx9O1xuICAgIH0gZWxzZSB7Ly9lbHNlIChpcnJlbGV2YW50KVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvcGVyYXRpb24nKVxuICAgIH1cbiAgfSBlbHNlIHsvL3RoZXJlIGlzIGEgcHJldmlvdXMgdm5vZGVcbiAgICBpZiAoIW5ld1Zub2RlKSB7Ly93ZSBtdXN0IHJlbW92ZSB0aGUgcmVsYXRlZCBkb20gbm9kZVxuICAgICAgcGFyZW50RG9tTm9kZS5yZW1vdmVDaGlsZChvbGRWbm9kZS5kb20pO1xuICAgICAgcmV0dXJuICh7Z2FyYmFnZTogb2xkVm5vZGUsIGRvbTogbnVsbH0pO1xuICAgIH0gZWxzZSBpZiAobmV3Vm5vZGUubm9kZVR5cGUgIT09IG9sZFZub2RlLm5vZGVUeXBlKSB7Ly9pdCBtdXN0IGJlIHJlcGxhY2VkXG4gICAgICBuZXdWbm9kZS5kb20gPSBkb21GYWN0b3J5KG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKTtcbiAgICAgIG5ld1Zub2RlLmxpZmVDeWNsZSA9IDE7XG4gICAgICBwYXJlbnREb21Ob2RlLnJlcGxhY2VDaGlsZChuZXdWbm9kZS5kb20sIG9sZFZub2RlLmRvbSk7XG4gICAgICByZXR1cm4ge2dhcmJhZ2U6IG9sZFZub2RlLCB2bm9kZTogbmV3Vm5vZGV9O1xuICAgIH0gZWxzZSB7Ly8gb25seSB1cGRhdGUgYXR0cmlidXRlc1xuICAgICAgbmV3Vm5vZGUuZG9tID0gb2xkVm5vZGUuZG9tO1xuICAgICAgLy8gcGFzcyB0aGUgdW5Nb3VudEhvb2tcbiAgICAgIGlmKG9sZFZub2RlLm9uVW5Nb3VudCl7XG4gICAgICAgIG5ld1Zub2RlLm9uVW5Nb3VudCA9IG9sZFZub2RlLm9uVW5Nb3VudDtcbiAgICAgIH1cbiAgICAgIG5ld1Zub2RlLmxpZmVDeWNsZSA9IG9sZFZub2RlLmxpZmVDeWNsZSArIDE7XG4gICAgICByZXR1cm4ge2dhcmJhZ2U6IG51bGwsIHZub2RlOiBuZXdWbm9kZX07XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIHJlbmRlciBhIHZpcnR1YWwgZG9tIG5vZGUsIGRpZmZpbmcgaXQgd2l0aCBpdHMgcHJldmlvdXMgdmVyc2lvbiwgbW91bnRpbmcgaXQgaW4gYSBwYXJlbnQgZG9tIG5vZGVcbiAqIEBwYXJhbSBvbGRWbm9kZVxuICogQHBhcmFtIG5ld1Zub2RlXG4gKiBAcGFyYW0gcGFyZW50RG9tTm9kZVxuICogQHBhcmFtIG9uTmV4dFRpY2sgY29sbGVjdCBvcGVyYXRpb25zIHRvIGJlIHByb2Nlc3NlZCBvbiBuZXh0IHRpY2tcbiAqIEByZXR1cm5zIHtBcnJheX1cbiAqL1xuZXhwb3J0IGNvbnN0IHJlbmRlciA9IChvbGRWbm9kZSwgbmV3Vm5vZGUsIHBhcmVudERvbU5vZGUsIG9uTmV4dFRpY2sgPSBbXSkgPT4ge1xuXG4gIC8vMS4gdHJhbnNmb3JtIHRoZSBuZXcgdm5vZGUgdG8gYSB2bm9kZSBjb25uZWN0ZWQgdG8gYW4gYWN0dWFsIGRvbSBlbGVtZW50IGJhc2VkIG9uIHZub2RlIHZlcnNpb25zIGRpZmZpbmdcbiAgLy8gaS4gbm90ZSBhdCB0aGlzIHN0ZXAgb2NjdXIgZG9tIGluc2VydGlvbnMvcmVtb3ZhbHNcbiAgLy8gaWkuIGl0IG1heSBjb2xsZWN0IHN1YiB0cmVlIHRvIGJlIGRyb3BwZWQgKG9yIFwidW5tb3VudGVkXCIpXG4gIGNvbnN0IHt2bm9kZSwgZ2FyYmFnZX0gPSBkb21pZnkob2xkVm5vZGUsIG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKTtcblxuICBpZiAoZ2FyYmFnZSAhPT0gbnVsbCkge1xuICAgIC8vIGRlZmVyIHVubW91bnQgbGlmZWN5Y2xlIGFzIGl0IGlzIG5vdCBcInZpc3VhbFwiXG4gICAgZm9yIChsZXQgZyBvZiB0cmF2ZXJzZShnYXJiYWdlKSkge1xuICAgICAgaWYgKGcub25Vbk1vdW50KSB7XG4gICAgICAgIG9uTmV4dFRpY2sucHVzaChnLm9uVW5Nb3VudCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy9Ob3JtYWxpc2F0aW9uIG9mIG9sZCBub2RlIChpbiBjYXNlIG9mIGEgcmVwbGFjZSB3ZSB3aWxsIGNvbnNpZGVyIG9sZCBub2RlIGFzIGVtcHR5IG5vZGUgKG5vIGNoaWxkcmVuLCBubyBwcm9wcykpXG4gIGNvbnN0IHRlbXBPbGROb2RlID0gZ2FyYmFnZSAhPT0gbnVsbCB8fCAhb2xkVm5vZGUgPyB7bGVuZ3RoOiAwLCBjaGlsZHJlbjogW10sIHByb3BzOiB7fX0gOiBvbGRWbm9kZTtcblxuICBpZiAodm5vZGUpIHtcblxuICAgIC8vMi4gdXBkYXRlIGRvbSBhdHRyaWJ1dGVzIGJhc2VkIG9uIHZub2RlIHByb3AgZGlmZmluZy5cbiAgICAvL3N5bmNcbiAgICBpZiAodm5vZGUub25VcGRhdGUgJiYgdm5vZGUubGlmZUN5Y2xlID4gMSkge1xuICAgICAgdm5vZGUub25VcGRhdGUoKTtcbiAgICB9XG5cbiAgICB1cGRhdGVBdHRyaWJ1dGVzKHZub2RlLCB0ZW1wT2xkTm9kZSkodm5vZGUuZG9tKTtcblxuICAgIC8vZmFzdCBwYXRoXG4gICAgaWYgKHZub2RlLm5vZGVUeXBlID09PSAnVGV4dCcpIHtcbiAgICAgIHJldHVybiBvbk5leHRUaWNrO1xuICAgIH1cblxuICAgIGlmICh2bm9kZS5vbk1vdW50ICYmIHZub2RlLmxpZmVDeWNsZSA9PT0gMSkge1xuICAgICAgb25OZXh0VGljay5wdXNoKCgpID0+IHZub2RlLm9uTW91bnQoKSk7XG4gICAgfVxuXG4gICAgY29uc3QgY2hpbGRyZW5Db3VudCA9IE1hdGgubWF4KHRlbXBPbGROb2RlLmNoaWxkcmVuLmxlbmd0aCwgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoKTtcblxuICAgIC8vYXN5bmMgd2lsbCBiZSBkZWZlcnJlZCBhcyBpdCBpcyBub3QgXCJ2aXN1YWxcIlxuICAgIGNvbnN0IHNldExpc3RlbmVycyA9IHVwZGF0ZUV2ZW50TGlzdGVuZXJzKHZub2RlLCB0ZW1wT2xkTm9kZSk7XG4gICAgaWYgKHNldExpc3RlbmVycyAhPT0gbm9vcCkge1xuICAgICAgb25OZXh0VGljay5wdXNoKCgpID0+IHNldExpc3RlbmVycyh2bm9kZS5kb20pKTtcbiAgICB9XG5cbiAgICAvLzMgcmVjdXJzaXZlbHkgdHJhdmVyc2UgY2hpbGRyZW4gdG8gdXBkYXRlIGRvbSBhbmQgY29sbGVjdCBmdW5jdGlvbnMgdG8gcHJvY2VzcyBvbiBuZXh0IHRpY2tcbiAgICBpZiAoY2hpbGRyZW5Db3VudCA+IDApIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW5Db3VudDsgaSsrKSB7XG4gICAgICAgIC8vIHdlIHBhc3Mgb25OZXh0VGljayBhcyByZWZlcmVuY2UgKGltcHJvdmUgcGVyZjogbWVtb3J5ICsgc3BlZWQpXG4gICAgICAgIHJlbmRlcih0ZW1wT2xkTm9kZS5jaGlsZHJlbltpXSwgdm5vZGUuY2hpbGRyZW5baV0sIHZub2RlLmRvbSwgb25OZXh0VGljayk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9uTmV4dFRpY2s7XG59O1xuXG5leHBvcnQgY29uc3QgaHlkcmF0ZSA9ICh2bm9kZSwgZG9tKSA9PiB7XG4gICd1c2Ugc3RyaWN0JztcbiAgY29uc3QgaHlkcmF0ZWQgPSBPYmplY3QuYXNzaWduKHt9LCB2bm9kZSk7XG4gIGNvbnN0IGRvbUNoaWxkcmVuID0gQXJyYXkuZnJvbShkb20uY2hpbGROb2RlcykuZmlsdGVyKG4gPT4gbi5ub2RlVHlwZSAhPT0gMyB8fCBuLm5vZGVWYWx1ZS50cmltKCkgIT09ICcnKTtcbiAgaHlkcmF0ZWQuZG9tID0gZG9tO1xuICBoeWRyYXRlZC5jaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQsIGkpID0+IGh5ZHJhdGUoY2hpbGQsIGRvbUNoaWxkcmVuW2ldKSk7XG4gIHJldHVybiBoeWRyYXRlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBtb3VudCA9IGN1cnJ5KChjb21wLCBpbml0UHJvcCwgcm9vdCkgPT4ge1xuICBjb25zdCB2bm9kZSA9IGNvbXAubm9kZVR5cGUgIT09IHZvaWQgMCA/IGNvbXAgOiBjb21wKGluaXRQcm9wIHx8IHt9KTtcbiAgY29uc3Qgb2xkVk5vZGUgPSByb290LmNoaWxkcmVuLmxlbmd0aCA/IGh5ZHJhdGUodm5vZGUsIHJvb3QuY2hpbGRyZW5bMF0pIDogbnVsbDtcbiAgY29uc3QgYmF0Y2ggPSByZW5kZXIob2xkVk5vZGUsIHZub2RlLCByb290KTtcbiAgbmV4dFRpY2soKCkgPT4ge1xuICAgIGZvciAobGV0IG9wIG9mIGJhdGNoKSB7XG4gICAgICBvcCgpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiB2bm9kZTtcbn0pOyIsImltcG9ydCB7cmVuZGVyfSBmcm9tICcuL3RyZWUnO1xuaW1wb3J0IHtuZXh0VGlja30gZnJvbSAnLi91dGlsJztcblxuLyoqXG4gKiBDcmVhdGUgYSBmdW5jdGlvbiB3aGljaCB3aWxsIHRyaWdnZXIgYW4gdXBkYXRlIG9mIHRoZSBjb21wb25lbnQgd2l0aCB0aGUgcGFzc2VkIHN0YXRlXG4gKiBAcGFyYW0gY29tcCB7RnVuY3Rpb259IC0gdGhlIGNvbXBvbmVudCB0byB1cGRhdGVcbiAqIEBwYXJhbSBpbml0aWFsVk5vZGUgLSB0aGUgaW5pdGlhbCB2aXJ0dWFsIGRvbSBub2RlIHJlbGF0ZWQgdG8gdGhlIGNvbXBvbmVudCAoaWUgb25jZSBpdCBoYXMgYmVlbiBtb3VudGVkKVxuICogQHJldHVybnMge0Z1bmN0aW9ufSAtIHRoZSB1cGRhdGUgZnVuY3Rpb25cbiAqL1xuZXhwb3J0IGRlZmF1bHQgKGNvbXAsIGluaXRpYWxWTm9kZSkgPT4ge1xuICBsZXQgb2xkTm9kZSA9IGluaXRpYWxWTm9kZTtcbiAgcmV0dXJuIChwcm9wcywgLi4uYXJncykgPT4ge1xuICAgIGNvbnN0IG1vdW50ID0gb2xkTm9kZS5kb20ucGFyZW50Tm9kZTtcbiAgICBjb25zdCBuZXdOb2RlID0gY29tcChPYmplY3QuYXNzaWduKHtjaGlsZHJlbjogb2xkTm9kZS5jaGlsZHJlbiB8fCBbXX0sIG9sZE5vZGUucHJvcHMsIHByb3BzKSwgLi4uYXJncyk7XG4gICAgY29uc3QgbmV4dEJhdGNoID0gcmVuZGVyKG9sZE5vZGUsIG5ld05vZGUsIG1vdW50KTtcblxuICAgIC8vIGRhbmdlciB6b25lICEhISFcbiAgICAvLyBjaGFuZ2UgYnkga2VlcGluZyB0aGUgc2FtZSByZWZlcmVuY2Ugc28gdGhlIGV2ZW50dWFsIHBhcmVudCBub2RlIGRvZXMgbm90IG5lZWQgdG8gYmUgXCJhd2FyZVwiIHRyZWUgbWF5IGhhdmUgY2hhbmdlZCBkb3duc3RyZWFtOiBvbGROb2RlIG1heSBiZSB0aGUgY2hpbGQgb2Ygc29tZW9uZSAuLi4od2VsbCB0aGF0IGlzIGEgdHJlZSBkYXRhIHN0cnVjdHVyZSBhZnRlciBhbGwgOlAgKVxuICAgIG9sZE5vZGUgPSBPYmplY3QuYXNzaWduKG9sZE5vZGUgfHwge30sIG5ld05vZGUpO1xuICAgIC8vIGVuZCBkYW5nZXIgem9uZVxuXG4gICAgbmV4dFRpY2soXyA9PiB7XG4gICAgICBmb3IgKGxldCBvcCBvZiBuZXh0QmF0Y2gpIHtcbiAgICAgICAgb3AoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gbmV3Tm9kZTtcbiAgfTtcbn07IiwiaW1wb3J0IHtjdXJyeX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcblxuY29uc3QgbGlmZUN5Y2xlRmFjdG9yeSA9IG1ldGhvZCA9PiBjdXJyeSgoZm4sIGNvbXApID0+IChwcm9wcywgLi4uYXJncykgPT4ge1xuICBjb25zdCBuID0gY29tcChwcm9wcywgLi4uYXJncyk7XG4gIG5bbWV0aG9kXSA9ICgpID0+IGZuKG4sIC4uLmFyZ3MpO1xuICByZXR1cm4gbjtcbn0pO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IHdoZW4gdGhlIGNvbXBvbmVudCBpcyBtb3VudGVkXG4gKi9cbmV4cG9ydCBjb25zdCBvbk1vdW50ID0gbGlmZUN5Y2xlRmFjdG9yeSgnb25Nb3VudCcpO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IHdoZW4gdGhlIGNvbXBvbmVudCBpcyB1bm1vdW50ZWRcbiAqL1xuZXhwb3J0IGNvbnN0IG9uVW5Nb3VudCA9IGxpZmVDeWNsZUZhY3RvcnkoJ29uVW5Nb3VudCcpO1xuXG4vKipcbiAqIGxpZmUgY3ljbGU6IGJlZm9yZSB0aGUgY29tcG9uZW50IGlzIHVwZGF0ZWRcbiAqL1xuZXhwb3J0IGNvbnN0IG9uVXBkYXRlID0gbGlmZUN5Y2xlRmFjdG9yeSgnb25VcGRhdGUnKTsiLCJpbXBvcnQgdXBkYXRlIGZyb20gJy4vdXBkYXRlJztcbmltcG9ydCB7b25Nb3VudCwgb25VcGRhdGV9IGZyb20gJy4vbGlmZUN5Y2xlcyc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5cbi8qKlxuICogQ29tYmluYXRvciB0byBjcmVhdGUgYSBcInN0YXRlZnVsIGNvbXBvbmVudFwiOiBpZSBpdCB3aWxsIGhhdmUgaXRzIG93biBzdGF0ZSBhbmQgdGhlIGFiaWxpdHkgdG8gdXBkYXRlIGl0cyBvd24gdHJlZVxuICogQHBhcmFtIGNvbXAge0Z1bmN0aW9ufSAtIHRoZSBjb21wb25lbnRcbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gLSBhIG5ldyB3cmFwcGVkIGNvbXBvbmVudFxuICovXG5leHBvcnQgZGVmYXVsdCAgKGNvbXApID0+ICgpID0+IHtcbiAgbGV0IHVwZGF0ZUZ1bmM7XG4gIGNvbnN0IHdyYXBwZXJDb21wID0gKHByb3BzLCAuLi5hcmdzKSA9PiB7XG4gICAgLy9sYXp5IGV2YWx1YXRlIHVwZGF0ZUZ1bmMgKHRvIG1ha2Ugc3VyZSBpdCBpcyBkZWZpbmVkXG4gICAgY29uc3Qgc2V0U3RhdGUgPSAobmV3U3RhdGUpID0+IHVwZGF0ZUZ1bmMobmV3U3RhdGUpO1xuICAgIHJldHVybiBjb21wKHByb3BzLCBzZXRTdGF0ZSwgLi4uYXJncyk7XG4gIH07XG4gIGNvbnN0IHNldFVwZGF0ZUZ1bmN0aW9uID0gKHZub2RlKSA9PiB7XG4gICAgdXBkYXRlRnVuYyA9IHVwZGF0ZSh3cmFwcGVyQ29tcCwgdm5vZGUpO1xuICB9O1xuXG4gIHJldHVybiBjb21wb3NlKG9uTW91bnQoc2V0VXBkYXRlRnVuY3Rpb24pLCBvblVwZGF0ZShzZXRVcGRhdGVGdW5jdGlvbikpKHdyYXBwZXJDb21wKTtcbn07IiwiaW1wb3J0IHVwZGF0ZSBmcm9tICcuL3VwZGF0ZSc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge29uTW91bnQsIG9uVW5Nb3VudH0gZnJvbSAnLi9saWZlQ3ljbGVzJ1xuaW1wb3J0IHtpc0RlZXBFcXVhbCwgaWRlbnRpdHl9IGZyb20gJy4vdXRpbCc7XG5cbi8qKlxuICogQ29ubmVjdCBjb21iaW5hdG9yOiB3aWxsIGNyZWF0ZSBcImNvbnRhaW5lclwiIGNvbXBvbmVudCB3aGljaCB3aWxsIHN1YnNjcmliZSB0byBhIFJlZHV4IGxpa2Ugc3RvcmUuIGFuZCB1cGRhdGUgaXRzIGNoaWxkcmVuIHdoZW5ldmVyIGEgc3BlY2lmaWMgc2xpY2Ugb2Ygc3RhdGUgY2hhbmdlIHVuZGVyIHNwZWNpZmljIGNpcmN1bXN0YW5jZXNcbiAqIEBwYXJhbSBzdG9yZSB7T2JqZWN0fSAtIFRoZSBzdG9yZSAoaW1wbGVtZW50aW5nIHRoZSBzYW1lIGFwaSB0aGFuIFJlZHV4IHN0b3JlXG4gKiBAcGFyYW0gc2xpY2VTdGF0ZSB7RnVuY3Rpb259IFtzdGF0ZSA9PiBzdGF0ZV0gLSBBIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGFzIGFyZ3VtZW50IHRoZSBzdGF0ZSBhbmQgcmV0dXJuIGEgXCJ0cmFuc2Zvcm1lZFwiIHN0YXRlIChsaWtlIHBhcnRpYWwsIGV0YykgcmVsZXZhbnQgdG8gdGhlIGNvbnRhaW5lclxuICogQHJldHVybnMge0Z1bmN0aW9ufSAtIEEgY29udGFpbmVyIGZhY3Rvcnkgd2l0aCB0aGUgZm9sbG93aW5nIGFyZ3VtZW50czpcbiAqICAtIG1hcFN0YXRlVG9Qcm9wOiBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGFzIGFyZ3VtZW50IHdoYXQgdGhlIFwic2xpY2VTdGF0ZVwiIGZ1bmN0aW9uIHJldHVybnMgYW5kIHJldHVybnMgYW4gb2JqZWN0IHRvIGJlIGJsZW5kZWQgaW50byB0aGUgcHJvcGVydGllcyBvZiB0aGUgY29tcG9uZW50IChkZWZhdWx0IHRvIGlkZW50aXR5IGZ1bmN0aW9uKVxuICogIC0gc2hvdWxkVXBkYXRlOiBhIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGFzIGFyZ3VtZW50cyB0aGUgcHJldmlvdXMgYW5kIHRoZSBjdXJyZW50IHZlcnNpb25zIG9mIHdoYXQgXCJzbGljZVN0YXRlXCIgZnVuY3Rpb24gcmV0dXJucyB0byByZXR1cm5zIGEgYm9vbGVhbiBkZWZpbmluZyB3aGV0aGVyIHRoZSBjb21wb25lbnQgc2hvdWxkIGJlIHVwZGF0ZWQgKGRlZmF1bHQgdG8gYSBkZWVwRXF1YWwgY2hlY2spXG4gKi9cbmV4cG9ydCBkZWZhdWx0ICAoc3RvcmUsIHNsaWNlU3RhdGUgPSBpZGVudGl0eSkgPT5cbiAgKGNvbXAsIG1hcFN0YXRlVG9Qcm9wID0gaWRlbnRpdHksIHNob3VsZFVwYXRlID0gKGEsIGIpID0+IGlzRGVlcEVxdWFsKGEsIGIpID09PSBmYWxzZSkgPT5cbiAgICAoaW5pdFByb3ApID0+IHtcbiAgICAgIGxldCBjb21wb25lbnRQcm9wcyA9IGluaXRQcm9wO1xuICAgICAgbGV0IHVwZGF0ZUZ1bmMsIHByZXZpb3VzU3RhdGVTbGljZSwgdW5zdWJzY3JpYmVyO1xuXG4gICAgICBjb25zdCB3cmFwcGVyQ29tcCA9IChwcm9wcywgLi4uYXJncykgPT4ge1xuICAgICAgICByZXR1cm4gY29tcChPYmplY3QuYXNzaWduKHByb3BzLCBtYXBTdGF0ZVRvUHJvcChzbGljZVN0YXRlKHN0b3JlLmdldFN0YXRlKCkpKSksIC4uLmFyZ3MpO1xuICAgICAgfTtcblxuICAgICAgY29uc3Qgc3Vic2NyaWJlID0gb25Nb3VudCgodm5vZGUpID0+IHtcbiAgICAgICAgdXBkYXRlRnVuYyA9IHVwZGF0ZSh3cmFwcGVyQ29tcCwgdm5vZGUpO1xuICAgICAgICB1bnN1YnNjcmliZXIgPSBzdG9yZS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0YXRlU2xpY2UgPSBzbGljZVN0YXRlKHN0b3JlLmdldFN0YXRlKCkpO1xuICAgICAgICAgIGlmIChzaG91bGRVcGF0ZShwcmV2aW91c1N0YXRlU2xpY2UsIHN0YXRlU2xpY2UpID09PSB0cnVlKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbXBvbmVudFByb3BzLCBtYXBTdGF0ZVRvUHJvcChzdGF0ZVNsaWNlKSk7XG4gICAgICAgICAgICB1cGRhdGVGdW5jKGNvbXBvbmVudFByb3BzKTtcbiAgICAgICAgICAgIHByZXZpb3VzU3RhdGVTbGljZSA9IHN0YXRlU2xpY2U7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB1bnN1YnNjcmliZSA9IG9uVW5Nb3VudCgoKSA9PiB7XG4gICAgICAgIHVuc3Vic2NyaWJlcigpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBjb21wb3NlKHN1YnNjcmliZSwgdW5zdWJzY3JpYmUpKHdyYXBwZXJDb21wKTtcbiAgICB9IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5cbmV4cG9ydCBkZWZhdWx0IChwcm9wcykgPT4ge1xuICAvL3RvZG8gZGVzdHJ1Y3Qgd2l0aCByZXN0IHsuLi5vdGhlclByb3BzfSBpbnN0ZWFkIG9mIGRlbGV0aW5nIHN0dWZmc1xuICBjb25zdCB7ZHggPSAxLCBkeSA9IDEsIHgsIHksIHBhbmVsQ2xhc3NlcywgY2hpbGRyZW4sIHN0eWxlID0gJyd9ID0gcHJvcHM7XG4gIGRlbGV0ZSBwcm9wcy5jaGlsZHJlbjtcbiAgZGVsZXRlIHByb3BzLnBhbmVsQ2xhc3NlcztcbiAgZGVsZXRlIHByb3BzLmR4O1xuICBkZWxldGUgcHJvcHMuZHk7XG4gIGRlbGV0ZSBwcm9wcy54O1xuICBkZWxldGUgcHJvcHMueTtcbiAgZGVsZXRlIHByb3BzLnN0eWxlO1xuXG4gIGNvbnN0IHBvc2l0aW9uU3R5bGUgPSBgXG4gICAgLS1ncmlkLWNvbHVtbi1vZmZzZXQ6ICR7eH07XG4gICAgLS1ncmlkLXJvdy1vZmZzZXQ6ICR7eX07XG4gICAgLS1ncmlkLXJvdy1zcGFuOiAke2R5fTtcbiAgICAtLWdyaWQtY29sdW1uLXNwYW46ICR7ZHh9O1xuICAgICR7c3R5bGV9XG5gO1xuXG4gIGNvbnN0IGNsYXNzZXMgPSBbJ3BhbmVsJ10uY29uY2F0KHBhbmVsQ2xhc3Nlcykuam9pbignICcpO1xuXG4gIHJldHVybiAoPGRpdiB7Li4ucHJvcHN9IHN0eWxlPXtwb3NpdGlvblN0eWxlfSBjbGFzcz17Y2xhc3Nlc30+XG4gICAge2NoaWxkcmVufVxuICA8L2Rpdj4pO1xufSIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nXG5pbXBvcnQgUGFuZWwgZnJvbSAnLi4vdmlld3MvUGFuZWwnO1xuXG5leHBvcnQgZGVmYXVsdCAoe3gsIHksIGFkb3JuZXJTdGF0dXN9KSA9PiB7XG4gIGNvbnN0IGV4dHJhQ2xhc3NlcyA9IFtdO1xuICBpZiAoYWRvcm5lclN0YXR1cyA9PT0gMSkge1xuICAgIGV4dHJhQ2xhc3Nlcy5wdXNoKCd2YWxpZC1wYW5lbCcpO1xuICB9IGVsc2UgaWYgKGFkb3JuZXJTdGF0dXMgPT09IC0xKSB7XG4gICAgZXh0cmFDbGFzc2VzLnB1c2goJ2ludmFsaWQtcGFuZWwnKTtcbiAgfVxuXG4gIHJldHVybiA8UGFuZWwgcGFuZWxDbGFzc2VzPXtleHRyYUNsYXNzZXN9IHg9e3h9IHk9e3l9IGR4PXsxfSBkeT17MX0+PC9QYW5lbD47XG59OyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nXG5pbXBvcnQgQWRvcm5lclBhbmVsIGZyb20gJy4uL3ZpZXdzL0Fkb3JuZXJQYW5lbCc7XG5cbmV4cG9ydCBkZWZhdWx0IChwcm9wcywge2dyaWR9KSA9PiB7XG4gIGNvbnN0IHt4LCB5fSA9IHByb3BzO1xuICBjb25zdCB7YWRvcm5lclN0YXR1cyA9IDB9ID0gZ3JpZC5nZXREYXRhKHgsIHkpO1xuICByZXR1cm4gPEFkb3JuZXJQYW5lbCB4PXt4fSB5PXt5fSBhZG9ybmVyU3RhdHVzPXthZG9ybmVyU3RhdHVzfS8+XG59IiwiZXhwb3J0IGNvbnN0IFJPV1MgPSA0O1xuZXhwb3J0IGNvbnN0IENPTFVNTlMgPSA0OyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuZXhwb3J0IGNvbnN0IEFkZHJlc3NCb29rID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmFkZHJlc3MtYm9vazwvdGl0bGU+PHBhdGggZD1cIk02IDB2MzJoMjRWMEg2em0xMiA4LjAxYTMuOTkgMy45OSAwIDEgMSAwIDcuOTggMy45OSAzLjk5IDAgMCAxIDAtNy45OHpNMjQgMjRIMTJ2LTJhNCA0IDAgMCAxIDQtNGg0YTQgNCAwIDAgMSA0IDR2MnpNMiAyaDN2NkgyVjJ6TTIgMTBoM3Y2SDJ2LTZ6TTIgMThoM3Y2SDJ2LTZ6TTIgMjZoM3Y2SDJ2LTZ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgQmluMiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5iaW4yPC90aXRsZT48cGF0aCBkPVwiTTYgMzJoMjBsMi0yMkg0ek0yMCA0VjBoLTh2NEgydjZsMi0yaDI0bDIgMlY0SDIwem0tMiAwaC00VjJoNHYyelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEJvb2ttYXJrID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmJvb2ttYXJrPC90aXRsZT48cGF0aCBkPVwiTTYgMHYzMmwxMC0xMCAxMCAxMFYwelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEJvb2ttYXJrcyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5ib29rbWFya3M8L3RpdGxlPjxwYXRoIGQ9XCJNOCA0djI4bDEwLTEwIDEwIDEwVjR6bTE2LTRINHYyOGwyLTJWMmgxOHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBCdWJibGVzID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjM2XCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDM2IDMyXCI+PHRpdGxlPmJ1YmJsZXM8L3RpdGxlPjxwYXRoIGQ9XCJNMzQgMjguMTYxYTMuNjUgMy42NSAwIDAgMCAyIDMuMjU2di40OThhNy40MiA3LjQyIDAgMCAxLTYuNDE0LTIuMjUxYy0uODE5LjIxOC0xLjY4OC4zMzYtMi41ODcuMzM2LTQuOTcxIDAtOS0zLjU4Mi05LThzNC4wMjktOCA5LTggOSAzLjU4MiA5IDhjMCAxLjczLS42MTggMy4zMzEtMS42NjcgNC42NGEzLjYzNSAzLjYzNSAwIDAgMC0uMzMzIDEuNTIyek0xNiAwYzguNzAyIDAgMTUuNzgxIDUuNjQ0IDE1Ljk5NSAxMi42NzJBMTIuMjYyIDEyLjI2MiAwIDAgMCAyNyAxMS42MjVjLTIuOTg2IDAtNS44MDcgMS4wNDUtNy45NDIgMi45NDMtMi4yMTQgMS45NjgtMy40MzMgNC42MDctMy40MzMgNy40MzIgMCAxLjM5Ni4yOTggMi43NDcuODY3IDMuOTkzYTE5LjY2IDE5LjY2IDAgMCAxLTIuOTg3LS4xNTFDMTAuMDY4IDI5LjI3OSA1Ljk2NiAyOS44OTUgMiAyOS45ODZ2LS44NDFDNC4xNDIgMjguMDk2IDYgMjYuMTg0IDYgMjRjMC0uMzA1LS4wMjQtLjYwNC0uMDY4LS44OTdDMi4zMTMgMjAuNzIgMCAxNy4wNzkgMCAxMyAwIDUuODIgNy4xNjMgMCAxNiAwelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IENoZWNrYm94Q2hlY2tlZCA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5jaGVja2JveC1jaGVja2VkPC90aXRsZT48cGF0aCBkPVwiTTI4IDBINEMxLjggMCAwIDEuOCAwIDR2MjRjMCAyLjIgMS44IDQgNCA0aDI0YzIuMiAwIDQtMS44IDQtNFY0YzAtMi4yLTEuOC00LTQtNHpNMTQgMjQuODI4bC03LjQxNC03LjQxNCAyLjgyOC0yLjgyOEwxNCAxOS4xNzJsOS41ODYtOS41ODYgMi44MjggMi44MjhMMTQgMjQuODI4elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IENoZWNrYm94VW5jaGVja2VkID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmNoZWNrYm94LXVuY2hlY2tlZDwvdGl0bGU+PHBhdGggZD1cIk0yOCAwSDRDMS44IDAgMCAxLjggMCA0djI0YzAgMi4yIDEuOCA0IDQgNGgyNGMyLjIgMCA0LTEuOCA0LTRWNGMwLTIuMi0xLjgtNC00LTR6bTAgMjhINFY0aDI0djI0elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IENoZWNrbWFyayA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5jaGVja21hcms8L3RpdGxlPjxwYXRoIGQ9XCJNMjcgNEwxMiAxOWwtNy03LTUgNSAxMiAxMkwzMiA5elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IENoZWNrbWFyazIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+Y2hlY2ttYXJrMjwvdGl0bGU+PHBhdGggZD1cIk0xMi40MiAyOC42NzhMLS4wMTMgMTYuNDRsNi4xNjgtNi4wNzEgNi4yNjUgNi4xNjdMMjUuODQ2IDMuMzIybDYuMTY4IDYuMDcxTDEyLjQyIDI4LjY3OHpNMy4zNzIgMTYuNDQxbDkuMDQ4IDguOTA1TDI4LjYyOCA5LjM5M2wtMi43ODItMi43MzlMMTIuNDIgMTkuODY4bC02LjI2NS02LjE2Ny0yLjc4MiAyLjczOXpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBDb2cgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+Y29nPC90aXRsZT48cGF0aCBkPVwiTTI5LjE4MSAxOS4wN2MtMS42NzktMi45MDgtLjY2OS02LjYzNCAyLjI1NS04LjMyOGwtMy4xNDUtNS40NDdhNi4wMjIgNi4wMjIgMCAwIDEtMy4wNTguODI5Yy0zLjM2MSAwLTYuMDg1LTIuNzQyLTYuMDg1LTYuMTI1aC02LjI4OWE2LjAyMyA2LjAyMyAwIDAgMS0uODExIDMuMDdDMTAuMzY5IDUuOTc3IDYuNjM3IDYuOTY2IDMuNzA5IDUuMjhMLjU2NSAxMC43MjdhNi4wMjMgNi4wMjMgMCAwIDEgMi4yNDYgMi4yMzRjMS42NzYgMi45MDMuNjcyIDYuNjIzLTIuMjQxIDguMzE5bDMuMTQ1IDUuNDQ3YTYuMDIyIDYuMDIyIDAgMCAxIDMuMDQ0LS44MmMzLjM1IDAgNi4wNjcgMi43MjUgNi4wODQgNi4wOTJoNi4yODlhNi4wMzIgNi4wMzIgMCAwIDEgLjgxMS0zLjAzOGMxLjY3Ni0yLjkwMyA1LjM5OS0zLjg5NCA4LjMyNS0yLjIxOWwzLjE0NS01LjQ0N2E2LjAzMiA2LjAzMiAwIDAgMS0yLjIzMi0yLjIyNnpNMTYgMjIuNDc5QTYuNDggNi40OCAwIDEgMSAxNiA5LjUyYTYuNDggNi40OCAwIDAgMSAwIDEyLjk1OXpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBDb25uZWN0aW9uID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjQwXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDQwIDMyXCI+PHRpdGxlPmNvbm5lY3Rpb248L3RpdGxlPjxwYXRoIGQ9XCJNMjAgMThjMy4zMDggMCA2LjMwOCAxLjM0NiA4LjQ4MSAzLjUxOWwtMi44MjcgMi44MjdDMjQuMjA1IDIyLjg5NyAyMi4yMDUgMjIgMjAgMjJzLTQuMjA2Ljg5Ny01LjY1NCAyLjM0NmwtMi44MjctMi44MjdBMTEuOTYzIDExLjk2MyAwIDAgMSAyMCAxOHpNNS44NTggMTUuODU4QzkuNjM1IDEyLjA4MSAxNC42NTggMTAgMjAgMTBzMTAuMzY1IDIuMDggMTQuMTQyIDUuODU4bC0yLjgyOCAyLjgyOEMyOC4yOTIgMTUuNjY0IDI0LjI3NCAxNCAyMCAxNHMtOC4yOTIgMS42NjQtMTEuMzE0IDQuNjg2bC0yLjgyOC0yLjgyOHpNMzAuODk5IDQuMjAxYTI3Ljg5IDI3Ljg5IDAgMCAxIDguODk5IDZsLTIuODI4IDIuODI4QzMyLjQzNyA4LjQ5NiAyNi40MSA2IDE5Ljk5OSA2UzcuNTYxIDguNDk2IDMuMDI4IDEzLjAyOUwuMiAxMC4yMDFBMjcuOTE3IDI3LjkxNyAwIDAgMSAxOS45OTggMmMzLjc3OSAwIDcuNDQ2Ljc0MSAxMC44OTkgMi4yMDF6TTE4IDI4YTIgMiAwIDEgMSAzLjk5OS0uMDAxQTIgMiAwIDAgMSAxOCAyOHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBDcm9zcyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5jcm9zczwvdGl0bGU+PHBhdGggZD1cIk0zMS43MDggMjUuNzA4TDIyIDE2bDkuNzA4LTkuNzA4YTEgMSAwIDAgMCAwLTEuNDE0TDI3LjEyMi4yOTJhMSAxIDAgMCAwLTEuNDE0LS4wMDFMMTYgOS45OTkgNi4yOTIuMjkxYS45OTguOTk4IDAgMCAwLTEuNDE0LjAwMUwuMjkyIDQuODc4YTEgMSAwIDAgMCAwIDEuNDE0TDEwIDE2IC4yOTIgMjUuNzA4YS45OTkuOTk5IDAgMCAwIDAgMS40MTRsNC41ODYgNC41ODZhMSAxIDAgMCAwIDEuNDE0IDBMMTYgMjJsOS43MDggOS43MDhhMSAxIDAgMCAwIDEuNDE0IDBsNC41ODYtNC41ODZhLjk5OS45OTkgMCAwIDAgMC0xLjQxNHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBFbWJlZCA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5lbWJlZDwvdGl0bGU+PHBhdGggZD1cIk0xOCAyM2wzIDMgMTAtMTBMMjEgNmwtMyAzIDcgN3pNMTQgOWwtMy0zTDEgMTZsMTAgMTAgMy0zLTctN3pcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBFbWJlZDIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiNDBcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgNDAgMzJcIj48dGl0bGU+ZW1iZWQyPC90aXRsZT48cGF0aCBkPVwiTTI2IDIzbDMgMyAxMC0xMEwyOSA2bC0zIDMgNyA3ek0xNCA5bC0zLTNMMSAxNmwxMCAxMCAzLTMtNy03ek0yMS45MTYgNC43MDRsMi4xNzEuNTkyLTYgMjIuMDAxLTIuMTcxLS41OTIgNi0yMi4wMDF6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgRW5sYXJnZSA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5lbmxhcmdlPC90aXRsZT48cGF0aCBkPVwiTTMyIDBIMTlsNSA1LTYgNiAzIDMgNi02IDUgNXpNMzIgMzJWMTlsLTUgNS02LTYtMyAzIDYgNi01IDV6TTAgMzJoMTNsLTUtNSA2LTYtMy0zLTYgNi01LTV6TTAgMHYxM2w1LTUgNiA2IDMtMy02LTYgNS01elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEVubGFyZ2UyID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmVubGFyZ2UyPC90aXRsZT48cGF0aCBkPVwiTTMyIDMySDE5bDUtNS02LTYgMy0zIDYgNiA1LTV6TTExIDE0TDUgOGwtNSA1VjBoMTNMOCA1bDYgNnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBFcXVhbGl6ZXIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+ZXF1YWxpemVyPC90aXRsZT48cGF0aCBkPVwiTTE0IDR2LS41YzAtLjgyNS0uNjc1LTEuNS0xLjUtMS41aC01QzYuNjc1IDIgNiAyLjY3NSA2IDMuNVY0SDB2NGg2di41YzAgLjgyNS42NzUgMS41IDEuNSAxLjVoNWMuODI1IDAgMS41LS42NzUgMS41LTEuNVY4aDE4VjRIMTR6TTggOFY0aDR2NEg4em0xOCA1LjVjMC0uODI1LS42NzUtMS41LTEuNS0xLjVoLTVjLS44MjUgMC0xLjUuNjc1LTEuNSAxLjV2LjVIMHY0aDE4di41YzAgLjgyNS42NzUgMS41IDEuNSAxLjVoNWMuODI1IDAgMS41LS42NzUgMS41LTEuNVYxOGg2di00aC02di0uNXpNMjAgMTh2LTRoNHY0aC00em0tNiA1LjVjMC0uODI1LS42NzUtMS41LTEuNS0xLjVoLTVjLS44MjUgMC0xLjUuNjc1LTEuNSAxLjV2LjVIMHY0aDZ2LjVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWg1Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41VjI4aDE4di00SDE0di0uNXpNOCAyOHYtNGg0djRIOHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBFcXVhbGl6ZXIyID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmVxdWFsaXplcjI8L3RpdGxlPjxwYXRoIGQ9XCJNMjggMTRoLjVjLjgyNSAwIDEuNS0uNjc1IDEuNS0xLjV2LTVjMC0uODI1LS42NzUtMS41LTEuNS0xLjVIMjhWMGgtNHY2aC0uNWMtLjgyNSAwLTEuNS42NzUtMS41IDEuNXY1YzAgLjgyNS42NzUgMS41IDEuNSAxLjVoLjV2MThoNFYxNHptLTQtNmg0djRoLTRWOHptLTUuNSAxOGMuODI1IDAgMS41LS42NzUgMS41LTEuNXYtNWMwLS44MjUtLjY3NS0xLjUtMS41LTEuNUgxOFYwaC00djE4aC0uNWMtLjgyNSAwLTEuNS42NzUtMS41IDEuNXY1YzAgLjgyNS42NzUgMS41IDEuNSAxLjVoLjV2Nmg0di02aC41ek0xNCAyMGg0djRoLTR2LTR6bS01LjUtNmMuODI1IDAgMS41LS42NzUgMS41LTEuNXYtNUMxMCA2LjY3NSA5LjMyNSA2IDguNSA2SDhWMEg0djZoLS41QzIuNjc1IDYgMiA2LjY3NSAyIDcuNXY1YzAgLjgyNS42NzUgMS41IDEuNSAxLjVINHYxOGg0VjE0aC41ek00IDhoNHY0SDRWOHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBGaWx0ZXIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+ZmlsdGVyPC90aXRsZT48cGF0aCBkPVwiTTE2IDBDNy4xNjMgMCAwIDIuMjM5IDAgNXYzbDEyIDEydjEwYzAgMS4xMDUgMS43OTEgMiA0IDJzNC0uODk1IDQtMlYyMEwzMiA4VjVjMC0yLjc2MS03LjE2My01LTE2LTV6TTIuOTUgNC4zMzhjLjc0OC0uNDI3IDEuNzk5LS44MzIgMy4wNC0xLjE3MUM4LjczOCAyLjQxNSAxMi4yOTMgMiAxNi4wMDEgMnM3LjI2Mi40MTQgMTAuMDExIDEuMTY3YzEuMjQxLjM0IDIuMjkyLjc0NSAzLjA0IDEuMTcxLjQ5NC4yODEuNzYuNTE5Ljg4NC42NjItLjEyNC4xNDItLjM5MS4zOC0uODg0LjY2Mi0uNzQ4LjQyNy0xLjguODMyLTMuMDQgMS4xNzFDMjMuMjY0IDcuNTg1IDE5LjcwOSA4IDE2LjAwMSA4UzguNzM5IDcuNTg2IDUuOTkgNi44MzNjLTEuMjQtLjM0LTIuMjkyLS43NDUtMy4wNC0xLjE3MS0uNDk0LS4yODItLjc2LS41MTktLjg4NC0uNjYyLjEyNC0uMTQyLjM5MS0uMzguODg0LS42NjJ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgRmlyZSA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5maXJlPC90aXRsZT48cGF0aCBkPVwiTTEwLjAzMSAzMmMtMi4xMzMtNC40MzgtLjk5Ny02Ljk4MS42NDItOS4zNzYgMS43OTUtMi42MjQgMi4yNTgtNS4yMjEgMi4yNTgtNS4yMjFzMS40MTEgMS44MzQuODQ3IDQuNzAzYzIuNDkzLTIuNzc1IDIuOTYzLTcuMTk2IDIuNTg3LTguODg5QzIyIDE3LjE1NSAyNC40MDggMjUuNjgxIDIxLjE2MyAzMmMxNy4yNjItOS43NjcgNC4yOTQtMjQuMzggMi4wMzYtMjYuMDI3Ljc1MyAxLjY0Ni44OTUgNC40MzMtLjYyNSA1Ljc4NUMyMC4wMDEgMS45OTkgMTMuNjM3LS4wMDEgMTMuNjM3LS4wMDFjLjc1MyA1LjAzMy0yLjcyOCAxMC41MzYtNi4wODQgMTQuNjQ4LS4xMTgtMi4wMDctLjI0My0zLjM5Mi0xLjI5OC01LjMxMi0uMjM3IDMuNjQ2LTMuMDIzIDYuNjE3LTMuNzc3IDEwLjI3LTEuMDIyIDQuOTQ2Ljc2NSA4LjU2OCA3LjU1NSAxMi4zOTR6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgRmxhZyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5mbGFnPC90aXRsZT48cGF0aCBkPVwiTTAgMGg0djMySDBWMHpNMjYgMjAuMDk0YzIuNTgyIDAgNC44My0uNjI1IDYtMS41NDd2LTE2Yy0xLjE3LjkyMi0zLjQxOCAxLjU0Ny02IDEuNTQ3cy00LjgzLS42MjUtNi0xLjU0N3YxNmMxLjE3LjkyMiAzLjQxOCAxLjU0NyA2IDEuNTQ3ek0xOSAxLjAxNkMxNy41MzQuMzkzIDE1LjM5IDAgMTMgMCA5Ljk4OCAwIDcuMzY1LjYyNSA2IDEuNTQ3djE2QzcuMzY1IDE2LjYyNSA5Ljk4OCAxNiAxMyAxNmMyLjM5IDAgNC41MzQuMzkzIDYgMS4wMTZ2LTE2elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IEdpdGh1YiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5naXRodWI8L3RpdGxlPjxwYXRoIGQ9XCJNMTYgLjM5NWMtOC44MzYgMC0xNiA3LjE2My0xNiAxNiAwIDcuMDY5IDQuNTg1IDEzLjA2NyAxMC45NDIgMTUuMTgyLjguMTQ4IDEuMDk0LS4zNDcgMS4wOTQtLjc3IDAtLjM4MS0uMDE1LTEuNjQyLS4wMjItMi45NzktNC40NTIuOTY4LTUuMzkxLTEuODg4LTUuMzkxLTEuODg4LS43MjgtMS44NDktMS43NzYtMi4zNDEtMS43NzYtMi4zNDEtMS40NTItLjk5My4xMS0uOTczLjExLS45NzMgMS42MDYuMTEzIDIuNDUyIDEuNjQ5IDIuNDUyIDEuNjQ5IDEuNDI3IDIuNDQ2IDMuNzQzIDEuNzM5IDQuNjU2IDEuMzMuMTQzLTEuMDM0LjU1OC0xLjc0IDEuMDE2LTIuMTQtMy41NTQtLjQwNC03LjI5LTEuNzc3LTcuMjktNy45MDcgMC0xLjc0Ny42MjUtMy4xNzQgMS42NDktNC4yOTUtLjE2Ni0uNDAzLS43MTQtMi4wMy4xNTUtNC4yMzQgMCAwIDEuMzQ0LS40MyA0LjQwMSAxLjY0YTE1LjM1MyAxNS4zNTMgMCAwIDEgNC4wMDUtLjUzOWMxLjM1OS4wMDYgMi43MjkuMTg0IDQuMDA4LjUzOSAzLjA1NC0yLjA3IDQuMzk1LTEuNjQgNC4zOTUtMS42NC44NzEgMi4yMDQuMzIzIDMuODMxLjE1NyA0LjIzNCAxLjAyNiAxLjEyIDEuNjQ3IDIuNTQ4IDEuNjQ3IDQuMjk1IDAgNi4xNDUtMy43NDMgNy40OTgtNy4zMDYgNy44OTUuNTc0LjQ5NyAxLjA4NSAxLjQ3IDEuMDg1IDIuOTYzIDAgMi4xNDEtLjAxOSAzLjg2NC0uMDE5IDQuMzkxIDAgLjQyNi4yODguOTI1IDEuMDk5Ljc2OEMyNy40MjEgMjkuNDU3IDMyIDIzLjQ2MiAzMiAxNi4zOTVjMC04LjgzNy03LjE2NC0xNi0xNi0xNnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBIYW1tZXIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+aGFtbWVyPC90aXRsZT48cGF0aCBkPVwiTTMxLjU2MiAyNS45MDVsLTkuNDIzLTkuNDIzYTEuNTA1IDEuNTA1IDAgMCAwLTIuMTIxIDBsLS43MDcuNzA3LTUuNzUtNS43NUwyMyAySDEzTDguNTYxIDYuNDM5IDguMTIyIDZINi4wMDF2Mi4xMjFsLjQzOS40MzktNi40MzkgNi40MzkgNSA1IDYuNDM5LTYuNDM5IDUuNzUgNS43NS0uNzA3LjcwN2ExLjUwNSAxLjUwNSAwIDAgMCAwIDIuMTIxbDkuNDIzIDkuNDIzYTEuNTA1IDEuNTA1IDAgMCAwIDIuMTIxIDBsMy41MzUtMy41MzVhMS41MDUgMS41MDUgMCAwIDAgMC0yLjEyMXpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBMaW5rID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmxpbms8L3RpdGxlPjxwYXRoIGQ9XCJNMTMuNzU3IDE5Ljg2OGExLjYyIDEuNjIgMCAwIDEtMS4xNDktLjQ3NmMtMi45NzMtMi45NzMtMi45NzMtNy44MSAwLTEwLjc4M2w2LTZDMjAuMDQ4IDEuMTY5IDIxLjk2My4zNzYgMjQgLjM3NnMzLjk1MS43OTMgNS4zOTIgMi4yMzNjMi45NzMgMi45NzMgMi45NzMgNy44MSAwIDEwLjc4M2wtMi43NDMgMi43NDNhMS42MjQgMS42MjQgMCAxIDEtMi4yOTgtMi4yOThsMi43NDMtMi43NDNhNC4zOCA0LjM4IDAgMCAwIDAtNi4xODdjLS44MjYtLjgyNi0xLjkyNS0xLjI4MS0zLjA5NC0xLjI4MXMtMi4yNjcuNDU1LTMuMDk0IDEuMjgxbC02IDZhNC4zOCA0LjM4IDAgMCAwIDAgNi4xODcgMS42MjQgMS42MjQgMCAwIDEtMS4xNDkgMi43NzR6XCIvPjxwYXRoIGQ9XCJNOCAzMS42MjVhNy41NzUgNy41NzUgMCAwIDEtNS4zOTItMi4yMzNjLTIuOTczLTIuOTczLTIuOTczLTcuODEgMC0xMC43ODNsMi43NDMtMi43NDNhMS42MjQgMS42MjQgMCAxIDEgMi4yOTggMi4yOThsLTIuNzQzIDIuNzQzYTQuMzggNC4zOCAwIDAgMCAwIDYuMTg3Yy44MjYuODI2IDEuOTI1IDEuMjgxIDMuMDk0IDEuMjgxczIuMjY3LS40NTUgMy4wOTQtMS4yODFsNi02YTQuMzggNC4zOCAwIDAgMCAwLTYuMTg3IDEuNjI0IDEuNjI0IDAgMSAxIDIuMjk4LTIuMjk4YzIuOTczIDIuOTczIDIuOTczIDcuODEgMCAxMC43ODNsLTYgNkE3LjU3NSA3LjU3NSAwIDAgMSA4IDMxLjYyNXpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBMaXN0ID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPmxpc3Q8L3RpdGxlPjxwYXRoIGQ9XCJNMCAwaDh2OEgwem0xMiAyaDIwdjRIMTJ6TTAgMTJoOHY4SDB6bTEyIDJoMjB2NEgxMnpNMCAyNGg4djhIMHptMTIgMmgyMHY0SDEyelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IExvY2sgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+bG9jazwvdGl0bGU+PHBhdGggZD1cIk0xOC41IDE0SDE4VjhjMC0zLjMwOC0yLjY5Mi02LTYtNkg4QzQuNjkyIDIgMiA0LjY5MiAyIDh2NmgtLjVjLS44MjUgMC0xLjUuNjc1LTEuNSAxLjV2MTVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWgxN2MuODI1IDAgMS41LS42NzUgMS41LTEuNXYtMTVjMC0uODI1LS42NzUtMS41LTEuNS0xLjV6TTYgOGMwLTEuMTAzLjg5Ny0yIDItMmg0YzEuMTAzIDAgMiAuODk3IDIgMnY2SDZWOHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBNZW51MiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCI0NFwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCA0NCAzMlwiPjx0aXRsZT5tZW51MjwvdGl0bGU+PHBhdGggZD1cIk0wIDZoMjh2NkgwVjZ6bTAgOGgyOHY2SDB2LTZ6bTAgOGgyOHY2SDB2LTZ6TTMxIDE4bDYgNiA2LTZ6TTQzIDE2bC02LTYtNiA2elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IE1ldGVyMiA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5tZXRlcjI8L3RpdGxlPjxwYXRoIGQ9XCJNMTYgMEM3LjE2MyAwIDAgNy4xNjMgMCAxNnM3LjE2MyAxNiAxNiAxNiAxNi03LjE2MyAxNi0xNlMyNC44MzcgMCAxNiAwek05LjQ2NCAyNi4wNjdBOC45OCA4Ljk4IDAgMCAwIDEwIDIzYTkuMDAyIDkuMDAyIDAgMCAwLTUuOTEzLTguNDU2IDExLjkxMyAxMS45MTMgMCAwIDEgMy40MjctNy4wMjlDOS43ODEgNS4yNDkgMTIuNzk0IDQgMTUuOTk5IDRzNi4yMTkgMS4yNDggOC40ODUgMy41MTVhMTEuOTE0IDExLjkxNCAwIDAgMSAzLjQyOCA3LjAyOSA5LjAwMyA5LjAwMyAwIDAgMC01LjM3NyAxMS41MjNDMjAuNjA3IDI3LjMyNSAxOC4zNTUgMjggMTUuOTk5IDI4cy00LjYwOC0uNjc1LTYuNTM2LTEuOTMzem03Ljc3OC02LjAzNmMuNDM0LjEwOS43NTguNTAzLjc1OC45Njl2MmMwIC41NS0uNDUgMS0xIDFoLTJjLS41NSAwLTEtLjQ1LTEtMXYtMmMwLS40NjYuMzI0LS44Ni43NTgtLjk2OUwxNS41IDZoMWwuNzQyIDE0LjAzMXpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBOb3RpZmljYXRpb24gPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+bm90aWZpY2F0aW9uPC90aXRsZT48cGF0aCBkPVwiTTE2IDNjLTMuNDcyIDAtNi43MzcgMS4zNTItOS4xOTIgMy44MDhTMyAxMi41MjggMyAxNmMwIDMuNDcyIDEuMzUyIDYuNzM3IDMuODA4IDkuMTkyUzEyLjUyOCAyOSAxNiAyOWMzLjQ3MiAwIDYuNzM3LTEuMzUyIDkuMTkyLTMuODA4UzI5IDE5LjQ3MiAyOSAxNmMwLTMuNDcyLTEuMzUyLTYuNzM3LTMuODA4LTkuMTkyUzE5LjQ3MiAzIDE2IDN6bTAtM2M4LjgzNyAwIDE2IDcuMTYzIDE2IDE2cy03LjE2MyAxNi0xNiAxNlMwIDI0LjgzNyAwIDE2IDcuMTYzIDAgMTYgMHptLTIgMjJoNHY0aC00em0wLTE2aDR2MTJoLTR6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgUGllQ2hhcnQgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+cGllLWNoYXJ0PC90aXRsZT48cGF0aCBkPVwiTTE0IDE4VjRDNi4yNjggNCAwIDEwLjI2OCAwIDE4czYuMjY4IDE0IDE0IDE0IDE0LTYuMjY4IDE0LTE0YTEzLjk0IDEzLjk0IDAgMCAwLTEuNDc2LTYuMjYyTDE0IDE4ek0yOC41MjQgNy43MzhDMjYuMjI1IDMuMTUgMjEuNDgxIDAgMTYgMHYxNGwxMi41MjQtNi4yNjJ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgUHJpY2VUYWcgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+cHJpY2UtdGFnPC90aXRsZT48cGF0aCBkPVwiTTMwLjUgMGgtMTJjLS44MjUgMC0xLjk3Ny40NzctMi41NjEgMS4wNjFMMS4wNiAxNS45NGExLjUwNSAxLjUwNSAwIDAgMCAwIDIuMTIxTDEzLjkzOSAzMC45NGExLjUwNSAxLjUwNSAwIDAgMCAyLjEyMSAwbDE0Ljg3OS0xNC44NzlDMzEuNTIyIDE1LjQ3OCAzMiAxNC4zMjUgMzIgMTMuNXYtMTJjMC0uODI1LS42NzUtMS41LTEuNS0xLjV6TTIzIDEyYTMgMyAwIDEgMSAwLTYgMyAzIDAgMCAxIDAgNnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBQcmljZVRhZ3MgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiNDBcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgNDAgMzJcIj48dGl0bGU+cHJpY2UtdGFnczwvdGl0bGU+PHBhdGggZD1cIk0zOC41IDBoLTEyYy0uODI1IDAtMS45NzcuNDc3LTIuNTYxIDEuMDYxTDkuMDYgMTUuOTRhMS41MDUgMS41MDUgMCAwIDAgMCAyLjEyMUwyMS45MzkgMzAuOTRhMS41MDUgMS41MDUgMCAwIDAgMi4xMjEgMGwxNC44NzktMTQuODc5QzM5LjUyMiAxNS40NzggNDAgMTQuMzI1IDQwIDEzLjV2LTEyYzAtLjgyNS0uNjc1LTEuNS0xLjUtMS41ek0zMSAxMmEzIDMgMCAxIDEgMC02IDMgMyAwIDAgMSAwIDZ6XCIvPjxwYXRoIGQ9XCJNNCAxN0wyMSAwaC0yLjVjLS44MjUgMC0xLjk3Ny40NzctMi41NjEgMS4wNjFMMS4wNiAxNS45NGExLjUwNSAxLjUwNSAwIDAgMCAwIDIuMTIxTDEzLjkzOSAzMC45NGExLjUwNSAxLjUwNSAwIDAgMCAyLjEyMSAwbC45MzktLjkzOS0xMy0xM3pcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBQcm9maWxlID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnByb2ZpbGU8L3RpdGxlPjxwYXRoIGQ9XCJNMjcgMEgzQzEuMzUgMCAwIDEuMzUgMCAzdjI2YzAgMS42NSAxLjM1IDMgMyAzaDI0YzEuNjUgMCAzLTEuMzUgMy0zVjNjMC0xLjY1LTEuMzUtMy0zLTN6bS0xIDI4SDRWNGgyMnYyNHpNOCAxOGgxNHYySDh6bTAgNGgxNHYySDh6bTItMTNhMyAzIDAgMSAxIDYgMCAzIDMgMCAwIDEtNiAwem01IDNoLTRjLTEuNjUgMC0zIC45LTMgMnYyaDEwdi0yYzAtMS4xLTEuMzUtMi0zLTJ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU2hhcmUyID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnNoYXJlMjwvdGl0bGU+PHBhdGggZD1cIk0yNyAyMmE0Ljk4NSA0Ljk4NSAwIDAgMC0zLjU5NCAxLjUyNkw5LjkzNyAxNi43OTJhNS4wMzUgNS4wMzUgMCAwIDAgMC0xLjU4MmwxMy40NjktNi43MzRhNSA1IDAgMSAwLTEuMzQzLTIuNjgzTDguNTk0IDEyLjUyN0E1IDUgMCAxIDAgNSAyMS4wMDFhNC45ODUgNC45ODUgMCAwIDAgMy41OTQtMS41MjZsMTMuNDY5IDYuNzM0QTUgNSAwIDEgMCAyNyAyMnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBTaWdtYSA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5zaWdtYTwvdGl0bGU+PHBhdGggZD1cIk0yOS40MjUgMjIuOTZMMzAuODEyIDIwSDMybC0yIDEySDB2LTIuMzJsMTAuMzYxLTEyLjIyNUwwIDcuMDk0VjBoMzAuNjI1TDMyIDhoLTEuMDc0bC0uNTg1LTEuMjE1QzI5LjIzNyA0LjQ5MiAyOC40MDcgNCAyNiA0SDUuMzEybDExLjAzMyAxMS4wMzNMNy4wNTEgMjZIMjRjMy42MjUgMCA0LjU4My0xLjI5OSA1LjQyNS0zLjA0elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFNvcnRBbW91bnRBc2MgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c29ydC1hbW91bnQtYXNjPC90aXRsZT48cGF0aCBkPVwiTTEwIDI0VjBINnYyNEgxbDcgNyA3LTdoLTV6XCIvPjxwYXRoIGQ9XCJNMTQgMThoMTh2NEgxNHYtNHpNMTQgMTJoMTR2NEgxNHYtNHpNMTQgNmgxMHY0SDE0VjZ6TTE0IDBoNnY0aC02VjB6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU3RhckVtcHR5ID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnN0YXItZW1wdHk8L3RpdGxlPjxwYXRoIGQ9XCJNMzIgMTIuNDA4bC0xMS4wNTYtMS42MDdMMTYgLjc4M2wtNC45NDQgMTAuMDE4TDAgMTIuNDA4bDggNy43OTgtMS44ODkgMTEuMDExTDE2IDI2LjAxOGw5Ljg4OSA1LjE5OUwyNCAyMC4yMDZsOC03Ljc5OHpNMTYgMjMuNTQ3bC02Ljk4MyAzLjY3MSAxLjMzNC03Ljc3Ni01LjY1LTUuNTA3IDcuODA4LTEuMTM0IDMuNDkyLTcuMDc1IDMuNDkyIDcuMDc1IDcuODA3IDEuMTM0LTUuNjUgNS41MDcgMS4zMzQgNy43NzYtNi45ODMtMy42NzF6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU3RhckZ1bGwgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c3Rhci1mdWxsPC90aXRsZT48cGF0aCBkPVwiTTMyIDEyLjQwOGwtMTEuMDU2LTEuNjA3TDE2IC43ODNsLTQuOTQ0IDEwLjAxOEwwIDEyLjQwOGw4IDcuNzk4LTEuODg5IDExLjAxMUwxNiAyNi4wMThsOS44ODkgNS4xOTlMMjQgMjAuMjA2bDgtNy43OTh6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU3RhckZ1bGwyID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnN0YXItZnVsbDI8L3RpdGxlPjxwYXRoIGQ9XCJNMzIgMTIuNDA4bC0xMS4wNTYtMS42MDdMMTYgLjc4M2wtNC45NDQgMTAuMDE4TDAgMTIuNDA4bDggNy43OTgtMS44ODkgMTEuMDExTDE2IDI2LjAxOGw5Ljg4OSA1LjE5OUwyNCAyMC4yMDZsOC03Ljc5OHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBTdGF0c0JhcnMgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c3RhdHMtYmFyczwvdGl0bGU+PHBhdGggZD1cIk0wIDI2aDMydjRIMHptNC04aDR2Nkg0em02LThoNHYxNGgtNHptNiA2aDR2OGgtNHptNi0xMmg0djIwaC00elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFN0YXRzQmFyczIgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+c3RhdHMtYmFyczI8L3RpdGxlPjxwYXRoIGQ9XCJNOSAxMkgzYy0uNTUgMC0xIC40NS0xIDF2MThjMCAuNTUuNDUgMSAxIDFoNmMuNTUgMCAxLS40NSAxLTFWMTNjMC0uNTUtLjQ1LTEtMS0xem0wIDE4SDN2LThoNnY4ek0xOSA4aC02Yy0uNTUgMC0xIC40NS0xIDF2MjJjMCAuNTUuNDUgMSAxIDFoNmMuNTUgMCAxLS40NSAxLTFWOWMwLS41NS0uNDUtMS0xLTF6bTAgMjJoLTZWMjBoNnYxMHpNMjkgNGgtNmMtLjU1IDAtMSAuNDUtMSAxdjI2YzAgLjU1LjQ1IDEgMSAxaDZjLjU1IDAgMS0uNDUgMS0xVjVjMC0uNTUtLjQ1LTEtMS0xem0wIDI2aC02VjE4aDZ2MTJ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgU3RhdHNEb3RzID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnN0YXRzLWRvdHM8L3RpdGxlPjxwYXRoIGQ9XCJNNCAyOGgyOHY0SDBWMGg0em01LTJhMyAzIDAgMSAxIC4yNjItNS45ODhsMy4yMjUtNS4zNzVhMyAzIDAgMSAxIDUuMDI2IDBsMy4yMjUgNS4zNzVhMy4yMzggMy4yMzggMCAwIDEgLjQ2LS4wMDVsNS4zMjQtOS4zMTZhMyAzIDAgMSAxIDIuMjggMS4zMDJsLTUuMzI0IDkuMzE2YTMgMyAwIDEgMS00Ljk5MS4wNTNsLTMuMjI1LTUuMzc1Yy0uMDg2LjAwNy0uMTc0LjAxMi0uMjYyLjAxMnMtLjE3Ni0uMDA1LS4yNjItLjAxMmwtMy4yMjUgNS4zNzVBMyAzIDAgMCAxIDkgMjUuOTk5elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFN3aXRjaCA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT5zd2l0Y2g8L3RpdGxlPjxwYXRoIGQ9XCJNMjAgNC41ODFWOC44M2ExMCAxMCAwIDAgMSAzLjA3MSAyLjA5OUMyNC45NiAxMi44MTggMjYgMTUuMzI5IDI2IDE4cy0xLjA0IDUuMTgyLTIuOTI5IDcuMDcxQzIxLjE4MiAyNi45NiAxOC42NzEgMjggMTYgMjhzLTUuMTgyLTEuMDQtNy4wNzEtMi45MjlDNy4wNCAyMy4xODIgNiAyMC42NzEgNiAxOHMxLjA0LTUuMTgyIDIuOTI5LTcuMDcxQTkuOTgyIDkuOTgyIDAgMCAxIDEyIDguODNWNC41ODFDNi4yMTcgNi4zMDIgMiAxMS42NTggMiAxOGMwIDcuNzMyIDYuMjY4IDE0IDE0IDE0czE0LTYuMjY4IDE0LTE0YzAtNi4zNDItNC4yMTctMTEuNjk4LTEwLTEzLjQxOXpNMTQgMGg0djE2aC00elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFRyZWUgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+dHJlZTwvdGl0bGU+PHBhdGggZD1cIk0zMC41IDI0SDMwdi02LjVjMC0xLjkzLTEuNTctMy41LTMuNS0zLjVIMTh2LTRoLjVjLjgyNSAwIDEuNS0uNjc1IDEuNS0xLjV2LTVjMC0uODI1LS42NzUtMS41LTEuNS0xLjVoLTVjLS44MjUgMC0xLjUuNjc1LTEuNSAxLjV2NWMwIC44MjUuNjc1IDEuNSAxLjUgMS41aC41djRINS41QzMuNTcgMTQgMiAxNS41NyAyIDE3LjVWMjRoLS41Yy0uODI1IDAtMS41LjY3NS0xLjUgMS41djVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWg1Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41di01YzAtLjgyNS0uNjc1LTEuNS0xLjUtMS41SDZ2LTZoOHY2aC0uNWMtLjgyNSAwLTEuNS42NzUtMS41IDEuNXY1YzAgLjgyNS42NzUgMS41IDEuNSAxLjVoNWMuODI1IDAgMS41LS42NzUgMS41LTEuNXYtNWMwLS44MjUtLjY3NS0xLjUtMS41LTEuNUgxOHYtNmg4djZoLS41Yy0uODI1IDAtMS41LjY3NS0xLjUgMS41djVjMCAuODI1LjY3NSAxLjUgMS41IDEuNWg1Yy44MjUgMCAxLjUtLjY3NSAxLjUtMS41di01YzAtLjgyNS0uNjc1LTEuNS0xLjUtMS41ek02IDMwSDJ2LTRoNHY0em0xMiAwaC00di00aDR2NHpNMTQgOFY0aDR2NGgtNHptMTYgMjJoLTR2LTRoNHY0elwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFVubG9ja2VkID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnVubG9ja2VkPC90aXRsZT48cGF0aCBkPVwiTTI0IDJjMy4zMDggMCA2IDIuNjkyIDYgNnY2aC00VjhjMC0xLjEwMy0uODk3LTItMi0yaC00Yy0xLjEwMyAwLTIgLjg5Ny0yIDJ2NmguNWMuODI1IDAgMS41LjY3NSAxLjUgMS41djE1YzAgLjgyNS0uNjc1IDEuNS0xLjUgMS41aC0xN0MuNjc1IDMyIDAgMzEuMzI1IDAgMzAuNXYtMTVjMC0uODI1LjY3NS0xLjUgMS41LTEuNUgxNFY4YzAtMy4zMDggMi42OTItNiA2LTZoNHpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBVc2VyQ2hlY2sgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzJcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzIgMzJcIj48dGl0bGU+dXNlci1jaGVjazwvdGl0bGU+PHBhdGggZD1cIk0zMCAxOWwtOSA5LTMtMy0yIDIgNSA1IDExLTExelwiLz48cGF0aCBkPVwiTTE0IDI0aDEwdi0zLjU5OGMtMi4xMDEtMS4yMjUtNC44ODUtMi4wNjYtOC0yLjMyMXYtMS42NDljMi4yMDMtMS4yNDIgNC00LjMzNyA0LTcuNDMyIDAtNC45NzEgMC05LTYtOVM4IDQuMDI5IDggOWMwIDMuMDk2IDEuNzk3IDYuMTkxIDQgNy40MzJ2MS42NDljLTYuNzg0LjU1NS0xMiAzLjg4OC0xMiA3LjkxOGgxNHYtMnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG5cbmV4cG9ydCBjb25zdCBVc2VyID0gKHByb3BzKSA9PiB7XG5jb25zdCBjbGFzc2VzID0gKHByb3BzLmNsYXNzZXMgfHwgW10pLmNvbmNhdCgnaWNvbicpLmpvaW4oJyAnKTtcbnJldHVybiAoPHNwYW4gY2xhc3M9e2NsYXNzZXN9PlxuPHN2ZyB3aWR0aD1cIjMyXCIgaGVpZ2h0PVwiMzJcIiB2aWV3Qm94PVwiMCAwIDMyIDMyXCI+PHRpdGxlPnVzZXI8L3RpdGxlPjxwYXRoIGQ9XCJNMTggMjIuMDgydi0xLjY0OWMyLjIwMy0xLjI0MSA0LTQuMzM3IDQtNy40MzIgMC00Ljk3MSAwLTktNi05cy02IDQuMDI5LTYgOWMwIDMuMDk2IDEuNzk3IDYuMTkxIDQgNy40MzJ2MS42NDlDNy4yMTYgMjIuNjM3IDIgMjUuOTcgMiAzMGgyOGMwLTQuMDMtNS4yMTYtNy4zNjQtMTItNy45MTh6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgVXNlcnMgPSAocHJvcHMpID0+IHtcbmNvbnN0IGNsYXNzZXMgPSAocHJvcHMuY2xhc3NlcyB8fCBbXSkuY29uY2F0KCdpY29uJykuam9pbignICcpO1xucmV0dXJuICg8c3BhbiBjbGFzcz17Y2xhc3Nlc30+XG48c3ZnIHdpZHRoPVwiMzZcIiBoZWlnaHQ9XCIzMlwiIHZpZXdCb3g9XCIwIDAgMzYgMzJcIj48dGl0bGU+dXNlcnM8L3RpdGxlPjxwYXRoIGQ9XCJNMjQgMjQuMDgydi0xLjY0OWMyLjIwMy0xLjI0MSA0LTQuMzM3IDQtNy40MzIgMC00Ljk3MSAwLTktNi05cy02IDQuMDI5LTYgOWMwIDMuMDk2IDEuNzk3IDYuMTkxIDQgNy40MzJ2MS42NDlDMTMuMjE2IDI0LjYzNyA4IDI3Ljk3IDggMzJoMjhjMC00LjAzLTUuMjE2LTcuMzY0LTEyLTcuOTE4elwiLz48cGF0aCBkPVwiTTEwLjIyNSAyNC44NTRjMS43MjgtMS4xMyAzLjg3Ny0xLjk4OSA2LjI0My0yLjUxM2ExMS4zMyAxMS4zMyAwIDAgMS0xLjI2NS0xLjg0NGMtLjk1LTEuNzI2LTEuNDUzLTMuNjI3LTEuNDUzLTUuNDk3IDAtMi42ODkgMC01LjIyOC45NTYtNy4zMDUuOTI4LTIuMDE2IDIuNTk4LTMuMjY1IDQuOTc2LTMuNzM0QzE5LjE1MyAxLjU3MSAxNy43NDYgMCAxNCAwIDggMCA4IDQuMDI5IDggOWMwIDMuMDk2IDEuNzk3IDYuMTkxIDQgNy40MzJ2MS42NDljLTYuNzg0LjU1NS0xMiAzLjg4OC0xMiA3LjkxOGg4LjcxOWMuNDU0LS40MDMuOTU2LS43ODcgMS41MDYtMS4xNDZ6XCIvPjwvc3ZnPlxuPC9zcGFuPil9O1xuXG5leHBvcnQgY29uc3QgV2FybmluZyA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT53YXJuaW5nPC90aXRsZT48cGF0aCBkPVwiTTE2IDIuODk5bDEzLjQwOSAyNi43MjZIMi41OUwxNS45OTkgMi44OTl6TTE2IDBjLS42OSAwLTEuMzc5LjQ2NS0xLjkwMyAxLjM5NUwuNDM4IDI4LjYxN0MtLjYwOCAzMC40NzcuMjgyIDMyIDIuNDE2IDMyaDI3LjE2NmMyLjEzNCAwIDMuMDI1LTEuNTIyIDEuOTc4LTMuMzgzTDE3LjkwMSAxLjM5NUMxNy4zNzguNDY1IDE2LjY4OCAwIDE1Ljk5OCAwelwiLz48cGF0aCBkPVwiTTE4IDI2YTIgMiAwIDEgMS0zLjk5OS4wMDFBMiAyIDAgMCAxIDE4IDI2ek0xNiAyMmEyIDIgMCAwIDEtMi0ydi02YTIgMiAwIDEgMSA0IDB2NmEyIDIgMCAwIDEtMiAyelwiLz48L3N2Zz5cbjwvc3Bhbj4pfTtcblxuZXhwb3J0IGNvbnN0IFdyZW5jaCA9IChwcm9wcykgPT4ge1xuY29uc3QgY2xhc3NlcyA9IChwcm9wcy5jbGFzc2VzIHx8IFtdKS5jb25jYXQoJ2ljb24nKS5qb2luKCcgJyk7XG5yZXR1cm4gKDxzcGFuIGNsYXNzPXtjbGFzc2VzfT5cbjxzdmcgd2lkdGg9XCIzMlwiIGhlaWdodD1cIjMyXCIgdmlld0JveD1cIjAgMCAzMiAzMlwiPjx0aXRsZT53cmVuY2g8L3RpdGxlPjxwYXRoIGQ9XCJNMzEuMzQyIDI1LjU1OUwxNi45NSAxMy4yMjNBOSA5IDAgMCAwIDYuMzg3LjM4N2w1LjIgNS4yYTIuMDA1IDIuMDA1IDAgMCAxIDAgMi44MjhsLTMuMTcyIDMuMTcyYTIuMDA1IDIuMDA1IDAgMCAxLTIuODI4IDBsLTUuMi01LjJBOSA5IDAgMCAwIDEzLjIyMyAxNi45NWwxMi4zMzYgMTQuMzkyYTEuODI4IDEuODI4IDAgMCAwIDIuNzE2LjEwNGwzLjE3Mi0zLjE3MmMuNzc4LS43NzguNzMxLTItLjEwNC0yLjcxNnpcIi8+PC9zdmc+XG48L3NwYW4+KX07XG4iLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcbmltcG9ydCBQYW5lbCBmcm9tICcuL1BhbmVsJztcbmltcG9ydCB7Uk9XUywgQ09MVU1OU30gZnJvbSAnLi4vbGliL2NvbnN0YW50cydcbmltcG9ydCB7RW5sYXJnZSwgRW5sYXJnZTJ9IGZyb20gJy4uL2NvbXBvbmVudHMvaWNvbnMnO1xuXG5jb25zdCBmbGV4aWJsZSA9IENvbXAgPT4gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHt4LCB5LCBkeCwgZHksIGFkb3JuZXJTdGF0dXMsIG9uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0fSA9IHByb3BzO1xuICBjb25zdCB6SW5kZXggPSAoUk9XUyAtIHkpICogMTAgKyBDT0xVTU5TIC0geDtcbiAgY29uc3QgcGFuZWxDbGFzc2VzID0gWydkYXRhLXBhbmVsJ107XG5cbiAgaWYgKGFkb3JuZXJTdGF0dXMgIT09IDApIHtcbiAgICBwYW5lbENsYXNzZXMucHVzaCgnYWN0aXZlLXBhbmVsJyk7XG4gIH1cblxuICByZXR1cm4gPFBhbmVsIHg9e3h9IHk9e3l9IGR4PXtkeH0gZHk9e2R5fSBzdHlsZT17YHotaW5kZXg6JHt6SW5kZXh9O2B9IHBhbmVsQ2xhc3Nlcz17cGFuZWxDbGFzc2VzfT5cbiAgICA8ZGl2IGNsYXNzPVwibW92ZS1oYW5kbGVcIiBkcmFnZ2FibGU9XCJ0cnVlXCIgb25EcmFnU3RhcnQ9e29uTW92ZVN0YXJ0fT5cbiAgICAgIDxFbmxhcmdlLz5cbiAgICA8L2Rpdj5cbiAgICA8Q29tcCB7Li4ucHJvcHN9IC8+XG4gICAgPGRpdiBjbGFzcz1cInJlc2l6ZS1oYW5kbGVcIiBkcmFnZ2FibGU9XCJ0cnVlXCIgb25EcmFnU3RhcnQ9e29uUmVzaXplU3RhcnR9PlxuICAgICAgPEVubGFyZ2UyLz5cbiAgICA8L2Rpdj5cbiAgPC9QYW5lbD5cbn07XG5cbmV4cG9ydCBkZWZhdWx0IGZsZXhpYmxlOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IHtTdGF0c0JhcnMsIExpc3QsIFNpZ21hfSBmcm9tICcuLi9jb21wb25lbnRzL2ljb25zJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUocHJvcHMgPT5cbiAgPGRpdiBjbGFzcz1cImVtcHR5LXBhbmVsLXRvb2xiYXJcIj5cbiAgICA8YnV0dG9uIG9uQ2xpY2s9e3Byb3BzLmNyZWF0ZVNtYXJ0TGlzdH0+PExpc3QvPjwvYnV0dG9uPlxuICAgIDxidXR0b24gb25DbGljaz17cHJvcHMuY3JlYXRlU21hcnRDaGFydH0+PFN0YXRzQmFycy8+PC9idXR0b24+XG4gICAgPGJ1dHRvbiBvbkNsaWNrPXtwcm9wcy5jcmVhdGVTbWFydEFnZ3JlZ2F0aW9ufT48U2lnbWEvPjwvYnV0dG9uPlxuICA8L2Rpdj4pOyIsImV4cG9ydCBkZWZhdWx0IChDb21wKSA9PiAocHJvcHMsIHNlcnZpY2VzKSA9PiB7XG4gIGNvbnN0IHt4LCB5fSA9IHByb3BzO1xuICBjb25zdCB7YWN0aW9uc30gPSBzZXJ2aWNlcztcblxuICBjb25zdCBvblJlc2l6ZVN0YXJ0ID0gZXYgPT4ge1xuICAgIGV2LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ2NvcHknO1xuICAgIGV2LmRhdGFUcmFuc2Zlci5zZXREYXRhKCd0ZXh0L3BsYWluJywgSlNPTi5zdHJpbmdpZnkoe3gsIHksIG9wZXJhdGlvbjogJ3Jlc2l6ZSd9KSk7XG4gICAgYWN0aW9ucy5zdGFydFJlc2l6ZSh7eCwgeX0pO1xuICB9O1xuXG4gIGNvbnN0IG9uTW92ZVN0YXJ0ID0gZXYgPT4ge1xuICAgIGV2LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuICAgIGV2LmRhdGFUcmFuc2Zlci5zZXREYXRhKCd0ZXh0L3BsYWluJywgSlNPTi5zdHJpbmdpZnkoe3gsIHksIG9wZXJhdGlvbjogJ21vdmUnfSkpO1xuICAgIGFjdGlvbnMuc3RhcnRNb3ZlKHt4LCB5fSk7XG4gIH07XG5cbiAgcmV0dXJuIENvbXAoT2JqZWN0LmFzc2lnbihwcm9wcywge29uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0fSksIHNlcnZpY2VzKTtcbn07XG5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEVtcHR5RGF0YVBhbmVsIGZyb20gJy4uL3ZpZXdzL0VtcHR5RGF0YVBhbmVsJztcbmltcG9ydCBmbGV4aWJsZSBmcm9tICcuL0ZsZXhpYmxlRGF0YVBhbmVsJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUoKHByb3BzLCB7Z3JpZCwgYWN0aW9uc30pID0+IHtcbiAgY29uc3Qge3gsIHksIG9uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0fSA9IHByb3BzO1xuICBjb25zdCBwYW5lbERhdGEgPSBncmlkLmdldERhdGEoeCwgeSk7XG5cbiAgY29uc3QgY3JlYXRlU21hcnRMaXN0ID0gXyA9PiB7XG4gICAgYWN0aW9ucy5vcGVuTW9kYWwoe3gsIHksIHRpdGxlOiAnQ3JlYXRlIG5ldyBkYXRhIHBhbmVsJywgbW9kYWxUeXBlOiAnY3JlYXRlU21hcnRMaXN0UGFuZWxEYXRhJ30pO1xuICB9O1xuXG4gIGNvbnN0IGNyZWF0ZVNtYXJ0Q2hhcnQgPSBfID0+IHtcbiAgICBhY3Rpb25zLm9wZW5Nb2RhbCh7eCwgeSwgdGl0bGU6ICdDcmVhdGUgbmV3IENoYXJ0IGRhdGEgcGFuZWwnLCBtb2RhbFR5cGU6ICdjcmVhdGVTbWFydENoYXJ0UGFuZWxEYXRhJ30pXG4gIH07XG5cbiAgcmV0dXJuIDxFbXB0eURhdGFQYW5lbCB7Li4ucGFuZWxEYXRhfSBvbk1vdmVTdGFydD17b25Nb3ZlU3RhcnR9IGNyZWF0ZVNtYXJ0TGlzdD17Y3JlYXRlU21hcnRMaXN0fVxuICAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZVNtYXJ0Q2hhcnQ9e2NyZWF0ZVNtYXJ0Q2hhcnR9XG4gICAgICAgICAgICAgICAgICAgICAgICAgb25SZXNpemVTdGFydD17b25SZXNpemVTdGFydH0vPjtcbn0pOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IHtFcXVhbGl6ZXIsIEJpbjIsIFdyZW5jaH0gZnJvbSAnLi4vY29tcG9uZW50cy9pY29ucyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZsZXhpYmxlKHByb3BzID0+IHtcbiAgY29uc3Qge2RhdGEgPSB7fSwgb25SZXNldCwgb25FZGl0LCBvblRvZ2dsZVRvb2xCYXJ9ID0gcHJvcHM7XG4gIGNvbnN0IHtwcm9jZXNzaW5nID0gZmFsc2V9ID0gZGF0YTtcbiAgY29uc3Qgc2hvd1Rvb2xiYXIgPSBTdHJpbmcoZGF0YS5zaG93VG9vbEJhciA9PT0gdHJ1ZSk7XG4gIC8vdG9kbyBhcmlhLWNvbnRyb2xzXG4gIHJldHVybiAoPGRpdiBjbGFzcz1cInBhbmVsLWNvbnRlbnRcIj5cbiAgICA8aGVhZGVyIGNsYXNzPVwicGFuZWwtaGVhZGVyXCI+XG4gICAgICA8aDI+e2RhdGEudGl0bGV9PC9oMj5cbiAgICAgIDxidXR0b24gYXJpYS1oYXNwb3B1cD1cInRydWVcIiBhcmlhLXByZXNzZWQ9e3Nob3dUb29sYmFyfSBhcmlhLWV4cGFuZGVkPXtzaG93VG9vbGJhcn0gb25DbGljaz17b25Ub2dnbGVUb29sQmFyfT48V3JlbmNoLz48L2J1dHRvbj5cbiAgICAgIDxidXR0b24gb25DbGljaz17b25FZGl0fT48RXF1YWxpemVyLz48L2J1dHRvbj5cbiAgICAgIDxidXR0b24gb25DbGljaz17b25SZXNldH0+PEJpbjIvPlxuICAgICAgPC9idXR0b24+XG4gICAgPC9oZWFkZXI+XG4gICAgPGRpdiBjbGFzcz1cInBhbmVsLWJvZHlcIj5cbiAgICAgIDxkaXYgYXJpYS1oaWRkZW49e1N0cmluZyghcHJvY2Vzc2luZyl9IGNsYXNzPVwicHJvY2Vzc2luZy1vdmVybGF5XCI+XG4gICAgICAgIFByb2Nlc3NpbmcgLi4uXG4gICAgICA8L2Rpdj5cbiAgICAgIHtwcm9wcy5jaGlsZHJlbn1cbiAgICA8L2Rpdj5cbiAgPC9kaXY+KTtcbn0pOyIsImV4cG9ydCBmdW5jdGlvbiBlbWl0dGVyICgpIHtcblxuICBjb25zdCBsaXN0ZW5lcnNMaXN0cyA9IHt9O1xuICBjb25zdCBpbnN0YW5jZSA9IHtcbiAgICBvbihldmVudCwgLi4ubGlzdGVuZXJzKXtcbiAgICAgIGxpc3RlbmVyc0xpc3RzW2V2ZW50XSA9IChsaXN0ZW5lcnNMaXN0c1tldmVudF0gfHwgW10pLmNvbmNhdChsaXN0ZW5lcnMpO1xuICAgICAgcmV0dXJuIGluc3RhbmNlO1xuICAgIH0sXG4gICAgZGlzcGF0Y2goZXZlbnQsIC4uLmFyZ3Mpe1xuICAgICAgY29uc3QgbGlzdGVuZXJzID0gbGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdO1xuICAgICAgZm9yIChsZXQgbGlzdGVuZXIgb2YgbGlzdGVuZXJzKSB7XG4gICAgICAgIGxpc3RlbmVyKC4uLmFyZ3MpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGluc3RhbmNlO1xuICAgIH0sXG4gICAgb2ZmKGV2ZW50LCAuLi5saXN0ZW5lcnMpe1xuICAgICAgaWYgKCFldmVudCkge1xuICAgICAgICBPYmplY3Qua2V5cyhsaXN0ZW5lcnNMaXN0cykuZm9yRWFjaChldiA9PiBpbnN0YW5jZS5vZmYoZXYpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGxpc3QgPSBsaXN0ZW5lcnNMaXN0c1tldmVudF0gfHwgW107XG4gICAgICAgIGxpc3RlbmVyc0xpc3RzW2V2ZW50XSA9IGxpc3RlbmVycy5sZW5ndGggPyBsaXN0LmZpbHRlcihsaXN0ZW5lciA9PiAhbGlzdGVuZXJzLmluY2x1ZGVzKGxpc3RlbmVyKSkgOiBbXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9XG4gIH07XG4gIHJldHVybiBpbnN0YW5jZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3h5TGlzdGVuZXIgKGV2ZW50TWFwKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoe2VtaXR0ZXJ9KSB7XG5cbiAgICBjb25zdCBwcm94eSA9IHt9O1xuICAgIGxldCBldmVudExpc3RlbmVycyA9IHt9O1xuXG4gICAgZm9yIChsZXQgZXYgb2YgT2JqZWN0LmtleXMoZXZlbnRNYXApKSB7XG4gICAgICBjb25zdCBtZXRob2QgPSBldmVudE1hcFtldl07XG4gICAgICBldmVudExpc3RlbmVyc1tldl0gPSBbXTtcbiAgICAgIHByb3h5W21ldGhvZF0gPSBmdW5jdGlvbiAoLi4ubGlzdGVuZXJzKSB7XG4gICAgICAgIGV2ZW50TGlzdGVuZXJzW2V2XSA9IGV2ZW50TGlzdGVuZXJzW2V2XS5jb25jYXQobGlzdGVuZXJzKTtcbiAgICAgICAgZW1pdHRlci5vbihldiwgLi4ubGlzdGVuZXJzKTtcbiAgICAgICAgcmV0dXJuIHByb3h5O1xuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihwcm94eSwge1xuICAgICAgb2ZmKGV2KXtcbiAgICAgICAgaWYgKCFldikge1xuICAgICAgICAgIE9iamVjdC5rZXlzKGV2ZW50TGlzdGVuZXJzKS5mb3JFYWNoKGV2ZW50TmFtZSA9PiBwcm94eS5vZmYoZXZlbnROYW1lKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV2ZW50TGlzdGVuZXJzW2V2XSkge1xuICAgICAgICAgIGVtaXR0ZXIub2ZmKGV2LCAuLi5ldmVudExpc3RlbmVyc1tldl0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcm94eTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufSIsImltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuY29uc3Qge3Byb3h5TGlzdGVuZXIsIGVtaXR0ZXI6Y3JlYXRlRW1pdHRlcn0gPWV2ZW50cztcblxuY29uc3QgRE9NX0NMSUNLID0gJ0RPTV9DTElDSyc7XG5jb25zdCBET01fS0VZRE9XTiA9ICdET01fS0VZRE9XTic7XG5jb25zdCBET01fRk9DVVMgPSAnRE9NX0ZPQ1VTJztcblxuY29uc3QgZG9tTGlzdGVuZXIgPSBwcm94eUxpc3RlbmVyKHtcbiAgW0RPTV9DTElDS106ICdvbmNsaWNrJyxcbiAgW0RPTV9LRVlET1dOXTogJ29ua2V5ZG93bicsXG4gIFtET01fRk9DVVNdOiAnb25mb2N1cydcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCAoe2VsZW1lbnQsIGVtaXR0ZXIgPSBjcmVhdGVFbWl0dGVyKCl9KSA9PiB7XG5cbiAgaWYgKCFlbGVtZW50KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdhIGRvbSBlbGVtZW50IG11c3QgYmUgcHJvdmlkZWQnKTtcbiAgfVxuXG4gIGNvbnN0IGRvbUxpc3RlbmVySGFuZGxlciA9IChldmVudE5hbWUpID0+IChldikgPT4gZW1pdHRlci5kaXNwYXRjaChldmVudE5hbWUsIGV2KTtcblxuICBjb25zdCBsaXN0ZW5lciA9IGRvbUxpc3RlbmVyKHtlbWl0dGVyfSk7XG4gIGNvbnN0IGNsaWNrTGlzdGVuZXIgPSBkb21MaXN0ZW5lckhhbmRsZXIoRE9NX0NMSUNLKTtcbiAgY29uc3Qga2V5ZG93bkxpc3RlbmVyID0gZG9tTGlzdGVuZXJIYW5kbGVyKERPTV9LRVlET1dOKTtcbiAgY29uc3QgZm9jdXNMaXN0ZW5lciA9IGRvbUxpc3RlbmVySGFuZGxlcihET01fRk9DVVMpO1xuXG4gIGNvbnN0IGFwaSA9IHtcbiAgICBlbGVtZW50KCl7XG4gICAgICByZXR1cm4gZWxlbWVudDtcbiAgICB9LFxuICAgIGF0dHIoYXR0cmlidXRlTmFtZSwgdmFsdWUpe1xuICAgICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHJpYnV0ZU5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoYXR0cmlidXRlTmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0sXG4gICAgYWRkQ2xhc3MoLi4uY2xhc3NOYW1lcyl7XG4gICAgICBlbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uY2xhc3NOYW1lcyk7XG4gICAgfSxcbiAgICByZW1vdmVDbGFzcyguLi5jbGFzc05hbWVzKXtcbiAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5jbGFzc05hbWVzKTtcbiAgICB9LFxuICAgIGNsZWFuKCl7XG4gICAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tMaXN0ZW5lcik7XG4gICAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBrZXlkb3duTGlzdGVuZXIpO1xuICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdmb2N1cycsIGZvY3VzTGlzdGVuZXIpO1xuICAgICAgbGlzdGVuZXIub2ZmKERPTV9DTElDSyk7XG4gICAgICBsaXN0ZW5lci5vZmYoRE9NX0tFWURPV04pO1xuICAgICAgbGlzdGVuZXIub2ZmKERPTV9GT0NVUyk7XG4gICAgfVxuICB9O1xuXG4gIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGlja0xpc3RlbmVyKTtcbiAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywga2V5ZG93bkxpc3RlbmVyKTtcbiAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsIGZvY3VzTGlzdGVuZXIpO1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKGxpc3RlbmVyLCBhcGkpO1xufTsiLCJjb25zdCBrZXkgPSBldiA9PiAoe2tleTogZXYua2V5LCBrZXlDb2RlOiBldi5rZXlDb2RlLCBjb2RlOiBldi5jb2RlfSk7XG5jb25zdCBjaGVja0tleSA9IChrZXlOYW1lLCBrZXlDb2RlKSA9PiBldiA9PiB7XG4gIGNvbnN0IGsgPSBrZXkoZXYpO1xuICByZXR1cm4gay5rZXkgPyBrLmtleSA9PT0ga2V5TmFtZSA6IGsua2V5Q29kZSA9PT0ga2V5Q29kZTtcbn07XG5cbmV4cG9ydCBjb25zdCBpc0Fycm93TGVmdCA9IGNoZWNrS2V5KCdBcnJvd0xlZnQnLCAzNyk7XG5leHBvcnQgY29uc3QgaXNBcnJvd1VwID0gY2hlY2tLZXkoJ0Fycm93VXAnLCAzOCk7XG5leHBvcnQgY29uc3QgaXNBcnJvd1JpZ2h0ID0gY2hlY2tLZXkoJ0Fycm93UmlnaHQnLCAzOSk7XG5leHBvcnQgY29uc3QgaXNBcnJvd0Rvd24gPSBjaGVja0tleSgnQXJyb3dEb3duJywgNDApO1xuZXhwb3J0IGNvbnN0IGlzRXNjYXBlID0gY2hlY2tLZXkoJ0VzY2FwZScsIDI3KTtcbmV4cG9ydCBjb25zdCBpc0VudGVyID0gY2hlY2tLZXkoJ0VudGVyJywgMTMpO1xuZXhwb3J0IGNvbnN0IGlzU3BhY2UgPSBldiA9PiB7XG4gIGNvbnN0IGsgPSBrZXkoZXYpO1xuICByZXR1cm4gay5jb2RlID8gay5jb2RlID09PSAnU3BhY2UnIDogay5rZXlDb2RlID09PSAzMjtcbn07IiwiaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ3NtYXJ0LXRhYmxlLWV2ZW50cyc7XG5pbXBvcnQgZWxlbWVudENvbXBvbmVudCBmcm9tICcuLi9jb21tb24vZWxlbWVudCc7XG5pbXBvcnQgKiBhcyBjaGVja0tleXMgZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCB7cHJveHlMaXN0ZW5lciwgZW1pdHRlcjpjcmVhdGVFbWl0dGVyfSA9IGV2ZW50cztcblxuY29uc3QgRVhQQU5ERURfQ0hBTkdFRCA9ICdFWFBBTkRFRF9DSEFOR0VEJztcbmNvbnN0IHByb3h5ID0gcHJveHlMaXN0ZW5lcih7W0VYUEFOREVEX0NIQU5HRURdOiAnb25FeHBhbmRlZENoYW5nZSd9KTtcblxuY29uc3QgZXhwYW5kYWJsZUZhY3RvcnkgPSAoe2VtaXR0ZXIgPSBjcmVhdGVFbWl0dGVyKCksIGV4cGFuZGVkfSkgPT4ge1xuICBjb25zdCBzdGF0ZSA9IHtleHBhbmRlZH07XG4gIGNvbnN0IGRpc3BhdGNoID0gKCkgPT4gZW1pdHRlci5kaXNwYXRjaChFWFBBTkRFRF9DSEFOR0VELCBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSkpO1xuICBjb25zdCBzZXRBbmREaXNwYXRjaCA9ICh2YWwpID0+ICgpID0+IHtcbiAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHN0YXRlLmV4cGFuZGVkID0gdmFsO1xuICAgIH1cbiAgICBkaXNwYXRjaCgpO1xuICB9O1xuICBjb25zdCB0YXJnZXQgPSBwcm94eSh7ZW1pdHRlcn0pO1xuICByZXR1cm4gT2JqZWN0LmFzc2lnbih0YXJnZXQsIHtcbiAgICBleHBhbmQ6IHNldEFuZERpc3BhdGNoKHRydWUpLFxuICAgIGNvbGxhcHNlOiBzZXRBbmREaXNwYXRjaChmYWxzZSksXG4gICAgdG9nZ2xlKCl7XG4gICAgICBzdGF0ZS5leHBhbmRlZCA9ICFzdGF0ZS5leHBhbmRlZDtcbiAgICAgIGRpc3BhdGNoKCk7XG4gICAgfSxcbiAgICByZWZyZXNoKCl7XG4gICAgICBkaXNwYXRjaCgpO1xuICAgIH0sXG4gICAgY2xlYW4oKXtcbiAgICAgIHRhcmdldC5vZmYoKTtcbiAgICB9XG4gIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgICh7ZXhwYW5kS2V5ID0gJ2lzQXJyb3dEb3duJywgY29sbGFwc2VLZXkgPSAnaXNBcnJvd1VwJ30gPSB7fSkgPT5cbiAgKHtlbGVtZW50fSkgPT4ge1xuICAgIGNvbnN0IGV4cGFuZGVyID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbYXJpYS1leHBhbmRlZF0nKTtcbiAgICBjb25zdCBleHBhbmRlZCA9IGV4cGFuZGVyLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpICE9PSAnZmFsc2UnO1xuXG4gICAgY29uc3QgZW1pdHRlciA9IGNyZWF0ZUVtaXR0ZXIoKTtcblxuICAgIGNvbnN0IGV4cGFuZGFibGVDb21wID0gZXhwYW5kYWJsZUZhY3Rvcnkoe2VtaXR0ZXIsIGV4cGFuZGVkfSk7XG4gICAgY29uc3QgZWxlbWVudENvbXAgPSBlbGVtZW50Q29tcG9uZW50KHtlbGVtZW50LCBlbWl0dGVyfSk7XG5cbiAgICBjb25zdCBleHBhbmRhYmxlSWQgPSBleHBhbmRlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnKSB8fCAnJztcbiAgICBjb25zdCBleHBhbmRhYmxlID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKGAjJHtleHBhbmRhYmxlSWR9YCkgfHwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZXhwYW5kYWJsZUlkKTtcblxuICAgIGNvbnN0IGV4cGFuZGVyQ29tcCA9IGVsZW1lbnRDb21wb25lbnQoe2VsZW1lbnQ6IGV4cGFuZGVyLCBlbWl0dGVyOiBjcmVhdGVFbWl0dGVyKCl9KTtcbiAgICBjb25zdCBleHBhbmRlZENvbXAgPSBlbGVtZW50Q29tcG9uZW50KHtlbGVtZW50OiBleHBhbmRhYmxlLCBlbWl0dGVyOiBjcmVhdGVFbWl0dGVyKCl9KTtcblxuICAgIGV4cGFuZGFibGVDb21wLm9uRXhwYW5kZWRDaGFuZ2UoKHtleHBhbmRlZH0pID0+IHtcbiAgICAgIGV4cGFuZGVyQ29tcC5hdHRyKCdhcmlhLWV4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgZXhwYW5kZWRDb21wLmF0dHIoJ2FyaWEtaGlkZGVuJywgIWV4cGFuZGVkKTtcbiAgICB9KTtcblxuICAgIGV4cGFuZGVyQ29tcC5vbmtleWRvd24oKGV2KSA9PiB7XG4gICAgICBpZiAoY2hlY2tLZXlzLmlzRW50ZXIoZXYpIHx8IGNoZWNrS2V5cy5pc1NwYWNlKGV2KSkge1xuICAgICAgICBleHBhbmRhYmxlQ29tcC50b2dnbGUoKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoY29sbGFwc2VLZXkgJiYgY2hlY2tLZXlzW2NvbGxhcHNlS2V5XShldikpIHtcbiAgICAgICAgZXhwYW5kYWJsZUNvbXAuY29sbGFwc2UoKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoZXhwYW5kS2V5ICYmIGNoZWNrS2V5c1tleHBhbmRLZXldKGV2KSkge1xuICAgICAgICBleHBhbmRhYmxlQ29tcC5leHBhbmQoKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGV4cGFuZGVyQ29tcC5vbmNsaWNrKChldikgPT4ge1xuICAgICAgY29uc3Qge2NsaWVudFgsIGNsaWVudFl9ID0gZXY7XG4gICAgICAvLyB0byBkaWZmZXJlbnRpYXRlIGEgY2xpY2sgZ2VuZXJhdGVkIGZyb20gYSBrZXlwcmVzcyBvciBhbiBhY3R1YWwgY2xpY2tcbiAgICAgIC8vIHByZXZlbnREZWZhdWx0IGRvZXMgbm90IHNlZW0gZW5vdWdoIG9uIEZGXG4gICAgICBpZiAoY2xpZW50WCAhPT0gMCAmJiBjbGllbnRZICE9PSAwKSB7XG4gICAgICAgIGV4cGFuZGFibGVDb21wLnRvZ2dsZSgpXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBleHBhbmRhYmxlQ29tcC5yZWZyZXNoKCk7XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgZXhwYW5kYWJsZUNvbXAsIGVsZW1lbnRDb21wLCB7XG4gICAgICBleHBhbmRlcigpe1xuICAgICAgICByZXR1cm4gZXhwYW5kZXJDb21wO1xuICAgICAgfSxcbiAgICAgIGV4cGFuZGFibGUoKXtcbiAgICAgICAgcmV0dXJuIGV4cGFuZGVkQ29tcDtcbiAgICAgIH0sXG4gICAgICBjbGVhbigpe1xuICAgICAgICBlbGVtZW50Q29tcC5jbGVhbigpO1xuICAgICAgICBleHBhbmRlckNvbXAuY2xlYW4oKTtcbiAgICAgICAgZXhwYW5kZWRDb21wLmNsZWFuKCk7XG4gICAgICAgIGV4cGFuZGFibGVDb21wLmNsZWFuKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07IiwiaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ3NtYXJ0LXRhYmxlLWV2ZW50cyc7XG5cbmNvbnN0IHtwcm94eUxpc3RlbmVyLCBlbWl0dGVyOmNyZWF0ZUVtaXR0ZXJ9ID0gZXZlbnRzO1xuXG5jb25zdCBBQ1RJVkVfSVRFTV9DSEFOR0VEID0gJ0FDVElWRV9JVEVNX0NIQU5HRUQnO1xuY29uc3QgcHJveHkgPSBwcm94eUxpc3RlbmVyKHtbQUNUSVZFX0lURU1fQ0hBTkdFRF06ICdvbkFjdGl2ZUl0ZW1DaGFuZ2UnfSk7XG5cbmV4cG9ydCBkZWZhdWx0ICh7ZW1pdHRlciA9IGNyZWF0ZUVtaXR0ZXIoKSwgYWN0aXZlSXRlbSA9IDAsIGl0ZW1Db3VudH0pID0+IHtcbiAgY29uc3Qgc3RhdGUgPSB7YWN0aXZlSXRlbSwgaXRlbUNvdW50fTtcbiAgY29uc3QgZXZlbnQgPSBwcm94eSh7ZW1pdHRlcn0pO1xuICBjb25zdCBkaXNwYXRjaCA9ICgpID0+IGVtaXR0ZXIuZGlzcGF0Y2goQUNUSVZFX0lURU1fQ0hBTkdFRCwgT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUpKTtcbiAgY29uc3QgYXBpID0ge1xuICAgIGFjdGl2YXRlSXRlbShpbmRleCl7XG4gICAgICBzdGF0ZS5hY3RpdmVJdGVtID0gaW5kZXggPCAwID8gaXRlbUNvdW50IC0gMSA6IGluZGV4ICUgaXRlbUNvdW50O1xuICAgICAgZGlzcGF0Y2goKTtcbiAgICB9LFxuICAgIGFjdGl2YXRlTmV4dEl0ZW0oKXtcbiAgICAgIGFwaS5hY3RpdmF0ZUl0ZW0oc3RhdGUuYWN0aXZlSXRlbSArIDEpO1xuICAgIH0sXG4gICAgYWN0aXZhdGVQcmV2aW91c0l0ZW0oKXtcbiAgICAgIGFwaS5hY3RpdmF0ZUl0ZW0oc3RhdGUuYWN0aXZlSXRlbSAtIDEpO1xuICAgIH0sXG4gICAgcmVmcmVzaCgpe1xuICAgICAgZGlzcGF0Y2goKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24oZXZlbnQsIGFwaSk7XG59OyIsImltcG9ydCBlbGVtZW50Q29tcCBmcm9tICcuLi9jb21tb24vZWxlbWVudCc7XG5pbXBvcnQgKiBhcyBjaGVja0tleXMgZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCBjcmVhdGVNZW51SXRlbSA9ICh7cHJldmlvdXNLZXksIG5leHRLZXl9KSA9PlxuICAoe21lbnUsIGVsZW1lbnQsIGluZGV4fSkgPT4ge1xuICAgIGNvbnN0IGNvbXAgPSBlbGVtZW50Q29tcCh7ZWxlbWVudH0pO1xuICAgIGNvbXAuYXR0cigncm9sZScsICdtZW51aXRlbScpO1xuICAgIGNvbXAub25jbGljaygoKSA9PiB7XG4gICAgICBtZW51LmFjdGl2YXRlSXRlbShpbmRleCk7XG4gICAgfSk7XG4gICAgY29tcC5vbmtleWRvd24oKGV2KSA9PiB7XG4gICAgICBpZiAoY2hlY2tLZXlzW25leHRLZXldKGV2KSkge1xuICAgICAgICBtZW51LmFjdGl2YXRlTmV4dEl0ZW0oKTtcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hlY2tLZXlzW3ByZXZpb3VzS2V5XShldikpIHtcbiAgICAgICAgbWVudS5hY3RpdmF0ZVByZXZpb3VzSXRlbSgpO1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgbWVudS5vbkFjdGl2ZUl0ZW1DaGFuZ2UoKHthY3RpdmVJdGVtfSkgPT4ge1xuICAgICAgaWYgKGFjdGl2ZUl0ZW0gPT09IGluZGV4KSB7XG4gICAgICAgIGFjdGl2YXRlZCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVhY3RpdmF0ZWQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGFjdGl2YXRlZCA9ICgpID0+IHtcbiAgICAgIGNvbXAuYXR0cigndGFiaW5kZXgnLCAnMCcpO1xuICAgICAgZWxlbWVudC5mb2N1cygpO1xuICAgIH07XG5cbiAgICBjb25zdCBkZWFjdGl2YXRlZCA9ICgpID0+IHtcbiAgICAgIGNvbXAuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcbiAgICB9O1xuICAgIHJldHVybiBjb21wO1xuICB9O1xuXG5cbmV4cG9ydCBjb25zdCB2ZXJ0aWNhbE1lbnVJdGVtID0gY3JlYXRlTWVudUl0ZW0oe3ByZXZpb3VzS2V5OiAnaXNBcnJvd1VwJywgbmV4dEtleTogJ2lzQXJyb3dEb3duJ30pO1xuZXhwb3J0IGNvbnN0IGhvcml6b250YWxNZW51SXRlbSA9IGNyZWF0ZU1lbnVJdGVtKHtwcmV2aW91c0tleTogJ2lzQXJyb3dMZWZ0JywgbmV4dEtleTogJ2lzQXJyb3dSaWdodCd9KTsiLCJpbXBvcnQgaXRlbUxpc3QgZnJvbSAnLi4vY29tbW9uL3NpbmdsZUFjdGl2ZUl0ZW1MaXN0JztcbmltcG9ydCB7dmVydGljYWxNZW51SXRlbX0gZnJvbSAnLi9tZW51SXRlbSdcbmltcG9ydCBlbGVtZW50RmFjdG9yeSBmcm9tICcuLi9jb21tb24vZWxlbWVudCc7XG5pbXBvcnQge2VtaXR0ZXIgYXMgY3JlYXRlRW1pdHRlcn0gZnJvbSAnc21hcnQtdGFibGUtZXZlbnRzJztcblxuZXhwb3J0IGRlZmF1bHQgKG1lbnVJdGVtRmFjdG9yeSA9IHZlcnRpY2FsTWVudUl0ZW0pID0+XG4gICh7ZWxlbWVudH0pID0+IHtcbiAgICBjb25zdCBlbWl0dGVyID0gY3JlYXRlRW1pdHRlcigpO1xuICAgIGNvbnN0IG1lbnVJdGVtcyA9IEFycmF5LmZyb20oZWxlbWVudC5jaGlsZHJlbikuZmlsdGVyKGNoaWxkID0+IGNoaWxkLmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnbWVudWl0ZW0nKTtcbiAgICBjb25zdCBsaXN0Q29tcCA9IGl0ZW1MaXN0KHtlbWl0dGVyLCBpdGVtQ291bnQ6IG1lbnVJdGVtcy5sZW5ndGh9KTtcbiAgICBjb25zdCBtZW51Q29tcCA9IGVsZW1lbnRGYWN0b3J5KHtlbGVtZW50LCBlbWl0dGVyfSk7XG5cbiAgICBtZW51Q29tcC5hdHRyKCdyb2xlJywgJ21lbnUnKTtcblxuICAgIGNvbnN0IG1lbnVJdGVtQ29tcHMgPSBtZW51SXRlbXMubWFwKChlbGVtZW50LCBpbmRleCkgPT4gbWVudUl0ZW1GYWN0b3J5KHttZW51OiBsaXN0Q29tcCwgZWxlbWVudCwgaW5kZXh9KSk7XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgbGlzdENvbXAsIG1lbnVDb21wLCB7XG4gICAgICBpdGVtKGluZGV4KXtcbiAgICAgICAgcmV0dXJuIG1lbnVJdGVtQ29tcHNbaW5kZXhdO1xuICAgICAgfSxcbiAgICAgIGNsZWFuKCl7XG4gICAgICAgIGxpc3RDb21wLm9mZigpO1xuICAgICAgICBtZW51Q29tcC5jbGVhbigpO1xuICAgICAgICBtZW51SXRlbUNvbXBzLmZvckVhY2goY29tcCA9PiB7XG4gICAgICAgICAgY29tcC5jbGVhbigpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcblxuIiwiaW1wb3J0IG1lbnUgZnJvbSAnLi4vbWVudS9tZW51JztcbmltcG9ydCBleHBhbmRhYmxlRmFjdG9yeSBmcm9tICcuLi9leHBhbmRhYmxlL2V4cGFuZGFibGUnO1xuaW1wb3J0IHtpc0VzY2FwZX0gZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCB2ZXJ0aWNhbE1lbnUgPSBtZW51KCk7XG5jb25zdCBleHBhbmRhYmxlID0gZXhwYW5kYWJsZUZhY3RvcnkoKTtcblxuZXhwb3J0IGRlZmF1bHQgKHtlbGVtZW50fSkgPT4ge1xuICBjb25zdCBleHBhbmRhYmxlQ29tcCA9IGV4cGFuZGFibGUoe2VsZW1lbnR9KTtcbiAgZXhwYW5kYWJsZUNvbXAuZXhwYW5kZXIoKS5hdHRyKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcbiAgY29uc3QgbWVudUNvbXAgPSB2ZXJ0aWNhbE1lbnUoe2VsZW1lbnQ6IGV4cGFuZGFibGVDb21wLmV4cGFuZGFibGUoKS5lbGVtZW50KCl9KTtcblxuICBleHBhbmRhYmxlQ29tcC5vbkV4cGFuZGVkQ2hhbmdlKCh7ZXhwYW5kZWR9KSA9PiB7XG4gICAgaWYgKGV4cGFuZGVkKSB7XG4gICAgICBtZW51Q29tcC5hY3RpdmF0ZUl0ZW0oMCk7XG4gICAgfVxuICB9KTtcblxuICBtZW51Q29tcC5vbmtleWRvd24oZXYgPT4ge1xuICAgIGlmIChpc0VzY2FwZShldikpIHtcbiAgICAgIGV4cGFuZGFibGVDb21wLmNvbGxhcHNlKCk7XG4gICAgICBleHBhbmRhYmxlQ29tcC5leHBhbmRlcigpLmVsZW1lbnQoKS5mb2N1cygpO1xuICAgIH1cbiAgfSk7XG5cbiAgZXhwYW5kYWJsZUNvbXAucmVmcmVzaCgpO1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBleHBhbmRhYmxlQ29tcCwge1xuICAgIG1lbnUoKXtcbiAgICAgIHJldHVybiBtZW51Q29tcDtcbiAgICB9LFxuICAgIGNsZWFuKCl7XG4gICAgICBleHBhbmRhYmxlQ29tcC5jbGVhbigpO1xuICAgICAgbWVudUNvbXAuY2xlYW4oKTtcbiAgICB9XG4gIH0pO1xufTsiLCJpbXBvcnQgbWVudUZhY3RvcnkgZnJvbSAnLi9tZW51JztcbmltcG9ydCBkcm9wZG93biBmcm9tICcuLi9kcm9wZG93bi9kcm9wZG93bic7XG5pbXBvcnQge2hvcml6b250YWxNZW51SXRlbX0gZnJvbSAnLi9tZW51SXRlbSc7XG5cbmNvbnN0IGhvcml6b250YWxNZW51ID0gbWVudUZhY3RvcnkoaG9yaXpvbnRhbE1lbnVJdGVtKTtcblxuXG5jb25zdCByZWd1bGFyU3ViTWVudSA9ICh7aW5kZXgsIG1lbnV9KSA9PiBtZW51Lml0ZW0oaW5kZXgpO1xuXG5jb25zdCBkcm9wRG93blN1Yk1lbnUgPSAoe2luZGV4LCBlbGVtZW50LCBtZW51fSkgPT4ge1xuICBjb25zdCBzdWJNZW51Q29tcCA9IGRyb3Bkb3duKHtlbGVtZW50fSk7XG4gIG1lbnUub25BY3RpdmVJdGVtQ2hhbmdlKCh7YWN0aXZlSXRlbX0pID0+IHtcbiAgICBpZiAoYWN0aXZlSXRlbSAhPT0gaW5kZXgpIHtcbiAgICAgIHN1Yk1lbnVDb21wLmV4cGFuZGVyKCkuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcbiAgICAgIHN1Yk1lbnVDb21wLmNvbGxhcHNlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1Yk1lbnVDb21wLmF0dHIoJ3RhYmluZGV4JywgJy0xJyk7XG4gICAgICBzdWJNZW51Q29tcC5leHBhbmRlcigpLmF0dHIoJ3RhYmluZGV4JywgJzAnKTtcbiAgICAgIHN1Yk1lbnVDb21wLmV4cGFuZGVyKCkuZWxlbWVudCgpLmZvY3VzKCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHN1Yk1lbnVDb21wO1xufTtcblxuY29uc3QgY3JlYXRlU3ViTWVudUNvbXBvbmVudCA9IChhcmcpID0+IHtcbiAgY29uc3Qge2VsZW1lbnR9ID1hcmc7XG4gIHJldHVybiBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPW1lbnVdJykgIT09IG51bGwgP1xuICAgIGRyb3BEb3duU3ViTWVudShhcmcpIDpcbiAgICByZWd1bGFyU3ViTWVudShhcmcpO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgICh7ZWxlbWVudH0pID0+IHtcbiAgY29uc3QgbWVudWJhckNvbXAgPSBob3Jpem9udGFsTWVudSh7ZWxlbWVudH0pO1xuICBtZW51YmFyQ29tcC5hdHRyKCdyb2xlJywgJ21lbnViYXInKTtcbiAgY29uc3Qgc3ViTWVudXMgPSBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGRyZW4pLm1hcCgoZWxlbWVudCwgaW5kZXgpID0+IGNyZWF0ZVN1Yk1lbnVDb21wb25lbnQoe1xuICAgIGluZGV4LFxuICAgIGVsZW1lbnQsXG4gICAgbWVudTogbWVudWJhckNvbXBcbiAgfSkpO1xuXG4gIG1lbnViYXJDb21wLnJlZnJlc2goKTtcblxuICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgbWVudWJhckNvbXAsIHtcbiAgICBpdGVtKGluZGV4KXtcbiAgICAgIHJldHVybiBzdWJNZW51c1tpbmRleF07XG4gICAgfSxcbiAgICBjbGVhbigpe1xuICAgICAgbWVudWJhckNvbXAuY2xlYW4oKTtcbiAgICAgIHN1Yk1lbnVzLmZvckVhY2goc20gPT4gc20uY2xlYW4oKSk7XG4gICAgfVxuICB9KTtcbn07IiwiaW1wb3J0IGVsZW1lbnRGYWN0b3J5IGZyb20gJy4uL2NvbW1vbi9lbGVtZW50JztcbmltcG9ydCBpdGVtTGlzdCBmcm9tICcuLi9jb21tb24vc2luZ2xlQWN0aXZlSXRlbUxpc3QnO1xuaW1wb3J0IHtlbWl0dGVyIGFzIGNyZWF0ZUVtaXR0ZXJ9IGZyb20gJ3NtYXJ0LXRhYmxlLWV2ZW50cyc7XG5pbXBvcnQgZXhwYW5kYWJsZUZhY3RvcnkgZnJvbSAnLi4vZXhwYW5kYWJsZS9leHBhbmRhYmxlJztcbmltcG9ydCB7aXNBcnJvd0Rvd24sIGlzQXJyb3dVcH0gZnJvbSAnLi4vY29tbW9uL3V0aWwnO1xuXG5jb25zdCBleHBhbmRhYmxlID0gZXhwYW5kYWJsZUZhY3Rvcnkoe2V4cGFuZEtleTogJycsIGNvbGxhcHNlS2V5OiAnJ30pO1xuXG5leHBvcnQgZGVmYXVsdCAoe2VsZW1lbnR9KSA9PiB7XG4gIGNvbnN0IGVtaXR0ZXIgPSBjcmVhdGVFbWl0dGVyKCk7XG4gIGNvbnN0IGFjY29yZGlvbkhlYWRlcnMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWxydGlzdGUtYWNjb3JkaW9uLWhlYWRlcl0nKTtcbiAgY29uc3QgaXRlbUxpc3RDb21wID0gaXRlbUxpc3Qoe2l0ZW1Db3VudDogYWNjb3JkaW9uSGVhZGVycy5sZW5ndGh9KTtcbiAgY29uc3QgY29udGFpbmVyQ29tcCA9IGVsZW1lbnRGYWN0b3J5KHtlbGVtZW50LCBlbWl0dGVyfSk7XG5cbiAgY29uc3QgZXhwYW5kYWJsZXMgPSBbLi4uYWNjb3JkaW9uSGVhZGVyc10ubWFwKGVsZW1lbnQgPT4gZXhwYW5kYWJsZSh7ZWxlbWVudH0pKTtcblxuICBleHBhbmRhYmxlcy5mb3JFYWNoKChleHAsIGluZGV4KSA9PiB7XG4gICAgLy8gbGV0IGV4cGFuZGVkXG4gICAgY29uc3QgZXhwYW5kZXIgPSBleHAuZXhwYW5kZXIoKTtcbiAgICBleHBhbmRlci5vbmtleWRvd24oZXYgPT4ge1xuICAgICAgaWYgKGlzQXJyb3dEb3duKGV2KSkge1xuICAgICAgICBpdGVtTGlzdENvbXAuYWN0aXZhdGVOZXh0SXRlbSgpO1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfSBlbHNlIGlmIChpc0Fycm93VXAoZXYpKSB7XG4gICAgICAgIGl0ZW1MaXN0Q29tcC5hY3RpdmF0ZVByZXZpb3VzSXRlbSgpO1xuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZXhwYW5kZXIub25mb2N1cyhfID0+IHtcbiAgICAgIGl0ZW1MaXN0Q29tcC5hY3RpdmF0ZUl0ZW0oaW5kZXgpO1xuICAgIH0pO1xuXG4gICAgaXRlbUxpc3RDb21wLm9uQWN0aXZlSXRlbUNoYW5nZSgoe2FjdGl2ZUl0ZW19KSA9PiB7XG4gICAgICBpZiAoYWN0aXZlSXRlbSA9PT0gaW5kZXgpIHtcbiAgICAgICAgZXhwLmV4cGFuZGVyKCkuZWxlbWVudCgpLmZvY3VzKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBpdGVtTGlzdENvbXAsIGNvbnRhaW5lckNvbXAsIHtcbiAgICBzZWN0aW9uKGluZGV4KXtcbiAgICAgIHJldHVybiBleHBhbmRhYmxlc1tpbmRleF1cbiAgICB9LFxuICAgIGNsZWFuKCl7XG4gICAgICBpdGVtTGlzdENvbXAub2ZmKCk7XG4gICAgICBjb250YWluZXJDb21wLmNsZWFuKCk7XG4gICAgICBleHBhbmRhYmxlcy5mb3JFYWNoKGl0ZW0gPT4gaXRlbS5jbGVhbigpKTtcbiAgICB9XG4gIH0pO1xufTsiLCJpbXBvcnQgZXhwYW5kYWJsZUZhY3RvcnkgZnJvbSAnLi9leHBhbmRhYmxlL2V4cGFuZGFibGUnO1xuaW1wb3J0IHRhYmxpc3RGYWN0b3J5IGZyb20gJy4vdGFibGlzdC90YWJsaXN0JztcbmltcG9ydCBkcm9wZG93bkZhY3RvcnkgZnJvbSAnLi9kcm9wZG93bi9kcm9wZG93bic7XG5pbXBvcnQgbWVudWJhckZhY3RvcnkgZnJvbSAnLi9tZW51L21lbnViYXInO1xuaW1wb3J0IGFjY29yZGlvbkZhY3RvcnkgZnJvbSAnLi9hY2NvcmRpb24vYWNjb3JkaW9uJztcbmltcG9ydCBlbGVtZW50RmFjdG9yeSBmcm9tICcuL2NvbW1vbi9lbGVtZW50JztcblxuZXhwb3J0IGNvbnN0IGV4cGFuZGFibGUgPSBleHBhbmRhYmxlRmFjdG9yeSgpO1xuZXhwb3J0IGNvbnN0IGRyb3Bkb3duID0gZHJvcGRvd25GYWN0b3J5O1xuZXhwb3J0IGNvbnN0IHRhYmxpc3QgPSB0YWJsaXN0RmFjdG9yeTtcbmV4cG9ydCBjb25zdCBtZW51YmFyID0gbWVudWJhckZhY3Rvcnk7XG5leHBvcnQgY29uc3QgYWNjb3JkaW9uID0gYWNjb3JkaW9uRmFjdG9yeTtcbmV4cG9ydCBjb25zdCBlbGVtZW50ID0gZWxlbWVudEZhY3Rvcnk7IiwiaW1wb3J0IHtoLCBvbk1vdW50LCBvblVwZGF0ZSwgb25Vbk1vdW50fSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge2Ryb3Bkb3dufSBmcm9tICdscnRpc3RlJztcblxuY29uc3QgZHJvcGRvd25pZnkgPSBDb21wID0+IHtcbiAgbGV0IGRkO1xuXG4gIGNvbnN0IG1vdW50ID0gb25Nb3VudCh2bm9kZSA9PiB7XG4gICAgZGQgPSBkcm9wZG93bih7ZWxlbWVudDogdm5vZGUuZG9tfSk7XG4gIH0pO1xuXG4gIGNvbnN0IG9udXBkYXRlID0gb25VcGRhdGUobiA9PiB7XG4gICAgaWYgKGRkKSB7XG4gICAgICBkZC5jbGVhbigpXG4gICAgfVxuICAgIGRkID0gZHJvcGRvd24oe2VsZW1lbnQ6IG4uZG9tfSk7XG4gICAgZGQuY29sbGFwc2UoKTtcbiAgfSk7XG5cbiAgY29uc3QgdW5tb3VudCA9IG9uVW5Nb3VudChfID0+IGRkLmNsZWFuKCkpO1xuXG4gIHJldHVybiB1bm1vdW50KG1vdW50KG9udXBkYXRlKENvbXApKSk7XG59O1xuXG5leHBvcnQgY29uc3QgRHJvcGRvd24gPSBkcm9wZG93bmlmeShwcm9wcyA9PiB7XG4gIGNvbnN0IHtjaGlsZHJlbn0gPXByb3BzO1xuICBkZWxldGUgcHJvcHMuY2hpbGRyZW47XG4gIHJldHVybiA8ZGl2IGNsYXNzPVwiZHJvcGRvd25cIiB7Li4ucHJvcHN9PlxuICAgIHtjaGlsZHJlbn1cbiAgPC9kaXY+XG59KTtcblxuZXhwb3J0IGNvbnN0IE1lbnVCdXR0b24gPSBwcm9wcyA9PiB7XG4gIGNvbnN0IHtjaGlsZHJlbn0gPXByb3BzO1xuICBkZWxldGUgcHJvcHMuY2hpbGRyZW47XG4gIHJldHVybiA8YnV0dG9uIGFyaWEtaGFzcG9wdXA9XCJ0cnVlXCIgYXJpYS1leHBhbmRlZD1cImZhbHNlXCIgdHlwZT1cImJ1dHRvblwiIHsuLi5wcm9wc30+XG4gICAge2NoaWxkcmVufVxuICA8L2J1dHRvbj5cbn07XG5cbmV4cG9ydCBjb25zdCBNZW51ID0gcHJvcHMgPT4ge1xuICBjb25zdCB7Y2hpbGRyZW59ID1wcm9wcztcbiAgZGVsZXRlIHByb3BzLmNoaWxkcmVuO1xuICByZXR1cm4gPHVsIHJvbGU9XCJtZW51XCIgey4uLnByb3BzfT5cbiAgICB7Y2hpbGRyZW59XG4gIDwvdWw+XG59O1xuXG5leHBvcnQgY29uc3QgTWVudUl0ZW0gPSBwcm9wcyA9PiB7XG4gIGNvbnN0IHtjaGlsZHJlbiwgYWN0aXZhdGVJdGVtfSA9IHByb3BzO1xuICBjb25zdCBvbktleURvd24gPSBldiA9PiB7XG4gICAgY29uc3Qge2NvZGV9ID0gZXY7XG4gICAgaWYgKGNvZGUgPT09ICdFbnRlcicgfHwgY29kZSA9PT0gJ1NwYWNlJykge1xuICAgICAgYWN0aXZhdGVJdGVtKCk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IG9uQ2xpY2sgPSBfID0+IHtcbiAgICBhY3RpdmF0ZUl0ZW0oKTtcbiAgfTtcblxuICBkZWxldGUgcHJvcHMuY2hpbGRyZW47XG4gIHJldHVybiA8bGkgb25LZXlEb3duPXtvbktleURvd259IG9uQ2xpY2s9e29uQ2xpY2t9IHJvbGU9XCJtZW51aXRlbVwiPlxuICAgIHtjaGlsZHJlbn1cbiAgPC9saT5cbn07IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge0Ryb3Bkb3duLCBNZW51QnV0dG9uLCBNZW51LCBNZW51SXRlbX0gZnJvbSAnLi4vdWkta2l0L2Ryb3Bkb3duJ1xuaW1wb3J0IHtCdWJibGVzLCBOb3RpZmljYXRpb24sIFNvcnRBbW91bnRBc2N9IGZyb20gJy4uL2NvbXBvbmVudHMvaWNvbnMnO1xuXG5leHBvcnQgY29uc3QgSXNzdWVDYXJkID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtpc3N1ZSA9IHt9fSA9IHByb3BzO1xuICBjb25zdCB7c3RhdGUsIGNyZWF0ZWRfYXQsIHVzZXIsIG51bWJlciwgaHRtbF91cmwsIHRpdGxlLCBjb21tZW50c30gPSBpc3N1ZTtcbiAgY29uc3QgY2xhc3NlcyA9IHN0YXRlID09PSAnb3BlbicgPyBbJ3ZhbGlkJ10gOiBbJ2ludmFsaWQnXTtcbiAgcmV0dXJuIDxhcnRpY2xlIGNsYXNzPVwiaXNzdWVcIj5cbiAgICA8aDM+e3RpdGxlfTwvaDM+XG4gICAgPGEgcmVsPVwic2VsZlwiIGhyZWY9e2h0bWxfdXJsfT4je251bWJlcn08L2E+XG4gICAgPGRpdiBjbGFzcz1cInN0YXR1c1wiPlxuICAgICAgPE5vdGlmaWNhdGlvbiBjbGFzc2VzPXtjbGFzc2VzfS8+XG4gICAgICA8c3BhbiBjbGFzcz17Y2xhc3Nlcy5qb2luKCcnKX0+e3N0YXRlfTwvc3Bhbj5cbiAgICA8L2Rpdj5cbiAgICA8cCBjbGFzcz1cIm1ldGFcIj5vcGVuZWQgb25cbiAgICAgIDx0aW1lPiB7KG5ldyBEYXRlKGNyZWF0ZWRfYXQpKS50b0RhdGVTdHJpbmcoKX0gPC90aW1lPlxuICAgICAgYnkgPGEgcmVsPVwiYXV0aG9yXCIgaHJlZj17dXNlci5odG1sX3VybH0+e3VzZXIubG9naW59PC9hPlxuICAgIDwvcD5cbiAgICA8cCBjbGFzcz1cImNvbW1lbnRzXCI+XG4gICAgICA8QnViYmxlcy8+XG4gICAgICA8c3Bhbj57Y29tbWVudHN9PC9zcGFuPlxuICAgIDwvcD5cbiAgPC9hcnRpY2xlPlxufTtcblxuLy90b2RvIGdlbmVyYXRlIGlkIGZvciBkcm9wZG93bnNcbmV4cG9ydCBjb25zdCBJc3N1ZXNMaXN0ID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtpc3N1ZXMgPSBbXSwgc21hcnRMaXN0LCBzaG93VG9vbEJhcn0gPSBwcm9wcztcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzPVwiaXNzdWVzLWxpc3QtY29udGFpbmVyXCI+XG4gICAgICA8ZGl2IGFyaWEtaGlkZGVuPXtTdHJpbmcoc2hvd1Rvb2xCYXIgIT09IHRydWUpfSByb2xlPVwidG9vbGJhclwiPlxuICAgICAgICA8RHJvcGRvd24gaWQ9XCJkcm9wZG93bi1zYW1wbGVcIj5cbiAgICAgICAgICA8TWVudUJ1dHRvbiBhcmlhLWNvbnRyb2xzPVwibWVudVwiPjxTb3J0QW1vdW50QXNjLz48L01lbnVCdXR0b24+XG4gICAgICAgICAgPE1lbnUgaWQ9XCJtZW51XCI+XG4gICAgICAgICAgICA8TWVudUl0ZW0gYWN0aXZhdGVJdGVtPXtfID0+IHNtYXJ0TGlzdC5zb3J0KHtwb2ludGVyOiAnY3JlYXRlZF9hdCcsIGRpcmVjdGlvbjogJ2Rlc2MnfSkgfT4gTmV3ZXN0PC9NZW51SXRlbT5cbiAgICAgICAgICAgIDxNZW51SXRlbSBhY3RpdmF0ZUl0ZW09e18gPT4gc21hcnRMaXN0LnNvcnQoe3BvaW50ZXI6ICdjcmVhdGVkX2F0JywgZGlyZWN0aW9uOiAnYXNjJ30pIH0+T2xkZXN0PC9NZW51SXRlbT5cbiAgICAgICAgICAgIDxNZW51SXRlbSBhY3RpdmF0ZUl0ZW09e18gPT4gc21hcnRMaXN0LnNvcnQoe3BvaW50ZXI6ICdjb21tZW50cycsIGRpcmVjdGlvbjogJ2Rlc2MnfSkgfT5Nb3N0XG4gICAgICAgICAgICAgIGNvbW1lbnRlZDwvTWVudUl0ZW0+XG4gICAgICAgICAgICA8TWVudUl0ZW0gYWN0aXZhdGVJdGVtPXtfID0+IHNtYXJ0TGlzdC5zb3J0KHtwb2ludGVyOiAnY29tbWVudHMnLCBkaXJlY3Rpb246ICdhc2MnfSkgfT5MZWFzdFxuICAgICAgICAgICAgICBjb21tZW50ZWQ8L01lbnVJdGVtPlxuICAgICAgICAgICAgPE1lbnVJdGVtIGFjdGl2YXRlSXRlbT17XyA9PiBzbWFydExpc3Quc29ydCh7cG9pbnRlcjogJ3VwZGF0ZWRfYXQnLCBkaXJlY3Rpb246ICdkZXNjJ30pIH0+UmVjZW50bHlcbiAgICAgICAgICAgICAgdXBkYXRlZDwvTWVudUl0ZW0+XG4gICAgICAgICAgICA8TWVudUl0ZW0gYWN0aXZhdGVJdGVtPXtfID0+IHNtYXJ0TGlzdC5zb3J0KHtwb2ludGVyOiAndXBkYXRlZF9hdCcsIGRpcmVjdGlvbjogJ2FzYyd9KSB9PkxlYXN0IHJlY2VudGx5XG4gICAgICAgICAgICAgIHVwZGF0ZWQ8L01lbnVJdGVtPlxuICAgICAgICAgIDwvTWVudT5cbiAgICAgICAgPC9Ecm9wZG93bj5cbiAgICAgIDwvZGl2PlxuICAgICAgPHVsIGNsYXNzPVwiaXNzdWVzLWxpc3RcIj5cbiAgICAgICAge1xuICAgICAgICAgIGlzc3Vlcy5tYXAoaSA9PiA8bGk+PElzc3VlQ2FyZCBpc3N1ZT17aX0vPjwvbGk+KVxuICAgICAgICB9XG4gICAgICA8L3VsPlxuICAgICAgPGRpdiBjbGFzcz1cImZha2UtYm9yZGVyXCI+PC9kaXY+XG4gICAgPC9kaXY+KTtcbn07IiwiaW1wb3J0IHtJc3N1ZXNMaXN0fSBmcm9tICcuLi92aWV3cy9Jc3N1ZXMnXG5pbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcblxuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMpID0+IHtcbiAgY29uc3Qge3NtYXJ0TGlzdCwgaXRlbXMgPVtdLCBkYXRhPXt9fSA9IHByb3BzO1xuICBjb25zdCB7c2hvd1Rvb2xCYXJ9ID0gZGF0YTtcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzPVwiaXNzdWVzLWNvbnRhaW5lclwiPlxuICAgICAgPElzc3Vlc0xpc3Qgc2hvd1Rvb2xCYXI9e3Nob3dUb29sQmFyfSBzbWFydExpc3Q9e3NtYXJ0TGlzdH0gaXNzdWVzPXtpdGVtcy5tYXAoaSA9PiBpLnZhbHVlKX0vPlxuICAgIDwvZGl2Pik7XG5cbn0iLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcbmltcG9ydCBMaXN0RGF0YVBhbmVsIGZyb20gJy4uL3ZpZXdzL0xpc3REYXRhUGFuZWwnO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IFNtYXJ0SXNzdWVzTGlzdCBmcm9tICcuL1NtYXJ0SXNzdWVMaXN0JztcblxuLy90b2RvXG5jb25zdCBEdW1teUxpc3QgPSAoKSA9PiA8ZGl2PlxuICA8cD5FcnJvcjogbGlzdCB0eXBlIG5vdCBzdXBwb3J0ZWQ8L3A+XG48L2Rpdj47XG5cblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUoKChwcm9wcywgc2VydmljZXMpID0+IHtcbiAgY29uc3Qge2dyaWQsIHNtYXJ0TGlzdHMsIGNvbm5lY3QsIGFjdGlvbnN9ID0gc2VydmljZXM7XG4gIGNvbnN0IHt4LCB5LCBvblJlc2l6ZVN0YXJ0LCBvbk1vdmVTdGFydH0gPSBwcm9wcztcbiAgY29uc3QgcGFuZWxEYXRhID0gZ3JpZC5nZXREYXRhKHgsIHkpO1xuICBjb25zdCBzbWFydExpc3QgPSBzbWFydExpc3RzLmZpbmRPckNyZWF0ZSh4LCB5KTtcbiAgY29uc3QgY29ubmVjdEZ1bmMgPSBjb25uZWN0KHN0YXRlID0+IHN0YXRlLnNtYXJ0TGlzdC5maW5kKHNsID0+IHNsLnggPT09IHggJiYgc2wueSA9PT0geSkpO1xuXG4gIGNvbnN0IFNtYXJ0TGlzdENvbXBvbmVudCA9IGNvbm5lY3RGdW5jKChwcm9wcykgPT4gZ2V0TGlzdENvbXBvbmVudChwYW5lbERhdGEuZGF0YS5zb3VyY2UpKHByb3BzLCBzZXJ2aWNlcykpO1xuXG4gIGNvbnN0IGNsaWNrUmVzZXQgPSBfID0+IHtcbiAgICBhY3Rpb25zLm9wZW5Nb2RhbCh7XG4gICAgICBtb2RhbFR5cGU6ICdhc2tDb25maXJtYXRpb24nLFxuICAgICAgbWVzc2FnZTogYFlvdSBhcmUgYWJvdXQgdG8gbG9zZSB0aGUgZGF0YSByZWxhdGVkIHRvIHRoZSBwYW5lbCBcIiR7cGFuZWxEYXRhLmRhdGEudGl0bGV9XCIuIEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBwcm9jZWVkID9gLFxuICAgICAgZXhlY3V0ZUFjdGlvbjogKCkgPT4ge1xuICAgICAgICBhY3Rpb25zLnJlc2V0UGFuZWwoe3gsIHl9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcblxuICBjb25zdCBjbGlja0VkaXQgPSBfID0+IHtcbiAgICBhY3Rpb25zLmVkaXRQYW5lbCh7eCwgeX0pO1xuICAgIHNtYXJ0TGlzdC5yZW1vdmUoKTtcbiAgfTtcblxuICBjb25zdCBjbGlja1RvZ2dsZVRvb2xCYXIgPSBfID0+IHtcbiAgICBjb25zdCB7ZGF0YSA9IHt9fSA9IHBhbmVsRGF0YTtcbiAgICBhY3Rpb25zLnVwZGF0ZVBhbmVsRGF0YSh7XG4gICAgICB4LCB5LCBkYXRhOiBPYmplY3QuYXNzaWduKHt9LCBkYXRhLCB7XG4gICAgICAgIHNob3dUb29sQmFyOiAhZGF0YS5zaG93VG9vbEJhclxuICAgICAgfSlcbiAgICB9KTtcbiAgfTtcblxuICByZXR1cm4gKDxMaXN0RGF0YVBhbmVsIG9uVG9nZ2xlVG9vbEJhcj17Y2xpY2tUb2dnbGVUb29sQmFyfSBvbkVkaXQ9e2NsaWNrRWRpdH0gb25SZXNldD17Y2xpY2tSZXNldH1cbiAgICAgICAgICAgICAgICAgICAgICAgICBvbk1vdmVTdGFydD17b25Nb3ZlU3RhcnR9XG4gICAgICAgICAgICAgICAgICAgICAgICAgb25SZXNpemVTdGFydD17b25SZXNpemVTdGFydH0gey4uLnBhbmVsRGF0YX0gPlxuICAgIDxTbWFydExpc3RDb21wb25lbnQgey4uLnBhbmVsRGF0YX0gc21hcnRMaXN0PXtzbWFydExpc3R9IHg9e3h9IHk9e3l9Lz5cbiAgPC9MaXN0RGF0YVBhbmVsPik7XG59KSk7XG5cbmNvbnN0IGdldExpc3RDb21wb25lbnQgPSAoc291cmNlKSA9PiB7XG4gIHN3aXRjaCAoc291cmNlKSB7XG4gICAgY2FzZSAnaXNzdWVzJzpcbiAgICAgIHJldHVybiBTbWFydElzc3Vlc0xpc3Q7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBEdW1teUxpc3Q7XG4gIH1cbn07IiwiaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge0VxdWFsaXplciwgQmluMiwgV3JlbmNofSBmcm9tICcuLi9jb21wb25lbnRzL2ljb25zJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUocHJvcHMgPT4ge1xuICBjb25zdCB7ZGF0YSA9IHt9LCBvblJlc2V0LCBvbkVkaXQsIG9uVG9nZ2xlVG9vbEJhcn0gPSBwcm9wcztcbiAgY29uc3Qge3Byb2Nlc3NpbmcgPSBmYWxzZX0gPSBkYXRhO1xuICBjb25zdCBzaG93VG9vbGJhciA9IFN0cmluZyhkYXRhLnNob3dUb29sQmFyID09PSB0cnVlKTtcbiAgLy90b2RvIGFyaWEtY29udHJvbHNcbiAgcmV0dXJuICg8ZGl2IGNsYXNzPVwicGFuZWwtY29udGVudFwiPlxuICAgIDxoZWFkZXIgY2xhc3M9XCJwYW5lbC1oZWFkZXJcIj5cbiAgICAgIDxoMj57ZGF0YS50aXRsZX08L2gyPlxuICAgICAgPGJ1dHRvbiBhcmlhLWhhc3BvcHVwPVwidHJ1ZVwiIGFyaWEtcHJlc3NlZD17c2hvd1Rvb2xiYXJ9IGFyaWEtZXhwYW5kZWQ9e3Nob3dUb29sYmFyfSBvbkNsaWNrPXtvblRvZ2dsZVRvb2xCYXJ9PjxXcmVuY2gvPjwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtvbkVkaXR9PjxFcXVhbGl6ZXIvPjwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtvblJlc2V0fT48QmluMi8+XG4gICAgICA8L2J1dHRvbj5cbiAgICA8L2hlYWRlcj5cbiAgICA8ZGl2IGNsYXNzPVwicGFuZWwtYm9keVwiPlxuICAgICAgPGRpdiBhcmlhLWhpZGRlbj17U3RyaW5nKCFwcm9jZXNzaW5nKX0gY2xhc3M9XCJwcm9jZXNzaW5nLW92ZXJsYXlcIj5cbiAgICAgICAgUHJvY2Vzc2luZyAuLi5cbiAgICAgIDwvZGl2PlxuICAgICAge3Byb3BzLmNoaWxkcmVufVxuICAgIDwvZGl2PlxuICA8L2Rpdj4pO1xufSk7IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgQ2hhcnREYXRhUGFuZWwgZnJvbSAnLi4vdmlld3MvQ2hhcnREYXRhUGFuZWwnO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuXG5leHBvcnQgZGVmYXVsdCBmbGV4aWJsZSgocHJvcHMsIHtncmlkfSkgPT4ge1xuICBjb25zdCB7eCwgeSwgb25SZXNpemVTdGFydCwgb25Nb3ZlU3RhcnR9ID0gcHJvcHM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgcmV0dXJuIDxDaGFydERhdGFQYW5lbCBvbk1vdmVTdGFydD17b25Nb3ZlU3RhcnR9IG9uUmVzaXplU3RhcnQ9e29uUmVzaXplU3RhcnR9IHsuLi5wYW5lbERhdGF9Lz5cbn0pOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEVtcHR5RGF0YVBhbmVsIGZyb20gJy4vRW1wdHlEYXRhUGFuZWwnO1xuaW1wb3J0IExpc3REYXRhUGFuZWwgZnJvbSAnLi9MaXN0RGF0YVBhbmVsJztcbmltcG9ydCBDaGFydERhdGFQYW5lbCBmcm9tICcuL0NoYXJ0RGF0YVBhbmVsJztcblxuY29uc3QgZ2V0RGF0YVBhbmVsID0gKHR5cGUpID0+IHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnY2hhcnQnOlxuICAgICAgcmV0dXJuIENoYXJ0RGF0YVBhbmVsO1xuICAgIGNhc2UgJ2xpc3QnOlxuICAgICAgcmV0dXJuIExpc3REYXRhUGFuZWw7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBFbXB0eURhdGFQYW5lbDtcbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzLCBzZXJ2aWNlcykgPT4ge1xuICBjb25zdCB7eCwgeX0gPSBwcm9wcztcbiAgY29uc3Qge2dyaWR9ID0gc2VydmljZXM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgY29uc3Qge2RhdGEgPSB7fX09cGFuZWxEYXRhO1xuICBjb25zdCBQYW5lbCA9IGdldERhdGFQYW5lbChkYXRhLnR5cGUpO1xuICByZXR1cm4gUGFuZWwocHJvcHMsIHNlcnZpY2VzKTtcbn07IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQge0Nyb3NzfSBmcm9tICcuLi9jb21wb25lbnRzL2ljb25zJztcblxuY29uc3QgbW9kYWwgPSBDb21wID0+IHByb3BzID0+IHtcbiAgY29uc3Qge2lzT3BlbiwgY2xvc2VNb2RhbCwgdGl0bGV9ID0gcHJvcHM7XG4gIGNvbnN0IG9uS2V5RG93biA9ICh7Y29kZX0pID0+IHtcbiAgICBpZiAoY29kZSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgIGNsb3NlTW9kYWwoKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuICg8ZGl2IGFyaWEtaGlkZGVuPXtTdHJpbmcoIWlzT3Blbil9IG9uS2V5RG93bj17b25LZXlEb3dufSBjbGFzcz1cIm1vZGFsXCI+XG4gICAgPGhlYWRlcj5cbiAgICAgIDxoMj57dGl0bGV9PC9oMj5cbiAgICAgIDxidXR0b24gb25DbGljaz17Y2xvc2VNb2RhbH0+PENyb3NzPjwvQ3Jvc3M+PC9idXR0b24+XG4gICAgPC9oZWFkZXI+XG4gICAgPGRpdiBjbGFzcz1cImJsdXJyeS1iYWNrZ3JvdW5kXCI+PC9kaXY+XG4gICAgPENvbXAgey4uLnByb3BzfS8+XG4gIDwvZGl2Pilcbn07XG5cbmV4cG9ydCBkZWZhdWx0IG1vZGFsOyIsImltcG9ydCB7aCwgb25Nb3VudCwgd2l0aFN0YXRlfSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgbW9kYWwgZnJvbSAnLi9Nb2RhbCc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge1RyZWUsIFN0YXJGdWxsLCBOb3RpZmljYXRpb24sIFVzZXJzLCBFbWJlZDJ9IGZyb20gJy4uL2NvbXBvbmVudHMvaWNvbnMnO1xuXG5jb25zdCBhdXRvZm9jdXMgPSBvbk1vdW50KCh2bm9kZSkgPT4ge1xuICB2bm9kZS5kb20uZm9jdXMoKTtcbn0pO1xuY29uc3QgQXV0b2ZvY3VzSW5wdXQgPSBhdXRvZm9jdXMocHJvcHMgPT4gPGlucHV0IHsuLi5wcm9wc30gLz4pO1xuY29uc3Qgc3RhdGVmdWxsTW9kYWwgPSBjb21wb3NlKHdpdGhTdGF0ZSwgbW9kYWwpO1xuXG5jb25zdCBTb3VyY2VUeXBlU2VsZWN0ID0gcHJvcHMgPT4ge1xuICBjb25zdCB7b25VcGRhdGV9ID0gcHJvcHM7XG4gIGNvbnN0IGNoYW5nZVZhbHVlID0gZXYgPT4gb25VcGRhdGUoe3NvdXJjZTogZXYudGFyZ2V0LnZhbHVlfSk7XG4gIHJldHVybiA8ZmllbGRzZXQ+XG4gICAgPGxlZ2VuZD5TZWxlY3QgYSBkYXRhIHNvdXJjZTo8L2xlZ2VuZD5cbiAgICA8ZGl2PlxuICAgICAgPGxhYmVsPlxuICAgICAgICA8aW5wdXQgcmVxdWlyZWQgY2xhc3M9XCJ2aXN1YWxseWhpZGRlblwiIG9uQ2hhbmdlPXtjaGFuZ2VWYWx1ZX0gdmFsdWU9XCJpc3N1ZXNcIiBuYW1lPVwic291cmNlVHlwZVwiIHR5cGU9XCJyYWRpb1wiLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhbHVlLWljb25cIj5cbiAgICAgICAgICA8Tm90aWZpY2F0aW9uLz5cbiAgICAgICAgICA8c3Bhbj5Jc3N1ZXM8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPGlucHV0IHJlcXVpcmVkIGNsYXNzPVwidmlzdWFsbHloaWRkZW5cIiBvbkNoYW5nZT17Y2hhbmdlVmFsdWV9IHZhbHVlPVwicHJzXCIgbmFtZT1cInNvdXJjZVR5cGVcIiB0eXBlPVwicmFkaW9cIi8+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJ2YWx1ZS1pY29uXCI+XG4gICAgICAgICAgPFRyZWUvPlxuICAgICAgICAgIDxzcGFuPlB1bGwgcmVxdWVzdHM8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPGlucHV0IHJlcXVpcmVkIG9uQ2hhbmdlPXtjaGFuZ2VWYWx1ZX0gY2xhc3M9XCJ2aXN1YWxseWhpZGRlblwiIHZhbHVlPVwic3RhcmdhemVyc1wiIG5hbWU9XCJzb3VyY2VUeXBlXCJcbiAgICAgICAgICAgICAgIHR5cGU9XCJyYWRpb1wiLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhbHVlLWljb25cIj5cbiAgICAgICAgICA8U3RhckZ1bGwvPlxuICAgICAgICAgIDxzcGFuPlN0YXJnYXplcnM8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPGlucHV0IHJlcXVpcmVkIG9uQ2hhbmdlPXtjaGFuZ2VWYWx1ZX0gY2xhc3M9XCJ2aXN1YWxseWhpZGRlblwiIHZhbHVlPVwiY29udHJpYnV0b3JzXCIgbmFtZT1cInNvdXJjZVR5cGVcIlxuICAgICAgICAgICAgICAgdHlwZT1cInJhZGlvXCIvPlxuICAgICAgICA8ZGl2IGNsYXNzPVwidmFsdWUtaWNvblwiPlxuICAgICAgICAgIDxVc2Vycy8+XG4gICAgICAgICAgPHNwYW4+Q29udHJpYnV0b3JzPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvbGFiZWw+XG4gICAgICA8bGFiZWw+XG4gICAgICAgIDxpbnB1dCByZXF1aXJlZCBvbkNoYW5nZT17Y2hhbmdlVmFsdWV9IGNsYXNzPVwidmlzdWFsbHloaWRkZW5cIiB2YWx1ZT1cImNvbW1pdHNcIiBuYW1lPVwic291cmNlVHlwZVwiIHR5cGU9XCJyYWRpb1wiLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhbHVlLWljb25cIj5cbiAgICAgICAgICA8RW1iZWQyLz5cbiAgICAgICAgICA8c3Bhbj5Db21taXRzPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvbGFiZWw+XG4gICAgPC9kaXY+XG4gIDwvZmllbGRzZXQ+XG59O1xuXG5leHBvcnQgY29uc3QgQ3JlYXRlU21hcnRMaXN0Rm9ybSA9IChwcm9wcykgPT4ge1xuICBjb25zdCB7b25VcGRhdGUsIG9uU3VibWl0fSA9IHByb3BzO1xuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XG4gICAgICA8Zm9ybSBvblN1Ym1pdD17b25TdWJtaXR9PlxuICAgICAgICA8bGFiZWw+XG4gICAgICAgICAgPHNwYW4+UGFuZWwgdGl0bGU6PC9zcGFuPlxuICAgICAgICAgIDxBdXRvZm9jdXNJbnB1dCBvbkNoYW5nZT17ZXYgPT4gb25VcGRhdGUoe3RpdGxlOiBldi50YXJnZXQudmFsdWV9KX0gbmFtZT1cInRpdGxlXCIgcmVxdWlyZWQ9XCJ0cnVlXCIvPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8U291cmNlVHlwZVNlbGVjdCB7Li4ucHJvcHN9Lz5cbiAgICAgICAgPGJ1dHRvbj5DcmVhdGU8L2J1dHRvbj5cbiAgICAgIDwvZm9ybT5cbiAgICA8L2Rpdj4pO1xufTtcblxuZXhwb3J0IGNvbnN0IENyZWF0ZVNtYXJ0Q2hhcnRGb3JtID0gcHJvcHMgPT4ge1xuICBjb25zdCB7b25TdWJtaXQsIG9uVXBkYXRlfSA9IHByb3BzO1xuICByZXR1cm4gKDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XG4gICAgPGZvcm0gb25TdWJtaXQ9e29uU3VibWl0fT5cbiAgICAgIDxsYWJlbD5cbiAgICAgICAgPHNwYW4+UGFuZWwgdGl0bGU6PC9zcGFuPlxuICAgICAgICA8QXV0b2ZvY3VzSW5wdXQgb25DaGFuZ2U9e2V2ID0+IG9uVXBkYXRlKHt0aXRsZTogZXYudGFyZ2V0LnZhbHVlfSl9IG5hbWU9XCJ0aXRsZVwiIHJlcXVpcmVkPVwidHJ1ZVwiLz5cbiAgICAgIDwvbGFiZWw+XG4gICAgICA8YnV0dG9uPkNyZWF0ZTwvYnV0dG9uPlxuICAgIDwvZm9ybT5cbiAgPC9kaXY+KTtcbn07XG5cbmV4cG9ydCBjb25zdCBDcmVhdGVTbWFydExpc3REYXRhUGFuZWwgPSBwcm9wcyA9PiB7XG4gIGNvbnN0IFVwZGF0YWJsZUZvcm1TZWN0aW9uID0gc3RhdGVmdWxsTW9kYWwoKHByb3BzLCB1cGRhdGUpID0+IHtcbiAgICBjb25zdCB7ZGF0YX0gPSBwcm9wcztcbiAgICBjb25zdCBvblVwZGF0ZSA9ICh2YWwpID0+IHtcbiAgICAgIE9iamVjdC5hc3NpZ24oZGF0YSwgdmFsKTtcbiAgICAgIHVwZGF0ZSh7ZGF0YSwgLi4ucHJvcHN9KTtcbiAgICB9O1xuICAgIHJldHVybiBDcmVhdGVTbWFydExpc3RGb3JtKHtvblVwZGF0ZSwgLi4ucHJvcHN9KTtcbiAgfSk7XG4gIHJldHVybiBVcGRhdGFibGVGb3JtU2VjdGlvbihwcm9wcyk7XG59O1xuXG5leHBvcnQgY29uc3QgQ3JlYXRlU21hcnRDaGFydERhdGFQYW5lbCA9IHByb3BzID0+IHtcbiAgY29uc3QgVXBkYXRhYmxlRm9ybVNlY3Rpb24gPSBzdGF0ZWZ1bGxNb2RhbCgocHJvcHMsIHVwZGF0ZSkgPT4ge1xuICAgIGNvbnN0IHtkYXRhfSA9IHByb3BzO1xuICAgIGNvbnN0IG9uVXBkYXRlID0gdmFsID0+IHtcbiAgICAgIE9iamVjdC5hc3NpZ24oZGF0YSwgdmFsKTtcbiAgICAgIHVwZGF0ZSh7ZGF0YSwgLi4ucHJvcHN9KTtcbiAgICB9O1xuICAgIHJldHVybiBDcmVhdGVTbWFydENoYXJ0Rm9ybSh7b25VcGRhdGUsIC4uLnByb3BzfSlcbiAgfSk7XG5cbiAgcmV0dXJuIFVwZGF0YWJsZUZvcm1TZWN0aW9uKHByb3BzKTtcbn07XG5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IHtDcmVhdGVTbWFydExpc3REYXRhUGFuZWwsIENyZWF0ZVNtYXJ0Q2hhcnREYXRhUGFuZWx9IGZyb20gJy4uL3ZpZXdzL0VkaXREYXRhUGFuZWxGb3JtJztcblxuY29uc3QgQ3JlYXRlRGF0YVBhbmVsID0gKENvbXAsIGRlZmF1bHREYXRhKSA9PiAocHJvcHMsIHthY3Rpb25zfSkgPT4ge1xuICBjb25zdCB7eCwgeSwgZGF0YSA9IGRlZmF1bHREYXRhfSA9IHByb3BzO1xuICBjb25zdCBvblN1Ym1pdCA9IGV2ID0+IHtcbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGFjdGlvbnMudXBkYXRlUGFuZWxEYXRhKHt4LCB5LCBkYXRhfSk7XG4gICAgYWN0aW9ucy5jbG9zZU1vZGFsKCk7XG4gIH07XG4gIHJldHVybiBDb21wKHtkYXRhLCBjbG9zZU1vZGFsOiBhY3Rpb25zLmNsb3NlTW9kYWwsIG9uU3VibWl0LCAuLi5wcm9wc30pO1xufTtcblxuZXhwb3J0IGNvbnN0IENyZWF0ZVNtYXJ0TGlzdE1vZGFsID0gQ3JlYXRlRGF0YVBhbmVsKENyZWF0ZVNtYXJ0TGlzdERhdGFQYW5lbCwge3R5cGU6ICdsaXN0Jywgc2hvd1Rvb2xCYXI6IHRydWV9KTtcblxuZXhwb3J0IGNvbnN0IENyZWF0ZVNtYXJ0Q2hhcnRNb2RhbCA9IENyZWF0ZURhdGFQYW5lbChDcmVhdGVTbWFydENoYXJ0RGF0YVBhbmVsLCB7dHlwZTonY2hhcnQnLCBzaG93VG9vbEJhcjp0cnVlfSk7XG5cblxuIiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgbW9kYWwgZnJvbSAnLi9Nb2RhbCc7XG5cbmV4cG9ydCBkZWZhdWx0IChwcm9wcykgPT4ge1xuICBjb25zdCB7Y2xvc2VNb2RhbCwgZXhlY3V0ZUFjdGlvbiwgbWVzc2FnZX0gPSBwcm9wcztcbiAgY29uc3QgY29uZmlybSA9IF8gPT4ge1xuICAgIGNsb3NlTW9kYWwoKTtcbiAgICBleGVjdXRlQWN0aW9uKCk7XG4gIH07XG4gIGNvbnN0IENvbXAgPSBtb2RhbChwcm9wcyA9PlxuICAgIDxkaXY+XG4gICAgICA8cD57bWVzc2FnZX08L3A+XG4gICAgICA8ZGl2PlxuICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2NvbmZpcm19PiBDb25maXJtPC9idXR0b24+XG4gICAgICAgIDxidXR0b24gb25DbGljaz17Y2xvc2VNb2RhbH0+IENhbmNlbDwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+KTtcbiAgcmV0dXJuIDxDb21wIHRpdGxlPVwiQXR0ZW50aW9uICFcIiB7Li4ucHJvcHN9IC8+XG59OyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IENvbWZpcm1hdGlvbk1vZGFsIGZyb20gJy4uL3ZpZXdzL0NvbmZpcm1hdGlvbk1vZGFsJztcblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzLCB7YWN0aW9uc30pID0+IDxDb21maXJtYXRpb25Nb2RhbCBjbG9zZU1vZGFsPXthY3Rpb25zLmNsb3NlTW9kYWx9IHsuLi5wcm9wc30gLz5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IHtDcmVhdGVTbWFydExpc3RNb2RhbCwgQ3JlYXRlU21hcnRDaGFydE1vZGFsfSBmcm9tICcuL0VkaXRQYW5lbERhdGFNb2RhbCc7XG5pbXBvcnQgQ29uZmlybWF0aW9uTW9kYWwgZnJvbSAnLi9Db25maXJtYXRpb25Nb2RhbCc7XG5pbXBvcnQge2RlZmF1bHQgYXMgTW9kYWxWaWV3fSAgZnJvbSAnLi4vdmlld3MvTW9kYWwnO1xuXG5cbmV4cG9ydCBjb25zdCBFbXB0eU1vZGFsID0gTW9kYWxWaWV3KChwcm9wcykgPT4ge1xuICAgIHJldHVybiA8ZGl2PjwvZGl2Pjtcbn0pO1xuXG5jb25zdCBnZXRNb2RhbENvbXBvbmVudCA9IChtb2RhbFR5cGUpID0+IHtcbiAgc3dpdGNoIChtb2RhbFR5cGUpIHtcbiAgICBjYXNlICdjcmVhdGVTbWFydExpc3RQYW5lbERhdGEnOlxuICAgICAgcmV0dXJuIENyZWF0ZVNtYXJ0TGlzdE1vZGFsO1xuICAgIGNhc2UgJ2NyZWF0ZVNtYXJ0Q2hhcnRQYW5lbERhdGEnOlxuICAgICAgcmV0dXJuIENyZWF0ZVNtYXJ0Q2hhcnRNb2RhbDtcbiAgICBjYXNlICdhc2tDb25maXJtYXRpb24nOlxuICAgICAgcmV0dXJuIENvbmZpcm1hdGlvbk1vZGFsO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gRW1wdHlNb2RhbDtcbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgTW9kYWwgPSAocHJvcHMsIHNlcnZpY2VzKSA9PiB7XG4gIGNvbnN0IHttb2RhbFR5cGV9ID0gcHJvcHM7XG4gIGNvbnN0IE1vZGFsQ29tcG9uZW50ID0gZ2V0TW9kYWxDb21wb25lbnQobW9kYWxUeXBlKTtcbiAgcmV0dXJuIE1vZGFsQ29tcG9uZW50KHByb3BzLCBzZXJ2aWNlcyk7XG59OyIsImNvbnN0IGFjdGlvbkNyZWF0b3IgPSBhY3Rpb25OYW1lID0+IG9wdHMgPT4gKE9iamVjdC5hc3NpZ24oe3R5cGU6IGFjdGlvbk5hbWV9LCBvcHRzKSlcblxuZXhwb3J0IGNvbnN0IGRyYWdPdmVyID0gYWN0aW9uQ3JlYXRvcignRFJBR19PVkVSJyk7XG5leHBvcnQgY29uc3QgZW5kUmVzaXplID0gYWN0aW9uQ3JlYXRvcignRU5EX1JFU0laRScpO1xuZXhwb3J0IGNvbnN0IHN0YXJ0UmVzaXplID0gYWN0aW9uQ3JlYXRvcignU1RBUlRfUkVTSVpFJyk7XG5leHBvcnQgY29uc3Qgc3RhcnRNb3ZlID0gYWN0aW9uQ3JlYXRvcignU1RBUlRfTU9WRScpO1xuZXhwb3J0IGNvbnN0IGVuZE1vdmUgPSBhY3Rpb25DcmVhdG9yKCdFTkRfTU9WRScpO1xuZXhwb3J0IGNvbnN0IG9wZW5Nb2RhbCA9IGFjdGlvbkNyZWF0b3IoJ09QRU5fTU9EQUwnKTtcbmV4cG9ydCBjb25zdCBjbG9zZU1vZGFsID0gYWN0aW9uQ3JlYXRvcignQ0xPU0VfTU9EQUwnKTtcbmV4cG9ydCBjb25zdCB1cGRhdGVQYW5lbERhdGEgPSBhY3Rpb25DcmVhdG9yKCdVUERBVEVfUEFORUxfREFUQScpO1xuZXhwb3J0IGNvbnN0IHVwZGF0ZVNtYXJ0TGlzdCA9IGFjdGlvbkNyZWF0b3IoJ1VQREFURV9TTUFSVF9MSVNUJyk7XG5leHBvcnQgY29uc3QgY3JlYXRlU21hcnRMaXN0ID0gYWN0aW9uQ3JlYXRvcignQ1JFQVRFX1NNQVJUX0xJU1QnKTtcbmV4cG9ydCBjb25zdCByZXNldFBhbmVsID0gYWN0aW9uQ3JlYXRvcignUkVTRVRfUEFORUwnKTtcbmV4cG9ydCBjb25zdCByZW1vdmVTbWFydExpc3QgPSBhY3Rpb25DcmVhdG9yKCdSRU1PVkVfU01BUlRfTElTVCcpOyIsIi8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgZ2xvYmFsYCBmcm9tIE5vZGUuanMuICovXG52YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsICYmIGdsb2JhbC5PYmplY3QgPT09IE9iamVjdCAmJiBnbG9iYWw7XG5cbmV4cG9ydCBkZWZhdWx0IGZyZWVHbG9iYWw7XG4iLCJpbXBvcnQgZnJlZUdsb2JhbCBmcm9tICcuL19mcmVlR2xvYmFsLmpzJztcblxuLyoqIERldGVjdCBmcmVlIHZhcmlhYmxlIGBzZWxmYC4gKi9cbnZhciBmcmVlU2VsZiA9IHR5cGVvZiBzZWxmID09ICdvYmplY3QnICYmIHNlbGYgJiYgc2VsZi5PYmplY3QgPT09IE9iamVjdCAmJiBzZWxmO1xuXG4vKiogVXNlZCBhcyBhIHJlZmVyZW5jZSB0byB0aGUgZ2xvYmFsIG9iamVjdC4gKi9cbnZhciByb290ID0gZnJlZUdsb2JhbCB8fCBmcmVlU2VsZiB8fCBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuXG5leHBvcnQgZGVmYXVsdCByb290O1xuIiwiaW1wb3J0IHJvb3QgZnJvbSAnLi9fcm9vdC5qcyc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIFN5bWJvbCA9IHJvb3QuU3ltYm9sO1xuXG5leHBvcnQgZGVmYXVsdCBTeW1ib2w7XG4iLCJpbXBvcnQgU3ltYm9sIGZyb20gJy4vX1N5bWJvbC5qcyc7XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZVxuICogW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzcuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBuYXRpdmVPYmplY3RUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBzeW1Ub1N0cmluZ1RhZyA9IFN5bWJvbCA/IFN5bWJvbC50b1N0cmluZ1RhZyA6IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VHZXRUYWdgIHdoaWNoIGlnbm9yZXMgYFN5bWJvbC50b1N0cmluZ1RhZ2AgdmFsdWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHJhdyBgdG9TdHJpbmdUYWdgLlxuICovXG5mdW5jdGlvbiBnZXRSYXdUYWcodmFsdWUpIHtcbiAgdmFyIGlzT3duID0gaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgc3ltVG9TdHJpbmdUYWcpLFxuICAgICAgdGFnID0gdmFsdWVbc3ltVG9TdHJpbmdUYWddO1xuXG4gIHRyeSB7XG4gICAgdmFsdWVbc3ltVG9TdHJpbmdUYWddID0gdW5kZWZpbmVkO1xuICAgIHZhciB1bm1hc2tlZCA9IHRydWU7XG4gIH0gY2F0Y2ggKGUpIHt9XG5cbiAgdmFyIHJlc3VsdCA9IG5hdGl2ZU9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICBpZiAodW5tYXNrZWQpIHtcbiAgICBpZiAoaXNPd24pIHtcbiAgICAgIHZhbHVlW3N5bVRvU3RyaW5nVGFnXSA9IHRhZztcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIHZhbHVlW3N5bVRvU3RyaW5nVGFnXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZ2V0UmF3VGFnO1xuIiwiLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlXG4gKiBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNy4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG5hdGl2ZU9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ29udmVydHMgYHZhbHVlYCB0byBhIHN0cmluZyB1c2luZyBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNvbnZlcnQuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBjb252ZXJ0ZWQgc3RyaW5nLlxuICovXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyh2YWx1ZSkge1xuICByZXR1cm4gbmF0aXZlT2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IG9iamVjdFRvU3RyaW5nO1xuIiwiaW1wb3J0IFN5bWJvbCBmcm9tICcuL19TeW1ib2wuanMnO1xuaW1wb3J0IGdldFJhd1RhZyBmcm9tICcuL19nZXRSYXdUYWcuanMnO1xuaW1wb3J0IG9iamVjdFRvU3RyaW5nIGZyb20gJy4vX29iamVjdFRvU3RyaW5nLmpzJztcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIG51bGxUYWcgPSAnW29iamVjdCBOdWxsXScsXG4gICAgdW5kZWZpbmVkVGFnID0gJ1tvYmplY3QgVW5kZWZpbmVkXSc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIHN5bVRvU3RyaW5nVGFnID0gU3ltYm9sID8gU3ltYm9sLnRvU3RyaW5nVGFnIDogdW5kZWZpbmVkO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBnZXRUYWdgIHdpdGhvdXQgZmFsbGJhY2tzIGZvciBidWdneSBlbnZpcm9ubWVudHMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHF1ZXJ5LlxuICogQHJldHVybnMge3N0cmluZ30gUmV0dXJucyB0aGUgYHRvU3RyaW5nVGFnYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUdldFRhZyh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkVGFnIDogbnVsbFRhZztcbiAgfVxuICByZXR1cm4gKHN5bVRvU3RyaW5nVGFnICYmIHN5bVRvU3RyaW5nVGFnIGluIE9iamVjdCh2YWx1ZSkpXG4gICAgPyBnZXRSYXdUYWcodmFsdWUpXG4gICAgOiBvYmplY3RUb1N0cmluZyh2YWx1ZSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGJhc2VHZXRUYWc7XG4iLCIvKipcbiAqIENyZWF0ZXMgYSB1bmFyeSBmdW5jdGlvbiB0aGF0IGludm9rZXMgYGZ1bmNgIHdpdGggaXRzIGFyZ3VtZW50IHRyYW5zZm9ybWVkLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byB3cmFwLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gdHJhbnNmb3JtIFRoZSBhcmd1bWVudCB0cmFuc2Zvcm0uXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gb3ZlckFyZyhmdW5jLCB0cmFuc2Zvcm0pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGFyZykge1xuICAgIHJldHVybiBmdW5jKHRyYW5zZm9ybShhcmcpKTtcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgb3ZlckFyZztcbiIsImltcG9ydCBvdmVyQXJnIGZyb20gJy4vX292ZXJBcmcuanMnO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBnZXRQcm90b3R5cGUgPSBvdmVyQXJnKE9iamVjdC5nZXRQcm90b3R5cGVPZiwgT2JqZWN0KTtcblxuZXhwb3J0IGRlZmF1bHQgZ2V0UHJvdG90eXBlO1xuIiwiLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZS4gQSB2YWx1ZSBpcyBvYmplY3QtbGlrZSBpZiBpdCdzIG5vdCBgbnVsbGBcbiAqIGFuZCBoYXMgYSBgdHlwZW9mYCByZXN1bHQgb2YgXCJvYmplY3RcIi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZSwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZSh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdExpa2UoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShfLm5vb3ApO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgIT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCc7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGlzT2JqZWN0TGlrZTtcbiIsImltcG9ydCBiYXNlR2V0VGFnIGZyb20gJy4vX2Jhc2VHZXRUYWcuanMnO1xuaW1wb3J0IGdldFByb3RvdHlwZSBmcm9tICcuL19nZXRQcm90b3R5cGUuanMnO1xuaW1wb3J0IGlzT2JqZWN0TGlrZSBmcm9tICcuL2lzT2JqZWN0TGlrZS5qcyc7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RUYWcgPSAnW29iamVjdCBPYmplY3RdJztcblxuLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNQcm90byA9IEZ1bmN0aW9uLnByb3RvdHlwZSxcbiAgICBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9ucy4gKi9cbnZhciBmdW5jVG9TdHJpbmcgPSBmdW5jUHJvdG8udG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKiBVc2VkIHRvIGluZmVyIHRoZSBgT2JqZWN0YCBjb25zdHJ1Y3Rvci4gKi9cbnZhciBvYmplY3RDdG9yU3RyaW5nID0gZnVuY1RvU3RyaW5nLmNhbGwoT2JqZWN0KTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHBsYWluIG9iamVjdCwgdGhhdCBpcywgYW4gb2JqZWN0IGNyZWF0ZWQgYnkgdGhlXG4gKiBgT2JqZWN0YCBjb25zdHJ1Y3RvciBvciBvbmUgd2l0aCBhIGBbW1Byb3RvdHlwZV1dYCBvZiBgbnVsbGAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBzaW5jZSAwLjguMFxuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBwbGFpbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogfVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChuZXcgRm9vKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc1BsYWluT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdCh7ICd4JzogMCwgJ3knOiAwIH0pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChPYmplY3QuY3JlYXRlKG51bGwpKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaXNQbGFpbk9iamVjdCh2YWx1ZSkge1xuICBpZiAoIWlzT2JqZWN0TGlrZSh2YWx1ZSkgfHwgYmFzZUdldFRhZyh2YWx1ZSkgIT0gb2JqZWN0VGFnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciBwcm90byA9IGdldFByb3RvdHlwZSh2YWx1ZSk7XG4gIGlmIChwcm90byA9PT0gbnVsbCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHZhciBDdG9yID0gaGFzT3duUHJvcGVydHkuY2FsbChwcm90bywgJ2NvbnN0cnVjdG9yJykgJiYgcHJvdG8uY29uc3RydWN0b3I7XG4gIHJldHVybiB0eXBlb2YgQ3RvciA9PSAnZnVuY3Rpb24nICYmIEN0b3IgaW5zdGFuY2VvZiBDdG9yICYmXG4gICAgZnVuY1RvU3RyaW5nLmNhbGwoQ3RvcikgPT0gb2JqZWN0Q3RvclN0cmluZztcbn1cblxuZXhwb3J0IGRlZmF1bHQgaXNQbGFpbk9iamVjdDtcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHN5bWJvbE9ic2VydmFibGVQb255ZmlsbChyb290KSB7XG5cdHZhciByZXN1bHQ7XG5cdHZhciBTeW1ib2wgPSByb290LlN5bWJvbDtcblxuXHRpZiAodHlwZW9mIFN5bWJvbCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdGlmIChTeW1ib2wub2JzZXJ2YWJsZSkge1xuXHRcdFx0cmVzdWx0ID0gU3ltYm9sLm9ic2VydmFibGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IFN5bWJvbCgnb2JzZXJ2YWJsZScpO1xuXHRcdFx0U3ltYm9sLm9ic2VydmFibGUgPSByZXN1bHQ7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJlc3VsdCA9ICdAQG9ic2VydmFibGUnO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn07XG4iLCIvKiBnbG9iYWwgd2luZG93ICovXG5pbXBvcnQgcG9ueWZpbGwgZnJvbSAnLi9wb255ZmlsbCc7XG5cbnZhciByb290O1xuXG5pZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7XG4gIHJvb3QgPSBzZWxmO1xufSBlbHNlIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gZ2xvYmFsO1xufSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gbW9kdWxlO1xufSBlbHNlIHtcbiAgcm9vdCA9IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG59XG5cbnZhciByZXN1bHQgPSBwb255ZmlsbChyb290KTtcbmV4cG9ydCBkZWZhdWx0IHJlc3VsdDtcbiIsImltcG9ydCBpc1BsYWluT2JqZWN0IGZyb20gJ2xvZGFzaC1lcy9pc1BsYWluT2JqZWN0JztcbmltcG9ydCAkJG9ic2VydmFibGUgZnJvbSAnc3ltYm9sLW9ic2VydmFibGUnO1xuXG4vKipcbiAqIFRoZXNlIGFyZSBwcml2YXRlIGFjdGlvbiB0eXBlcyByZXNlcnZlZCBieSBSZWR1eC5cbiAqIEZvciBhbnkgdW5rbm93biBhY3Rpb25zLCB5b3UgbXVzdCByZXR1cm4gdGhlIGN1cnJlbnQgc3RhdGUuXG4gKiBJZiB0aGUgY3VycmVudCBzdGF0ZSBpcyB1bmRlZmluZWQsIHlvdSBtdXN0IHJldHVybiB0aGUgaW5pdGlhbCBzdGF0ZS5cbiAqIERvIG5vdCByZWZlcmVuY2UgdGhlc2UgYWN0aW9uIHR5cGVzIGRpcmVjdGx5IGluIHlvdXIgY29kZS5cbiAqL1xuZXhwb3J0IHZhciBBY3Rpb25UeXBlcyA9IHtcbiAgSU5JVDogJ0BAcmVkdXgvSU5JVCdcblxuICAvKipcbiAgICogQ3JlYXRlcyBhIFJlZHV4IHN0b3JlIHRoYXQgaG9sZHMgdGhlIHN0YXRlIHRyZWUuXG4gICAqIFRoZSBvbmx5IHdheSB0byBjaGFuZ2UgdGhlIGRhdGEgaW4gdGhlIHN0b3JlIGlzIHRvIGNhbGwgYGRpc3BhdGNoKClgIG9uIGl0LlxuICAgKlxuICAgKiBUaGVyZSBzaG91bGQgb25seSBiZSBhIHNpbmdsZSBzdG9yZSBpbiB5b3VyIGFwcC4gVG8gc3BlY2lmeSBob3cgZGlmZmVyZW50XG4gICAqIHBhcnRzIG9mIHRoZSBzdGF0ZSB0cmVlIHJlc3BvbmQgdG8gYWN0aW9ucywgeW91IG1heSBjb21iaW5lIHNldmVyYWwgcmVkdWNlcnNcbiAgICogaW50byBhIHNpbmdsZSByZWR1Y2VyIGZ1bmN0aW9uIGJ5IHVzaW5nIGBjb21iaW5lUmVkdWNlcnNgLlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSByZWR1Y2VyIEEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBuZXh0IHN0YXRlIHRyZWUsIGdpdmVuXG4gICAqIHRoZSBjdXJyZW50IHN0YXRlIHRyZWUgYW5kIHRoZSBhY3Rpb24gdG8gaGFuZGxlLlxuICAgKlxuICAgKiBAcGFyYW0ge2FueX0gW3ByZWxvYWRlZFN0YXRlXSBUaGUgaW5pdGlhbCBzdGF0ZS4gWW91IG1heSBvcHRpb25hbGx5IHNwZWNpZnkgaXRcbiAgICogdG8gaHlkcmF0ZSB0aGUgc3RhdGUgZnJvbSB0aGUgc2VydmVyIGluIHVuaXZlcnNhbCBhcHBzLCBvciB0byByZXN0b3JlIGFcbiAgICogcHJldmlvdXNseSBzZXJpYWxpemVkIHVzZXIgc2Vzc2lvbi5cbiAgICogSWYgeW91IHVzZSBgY29tYmluZVJlZHVjZXJzYCB0byBwcm9kdWNlIHRoZSByb290IHJlZHVjZXIgZnVuY3Rpb24sIHRoaXMgbXVzdCBiZVxuICAgKiBhbiBvYmplY3Qgd2l0aCB0aGUgc2FtZSBzaGFwZSBhcyBgY29tYmluZVJlZHVjZXJzYCBrZXlzLlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZW5oYW5jZXJdIFRoZSBzdG9yZSBlbmhhbmNlci4gWW91IG1heSBvcHRpb25hbGx5IHNwZWNpZnkgaXRcbiAgICogdG8gZW5oYW5jZSB0aGUgc3RvcmUgd2l0aCB0aGlyZC1wYXJ0eSBjYXBhYmlsaXRpZXMgc3VjaCBhcyBtaWRkbGV3YXJlLFxuICAgKiB0aW1lIHRyYXZlbCwgcGVyc2lzdGVuY2UsIGV0Yy4gVGhlIG9ubHkgc3RvcmUgZW5oYW5jZXIgdGhhdCBzaGlwcyB3aXRoIFJlZHV4XG4gICAqIGlzIGBhcHBseU1pZGRsZXdhcmUoKWAuXG4gICAqXG4gICAqIEByZXR1cm5zIHtTdG9yZX0gQSBSZWR1eCBzdG9yZSB0aGF0IGxldHMgeW91IHJlYWQgdGhlIHN0YXRlLCBkaXNwYXRjaCBhY3Rpb25zXG4gICAqIGFuZCBzdWJzY3JpYmUgdG8gY2hhbmdlcy5cbiAgICovXG59O2V4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNyZWF0ZVN0b3JlKHJlZHVjZXIsIHByZWxvYWRlZFN0YXRlLCBlbmhhbmNlcikge1xuICB2YXIgX3JlZjI7XG5cbiAgaWYgKHR5cGVvZiBwcmVsb2FkZWRTdGF0ZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgZW5oYW5jZXIgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgZW5oYW5jZXIgPSBwcmVsb2FkZWRTdGF0ZTtcbiAgICBwcmVsb2FkZWRTdGF0ZSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICh0eXBlb2YgZW5oYW5jZXIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKHR5cGVvZiBlbmhhbmNlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCB0aGUgZW5oYW5jZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZW5oYW5jZXIoY3JlYXRlU3RvcmUpKHJlZHVjZXIsIHByZWxvYWRlZFN0YXRlKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgcmVkdWNlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgdGhlIHJlZHVjZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgfVxuXG4gIHZhciBjdXJyZW50UmVkdWNlciA9IHJlZHVjZXI7XG4gIHZhciBjdXJyZW50U3RhdGUgPSBwcmVsb2FkZWRTdGF0ZTtcbiAgdmFyIGN1cnJlbnRMaXN0ZW5lcnMgPSBbXTtcbiAgdmFyIG5leHRMaXN0ZW5lcnMgPSBjdXJyZW50TGlzdGVuZXJzO1xuICB2YXIgaXNEaXNwYXRjaGluZyA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGVuc3VyZUNhbk11dGF0ZU5leHRMaXN0ZW5lcnMoKSB7XG4gICAgaWYgKG5leHRMaXN0ZW5lcnMgPT09IGN1cnJlbnRMaXN0ZW5lcnMpIHtcbiAgICAgIG5leHRMaXN0ZW5lcnMgPSBjdXJyZW50TGlzdGVuZXJzLnNsaWNlKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlYWRzIHRoZSBzdGF0ZSB0cmVlIG1hbmFnZWQgYnkgdGhlIHN0b3JlLlxuICAgKlxuICAgKiBAcmV0dXJucyB7YW55fSBUaGUgY3VycmVudCBzdGF0ZSB0cmVlIG9mIHlvdXIgYXBwbGljYXRpb24uXG4gICAqL1xuICBmdW5jdGlvbiBnZXRTdGF0ZSgpIHtcbiAgICByZXR1cm4gY3VycmVudFN0YXRlO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgYSBjaGFuZ2UgbGlzdGVuZXIuIEl0IHdpbGwgYmUgY2FsbGVkIGFueSB0aW1lIGFuIGFjdGlvbiBpcyBkaXNwYXRjaGVkLFxuICAgKiBhbmQgc29tZSBwYXJ0IG9mIHRoZSBzdGF0ZSB0cmVlIG1heSBwb3RlbnRpYWxseSBoYXZlIGNoYW5nZWQuIFlvdSBtYXkgdGhlblxuICAgKiBjYWxsIGBnZXRTdGF0ZSgpYCB0byByZWFkIHRoZSBjdXJyZW50IHN0YXRlIHRyZWUgaW5zaWRlIHRoZSBjYWxsYmFjay5cbiAgICpcbiAgICogWW91IG1heSBjYWxsIGBkaXNwYXRjaCgpYCBmcm9tIGEgY2hhbmdlIGxpc3RlbmVyLCB3aXRoIHRoZSBmb2xsb3dpbmdcbiAgICogY2F2ZWF0czpcbiAgICpcbiAgICogMS4gVGhlIHN1YnNjcmlwdGlvbnMgYXJlIHNuYXBzaG90dGVkIGp1c3QgYmVmb3JlIGV2ZXJ5IGBkaXNwYXRjaCgpYCBjYWxsLlxuICAgKiBJZiB5b3Ugc3Vic2NyaWJlIG9yIHVuc3Vic2NyaWJlIHdoaWxlIHRoZSBsaXN0ZW5lcnMgYXJlIGJlaW5nIGludm9rZWQsIHRoaXNcbiAgICogd2lsbCBub3QgaGF2ZSBhbnkgZWZmZWN0IG9uIHRoZSBgZGlzcGF0Y2goKWAgdGhhdCBpcyBjdXJyZW50bHkgaW4gcHJvZ3Jlc3MuXG4gICAqIEhvd2V2ZXIsIHRoZSBuZXh0IGBkaXNwYXRjaCgpYCBjYWxsLCB3aGV0aGVyIG5lc3RlZCBvciBub3QsIHdpbGwgdXNlIGEgbW9yZVxuICAgKiByZWNlbnQgc25hcHNob3Qgb2YgdGhlIHN1YnNjcmlwdGlvbiBsaXN0LlxuICAgKlxuICAgKiAyLiBUaGUgbGlzdGVuZXIgc2hvdWxkIG5vdCBleHBlY3QgdG8gc2VlIGFsbCBzdGF0ZSBjaGFuZ2VzLCBhcyB0aGUgc3RhdGVcbiAgICogbWlnaHQgaGF2ZSBiZWVuIHVwZGF0ZWQgbXVsdGlwbGUgdGltZXMgZHVyaW5nIGEgbmVzdGVkIGBkaXNwYXRjaCgpYCBiZWZvcmVcbiAgICogdGhlIGxpc3RlbmVyIGlzIGNhbGxlZC4gSXQgaXMsIGhvd2V2ZXIsIGd1YXJhbnRlZWQgdGhhdCBhbGwgc3Vic2NyaWJlcnNcbiAgICogcmVnaXN0ZXJlZCBiZWZvcmUgdGhlIGBkaXNwYXRjaCgpYCBzdGFydGVkIHdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGxhdGVzdFxuICAgKiBzdGF0ZSBieSB0aGUgdGltZSBpdCBleGl0cy5cbiAgICpcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgQSBjYWxsYmFjayB0byBiZSBpbnZva2VkIG9uIGV2ZXJ5IGRpc3BhdGNoLlxuICAgKiBAcmV0dXJucyB7RnVuY3Rpb259IEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoaXMgY2hhbmdlIGxpc3RlbmVyLlxuICAgKi9cbiAgZnVuY3Rpb24gc3Vic2NyaWJlKGxpc3RlbmVyKSB7XG4gICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBsaXN0ZW5lciB0byBiZSBhIGZ1bmN0aW9uLicpO1xuICAgIH1cblxuICAgIHZhciBpc1N1YnNjcmliZWQgPSB0cnVlO1xuXG4gICAgZW5zdXJlQ2FuTXV0YXRlTmV4dExpc3RlbmVycygpO1xuICAgIG5leHRMaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gdW5zdWJzY3JpYmUoKSB7XG4gICAgICBpZiAoIWlzU3Vic2NyaWJlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlzU3Vic2NyaWJlZCA9IGZhbHNlO1xuXG4gICAgICBlbnN1cmVDYW5NdXRhdGVOZXh0TGlzdGVuZXJzKCk7XG4gICAgICB2YXIgaW5kZXggPSBuZXh0TGlzdGVuZXJzLmluZGV4T2YobGlzdGVuZXIpO1xuICAgICAgbmV4dExpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRGlzcGF0Y2hlcyBhbiBhY3Rpb24uIEl0IGlzIHRoZSBvbmx5IHdheSB0byB0cmlnZ2VyIGEgc3RhdGUgY2hhbmdlLlxuICAgKlxuICAgKiBUaGUgYHJlZHVjZXJgIGZ1bmN0aW9uLCB1c2VkIHRvIGNyZWF0ZSB0aGUgc3RvcmUsIHdpbGwgYmUgY2FsbGVkIHdpdGggdGhlXG4gICAqIGN1cnJlbnQgc3RhdGUgdHJlZSBhbmQgdGhlIGdpdmVuIGBhY3Rpb25gLiBJdHMgcmV0dXJuIHZhbHVlIHdpbGxcbiAgICogYmUgY29uc2lkZXJlZCB0aGUgKipuZXh0Kiogc3RhdGUgb2YgdGhlIHRyZWUsIGFuZCB0aGUgY2hhbmdlIGxpc3RlbmVyc1xuICAgKiB3aWxsIGJlIG5vdGlmaWVkLlxuICAgKlxuICAgKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvbmx5IHN1cHBvcnRzIHBsYWluIG9iamVjdCBhY3Rpb25zLiBJZiB5b3Ugd2FudCB0b1xuICAgKiBkaXNwYXRjaCBhIFByb21pc2UsIGFuIE9ic2VydmFibGUsIGEgdGh1bmssIG9yIHNvbWV0aGluZyBlbHNlLCB5b3UgbmVlZCB0b1xuICAgKiB3cmFwIHlvdXIgc3RvcmUgY3JlYXRpbmcgZnVuY3Rpb24gaW50byB0aGUgY29ycmVzcG9uZGluZyBtaWRkbGV3YXJlLiBGb3JcbiAgICogZXhhbXBsZSwgc2VlIHRoZSBkb2N1bWVudGF0aW9uIGZvciB0aGUgYHJlZHV4LXRodW5rYCBwYWNrYWdlLiBFdmVuIHRoZVxuICAgKiBtaWRkbGV3YXJlIHdpbGwgZXZlbnR1YWxseSBkaXNwYXRjaCBwbGFpbiBvYmplY3QgYWN0aW9ucyB1c2luZyB0aGlzIG1ldGhvZC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IGFjdGlvbiBBIHBsYWluIG9iamVjdCByZXByZXNlbnRpbmcg4oCcd2hhdCBjaGFuZ2Vk4oCdLiBJdCBpc1xuICAgKiBhIGdvb2QgaWRlYSB0byBrZWVwIGFjdGlvbnMgc2VyaWFsaXphYmxlIHNvIHlvdSBjYW4gcmVjb3JkIGFuZCByZXBsYXkgdXNlclxuICAgKiBzZXNzaW9ucywgb3IgdXNlIHRoZSB0aW1lIHRyYXZlbGxpbmcgYHJlZHV4LWRldnRvb2xzYC4gQW4gYWN0aW9uIG11c3QgaGF2ZVxuICAgKiBhIGB0eXBlYCBwcm9wZXJ0eSB3aGljaCBtYXkgbm90IGJlIGB1bmRlZmluZWRgLiBJdCBpcyBhIGdvb2QgaWRlYSB0byB1c2VcbiAgICogc3RyaW5nIGNvbnN0YW50cyBmb3IgYWN0aW9uIHR5cGVzLlxuICAgKlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBGb3IgY29udmVuaWVuY2UsIHRoZSBzYW1lIGFjdGlvbiBvYmplY3QgeW91IGRpc3BhdGNoZWQuXG4gICAqXG4gICAqIE5vdGUgdGhhdCwgaWYgeW91IHVzZSBhIGN1c3RvbSBtaWRkbGV3YXJlLCBpdCBtYXkgd3JhcCBgZGlzcGF0Y2goKWAgdG9cbiAgICogcmV0dXJuIHNvbWV0aGluZyBlbHNlIChmb3IgZXhhbXBsZSwgYSBQcm9taXNlIHlvdSBjYW4gYXdhaXQpLlxuICAgKi9cbiAgZnVuY3Rpb24gZGlzcGF0Y2goYWN0aW9uKSB7XG4gICAgaWYgKCFpc1BsYWluT2JqZWN0KGFjdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWN0aW9ucyBtdXN0IGJlIHBsYWluIG9iamVjdHMuICcgKyAnVXNlIGN1c3RvbSBtaWRkbGV3YXJlIGZvciBhc3luYyBhY3Rpb25zLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgYWN0aW9uLnR5cGUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FjdGlvbnMgbWF5IG5vdCBoYXZlIGFuIHVuZGVmaW5lZCBcInR5cGVcIiBwcm9wZXJ0eS4gJyArICdIYXZlIHlvdSBtaXNzcGVsbGVkIGEgY29uc3RhbnQ/Jyk7XG4gICAgfVxuXG4gICAgaWYgKGlzRGlzcGF0Y2hpbmcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUmVkdWNlcnMgbWF5IG5vdCBkaXNwYXRjaCBhY3Rpb25zLicpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBpc0Rpc3BhdGNoaW5nID0gdHJ1ZTtcbiAgICAgIGN1cnJlbnRTdGF0ZSA9IGN1cnJlbnRSZWR1Y2VyKGN1cnJlbnRTdGF0ZSwgYWN0aW9uKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaXNEaXNwYXRjaGluZyA9IGZhbHNlO1xuICAgIH1cblxuICAgIHZhciBsaXN0ZW5lcnMgPSBjdXJyZW50TGlzdGVuZXJzID0gbmV4dExpc3RlbmVycztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3RlbmVycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGxpc3RlbmVyID0gbGlzdGVuZXJzW2ldO1xuICAgICAgbGlzdGVuZXIoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYWN0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcGxhY2VzIHRoZSByZWR1Y2VyIGN1cnJlbnRseSB1c2VkIGJ5IHRoZSBzdG9yZSB0byBjYWxjdWxhdGUgdGhlIHN0YXRlLlxuICAgKlxuICAgKiBZb3UgbWlnaHQgbmVlZCB0aGlzIGlmIHlvdXIgYXBwIGltcGxlbWVudHMgY29kZSBzcGxpdHRpbmcgYW5kIHlvdSB3YW50IHRvXG4gICAqIGxvYWQgc29tZSBvZiB0aGUgcmVkdWNlcnMgZHluYW1pY2FsbHkuIFlvdSBtaWdodCBhbHNvIG5lZWQgdGhpcyBpZiB5b3VcbiAgICogaW1wbGVtZW50IGEgaG90IHJlbG9hZGluZyBtZWNoYW5pc20gZm9yIFJlZHV4LlxuICAgKlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0UmVkdWNlciBUaGUgcmVkdWNlciBmb3IgdGhlIHN0b3JlIHRvIHVzZSBpbnN0ZWFkLlxuICAgKiBAcmV0dXJucyB7dm9pZH1cbiAgICovXG4gIGZ1bmN0aW9uIHJlcGxhY2VSZWR1Y2VyKG5leHRSZWR1Y2VyKSB7XG4gICAgaWYgKHR5cGVvZiBuZXh0UmVkdWNlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCB0aGUgbmV4dFJlZHVjZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICBjdXJyZW50UmVkdWNlciA9IG5leHRSZWR1Y2VyO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogQWN0aW9uVHlwZXMuSU5JVCB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnRlcm9wZXJhYmlsaXR5IHBvaW50IGZvciBvYnNlcnZhYmxlL3JlYWN0aXZlIGxpYnJhcmllcy5cbiAgICogQHJldHVybnMge29ic2VydmFibGV9IEEgbWluaW1hbCBvYnNlcnZhYmxlIG9mIHN0YXRlIGNoYW5nZXMuXG4gICAqIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWUgdGhlIG9ic2VydmFibGUgcHJvcG9zYWw6XG4gICAqIGh0dHBzOi8vZ2l0aHViLmNvbS90YzM5L3Byb3Bvc2FsLW9ic2VydmFibGVcbiAgICovXG4gIGZ1bmN0aW9uIG9ic2VydmFibGUoKSB7XG4gICAgdmFyIF9yZWY7XG5cbiAgICB2YXIgb3V0ZXJTdWJzY3JpYmUgPSBzdWJzY3JpYmU7XG4gICAgcmV0dXJuIF9yZWYgPSB7XG4gICAgICAvKipcbiAgICAgICAqIFRoZSBtaW5pbWFsIG9ic2VydmFibGUgc3Vic2NyaXB0aW9uIG1ldGhvZC5cbiAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvYnNlcnZlciBBbnkgb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgYXMgYW4gb2JzZXJ2ZXIuXG4gICAgICAgKiBUaGUgb2JzZXJ2ZXIgb2JqZWN0IHNob3VsZCBoYXZlIGEgYG5leHRgIG1ldGhvZC5cbiAgICAgICAqIEByZXR1cm5zIHtzdWJzY3JpcHRpb259IEFuIG9iamVjdCB3aXRoIGFuIGB1bnN1YnNjcmliZWAgbWV0aG9kIHRoYXQgY2FuXG4gICAgICAgKiBiZSB1c2VkIHRvIHVuc3Vic2NyaWJlIHRoZSBvYnNlcnZhYmxlIGZyb20gdGhlIHN0b3JlLCBhbmQgcHJldmVudCBmdXJ0aGVyXG4gICAgICAgKiBlbWlzc2lvbiBvZiB2YWx1ZXMgZnJvbSB0aGUgb2JzZXJ2YWJsZS5cbiAgICAgICAqL1xuICAgICAgc3Vic2NyaWJlOiBmdW5jdGlvbiBzdWJzY3JpYmUob2JzZXJ2ZXIpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYnNlcnZlciAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCB0aGUgb2JzZXJ2ZXIgdG8gYmUgYW4gb2JqZWN0LicpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb2JzZXJ2ZVN0YXRlKCkge1xuICAgICAgICAgIGlmIChvYnNlcnZlci5uZXh0KSB7XG4gICAgICAgICAgICBvYnNlcnZlci5uZXh0KGdldFN0YXRlKCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG9ic2VydmVTdGF0ZSgpO1xuICAgICAgICB2YXIgdW5zdWJzY3JpYmUgPSBvdXRlclN1YnNjcmliZShvYnNlcnZlU3RhdGUpO1xuICAgICAgICByZXR1cm4geyB1bnN1YnNjcmliZTogdW5zdWJzY3JpYmUgfTtcbiAgICAgIH1cbiAgICB9LCBfcmVmWyQkb2JzZXJ2YWJsZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LCBfcmVmO1xuICB9XG5cbiAgLy8gV2hlbiBhIHN0b3JlIGlzIGNyZWF0ZWQsIGFuIFwiSU5JVFwiIGFjdGlvbiBpcyBkaXNwYXRjaGVkIHNvIHRoYXQgZXZlcnlcbiAgLy8gcmVkdWNlciByZXR1cm5zIHRoZWlyIGluaXRpYWwgc3RhdGUuIFRoaXMgZWZmZWN0aXZlbHkgcG9wdWxhdGVzXG4gIC8vIHRoZSBpbml0aWFsIHN0YXRlIHRyZWUuXG4gIGRpc3BhdGNoKHsgdHlwZTogQWN0aW9uVHlwZXMuSU5JVCB9KTtcblxuICByZXR1cm4gX3JlZjIgPSB7XG4gICAgZGlzcGF0Y2g6IGRpc3BhdGNoLFxuICAgIHN1YnNjcmliZTogc3Vic2NyaWJlLFxuICAgIGdldFN0YXRlOiBnZXRTdGF0ZSxcbiAgICByZXBsYWNlUmVkdWNlcjogcmVwbGFjZVJlZHVjZXJcbiAgfSwgX3JlZjJbJCRvYnNlcnZhYmxlXSA9IG9ic2VydmFibGUsIF9yZWYyO1xufSIsIi8qKlxuICogUHJpbnRzIGEgd2FybmluZyBpbiB0aGUgY29uc29sZSBpZiBpdCBleGlzdHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIHdhcm5pbmcgbWVzc2FnZS5cbiAqIEByZXR1cm5zIHt2b2lkfVxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiB3YXJuaW5nKG1lc3NhZ2UpIHtcbiAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBjb25zb2xlLmVycm9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY29uc29sZS5lcnJvcihtZXNzYWdlKTtcbiAgfVxuICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgdHJ5IHtcbiAgICAvLyBUaGlzIGVycm9yIHdhcyB0aHJvd24gYXMgYSBjb252ZW5pZW5jZSBzbyB0aGF0IGlmIHlvdSBlbmFibGVcbiAgICAvLyBcImJyZWFrIG9uIGFsbCBleGNlcHRpb25zXCIgaW4geW91ciBjb25zb2xlLFxuICAgIC8vIGl0IHdvdWxkIHBhdXNlIHRoZSBleGVjdXRpb24gYXQgdGhpcyBsaW5lLlxuICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1lbXB0eSAqL1xuICB9IGNhdGNoIChlKSB7fVxuICAvKiBlc2xpbnQtZW5hYmxlIG5vLWVtcHR5ICovXG59IiwiLyoqXG4gKiBDb21wb3NlcyBzaW5nbGUtYXJndW1lbnQgZnVuY3Rpb25zIGZyb20gcmlnaHQgdG8gbGVmdC4gVGhlIHJpZ2h0bW9zdFxuICogZnVuY3Rpb24gY2FuIHRha2UgbXVsdGlwbGUgYXJndW1lbnRzIGFzIGl0IHByb3ZpZGVzIHRoZSBzaWduYXR1cmUgZm9yXG4gKiB0aGUgcmVzdWx0aW5nIGNvbXBvc2l0ZSBmdW5jdGlvbi5cbiAqXG4gKiBAcGFyYW0gey4uLkZ1bmN0aW9ufSBmdW5jcyBUaGUgZnVuY3Rpb25zIHRvIGNvbXBvc2UuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IEEgZnVuY3Rpb24gb2J0YWluZWQgYnkgY29tcG9zaW5nIHRoZSBhcmd1bWVudCBmdW5jdGlvbnNcbiAqIGZyb20gcmlnaHQgdG8gbGVmdC4gRm9yIGV4YW1wbGUsIGNvbXBvc2UoZiwgZywgaCkgaXMgaWRlbnRpY2FsIHRvIGRvaW5nXG4gKiAoLi4uYXJncykgPT4gZihnKGgoLi4uYXJncykpKS5cbiAqL1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb21wb3NlKCkge1xuICBmb3IgKHZhciBfbGVuID0gYXJndW1lbnRzLmxlbmd0aCwgZnVuY3MgPSBBcnJheShfbGVuKSwgX2tleSA9IDA7IF9rZXkgPCBfbGVuOyBfa2V5KyspIHtcbiAgICBmdW5jc1tfa2V5XSA9IGFyZ3VtZW50c1tfa2V5XTtcbiAgfVxuXG4gIGlmIChmdW5jcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKGFyZykge1xuICAgICAgcmV0dXJuIGFyZztcbiAgICB9O1xuICB9XG5cbiAgaWYgKGZ1bmNzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmdW5jc1swXTtcbiAgfVxuXG4gIHJldHVybiBmdW5jcy5yZWR1Y2UoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGEoYi5hcHBseSh1bmRlZmluZWQsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH0pO1xufSIsInZhciBfZXh0ZW5kcyA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gKHRhcmdldCkgeyBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykgeyB2YXIgc291cmNlID0gYXJndW1lbnRzW2ldOyBmb3IgKHZhciBrZXkgaW4gc291cmNlKSB7IGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc291cmNlLCBrZXkpKSB7IHRhcmdldFtrZXldID0gc291cmNlW2tleV07IH0gfSB9IHJldHVybiB0YXJnZXQ7IH07XG5cbmltcG9ydCBjb21wb3NlIGZyb20gJy4vY29tcG9zZSc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0b3JlIGVuaGFuY2VyIHRoYXQgYXBwbGllcyBtaWRkbGV3YXJlIHRvIHRoZSBkaXNwYXRjaCBtZXRob2RcbiAqIG9mIHRoZSBSZWR1eCBzdG9yZS4gVGhpcyBpcyBoYW5keSBmb3IgYSB2YXJpZXR5IG9mIHRhc2tzLCBzdWNoIGFzIGV4cHJlc3NpbmdcbiAqIGFzeW5jaHJvbm91cyBhY3Rpb25zIGluIGEgY29uY2lzZSBtYW5uZXIsIG9yIGxvZ2dpbmcgZXZlcnkgYWN0aW9uIHBheWxvYWQuXG4gKlxuICogU2VlIGByZWR1eC10aHVua2AgcGFja2FnZSBhcyBhbiBleGFtcGxlIG9mIHRoZSBSZWR1eCBtaWRkbGV3YXJlLlxuICpcbiAqIEJlY2F1c2UgbWlkZGxld2FyZSBpcyBwb3RlbnRpYWxseSBhc3luY2hyb25vdXMsIHRoaXMgc2hvdWxkIGJlIHRoZSBmaXJzdFxuICogc3RvcmUgZW5oYW5jZXIgaW4gdGhlIGNvbXBvc2l0aW9uIGNoYWluLlxuICpcbiAqIE5vdGUgdGhhdCBlYWNoIG1pZGRsZXdhcmUgd2lsbCBiZSBnaXZlbiB0aGUgYGRpc3BhdGNoYCBhbmQgYGdldFN0YXRlYCBmdW5jdGlvbnNcbiAqIGFzIG5hbWVkIGFyZ3VtZW50cy5cbiAqXG4gKiBAcGFyYW0gey4uLkZ1bmN0aW9ufSBtaWRkbGV3YXJlcyBUaGUgbWlkZGxld2FyZSBjaGFpbiB0byBiZSBhcHBsaWVkLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBBIHN0b3JlIGVuaGFuY2VyIGFwcGx5aW5nIHRoZSBtaWRkbGV3YXJlLlxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBhcHBseU1pZGRsZXdhcmUoKSB7XG4gIGZvciAodmFyIF9sZW4gPSBhcmd1bWVudHMubGVuZ3RoLCBtaWRkbGV3YXJlcyA9IEFycmF5KF9sZW4pLCBfa2V5ID0gMDsgX2tleSA8IF9sZW47IF9rZXkrKykge1xuICAgIG1pZGRsZXdhcmVzW19rZXldID0gYXJndW1lbnRzW19rZXldO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIChjcmVhdGVTdG9yZSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAocmVkdWNlciwgcHJlbG9hZGVkU3RhdGUsIGVuaGFuY2VyKSB7XG4gICAgICB2YXIgc3RvcmUgPSBjcmVhdGVTdG9yZShyZWR1Y2VyLCBwcmVsb2FkZWRTdGF0ZSwgZW5oYW5jZXIpO1xuICAgICAgdmFyIF9kaXNwYXRjaCA9IHN0b3JlLmRpc3BhdGNoO1xuICAgICAgdmFyIGNoYWluID0gW107XG5cbiAgICAgIHZhciBtaWRkbGV3YXJlQVBJID0ge1xuICAgICAgICBnZXRTdGF0ZTogc3RvcmUuZ2V0U3RhdGUsXG4gICAgICAgIGRpc3BhdGNoOiBmdW5jdGlvbiBkaXNwYXRjaChhY3Rpb24pIHtcbiAgICAgICAgICByZXR1cm4gX2Rpc3BhdGNoKGFjdGlvbik7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjaGFpbiA9IG1pZGRsZXdhcmVzLm1hcChmdW5jdGlvbiAobWlkZGxld2FyZSkge1xuICAgICAgICByZXR1cm4gbWlkZGxld2FyZShtaWRkbGV3YXJlQVBJKTtcbiAgICAgIH0pO1xuICAgICAgX2Rpc3BhdGNoID0gY29tcG9zZS5hcHBseSh1bmRlZmluZWQsIGNoYWluKShzdG9yZS5kaXNwYXRjaCk7XG5cbiAgICAgIHJldHVybiBfZXh0ZW5kcyh7fSwgc3RvcmUsIHtcbiAgICAgICAgZGlzcGF0Y2g6IF9kaXNwYXRjaFxuICAgICAgfSk7XG4gICAgfTtcbiAgfTtcbn0iLCJpbXBvcnQgY3JlYXRlU3RvcmUgZnJvbSAnLi9jcmVhdGVTdG9yZSc7XG5pbXBvcnQgY29tYmluZVJlZHVjZXJzIGZyb20gJy4vY29tYmluZVJlZHVjZXJzJztcbmltcG9ydCBiaW5kQWN0aW9uQ3JlYXRvcnMgZnJvbSAnLi9iaW5kQWN0aW9uQ3JlYXRvcnMnO1xuaW1wb3J0IGFwcGx5TWlkZGxld2FyZSBmcm9tICcuL2FwcGx5TWlkZGxld2FyZSc7XG5pbXBvcnQgY29tcG9zZSBmcm9tICcuL2NvbXBvc2UnO1xuaW1wb3J0IHdhcm5pbmcgZnJvbSAnLi91dGlscy93YXJuaW5nJztcblxuLypcbiogVGhpcyBpcyBhIGR1bW15IGZ1bmN0aW9uIHRvIGNoZWNrIGlmIHRoZSBmdW5jdGlvbiBuYW1lIGhhcyBiZWVuIGFsdGVyZWQgYnkgbWluaWZpY2F0aW9uLlxuKiBJZiB0aGUgZnVuY3Rpb24gaGFzIGJlZW4gbWluaWZpZWQgYW5kIE5PREVfRU5WICE9PSAncHJvZHVjdGlvbicsIHdhcm4gdGhlIHVzZXIuXG4qL1xuZnVuY3Rpb24gaXNDcnVzaGVkKCkge31cblxuaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicgJiYgdHlwZW9mIGlzQ3J1c2hlZC5uYW1lID09PSAnc3RyaW5nJyAmJiBpc0NydXNoZWQubmFtZSAhPT0gJ2lzQ3J1c2hlZCcpIHtcbiAgd2FybmluZygnWW91IGFyZSBjdXJyZW50bHkgdXNpbmcgbWluaWZpZWQgY29kZSBvdXRzaWRlIG9mIE5PREVfRU5WID09PSBcXCdwcm9kdWN0aW9uXFwnLiAnICsgJ1RoaXMgbWVhbnMgdGhhdCB5b3UgYXJlIHJ1bm5pbmcgYSBzbG93ZXIgZGV2ZWxvcG1lbnQgYnVpbGQgb2YgUmVkdXguICcgKyAnWW91IGNhbiB1c2UgbG9vc2UtZW52aWZ5IChodHRwczovL2dpdGh1Yi5jb20vemVydG9zaC9sb29zZS1lbnZpZnkpIGZvciBicm93c2VyaWZ5ICcgKyAnb3IgRGVmaW5lUGx1Z2luIGZvciB3ZWJwYWNrIChodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzMwMDMwMDMxKSAnICsgJ3RvIGVuc3VyZSB5b3UgaGF2ZSB0aGUgY29ycmVjdCBjb2RlIGZvciB5b3VyIHByb2R1Y3Rpb24gYnVpbGQuJyk7XG59XG5cbmV4cG9ydCB7IGNyZWF0ZVN0b3JlLCBjb21iaW5lUmVkdWNlcnMsIGJpbmRBY3Rpb25DcmVhdG9ycywgYXBwbHlNaWRkbGV3YXJlLCBjb21wb3NlIH07IiwiZXhwb3J0IGNvbnN0IHZhbHVlc0Zyb21EZWYgPSAocm93cywgY29sdW1ucykgPT4gKHt4ID0gMSwgeSA9IDEsIGR4ID0gMSwgZHkgPSAxfT17fSkgPT4ge1xuICBjb25zdCB2YWx1ZXMgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3dzICogY29sdW1uczsgaSsrKSB7XG4gICAgY29uc3QgciA9IE1hdGguZmxvb3IoaSAvIHJvd3MpICsgMTtcbiAgICBjb25zdCBjID0gaSAlIGNvbHVtbnMgKyAxO1xuICAgIHZhbHVlcy5wdXNoKHIgPj0geSAmJiByIDwgeSArIGR5ICYmIGMgPj0geCAmJiBjIDwgeCArIGR4ID8gMSA6IDApO1xuICB9XG4gIHJldHVybiB2YWx1ZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZGVmRnJvbUluZGV4ID0gKHJvd3MsIGNvbHVtbnMpID0+IChpKSA9PiB7XG4gIGNvbnN0IHggPSBpICUgY29sdW1ucyArIDE7XG4gIGNvbnN0IHkgPSBNYXRoLmZsb29yKGkgLyByb3dzKSArIDE7XG4gIHJldHVybiB7eCwgeX07XG59O1xuXG5leHBvcnQgY29uc3QgaW5kZXhGcm9tRGVmID0gKHJvd3MsIGNvbHVtbnMpID0+ICh4LCB5KSA9PiAoeSAtIDEpICogcm93cyArIHggLSAxO1xuXG5leHBvcnQgY29uc3QgQXJlYUZhY3RvcnkgPSAocm93cywgY29sdW1ucykgPT4ge1xuICBjb25zdCBpVG9EZWYgPSBkZWZGcm9tSW5kZXgocm93cywgY29sdW1ucyk7XG4gIGNvbnN0IGRlZlRvSSA9IGluZGV4RnJvbURlZihyb3dzLCBjb2x1bW5zKTtcblxuICBjb25zdCBmYWN0b3J5ID0gdmFsdWVzID0+IE9iamVjdC5jcmVhdGUoUHJvdG8sIHtcbiAgICB2YWx1ZXM6IHt2YWx1ZTogWy4uLnZhbHVlc119LCBsZW5ndGg6IHtcbiAgICAgIGdldCgpe1xuICAgICAgICByZXR1cm4gdmFsdWVzLmZpbHRlcih2ID0+IHYgPT09IDEpLmxlbmd0aFxuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgY29uc3QgUHJvdG8gPSB7XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKXtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHRoaXMudmFsdWVzO1xuICAgICAgcmV0dXJuIChmdW5jdGlvbiAqICgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAodmFsdWVzW2ldID09PSAxKSB7XG4gICAgICAgICAgICB5aWVsZCBpVG9EZWYoaSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgIH0sXG4gICAgaW50ZXJzZWN0aW9uKGFyZWEpe1xuICAgICAgcmV0dXJuIGZhY3RvcnkodGhpcy52YWx1ZXMubWFwKCh2LCBpKSA9PiB2ICogYXJlYS52YWx1ZXNbaV0pKTtcbiAgICB9LFxuICAgIGluY2x1ZGVzKGFyZWEpe1xuICAgICAgY29uc3QgaXNPbmUgPSB2ID0+IHYgPT09IDE7XG4gICAgICByZXR1cm4gdGhpcy5pbnRlcnNlY3Rpb24oYXJlYSkudmFsdWVzLmZpbHRlcihpc09uZSkubGVuZ3RoID09PSBhcmVhLnZhbHVlcy5maWx0ZXIoaXNPbmUpLmxlbmd0aDtcbiAgICB9LFxuICAgIGlzSW5jbHVkZWQoYXJlYSl7XG4gICAgICByZXR1cm4gYXJlYS5pbmNsdWRlcyh0aGlzKTtcbiAgICB9LFxuICAgIHVuaW9uKGFyZWEpe1xuICAgICAgcmV0dXJuIGZhY3RvcnkodGhpcy52YWx1ZXMubWFwKCh2LCBpKSA9PiB2ICsgYXJlYS52YWx1ZXNbaV0gPiAwID8gMSA6IDApKTtcbiAgICB9LFxuICAgIGNvbXBsZW1lbnQoKXtcbiAgICAgIHJldHVybiBmYWN0b3J5KHRoaXMudmFsdWVzLm1hcCh2ID0+IDEgLSB2KSk7XG4gICAgfSxcbiAgICBkZWJ1Zygpe1xuICAgICAgbGV0IHByaW50ID0gJyc7XG4gICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSByb3dzOyBpKyspIHtcbiAgICAgICAgbGV0IGxpbmUgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaiA9IDE7IGogPD0gY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgY29uc3QgaW5kZXhGcm9tRGVmMiA9IGRlZlRvSShqLCBpKTtcbiAgICAgICAgICBsaW5lLnB1c2godGhpcy52YWx1ZXNbaW5kZXhGcm9tRGVmMl0pO1xuICAgICAgICB9XG4gICAgICAgIHByaW50ICs9IGBcbiR7bGluZS5qb2luKCcgJyl9XG5gXG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhwcmludCk7XG4gICAgfVxuICB9O1xuICByZXR1cm4gZmFjdG9yeTtcbn07XG5cbmV4cG9ydCBjb25zdCBHcmlkID0gKHtwYW5lbHNEYXRhID0gW10sIHJvd3MgPSA0LCBjb2x1bW5zID0gNH0gPXt9KSA9PiB7XG4gIGNvbnN0IGlUb0RlZiA9IGRlZkZyb21JbmRleChyb3dzLCBjb2x1bW5zKTtcbiAgY29uc3QgYXJlYSA9IEFyZWFGYWN0b3J5KHJvd3MsIGNvbHVtbnMpO1xuICBjb25zdCB0b1ZhbHVlcyA9IHZhbHVlc0Zyb21EZWYocm93cywgY29sdW1ucyk7XG4gIGxldCBwYW5lbHMgPSBbLi4ucGFuZWxzRGF0YV07XG4gIGlmIChyb3dzICogY29sdW1ucy5sZW5ndGggIT09IHBhbmVsc0RhdGEubGVuZ3RoKSB7XG4gICAgcGFuZWxzID0gKG5ldyBBcnJheShyb3dzICogY29sdW1ucykpLmZpbGwoMCkubWFwKChfLCBpbmRleCkgPT4gT2JqZWN0LmFzc2lnbihpVG9EZWYoaW5kZXgpLCB7XG4gICAgICBkeDogMSxcbiAgICAgIGR5OiAxLFxuICAgICAgYWRvcm5lclN0YXR1czogMCxcbiAgICAgIGRhdGE6IHt9XG4gICAgfSkpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpe1xuICAgICAgcmV0dXJuIChmdW5jdGlvbiAqICgpIHtcbiAgICAgICAgZm9yIChsZXQgcCBvZiBwYW5lbHMpIHtcbiAgICAgICAgICB5aWVsZCBPYmplY3QuYXNzaWduKHt9LCBwKTtcbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICB9LFxuICAgIHVwZGF0ZUF0KHgsIHksIGRhdGEpe1xuICAgICAgY29uc3QgcCA9IHBhbmVscy5maW5kKHAgPT4gcC54ID09PSB4ICYmIHAueSA9PT0geSk7XG4gICAgICBPYmplY3QuYXNzaWduKHAsIGRhdGEpO1xuICAgICAgcmV0dXJuIHA7XG4gICAgfSxcbiAgICBwYW5lbCh4LCB5KXtcbiAgICAgIHJldHVybiBhcmVhKHRvVmFsdWVzKHBhbmVscy5maW5kKHAgPT4gcC54ID09PSB4ICYmIHAueSA9PT0geSkpKTtcbiAgICB9LFxuICAgIGFyZWEoeCwgeSwgZHggPSAxLCBkeSA9IDEpe1xuICAgICAgcmV0dXJuIGFyZWEodG9WYWx1ZXMoe3gsIHksIGR4LCBkeX0pKTtcbiAgICB9LFxuICAgIGdldERhdGEoeCwgeSl7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSxwYW5lbHMuZmluZChwID0+IHAueCA9PT0geCAmJiBwLnkgPT09IHkpIHx8IHt9KTtcbiAgICB9XG4gIH07XG59OyIsImltcG9ydCB7R3JpZH0gZnJvbSAnLi4vbGliL2dyaWQnO1xuaW1wb3J0IHtST1dTLCBDT0xVTU5TfSBmcm9tICcuLi9saWIvY29uc3RhbnRzJztcblxuZXhwb3J0IGRlZmF1bHQgR3JpZCh7cm93czogUk9XUywgY29sdW1uczogQ09MVU1OU30pO1xuIiwiaW1wb3J0IHtHcmlkfSBmcm9tICcuLi9saWIvZ3JpZCc7XG5cbmV4cG9ydCBkZWZhdWx0IChncmlkID0gR3JpZCgpKSA9PiAoc3RhdGUgPSB7YWN0aXZlOiBudWxsLCBwYW5lbHM6IFsuLi5ncmlkXX0sIGFjdGlvbikgPT4ge1xuXG4gIGNvbnN0IHJlc2l6ZU92ZXIgPSAoc3RhdGUsIGFjdGlvbikgPT4ge1xuICAgIGNvbnN0IHt4LCB5fSA9YWN0aW9uO1xuICAgIGNvbnN0IHthY3RpdmV9ID0gc3RhdGU7XG4gICAgY29uc3Qge3g6c3RhcnRYLCB5OnN0YXJ0WX0gPSBhY3RpdmU7XG4gICAgaWYgKHggPj0gc3RhcnRYICYmIHkgPj0gc3RhcnRZKSB7XG4gICAgICBjb25zdCBkeCA9IHggLSBzdGFydFggKyAxO1xuICAgICAgY29uc3QgZHkgPSB5IC0gc3RhcnRZICsgMTtcbiAgICAgIGNvbnN0IGFjdGl2ZUFyZWEgPSBncmlkLmFyZWEoc3RhcnRYLCBzdGFydFksIGR4LCBkeSk7XG4gICAgICBjb25zdCBpbmFjdGl2ZUFyZWEgPSBhY3RpdmVBcmVhLmNvbXBsZW1lbnQoKTtcbiAgICAgIGNvbnN0IGFsbEJ1dFN0YXJ0ID0gZ3JpZC5hcmVhKHN0YXJ0WCwgc3RhcnRZKS5jb21wbGVtZW50KCk7XG4gICAgICBjb25zdCBpbnZhbGlkQ2VsbHNBcmVhID0gWy4uLmFsbEJ1dFN0YXJ0XVxuICAgICAgICAubWFwKHAgPT4gZ3JpZC5wYW5lbChwLngsIHAueSkpXG4gICAgICAgIC5maWx0ZXIocCA9PiB7XG4gICAgICAgICAgY29uc3QgaW50ZXJzZWN0aW9uID0gcC5pbnRlcnNlY3Rpb24oYWN0aXZlQXJlYSk7XG4gICAgICAgICAgcmV0dXJuIGludGVyc2VjdGlvbi5sZW5ndGggPiAwICYmIGFjdGl2ZUFyZWEuaW5jbHVkZXMocCkgPT09IGZhbHNlO1xuICAgICAgICB9KVxuICAgICAgICAucmVkdWNlKChhY2MsIGN1cnJlbnQpID0+IGFjYy51bmlvbihjdXJyZW50KSwgZ3JpZC5hcmVhKDEsIDEsIDAsIDApKTtcblxuICAgICAgZm9yIChsZXQge3gsIHl9IG9mIGluYWN0aXZlQXJlYSkge1xuICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAwfSk7XG4gICAgICB9XG5cbiAgICAgIGZvciAobGV0IHt4LCB5fSBvZiBhY3RpdmVBcmVhKSB7XG4gICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IDF9KTtcbiAgICAgIH1cblxuICAgICAgZm9yIChsZXQge3gsIHl9IG9mIGludmFsaWRDZWxsc0FyZWEpIHtcbiAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogLTF9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICAgIGFjdGl2ZTogT2JqZWN0LmFzc2lnbih7fSwgYWN0aXZlLCB7dmFsaWQ6IGludmFsaWRDZWxsc0FyZWEubGVuZ3RoID09PSAwfSksXG4gICAgICAgIHBhbmVsczogWy4uLmdyaWRdXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oc3RhdGUsIHthY3RpdmU6IE9iamVjdC5hc3NpZ24oe30sIGFjdGl2ZSwge3ZhbGlkOiBmYWxzZX0pfSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IG1vdmVPdmVyID0gKHN0YXRlLCBhY3Rpb24pID0+IHtcbiAgICBjb25zdCB7eCwgeX0gPWFjdGlvbjtcbiAgICBjb25zdCB7YWN0aXZlfSA9IHN0YXRlO1xuICAgIGNvbnN0IHt4OnN0YXJ0WCwgeTpzdGFydFl9ID0gYWN0aXZlO1xuXG4gICAgY29uc3Qge2R4LCBkeX0gPSBncmlkLmdldERhdGEoc3RhcnRYLCBzdGFydFkpO1xuXG4gICAgY29uc3Qgb3JpZ2luYWxQYW5lbCA9IGdyaWQucGFuZWwoc3RhcnRYLCBzdGFydFkpO1xuICAgIGNvbnN0IGV4cGVjdGVkQXJlYSA9IGdyaWQuYXJlYSh4LCB5LCBkeCwgZHkpO1xuICAgIGNvbnN0IGFjdGl2ZUFyZWEgPSBvcmlnaW5hbFBhbmVsLnVuaW9uKGV4cGVjdGVkQXJlYSk7XG4gICAgbGV0IGludmFsaWRBcmVhO1xuXG4gICAgaWYgKGV4cGVjdGVkQXJlYS5sZW5ndGggPCBvcmlnaW5hbFBhbmVsLmxlbmd0aCkge1xuICAgICAgaW52YWxpZEFyZWEgPSBhY3RpdmVBcmVhO1xuICAgIH0gZWxzZSB7XG4gICAgICBpbnZhbGlkQXJlYSA9IFsuLi5vcmlnaW5hbFBhbmVsLmNvbXBsZW1lbnQoKV1cbiAgICAgICAgLm1hcChhID0+IGdyaWQucGFuZWwoYS54LCBhLnkpKVxuICAgICAgICAuZmlsdGVyKHAgPT4ge1xuICAgICAgICAgIGNvbnN0IGludGVyc2VjdGlvbiA9IHAuaW50ZXJzZWN0aW9uKGV4cGVjdGVkQXJlYSk7XG4gICAgICAgICAgcmV0dXJuIGludGVyc2VjdGlvbi5sZW5ndGggPiAwICYmIGV4cGVjdGVkQXJlYS5pbmNsdWRlcyhwKSA9PT0gZmFsc2U7XG4gICAgICAgIH0pXG4gICAgICAgIC5yZWR1Y2UoKGFjYywgY3VycmVudCkgPT4gYWNjLnVuaW9uKGN1cnJlbnQpLCBncmlkLmFyZWEoMSwgMSwgMCwgMCkpO1xuICAgIH1cblxuICAgIGNvbnN0IGluYWN0aXZlQXJlYSA9IGFjdGl2ZUFyZWEuY29tcGxlbWVudCgpO1xuXG4gICAgZm9yIChsZXQge3gsIHl9IG9mIGluYWN0aXZlQXJlYSkge1xuICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogMH0pO1xuICAgIH1cblxuICAgIGZvciAobGV0IHt4LCB5fSBvZiBhY3RpdmVBcmVhKSB7XG4gICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAxfSk7XG4gICAgfVxuXG4gICAgZm9yIChsZXQge3gsIHl9IG9mIGludmFsaWRBcmVhKSB7XG4gICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAtMX0pO1xuICAgIH1cblxuICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge1xuICAgICAgcGFuZWxzOiBbLi4uZ3JpZF0sXG4gICAgICBhY3RpdmU6IE9iamVjdC5hc3NpZ24oe30sIGFjdGl2ZSwge3ZhbGlkOiBpbnZhbGlkQXJlYS5sZW5ndGggPT09IDB9KVxuICAgIH0pO1xuICB9O1xuXG4gIHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcbiAgICBjYXNlICdTVEFSVF9SRVNJWkUnOiB7XG4gICAgICBjb25zdCB7eCwgeX09YWN0aW9uO1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7YWN0aXZlOiB7eCwgeSwgb3BlcmF0aW9uOiAncmVzaXplJ319KTtcbiAgICB9XG4gICAgY2FzZSAnU1RBUlRfTU9WRSc6IHtcbiAgICAgIGNvbnN0IHt4LCB5fT1hY3Rpb247XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHthY3RpdmU6IHt4LCB5LCBvcGVyYXRpb246ICdtb3ZlJ319KTtcbiAgICB9XG4gICAgY2FzZSAnRFJBR19PVkVSJzoge1xuICAgICAgY29uc3Qge2FjdGl2ZSA9IHt9fSA9IHN0YXRlO1xuICAgICAgaWYgKCFhY3RpdmUub3BlcmF0aW9uKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBhY3RpdmUub3BlcmF0aW9uID09PSAnbW92ZScgPyBtb3ZlT3ZlcihzdGF0ZSwgYWN0aW9uKSA6IHJlc2l6ZU92ZXIoc3RhdGUsIGFjdGlvbik7XG4gICAgICB9XG4gICAgfVxuICAgIGNhc2UgJ0VORF9SRVNJWkUnOiB7XG4gICAgICBjb25zdCB7eCwgeSwgc3RhcnRYLCBzdGFydFl9ID1hY3Rpb247XG4gICAgICBjb25zdCBkeCA9IHggLSBzdGFydFggKyAxO1xuICAgICAgY29uc3QgZHkgPSB5IC0gc3RhcnRZICsgMTtcbiAgICAgIGNvbnN0IHthY3RpdmV9ID1zdGF0ZTtcbiAgICAgIGlmIChhY3RpdmUudmFsaWQgPT09IHRydWUpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlQXJlYSA9IGdyaWQuYXJlYShzdGFydFgsIHN0YXJ0WSwgZHgsIGR5KTtcbiAgICAgICAgY29uc3QgW2Jhc2VDZWxsLCAuLi5vdGhlckNlbGxzXSA9IGFjdGl2ZUFyZWE7XG4gICAgICAgIGdyaWQudXBkYXRlQXQoc3RhcnRYLCBzdGFydFksIHtkeCwgZHl9KTtcbiAgICAgICAgZm9yIChjb25zdCB7eCwgeX0gb2Ygb3RoZXJDZWxscykge1xuICAgICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2R4OiAxLCBkeTogMX0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmb3IgKGxldCB7eCwgeX0gb2YgWy4uLmdyaWRdKSB7XG4gICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IDB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICAgIHBhbmVsczogWy4uLmdyaWRdLFxuICAgICAgICBhY3RpdmU6IG51bGxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjYXNlICdFTkRfTU9WRSc6IHtcbiAgICAgIGNvbnN0IHt4LCB5LCBzdGFydFgsIHN0YXJ0WX0gPWFjdGlvbjtcbiAgICAgIGNvbnN0IGRlbHRhWCA9IHN0YXJ0WCAtIHg7XG4gICAgICBjb25zdCBkZWx0YVkgPSBzdGFydFkgLSB5O1xuICAgICAgY29uc3Qge2FjdGl2ZX0gPXN0YXRlO1xuICAgICAgaWYgKGFjdGl2ZS52YWxpZCA9PT0gdHJ1ZSkge1xuICAgICAgICBjb25zdCBzdGFydERhdGEgPSBncmlkLmdldERhdGEoc3RhcnRYLCBzdGFydFkpO1xuICAgICAgICBjb25zdCB7ZHgsIGR5fSA9c3RhcnREYXRhO1xuICAgICAgICBjb25zdCBjbGFpbWVkQXJlYSA9IGdyaWQuYXJlYSh4LCB5LCBkeCwgZHkpO1xuICAgICAgICBmb3IgKHt4OiBjeCwgeTogY3l9IG9mIGNsYWltZWRBcmVhKSB7XG4gICAgICAgICAgY29uc3QgbmV3WCA9IGN4ICsgZGVsdGFYO1xuICAgICAgICAgIGNvbnN0IG5ld1kgPSBjeSArIGRlbHRhWTtcbiAgICAgICAgICBjb25zdCBuZXdEYXRhID0gT2JqZWN0LmFzc2lnbihncmlkLmdldERhdGEoY3gsIGN5KSwge3g6IG5ld1gsIHk6IG5ld1l9KTtcbiAgICAgICAgICBncmlkLnVwZGF0ZUF0KG5ld1gsIG5ld1ksIG5ld0RhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwgT2JqZWN0LmFzc2lnbihzdGFydERhdGEsIHt4LCB5fSkpO1xuICAgICAgfVxuICAgICAgZm9yIChsZXQge3gsIHl9IG9mIFsuLi5ncmlkXSkge1xuICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAwfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge1xuICAgICAgICBwYW5lbHM6IFsuLi5ncmlkXSxcbiAgICAgICAgYWN0aXZlOiBudWxsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY2FzZSAnVVBEQVRFX1BBTkVMX0RBVEEnOiB7XG4gICAgICBjb25zdCB7eCwgeSwgZGF0YX0gPSBhY3Rpb247XG4gICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHtkYXRhfSk7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtwYW5lbHM6IFsuLi5ncmlkXX0pO1xuICAgIH1cbiAgICBjYXNlICdSRVNFVF9QQU5FTCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5fSA9IGFjdGlvbjtcbiAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2RhdGE6IHt9fSk7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtwYW5lbHM6IFsuLi5ncmlkXX0pO1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHN0YXRlO1xuICB9XG59O1xuXG4iLCJleHBvcnQgZGVmYXVsdCAoZ3JpZCkgPT4gKHN0YXRlID0ge2lzT3BlbjogZmFsc2V9LCBhY3Rpb24pID0+IHtcbiAgY29uc3Qge3R5cGUsIHRpdGxlLCBtb2RhbFR5cGUsIHgsIHl9ID0gYWN0aW9uO1xuICBjb25zdCBtb2RhbERhdGEgPSBPYmplY3QuYXNzaWduKHt9LCBhY3Rpb24pO1xuICBkZWxldGUgIG1vZGFsRGF0YS50eXBlO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdPUEVOX01PREFMJzoge1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCBtb2RhbERhdGEsIHtpc09wZW46IHRydWV9KTtcbiAgICB9XG4gICAgY2FzZSAnQ0xPU0VfTU9EQUwnOiB7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIG1vZGFsRGF0YSwge2lzT3BlbjogZmFsc2UsIHRpdGxlOiAnJywgbW9kYWxUeXBlOiAnbm9uZSd9KTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgfVxufTsiLCJleHBvcnQgZGVmYXVsdCAoc3RhdGUgPSBbXSwgYWN0aW9uKSA9PiB7XG4gIGNvbnN0IHt0eXBlfSA9IGFjdGlvbjtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnQ1JFQVRFX1NNQVJUX0xJU1QnOiB7XG4gICAgICBjb25zdCB7eCwgeSwgdGFibGVTdGF0ZSwgaXRlbXN9ID0gYWN0aW9uO1xuICAgICAgcmV0dXJuIHN0YXRlLmNvbmNhdCh7eCwgeSwgdGFibGVTdGF0ZSwgaXRlbXN9KTtcbiAgICB9XG4gICAgY2FzZSAnVVBEQVRFX1NNQVJUX0xJU1QnOiB7XG4gICAgICBjb25zdCB7eCwgeSwgdGFibGVTdGF0ZSwgaXRlbXN9ID0gYWN0aW9uO1xuICAgICAgcmV0dXJuIHN0YXRlLm1hcCgoc2wpID0+IHtcbiAgICAgICAgaWYgKHNsLnggPT09IHggJiYgc2wueSA9PT0geSkge1xuICAgICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzbCwge3RhYmxlU3RhdGUsIGl0ZW1zfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHNsO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgY2FzZSAnUkVNT1ZFX1NNQVJUX0xJU1QnOiB7XG4gICAgICBjb25zdCB7eCwgeX0gPSBhY3Rpb247XG4gICAgICByZXR1cm4gc3RhdGUuZmlsdGVyKGYgPT4gZi54ICE9PSB4IHx8IGYueSAhPT0geSk7XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3RhdGU7XG4gIH1cbn07IiwiaW1wb3J0IGdyaWRSZWR1Y2VyIGZyb20gJy4vZ3JpZCc7XG5pbXBvcnQgbW9kYWxSZWR1Y2VyIGZyb20gJy4vbW9kYWwnO1xuaW1wb3J0IHNtYXJ0TGlzdFJlZHVjZXIgZnJvbSAnLi9zbWFydExpc3QnO1xuXG5leHBvcnQgZGVmYXVsdCAoZ3JpZCkgPT4gKHN0YXRlID0ge30sIGFjdGlvbikgPT4gKHtcbiAgZ3JpZDogZ3JpZFJlZHVjZXIoZ3JpZCkoc3RhdGUuZ3JpZCwgYWN0aW9uKSxcbiAgbW9kYWw6IG1vZGFsUmVkdWNlcihncmlkKShzdGF0ZS5tb2RhbCwgYWN0aW9uKSxcbiAgc21hcnRMaXN0OiBzbWFydExpc3RSZWR1Y2VyKHN0YXRlLnNtYXJ0TGlzdCwgYWN0aW9uKVxufSk7XG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBwb2ludGVyIChwYXRoKSB7XG5cbiAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG5cbiAgZnVuY3Rpb24gcGFydGlhbCAob2JqID0ge30sIHBhcnRzID0gW10pIHtcbiAgICBjb25zdCBwID0gcGFydHMuc2hpZnQoKTtcbiAgICBjb25zdCBjdXJyZW50ID0gb2JqW3BdO1xuICAgIHJldHVybiAoY3VycmVudCA9PT0gdW5kZWZpbmVkIHx8IHBhcnRzLmxlbmd0aCA9PT0gMCkgP1xuICAgICAgY3VycmVudCA6IHBhcnRpYWwoY3VycmVudCwgcGFydHMpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0ICh0YXJnZXQsIG5ld1RyZWUpIHtcbiAgICBsZXQgY3VycmVudCA9IHRhcmdldDtcbiAgICBjb25zdCBbbGVhZiwgLi4uaW50ZXJtZWRpYXRlXSA9IHBhcnRzLnJldmVyc2UoKTtcbiAgICBmb3IgKGxldCBrZXkgb2YgaW50ZXJtZWRpYXRlLnJldmVyc2UoKSkge1xuICAgICAgaWYgKGN1cnJlbnRba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGN1cnJlbnRba2V5XSA9IHt9O1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudFtrZXldO1xuICAgICAgfVxuICAgIH1cbiAgICBjdXJyZW50W2xlYWZdID0gT2JqZWN0LmFzc2lnbihjdXJyZW50W2xlYWZdIHx8IHt9LCBuZXdUcmVlKTtcbiAgICByZXR1cm4gdGFyZ2V0O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBnZXQodGFyZ2V0KXtcbiAgICAgIHJldHVybiBwYXJ0aWFsKHRhcmdldCwgWy4uLnBhcnRzXSlcbiAgICB9LFxuICAgIHNldFxuICB9XG59O1xuIiwiaW1wb3J0IHtzd2FwfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHBvaW50ZXIgZnJvbSAnc21hcnQtdGFibGUtanNvbi1wb2ludGVyJztcblxuXG5mdW5jdGlvbiBzb3J0QnlQcm9wZXJ0eSAocHJvcCkge1xuICBjb25zdCBwcm9wR2V0dGVyID0gcG9pbnRlcihwcm9wKS5nZXQ7XG4gIHJldHVybiAoYSwgYikgPT4ge1xuICAgIGNvbnN0IGFWYWwgPSBwcm9wR2V0dGVyKGEpO1xuICAgIGNvbnN0IGJWYWwgPSBwcm9wR2V0dGVyKGIpO1xuXG4gICAgaWYgKGFWYWwgPT09IGJWYWwpIHtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIGlmIChiVmFsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBpZiAoYVZhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICByZXR1cm4gYVZhbCA8IGJWYWwgPyAtMSA6IDE7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gc29ydEZhY3RvcnkgKHtwb2ludGVyLCBkaXJlY3Rpb259ID0ge30pIHtcbiAgaWYgKCFwb2ludGVyIHx8IGRpcmVjdGlvbiA9PT0gJ25vbmUnKSB7XG4gICAgcmV0dXJuIGFycmF5ID0+IFsuLi5hcnJheV07XG4gIH1cblxuICBjb25zdCBvcmRlckZ1bmMgPSBzb3J0QnlQcm9wZXJ0eShwb2ludGVyKTtcbiAgY29uc3QgY29tcGFyZUZ1bmMgPSBkaXJlY3Rpb24gPT09ICdkZXNjJyA/IHN3YXAob3JkZXJGdW5jKSA6IG9yZGVyRnVuYztcblxuICByZXR1cm4gKGFycmF5KSA9PiBbLi4uYXJyYXldLnNvcnQoY29tcGFyZUZ1bmMpO1xufSIsImltcG9ydCB7Y29tcG9zZX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcbmltcG9ydCBwb2ludGVyIGZyb20gJ3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlcic7XG5cbmZ1bmN0aW9uIHR5cGVFeHByZXNzaW9uICh0eXBlKSB7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEJvb2xlYW47XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBOdW1iZXI7XG4gICAgY2FzZSAnZGF0ZSc6XG4gICAgICByZXR1cm4gKHZhbCkgPT4gbmV3IERhdGUodmFsKTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGNvbXBvc2UoU3RyaW5nLCAodmFsKSA9PiB2YWwudG9Mb3dlckNhc2UoKSk7XG4gIH1cbn1cblxuY29uc3Qgb3BlcmF0b3JzID0ge1xuICBpbmNsdWRlcyh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gaW5wdXQuaW5jbHVkZXModmFsdWUpO1xuICB9LFxuICBpcyh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gT2JqZWN0LmlzKHZhbHVlLCBpbnB1dCk7XG4gIH0sXG4gIGlzTm90KHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiAhT2JqZWN0LmlzKHZhbHVlLCBpbnB1dCk7XG4gIH0sXG4gIGx0KHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dCA8IHZhbHVlO1xuICB9LFxuICBndCh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gaW5wdXQgPiB2YWx1ZTtcbiAgfSxcbiAgbHRlKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dCA8PSB2YWx1ZTtcbiAgfSxcbiAgZ3RlKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dCA+PSB2YWx1ZTtcbiAgfSxcbiAgZXF1YWxzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiB2YWx1ZSA9PSBpbnB1dDtcbiAgfSxcbiAgbm90RXF1YWxzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiB2YWx1ZSAhPSBpbnB1dDtcbiAgfVxufTtcblxuY29uc3QgZXZlcnkgPSBmbnMgPT4gKC4uLmFyZ3MpID0+IGZucy5ldmVyeShmbiA9PiBmbiguLi5hcmdzKSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmVkaWNhdGUgKHt2YWx1ZSA9ICcnLCBvcGVyYXRvciA9ICdpbmNsdWRlcycsIHR5cGUgPSAnc3RyaW5nJ30pIHtcbiAgY29uc3QgdHlwZUl0ID0gdHlwZUV4cHJlc3Npb24odHlwZSk7XG4gIGNvbnN0IG9wZXJhdGVPblR5cGVkID0gY29tcG9zZSh0eXBlSXQsIG9wZXJhdG9yc1tvcGVyYXRvcl0pO1xuICBjb25zdCBwcmVkaWNhdGVGdW5jID0gb3BlcmF0ZU9uVHlwZWQodmFsdWUpO1xuICByZXR1cm4gY29tcG9zZSh0eXBlSXQsIHByZWRpY2F0ZUZ1bmMpO1xufVxuXG4vL2F2b2lkIHVzZWxlc3MgZmlsdGVyIGxvb2t1cCAoaW1wcm92ZSBwZXJmKVxuZnVuY3Rpb24gbm9ybWFsaXplQ2xhdXNlcyAoY29uZikge1xuICBjb25zdCBvdXRwdXQgPSB7fTtcbiAgY29uc3QgdmFsaWRQYXRoID0gT2JqZWN0LmtleXMoY29uZikuZmlsdGVyKHBhdGggPT4gQXJyYXkuaXNBcnJheShjb25mW3BhdGhdKSk7XG4gIHZhbGlkUGF0aC5mb3JFYWNoKHBhdGggPT4ge1xuICAgIGNvbnN0IHZhbGlkQ2xhdXNlcyA9IGNvbmZbcGF0aF0uZmlsdGVyKGMgPT4gYy52YWx1ZSAhPT0gJycpO1xuICAgIGlmICh2YWxpZENsYXVzZXMubGVuZ3RoKSB7XG4gICAgICBvdXRwdXRbcGF0aF0gPSB2YWxpZENsYXVzZXM7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZmlsdGVyIChmaWx0ZXIpIHtcbiAgY29uc3Qgbm9ybWFsaXplZENsYXVzZXMgPSBub3JtYWxpemVDbGF1c2VzKGZpbHRlcik7XG4gIGNvbnN0IGZ1bmNMaXN0ID0gT2JqZWN0LmtleXMobm9ybWFsaXplZENsYXVzZXMpLm1hcChwYXRoID0+IHtcbiAgICBjb25zdCBnZXR0ZXIgPSBwb2ludGVyKHBhdGgpLmdldDtcbiAgICBjb25zdCBjbGF1c2VzID0gbm9ybWFsaXplZENsYXVzZXNbcGF0aF0ubWFwKHByZWRpY2F0ZSk7XG4gICAgcmV0dXJuIGNvbXBvc2UoZ2V0dGVyLCBldmVyeShjbGF1c2VzKSk7XG4gIH0pO1xuICBjb25zdCBmaWx0ZXJQcmVkaWNhdGUgPSBldmVyeShmdW5jTGlzdCk7XG5cbiAgcmV0dXJuIChhcnJheSkgPT4gYXJyYXkuZmlsdGVyKGZpbHRlclByZWRpY2F0ZSk7XG59IiwiaW1wb3J0IHBvaW50ZXIgZnJvbSAnc21hcnQtdGFibGUtanNvbi1wb2ludGVyJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHNlYXJjaENvbmYgPSB7fSkge1xuICBjb25zdCB7dmFsdWUsIHNjb3BlID0gW119ID0gc2VhcmNoQ29uZjtcbiAgY29uc3Qgc2VhcmNoUG9pbnRlcnMgPSBzY29wZS5tYXAoZmllbGQgPT4gcG9pbnRlcihmaWVsZCkuZ2V0KTtcbiAgaWYgKCFzY29wZS5sZW5ndGggfHwgIXZhbHVlKSB7XG4gICAgcmV0dXJuIGFycmF5ID0+IGFycmF5O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBhcnJheSA9PiBhcnJheS5maWx0ZXIoaXRlbSA9PiBzZWFyY2hQb2ludGVycy5zb21lKHAgPT4gU3RyaW5nKHAoaXRlbSkpLmluY2x1ZGVzKFN0cmluZyh2YWx1ZSkpKSlcbiAgfVxufSIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHNsaWNlRmFjdG9yeSAoe3BhZ2UgPSAxLCBzaXplfSA9IHt9KSB7XG4gIHJldHVybiBmdW5jdGlvbiBzbGljZUZ1bmN0aW9uIChhcnJheSA9IFtdKSB7XG4gICAgY29uc3QgYWN0dWFsU2l6ZSA9IHNpemUgfHwgYXJyYXkubGVuZ3RoO1xuICAgIGNvbnN0IG9mZnNldCA9IChwYWdlIC0gMSkgKiBhY3R1YWxTaXplO1xuICAgIHJldHVybiBhcnJheS5zbGljZShvZmZzZXQsIG9mZnNldCArIGFjdHVhbFNpemUpO1xuICB9O1xufVxuIiwiZXhwb3J0IGNvbnN0IFRPR0dMRV9TT1JUID0gJ1RPR0dMRV9TT1JUJztcbmV4cG9ydCBjb25zdCBESVNQTEFZX0NIQU5HRUQgPSAnRElTUExBWV9DSEFOR0VEJztcbmV4cG9ydCBjb25zdCBQQUdFX0NIQU5HRUQgPSAnQ0hBTkdFX1BBR0UnO1xuZXhwb3J0IGNvbnN0IEVYRUNfQ0hBTkdFRCA9ICdFWEVDX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IEZJTFRFUl9DSEFOR0VEID0gJ0ZJTFRFUl9DSEFOR0VEJztcbmV4cG9ydCBjb25zdCBTVU1NQVJZX0NIQU5HRUQgPSAnU1VNTUFSWV9DSEFOR0VEJztcbmV4cG9ydCBjb25zdCBTRUFSQ0hfQ0hBTkdFRCA9ICdTRUFSQ0hfQ0hBTkdFRCc7XG5leHBvcnQgY29uc3QgRVhFQ19FUlJPUiA9ICdFWEVDX0VSUk9SJzsiLCJpbXBvcnQgc2xpY2UgZnJvbSAnLi4vc2xpY2UnO1xuaW1wb3J0IHtjdXJyeSwgdGFwLCBjb21wb3NlfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHBvaW50ZXIgZnJvbSAnc21hcnQtdGFibGUtanNvbi1wb2ludGVyJztcbmltcG9ydCB7ZW1pdHRlcn0gZnJvbSAnc21hcnQtdGFibGUtZXZlbnRzJztcbmltcG9ydCBzbGljZUZhY3RvcnkgZnJvbSAnLi4vc2xpY2UnO1xuaW1wb3J0IHtcbiAgU1VNTUFSWV9DSEFOR0VELFxuICBUT0dHTEVfU09SVCxcbiAgRElTUExBWV9DSEFOR0VELFxuICBQQUdFX0NIQU5HRUQsXG4gIEVYRUNfQ0hBTkdFRCxcbiAgRklMVEVSX0NIQU5HRUQsXG4gIFNFQVJDSF9DSEFOR0VELFxuICBFWEVDX0VSUk9SXG59IGZyb20gJy4uL2V2ZW50cyc7XG5cbmZ1bmN0aW9uIGN1cnJpZWRQb2ludGVyIChwYXRoKSB7XG4gIGNvbnN0IHtnZXQsIHNldH0gPSBwb2ludGVyKHBhdGgpO1xuICByZXR1cm4ge2dldCwgc2V0OiBjdXJyeShzZXQpfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHtcbiAgc29ydEZhY3RvcnksXG4gIHRhYmxlU3RhdGUsXG4gIGRhdGEsXG4gIGZpbHRlckZhY3RvcnksXG4gIHNlYXJjaEZhY3Rvcnlcbn0pIHtcbiAgY29uc3QgdGFibGUgPSBlbWl0dGVyKCk7XG4gIGNvbnN0IHNvcnRQb2ludGVyID0gY3VycmllZFBvaW50ZXIoJ3NvcnQnKTtcbiAgY29uc3Qgc2xpY2VQb2ludGVyID0gY3VycmllZFBvaW50ZXIoJ3NsaWNlJyk7XG4gIGNvbnN0IGZpbHRlclBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignZmlsdGVyJyk7XG4gIGNvbnN0IHNlYXJjaFBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc2VhcmNoJyk7XG5cbiAgY29uc3Qgc2FmZUFzc2lnbiA9IGN1cnJ5KChiYXNlLCBleHRlbnNpb24pID0+IE9iamVjdC5hc3NpZ24oe30sIGJhc2UsIGV4dGVuc2lvbikpO1xuICBjb25zdCBkaXNwYXRjaCA9IGN1cnJ5KHRhYmxlLmRpc3BhdGNoLmJpbmQodGFibGUpLCAyKTtcblxuICBjb25zdCBkaXNwYXRjaFN1bW1hcnkgPSAoZmlsdGVyZWQpID0+IHtcbiAgICBkaXNwYXRjaChTVU1NQVJZX0NIQU5HRUQsIHtcbiAgICAgIHBhZ2U6IHRhYmxlU3RhdGUuc2xpY2UucGFnZSxcbiAgICAgIHNpemU6IHRhYmxlU3RhdGUuc2xpY2Uuc2l6ZSxcbiAgICAgIGZpbHRlcmVkQ291bnQ6IGZpbHRlcmVkLmxlbmd0aFxuICAgIH0pO1xuICB9O1xuXG4gIGNvbnN0IGV4ZWMgPSAoe3Byb2Nlc3NpbmdEZWxheSA9IDIwfSA9IHt9KSA9PiB7XG4gICAgdGFibGUuZGlzcGF0Y2goRVhFQ19DSEFOR0VELCB7d29ya2luZzogdHJ1ZX0pO1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZmlsdGVyRnVuYyA9IGZpbHRlckZhY3RvcnkoZmlsdGVyUG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICBjb25zdCBzZWFyY2hGdW5jID0gc2VhcmNoRmFjdG9yeShzZWFyY2hQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IHNvcnRGdW5jID0gc29ydEZhY3Rvcnkoc29ydFBvaW50ZXIuZ2V0KHRhYmxlU3RhdGUpKTtcbiAgICAgICAgY29uc3Qgc2xpY2VGdW5jID0gc2xpY2VGYWN0b3J5KHNsaWNlUG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICBjb25zdCBleGVjRnVuYyA9IGNvbXBvc2UoZmlsdGVyRnVuYywgc2VhcmNoRnVuYywgdGFwKGRpc3BhdGNoU3VtbWFyeSksIHNvcnRGdW5jLCBzbGljZUZ1bmMpO1xuICAgICAgICBjb25zdCBkaXNwbGF5ZWQgPSBleGVjRnVuYyhkYXRhKTtcbiAgICAgICAgdGFibGUuZGlzcGF0Y2goRElTUExBWV9DSEFOR0VELCBkaXNwbGF5ZWQubWFwKGQgPT4ge1xuICAgICAgICAgIHJldHVybiB7aW5kZXg6IGRhdGEuaW5kZXhPZihkKSwgdmFsdWU6IGR9O1xuICAgICAgICB9KSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRhYmxlLmRpc3BhdGNoKEVYRUNfRVJST1IsIGUpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgdGFibGUuZGlzcGF0Y2goRVhFQ19DSEFOR0VELCB7d29ya2luZzogZmFsc2V9KTtcbiAgICAgIH1cbiAgICB9LCBwcm9jZXNzaW5nRGVsYXkpO1xuICB9O1xuXG4gIGNvbnN0IHVwZGF0ZVRhYmxlU3RhdGUgPSBjdXJyeSgocHRlciwgZXYsIG5ld1BhcnRpYWxTdGF0ZSkgPT4gY29tcG9zZShcbiAgICBzYWZlQXNzaWduKHB0ZXIuZ2V0KHRhYmxlU3RhdGUpKSxcbiAgICB0YXAoZGlzcGF0Y2goZXYpKSxcbiAgICBwdGVyLnNldCh0YWJsZVN0YXRlKVxuICApKG5ld1BhcnRpYWxTdGF0ZSkpO1xuXG4gIGNvbnN0IHJlc2V0VG9GaXJzdFBhZ2UgPSAoKSA9PiB1cGRhdGVUYWJsZVN0YXRlKHNsaWNlUG9pbnRlciwgUEFHRV9DSEFOR0VELCB7cGFnZTogMX0pO1xuXG4gIGNvbnN0IHRhYmxlT3BlcmF0aW9uID0gKHB0ZXIsIGV2KSA9PiBjb21wb3NlKFxuICAgIHVwZGF0ZVRhYmxlU3RhdGUocHRlciwgZXYpLFxuICAgIHJlc2V0VG9GaXJzdFBhZ2UsXG4gICAgKCkgPT4gdGFibGUuZXhlYygpIC8vIHdlIHdyYXAgd2l0aGluIGEgZnVuY3Rpb24gc28gdGFibGUuZXhlYyBjYW4gYmUgb3ZlcndyaXR0ZW4gKHdoZW4gdXNpbmcgd2l0aCBhIHNlcnZlciBmb3IgZXhhbXBsZSlcbiAgKTtcblxuICBjb25zdCBhcGkgPSB7XG4gICAgc29ydDogdGFibGVPcGVyYXRpb24oc29ydFBvaW50ZXIsIFRPR0dMRV9TT1JUKSxcbiAgICBmaWx0ZXI6IHRhYmxlT3BlcmF0aW9uKGZpbHRlclBvaW50ZXIsIEZJTFRFUl9DSEFOR0VEKSxcbiAgICBzZWFyY2g6IHRhYmxlT3BlcmF0aW9uKHNlYXJjaFBvaW50ZXIsIFNFQVJDSF9DSEFOR0VEKSxcbiAgICBzbGljZTogY29tcG9zZSh1cGRhdGVUYWJsZVN0YXRlKHNsaWNlUG9pbnRlciwgUEFHRV9DSEFOR0VEKSwgKCkgPT4gdGFibGUuZXhlYygpKSxcbiAgICBleGVjLFxuICAgIGV2YWwoc3RhdGUgPSB0YWJsZVN0YXRlKXtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgY29uc3Qgc29ydEZ1bmMgPSBzb3J0RmFjdG9yeShzb3J0UG9pbnRlci5nZXQoc3RhdGUpKTtcbiAgICAgICAgICBjb25zdCBzZWFyY2hGdW5jID0gc2VhcmNoRmFjdG9yeShzZWFyY2hQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IGZpbHRlckZ1bmMgPSBmaWx0ZXJGYWN0b3J5KGZpbHRlclBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgY29uc3Qgc2xpY2VGdW5jID0gc2xpY2VGYWN0b3J5KHNsaWNlUG9pbnRlci5nZXQoc3RhdGUpKTtcbiAgICAgICAgICBjb25zdCBleGVjRnVuYyA9IGNvbXBvc2UoZmlsdGVyRnVuYywgc2VhcmNoRnVuYywgc29ydEZ1bmMsIHNsaWNlRnVuYyk7XG4gICAgICAgICAgcmV0dXJuIGV4ZWNGdW5jKGRhdGEpLm1hcChkID0+IHtcbiAgICAgICAgICAgIHJldHVybiB7aW5kZXg6IGRhdGEuaW5kZXhPZihkKSwgdmFsdWU6IGR9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0sXG4gICAgb25EaXNwbGF5Q2hhbmdlKGZuKXtcbiAgICAgIHRhYmxlLm9uKERJU1BMQVlfQ0hBTkdFRCwgZm4pO1xuICAgIH0sXG4gICAgZ2V0VGFibGVTdGF0ZSgpe1xuICAgICAgY29uc3Qgc29ydCA9IE9iamVjdC5hc3NpZ24oe30sIHRhYmxlU3RhdGUuc29ydCk7XG4gICAgICBjb25zdCBzZWFyY2ggPSBPYmplY3QuYXNzaWduKHt9LCB0YWJsZVN0YXRlLnNlYXJjaCk7XG4gICAgICBjb25zdCBzbGljZSA9IE9iamVjdC5hc3NpZ24oe30sIHRhYmxlU3RhdGUuc2xpY2UpO1xuICAgICAgY29uc3QgZmlsdGVyID0ge307XG4gICAgICBmb3IgKGxldCBwcm9wIGluIHRhYmxlU3RhdGUuZmlsdGVyKSB7XG4gICAgICAgIGZpbHRlcltwcm9wXSA9IHRhYmxlU3RhdGUuZmlsdGVyW3Byb3BdLm1hcCh2ID0+IE9iamVjdC5hc3NpZ24oe30sIHYpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7c29ydCwgc2VhcmNoLCBzbGljZSwgZmlsdGVyfTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgaW5zdGFuY2UgPSBPYmplY3QuYXNzaWduKHRhYmxlLCBhcGkpO1xuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShpbnN0YW5jZSwgJ2xlbmd0aCcsIHtcbiAgICBnZXQoKXtcbiAgICAgIHJldHVybiBkYXRhLmxlbmd0aDtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBpbnN0YW5jZTtcbn0iLCJpbXBvcnQgc29ydCBmcm9tICdzbWFydC10YWJsZS1zb3J0JztcbmltcG9ydCBmaWx0ZXIgZnJvbSAnc21hcnQtdGFibGUtZmlsdGVyJztcbmltcG9ydCBzZWFyY2ggZnJvbSAnc21hcnQtdGFibGUtc2VhcmNoJztcbmltcG9ydCB0YWJsZSBmcm9tICcuL2RpcmVjdGl2ZXMvdGFibGUnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe1xuICBzb3J0RmFjdG9yeSA9IHNvcnQsXG4gIGZpbHRlckZhY3RvcnkgPSBmaWx0ZXIsXG4gIHNlYXJjaEZhY3RvcnkgPSBzZWFyY2gsXG4gIHRhYmxlU3RhdGUgPSB7c29ydDoge30sIHNsaWNlOiB7cGFnZTogMX0sIGZpbHRlcjoge30sIHNlYXJjaDoge319LFxuICBkYXRhID0gW11cbn0sIC4uLnRhYmxlRGlyZWN0aXZlcykge1xuXG4gIGNvbnN0IGNvcmVUYWJsZSA9IHRhYmxlKHtzb3J0RmFjdG9yeSwgZmlsdGVyRmFjdG9yeSwgdGFibGVTdGF0ZSwgZGF0YSwgc2VhcmNoRmFjdG9yeX0pO1xuXG4gIHJldHVybiB0YWJsZURpcmVjdGl2ZXMucmVkdWNlKChhY2N1bXVsYXRvciwgbmV3ZGlyKSA9PiB7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oYWNjdW11bGF0b3IsIG5ld2Rpcih7XG4gICAgICBzb3J0RmFjdG9yeSxcbiAgICAgIGZpbHRlckZhY3RvcnksXG4gICAgICBzZWFyY2hGYWN0b3J5LFxuICAgICAgdGFibGVTdGF0ZSxcbiAgICAgIGRhdGEsXG4gICAgICB0YWJsZTogY29yZVRhYmxlXG4gICAgfSkpO1xuICB9LCBjb3JlVGFibGUpO1xufSIsImltcG9ydCB0YWJsZURpcmVjdGl2ZSBmcm9tICcuL3NyYy90YWJsZSc7XG5pbXBvcnQgZmlsdGVyRGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvZmlsdGVyJztcbmltcG9ydCBzZWFyY2hEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zZWFyY2gnO1xuaW1wb3J0IHNsaWNlRGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvc2xpY2UnO1xuaW1wb3J0IHNvcnREaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zb3J0JztcbmltcG9ydCBzdW1tYXJ5RGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvc3VtbWFyeSc7XG5pbXBvcnQgd29ya2luZ0luZGljYXRvckRpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3dvcmtpbmdJbmRpY2F0b3InO1xuXG5leHBvcnQgY29uc3Qgc2VhcmNoID0gc2VhcmNoRGlyZWN0aXZlO1xuZXhwb3J0IGNvbnN0IHNsaWNlID0gc2xpY2VEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgc3VtbWFyeSA9IHN1bW1hcnlEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgc29ydCA9IHNvcnREaXJlY3RpdmU7XG5leHBvcnQgY29uc3QgZmlsdGVyID0gZmlsdGVyRGlyZWN0aXZlO1xuZXhwb3J0IGNvbnN0IHdvcmtpbmdJbmRpY2F0b3IgPSB3b3JraW5nSW5kaWNhdG9yRGlyZWN0aXZlO1xuZXhwb3J0IGNvbnN0IHRhYmxlID0gdGFibGVEaXJlY3RpdmU7XG5leHBvcnQgZGVmYXVsdCB0YWJsZTtcbiIsImV4cG9ydCBkZWZhdWx0IFtcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc3XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzcvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc3L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc3L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NzdcIixcbiAgICBcImlkXCI6IDIzMzEyMDU0OCxcbiAgICBcIm51bWJlclwiOiA3NzcsXG4gICAgXCJ0aXRsZVwiOiBcIkFkanVzdG1lbnRzIGZvciBBbmd1bGFyIDEuNlwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiTXJXb29rXCIsXG4gICAgICBcImlkXCI6IDIwMjk0MDQyLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMi5naXRodWJ1c2VyY29udGVudC5jb20vdS8yMDI5NDA0Mj92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2tcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vTXJXb29rXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNi0wMlQwOTowNTowNlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA2LTA2VDE1OjA0OjQyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc3N1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3N1wiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3Ny5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3Ny5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJDYXRjaCB0aW1lb3V0IHByb21pc2Ugb24gY2FuY2VsIGJlY2F1c2UgaXQgd2lsbCB0aHJvdyBhbiBlcnJvciBpbiBBbmd1bGFyIDEuNlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzVcIixcbiAgICBcImlkXCI6IDIzMjkzOTAyNCxcbiAgICBcIm51bWJlclwiOiA3NzUsXG4gICAgXCJ0aXRsZVwiOiBcIkhvdyB0byBzb3J0IHdoZW4gbW9yZSB0aGFuIG9uZSBzaW5nbGUgcHJvcGVydHkgdmFsdWUgaXMgZ2l2ZW4gcHJvIGNvbHVtbiBcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImJ2YWhkYXRcIixcbiAgICAgIFwiaWRcIjogMzEyMjE3NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMzEyMjE3Nz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2J2YWhkYXRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA2LTAxVDE2OjM2OjEzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDYtMDFUMTg6NTM6NDRaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJVc2luZyBgYW5ndWxhcmpzIDEuNS45YCBhc3N1bWUgdHdvIGdpdmVuIHByb3BlcnRpZXMgc3VjaCBhcyBgZm9vYCBhbmQgYGJhcmAgYmVpbmcgYm91bmQgdG8gYSBzaW5nbGUgY29sdW1uLlxcclxcbklzIHRoZXJlIGFueSB3YXkgdG8gaW5zdHJ1Y3QgYHN0LXNvcnRgIHRvIGVpdGhlciBzb3J0IGFjY29yZGluZyB0byB0aGUgYGZvb2Agb3IgYGJhcmAgdmFsdWVzLiBUaGF0J3Mgc29tZXRoaW5nIGFsb25nIHRoZSBmb2xsb3dpbmcgbGluZXM6XFxyXFxuXFxyXFxuYGBgaHRtbFxcclxcbjx0aCBzdC1zb3J0PVxcXCJbZmlyc3ROYW1lLCBsYXN0TmFtZV1cXFwiPmZpcnN0IG5hbWUgPGJyIC8+IGxhc3QgbmFtZTwvdGg+XFxyXFxuYGBgXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NFwiLFxuICAgIFwiaWRcIjogMjMwMTE4NjUzLFxuICAgIFwibnVtYmVyXCI6IDc3NCxcbiAgICBcInRpdGxlXCI6IFwiU21hcnQgVGFibGUgcGFnaW5nIGlzIHNob3dpbmcgbW9yZSBwYWdlcyB0aGFuIGV4cGVjdGVkXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJtb3N0YWZhYXNhZFwiLFxuICAgICAgXCJpZFwiOiA3NjI1NTMwLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMy5naXRodWJ1c2VyY29udGVudC5jb20vdS83NjI1NTMwP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL21vc3RhZmFhc2FkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW1xuICAgICAge1xuICAgICAgICBcImlkXCI6IDIyNTg2MjQyMyxcbiAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2xhYmVscy9ub3QlMjByZXByb2R1Y2libGVcIixcbiAgICAgICAgXCJuYW1lXCI6IFwibm90IHJlcHJvZHVjaWJsZVwiLFxuICAgICAgICBcImNvbG9yXCI6IFwiZWI2NDIwXCIsXG4gICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiAyNTk0Mzg1MDYsXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvdG8lMjBiZSUyMGNsb3NlZDolMjBkb2VzJTIwbm90JTIwZm9sbG93JTIwZ3VpZGVsaW5lc1wiLFxuICAgICAgICBcIm5hbWVcIjogXCJ0byBiZSBjbG9zZWQ6IGRvZXMgbm90IGZvbGxvdyBndWlkZWxpbmVzXCIsXG4gICAgICAgIFwiY29sb3JcIjogXCJmYmNhMDRcIixcbiAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICB9XG4gICAgXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMyxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA1LTIwVDAwOjQxOjQxWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDUtMjJUMTg6Mzk6NTFaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJJIGFtIHVzaW5nIFNtYXJ0IHRhYmxlIGluIGFuZ3VsYXJqcyBhcHBsaWNhdGlvbi4gSW4gdGhlIHBhZ2luYXRpb24gaXQgaXMgc2hvd2luZyBleHRyYSBwYWdlcyB3aGljaCBkb24ndCBoYXZlIHRoZSBkYXRhLiBIb3cgY2FuIEkgZGlzcGxheSB0aGUgZXhhY3QgbnVtYmVyIG9mIHBhZ2VzIGluc3RlYWQgb2YgZXh0cmEgcGFnZXM/XFxyXFxuXFxyXFxuRm9yIGNsYXJpZmljYXRpb24sIEkgaGF2ZSA5NCByZWNvcmRzLCAxNSBwZXIgcGFnZSBzbyB0aGVyZSB3aWxsIGJlIDcgcGFnZXMgLCBidXQgdGhlIHBhZ2luYXRpb24gaXMgc2hvd2luZyAxMCBwYWdlcywgYWZ0ZXIgN3RoIHBhZ2UgdGhlcmUgaXMgbm8gZGF0YSBpbiA4LTEwdGggcGFnZXMuXFxyXFxuUGxlYXNlIHN1Z2dlc3QgaG93IGNhbiBJIHJlc29sdmUgdGhpcy5cXHJcXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3My9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3M1wiLFxuICAgIFwiaWRcIjogMjI3Mjc1OTAwLFxuICAgIFwibnVtYmVyXCI6IDc3MyxcbiAgICBcInRpdGxlXCI6IFwiRml4OiBQYXJzZSBpbml0aWFsIHByZWRpY2F0ZSBjb3JyZWN0bHlcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImcwMGZ5LVwiLFxuICAgICAgXCJpZFwiOiA4NDM4MDcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzg0MzgwNz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS1cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vZzAwZnktXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNS0wOVQwNzozNToxNlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA1LTA5VDA3OjQ3OjM2WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc3M1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3M1wiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3My5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3My5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJUaGlzIGJ1ZyBjYXVzZWQgb3RoZXIgcGx1Z2lucyBub3QgdG8gd29yayBjb3JyZWN0bHkuXFxyXFxuVGhlIGluaXRpYWwgcHJlZGljYXRlIHdhc24ndCBwYXJzZWQgdGhlIHNhbWUgd2F5IGl0IHdhcyBwYXJzZWQgYWZ0ZXIgY2xpY2sgLSB3aGljaCByZXN1bHRlZCBpbiB0aGUgYXJyb3dzIG5vdCBwb2ludGluZyB0aGUgcmlnaHQgZGlyZWN0aW9uLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MlwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3Mi9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3Mi9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzJcIixcbiAgICBcImlkXCI6IDIyNTQyMjk5MixcbiAgICBcIm51bWJlclwiOiA3NzIsXG4gICAgXCJ0aXRsZVwiOiBcIlJlZnJlc2ggdGFibGUgd2l0aCB3aXRoIG91dCBwYWdlIGxvYWRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcInNtb2hhbW1lZHlhc2luXCIsXG4gICAgICBcImlkXCI6IDI1NTY1MTQyLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMi5naXRodWJ1c2VyY29udGVudC5jb20vdS8yNTU2NTE0Mj92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpblwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9zbW9oYW1tZWR5YXNpblwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDUtMDFUMTE6NDI6MTFaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNS0wMVQxODoxMjo0N1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhlbGxvLFxcclxcblxcclxcblRoaXMgaXMgbm90IGFuIGlzc3VlLFxcclxcblxcclxcbkkgd2FudCB0byBrbm93IGhvdyB0byByZWZyZXNoIHRhYmxlIHdpdGggb3V0IHJlbG9hZCBjb21wbGV0ZSBwYWdlLiBhbmQgaSdtIHVzaW5nIGh0dHAkIGZvciBDUlVEXFxyXFxuXFxyXFxucGxlYXNlIGdpdmUgbWUgYW55IGV4YW1wbGUgd2hpY2ggaXMgdXNpbmcgc2VydmVyIHNpZGUgZGF0YS5cXHJcXG5cXHJcXG5BcHByZWNpYXRlIGZvciBxdWljayBhbmQgYmVzdCByZXNwb25zZS5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzFcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MS9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzEvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzEvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MVwiLFxuICAgIFwiaWRcIjogMjI1MzMxNzg2LFxuICAgIFwibnVtYmVyXCI6IDc3MSxcbiAgICBcInRpdGxlXCI6IFwiQ3VzdG9tIGZpbHRlcnNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcInJpY2hhcmQtYXVzdGluXCIsXG4gICAgICBcImlkXCI6IDE0MzE2NDY2LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMy5naXRodWJ1c2VyY29udGVudC5jb20vdS8xNDMxNjQ2Nj92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3RpblwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9yaWNoYXJkLWF1c3RpblwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAwLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDQtMzBUMTQ6NDk6NTJaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNC0zMFQxNDo0OTo1MlpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwicHVsbF9yZXF1ZXN0XCI6IHtcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxscy83NzFcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NzFcIixcbiAgICAgIFwiZGlmZl91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NzEuZGlmZlwiLFxuICAgICAgXCJwYXRjaF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NzEucGF0Y2hcIlxuICAgIH0sXG4gICAgXCJib2R5XCI6IFwiXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcwXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzAvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcwL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcwL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MFwiLFxuICAgIFwiaWRcIjogMjI0MTYxMTk1LFxuICAgIFwibnVtYmVyXCI6IDc3MCxcbiAgICBcInRpdGxlXCI6IFwiRmlsdGVyIHdpdGggY2xpY2sgb2YgYSBidXR0b25cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIkZvc3NpbDAxXCIsXG4gICAgICBcImlkXCI6IDg4MzI2ODcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzg4MzI2ODc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDFcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vRm9zc2lsMDFcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMS9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA0LTI1VDE0OjM4OjE2WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDQtMjZUMTI6MzQ6NTNaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJJIHdvdWxkIGxpa2UgdG8gZmlsdGVyIHNvbWUgdGFibGUgY29sdW1ucyBieSB0aGUgY2xpY2sgb2YgYSBidXR0b24uIElzIHRoaXMgcG9zc2libGUgYW5kIGlmIHNvLCBob3c/XFxyXFxuXFxyXFxuTGV0cyBzYXkgSSBoYXZlIGEgY29sdW1uIFVTRVJTIHdpdGggMyByb3dzOiBKb2huLCBKb2huLCBXaWxsaWFtLlxcclxcblxcclxcbk5vdyBJIGhhdmUgYSBidXR0b246XFxyXFxuYDxidXR0b24gbmctY2xpY2s9XFxcImZpbHRlcignSm9obicpXFxcIj5Kb2huPC9idXR0b24+YFxcclxcblRoaXMgc2hvdWxkIG1ha2UgdGhlIHRhYmxlIG9ubHkgc2hvdyBVc2Vycy5Kb2huLlxcclxcblxcclxcblRoaXMgYnV0dG9uIHdvdWxkIHByZWZlcmFibHkgYmUgcGxhY2VkIG91dHNpZGUgb2YgdGhlIHRhYmxlLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc2OVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc2OS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc2OS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NjlcIixcbiAgICBcImlkXCI6IDIyMTc1MjcyMCxcbiAgICBcIm51bWJlclwiOiA3NjksXG4gICAgXCJ0aXRsZVwiOiBcIlNvcnRpbmcgd2l0aCBhc3luY2hyb25vdXNseSByZWNlaXZlZCBkYXRhXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJibGFja2hlYXJ0ZWRcIixcbiAgICAgIFwiaWRcIjogNDYwMTcxNyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvNDYwMTcxNz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vYmxhY2toZWFydGVkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNC0xNFQwNjo0NDowOFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA0LTE0VDE0OjAxOjI2WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSWYgZGF0YSBpcyByZWNlaXZlZCBhc3luY2hyb25vdXNseSBhbmQgbm90IGF2YWlsYWJsZSBhdCB0aGUgbW9tZW50IG9mIHRhYmxlIGNyZWF0aW9uIC0gdGFibGUgaXMgc29ydGVkIGRpZmZlcmVudGx5LlxcclxcblxcclxcbkRhdGEgXFxcInJlY2VpdmVkXFxcIlxcclxcbiRzY29wZS5kaXNwbGF5ZWQucHVzaCh7XFxyXFxuICAgICAgICBmaXJzdE5hbWU6IFxcXCJBMVxcXCIsXFxyXFxuICAgICAgICBiYWxhbmNlOiAzMDBcXHJcXG4gICAgICB9KTtcXHJcXG4gICAgICAkc2NvcGUuZGlzcGxheWVkLnB1c2goe1xcclxcbiAgICAgICAgZmlyc3ROYW1lOiBcXFwiQTJcXFwiLFxcclxcbiAgICAgICAgYmFsYW5jZTogMjAwXFxyXFxuICAgICAgfSk7XFxyXFxuICAgICAgJHNjb3BlLmRpc3BsYXllZC5wdXNoKHtcXHJcXG4gICAgICAgIGZpcnN0TmFtZTogXFxcIkEzXFxcIixcXHJcXG4gICAgICAgIGJhbGFuY2U6IDEwMFxcclxcbiAgICAgIH0pO1xcclxcblxcclxcbklmIGl0IGlzIHdpdGhpbiAkdGltZW91dCB0YWJsZSB3aWxsIGxvb2sgbGlrZS4gTm90ZSBzb3J0aW5nIGljb24gb24gYmFsYW5jZSBjb2x1bW4gaXMgd3Jvbmc6XFxyXFxuaHR0cDovL3BsbmtyLmNvL2VkaXQvOEIwSnk4YnExQkRQZG5VNmJGR2w/cD1wcmV2aWV3XFxyXFxuZmlyc3QgbmFtZVxcdGJhbGFuY2VcXHJcXG5BMVxcdCAgICAgICAgICAgICAgICAzMDBcXHJcXG5BMlxcdCAgICAgICAgICAgICAgICAyMDBcXHJcXG5BM1xcdCAgICAgICAgICAgICAgICAxMDBcXHJcXG5cXHJcXG5JZiBpdCBpcyBzeW5jaHJvbm91czpcXHJcXG5odHRwOi8vcGxua3IuY28vZWRpdC9ydWYyTHVuREYzcFFVTVhDRDBaej9wPXByZXZpZXdcXHJcXG5maXJzdCBuYW1lXFx0YmFsYW5jZVxcclxcbkEzXFx0ICAgICAgICAgICAgICAgIDEwMFxcclxcbkEyXFx0ICAgICAgICAgICAgICAgIDIwMFxcclxcbkExXFx0ICAgICAgICAgICAgICAgIDMwMFxcclxcblxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1NFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1NC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1NC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzU0XCIsXG4gICAgXCJpZFwiOiAyMTE5NDg5NjMsXG4gICAgXCJudW1iZXJcIjogNzU0LFxuICAgIFwidGl0bGVcIjogXCJhbGxvdyBpbXBsaWNpdCB0cnVlIGF0dHJpYnV0ZXMgaW4gc3RTb3J0XCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJkYmVpbmRlclwiLFxuICAgICAgXCJpZFwiOiAzNDI5NTUsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzM0Mjk1NT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlclwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9kYmVpbmRlclwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAwLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDMtMDVUMTI6MTc6MjdaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMy0wNVQxMjoxNzoyN1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwicHVsbF9yZXF1ZXN0XCI6IHtcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxscy83NTRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NTRcIixcbiAgICAgIFwiZGlmZl91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NTQuZGlmZlwiLFxuICAgICAgXCJwYXRjaF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NTQucGF0Y2hcIlxuICAgIH0sXG4gICAgXCJib2R5XCI6IFwiVGhpcyB3b3VsZCBhbGxvdyBzaG9ydGVyIGF0dHJpYnV0ZXMgb24gdGhlIHNvcnQgYXR0cmlidXRlcywgYW5kIGRlZmF1bHRzIFxcXCJcXFwiIHRvIHRydWUgcHJvdmlkZWQgdGhlIGF0dHJpYnV0ZSBpcyBkZWZpbmVkLlxcclxcbmA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LWRlc2NlbmRpbmctZmlyc3Q9XFxcInRydWVcXFwiIC8+YCB0byBgPHRoIHN0LXNvcnQ9XFxcImZpZWxkXFxcIiBzdC1kZXNjZW5kaW5nLWZpcnN0IC8+YCBcXHJcXG5gPHRoIHN0LXNvcnQ9XFxcImZpZWxkXFxcIiBzdC1za2lwLW5hdHVyYWw9XFxcInRydWVcXFwiIC8+YCB0byBgPHRoIHN0LXNvcnQ9XFxcImZpZWxkXFxcIiBzdC1za2lwLW5hdHVyYWwgLz5gIFxcclxcbmA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNvcnQtZGVmYXVsdD1cXFwidHJ1ZVxcXCIgLz5gIHRvIGA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNvcnQtZGVmYXVsdCAvPmAgXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUzXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTMvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUzL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUzL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1M1wiLFxuICAgIFwiaWRcIjogMjExNjI2ODM0LFxuICAgIFwibnVtYmVyXCI6IDc1MyxcbiAgICBcInRpdGxlXCI6IFwiU2FmZSBzcmMgd2F0Y2ggY29sbGVjdGlvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwidmlhbmRhbnRlb3NjdXJvXCIsXG4gICAgICBcImlkXCI6IDQyMzUwNzksXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzQyMzUwNzk/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3ZpYW5kYW50ZW9zY3Vyb1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAwLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDMtMDNUMDg6Mzk6NDlaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMy0wM1QwODo0MDoxM1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhpIHRvIGFsbCFcXHJcXG5cXHJcXG5JIHVzZSB0aGUgeGVkaXRhYmxlIG9uIGVhY2ggY2VsbCwgZXZlcnkgZWRpdCBpIGVtaXQgYSBzb2NrZXQgZXZlbnQgdGhhdCByZWZyZXNoIGVsZW1lbnRzIGluIGV2ZXJ5IHVzZXIgaXMgIHVzaW5nIHRoZSB0YWJsZS5cXHJcXG5cXHJcXG5JIGhhdmUgYSBwcm9ibGVtIHdpdGggdGhlIHN0LXNhZmUtc3JjIGF0dHJpYnV0ZS5cXHJcXG5cXHJcXG5JIGJ1aWxkIHRoZSB0YWJsZSB3aXRoIGFuIG9iamVjdCBsaWtlIHRoaXM6XFxyXFxuXFxyXFxuYGBgamF2YXNjcmlwdFxcclxcbnJvd3MgPSBbXFxyXFxuICB7XFxyXFxuICAgICBpZDogNDU2LFxcclxcbiAgICAgZGF0YTogW1xcclxcbiAgICAgICB7XFxyXFxuICAgICAgICAgIHZhbHVlOiAnJyxcXHJcXG4gICAgICAgICAgbmFtZTogJydcXHJcXG4gICAgICAgIH0sXFxyXFxuICAgICAgICAuLi4uXFxyXFxuICAgICBdXFxyXFxuICB9LFxcclxcbiAgeyAuLi4gfSwgXFxyXFxuICAuLi5cXHJcXG5dXFxyXFxuYGBgXFxyXFxuXFxyXFxuU28uLi4gaW4gdGhlIG5nLXJlcGVhdCBvZiB0ciBlbGVtZW50cyBpIG5lZWQgdGhlIGlkIGF0dHJpYnV0ZSBvZiBlYWNoIHJvdywgYnV0IHRoZSB0ZCBlbGVtZW50cyBhcmUgdGhvc2Ugb2YgdGhlIGFycmF5ICdkYXRhJyBvZiBlYWNoIHJvdy5cXHJcXG5cXHJcXG5XaGVuIGkgZWRpdCBhIHZhbHVlLCB0aGUgc29ja2V0IGV2ZW50IGlzIGVtaXR0ZWQsIGJ1dCB0aGUgY29sbGVjdGlvbiBvbiB0aGUgb3RoZXIgdXNlciBpcyBub3QgcmVmcmVzaGVkLi4uIHNvLCB0aGUgdmFsdWVzIGFyZSBub3QgdXBkYXRlZC4gQnV0IGlmIGkgYWRkIGEgcm93LCB0aGUgdGFibGUgb24gdGhlIG90aGVyIHVzZXJzIGlzIHJlZnJlc2hlZC4uLiBvbmx5IHRoZSB2YWx1ZXMgaW4gdGhlIGNlbGxzIGFyZSBvdXQgb2YgZGF0ZS5cXHJcXG5cXHJcXG5JZiBpIGRvbid0IHVzZSBzbWFydCB0YWJsZSBhbGwgd29ya3MgZmluZSwgYnV0IGkgcHJlZmVyIHRoZSBzbWFydCB0YWJsZS5cXHJcXG5cXHJcXG5JbiB0aGUgY29kZSBvZiBzbWFydCB0YWJsZSB0aGVyZSBpcyBhIHdhdGNoLCBidXQgaSBuZWVkIGEgd2F0Y2hjb2xsZWN0aW9uLCBpcyBpdCBwb3NzaWJsZT9cXHJcXG5cXHJcXG5Ib3c/XFxyXFxuXFxyXFxuVGhhbmtzXFxyXFxuXFxyXFxuTWFzc2ltb1wiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1MlwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1Mi9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1Mi9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTJcIixcbiAgICBcImlkXCI6IDIwOTk0OTMzNyxcbiAgICBcIm51bWJlclwiOiA3NTIsXG4gICAgXCJ0aXRsZVwiOiBcIlVwZGF0ZSBzbWFydC10YWJsZSBieSBXZWJTb2NrZXRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIkh5cGVyRmx5XCIsXG4gICAgICBcImlkXCI6IDg5OTM3MDUsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzg5OTM3MDU/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHlcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vSHlwZXJGbHlcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseS9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMixcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTAyLTI0VDAzOjE3OjQ5WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDItMjRUMTA6NDc6MjZaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJUaGVyZSBhcmUgMiB0YWJzIGluIHRoZSBjb250YWluZXIuXFxyXFxuRWFjaCB0YWIgaGFzIGEgc21hcnQtdGFibGUgaW4gaXQuXFxyXFxuXFxyXFxuIDEuIFVzZXIgY2xpY2tzIG9uIHRoZSB0YWIuXFxyXFxuXFxyXFxuICAgIFxcdCQoJ2FbZGF0YS10b2dnbGU9XFxcInRhYlxcXCJdJykub24oJ3Nob3duLmJzLnRhYicsIGZ1bmN0aW9uIChlKSB7XFxyXFxuXFx0XFx0XFx0dmFyIHRhcmdldCA9ICQoZS50YXJnZXQpLmF0dHIoXFxcImhyZWZcXFwiKSAvLyBhY3RpdmF0ZWQgdGFiXFxyXFxuXFx0XFx0XFx0dmFyIHJlbGF0ZWRUYXJnZXQgPSAkKGUucmVsYXRlZFRhcmdldCkuYXR0cihcXFwiaHJlZlxcXCIpXFxyXFxuXFx0XFx0XFx0aWYgKHRhcmdldCA9PSBcXFwiI3RhYjFcXFwiKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMScpLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0XFx0XFx0fSBlbHNlIGlmICh0YXJnZXQgPT0gXFxcIiN0YWIyXFxcIikge1xcclxcblxcdFxcdFxcdFxcdFNjb3Blcy5nZXQoJ3RhYjInKS5nZXRfcmVjb3JkcygpO1xcclxcblxcdFxcdFxcdH1cXHJcXG5cXHRcXHR9KVxcclxcblxcclxcbiAyLiBDYWxsIHNlcnZlciB0byBnZXQgYWxsIHJlY29yZCBhbmQgZGlzcGxheSBvbiB0aGUgdGFibGUuKG9ubHkgZmlyc3QgdGltZSlcXHJcXG5cXHJcXG4gICAgXFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSBmYWxzZTtcXHJcXG5cXHRcXHQkc2NvcGUuZ2V0X3JlY29yZHMgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0aWYoJHNjb3BlLmdvdF90YWIxX3JlY29yZHMpIHJldHVybjtcXHJcXG5cXHRcXHRcXHR2YXIgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSlNPTigpLnNsaWNlKDAsMTApO1xcclxcblxcdFxcdFxcdHZhciB1cmwgPSBGbGFzay51cmxfZm9yKCdyZWNvcmRlci5yZWNvcmRfbGlzdCcsIHtpbmZvX3R5cGU6IDEsIGZyb21fZGF0ZTogdG9kYXksIHRvX2RhdGU6IHRvZGF5fSk7XFxyXFxuXFx0XFx0XFx0JGh0dHAuZ2V0KHVybCkuc3VjY2VzcyhcXHJcXG5cXHRcXHRcXHRcXHRmdW5jdGlvbihkYXRhKXtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUudGFiMV9yZWNvcmRzID0gZGF0YTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMgPSBbXS5jb25jYXQoJHNjb3BlLnRhYjFfcmVjb3Jkcyk7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSB0cnVlO1xcclxcblxcdFxcdFxcdFxcdH1cXHJcXG5cXHRcXHRcXHQpLmVycm9yKGZ1bmN0aW9uKHJlc3BvbnNlKXtcXHJcXG5cXHRcXHRcXHRcXHRhbGVydChyZXNwb25zZSk7XFxyXFxuXFx0XFx0XFx0fSkuZmluYWxseShmdW5jdGlvbiAoKXtcXHJcXG5cXHRcXHRcXHR9KTtcXHJcXG5cXHRcXHR9XFxyXFxuXFxyXFxuIDMuIElmIHRoZXJlIGlzIGEgbmV3IHJlY29yZCwgZ2V0IHRoZSByZWNvcmQgZnJvbSBXZWJTb2NrZXQuXFxyXFxuXFxyXFxuICAgIFxcdHZhciB1cmwgPSBcXFwid3M6Ly9cXFwiICsgd2luZG93LmxvY2F0aW9uLmhyZWYucmVwbGFjZSgvaHR0cHM/OlxcXFwvXFxcXC8vLCcnKS5yZXBsYWNlKC9cXFxcLy4qLywnJykgKyBcXFwiL3dzXFxcIjtcXHJcXG5cXHRcXHR2YXIgd3MgPSBuZXcgV2ViU29ja2V0KHVybCk7XFxyXFxuXFx0XFx0d3Mub25lcnJvciA9IGZ1bmN0aW9uIChlKSB7XFxyXFxuXFx0XFx0XFx0YWxlcnQoZSk7XFxyXFxuXFx0XFx0XFx0Y29uc29sZS5sb2coXFxcIldlYlNvY2tldCBFcnJvclxcXCIgKyBlKTtcXHJcXG5cXHRcXHRcXHRjb25zb2xlLmxvZyhlKTtcXHJcXG5cXHRcXHR9XFxyXFxuXFx0XFx0d3Mub25jbG9zZSA9IGZ1bmN0aW9uICgpIHtcXHJcXG5cXHRcXHRcXHRkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcXFwibG9nb1xcXCIpLnN0eWxlLmNvbG9yID0gXFxcImdyYXlcXFwiO1xcclxcblxcdFxcdH1cXHJcXG5cXHRcXHR3cy5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAoZSkge1xcclxcblxcdFxcdFxcdHZhciBvYmogPSBKU09OLnBhcnNlKGUuZGF0YSk7XFxyXFxuXFx0XFx0XFx0JHNjb3BlLmFwcGVuZF9yZWNvcmQob2JqLnN0YXRlLCBvYmoucmVjb3JkKTtcXHJcXG5cXHRcXHR9XFxyXFxuICAgIFxcdCRzY29wZS5hcHBlbmRfcmVjb3JkID0gZnVuY3Rpb24oaW5mb190eXBlLCByZWNvcmQpe1xcclxcbiAgICAgICAgXFx0aWYgKGluZm9fdHlwZSA9PSAxKSB7XFxyXFxuICAgICAgICAgICAgXFx0U2NvcGVzLmdldCgndGFiMScpLnVuc2hpZnRfcmVjb3JkKHJlY29yZCk7XFxyXFxuICAgICAgICBcXHR9IGVsc2UgaWYgKGluZm9fdHlwZSA9PSAyKSB7XFxyXFxuICAgICAgICAgICAgXFx0U2NvcGVzLmdldCgndGFiMicpLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG4gICAgICAgIFxcdH1cXHJcXG4gICAgXFx0fTtcXHJcXG5cXHJcXG4gNC4gVW5zaGlmdCB0aGUgcmVjb3JkIG9uIHRoZSBzdC1zYWZlLXNyYyBhbmQgcmVmcmVzaCB0aGUgdGFibGUuXFxyXFxuXFxyXFxuICAgICBcXHQkc2NvcGUudW5zaGlmdF9yZWNvcmQgPSBmdW5jdGlvbiAocmVjb3JkKSB7XFxyXFxuXFx0XFx0XFx0JHNjb3BlLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG5cXHRcXHR9O1xcdFxcclxcblxcclxcbk15IHF1ZXN0aW9uIGlzIHRoZSBzdGVwIDQgZGlkIG5vdCByZWZyZXNoIHRoZSB0YWJsZS5cXHJcXG5Pbmx5IGlmIEkgY2xpY2sgb24gYW5vdGhlciB0YWIgdGhlbiBjbGljayBvbiB0aGUgb3JpZ2luYWwgdGFiLlxcclxcbkJ1dCwgY2xpY2sgb24gdGhlIGJ1dHRvbiBpbiB0aGUgdGFiMSBpdCB3aWxsIHVuc2hpZnQgYSByZWNvcmQgYW5kIGRpc3BsYXkgb24gdGhlIGZpcnN0IHJvdyBvZiB0aGUgdGFibGUuXFxyXFxuXFxyXFxuICAgIFxcdCRzY29wZS5hZGRSYW5kb21JdGVtID0gZnVuY3Rpb24gYWRkUmFuZG9tSXRlbSgpIHtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdCh7X2RhdGV0aW1lOicyMDE3LTAyLTIzJywgX2RldmljZTonMSd9KTtcXHJcXG5cXHRcXHR9O1xcclxcblxcclxcbkFsc28sIEkgaGF2ZSBhIHF1ZXN0aW9uLlxcclxcbldoeSB0aGUgc3QtcGFnZXNpemVsaXN0PVxcXCIxMCw1MCwxMDAsMTAwMFxcXCIgZGlkIG5vdCB3b3JrID9cXHJcXG5cXHJcXG5JIGhhdmUgW3BsdW5rZXJdWzFdIHRvIHNob3cgdGhpcyBwcm9ibGVtLiBCdXQgSSBkb24ndCBrbm93IGhvdyB0byBzaW11bGF0ZSBXZWJTb2NrZXQuXFxyXFxuXFxyXFxuXFxyXFxuSHRtbDpcXHJcXG5cXHJcXG4gICAgPGRpdiBpZD1cXFwicmlnaHRfY29udGFpbmVyXFxcIiBzdHlsZT1cXFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogMzglOyBoZWlnaHQ6IGNhbGMoMTAwJSAtIDEwN3B4KTsgcmlnaHQ6IDBweDtcXFwiPlxcclxcblxcdFxcdDx1bCBjbGFzcz1cXFwibmF2IG5hdi10YWJzXFxcIj5cXHJcXG5cXHRcXHRcXHQ8bGkgY2xhc3M9XFxcImFjdGl2ZVxcXCI+PGEgZGF0YS10b2dnbGU9XFxcInRhYlxcXCIgaHJlZj1cXFwiI3RhYjFcXFwiPnRhYjE8L2E+PC9saT5cXHJcXG5cXHRcXHRcXHQ8bGkgY2xhc3M9XFxcIlxcXCI+PGEgZGF0YS10b2dnbGU9XFxcInRhYlxcXCIgaHJlZj1cXFwiI3RhYjJcXFwiPnRhYjI8L2E+PC9saT5cXHJcXG5cXHRcXHQ8L3VsPlxcclxcblxcdFxcdDxkaXYgY2xhc3M9XFxcInRhYi1jb250ZW50XFxcIj5cXHJcXG5cXHRcXHRcXHQ8ZGl2IGlkPVxcXCJ0YWIxXFxcIiBjbGFzcz1cXFwidGFiLXBhbmUgZmFkZSBpbiBhY3RpdmVcXFwiIG5nLWNvbnRyb2xsZXI9XFxcInRhYjFcXFwiIHN0eWxlPVxcXCJwb3NpdGlvbjogYWJzb2x1dGU7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IGNhbGMoMTAwJSAtIDQycHgpOyB0b3A6IDQycHg7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHQ8YnV0dG9uIHR5cGU9XFxcImJ1dHRvblxcXCIgbmctY2xpY2s9XFxcImFkZFJhbmRvbUl0ZW0ocm93KVxcXCIgY2xhc3M9XFxcImJ0biBidG4tc20gYnRuLXN1Y2Nlc3NcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdDxpIGNsYXNzPVxcXCJnbHlwaGljb24gZ2x5cGhpY29uLXBsdXNcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvaT4gQWRkIHJhbmRvbSBpdGVtXFxyXFxuXFx0XFx0XFx0XFx0PC9idXR0b24+XFxyXFxuXFx0XFx0XFx0XFx0PHRhYmxlIHN0LXRhYmxlPVxcXCJ0YWIxX3JlY29yZHNcXFwiIHN0LXNhZmUtc3JjPVxcXCJzYWZlX3RhYjFfcmVjb3Jkc1xcXCIgY2xhc3M9XFxcInRhYmxlIHRhYmxlLXN0cmlwZWRcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6ICMyQTY2QUI7IGNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD50aW1lPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+ZGV2aWNlPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+PGlucHV0IHN0LXNlYXJjaD1cXFwidGltZVxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgcGxhY2Vob2xkZXI9XFxcInRpbWUgc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD48aW5wdXQgc3Qtc2VhcmNoPVxcXCJkZXZpY2VcXFwiIGNsYXNzPVxcXCJmb3JtLWNvbnRyb2xcXFwiIHBsYWNlaG9sZGVyPVxcXCJkZXZpY2Ugc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGJvZHkgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIG5nLXJlcGVhdD1cXFwicmVjb3JkIGluIHRhYjFfcmVjb3Jkc1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRkPnskcmVjb3JkLl9kYXRldGltZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGQ+eyRyZWNvcmQuX2RldmljZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGJvZHk+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRmb290PlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHQ8dGQgY29sc3Bhbj1cXFwiNFxcXCIgY2xhc3M9XFxcInRleHQtY2VudGVyXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHRcXHQ8ZGl2IHN0LXBhZ2luYXRpb249XFxcIlxcXCIgc3QtaXRlbXMtYnktcGFnZT1cXFwiMTBcXFwiIHN0LWRpc3BsYXllZC1wYWdlcz1cXFwiN1xcXCIgc3QtcGFnZXNpemVsaXN0PVxcXCIxMCw1MCwxMDAsMTAwMFxcXCI+PC9kaXY+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0XFx0PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGZvb3Q+XFxyXFxuXFx0XFx0XFx0XFx0PC90YWJsZT5cXHJcXG5cXHRcXHRcXHQ8L2Rpdj5cXHJcXG5cXHRcXHRcXHQ8ZGl2IGlkPVxcXCJ0YWIyXFxcIiBjbGFzcz1cXFwidGFiLXBhbmUgZmFkZVxcXCIgbmctY29udHJvbGxlcj1cXFwidGFiMlxcXCIgc3R5bGU9XFxcInBvc2l0aW9uOiBhYnNvbHV0ZTsgd2lkdGg6IDEwMCU7IGhlaWdodDogY2FsYygxMDAlIC0gNDJweCk7IHRvcDogNDJweDtcXFwiPlxcclxcblxcdFxcdFxcdFxcdDx0YWJsZSBzdC10YWJsZT1cXFwidGFiMl9yZWNvcmRzXFxcIiBzdC1zYWZlLXNyYz1cXFwic2FmZV90YWIyX3JlY29yZHNcXFwiIGNsYXNzPVxcXCJ0YWJsZSB0YWJsZS1zdHJpcGVkXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGhlYWQ+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIHN0eWxlPVxcXCJiYWNrZ3JvdW5kLWNvbG9yOiAjMkE2NkFCOyBjb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+dGltZTwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPmRldmljZTwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPjxpbnB1dCBzdC1zZWFyY2g9XFxcInRpbWVcXFwiIGNsYXNzPVxcXCJmb3JtLWNvbnRyb2xcXFwiIHBsYWNlaG9sZGVyPVxcXCJ0aW1lIHNlYXJjaCAuLi5cXFwiIHR5cGU9XFxcInRleHRcXFwiIC8+PC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+PGlucHV0IHN0LXNlYXJjaD1cXFwiZGV2aWNlXFxcIiBjbGFzcz1cXFwiZm9ybS1jb250cm9sXFxcIiBwbGFjZWhvbGRlcj1cXFwiZGV2aWNlIHNlYXJjaCAuLi5cXFwiIHR5cGU9XFxcInRleHRcXFwiIC8+PC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGhlYWQ+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRib2R5IHN0eWxlPVxcXCJiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBuZy1yZXBlYXQ9XFxcInJlY29yZCBpbiB0YWIyX3JlY29yZHNcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0ZD57JHJlY29yZC5fZGF0ZXRpbWUkfTwvdGQ+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRkPnskcmVjb3JkLl9kZXZpY2UkfTwvdGQ+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3Rib2R5PlxcclxcblxcdFxcdFxcdFxcdFxcdDx0Zm9vdD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0XFx0PHRkIGNvbHNwYW49XFxcIjRcXFwiIGNsYXNzPVxcXCJ0ZXh0LWNlbnRlclxcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0XFx0XFx0PGRpdiBzdC1wYWdpbmF0aW9uPVxcXCJcXFwiIHN0LWl0ZW1zLWJ5LXBhZ2U9XFxcIjEwXFxcIiBzdC1kaXNwbGF5ZWQtcGFnZXM9XFxcIjdcXFwiIHN0LXBhZ2VzaXplbGlzdD1cXFwiMTAsNTAsMTAwLDEwMDBcXFwiPjwvZGl2PlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdFxcdDwvdGQ+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PC90cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3Rmb290PlxcclxcblxcdFxcdFxcdFxcdDwvdGFibGU+XFxyXFxuXFx0XFx0XFx0PC9kaXY+XFxyXFxuXFx0XFx0PC9kaXY+XFxyXFxuXFx0PC9kaXY+XFxyXFxuXFxyXFxuSmF2YXNjcmlwdDpcXHJcXG5cXHJcXG4gICAgPHNjcmlwdCBzcmM9XFxcIi9zdGF0aWNzL3NjcmlwdHMvYW5ndWxhci5taW4uanNcXFwiPjwvc2NyaXB0PlxcclxcblxcdDxzY3JpcHQgc3JjPVxcXCIvc3RhdGljcy9zY3JpcHRzL1NtYXJ0LVRhYmxlLTIuMS44L3NtYXJ0LXRhYmxlLm1pbi5qc1xcXCI+PC9zY3JpcHQ+XFxyXFxuXFx0PHNjcmlwdD5cXHJcXG5cXHR2YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ21hcCcsIFsnc21hcnQtdGFibGUnXSk7XFxyXFxuXFx0YXBwID0gYW5ndWxhci5tb2R1bGUoJ21hcCcpLmNvbmZpZyhmdW5jdGlvbiAoJGh0dHBQcm92aWRlciwgJGludGVycG9sYXRlUHJvdmlkZXIpIHtcXHJcXG5cXHRcXHQkaHR0cFByb3ZpZGVyLmRlZmF1bHRzLmhlYWRlcnMuY29tbW9uWydYLVJlcXVlc3RlZC1XaXRoJ10gPSAnWE1MSHR0cFJlcXVlc3QnO1xcclxcblxcdFxcdCRpbnRlcnBvbGF0ZVByb3ZpZGVyLnN0YXJ0U3ltYm9sKCd7JCcpO1xcclxcblxcdFxcdCRpbnRlcnBvbGF0ZVByb3ZpZGVyLmVuZFN5bWJvbCgnJH0nKTtcXHJcXG5cXHR9KTtcXHJcXG5cXHRhcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlKSB7XFxyXFxuXFx0XFx0JHJvb3RTY29wZS4kb24oJ3Njb3BlLnN0b3JlZCcsIGZ1bmN0aW9uIChldmVudCwgZGF0YSkge1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKFxcXCJzY29wZS5zdG9yZWRcXFwiLCBkYXRhKTtcXHJcXG5cXHRcXHR9KTtcXHJcXG5cXHR9KTtcXHJcXG5cXHRhcHAuY29udHJvbGxlcigndGFiMScsIFsnJHNjb3BlJywgJyRodHRwJywgJ1Njb3BlcycsIGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCBTY29wZXMpIHtcXHJcXG5cXHRcXHRTY29wZXMuc3RvcmUoJ3RhYjEnLCAkc2NvcGUpO1xcclxcblxcdFxcdCRzY29wZS5nb3RfdGFiMV9yZWNvcmRzID0gZmFsc2U7XFxyXFxuXFx0XFx0JHNjb3BlLmdldF9yZWNvcmRzID0gZnVuY3Rpb24gKCkge1xcclxcblxcdFxcdFxcdGlmKCRzY29wZS5nb3RfdGFiMV9yZWNvcmRzKSByZXR1cm47XFxyXFxuXFx0XFx0XFx0dmFyIHRvZGF5ID0gbmV3IERhdGUoKS50b0pTT04oKS5zbGljZSgwLDEwKTtcXHJcXG5cXHRcXHRcXHR2YXIgdXJsID0gRmxhc2sudXJsX2ZvcigncmVjb3JkZXIucmVjb3JkX2xpc3QnLCB7aW5mb190eXBlOiAxLCBmcm9tX2RhdGU6IHRvZGF5LCB0b19kYXRlOiB0b2RheX0pO1xcclxcblxcdFxcdFxcdCRodHRwLmdldCh1cmwpLnN1Y2Nlc3MoXFxyXFxuXFx0XFx0XFx0XFx0ZnVuY3Rpb24oZGF0YSl7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLnRhYjFfcmVjb3JkcyA9IGRhdGE7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLnNhZmVfdGFiMV9yZWNvcmRzID0gW10uY29uY2F0KCRzY29wZS50YWIxX3JlY29yZHMpO1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS5nb3RfdGFiMV9yZWNvcmRzID0gdHJ1ZTtcXHJcXG5cXHRcXHRcXHRcXHR9XFxyXFxuXFx0XFx0XFx0KS5lcnJvcihmdW5jdGlvbihyZXNwb25zZSl7XFxyXFxuXFx0XFx0XFx0XFx0YWxlcnQocmVzcG9uc2UpO1xcclxcblxcdFxcdFxcdH0pLmZpbmFsbHkoZnVuY3Rpb24gKCl7XFxyXFxuXFx0XFx0XFx0fSk7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdCRzY29wZS5hZGRSYW5kb21JdGVtID0gZnVuY3Rpb24gYWRkUmFuZG9tSXRlbSgpIHtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdCh7X2RhdGV0aW1lOicyMDE3LTAyLTIzJywgX2RldmljZTonMSd9KTtcXHJcXG5cXHRcXHR9O1xcclxcblxcdFxcdCRzY29wZS51bnNoaWZ0X3JlY29yZCA9IGZ1bmN0aW9uIChyZWNvcmQpIHtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdCh7X2RhdGV0aW1lOicyMDE3LTAyLTIzJywgX2RldmljZTonMid9KTtcXHJcXG5cXHRcXHR9O1xcclxcblxcdFxcdCRzY29wZS5nZXRfcmVjb3JkcygpO1xcclxcblxcdH1dKTtcXHJcXG5cXHRhcHAuY29udHJvbGxlcigndGFiMicsIFsnJHNjb3BlJywgJyRodHRwJywgJ1Njb3BlcycsIGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCBTY29wZXMpIHtcXHJcXG5cXHRcXHRTY29wZXMuc3RvcmUoJ3RhYjInLCAkc2NvcGUpO1xcclxcblxcdFxcdCRzY29wZS5nb3RfdGFiMl9yZWNvcmRzID0gZmFsc2U7XFxyXFxuXFx0XFx0JHNjb3BlLmdldF9yZWNvcmRzID0gZnVuY3Rpb24gKCkge1xcclxcblxcdFxcdFxcdGlmKCRzY29wZS5nb3RfdGFiMl9yZWNvcmRzKSByZXR1cm47XFxyXFxuXFx0XFx0XFx0dmFyIHRvZGF5ID0gbmV3IERhdGUoKS50b0pTT04oKS5zbGljZSgwLDEwKTtcXHJcXG5cXHRcXHRcXHR2YXIgdXJsID0gRmxhc2sudXJsX2ZvcigncmVjb3JkZXIucmVjb3JkX2xpc3QnLCB7aW5mb190eXBlOiAyLCBmcm9tX2RhdGU6IHRvZGF5LCB0b19kYXRlOiB0b2RheX0pO1xcclxcblxcdFxcdFxcdCRodHRwLmdldCh1cmwpLnN1Y2Nlc3MoXFxyXFxuXFx0XFx0XFx0XFx0ZnVuY3Rpb24oZGF0YSl7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLnRhYjJfcmVjb3JkcyA9IGRhdGE7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLnNhZmVfdGFiMl9yZWNvcmRzID0gW10uY29uY2F0KCRzY29wZS50YWIyX3JlY29yZHMpO1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS5nb3RfdGFiMl9yZWNvcmRzID0gdHJ1ZTtcXHJcXG5cXHRcXHRcXHRcXHR9XFxyXFxuXFx0XFx0XFx0KS5lcnJvcihmdW5jdGlvbihyZXNwb25zZSl7XFxyXFxuXFx0XFx0XFx0XFx0YWxlcnQocmVzcG9uc2UpO1xcclxcblxcdFxcdFxcdH0pLmZpbmFsbHkoZnVuY3Rpb24gKCl7XFxyXFxuXFx0XFx0XFx0fSk7XFxyXFxuXFx0XFx0fTtcXHJcXG4gXFx0XFx0JHNjb3BlLnVuc2hpZnRfcmVjb3JkID0gZnVuY3Rpb24gKHJlY29yZCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KEpTT04ucGFyc2UocmVjb3JkKSk7XFxyXFxuXFx0XFx0fTtcXHJcXG5cXHR9XSk7XFxyXFxuXFx0YXBwLmNvbnRyb2xsZXIoJ3ByZXZpZXcnLCBbJyRzY29wZScsICckaHR0cCcsICdTY29wZXMnLCBmdW5jdGlvbiAoJHNjb3BlLCAkaHR0cCwgU2NvcGVzKSB7XFxyXFxuXFx0XFx0JCgnYVtkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIl0nKS5vbignc2hvd24uYnMudGFiJywgZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHR2YXIgdGFyZ2V0ID0gJChlLnRhcmdldCkuYXR0cihcXFwiaHJlZlxcXCIpIC8vIGFjdGl2YXRlZCB0YWJcXHJcXG5cXHRcXHRcXHR2YXIgcmVsYXRlZFRhcmdldCA9ICQoZS5yZWxhdGVkVGFyZ2V0KS5hdHRyKFxcXCJocmVmXFxcIilcXHJcXG5cXHRcXHRcXHRpZiAodGFyZ2V0ID09IFxcXCIjdGFiMVxcXCIpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIxJykuZ2V0X3JlY29yZHMoKTtcXHJcXG5cXHRcXHRcXHR9IGVsc2UgaWYgKHRhcmdldCA9PSBcXFwiI3RhYjJcXFwiKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMicpLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH0pXFxyXFxuXFx0XFx0JHNjb3BlLmFwcGVuZF9yZWNvcmQgPSBmdW5jdGlvbihpbmZvX3R5cGUsIHJlY29yZCl7XFxyXFxuXFx0XFx0XFx0aWYgKGluZm9fdHlwZSA9PSAxKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMScpLnVuc2hpZnRfcmVjb3JkKHJlY29yZCk7XFxyXFxuXFx0XFx0XFx0fSBlbHNlIGlmIChpbmZvX3R5cGUgPT0gMikge1xcclxcblxcdFxcdFxcdFxcdFNjb3Blcy5nZXQoJ3RhYjInKS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KEpTT04ucGFyc2UocmVjb3JkKSk7XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH07XFxyXFxuXFx0XFx0dmFyIHVybCA9IFxcXCJ3czovL1xcXCIgKyB3aW5kb3cubG9jYXRpb24uaHJlZi5yZXBsYWNlKC9odHRwcz86XFxcXC9cXFxcLy8sJycpLnJlcGxhY2UoL1xcXFwvLiovLCcnKSArIFxcXCIvd3NcXFwiO1xcclxcblxcdFxcdHZhciB3cyA9IG5ldyBXZWJTb2NrZXQodXJsKTtcXHJcXG5cXHRcXHR3cy5vbmVycm9yID0gZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHRhbGVydChlKTtcXHJcXG5cXHRcXHRcXHRjb25zb2xlLmxvZyhcXFwiV2ViU29ja2V0IEVycm9yXFxcIiArIGUpO1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKGUpO1xcclxcblxcdFxcdH1cXHJcXG5cXHRcXHR3cy5vbmNsb3NlID0gZnVuY3Rpb24gKCkge1xcclxcblxcdFxcdFxcdGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFxcXCJsb2dvXFxcIikuc3R5bGUuY29sb3IgPSBcXFwiZ3JheVxcXCI7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdHdzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChlKSB7XFxyXFxuXFx0XFx0XFx0dmFyIG9iaiA9IEpTT04ucGFyc2UoZS5kYXRhKTtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuYXBwZW5kX3JlY29yZChvYmouc3RhdGUsIG9iai5yZWNvcmQpO1xcclxcblxcdFxcdH1cXHJcXG5cXHR9XSk7XFxyXFxuXFx0XFxyXFxuXFx0YXBwLmZhY3RvcnkoJ1Njb3BlcycsIGZ1bmN0aW9uICgkcm9vdFNjb3BlKSB7XFxyXFxuXFx0XFx0dmFyIG1lbSA9IHt9O1xcclxcblxcdFxcdHJldHVybiB7XFxyXFxuXFx0XFx0XFx0c3RvcmU6IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XFxyXFxuXFx0XFx0XFx0XFx0JHJvb3RTY29wZS4kZW1pdCgnc2NvcGUuc3RvcmVkJywga2V5KTtcXHJcXG5cXHRcXHRcXHRcXHRtZW1ba2V5XSA9IHZhbHVlO1xcclxcblxcdFxcdFxcdH0sXFxyXFxuXFx0XFx0XFx0Z2V0OiBmdW5jdGlvbiAoa2V5KSB7XFxyXFxuXFx0XFx0XFx0XFx0cmV0dXJuIG1lbVtrZXldO1xcclxcblxcdFxcdFxcdH1cXHJcXG5cXHRcXHR9O1xcclxcblxcdH0pO1xcclxcblxcdDwvc2NyaXB0PlxcclxcblxcclxcblxcclxcbiAgWzFdOiBodHRwOi8vcGxua3IuY28vZWRpdC93bHl1SFZVUUhObTJSY1ZOR1lKaz9wPXByZXZpZXdcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDhcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDgvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDgvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ4XCIsXG4gICAgXCJpZFwiOiAyMDc0NTAxMTEsXG4gICAgXCJudW1iZXJcIjogNzQ4LFxuICAgIFwidGl0bGVcIjogXCJzdC1wZXJzaXN0IGV4YW1wbGUgaXMgbm90IHdvcmtpbmcgd2l0aCBzdC1waXBlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJqb2huaWNvXCIsXG4gICAgICBcImlkXCI6IDE5NTY0NTkyLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMi5naXRodWJ1c2VyY29udGVudC5jb20vdS8xOTU2NDU5Mj92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2pvaG5pY29cIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjI1ODYyNDIzLFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL25vdCUyMHJlcHJvZHVjaWJsZVwiLFxuICAgICAgICBcIm5hbWVcIjogXCJub3QgcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwiY29sb3JcIjogXCJlYjY0MjBcIixcbiAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBcImlkXCI6IDI1OTQzODUwNixcbiAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2xhYmVscy90byUyMGJlJTIwY2xvc2VkOiUyMGRvZXMlMjBub3QlMjBmb2xsb3clMjBndWlkZWxpbmVzXCIsXG4gICAgICAgIFwibmFtZVwiOiBcInRvIGJlIGNsb3NlZDogZG9lcyBub3QgZm9sbG93IGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImZiY2EwNFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH1cbiAgICBdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDItMTRUMDg6Mzg6NTRaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMi0xNFQxMzoxMTo1N1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhpIC4gdGhpcyBleGFtcGxlIGlzIG5vdCB3b3JraW5nIGF0IGFsbCB3aXRoIHNlcnZlciBwYWdpbmF0aW9uIFxcclxcbmh0dHA6Ly9wbG5rci5jby9lZGl0L2Vrd2lOdD9wPXByZXZpZXdcXHJcXG5cXHJcXG5pdCBzYXZlZCBvbmx5IHRoZSBkYXRhIG9mIGZpcnN0IHBhZ2UgYW5kIGRlZmF1bHQgc29ydCBpbiBsb2NhbCBzdG9yYWdlIGFuZCBkaWQgbm90IHVwZGF0ZSB0aGUgdGFibGVcXHJcXG5cXHJcXG5teSBwaXBlIGZ1bmN0aW9uIDpcXHJcXG5cXHJcXG5cXHJcXG5gICAgIHRoaXMuY2FsbFNlcnZlciA9IGZ1bmN0aW9uIGNhbGxTZXJ2ZXIodGFibGVTdGF0ZSkge1xcclxcblxcclxcbiAgICAgICAgdm0uaXNMb2FkaW5nID0gdHJ1ZTtcXHJcXG4gICAgICAgIHZhciBwYWdpbmF0aW9uID0gdGFibGVTdGF0ZS5wYWdpbmF0aW9uO1xcclxcbiAgICAgICAgdmFyIHN0YXJ0ID0gcGFnaW5hdGlvbi5zdGFydCB8fCAwOyAgXFxyXFxuICAgICAgICB2YXIgbnVtYmVyID0gcGFnaW5hdGlvbi5udW1iZXIgfHwgMTBcXHJcXG5cXHJcXG4gICAgICAgIHZtLnN1Ym1pdCA9IGZ1bmN0aW9uICgpe1xcclxcbiAgICAgICAgICAgIHZtLmlzTG9hZGluZyA9IHRydWU7XFxyXFxuXFxyXFxuICAgICAgICAgICAgJHNjb3BlLmZpbHRlcnNGb3JtLiRzZXRQcmlzdGluZSgpO1xcclxcbiAgICAgICAgICAgIHNlcnZlckNhbGwoMCwgMTAsIHRhYmxlU3RhdGUsc2VhcmNoT2JqKTtcXHJcXG4gICAgICAgICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xcclxcbiAgICAgICAgfVxcclxcbiAgICAgICAgc2VydmVyQ2FsbChzdGFydCwgbnVtYmVyLCB0YWJsZVN0YXRlLHNlYXJjaE9iaik7XFxyXFxuXFxyXFxuICAgICAgfTtcXHJcXG5gXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ3XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDcvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ3L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ3L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NDdcIixcbiAgICBcImlkXCI6IDIwNTg0OTE0MSxcbiAgICBcIm51bWJlclwiOiA3NDcsXG4gICAgXCJ0aXRsZVwiOiBcIklzc3VlICM3Mjcgc3QtcGlwZSBub3Qgd29ya2luZyB3aXRoIHN0LXNhZmUtc3JjXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJBbGV4TkdcIixcbiAgICAgIFwiaWRcIjogODIyODEwLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS84MjI4MTA/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL0FsZXhOR1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkcvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4Tkcvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkcvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkcvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAwLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDItMDdUMTA6NDA6NThaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMi0wN1QxMTowODoxMlpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwicHVsbF9yZXF1ZXN0XCI6IHtcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxscy83NDdcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NDdcIixcbiAgICAgIFwiZGlmZl91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NDcuZGlmZlwiLFxuICAgICAgXCJwYXRjaF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NDcucGF0Y2hcIlxuICAgIH0sXG4gICAgXCJib2R5XCI6IFwiLSBvcHRpb25hbCBhYmlsaXR5IHRvIHBpcGUgb24gc2FmZWNvcHkgY2hhbmdlIHVzaW5nIGV4aXN0aW5nIHBpcGVBZnRlclNhZmVDb3B5IGZsYWcgdXNpbmcgdW5wcmV2ZW50UGlwZU9uV2F0Y2hcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDRcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDQvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDQvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ0XCIsXG4gICAgXCJpZFwiOiAyMDQxMTEwNzAsXG4gICAgXCJudW1iZXJcIjogNzQ0LFxuICAgIFwidGl0bGVcIjogXCJzdC1zb3J0IHdpdGggZnVuY3Rpb24gcmV0dXJuaW5nIGEgcHJvbWlzZVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic2tpZHZkXCIsXG4gICAgICBcImlkXCI6IDU4MzI1MTMsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzU4MzI1MTM/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3NraWR2ZFwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAyLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDEtMzBUMTk6NDg6NDlaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMi0wMVQxMjo1MTowMlpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhpLFxcclxcblxcclxcbkkgYW0gdXNpbmcgYW5ndWxhciB2MS41LjkgYW5kIHNtYXJ0LXRhYmxlIHYyLjEuMC4gIEkgaGF2ZSBzZWFyY2hlZCBmb3IgYW5zd2VycyB0byBteSBxdWVzdGlvbiBiZWxvdywgYnV0IGhhdmUgbm90IGJlZW4gYWJsZSB0byBmaW5kIGFueSB0aGF0IGFkZHJlc3MgdGhlIHNwZWNpZmljIHByb21pc2UvYXN5bmMgYXR0cmlidXRlcyBvZiBpdCAtIGFwb2xvZ2llcyBpZiB0aGlzIGhhcyBiZWVuIGFkZHJlc3NlZCBzb21ld2hlcmUgYW5kL29yIGlzIGEgZHVwbGljYXRlIC0gaWYgc28sIGtpbmRseSBwbGVhc2UgcmVmZXIgbWUgdGhlcmUuXFxyXFxuXFxyXFxuSSBoYXZlIGJlZW4gdXNpbmcgYm90aCBzdC10YWJsZT1cXFwiZGlzcGxheWVkSXRlbXNcXFwiIGFuZCBzdC1zYWZlLXNyYz1cXFwiaXRlbXNcXFwiIGRpcmVjdGl2ZXMgaW4gY29tYmluYXRpb24gd2l0aCBzdC1zb3J0LiAgVGhpcyBjb21iaW5hdGlvbiBzdWNjZXNzZnVsbHkgYW5kIHJlbGlhYmx5IHdvcmtzIGZvciBuZWFybHkgYWxsIGNvbmRpdGlvbnMgSSBoYXZlIHJ1biBhY3Jvc3MuICBUaGlzIGluY2x1ZGVzIHNjZW5hcmlvcyB3aGVyZSB0aGUgc3Qtc29ydCBpcyBmdW5jdGlvbiBiYXNlZC4gIEhvd2V2ZXIsIEkgcmVjZW50bHkgZW5jb3VudGVyZWQgYW4gbmVlZCB0byBoYXZlIGEgZnVuY3Rpb24gYmFzZWQgc3Qtc29ydCB0aGF0IHJldHVybnMgYSBwcm9taXNlIGluc3RlYWQgb2YgdGhlIHZhbHVlIGRpcmVjdGx5IChpLmUuIHRoZSBmdW5jdGlvbiB3aWxsIGFzeW5jaHJvbm91c2x5IHJlc29sdmUgdGhlIHZhbHVlLCBhdCBhIHNsaWdodGx5IGxhdGVyIHRpbWUgLSB3aGVuIGl0IGJlY29tZXMgYXZhaWxhYmxlKS5cXHJcXG5cXHJcXG5NeSBxdWVzdGlvbiBpcywgc2hvdWxkIHRoZSBzdC1zb3J0IGJlIGV4cGVjdGVkIHRvIHByb2R1Y2UgYSBwcmVkaWN0YWJsZSBvcmRlcmluZyBvZiB0aGUgcm93cyBpbiB0aGF0IGNhc2U/ICBJZiBzbywgaXQgZG9lcyBub3QgYXBwZWFyIHRvIGJlLiAgSSBhbSB0aGVvcml6aW5nIHRoYXQgdGhpcyBtYXkgYmUgZG8gdG8gdGhlIGZhY3QgdGhhdCB0aGUgYXNzb2NpYXRlZCB2YWx1ZXMgYXJlIG5vdCBhdmFpbGFibGUgdG8gdGhlIHNvcnQgYWxnb3JpdGhtIGFsbCB1cCBmcm9udCAtIGJ1dCByYXRoZXIgc3RyYWdnbGUgaW4gaW4gYW4gdW5wcmVkaWN0YWJsZSBvcmRlciBhbmQgdGltZSBmcmFtZS4gIEJ5IHRoZSB3YXksIG5vIGVycm9ycyBvciBvdGhlciBpbmRpY2F0aW9ucyBhcmUgcmV0dXJuZWQgdGhhdCBhIHByb2JsZW0gbWF5IGV4aXN0LiAgU2hvdWxkIEkgZXhwZWN0IHRoaXMgdG8gd29yaywgb3IgaXMgdGhpcyBhIGtub3duIGxpbWl0YXRpb24/ICBBcmUgdGhlcmUgYWRkaXRpb25hbCBpdGVtcyB0aGF0IGNhbiBiZSBkb25lIHRvIG1ha2UgaXQgd29yayBvbiBteSBwYXJ0IG9yIG90aGVyd2lzZSAtIGlmIHNvLCBJJ2QgZ3JlYXRseSBhcHByZWNpYXRlIGFueSB0aXBzIG9yIHRob3VnaHRzIHlvdSBtYXkgaGF2ZT9cXHJcXG5cXHJcXG5USUEhXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0MlwiLFxuICAgIFwiaWRcIjogMjAwODI5NTUwLFxuICAgIFwibnVtYmVyXCI6IDc0MixcbiAgICBcInRpdGxlXCI6IFwic3Qtc29ydC1kZWZhdWx0IG92ZXJ3cml0ZXMgc3QtcGVyc2lzdCBzdGF0ZVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiYW5ndXN0dXNcIixcbiAgICAgIFwiaWRcIjogOTEzNzgxMCxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvOTEzNzgxMD92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1c1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1c3R1c1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAwLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDEtMTRUMjE6MDM6MTNaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMS0xNFQyMTowMzoxM1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIioqV29ya2luZyBleGFtcGxlOioqXFxyXFxuaHR0cDovL3BsbmtyLmNvL2VkaXQvVUk1cjlyP3A9cHJldmlld1xcclxcbkl0J3MgYSBmb3JrIG9mIHRoZSBgc3QtcGVyc2lzdGAgZXhhbXBsZTsgSSd2ZSBhZGRlZCBgc3Qtc29ydC1kZWZhdWx0YCBmaWVsZCBhbmQgdXBkYXRlZCBgc21hcnQtdGFibGVgIHRvIGB2Mi4xLjhgIChtYXN0ZXIgYXMgb2Ygbm93KS5cXHJcXG5cXHJcXG4qKlJlcHJvZHVjdGlvbjoqKlxcclxcbjEuIFVzZSBwYWdpbmF0aW9uIGFuZCBzb3J0IGJ5IGFueSBjb2x1bW4uXFxyXFxuMi4gcmVmcmVzaCBwcmV2aWV3XFxyXFxuXFxyXFxuKipSZXN1bHQ6KipcXHJcXG5UaGUgcGVyc2lzdGVkIHN0YXRlIGlzIGFwcGxpZWQgYmVmb3JlIHRoZSBkZWZhdWx0IHNvcnQgb3JkZXIgaXMgYXBwbGllZC5cXHJcXG4qKkV4cGVjdGVkOioqXFxyXFxuUGVyc2lzdGVkIHN0YXRlIHNob3VsZCBiZSBhcHBsaWVkIGxhc3QgdGh1cyBvdmVyd3JpdGluZyBkZWZhdWx0IHN0YXRlIG9yZGVyLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0MVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0MS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0MS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDFcIixcbiAgICBcImlkXCI6IDIwMDY0MjQxOCxcbiAgICBcIm51bWJlclwiOiA3NDEsXG4gICAgXCJ0aXRsZVwiOiBcIklzIHRoZXJlIGFyZSBhIHdheSBmb3IgYSBzdHJpY3Qgc2VhcmNoIGluIGN1c3RvbSBkaXJlY3RpdmU/IFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwia3lyb2RhYmFzZVwiLFxuICAgICAgXCJpZFwiOiAyNTEwMzI0MyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMjUxMDMyNDM/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9reXJvZGFiYXNlXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2UvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2UvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2UvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2Uvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW1xuICAgICAge1xuICAgICAgICBcImlkXCI6IDM1NTI5ODU5LFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL2VuaGFuY2VtZW50XCIsXG4gICAgICAgIFwibmFtZVwiOiBcImVuaGFuY2VtZW50XCIsXG4gICAgICAgIFwiY29sb3JcIjogXCI4NGI2ZWJcIixcbiAgICAgICAgXCJkZWZhdWx0XCI6IHRydWVcbiAgICAgIH1cbiAgICBdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiA2LFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDEtMTNUMTQ6Mjc6MDJaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMS0xOVQwOTowMToxN1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhpLFxcclxcblxcclxcbkdyZWF0IGxpYiEgOilcXHJcXG5cXHJcXG5JcyB0aGVyZSBhcmUgYSB3YXkgdG8gbWF0Y2ggdGhlIGV4YWN0IHNlYXJjaCB0ZXJtIGluc3RlYWQgb2YgYSBzdWJzdHJpbmc/XFxyXFxuQ3VycmVudGx5IGlmIEkgc2VhcmNoIGZvciBJRCA9IDQsIHRoZSBzZWFyY2ggZnVuY3Rpb24gcmV0dXJucyBJRCA9IDQgYW5kIElEID0gNDAwMCwgSUQgPSA0MDAxIGV0Yy5cXHJcXG5IZXJlIGlzIGEgY29kZSBzbmlwcGV0OiBcXHJcXG5cXHJcXG5gIC5kaXJlY3RpdmUoXFxcImN1c3RvbVdhdGNoRmlsdGVyc1xcXCIsIGZ1bmN0aW9uICgpIHtcXHJcXG5cXHJcXG4gICAgcmV0dXJuIHtcXHJcXG4gICAgICByZXN0cmljdDogXFxcIkFcXFwiLFxcclxcbiAgICAgIHJlcXVpcmU6IFxcXCJec3RUYWJsZVxcXCIsXFxyXFxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycywgY3RybCkge1xcclxcbiAgICAgIFxcdHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oYXR0cnMuY3VzdG9tV2F0Y2hGaWx0ZXJzLCBmdW5jdGlvbiAoZmlsdGVycykge1xcclxcblxcclxcbiAgICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5zZWFyY2gucHJlZGljYXRlT2JqZWN0ID0ge307XFxyXFxuXFxyXFxuICAgICAgICAgIGFuZ3VsYXIuZm9yRWFjaChmaWx0ZXJzLCBmdW5jdGlvbiAodmFsLCBmaWx0ZXIpIHtcXHJcXG4gICAgICAgICAgICBpZiAoYW5ndWxhci5pc1VuZGVmaW5lZCh2YWwpIHx8IHZhbCA9PT0gbnVsbCkge1xcclxcbiAgICAgICAgICAgICAgcmV0dXJuO1xcclxcbiAgICAgICAgICAgIH1cXHJcXG5cXHRcXHRcXHJcXG4gICAgICAgICAgICBjdHJsLnNlYXJjaCh2YWwudG9TdHJpbmcoKSwgZmlsdGVyKTtcXHJcXG4gICAgICAgICAgfSk7XFxyXFxuXFxyXFxuICAgICAgICAgIGN0cmwucGlwZSgpO1xcclxcblxcclxcbiAgICAgICAgfSk7XFxyXFxuICAgICAgfVxcclxcbiAgICB9O1xcclxcbiAgfSk7YFxcclxcblxcclxcblBsZWFzZSBhZHZpc2VcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzlcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOS9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzkvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzkvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM5XCIsXG4gICAgXCJpZFwiOiAxOTkyOTY4MDgsXG4gICAgXCJudW1iZXJcIjogNzM5LFxuICAgIFwidGl0bGVcIjogXCJIb3cgY2FuIEkgc2VsZWN0IHBhZ2UgYW5kIHNvcnQgbWFudWFsbHkgd2l0aCBzZXJ2ZXIgc2lkZSBwYWdpbmF0aW9uID9cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImpvaG5pY29cIixcbiAgICAgIFwiaWRcIjogMTk1NjQ1OTIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE5NTY0NTkyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY29cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vam9obmljb1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDEtMDZUMjE6NDQ6MzlaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMS0xMFQwNzoxNDo1MlpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhpIC4gaW0gdXNpbmcgc21hcnQgdGFibGUgd2l0aCBwYWdpbmF0aW9uIGluIHNlcnZlciBzaWRlLlxcclxcbkkgYW0ga2VlcCB0aGUgc29ydGluZyBhbmQgcGFnaW5hdGlvbiBkZXRhaWxzIGluIGxvY2FsIHN0b3JhZ2Ugb3IgdXJsICxcXHJcXG5teSBxdWVzdGlvbiBpcyBob3cgY2FuIEkga2VlcCB0aGUgcGFnZSB3aGVuIHRoZSB1c2VyIHdhcyBhbmQgd2hlbiBoZSB3aWxsIGNvbWUgYmFjayB3aXRoIHRoZSBzcGVjaWZpYyB1cmwgb3IganVzdCBiYWNrIHRvIHRoZSBwYWdlIGhlIHdpbGwgZ2V0IHRoZSBzYW1lIHBhZ2UgaGUgd2FzLj9cXHJcXG50aGUgc2FtZSBpc3N1ZSBpcyB3aXRoIFNvcnRpbmcsICBIb3cgY2FuIEkgc29ydGluZyBieSB1cmwgcGFyYW1ldGVyXFxyXFxuaG93IGNhbiBJIGRvIHRoYXQsICAgP1xcclxcblxcclxcblxcclxcbnRoeCBmb3IgdGhlIGhlbHBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzhcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzgvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzgvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM4XCIsXG4gICAgXCJpZFwiOiAxOTc0OTczODIsXG4gICAgXCJudW1iZXJcIjogNzM4LFxuICAgIFwidGl0bGVcIjogXCJDYW4ndCBsb2FkIGh0dHAgY29udGVudCBmcm9tIHBsdW5rZXIgd2hlbiBvcGVuaW5nIHR1dG9yaWFsIHNpdGUgdmlhIGh0dHBzXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJhbmF0b2x5MzE0XCIsXG4gICAgICBcImlkXCI6IDE2NDE1OTQsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE2NDE1OTQ/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9hbmF0b2x5MzE0XCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMi0yNVQxMTozMTozMlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEyLTI1VDExOjMxOjMyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiV2hlbiBJIG9wZW4gdGhlIGZvbGxvd2luZyB3ZWJzaXRlOiBodHRwczovL2xvcmVuem9mb3gzLmdpdGh1Yi5pby9zbWFydC10YWJsZS13ZWJzaXRlLyBzb21lIGNvbnRlbnQgbm90IGxvYWRpbmcgYnV0IHRocm93aW5nIGV4Y2VwdGlvbiBpbiBhIGphdmFzY3JpcHQgY29uc29sZTpcXHJcXG5cXHJcXG4+IE1peGVkIENvbnRlbnQ6IFRoZSBwYWdlIGF0ICdodHRwczovL2xvcmVuem9mb3gzLmdpdGh1Yi5pby9zbWFydC10YWJsZS13ZWJzaXRlLycgd2FzIGxvYWRlZCBvdmVyIEhUVFBTLCBidXQgcmVxdWVzdGVkIGFuIGluc2VjdXJlIHJlc291cmNlICdodHRwOi8vZW1iZWQucGxua3IuY28vU09jVWsxJy4gVGhpcyByZXF1ZXN0IGhhcyBiZWVuIGJsb2NrZWQ7IHRoZSBjb250ZW50IG11c3QgYmUgc2VydmVkIG92ZXIgSFRUUFMuXFxyXFxuXFxyXFxuVG8gZml4IHRoaXMgYWxsIGh0dHA6Ly9leGFtcGxlLmNvbSBsaW5rcyBzaG91bGQgYmUgY2hhbmdlZCB0byAvL2V4YW1wbGUuY29tXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM3XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzcvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM3L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM3L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczN1wiLFxuICAgIFwiaWRcIjogMTk2NDYxNzM2LFxuICAgIFwibnVtYmVyXCI6IDczNyxcbiAgICBcInRpdGxlXCI6IFwiUG9zc2libGUgaXNzdWUgd2l0aCByZWluaXRpYWxpc2luZyB0aGUgc2NvcGUucGFnZXMgY29sbGVjdGlvbiBpbiByZWRyYXcgZnVuY3Rpb25cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcInNhbm55amFjb2Jzc29uXCIsXG4gICAgICBcImlkXCI6IDExNzg3ODMxLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS8xMTc4NzgzMT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3NvblwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9zYW5ueWphY29ic3NvblwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMTItMTlUMTY6NDE6MTFaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0xMi0yMFQxMDowNDowMFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkFuZ3VsYXIgdmVyc2lvbjogMS41LjhcXHJcXG5TbWFydCB0YWJsZSB2ZXJzaW9uOiAyLjEuOFxcclxcblxcclxcbmh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9ibG9iL21hc3Rlci9zcmMvc3RQYWdpbmF0aW9uLmpzXFxyXFxuPHByZT5cXHJcXG5uZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcXHJcXG4gIC5kaXJlY3RpdmUoJ3N0UGFnaW5hdGlvbicsIFsnc3RDb25maWcnLCBmdW5jdGlvbiAoc3RDb25maWcpIHtcXHJcXG4uLi4uXFxyXFxuICAgICAgICBmdW5jdGlvbiByZWRyYXcgKCkge1xcclxcbi4uLi5cXHJcXG4gICAgICAgICAgc2NvcGUucGFnZXMgPSBbXTtcXHJcXG4uLi4uXFxyXFxuPC9wcmU+XFxyXFxuXFxyXFxuV2hlbiB1cGRhdGluZyB0aGUgPGNvZGU+c3QtaXRlbXMtYnktcGFnZTwvY29kZT4gdmFsdWUgYSA8Y29kZT5yZWRyYXcoKTwvY29kZT4gaXMgdHJpZ2dlcmVkLiBJbiB0aGUgY2FzZSB0aGUgbmV3IHZhbHVlIGlzIHRoZSBsZW5ndGggb2YgdGhlIGl0ZW1zIGluIHRoZSBiYWNraW5nIGNvbGxlY3Rpb24gPGNvZGU+PC9jb2RlPiB0aGUgPGNvZGU+c2NvcGUucGFnZXM8L2NvZGU+IGNvbGxlY3Rpb24gaXMgcmVpbml0aWFsaXNlZC4gXFxyXFxuXFxyXFxuSXQgc2VlbXMgdG8gbWUgdGhhdCB3ZSBhcmUgbG9vc2luZyBvdXIgcmVmZXJlbnMgdG8gdGhlIDxjb2RlPnNjb3BlLnBhZ2VzPC9jb2RlPiBjb2xsZWN0aW9uIGluIHRoZSBwYWdpbmF0aW9uLmh0bWwgdGVtcGxhdGUuIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvYmxvYi9tYXN0ZXIvZGlzdC9zbWFydC10YWJsZS5qcyBcXHJcXG48cHJlPlxcclxcbm5nLm1vZHVsZSgnc21hcnQtdGFibGUnLCBbXSkucnVuKFsnJHRlbXBsYXRlQ2FjaGUnLCBmdW5jdGlvbiAoJHRlbXBsYXRlQ2FjaGUpIHtcXHJcXG4gICAgJHRlbXBsYXRlQ2FjaGUucHV0KCd0ZW1wbGF0ZS9zbWFydC10YWJsZS9wYWdpbmF0aW9uLmh0bWwnLFxcclxcbi4uLi4uPC9wcmU+XFxyXFxuXFxyXFxuSWYgd2UgaW5zdGVhZCBvZiByZWluaXRpYWxpc2luZyB0aGUgY29kZT5zY29wZS5wYWdlczwvY29kZT4gY29sbGVjdGlvbiBpbiB0aGUgPGNvZGU+cmVkcmF3KCk8L2NvZGU+IGZ1bmN0aW9uIHdlIHNldCB0aGUgbGVuZ3RoIHRvIHplcm8gPGNvZGU+c2NvcGUucGFnZXMubGVuZ3RoID0gMDs8L2NvZGU+IHdlIHdpbGwgbWFpbnRhaW4gb3VyIHJlZmVyZW5jZXMuIFdoZW4gY2hhbmdpbmcgdGhlIHZhbHVlIGZyb20gdGhlIGxlbmd0aCBvZiB0aGUgYmFja2luZyBjb2xsZWN0aW9uIHRvIHNvbWUgb3RoZXIgdmFsdWUgdGhlIHBhZ2luYXRpb24gd2lsbCB3b3JrLiBcXHJcXG5cXHJcXG5JIGRpc2NvdmVyZWQgdGhlIGlzc3VlIHdoZW4gYWRkaW5nIGEgXFxcInZpZXcgYWxsXFxcIiBvcHRpb24gZm9yIGEgc21hcnQgdGFibGUuIEkgdHJpZWQgd2l0aCAtMSB0byBzaG93IGFsbCwgaG93ZXZlciB0aGF0IGNhdXNlZCBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uLm51bWJlck9mUGFnZXMgdG8gYmVjb21lIG5lZ2F0aXZlIHdpdGggYWxsIGtpbmRzIG9mIHNpZGUgZWZmZWN0cy5cXHJcXG5cXHJcXG5JJ20gbmV3IHRvIEphdmFTY3JpcHQgYW5kIEFuZ3VsYXJKUyBzbyBJIG1heSB2ZXJ5IHdlbGwgaGF2ZSBtaXNzdW5kZXJzdG9kIHRoZSBpc3N1ZS4gIFwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNlwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNi9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNi9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzZcIixcbiAgICBcImlkXCI6IDE5NTIwNzczMyxcbiAgICBcIm51bWJlclwiOiA3MzYsXG4gICAgXCJ0aXRsZVwiOiBcIlNtYXJ0IFRhYmxlIHBhZ2dpbmcgcmVmcmVzaGluZyBJc3N1ZVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiaGVtcmFqcmF2XCIsXG4gICAgICBcImlkXCI6IDIzMzk2ODM0LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMy5naXRodWJ1c2VyY29udGVudC5jb20vdS8yMzM5NjgzND92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXZcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vaGVtcmFqcmF2XCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMi0xM1QwOTo1NTo1OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEyLTE1VDEwOjI5OjA3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuaG93IGNhbiBpIGNvbnRyb2wgcGFnZSByZWZyZXNoaW5nIGluIHNtYXJ0IHRhYmxlIG9uIHJlZmlsbCBpbnNpZGUgYW5ndWxhciBjb250cm9sbGVyIHdoZW4gYW55IGFjdGlvbiBwZXJmb3JtLlxcclxcbmZvciBleGEgOiAtIEkgYW0gb24gcGFnZSBubyA2IGFuZCBpIGNsYWltIGFuIG9yZGVyIHRoZW4gY29udHJvbCBjb21lcyBvbiBmaXJzdCBwYWdlIHdoZW4gcmVmaWxsIHNtYXJ0IHRhYmxlLlxcclxcbnNvIGhvdyBjYW4gYmUgY29udHJvbCB0aGlzIHJlZnJlc2guLi5wbGVhc2UgcHJvdmlkZSBtZSBzb2x1dGlvbiBpbW1lZGlhdGVseS5cXHJcXG5cXHJcXG5UaGFua3MgaW4gYWR2YW5jZVxcclxcbkhlbXJhaiBSYXZcXHJcXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzVcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNS9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzUvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzUvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM1XCIsXG4gICAgXCJpZFwiOiAxOTUwODU2NzUsXG4gICAgXCJudW1iZXJcIjogNzM1LFxuICAgIFwidGl0bGVcIjogXCJwcm9wZXJ0eSB3aXRoIFxcXCItXFxcIiBkYXNoIGRvZXNudCB3b3JrIGluIHNlYXJjaD8gT3IgSSBhbSBkb2luZyBzb21ldGhpbmcgd3Jvbmcgd2l0aCBzdFNlYXJjaFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiZ2luYW1kYXJcIixcbiAgICAgIFwiaWRcIjogODQ1Mzc5LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS84NDUzNzk/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXJcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vZ2luYW1kYXJcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhci9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhci9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhci9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogNCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTEyVDIxOjA2OjQ4WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMTVUMDc6MDM6MjRaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJJIGhhdmUganNvbiBvYmplY3QgYXMgICBcXHJcXG5gYGBbe1xcXCJ0YXNrLWlkXFxcIjo1MixcXFwidGFzay1wcmlvcml0eVxcXCI6MSxcXFwidGFzay1uYW1lXFxcIjpcXFwiTW9kaWZ5IFByb3ZpbmNlXFxcIixcXFwidGFzay1kZXNjcmlwdGlvblxcXCI6XFxcIlxcXCIsXFxcInRhc2stc3RhdHVzXFxcIjpcXFwiSW5Qcm9ncmVzc1xcXCJ9LC4uLl0gIGBgYFxcclxcbmFuZCBpbiBodG1sIGltIHJlbmRlcmluZyBpdHMgYXNcXHJcXG5gYGBcXHJcXG48ZGl2IGNsYXNzPVxcXCJ3aWRnZXQtYm9keVxcXCIgc3QtdGFibGU9XFxcImRpc3BsYXlXb3JrbGlzdFxcXCIgc3Qtc2FmZS1zcmM9XFxcIndvcmtsaXN0XFxcIiAgPlxcclxcbjx0YWJsZSBjbGFzcz1cXFwidGFibGUgdGFibGUtYm9yZGVyZWQgdGFibGUtc3RyaXBlZCB0YWJsZS1jb25kZW5zZWRcXFwiPlxcclxcbjx0aGVhZD4uLjwvdGhlYWQ+XFxyXFxuPHRib2R5Plxcclxcbjx0ciBuZy1yZXBlYXQ9XFxcInJvdyBpbiBkaXNwbGF5V29ya2xpc3RcXFwiPlxcclxcbiAgIDx0ZCBjbGFzcz1cXFwidGV4dC1jZW50ZXJcXFwiID5cXHJcXG4gICB7eyByb3dbJ3Rhc2staWQnXSB9fVxcclxcbiAgPC90ZD5cXHJcXG48L3RhYmxlPiBgYGAgIFxcclxcblxcclxcbkV2ZXJ5dGhpbmcgd29ya3MgZmluZSwgbm93IHdoZW4gaW0gdHJ5aW5nIHRvIGZpbHRlciBiYXNlZCBvbiBwcmVkaWNhdGUgYXMgIFxcclxcbjx0aD5cXHJcXG4gICA8aW5wdXQgc3Qtc2VhcmNoPVxcXCIndGFzay1pZCdcXFwiIHBsYWNlaG9sZGVyPVxcXCJzZWFyY2ggZm9yIHRhc2tJZFxcXCJcXHJcXG4gIGNsYXNzPVxcXCJpbnB1dC1zbSBmb3JtLWNvbnRyb2xcXFwiIHR5cGU9XFxcInNlYXJjaFxcXCIvPlxcclxcbiAgPC90aD4gIFxcclxcbmBgYCAgXFxyXFxuSSBnZXQgYW5ndWxhci5qczoxMDE1MCBUeXBlRXJyb3I6ICRwYXJzZSguLi4pLmFzc2lnbiBpcyBub3QgYSBmdW5jdGlvblxcclxcblxcclxcblxcXCJhbmd1bGFyXFxcIjogXFxcIn4xLjJcXFwiLFxcclxcbmFuZ3VsYXItc21hcnQtdGFibGU6IFxcXCJeMi4xLjhcXFwiLFxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzRcIixcbiAgICBcImlkXCI6IDE5Mjg0MjkwMCxcbiAgICBcIm51bWJlclwiOiA3MzQsXG4gICAgXCJ0aXRsZVwiOiBcInN0LXBpcGUgd2l0aCBkZWZhdWx0LXNvcnQtY29sdW1uIGNhdXNlcyBkb3VibGUgeGhyIHJlcXVlc3Qgd2hlbiBpbml0aWFsaXppbmcgdGFibGUuXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJ3em9ldFwiLFxuICAgICAgXCJpZFwiOiAyNDgxOTgyLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMy5naXRodWJ1c2VyY29udGVudC5jb20vdS8yNDgxOTgyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3d6b2V0XCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMi0wMVQxMzoxMTo1M1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEyLTEyVDEyOjA5OjQyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuXFxyXFxuV2UgYXJlIHdvcmtpbmcgd2l0aCB5b3VyIHBsdWdpbiB3aGljaCBpcyByZWFsbHkgYXdlc29tZS4gXFxyXFxuV2UganVzdCBmb3VuZCB0aGF0IHdoZW4gaGF2aW5nIGEgZGVmYXVsdC1zb3J0IGZpZWxkIHNldCB0byB0cnVlLCB0aGUgcGlwZSBpcyBjYWxsZWQgdHdpY2UsIGNhdXNpbmcgZGF0YSBiZSBsb2FkZWQgdHdpY2UgdXBvbiBpbml0aWFsaXppbmcgb2YgdGhlIHBhZ2UuIFxcclxcblxcclxcbkl0IGlzIHRvdGFsbHkgbm90IGEgc2hvd3N0b3BwZXIsIGJ1dCBJIGd1ZXNzIGl0IGlzbid0IHZlcnkgZWZmaWNpZW50IGFzIHdlbGwuXFxyXFxuXFxyXFxuV2UgdXNlIGFuZ3VsYXIgy4YxLjUuOCBhbmQgYW5ndWxhci1zbWFydC10YWJsZSDLhjIuMS44LlxcclxcblxcclxcblRoYW5rcyBmb3IgeW91ciBlZmZvcnQgaW4gdGhpcyBwbHVnaW4hXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzMzXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzMvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzMzL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzMzL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83MzNcIixcbiAgICBcImlkXCI6IDE5MjEzMjk1MCxcbiAgICBcIm51bWJlclwiOiA3MzMsXG4gICAgXCJ0aXRsZVwiOiBcIkV4dGVuZCBzZWxlY3Rpb24gd2l0aCBzaGlmdC1jbGlja1wiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiUmhvYmFsXCIsXG4gICAgICBcImlkXCI6IDE0OTEzMjk3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS8xNDkxMzI5Nz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWxcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vUmhvYmFsXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMS0yOFQyMjoxOTo1M1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTExLTI4VDIyOjE5OjUzWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzczM1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzczM1wiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzczMy5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzczMy5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJTZWxlY3Rpb24gY2FuIGJlIGV4dGVuZGVkIHdpdGggc2hpZnQtY2xpY2suXFxyXFxuXFxyXFxuRXh0ZW5zaW9uIG1lYW5zIHRoYXQgdGhlIHN0YXRlIG9mIHRoZSBsYXN0IHJvdyB0aGF0IHdhcyBzZWxlY3RlZCBpcyBleHRlbmRlZCB0aHJvdWdoIHRvIHRoZSBjdXJyZW50bHlcXHJcXG5zZWxlY3RlZCByb3csIHNvIGFsbCByb3dzIGluIGJldHdlZW4gd2lsbCBlaXRoZXIgYmUgc2VsZWN0ZWQgb3IgZGVzZWxlY3RlZC4gSWYgdGhlcmUgd2FzIG5vIHByZXZpb3VzbHlcXHJcXG5zZWxlY3RlZCByb3csIHNoaWZ0LWNsaWNrIHdpbGwganVzdCBzZWxlY3QgdGhlIGN1cnJlbnQgcm93LlxcclxcblxcclxcblRvIGdldCB0byBhIGRlZmluZWQgc3RhdGUgb24gcGFnaW5nIC8gZmlsdGVyaW5nIC8gc29ydGluZywgc2VsZWN0aW9ucyBhcmUgY2xlYXJlZCB3aGVuIGVudGVyaW5nIHBpcGUoKSBpZiB0aGVyZSB3ZXJlIGFueS4gT3RoZXJ3aXNlLCB0aGVyZSBjb3VsZCByZW1haW4gc2VsZWN0ZWQgb2JqZWN0cyB0aGF0IGFyZSBub3QgdmlzaWJsZS5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjhcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjgvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjgvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI4XCIsXG4gICAgXCJpZFwiOiAxODYyNjQ4NDgsXG4gICAgXCJudW1iZXJcIjogNzI4LFxuICAgIFwidGl0bGVcIjogXCJnZXQgb25jbGljayBwYWdpbmF0aW9uIGluIGNvbnRyb2xsZXJcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImRvbmkxMTFcIixcbiAgICAgIFwiaWRcIjogMjI4MTcyNzcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzIyODE3Mjc3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTFcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vZG9uaTExMVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMTAtMzFUMTE6NDg6MjBaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0xMC0zMVQxODoyMToyN1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgbmVlZCB0byBkZXRlY3QgdGhlIGN1cnJlbnQgcGFnaW5hdGlvbiBieSB0aGUgY29udHJvbGxlciBvbiB0aGUgb25jbGljayBwYWdpbmF0aW9uLlxcclxcbklzIHRoZXJlIGFueSB3YXkgdG8gZG8gaXQ/XFxyXFxuXFxyXFxuVGhhbmsgeW91XCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI3XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjcvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI3L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI3L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyN1wiLFxuICAgIFwiaWRcIjogMTg0MTY4MDgzLFxuICAgIFwibnVtYmVyXCI6IDcyNyxcbiAgICBcInRpdGxlXCI6IFwic3QtcGlwZSBub3Qgd29ya2luZyB3aXRoIHN0LXNhZmUtc3JjXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJkYW5pZWxlLWJvdHRlbGxpXCIsXG4gICAgICBcImlkXCI6IDg3NjAzNTMsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzg3NjAzNTM/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9kYW5pZWxlLWJvdHRlbGxpXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDQsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0yMFQwODo0MjoxM1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTA4VDE2OjE0OjMwWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgdGhlcmUhXFxuSSBoYXZlIGEgcHJvYmxlbSB1c2luZyBzbWFydCB0YWJsZSB1c2luZyBzdC1zYWZlLXNyYyBhbmQgc3QtcGlwZSB0b2dldGhlci5cXG5BcyBsb25nIGFzIEknbSB1c2luZyBzdC10YWJsZSBhbmQgc3Qtc2FmZS1zcmMgZGlyZWN0aXZlcywgSSBjYW4gc2VlIGFsbCB0aGUgaXRlbXMgaW4gdGhlIHRhYmxlLlxcbkFzIGxvbmcgYXMgSSdtIHVzaW5nIHN0LXRhYmxlIGFuZCBzdC1waXBlIGRpcmVjdGl2ZXMsIEkgY2FuIHNlZSBhbGwgdGhlIGl0ZW1zIGluIHRoZSB0YWJsZS5cXG5CVVQgdXNpbmcgc3QtdGFibGUsIHN0LXNhZmUtc3JjIGFuZCBzdC1waXBlIGRpcmVjdGl2ZXMsIG5vIGl0ZW0gaXMgc2hvd24gaW4gdGhlIHRhYmxlLlxcblxcbkkgdHJpZWQgdGhlIHNvbHV0aW9uIHNob3duIGluIGlzc3VlICMyNDIgYnV0IGl0IGRpZG4ndCB3b3JrLlxcbkluIGlzc3VlICMyMzggam9zaGlqaW1pdCBoYWQgbXkgc2FtZSBwcm9ibGVtIGJ1dCB0aGUgc29sdXRpb24gd2FzOiBkaXNjYXJkIHN0LXNhZmUtc3JjLiBGb3IgbWUgaXQncyBub3QgcG9zc2libGUgYmVjYXVzZSBJIG5lZWQgdG8gZmlsdGVyIG15IHRhYmxlLlxcblxcbllvdSBjYW4gZmluZCBteSBleGFtcGxlIGNvZGUgaGVyZTpcXG5odHRwOi8vcGxua3IuY28vZWRpdC9OcUQ0N1E/cD1wcmV2aWV3XFxuXFxuVGhhbmtzIDopXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI1XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjUvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI1L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI1L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyNVwiLFxuICAgIFwiaWRcIjogMTgzNzczODUwLFxuICAgIFwibnVtYmVyXCI6IDcyNSxcbiAgICBcInRpdGxlXCI6IFwiR28gdG8gc3BlY2lmaWMgcGFnZSBhZnRlciBjdXN0b20gZmlsdGVyXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJhYWxhcmNvbmdcIixcbiAgICAgIFwiaWRcIjogMTk1NTg1ODcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE5NTU4NTg3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZ1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9hYWxhcmNvbmdcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjI1ODYyNDIzLFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL25vdCUyMHJlcHJvZHVjaWJsZVwiLFxuICAgICAgICBcIm5hbWVcIjogXCJub3QgcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwiY29sb3JcIjogXCJlYjY0MjBcIixcbiAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBcImlkXCI6IDI1OTQzODUwNixcbiAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2xhYmVscy90byUyMGJlJTIwY2xvc2VkOiUyMGRvZXMlMjBub3QlMjBmb2xsb3clMjBndWlkZWxpbmVzXCIsXG4gICAgICAgIFwibmFtZVwiOiBcInRvIGJlIGNsb3NlZDogZG9lcyBub3QgZm9sbG93IGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImZiY2EwNFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH1cbiAgICBdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMTAtMThUMTg6NTk6MzhaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0xMC0zMFQyMTo1Nzo0NFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhpLlxcblxcbkknbSB1c2luZyB0aGUgc21hcnQgdGFibGUgd2l0aCBhbiBhcGkgYW5kIGFsc28gaW5jbHVkZSBhIGN1c3RvbSBmaWx0ZXIgZGlyZWN0aXZlIHNvIGkgY2FuIGZpbHRlciBieSBkaWZmZXJlbnQgY29sdW1ucyBhbmQgaXMgd29ya2luZyBvay4gV2hlbiBpIGNsaWNrIG9uIGEgcm93IGkgZ28gdG8gYW5vdGhlciBwYWdlIHRvIHNlZSBtb3JlIGluZm9ybWF0aW9uLCBpbiB0aGlzIG5ldyBwYWdlIHRoZXJlcyBhIFxcXCJnbyBiYWNrXFxcIiBidXR0b24gLCBzbyBpIHN0b3JlIHRoZSB0YWJsZSBjb2xsZWN0aW9uIG9uIGEgc2VydmljZSBzbyB3aGVuIGkgXFxcImdvIGJhY2tcXFwiIGkgcmVzdW1lIHRoZSBjb2xsZWN0aW9uIHdpdGhvdXQgY2FsbGluZyB0aGUgYXBpIGFuZCB0aGUgY3VzdG9tIGZpbHRlcnMgcnVucyBhZ2FpbiBiZWNhdXNlIGkgZ290IHRoZW0gc3RvcmVkIGFsc28gb24gYSBzZXJ2aWNlLiBUaGUgaXNzdWUgdGhhdCBpIGNhbnQgc29sdmUgaXMgdG8gZ28gdG8gYW4gc3BlY2lmaWMgcGFnZSBhZnRlciB0aGUgY3VzdG9tIGZpbHRlciBpcyBleGVjdXRlLlxcblxcbkkgdHJ5IHRvIHVzZSB0aGUgY29udHJvbGxlci5zbGljZSgpIHdhdGNoaW5nIHRoZSBjdGxyLmdldEZpbHRlcmVkQ29sbGVjdGlvbiBidXQgdGhlIGN1c3RvbSBmaWx0ZXIgb3ZlcnJpZGUgdGhlIHBhZ2UgY2hhbmdlcyB0aGF0IHRoZSBzbGlkZSBmdW5jdGlvbiBtYWtlLiBBbHNvIGkgdHJ5IHRvIHVzZSBhIHBlcnNpc3QgZGlyZWN0aXZlIG9uIGxvY2Fsc3RvcmFnZSBidXQgaXMgdGhlIHNhbWUsIHRoZSBjdXN0b20gZmlsdGVyIGV4ZWN1dGUgYW5kIG92ZXJyaWRlIHRoZSBsb2FkIG9mIHRoZSBsb2NhbHN0b3JhZ2UgY29sbGVjdGlvbiBvdmVycmlkaW5nIHRoZSBwYWdlLlxcblxcbmlzIFRoZXJlIGEgd2F5IHRvIHNldCBhbiBzcGVjaWZpYyBwYWdlIGFmdGVyIHRoZSBjdXN0b20gZmlsdGVyPyBmcm9tIHRoZSBjdXN0b20gZmlsdGVyIGRpcmVjdGl2ZSB0aGVyZXMgYSB3YXkgdG8gYWNjZXNzIHRoZSB0YWJsZVN0YXRlP1xcblxcbm15IGN1c3RvbSBmaWx0ZXIgbG9va3Mgc2ltaWxhciB0byAob2YgY291cnNlIHdpdGggc29tZSBjdXN0b20gbG9naWMpOlxcblxcbmBgYCBqYXZhc2NyaXB0XFxuLmZpbHRlcignY3VzdG9tRmlsdGVyJywgWyckZmlsdGVyJywgZnVuY3Rpb24gKCRmaWx0ZXIpIHtcXG4gICByZXR1cm4gZnVuY3Rpb24gY3VzdG9tRmlsdGVyKGFycmF5LCBleHByZXNzaW9uKSB7XFxuICAgICByZXR1cm4gb3V0cHV0O1xcbiAgICB9O1xcbn1dKTtcXG5gYGBcXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIzXCIsXG4gICAgXCJpZFwiOiAxODI2NzM4NzMsXG4gICAgXCJudW1iZXJcIjogNzIzLFxuICAgIFwidGl0bGVcIjogXCJIaWdobGlnaHQgc2VhcmNoIHRlcm0/XCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJrZHVtb3ZpY1wiLFxuICAgICAgXCJpZFwiOiA0NTAzNjgwLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMi5naXRodWJ1c2VyY29udGVudC5jb20vdS80NTAzNjgwP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2tkdW1vdmljXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWMvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWMvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWMvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0xM1QwMTozNTozMlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTEzVDAxOjM1OjMyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSG93ZHksXFxuXFxuSXMgdGhlcmUgYSB3YXkgdG8gaGlnaGxpZ2h0IHRoZSBtYXRjaGluZyBzZWFyY2ggdGVybSB3aXRoaW4gYSB0YWJsZSBjZWxsPyBJIGFtIGltYWdpbmluZyB0aGF0IGFueSB0ZXh0IHdpdGhpbiBhIHRhYmxlIGNlbGwgdGhhdCBtYXRjaGVzIHRoZSBzZWFyY2ggcXVlcnkgd291bGQgYmUgZW5jbG9zZWQgaW4gYSBzcGFuIHRoYXQgY291bGQgdGhlbiBiZSBzdHlsZWQgd2l0aCBhIGJhY2tncm91bmQgY29sb3IsIGV0Yy5cXG5cXG5Eb2VzIHRoaXMgZnVuY3Rpb25hbGl0eSBleGlzdD9cXG5cXG5UaGFua3MuXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMlwiLFxuICAgIFwiaWRcIjogMTgyNDgxMjU2LFxuICAgIFwibnVtYmVyXCI6IDcyMixcbiAgICBcInRpdGxlXCI6IFwiTmV3IEZlYXR1cmUgUmVxdWVzdCA6OiBTZWxlY3QgQWxsIEJ1dHRvbiB3aXRoIHRoZSBUYWJsZVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiaGFyc2hpbGRcIixcbiAgICAgIFwiaWRcIjogODU3NzIxNSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODU3NzIxNT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9oYXJzaGlsZFwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAwLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMTAtMTJUMDk6NDU6NDRaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0xMC0yMVQwOTowMDo1MFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkhpLFxcblxcblRoaXMgdGFsa3MgYWJvdXQgdGhlIHNpbWlsYXIgY29uY2VybnMgYXMgbWVudGlvbmVkIGhlcmUgOi0gaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy8yNzBcXG5cXG5UaGUgcHJvdmlkZWQgZGlyZWN0aXZlIGFsc28gd29ya3MgbGlrZSBhIGNoYXJtLlxcblxcbkJ1dCwgaSBhbSB3b25kZXJpbmcgaWYgaXQgcG9zc2libGUgdG8gaW5jbHVkZSBhbiBhdXRvLXNlbGVjdGlvbiBidXR0b24gd2l0aCB0aGUgbGlicmFyeSBhbmQgdGhlbiBtYXkgYmUgdG9nZ2xpbmcgaXRzIHVzYWdlcyB3aXRoIHRoZSBoZWxwIG9mIHByb3BlcnR5Llxcblxcbkkgc2VhcmNoZWQgcXVpdGUgYSBiaXQgYnV0IG5vdCBmb3VuZCBhbnkgc3VjaCByZXF1ZXN0IG1hZGUgZWFybGllci4gWW91IGNhbiBkaXNjYXJkIGl0IGlmIHNvbWV0aGluZyBsaWtlIHRoaXMgaGFzIGFscmVhZHkgYmVlbiBhZHJlc3NlZFxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNlwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNi9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNi9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTZcIixcbiAgICBcImlkXCI6IDE3NzcwNTQ3MCxcbiAgICBcIm51bWJlclwiOiA3MTYsXG4gICAgXCJ0aXRsZVwiOiBcIkFuZ3VsYXIgU21hcnQgVGFibGUgUmVsb2FkIERhdGEgYW5kIFJlc2V0IEZpbHRlcnMgQWxvbmcgV2l0aCBQYWdpbmF0aW9uKFdpdGhvdXQgc3QtcGlwZSlcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIm5pbWFudGhhaGFyc2hhbmFcIixcbiAgICAgIFwiaWRcIjogMTA4NjQ1OTgsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzEwODY0NTk4P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmFcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbmltYW50aGFoYXJzaGFuYVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAyLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMDktMTlUMDU6MTc6NTlaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0wOS0yMVQwNjowMzoyN1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgaGF2ZSB0aGUgc21hcnQgdGFibGUgd2l0aCBBamF4IGxvYWRlZCBkYXRhIHdoZXJlIEkgd2FudCB0byByZXNldCBmaWx0ZXJzIGFuZCByZWxvYWQgbXkgZGF0YSBjb2xsZWN0aW9uIHdpdGggcmVzZXQgb2YgcGFnaW5hdGlvbiBhcyB3ZWxsIHdoZW4gYSBidXR0b24gaXMgY2xpY2tlZC4gTXkgY29kZSBpcyBnaXZlbiBiZWxvdy5cXG5cXG4qKkhUTUwqKlxcblxcbmA8YnV0dG9uIG5nLWNsaWNrPVxcXCJyZXNldEZpbHRlcnMoKTtcXFwiIHR5cGU9XFxcImJ1dHRvblxcXCIgY2xhc3M9XFxcImJ0biBidG4taW5mb1xcXCI+UmVzZXQ8L2J1dHRvbj5gXFxuXFxuKipKUyoqXFxuXFxuYGBgXFxuXFxuJHNjb3BlLnJlc2V0RmlsdGVycyA9IGZ1bmN0aW9uICgpIHtcXG4gICAgICAgICAgICAkc2NvcGUucm93Q29sbGVjdGlvbiA9IFtdO1xcbiAgICAgICAgICAgICRzY29wZS5kaXNwbGF5ZWRDb2xsZWN0aW9uID0gW107XFxuICAgICAgICAgICAgJHNjb3BlLnByb2R1Y3RfdHlwZSA9IG51bGw7XFxuICAgICAgICAgICAgJHNjb3BlLnByb2R1Y3RfY2F0ZWdvcnkgPSBudWxsO1xcbiAgICAgICAgICAgICRzY29wZS5zZWFyY2ggPSBudWxsO1xcbiAgICAgICAgICAgICRzY29wZS5yb3dDb2xsZWN0aW9uID0gbmV3X2RhdGE7XFxuICAgICAgICB9O1xcbmBgYFxcblxcbkhvd2V2ZXIgSSBjYW4ndCBnZXQgdGhpcyBtYW5hZ2VkIHNpbmNlIHBhZ2luYXRpb24gYW5kIGZpbHRlcnMgYXJlIG5vdCByZXNldHRpbmcuXFxuXFxuSSBoYXZlIHNlZW4gdGhlIGZvbGxvd2luZyBidXQgSSdtIG5vdCBzdXJlIGhvdyBhY3R1YWxseSB0aGUgdGFibGVTdGF0ZSBPYmplY3QgY2FuIGJlIGFjY2Vzc2VkIHNpbmNlIGl0J3MgdW5kZWZpbmVkIHdoZW4gSSBsb2cgaXQgb24gdGhlIGNvbnNvbGUgYW5kIGFsc28gKipJJ20gbm90IHVzaW5nIHN0LXBpcGUgZGlyZWN0aXZlKiouXFxuXFxuYGBgXFxudGFibGVTdGF0ZSA9IGN0cmwudGFibGVTdGF0ZSgpXFxudGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0ID0ge31cXG50YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSAwXFxuYGBgXFxuXFxuUGxlYXNlIEhlbHAuLi5cXG5cXG5UaGFuayBZb3UuXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNFwiLFxuICAgIFwiaWRcIjogMTc1OTA2NTc5LFxuICAgIFwibnVtYmVyXCI6IDcxNCxcbiAgICBcInRpdGxlXCI6IFwiRXhjZWwgbGlrZSB0YWJsZSBjZWxsIHNlbGVjdGlvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic3RhbmxleXh1MjAwNVwiLFxuICAgICAgXCJpZFwiOiA1MTYyNjg3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS81MTYyNjg3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDVcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vc3RhbmxleXh1MjAwNVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAwLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMDktMDlUMDE6NDE6NTRaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0wOS0wOVQwMzowMDoxMVpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkRlYXIgRGV2ZWxvcGVycyxcXG5cXG5JJ2QgbGlrZSB0byBhc2sgd2hldGhlciB0aGVyZSBpcyBhbnkgd2F5IChvciBwbHVnaW4pIHRvIGVuaGFuY2UgdGFibGUgc2VsZWN0aW5nLiBJIHdhbnQgdG8gc2VsZWN0IHRhYmxlIGxpa2Ugd2hhdCB3ZSBpbiBFeGNlbCBkby4gSW4gY29uY3JldGU6IFxcbi0gVGhlIHNlbGVjdGlvbiB3aWxsIGhhdmUgYSBjb2xvcmVkIGJvcmRlclxcbi0gV2hlbiBwcmVzcyBDVFJMK0MsIGRhdGEgd2l0aG91dCBmb3JtYXQgd2lsbCBiZSBjb3BpZWQgaW50byBjbGlwYm9hcmQuXFxuXFxuSSBrbm93IEhhbmRzT25UYWJsZSAoaHR0cHM6Ly9oYW5kc29udGFibGUuY29tL2V4YW1wbGVzLmh0bWw/aGVhZGVycykgaXMgcXVpdGUgZ29vZCBhdCB0aGlzLCBidXQgaXRzIHBlcmZvcm1hbmNlIGlzIGEgbmlnaHRtYXJlLiBJJ2QgbGlrZSB0byB1c2UgbXkgZmF2b3JpdGUgU21hcnQtVGFibGUgdG8gZGVsaXZlciBuZXcgcHJvamVjdHMsIHNvIEknbSBhc2tpbmcgOy0pXFxuXCJcbiAgfVxuXSIsImltcG9ydCBzdCBmcm9tICdzbWFydC10YWJsZS1jb3JlJztcbmltcG9ydCBkYXRhIGZyb20gJy4uL21vY2tEYXRhJztcblxuaW1wb3J0IGdyaWQgZnJvbSAnLi9ncmlkJztcbmltcG9ydCBhY3Rpb25zIGZyb20gJy4vYWN0aW9ucyc7XG5cbmNvbnN0IHNtYXJ0TGlzdFJlZ2lzdHJ5ID0gW107XG5jb25zdCBtYXRjaFhZID0gKHgsIHkpID0+IChpdGVtKSA9PiB4ID09PSBpdGVtLnggJiYgeSA9PT0gaXRlbS55O1xuY29uc3QgZ2V0ID0gKHgsIHkpID0+IHNtYXJ0TGlzdFJlZ2lzdHJ5LmZpbmQobWF0Y2hYWSh4LCB5KSk7XG5jb25zdCBoYXMgPSAoeCwgeSkgPT4gZ2V0KHgsIHkpICE9PSB2b2lkIDA7XG5cbmNvbnN0IGV4dGVuZGVkU21hcnRMaXN0ID0gKCBvcHRzID0+IHtcbiAgY29uc3Qge3gsIHl9ID0gb3B0cztcbiAgY29uc3QgaW5zdGFuY2UgPSBzdChvcHRzKTtcbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24oaW5zdGFuY2UsIHtcbiAgICByZW1vdmU6ICgpID0+IHtcbiAgICAgIHNtYXJ0TGlzdFJlZ2lzdHJ5LnNwbGljZShzbWFydExpc3RSZWdpc3RyeS5pbmRleE9mKGluc3RhbmNlKSwgMSk7XG4gICAgICBhY3Rpb25zLnJlbW92ZVNtYXJ0TGlzdCh7eCwgeX0pO1xuICAgIH1cbiAgfSlcbn0pO1xuXG5jb25zdCBpbnN0YW5jZSA9IHtcbiAgZmluZE9yQ3JlYXRlKHgsIHkpe1xuICAgIGlmICghaGFzKHgsIHkpKSB7XG4gICAgICBjb25zdCBzbWFydExpc3QgPSBleHRlbmRlZFNtYXJ0TGlzdCh7ZGF0YSwgeCwgeX0pO1xuICAgICAgc21hcnRMaXN0Lm9uKCdFWEVDX0NIQU5HRUQnLCAoe3dvcmtpbmd9KSA9PiB7XG4gICAgICAgIGNvbnN0IHtkYXRhOnBhbmVsRGF0YX0gPSBncmlkLmdldERhdGEoeCwgeSk7XG4gICAgICAgIGFjdGlvbnMudXBkYXRlUGFuZWxEYXRhKHt4LCB5LCBkYXRhOiBPYmplY3QuYXNzaWduKHt9LCBwYW5lbERhdGEsIHtwcm9jZXNzaW5nOiB3b3JraW5nfSl9KTtcbiAgICAgIH0pO1xuICAgICAgc21hcnRMaXN0Lm9uRGlzcGxheUNoYW5nZShpdGVtcyA9PiB7XG4gICAgICAgIGFjdGlvbnMudXBkYXRlU21hcnRMaXN0KHtcbiAgICAgICAgICB4LCB5LFxuICAgICAgICAgIHRhYmxlU3RhdGU6IHNtYXJ0TGlzdC5nZXRUYWJsZVN0YXRlKCksXG4gICAgICAgICAgaXRlbXNcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICAgIHNtYXJ0TGlzdFJlZ2lzdHJ5LnB1c2goe3gsIHksIHNtYXJ0TGlzdH0pO1xuICAgICAgYWN0aW9ucy5jcmVhdGVTbWFydExpc3Qoe3gsIHksIHRhYmxlU3RhdGU6IHNtYXJ0TGlzdC5nZXRUYWJsZVN0YXRlKCksIGl0ZW1zOiBbXX0pO1xuICAgICAgc21hcnRMaXN0LmV4ZWMoKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldCh4LCB5KS5zbWFydExpc3Q7XG4gIH0sXG4gIGZpbmQoeCwgeSl7XG4gICAgY29uc3Qgc2wgPSBnZXQoeCwgeSk7XG4gICAgcmV0dXJuIHNsICE9PSB2b2lkIDAgPyBzbC5zbWFydExpc3QgOiBzbDtcbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgaW5zdGFuY2U7XG5cblxuIiwiaW1wb3J0IHtjcmVhdGVTdG9yZSwgYXBwbHlNaWRkbGV3YXJlLCBjb21wb3NlfSBmcm9tICdyZWR1eCc7XG5pbXBvcnQgZ3JpZCBmcm9tICcuL2dyaWQnO1xuaW1wb3J0IHJlZHVjZXIgZnJvbSAnLi4vcmVkdWNlcnMvaW5kZXgnO1xuaW1wb3J0IHNtYXJ0TGlzdFJlZ2lzdHJ5IGZyb20gJy4vc21hcnRMaXN0UmVnaXN0cnknO1xuXG5jb25zdCBpbml0aWFsU3RhdGUgPSB7XG4gIGdyaWQ6IHtcbiAgICBwYW5lbHM6IFsuLi5ncmlkXSxcbiAgICBhY3RpdmU6IG51bGwsXG4gIH0sXG4gIHNtYXJ0TGlzdDogW11cbn07XG5cbi8qKlxuICogdGhpcyB3aWxsIHVwZGF0ZSB0aGUgZGlmZmVyZW50IHJlZ2lzdHJpZXMgd2hlbiBwYW5lbCBwb3NpdGlvbmluZyBjaGFuZ2VcbiAqL1xuY29uc3Qgc3luY1JlZ2lzdHJpZXMgPSAoc3RvcmUpID0+IG5leHQgPT4gYWN0aW9uID0+IHtcbiAgY29uc3Qge3R5cGUsIHgsIHksIHN0YXJ0WCwgc3RhcnRZfSA9IGFjdGlvbjtcbiAgaWYgKHR5cGUgPT09ICdSRVNFVF9QQU5FTCcpIHtcbiAgICBjb25zdCBzbCA9IHNtYXJ0TGlzdFJlZ2lzdHJ5LmZpbmQoeCwgeSk7XG4gICAgaWYgKHNsKSB7XG4gICAgICBzbC5yZW1vdmUoKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ0VORF9NT1ZFJykge1xuICAgIGNvbnN0IHtncmlkOnthY3RpdmV9fSA9IHN0b3JlLmdldFN0YXRlKCk7XG4gICAgaWYgKGFjdGl2ZS52YWxpZCA9PT0gdHJ1ZSkge1xuICAgICAgY29uc3Qgb2xkU2wgPSBzbWFydExpc3RSZWdpc3RyeS5maW5kKHN0YXJ0WCwgc3RhcnRZKTtcbiAgICAgIGNvbnN0IG5ld1NsID0gc21hcnRMaXN0UmVnaXN0cnkuZmluZCh4LCB5KTtcbiAgICAgIGlmIChvbGRTbCkge1xuICAgICAgICBvbGRTbC5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICAgIGlmIChuZXdTbCkge1xuICAgICAgICBuZXdTbC5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmV4dChhY3Rpb24pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgY3JlYXRlU3RvcmUocmVkdWNlcihncmlkKSwgaW5pdGlhbFN0YXRlLFxuICBjb21wb3NlKFxuICAgIGFwcGx5TWlkZGxld2FyZShzeW5jUmVnaXN0cmllcyksXG4gICAgd2luZG93Ll9fUkVEVVhfREVWVE9PTFNfRVhURU5TSU9OX18gJiYgd2luZG93Ll9fUkVEVVhfREVWVE9PTFNfRVhURU5TSU9OX18oKVxuICApXG4pO1xuIiwiaW1wb3J0ICogYXMgYWN0aW9ucyBmcm9tICcuLi9hY3Rpb25zL2luZGV4JztcbmltcG9ydCBzdG9yZSBmcm9tICcuL3N0b3JlJztcblxuY29uc3Qgb3V0cHV0ID0ge307XG5cbmZvcihsZXQgYWN0aW9uIG9mIE9iamVjdC5rZXlzKGFjdGlvbnMpKXtcbiAgb3V0cHV0W2FjdGlvbl0gPSBhcmdzID0+IHN0b3JlLmRpc3BhdGNoKGFjdGlvbnNbYWN0aW9uXShhcmdzKSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IG91dHB1dDsiLCJpbXBvcnQgYWN0aW9ucyBmcm9tICcuL2FjdGlvbnMnO1xuaW1wb3J0IGdyaWQgZnJvbSAnLi9ncmlkJztcbmltcG9ydCBzbWFydExpc3RzIGZyb20gJy4vc21hcnRMaXN0UmVnaXN0cnknO1xuaW1wb3J0IHN0b3JlIGZyb20gJy4vc3RvcmUnO1xuaW1wb3J0IHtjb25uZWN0fSBmcm9tICdmbGFjbyc7XG5cblxuZXhwb3J0IGRlZmF1bHQge1xuICBhY3Rpb25zLFxuICBncmlkLFxuICBzbWFydExpc3RzLFxuICBzdG9yZSxcbiAgY29ubmVjdDogc2xpY2VTdGF0ZSA9PiBjb25uZWN0KHN0b3JlLCBzbGljZVN0YXRlKVxufTsiLCJpbXBvcnQgc2VydmljZXMgZnJvbSAnLi4vc2VydmljZXMvaW5kZXgnXG5cbmV4cG9ydCBkZWZhdWx0IENvbXAgPT4gcHJvcHMgPT4gQ29tcChwcm9wcywgc2VydmljZXMpOyIsImltcG9ydCB7bW91bnQsIGh9IGZyb20gJ2ZsYWNvJztcbmltcG9ydCBBZG9ybmVyUGFuZWwgZnJvbSAnLi9jb21wb25lbnRzL0Fkb3JuZXJQYW5lbCc7XG5pbXBvcnQgRGF0YVBhbmVsIGZyb20gJy4vY29tcG9uZW50cy9EYXRhUGFuZWwnO1xuaW1wb3J0IE1vZGFsIGZyb20gJy4vY29tcG9uZW50cy9Nb2RhbC5qcyc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycydcbmltcG9ydCBzZXJ2aWNlcyBmcm9tICcuL3NlcnZpY2VzL2luZGV4J1xuaW1wb3J0IGluamVjdCBmcm9tICcuL2xpYi9kaS5qcyc7XG5pbXBvcnQge1JPV1MsIENPTFVNTlN9IGZyb20gJy4vbGliL2NvbnN0YW50cyc7XG5cbmNvbnN0IGNvbm5lY3RUb01vZGFsID0gc2VydmljZXMuY29ubmVjdChzdGF0ZSA9PiBzdGF0ZS5tb2RhbCk7XG5jb25zdCBTaWRlTW9kYWwgPSBjb21wb3NlKGluamVjdCwgY29ubmVjdFRvTW9kYWwpKE1vZGFsKTtcblxuY29uc3QgZ2V0Q29vcmRzRnJvbU1vdXNlRXZlbnQgPSAoY29sdW1ucywgcm93cykgPT4gKGV2KSA9PiB7XG4gIGNvbnN0IHtjdXJyZW50VGFyZ2V0LCBvZmZzZXRYLCBvZmZzZXRZfSA9IGV2O1xuICBjb25zdCB7b2Zmc2V0V2lkdGgsIG9mZnNldEhlaWdodH0gPSBjdXJyZW50VGFyZ2V0O1xuICBsZXQgeHBpeCA9IG9mZnNldFg7XG4gIGxldCB5cGl4ID0gb2Zmc2V0WTtcbiAgbGV0IHt0YXJnZXR9ID0gZXY7XG4gIHdoaWxlICh0YXJnZXQgIT09IGN1cnJlbnRUYXJnZXQgJiYgdGFyZ2V0ICE9PSB2b2lkIDApIHtcbiAgICB4cGl4ICs9IHRhcmdldC5vZmZzZXRMZWZ0O1xuICAgIHlwaXggKz0gdGFyZ2V0Lm9mZnNldFRvcDtcbiAgICB0YXJnZXQgPSB0YXJnZXQub2Zmc2V0UGFyZW50O1xuICB9XG4gIGNvbnN0IHggPSBNYXRoLmZsb29yKCh4cGl4IC8gb2Zmc2V0V2lkdGgpICogQ09MVU1OUykgKyAxO1xuICBjb25zdCB5ID0gTWF0aC5mbG9vcigoeXBpeCAvIG9mZnNldEhlaWdodCkgKiBST1dTKSArIDE7XG4gIHJldHVybiB7eCwgeX07XG59O1xuXG5jb25zdCBDb250YWluZXIgPSBpbmplY3QoKHtwYW5lbHN9LCB7YWN0aW9ucywgY29ubmVjdH0pID0+IHtcblxuICAvL2NyZWF0ZSBzdWJzY3JpcHRpb24gdG8gcGFuZWwoeCx5KVxuICBjb25zdCBmaW5kUGFuZWxGcm9tU3RhdGUgPSAoeCwgeSkgPT4gc3RhdGUgPT4gc3RhdGUuZ3JpZC5wYW5lbHMuZmluZCgoe3g6cHgsIHk6cHl9KSA9PiB4ID09PSBweCAmJiB5ID09PSBweSk7XG4gIGNvbnN0IHN1YnNjcmliZVRvID0gKHgsIHkpID0+IGNvbm5lY3QoZmluZFBhbmVsRnJvbVN0YXRlKHgsIHkpKTtcbiAgY29uc3Qgc3Vic2NyaWJlRnVuY3Rpb25zID0gcGFuZWxzLm1hcCgoe3gsIHl9KSA9PiBjb21wb3NlKGluamVjdCwgc3Vic2NyaWJlVG8oeCwgeSkpKTtcblxuICAvL2NyZWF0ZSBjb25uZWN0ZWQgY29tcG9uZW50c1xuICBjb25zdCBBZG9ybmVyUGFuZWxDb21wb25lbnRzID0gc3Vic2NyaWJlRnVuY3Rpb25zLm1hcChzdWJzY3JpYmUgPT4gc3Vic2NyaWJlKEFkb3JuZXJQYW5lbCkpO1xuICBjb25zdCBEYXRhUGFuZWxDb21wb25lbnRzID0gc3Vic2NyaWJlRnVuY3Rpb25zLm1hcChzdWJzY3JpYmUgPT4gc3Vic2NyaWJlKERhdGFQYW5lbCkpO1xuXG4gIGNvbnN0IGNvb3JkcyA9IGdldENvb3Jkc0Zyb21Nb3VzZUV2ZW50KENPTFVNTlMsIFJPV1MpO1xuXG4gIGNvbnN0IG9uRHJhZ092ZXIgPSAoZXYpID0+IHtcbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHt4LCB5fSA9IGNvb3Jkcyhldik7XG4gICAgYWN0aW9ucy5kcmFnT3Zlcigoe3gsIHl9KSk7XG4gIH07XG5cbiAgY29uc3Qgb25Ecm9wID0gZXYgPT4ge1xuICAgIGNvbnN0IHtkYXRhVHJhbnNmZXJ9ID0gZXY7XG4gICAgY29uc3QgZGF0YSA9IGRhdGFUcmFuc2Zlci5nZXREYXRhKCd0ZXh0L3BsYWluJyk7XG4gICAgY29uc3QgSnNvbkRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgIGNvbnN0IHt4OnN0YXJ0WCwgeTpzdGFydFksIG9wZXJhdGlvbn0gPSBKc29uRGF0YTtcbiAgICBpZiAoc3RhcnRYICYmIHN0YXJ0WSAmJiBbJ21vdmUnLCAncmVzaXplJ10uaW5jbHVkZXMob3BlcmF0aW9uKSkge1xuICAgICAgY29uc3Qge3gsIHl9ID0gY29vcmRzKGV2KTtcbiAgICAgIGNvbnN0IGFyZ3MgPSB7eCwgc3RhcnRYLCB5LCBzdGFydFl9O1xuICAgICAgaWYgKG9wZXJhdGlvbiA9PT0gJ3Jlc2l6ZScpIHtcbiAgICAgICAgYWN0aW9ucy5lbmRSZXNpemUoYXJncyk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgYWN0aW9ucy5lbmRNb3ZlKGFyZ3MpO1xuICAgICAgfVxuICAgIH1cbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICB9O1xuXG4gIHJldHVybiAoPGRpdiBjbGFzcz1cImdyaWQtY29udGFpbmVyXCI+XG4gICAgPGRpdiBjbGFzcz1cImdyaWQgYWRvcm5lci1sYXllclwiPlxuICAgICAge1xuICAgICAgICBBZG9ybmVyUGFuZWxDb21wb25lbnRzLm1hcChQYW5lbCA9PiA8UGFuZWwvPilcbiAgICAgIH1cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZ3JpZCBkYXRhLWxheWVyXCIgb25EcmFnb3Zlcj17b25EcmFnT3Zlcn0gb25Ecm9wPXtvbkRyb3B9PlxuICAgICAge1xuICAgICAgICBEYXRhUGFuZWxDb21wb25lbnRzLm1hcChQYW5lbCA9PiA8UGFuZWwvPilcbiAgICAgIH1cbiAgICA8L2Rpdj5cbiAgICA8U2lkZU1vZGFsIC8+XG4gIDwvZGl2Pik7XG59KTtcblxuY29uc3Qge2dyaWQ6e3BhbmVsc319ID0gc2VydmljZXMuc3RvcmUuZ2V0U3RhdGUoKTtcblxubW91bnQoQ29udGFpbmVyLCB7XG4gIHBhbmVsczogcGFuZWxzXG59LCBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWFpbicpKTtcbiJdLCJuYW1lcyI6WyJtb3VudCIsIkFkb3JuZXJQYW5lbCIsImZsZXhpYmxlIiwiRW1wdHlEYXRhUGFuZWwiLCJwcm94eUxpc3RlbmVyIiwiY3JlYXRlRW1pdHRlciIsImVtaXR0ZXIiLCJlbGVtZW50Q29tcG9uZW50IiwiY2hlY2tLZXlzLmlzRW50ZXIiLCJjaGVja0tleXMuaXNTcGFjZSIsInByb3h5IiwiZWxlbWVudENvbXAiLCJtZW51IiwiZXhwYW5kYWJsZSIsImV4cGFuZGFibGVGYWN0b3J5IiwiZHJvcGRvd25GYWN0b3J5IiwiY29ubmVjdCIsIkxpc3REYXRhUGFuZWwiLCJDaGFydERhdGFQYW5lbCIsIm1vZGFsIiwib25VcGRhdGUiLCJ1cGRhdGUiLCJNb2RhbFZpZXciLCJTeW1ib2wiLCJvYmplY3RQcm90byIsImhhc093blByb3BlcnR5Iiwic3ltVG9TdHJpbmdUYWciLCJuYXRpdmVPYmplY3RUb1N0cmluZyIsInJvb3QiLCJwb255ZmlsbCIsIiQkb2JzZXJ2YWJsZSIsImNvbXBvc2UiLCJwb2ludGVyIiwiZmlsdGVyIiwic29ydEZhY3RvcnkiLCJzb3J0Iiwic2VhcmNoIiwidGFibGUiLCJzdCIsImFjdGlvbnMiLCJzbWFydExpc3RSZWdpc3RyeSIsInNtYXJ0TGlzdHMiLCJNb2RhbCJdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUFLLE1BQU07RUFDbEMsUUFBUSxFQUFFLE1BQU07RUFDaEIsUUFBUSxFQUFFLEVBQUU7RUFDWixLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7RUFDZCxTQUFTLEVBQUUsQ0FBQztDQUNiLENBQUMsQ0FBQzs7Ozs7Ozs7O0FBU0gsQUFBZSxTQUFTLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsUUFBUSxFQUFFO0VBQ3ZELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLO0lBQ25ELE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0QsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0dBQ2xDLEVBQUUsRUFBRSxDQUFDO0tBQ0gsR0FBRyxDQUFDLEtBQUssSUFBSTs7TUFFWixNQUFNLElBQUksR0FBRyxPQUFPLEtBQUssQ0FBQztNQUMxQixPQUFPLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxLQUFLLFVBQVUsR0FBRyxLQUFLLEdBQUcsZUFBZSxDQUFDLEtB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
