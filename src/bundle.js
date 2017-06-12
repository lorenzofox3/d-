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

var connect = (store, actions = {}, sliceState = identity) =>
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

var AdornerPanel = (props, {grid}) => {
  const {x, y} = props;
  const {adornerStatus = 0} = grid.getData(x, y);
  return h( AdornerPanel$1, { x: x, y: y, adornerStatus: adornerStatus })
};

const ROWS = 4;
const COLUMNS = 4;

const flexible = Comp => (props) => {
  const {x, y, dx, dy, adornerStatus, onResizeStart, onMoveStart} = props;
  const zIndex = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['data-panel'];

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return h( Panel, { x: x, y: y, dx: dx, dy: dy, style: `z-index:${zIndex};`, panelClasses: panelClasses },
    h( 'div', { class: "move-handle", draggable: "true", onDragStart: onMoveStart }),
    h( Comp, props),
    h( 'div', { class: "resize-handle", draggable: "true", onDragStart: onResizeStart })
  )
};

var EmptyDataPanel$1 = flexible(props => h( 'button', { onClick: props.onClick }, "+"));

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

  const onClick = _ => {
    actions.openModal({x, y, title: 'Create new data panel', modalType: 'createPanelData'});
  };

  return h( EmptyDataPanel$1, Object.assign({}, panelData, { onMoveStart: onMoveStart, onClick: onClick, onResizeStart: onResizeStart }));
});

var ListDataPanel$1 = flexible(props => {
  const {data = {}, onReset, onEdit} = props;
  const {processing = false} = data;
  return (h( 'div', { class: "panel-content" },
    h( 'header', { class: "panel-header" },
      h( 'h2', null, data.title ),
      h( 'button', { onClick: onReset }, "Reset"),
      h( 'button', { onClick: onEdit }, "Edit")
    ),
    h( 'div', { class: "panel-body" },
      h( 'div', { 'aria-hidden': String(!processing), class: "processing-overlay" }, "Processing ..."),
      props.children
    )
  ));
});

const IssueCard = (props) => {
  const {issue = {}} = props;
  const {state, created_at, user, number, html_url, title, comments} = issue;
  return h( 'article', { class: "issue" },
    h( 'h3', null, title ),
    h( 'a', { rel: "self", href: html_url }, "#", number),
    h( 'span', { class: "status" }, state),
    h( 'p', { class: "meta" }, "opened on ", h( 'time', null, " ", (new Date(created_at)).toDateString(), " " ), "by ", h( 'a', { rel: "author", href: user.html_url }, user.login)
    ),
    h( 'p', null,
      comments, " C" )
  )
};


const IssuesList = (props) => {
  const {issues = []} = props;
  return (
    h( 'div', { class: "issues-list-container" },
      h( 'div', { class: "fake-border" }),
      h( 'ul', { class: "issues-list" },
        issues.map(i => h( 'li', null, h( IssueCard, { issue: i }) ))
      ),
      h( 'div', { class: "fake-border" })
    ));
};

var SmartIssuesList = (props) => {
  const {smartList, items =[]} = props;
  return (
    h( 'div', { class: "issues-container" }
      /*<button onClick={ev => {*/
        /*smartList.sort({pointer: 'title', direction: ['asc', 'desc'][Math.random() > 0.5 ? 1 : 0]})*/
      /*}}>click</button>*/,
      h( IssuesList, { issues: items.map(i => i.value) })
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

  return (h( ListDataPanel$1, Object.assign({}, { onEdit: clickEdit, onReset: clickReset, onMoveStart: onMoveStart, onResizeStart: onResizeStart }, panelData),
    h( SmartListComponent, { smartList: smartList, x: x, y: y })
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
  return h( 'p', null, "That is a chart" );
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

const autofocus = onMount((vnode) => {
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
      Object.assign(data, val);
      update$$1(Object.assign(props, {data}));
    };
    return h( EditDataPanelForm, Object.assign({}, { onUpdate: onUpdate$$1 }, props));
  });

  return (h( Modal$2, { isOpen: props.isOpen, closeModal: props.closeModal, title: props.title },
    h( UpdatableFormSection, props)
  ));
};

var EditPanelDataModal = (props, {actions}) => {
  const {x, y, data = {}} = props;
  const onSubmit = ev => {
    ev.preventDefault();
    actions.updatePanelData({x, y, data: data});
    actions.closeModal();
  };

  return h( EditDataPanelModal, Object.assign({}, { data: data, closeModal: actions.closeModal }, props, { onSubmit: onSubmit }))
};

var ComfirmationModal = (props) => {
  const {isOpen, closeModal, executeAction, message} = props;
  const confirm = _ => {
    closeModal();
    executeAction();
  };
  return h( Modal$2, { isOpen: isOpen, closeModal: closeModal, title: "Attention !" },
    h( 'p', null, message ),
    h( 'div', null,
      h( 'button', { onClick: confirm }, " Confirm"),
      h( 'button', { onClick: closeModal }, " Cancel")
    )
  )
};

var ConfirmationModal = (props, {actions}) => h( ComfirmationModal, Object.assign({}, { closeModal: actions.closeModal }, props));

const EmptyModal = (props, {actions}) => {
  return (h( Modal$2, { isOpen: props.isOpen, closeModal: actions.closeModal },
    h( 'div', null )
  ));
};


const getModalComponent = (modalType) => {
  switch (modalType) {
    case 'createPanelData':
      return EditPanelDataModal;
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

function swap$1 (f) {
  return (a, b) => f(b, a);
}

function compose$1 (first, ...fns) {
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

function compose$2() {
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

  var last = funcs[funcs.length - 1];
  var rest = funcs.slice(0, -1);
  return function () {
    return rest.reduceRight(function (composed, f) {
      return f(composed);
    }, last.apply(undefined, arguments));
  };
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
      _dispatch = compose$2.apply(undefined, chain)(store.dispatch);

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
      return Object.assign(state, {active: Object.assign({}.active, {valid: false})});
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
      //todo remove dataConf of hidden panels ?
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
      return compose$1(String, (val) => val.toLowerCase());
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
  const operateOnTyped = compose$1(typeIt, operators[operator]);
  const predicateFunc = operateOnTyped(value);
  return compose$1(typeIt, predicateFunc);
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
    return compose$1(getter, every(clauses));
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
        const execFunc = compose$1(filterFunc, searchFunc, tap$1(dispatchSummary), sortFunc, sliceFunc);
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

  const updateTableState = curry$1((pter, ev, newPartialState) => compose$1(
    safeAssign(pter.get(tableState)),
    tap$1(dispatch(ev)),
    pter.set(tableState)
  )(newPartialState));

  const resetToFirstPage = () => updateTableState(slicePointer, PAGE_CHANGED, {page: 1});

  const tableOperation = (pter, ev) => compose$1(
    updateTableState(pter, ev),
    resetToFirstPage,
    () => table.exec() // we wrap within a function so table.exec can be overwritten (when using with a server for example)
  );

  const api = {
    sort: tableOperation(sortPointer, TOGGLE_SORT),
    filter: tableOperation(filterPointer, FILTER_CHANGED),
    search: tableOperation(searchPointer, SEARCH_CHANGED),
    slice: compose$1(updateTableState(slicePointer, PAGE_CHANGED), () => table.exec()),
    exec,
    eval(state = tableState){
      return Promise.resolve()
        .then(function () {
          const sortFunc = sortFactory(sortPointer.get(state));
          const searchFunc = searchFactory(searchPointer.get(state));
          const filterFunc = filterFactory(filterPointer.get(state));
          const sliceFunc = sliceFactory(slicePointer.get(state));
          const execFunc = compose$1(filterFunc, searchFunc, sortFunc, sliceFunc);
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
  compose$2(
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
  connect: sliceState => connect(store, output, sliceState)
};

var inject = Comp => props => Comp(props, services);

const connectToModal = services.connect(state => state.modal);
const SideModal = compose$1(inject, connectToModal)(Modal$1);

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

const Container = inject(({panels}, {actions, connect: connect$$1}) => {

  //create subscription to panel(x,y)
  const findPanelFromState = (x, y) => state => state.grid.panels.find(({x:px, y:py}) => x === px && y === py);
  const subscribeTo = (x, y) => connect$$1(findPanelFromState(x, y));
  const subscribeFunctions = panels.map(({x, y}) => compose$1(inject, subscribeTo(x, y)));

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlcyI6WyIuLi8uLi9mbGFjby9saWIvaC5qcyIsIi4uLy4uL2ZsYWNvL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1vcGVyYXRvcnMvaW5kZXguanMiLCIuLi8uLi9mbGFjby9saWIvdXRpbC5qcyIsIi4uLy4uL2ZsYWNvL2xpYi9kb21VdGlsLmpzIiwiLi4vLi4vZmxhY28vbGliL3RyYXZlcnNlLmpzIiwiLi4vLi4vZmxhY28vbGliL3RyZWUuanMiLCIuLi8uLi9mbGFjby9saWIvdXBkYXRlLmpzIiwiLi4vLi4vZmxhY28vbGliL2xpZmVDeWNsZXMuanMiLCIuLi8uLi9mbGFjby9saWIvd2l0aFN0YXRlLmpzIiwiLi4vLi4vZmxhY28vbGliL2Nvbm5lY3QuanMiLCJ2aWV3cy9QYW5lbC5qcyIsInZpZXdzL0Fkb3JuZXJQYW5lbC5qcyIsImNvbXBvbmVudHMvQWRvcm5lclBhbmVsLmpzIiwibGliL2NvbnN0YW50cy5qcyIsInZpZXdzL0ZsZXhpYmxlRGF0YVBhbmVsLmpzIiwidmlld3MvRW1wdHlEYXRhUGFuZWwuanMiLCJjb21wb25lbnRzL0ZsZXhpYmxlRGF0YVBhbmVsLmpzIiwiY29tcG9uZW50cy9FbXB0eURhdGFQYW5lbC5qcyIsInZpZXdzL0xpc3REYXRhUGFuZWwuanMiLCJ2aWV3cy9Jc3N1ZXMuanMiLCJjb21wb25lbnRzL1NtYXJ0SXNzdWVMaXN0LmpzIiwiY29tcG9uZW50cy9MaXN0RGF0YVBhbmVsLmpzIiwidmlld3MvQ2hhcnREYXRhUGFuZWwuanMiLCJjb21wb25lbnRzL0NoYXJ0RGF0YVBhbmVsLmpzIiwiY29tcG9uZW50cy9EYXRhUGFuZWwuanMiLCJ2aWV3cy9Nb2RhbC5qcyIsInZpZXdzL0VkaXREYXRhUGFuZWxGb3JtLmpzIiwiY29tcG9uZW50cy9FZGl0UGFuZWxEYXRhTW9kYWwuanMiLCJ2aWV3cy9Db25maXJtYXRpb25Nb2RhbC5qcyIsImNvbXBvbmVudHMvQ29uZmlybWF0aW9uTW9kYWwuanMiLCJjb21wb25lbnRzL01vZGFsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLW9wZXJhdG9ycy9pbmRleC5qcyIsImFjdGlvbnMvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19mcmVlR2xvYmFsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fcm9vdC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX1N5bWJvbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX2dldFJhd1RhZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX29iamVjdFRvU3RyaW5nLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC1lcy9fYmFzZUdldFRhZy5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvX292ZXJBcmcuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL19nZXRQcm90b3R5cGUuanMiLCIuLi9ub2RlX21vZHVsZXMvbG9kYXNoLWVzL2lzT2JqZWN0TGlrZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9sb2Rhc2gtZXMvaXNQbGFpbk9iamVjdC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zeW1ib2wtb2JzZXJ2YWJsZS9lcy9wb255ZmlsbC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zeW1ib2wtb2JzZXJ2YWJsZS9lcy9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWR1eC9lcy9jcmVhdGVTdG9yZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWR1eC9lcy91dGlscy93YXJuaW5nLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlZHV4L2VzL2NvbXBvc2UuanMiLCIuLi9ub2RlX21vZHVsZXMvcmVkdXgvZXMvYXBwbHlNaWRkbGV3YXJlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlZHV4L2VzL2luZGV4LmpzIiwibGliL2dyaWQuanMiLCJzZXJ2aWNlcy9ncmlkLmpzIiwicmVkdWNlcnMvZ3JpZC5qcyIsInJlZHVjZXJzL21vZGFsLmpzIiwicmVkdWNlcnMvc21hcnRMaXN0LmpzIiwicmVkdWNlcnMvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtanNvbi1wb2ludGVyL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXNvcnQvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtZmlsdGVyL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXNlYXJjaC9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1jb3JlL3NyYy9zbGljZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1ldmVudHMvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9zcmMvZXZlbnRzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2RpcmVjdGl2ZXMvdGFibGUuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9zcmMvdGFibGUuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9pbmRleC5qcyIsIm1vY2tEYXRhLmpzIiwic2VydmljZXMvc21hcnRMaXN0UmVnaXN0cnkuanMiLCJzZXJ2aWNlcy9zdG9yZS5qcyIsInNlcnZpY2VzL2FjdGlvbnMuanMiLCJzZXJ2aWNlcy9pbmRleC5qcyIsImxpYi9kaS5qcyIsImluZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGNyZWF0ZVRleHRWTm9kZSA9ICh2YWx1ZSkgPT4gKHtcbiAgbm9kZVR5cGU6ICdUZXh0JyxcbiAgY2hpbGRyZW46IFtdLFxuICBwcm9wczoge3ZhbHVlfSxcbiAgbGlmZUN5Y2xlOiAwXG59KTtcblxuLyoqXG4gKiBUcmFuc2Zvcm0gaHlwZXJzY3JpcHQgaW50byB2aXJ0dWFsIGRvbSBub2RlXG4gKiBAcGFyYW0gbm9kZVR5cGUge0Z1bmN0aW9uLCBTdHJpbmd9IC0gdGhlIEhUTUwgdGFnIGlmIHN0cmluZywgYSBjb21wb25lbnQgb3IgY29tYmluYXRvciBvdGhlcndpc2VcbiAqIEBwYXJhbSBwcm9wcyB7T2JqZWN0fSAtIHRoZSBsaXN0IG9mIHByb3BlcnRpZXMvYXR0cmlidXRlcyBhc3NvY2lhdGVkIHRvIHRoZSByZWxhdGVkIG5vZGVcbiAqIEBwYXJhbSBjaGlsZHJlbiAtIHRoZSB2aXJ0dWFsIGRvbSBub2RlcyByZWxhdGVkIHRvIHRoZSBjdXJyZW50IG5vZGUgY2hpbGRyZW5cbiAqIEByZXR1cm5zIHtPYmplY3R9IC0gYSB2aXJ0dWFsIGRvbSBub2RlXG4gKi9cbmV4cG9ydCBkZWZhdWx0ICBmdW5jdGlvbiBoIChub2RlVHlwZSwgcHJvcHMsIC4uLmNoaWxkcmVuKSB7XG4gIGNvbnN0IGZsYXRDaGlsZHJlbiA9IGNoaWxkcmVuLnJlZHVjZSgoYWNjLCBjaGlsZCkgPT4ge1xuICAgIGNvbnN0IGNoaWxkcmVuQXJyYXkgPSBBcnJheS5pc0FycmF5KGNoaWxkKSA/IGNoaWxkIDogW2NoaWxkXTtcbiAgICByZXR1cm4gYWNjLmNvbmNhdChjaGlsZHJlbkFycmF5KTtcbiAgfSwgW10pXG4gICAgLm1hcChjaGlsZCA9PiB7XG4gICAgICAvLyBub3JtYWxpemUgdGV4dCBub2RlIHRvIGhhdmUgc2FtZSBzdHJ1Y3R1cmUgdGhhbiByZWd1bGFyIGRvbSBub2Rlc1xuICAgICAgY29uc3QgdHlwZSA9IHR5cGVvZiBjaGlsZDtcbiAgICAgIHJldHVybiB0eXBlID09PSAnb2JqZWN0JyB8fCB0eXBlID09PSAnZnVuY3Rpb24nID8gY2hpbGQgOiBjcmVhdGVUZXh0Vk5vZGUoY2hpbGQpO1xuICAgIH0pO1xuXG4gIGlmICh0eXBlb2Ygbm9kZVR5cGUgIT09ICdmdW5jdGlvbicpIHsvL3JlZ3VsYXIgaHRtbC90ZXh0IG5vZGVcbiAgICByZXR1cm4ge1xuICAgICAgbm9kZVR5cGUsXG4gICAgICBwcm9wczogcHJvcHMsXG4gICAgICBjaGlsZHJlbjogZmxhdENoaWxkcmVuLFxuICAgICAgbGlmZUN5Y2xlOiAwXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBmdWxsUHJvcHMgPSBPYmplY3QuYXNzaWduKHtjaGlsZHJlbjogZmxhdENoaWxkcmVufSwgcHJvcHMpO1xuICAgIGNvbnN0IGNvbXAgPSBub2RlVHlwZShmdWxsUHJvcHMpO1xuICAgIHJldHVybiB0eXBlb2YgY29tcCAhPT0gJ2Z1bmN0aW9uJyA/IGNvbXAgOiBoKGNvbXAsIHByb3BzLCAuLi5mbGF0Q2hpbGRyZW4pOyAvL2Z1bmN0aW9uYWwgY29tcCB2cyBjb21iaW5hdG9yIChIT0MpXG4gIH1cbn07IiwiZXhwb3J0IGZ1bmN0aW9uIHN3YXAgKGYpIHtcbiAgcmV0dXJuIChhLCBiKSA9PiBmKGIsIGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZSAoZmlyc3QsIC4uLmZucykge1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IGZucy5yZWR1Y2UoKHByZXZpb3VzLCBjdXJyZW50KSA9PiBjdXJyZW50KHByZXZpb3VzKSwgZmlyc3QoLi4uYXJncykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3VycnkgKGZuLCBhcml0eUxlZnQpIHtcbiAgY29uc3QgYXJpdHkgPSBhcml0eUxlZnQgfHwgZm4ubGVuZ3RoO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjb25zdCBhcmdMZW5ndGggPSBhcmdzLmxlbmd0aCB8fCAxO1xuICAgIGlmIChhcml0eSA9PT0gYXJnTGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZm4oLi4uYXJncyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGZ1bmMgPSAoLi4ubW9yZUFyZ3MpID0+IGZuKC4uLmFyZ3MsIC4uLm1vcmVBcmdzKTtcbiAgICAgIHJldHVybiBjdXJyeShmdW5jLCBhcml0eSAtIGFyZ3MubGVuZ3RoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseSAoZm4pIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiBmbiguLi5hcmdzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhcCAoZm4pIHtcbiAgcmV0dXJuIGFyZyA9PiB7XG4gICAgZm4oYXJnKTtcbiAgICByZXR1cm4gYXJnO1xuICB9XG59IiwiZXhwb3J0IGNvbnN0IG5leHRUaWNrID0gZm4gPT4gc2V0VGltZW91dChmbiwgMCk7XG5cbmV4cG9ydCBjb25zdCBwYWlyaWZ5ID0gaG9sZGVyID0+IGtleSA9PiBba2V5LCBob2xkZXJba2V5XV07XG5cbmV4cG9ydCBjb25zdCBpc1NoYWxsb3dFcXVhbCA9IChhLCBiKSA9PiB7XG4gIGNvbnN0IGFLZXlzID0gT2JqZWN0LmtleXMoYSk7XG4gIGNvbnN0IGJLZXlzID0gT2JqZWN0LmtleXMoYik7XG4gIHJldHVybiBhS2V5cy5sZW5ndGggPT09IGJLZXlzLmxlbmd0aCAmJiBhS2V5cy5ldmVyeSgoaykgPT4gYVtrXSA9PT0gYltrXSk7XG59O1xuXG5jb25zdCBvd25LZXlzID0gb2JqID0+IE9iamVjdC5rZXlzKG9iaikuZmlsdGVyKGsgPT4gb2JqLmhhc093blByb3BlcnR5KGspKTtcblxuZXhwb3J0IGNvbnN0IGlzRGVlcEVxdWFsID0gKGEsIGIpID0+IHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBhO1xuXG4gIC8vc2hvcnQgcGF0aChzKVxuICBpZiAoYSA9PT0gYikge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHR5cGUgIT09IHR5cGVvZiBiKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGEgPT09IGI7XG4gIH1cblxuICAvLyBvYmplY3RzIC4uLlxuICBpZiAoYSA9PT0gbnVsbCB8fCBiID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkpIHtcbiAgICByZXR1cm4gYS5sZW5ndGggJiYgYi5sZW5ndGggJiYgYS5ldmVyeSgoaXRlbSwgaSkgPT4gaXNEZWVwRXF1YWwoYVtpXSwgYltpXSkpO1xuICB9XG5cbiAgY29uc3QgYUtleXMgPSBvd25LZXlzKGEpO1xuICBjb25zdCBiS2V5cyA9IG93bktleXMoYik7XG4gIHJldHVybiBhS2V5cy5sZW5ndGggPT09IGJLZXlzLmxlbmd0aCAmJiBhS2V5cy5ldmVyeShrID0+IGlzRGVlcEVxdWFsKGFba10sIGJba10pKTtcbn07XG5cbmV4cG9ydCBjb25zdCBpZGVudGl0eSA9IGEgPT4gYTtcblxuZXhwb3J0IGNvbnN0IG5vb3AgPSBfID0+IHtcbn07XG4iLCJpbXBvcnQge3RhcH0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcblxuY29uc3QgU1ZHX05QID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcblxuY29uc3QgdXBkYXRlRG9tTm9kZUZhY3RvcnkgPSAobWV0aG9kKSA9PiAoaXRlbXMpID0+IHRhcChkb21Ob2RlID0+IHtcbiAgZm9yIChsZXQgcGFpciBvZiBpdGVtcykge1xuICAgIGRvbU5vZGVbbWV0aG9kXSguLi5wYWlyKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCByZW1vdmVFdmVudExpc3RlbmVycyA9IHVwZGF0ZURvbU5vZGVGYWN0b3J5KCdyZW1vdmVFdmVudExpc3RlbmVyJyk7XG5leHBvcnQgY29uc3QgYWRkRXZlbnRMaXN0ZW5lcnMgPSB1cGRhdGVEb21Ob2RlRmFjdG9yeSgnYWRkRXZlbnRMaXN0ZW5lcicpO1xuZXhwb3J0IGNvbnN0IHNldEF0dHJpYnV0ZXMgPSAoaXRlbXMpID0+IHRhcCgoZG9tTm9kZSkgPT4ge1xuICBjb25zdCBhdHRyaWJ1dGVzID0gaXRlbXMuZmlsdGVyKChba2V5LCB2YWx1ZV0pID0+IHR5cGVvZiB2YWx1ZSAhPT0gJ2Z1bmN0aW9uJyk7XG4gIGZvciAobGV0IFtrZXksIHZhbHVlXSBvZiBhdHRyaWJ1dGVzKSB7XG4gICAgdmFsdWUgPT09IGZhbHNlID8gZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoa2V5KSA6IGRvbU5vZGUuc2V0QXR0cmlidXRlKGtleSwgdmFsdWUpO1xuICB9XG59KTtcbmV4cG9ydCBjb25zdCByZW1vdmVBdHRyaWJ1dGVzID0gKGl0ZW1zKSA9PiB0YXAoZG9tTm9kZSA9PiB7XG4gIGZvciAobGV0IGF0dHIgb2YgaXRlbXMpIHtcbiAgICBkb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgfVxufSk7XG5cbmV4cG9ydCBjb25zdCBzZXRUZXh0Tm9kZSA9IHZhbCA9PiBub2RlID0+IG5vZGUudGV4dENvbnRlbnQgPSB2YWw7XG5cbmV4cG9ydCBjb25zdCBjcmVhdGVEb21Ob2RlID0gKHZub2RlLCBwYXJlbnQpID0+IHtcbiAgaWYgKHZub2RlLm5vZGVUeXBlID09PSAnc3ZnJykge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHX05QLCB2bm9kZS5ub2RlVHlwZSk7XG4gIH0gZWxzZSBpZiAodm5vZGUubm9kZVR5cGUgPT09ICdUZXh0Jykge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2bm9kZS5ub2RlVHlwZSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHBhcmVudC5uYW1lc3BhY2VVUkkgPT09IFNWR19OUCA/IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTlAsIHZub2RlLm5vZGVUeXBlKSA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodm5vZGUubm9kZVR5cGUpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0RXZlbnRMaXN0ZW5lcnMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKHByb3BzKVxuICAgIC5maWx0ZXIoayA9PiBrLnN1YnN0cigwLCAyKSA9PT0gJ29uJylcbiAgICAubWFwKGsgPT4gW2suc3Vic3RyKDIpLnRvTG93ZXJDYXNlKCksIHByb3BzW2tdXSk7XG59O1xuIiwiZXhwb3J0IGNvbnN0IHRyYXZlcnNlID0gZnVuY3Rpb24gKiAodm5vZGUpIHtcbiAgeWllbGQgdm5vZGU7XG4gIGlmICh2bm9kZS5jaGlsZHJlbiAmJiB2bm9kZS5jaGlsZHJlbi5sZW5ndGgpIHtcbiAgICBmb3IgKGxldCBjaGlsZCBvZiB2bm9kZS5jaGlsZHJlbikge1xuICAgICAgeWllbGQgKiB0cmF2ZXJzZShjaGlsZCk7XG4gICAgfVxuICB9XG59OyIsImltcG9ydCB7Y29tcG9zZSwgY3Vycnl9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge1xuICBpc1NoYWxsb3dFcXVhbCxcbiAgcGFpcmlmeSxcbiAgbmV4dFRpY2ssXG4gIG5vb3Bcbn0gZnJvbSAnLi91dGlsJztcbmltcG9ydCB7XG4gIHJlbW92ZUF0dHJpYnV0ZXMsXG4gIHNldEF0dHJpYnV0ZXMsXG4gIHNldFRleHROb2RlLFxuICBjcmVhdGVEb21Ob2RlLFxuICByZW1vdmVFdmVudExpc3RlbmVycyxcbiAgYWRkRXZlbnRMaXN0ZW5lcnMsXG4gIGdldEV2ZW50TGlzdGVuZXJzLFxufSBmcm9tICcuL2RvbVV0aWwnO1xuaW1wb3J0IHt0cmF2ZXJzZX0gZnJvbSAnLi90cmF2ZXJzZSc7XG5cbmNvbnN0IHVwZGF0ZUV2ZW50TGlzdGVuZXJzID0gKHtwcm9wczpuZXdOb2RlUHJvcHN9PXt9LCB7cHJvcHM6b2xkTm9kZVByb3BzfT17fSkgPT4ge1xuICBjb25zdCBuZXdOb2RlRXZlbnRzID0gZ2V0RXZlbnRMaXN0ZW5lcnMobmV3Tm9kZVByb3BzIHx8IHt9KTtcbiAgY29uc3Qgb2xkTm9kZUV2ZW50cyA9IGdldEV2ZW50TGlzdGVuZXJzKG9sZE5vZGVQcm9wcyB8fCB7fSk7XG5cbiAgcmV0dXJuIG5ld05vZGVFdmVudHMubGVuZ3RoIHx8IG9sZE5vZGVFdmVudHMubGVuZ3RoID9cbiAgICBjb21wb3NlKFxuICAgICAgcmVtb3ZlRXZlbnRMaXN0ZW5lcnMob2xkTm9kZUV2ZW50cyksXG4gICAgICBhZGRFdmVudExpc3RlbmVycyhuZXdOb2RlRXZlbnRzKVxuICAgICkgOiBub29wO1xufTtcblxuY29uc3QgdXBkYXRlQXR0cmlidXRlcyA9IChuZXdWTm9kZSwgb2xkVk5vZGUpID0+IHtcbiAgY29uc3QgbmV3Vk5vZGVQcm9wcyA9IG5ld1ZOb2RlLnByb3BzIHx8IHt9O1xuICBjb25zdCBvbGRWTm9kZVByb3BzID0gb2xkVk5vZGUucHJvcHMgfHwge307XG5cbiAgaWYgKGlzU2hhbGxvd0VxdWFsKG5ld1ZOb2RlUHJvcHMsIG9sZFZOb2RlUHJvcHMpKSB7XG4gICAgcmV0dXJuIG5vb3A7XG4gIH1cblxuICBpZiAobmV3Vk5vZGUubm9kZVR5cGUgPT09ICdUZXh0Jykge1xuICAgIHJldHVybiBzZXRUZXh0Tm9kZShuZXdWTm9kZS5wcm9wcy52YWx1ZSk7XG4gIH1cblxuICBjb25zdCBuZXdOb2RlS2V5cyA9IE9iamVjdC5rZXlzKG5ld1ZOb2RlUHJvcHMpO1xuICBjb25zdCBvbGROb2RlS2V5cyA9IE9iamVjdC5rZXlzKG9sZFZOb2RlUHJvcHMpO1xuICBjb25zdCBhdHRyaWJ1dGVzVG9SZW1vdmUgPSBvbGROb2RlS2V5cy5maWx0ZXIoayA9PiAhbmV3Tm9kZUtleXMuaW5jbHVkZXMoaykpO1xuXG4gIHJldHVybiBjb21wb3NlKFxuICAgIHJlbW92ZUF0dHJpYnV0ZXMoYXR0cmlidXRlc1RvUmVtb3ZlKSxcbiAgICBzZXRBdHRyaWJ1dGVzKG5ld05vZGVLZXlzLm1hcChwYWlyaWZ5KG5ld1ZOb2RlUHJvcHMpKSlcbiAgKTtcbn07XG5cbmNvbnN0IGRvbUZhY3RvcnkgPSBjcmVhdGVEb21Ob2RlO1xuXG4vLyBhcHBseSB2bm9kZSBkaWZmaW5nIHRvIGFjdHVhbCBkb20gbm9kZSAoaWYgbmV3IG5vZGUgPT4gaXQgd2lsbCBiZSBtb3VudGVkIGludG8gdGhlIHBhcmVudClcbmNvbnN0IGRvbWlmeSA9IChvbGRWbm9kZSwgbmV3Vm5vZGUsIHBhcmVudERvbU5vZGUpID0+IHtcbiAgaWYgKCFvbGRWbm9kZSkgey8vdGhlcmUgaXMgbm8gcHJldmlvdXMgdm5vZGVcbiAgICBpZiAobmV3Vm5vZGUpIHsvL25ldyBub2RlID0+IHdlIGluc2VydFxuICAgICAgbmV3Vm5vZGUuZG9tID0gcGFyZW50RG9tTm9kZS5hcHBlbmRDaGlsZChkb21GYWN0b3J5KG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKSk7XG4gICAgICBuZXdWbm9kZS5saWZlQ3ljbGUgPSAxO1xuICAgICAgcmV0dXJuIHt2bm9kZTogbmV3Vm5vZGUsIGdhcmJhZ2U6IG51bGx9O1xuICAgIH0gZWxzZSB7Ly9lbHNlIChpcnJlbGV2YW50KVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvcGVyYXRpb24nKVxuICAgIH1cbiAgfSBlbHNlIHsvL3RoZXJlIGlzIGEgcHJldmlvdXMgdm5vZGVcbiAgICBpZiAoIW5ld1Zub2RlKSB7Ly93ZSBtdXN0IHJlbW92ZSB0aGUgcmVsYXRlZCBkb20gbm9kZVxuICAgICAgcGFyZW50RG9tTm9kZS5yZW1vdmVDaGlsZChvbGRWbm9kZS5kb20pO1xuICAgICAgcmV0dXJuICh7Z2FyYmFnZTogb2xkVm5vZGUsIGRvbTogbnVsbH0pO1xuICAgIH0gZWxzZSBpZiAobmV3Vm5vZGUubm9kZVR5cGUgIT09IG9sZFZub2RlLm5vZGVUeXBlKSB7Ly9pdCBtdXN0IGJlIHJlcGxhY2VkXG4gICAgICBuZXdWbm9kZS5kb20gPSBkb21GYWN0b3J5KG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKTtcbiAgICAgIG5ld1Zub2RlLmxpZmVDeWNsZSA9IDE7XG4gICAgICBwYXJlbnREb21Ob2RlLnJlcGxhY2VDaGlsZChuZXdWbm9kZS5kb20sIG9sZFZub2RlLmRvbSk7XG4gICAgICByZXR1cm4ge2dhcmJhZ2U6IG9sZFZub2RlLCB2bm9kZTogbmV3Vm5vZGV9O1xuICAgIH0gZWxzZSB7Ly8gb25seSB1cGRhdGUgYXR0cmlidXRlc1xuICAgICAgbmV3Vm5vZGUuZG9tID0gb2xkVm5vZGUuZG9tO1xuICAgICAgLy8gcGFzcyB0aGUgdW5Nb3VudEhvb2tcbiAgICAgIGlmKG9sZFZub2RlLm9uVW5Nb3VudCl7XG4gICAgICAgIG5ld1Zub2RlLm9uVW5Nb3VudCA9IG9sZFZub2RlLm9uVW5Nb3VudDtcbiAgICAgIH1cbiAgICAgIG5ld1Zub2RlLmxpZmVDeWNsZSA9IG9sZFZub2RlLmxpZmVDeWNsZSArIDE7XG4gICAgICByZXR1cm4ge2dhcmJhZ2U6IG51bGwsIHZub2RlOiBuZXdWbm9kZX07XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIHJlbmRlciBhIHZpcnR1YWwgZG9tIG5vZGUsIGRpZmZpbmcgaXQgd2l0aCBpdHMgcHJldmlvdXMgdmVyc2lvbiwgbW91bnRpbmcgaXQgaW4gYSBwYXJlbnQgZG9tIG5vZGVcbiAqIEBwYXJhbSBvbGRWbm9kZVxuICogQHBhcmFtIG5ld1Zub2RlXG4gKiBAcGFyYW0gcGFyZW50RG9tTm9kZVxuICogQHBhcmFtIG9uTmV4dFRpY2sgY29sbGVjdCBvcGVyYXRpb25zIHRvIGJlIHByb2Nlc3NlZCBvbiBuZXh0IHRpY2tcbiAqIEByZXR1cm5zIHtBcnJheX1cbiAqL1xuZXhwb3J0IGNvbnN0IHJlbmRlciA9IChvbGRWbm9kZSwgbmV3Vm5vZGUsIHBhcmVudERvbU5vZGUsIG9uTmV4dFRpY2sgPSBbXSkgPT4ge1xuXG4gIC8vMS4gdHJhbnNmb3JtIHRoZSBuZXcgdm5vZGUgdG8gYSB2bm9kZSBjb25uZWN0ZWQgdG8gYW4gYWN0dWFsIGRvbSBlbGVtZW50IGJhc2VkIG9uIHZub2RlIHZlcnNpb25zIGRpZmZpbmdcbiAgLy8gaS4gbm90ZSBhdCB0aGlzIHN0ZXAgb2NjdXIgZG9tIGluc2VydGlvbnMvcmVtb3ZhbHNcbiAgLy8gaWkuIGl0IG1heSBjb2xsZWN0IHN1YiB0cmVlIHRvIGJlIGRyb3BwZWQgKG9yIFwidW5tb3VudGVkXCIpXG4gIGNvbnN0IHt2bm9kZSwgZ2FyYmFnZX0gPSBkb21pZnkob2xkVm5vZGUsIG5ld1Zub2RlLCBwYXJlbnREb21Ob2RlKTtcblxuICBpZiAoZ2FyYmFnZSAhPT0gbnVsbCkge1xuICAgIC8vIGRlZmVyIHVubW91bnQgbGlmZWN5Y2xlIGFzIGl0IGlzIG5vdCBcInZpc3VhbFwiXG4gICAgZm9yIChsZXQgZyBvZiB0cmF2ZXJzZShnYXJiYWdlKSkge1xuICAgICAgaWYgKGcub25Vbk1vdW50KSB7XG4gICAgICAgIG9uTmV4dFRpY2sucHVzaChnLm9uVW5Nb3VudCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy9Ob3JtYWxpc2F0aW9uIG9mIG9sZCBub2RlIChpbiBjYXNlIG9mIGEgcmVwbGFjZSB3ZSB3aWxsIGNvbnNpZGVyIG9sZCBub2RlIGFzIGVtcHR5IG5vZGUgKG5vIGNoaWxkcmVuLCBubyBwcm9wcykpXG4gIGNvbnN0IHRlbXBPbGROb2RlID0gZ2FyYmFnZSAhPT0gbnVsbCB8fCAhb2xkVm5vZGUgPyB7bGVuZ3RoOiAwLCBjaGlsZHJlbjogW10sIHByb3BzOiB7fX0gOiBvbGRWbm9kZTtcblxuICBpZiAodm5vZGUpIHtcblxuICAgIC8vMi4gdXBkYXRlIGRvbSBhdHRyaWJ1dGVzIGJhc2VkIG9uIHZub2RlIHByb3AgZGlmZmluZy5cbiAgICAvL3N5bmNcbiAgICBpZiAodm5vZGUub25VcGRhdGUgJiYgdm5vZGUubGlmZUN5Y2xlID4gMSkge1xuICAgICAgdm5vZGUub25VcGRhdGUoKTtcbiAgICB9XG5cbiAgICB1cGRhdGVBdHRyaWJ1dGVzKHZub2RlLCB0ZW1wT2xkTm9kZSkodm5vZGUuZG9tKTtcblxuICAgIC8vZmFzdCBwYXRoXG4gICAgaWYgKHZub2RlLm5vZGVUeXBlID09PSAnVGV4dCcpIHtcbiAgICAgIHJldHVybiBvbk5leHRUaWNrO1xuICAgIH1cblxuICAgIGlmICh2bm9kZS5vbk1vdW50ICYmIHZub2RlLmxpZmVDeWNsZSA9PT0gMSkge1xuICAgICAgb25OZXh0VGljay5wdXNoKCgpID0+IHZub2RlLm9uTW91bnQoKSk7XG4gICAgfVxuXG4gICAgY29uc3QgY2hpbGRyZW5Db3VudCA9IE1hdGgubWF4KHRlbXBPbGROb2RlLmNoaWxkcmVuLmxlbmd0aCwgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoKTtcblxuICAgIC8vYXN5bmMgd2lsbCBiZSBkZWZlcnJlZCBhcyBpdCBpcyBub3QgXCJ2aXN1YWxcIlxuICAgIGNvbnN0IHNldExpc3RlbmVycyA9IHVwZGF0ZUV2ZW50TGlzdGVuZXJzKHZub2RlLCB0ZW1wT2xkTm9kZSk7XG4gICAgaWYgKHNldExpc3RlbmVycyAhPT0gbm9vcCkge1xuICAgICAgb25OZXh0VGljay5wdXNoKCgpID0+IHNldExpc3RlbmVycyh2bm9kZS5kb20pKTtcbiAgICB9XG5cbiAgICAvLzMgcmVjdXJzaXZlbHkgdHJhdmVyc2UgY2hpbGRyZW4gdG8gdXBkYXRlIGRvbSBhbmQgY29sbGVjdCBmdW5jdGlvbnMgdG8gcHJvY2VzcyBvbiBuZXh0IHRpY2tcbiAgICBpZiAoY2hpbGRyZW5Db3VudCA+IDApIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW5Db3VudDsgaSsrKSB7XG4gICAgICAgIC8vIHdlIHBhc3Mgb25OZXh0VGljayBhcyByZWZlcmVuY2UgKGltcHJvdmUgcGVyZjogbWVtb3J5ICsgc3BlZWQpXG4gICAgICAgIHJlbmRlcih0ZW1wT2xkTm9kZS5jaGlsZHJlbltpXSwgdm5vZGUuY2hpbGRyZW5baV0sIHZub2RlLmRvbSwgb25OZXh0VGljayk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9uTmV4dFRpY2s7XG59O1xuXG5leHBvcnQgY29uc3QgaHlkcmF0ZSA9ICh2bm9kZSwgZG9tKSA9PiB7XG4gICd1c2Ugc3RyaWN0JztcbiAgY29uc3QgaHlkcmF0ZWQgPSBPYmplY3QuYXNzaWduKHt9LCB2bm9kZSk7XG4gIGNvbnN0IGRvbUNoaWxkcmVuID0gQXJyYXkuZnJvbShkb20uY2hpbGROb2RlcykuZmlsdGVyKG4gPT4gbi5ub2RlVHlwZSAhPT0gMyB8fCBuLm5vZGVWYWx1ZS50cmltKCkgIT09ICcnKTtcbiAgaHlkcmF0ZWQuZG9tID0gZG9tO1xuICBoeWRyYXRlZC5jaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQsIGkpID0+IGh5ZHJhdGUoY2hpbGQsIGRvbUNoaWxkcmVuW2ldKSk7XG4gIHJldHVybiBoeWRyYXRlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBtb3VudCA9IGN1cnJ5KChjb21wLCBpbml0UHJvcCwgcm9vdCkgPT4ge1xuICBjb25zdCB2bm9kZSA9IGNvbXAubm9kZVR5cGUgIT09IHZvaWQgMCA/IGNvbXAgOiBjb21wKGluaXRQcm9wIHx8IHt9KTtcbiAgY29uc3Qgb2xkVk5vZGUgPSByb290LmNoaWxkcmVuLmxlbmd0aCA/IGh5ZHJhdGUodm5vZGUsIHJvb3QuY2hpbGRyZW5bMF0pIDogbnVsbDtcbiAgY29uc3QgYmF0Y2ggPSByZW5kZXIob2xkVk5vZGUsIHZub2RlLCByb290KTtcbiAgbmV4dFRpY2soKCkgPT4ge1xuICAgIGZvciAobGV0IG9wIG9mIGJhdGNoKSB7XG4gICAgICBvcCgpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiB2bm9kZTtcbn0pOyIsImltcG9ydCB7cmVuZGVyfSBmcm9tICcuL3RyZWUnO1xuaW1wb3J0IHtuZXh0VGlja30gZnJvbSAnLi91dGlsJztcblxuLyoqXG4gKiBDcmVhdGUgYSBmdW5jdGlvbiB3aGljaCB3aWxsIHRyaWdnZXIgYW4gdXBkYXRlIG9mIHRoZSBjb21wb25lbnQgd2l0aCB0aGUgcGFzc2VkIHN0YXRlXG4gKiBAcGFyYW0gY29tcCB7RnVuY3Rpb259IC0gdGhlIGNvbXBvbmVudCB0byB1cGRhdGVcbiAqIEBwYXJhbSBpbml0aWFsVk5vZGUgLSB0aGUgaW5pdGlhbCB2aXJ0dWFsIGRvbSBub2RlIHJlbGF0ZWQgdG8gdGhlIGNvbXBvbmVudCAoaWUgb25jZSBpdCBoYXMgYmVlbiBtb3VudGVkKVxuICogQHJldHVybnMge0Z1bmN0aW9ufSAtIHRoZSB1cGRhdGUgZnVuY3Rpb25cbiAqL1xuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gdXBkYXRlIChjb21wLCBpbml0aWFsVk5vZGUpIHtcbiAgbGV0IG9sZE5vZGUgPSBpbml0aWFsVk5vZGU7XG4gIGNvbnN0IHVwZGF0ZUZ1bmMgPSAocHJvcHMsIC4uLmFyZ3MpID0+IHtcbiAgICBjb25zdCBtb3VudCA9IG9sZE5vZGUuZG9tLnBhcmVudE5vZGU7XG4gICAgY29uc3QgbmV3Tm9kZSA9IGNvbXAoT2JqZWN0LmFzc2lnbih7Y2hpbGRyZW46IG9sZE5vZGUuY2hpbGRyZW4gfHwgW119LCBvbGROb2RlLnByb3BzLCBwcm9wcyksIC4uLmFyZ3MpO1xuICAgIGNvbnN0IG5leHRCYXRjaCA9IHJlbmRlcihvbGROb2RlLCBuZXdOb2RlLCBtb3VudCk7XG5cbiAgICAvLyBkYW5nZXIgem9uZSAhISEhXG4gICAgLy8gY2hhbmdlIGJ5IGtlZXBpbmcgdGhlIHNhbWUgcmVmZXJlbmNlIHNvIHRoZSBldmVudHVhbCBwYXJlbnQgbm9kZSBkb2VzIG5vdCBuZWVkIHRvIGJlIFwiYXdhcmVcIiB0cmVlIG1heSBoYXZlIGNoYW5nZWQgZG93bnN0cmVhbTogb2xkTm9kZSBtYXkgYmUgdGhlIGNoaWxkIG9mIHNvbWVvbmUgLi4uKHdlbGwgdGhhdCBpcyBhIHRyZWUgZGF0YSBzdHJ1Y3R1cmUgYWZ0ZXIgYWxsIDpQIClcbiAgICBvbGROb2RlID0gT2JqZWN0LmFzc2lnbihvbGROb2RlIHx8IHt9LCBuZXdOb2RlKTtcbiAgICAvLyBlbmQgZGFuZ2VyIHpvbmVcblxuICAgIG5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIGZvciAobGV0IG9wIG9mIG5leHRCYXRjaCkge1xuICAgICAgICBvcCgpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBuZXdOb2RlO1xuICB9O1xuICByZXR1cm4gdXBkYXRlRnVuYztcbn0iLCJpbXBvcnQge2N1cnJ5fSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuXG5jb25zdCBsaWZlQ3ljbGVGYWN0b3J5ID0gbWV0aG9kID0+IGN1cnJ5KChmbiwgY29tcCkgPT4gKHByb3BzLCAuLi5hcmdzKSA9PiB7XG4gIGNvbnN0IG4gPSBjb21wKHByb3BzLCAuLi5hcmdzKTtcbiAgblttZXRob2RdID0gKCkgPT4gZm4obiwgLi4uYXJncyk7XG4gIHJldHVybiBuO1xufSk7XG5cbi8qKlxuICogbGlmZSBjeWNsZTogd2hlbiB0aGUgY29tcG9uZW50IGlzIG1vdW50ZWRcbiAqL1xuZXhwb3J0IGNvbnN0IG9uTW91bnQgPSBsaWZlQ3ljbGVGYWN0b3J5KCdvbk1vdW50Jyk7XG5cbi8qKlxuICogbGlmZSBjeWNsZTogd2hlbiB0aGUgY29tcG9uZW50IGlzIHVubW91bnRlZFxuICovXG5leHBvcnQgY29uc3Qgb25Vbk1vdW50ID0gbGlmZUN5Y2xlRmFjdG9yeSgnb25Vbk1vdW50Jyk7XG5cbi8qKlxuICogbGlmZSBjeWNsZTogYmVmb3JlIHRoZSBjb21wb25lbnQgaXMgdXBkYXRlZFxuICovXG5leHBvcnQgY29uc3Qgb25VcGRhdGUgPSBsaWZlQ3ljbGVGYWN0b3J5KCdvblVwZGF0ZScpOyIsImltcG9ydCB1cGRhdGUgZnJvbSAnLi91cGRhdGUnO1xuaW1wb3J0IHtvbk1vdW50LCBvblVwZGF0ZX0gZnJvbSAnLi9saWZlQ3ljbGVzJztcbmltcG9ydCB7Y29tcG9zZX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcblxuLyoqXG4gKiBDb21iaW5hdG9yIHRvIGNyZWF0ZSBhIFwic3RhdGVmdWwgY29tcG9uZW50XCI6IGllIGl0IHdpbGwgaGF2ZSBpdHMgb3duIHN0YXRlIGFuZCB0aGUgYWJpbGl0eSB0byB1cGRhdGUgaXRzIG93biB0cmVlXG4gKiBAcGFyYW0gY29tcCB7RnVuY3Rpb259IC0gdGhlIGNvbXBvbmVudFxuICogQHJldHVybnMge0Z1bmN0aW9ufSAtIGEgbmV3IHdyYXBwZWQgY29tcG9uZW50XG4gKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChjb21wKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IHVwZGF0ZUZ1bmM7XG4gICAgY29uc3Qgd3JhcHBlckNvbXAgPSAocHJvcHMsIC4uLmFyZ3MpID0+IHtcbiAgICAgIC8vbGF6eSBldmFsdWF0ZSB1cGRhdGVGdW5jICh0byBtYWtlIHN1cmUgaXQgaXMgZGVmaW5lZFxuICAgICAgY29uc3Qgc2V0U3RhdGUgPSAobmV3U3RhdGUpID0+IHVwZGF0ZUZ1bmMobmV3U3RhdGUpO1xuICAgICAgcmV0dXJuIGNvbXAocHJvcHMsIHNldFN0YXRlLCAuLi5hcmdzKTtcbiAgICB9O1xuICAgIGNvbnN0IHNldFVwZGF0ZUZ1bmN0aW9uID0gKHZub2RlKSA9PiB7XG4gICAgICB1cGRhdGVGdW5jID0gdXBkYXRlKHdyYXBwZXJDb21wLCB2bm9kZSk7XG4gICAgfTtcblxuICAgIHJldHVybiBjb21wb3NlKG9uTW91bnQoc2V0VXBkYXRlRnVuY3Rpb24pLCBvblVwZGF0ZShzZXRVcGRhdGVGdW5jdGlvbikpKHdyYXBwZXJDb21wKTtcbiAgfTtcbn07IiwiaW1wb3J0IHVwZGF0ZSBmcm9tICcuL3VwZGF0ZSc7XG5pbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQge29uTW91bnQsIG9uVW5Nb3VudH0gZnJvbSAnLi9saWZlQ3ljbGVzJ1xuaW1wb3J0IHtpc0RlZXBFcXVhbCwgaWRlbnRpdHl9IGZyb20gJy4vdXRpbCc7XG5cbi8qKlxuICogQ29ubmVjdCBjb21iaW5hdG9yOiB3aWxsIGNyZWF0ZSBcImNvbnRhaW5lclwiIGNvbXBvbmVudCB3aGljaCB3aWxsIHN1YnNjcmliZSB0byBhIFJlZHV4IGxpa2Ugc3RvcmUuIGFuZCB1cGRhdGUgaXRzIGNoaWxkcmVuIHdoZW5ldmVyIGEgc3BlY2lmaWMgc2xpY2Ugb2Ygc3RhdGUgY2hhbmdlIHVuZGVyIHNwZWNpZmljIGNpcmN1bXN0YW5jZXNcbiAqIEBwYXJhbSBzdG9yZSB7T2JqZWN0fSAtIFRoZSBzdG9yZSAoaW1wbGVtZW50aW5nIHRoZSBzYW1lIGFwaSB0aGFuIFJlZHV4IHN0b3JlXG4gKiBAcGFyYW0gYWN0aW9ucyB7T2JqZWN0fSBbe31dIC0gVGhlIGxpc3Qgb2YgYWN0aW9ucyB0aGUgY29ubmVjdGVkIGNvbXBvbmVudCB3aWxsIGJlIGFibGUgdG8gdHJpZ2dlclxuICogQHBhcmFtIHNsaWNlU3RhdGUge0Z1bmN0aW9ufSBbc3RhdGUgPT4gc3RhdGVdIC0gQSBmdW5jdGlvbiB3aGljaCB0YWtlcyBhcyBhcmd1bWVudCB0aGUgc3RhdGUgYW5kIHJldHVybiBhIFwidHJhbnNmb3JtZWRcIiBzdGF0ZSAobGlrZSBwYXJ0aWFsLCBldGMpIHJlbGV2YW50IHRvIHRoZSBjb250YWluZXJcbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gLSBBIGNvbnRhaW5lciBmYWN0b3J5IHdpdGggdGhlIGZvbGxvd2luZyBhcmd1bWVudHM6XG4gKiAgLSBjb21wOiB0aGUgY29tcG9uZW50IHRvIHdyYXAgbm90ZSB0aGUgYWN0aW9ucyBvYmplY3Qgd2lsbCBiZSBwYXNzZWQgYXMgc2Vjb25kIGFyZ3VtZW50IG9mIHRoZSBjb21wb25lbnQgZm9yIGNvbnZlbmllbmNlXG4gKiAgLSBtYXBTdGF0ZVRvUHJvcDogYSBmdW5jdGlvbiB3aGljaCB0YWtlcyBhcyBhcmd1bWVudCB3aGF0IHRoZSBcInNsaWNlU3RhdGVcIiBmdW5jdGlvbiByZXR1cm5zIGFuZCByZXR1cm5zIGFuIG9iamVjdCB0byBiZSBibGVuZGVkIGludG8gdGhlIHByb3BlcnRpZXMgb2YgdGhlIGNvbXBvbmVudCAoZGVmYXVsdCB0byBpZGVudGl0eSBmdW5jdGlvbilcbiAqICAtIHNob3VsZFVwZGF0ZTogYSBmdW5jdGlvbiB3aGljaCB0YWtlcyBhcyBhcmd1bWVudHMgdGhlIHByZXZpb3VzIGFuZCB0aGUgY3VycmVudCB2ZXJzaW9ucyBvZiB3aGF0IFwic2xpY2VTdGF0ZVwiIGZ1bmN0aW9uIHJldHVybnMgdG8gcmV0dXJucyBhIGJvb2xlYW4gZGVmaW5pbmcgd2hldGhlciB0aGUgY29tcG9uZW50IHNob3VsZCBiZSB1cGRhdGVkIChkZWZhdWx0IHRvIGEgZGVlcEVxdWFsIGNoZWNrKVxuICovXG5leHBvcnQgZGVmYXVsdCAgKHN0b3JlLCBhY3Rpb25zID0ge30sIHNsaWNlU3RhdGUgPSBpZGVudGl0eSkgPT5cbiAgKGNvbXAsIG1hcFN0YXRlVG9Qcm9wID0gaWRlbnRpdHksIHNob3VsZFVwYXRlID0gKGEsIGIpID0+IGlzRGVlcEVxdWFsKGEsIGIpID09PSBmYWxzZSkgPT5cbiAgICAoaW5pdFByb3ApID0+IHtcbiAgICAgIGxldCBjb21wb25lbnRQcm9wcyA9IGluaXRQcm9wO1xuICAgICAgbGV0IHVwZGF0ZUZ1bmMsIHByZXZpb3VzU3RhdGVTbGljZSwgdW5zdWJzY3JpYmVyO1xuXG4gICAgICBjb25zdCB3cmFwcGVyQ29tcCA9IChwcm9wcywgLi4uYXJncykgPT4ge1xuICAgICAgICByZXR1cm4gY29tcChPYmplY3QuYXNzaWduKHByb3BzLCBtYXBTdGF0ZVRvUHJvcChzbGljZVN0YXRlKHN0b3JlLmdldFN0YXRlKCkpKSksIGFjdGlvbnMsIC4uLmFyZ3MpO1xuICAgICAgfTtcblxuICAgICAgY29uc3Qgc3Vic2NyaWJlID0gb25Nb3VudCgodm5vZGUpID0+IHtcbiAgICAgICAgdXBkYXRlRnVuYyA9IHVwZGF0ZSh3cmFwcGVyQ29tcCwgdm5vZGUpO1xuICAgICAgICB1bnN1YnNjcmliZXIgPSBzdG9yZS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0YXRlU2xpY2UgPSBzbGljZVN0YXRlKHN0b3JlLmdldFN0YXRlKCkpO1xuICAgICAgICAgIGlmIChzaG91bGRVcGF0ZShwcmV2aW91c1N0YXRlU2xpY2UsIHN0YXRlU2xpY2UpID09PSB0cnVlKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbXBvbmVudFByb3BzLCBtYXBTdGF0ZVRvUHJvcChzdGF0ZVNsaWNlKSk7XG4gICAgICAgICAgICB1cGRhdGVGdW5jKGNvbXBvbmVudFByb3BzKTtcbiAgICAgICAgICAgIHByZXZpb3VzU3RhdGVTbGljZSA9IHN0YXRlU2xpY2U7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB1bnN1YnNjcmliZSA9IG9uVW5Nb3VudCgoKSA9PiB7XG4gICAgICAgIHVuc3Vic2NyaWJlcigpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBjb21wb3NlKHN1YnNjcmliZSwgdW5zdWJzY3JpYmUpKHdyYXBwZXJDb21wKTtcbiAgICB9IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5cbmV4cG9ydCBkZWZhdWx0IChwcm9wcykgPT4ge1xuICAvL3RvZG8gZGVzdHJ1Y3Qgd2l0aCByZXN0IHsuLi5vdGhlclByb3BzfSBpbnN0ZWFkIG9mIGRlbGV0aW5nIHN0dWZmc1xuICBjb25zdCB7ZHggPSAxLCBkeSA9IDEsIHgsIHksIHBhbmVsQ2xhc3NlcywgY2hpbGRyZW4sIHN0eWxlID0gJyd9ID0gcHJvcHM7XG4gIGRlbGV0ZSBwcm9wcy5jaGlsZHJlbjtcbiAgZGVsZXRlIHByb3BzLnBhbmVsQ2xhc3NlcztcbiAgZGVsZXRlIHByb3BzLmR4O1xuICBkZWxldGUgcHJvcHMuZHk7XG4gIGRlbGV0ZSBwcm9wcy54O1xuICBkZWxldGUgcHJvcHMueTtcbiAgZGVsZXRlIHByb3BzLnN0eWxlO1xuXG4gIGNvbnN0IHBvc2l0aW9uU3R5bGUgPSBgXG4gICAgLS1ncmlkLWNvbHVtbi1vZmZzZXQ6ICR7eH07XG4gICAgLS1ncmlkLXJvdy1vZmZzZXQ6ICR7eX07XG4gICAgLS1ncmlkLXJvdy1zcGFuOiAke2R5fTtcbiAgICAtLWdyaWQtY29sdW1uLXNwYW46ICR7ZHh9O1xuICAgICR7c3R5bGV9XG5gO1xuXG4gIGNvbnN0IGNsYXNzZXMgPSBbJ3BhbmVsJ10uY29uY2F0KHBhbmVsQ2xhc3Nlcykuam9pbignICcpO1xuXG4gIHJldHVybiAoPGRpdiB7Li4ucHJvcHN9IHN0eWxlPXtwb3NpdGlvblN0eWxlfSBjbGFzcz17Y2xhc3Nlc30+XG4gICAge2NoaWxkcmVufVxuICA8L2Rpdj4pO1xufSIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nXG5pbXBvcnQgUGFuZWwgZnJvbSAnLi4vdmlld3MvUGFuZWwnO1xuXG5leHBvcnQgZGVmYXVsdCAoe3gsIHksIGFkb3JuZXJTdGF0dXN9KSA9PiB7XG4gIGNvbnN0IGV4dHJhQ2xhc3NlcyA9IFtdO1xuICBpZiAoYWRvcm5lclN0YXR1cyA9PT0gMSkge1xuICAgIGV4dHJhQ2xhc3Nlcy5wdXNoKCd2YWxpZC1wYW5lbCcpO1xuICB9IGVsc2UgaWYgKGFkb3JuZXJTdGF0dXMgPT09IC0xKSB7XG4gICAgZXh0cmFDbGFzc2VzLnB1c2goJ2ludmFsaWQtcGFuZWwnKTtcbiAgfVxuXG4gIHJldHVybiA8UGFuZWwgcGFuZWxDbGFzc2VzPXtleHRyYUNsYXNzZXN9IHg9e3h9IHk9e3l9IGR4PXsxfSBkeT17MX0+PC9QYW5lbD47XG59OyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nXG5pbXBvcnQgQWRvcm5lclBhbmVsIGZyb20gJy4uL3ZpZXdzL0Fkb3JuZXJQYW5lbCc7XG5cbmV4cG9ydCBkZWZhdWx0IChwcm9wcywge2dyaWR9KSA9PiB7XG4gIGNvbnN0IHt4LCB5fSA9IHByb3BzO1xuICBjb25zdCB7YWRvcm5lclN0YXR1cyA9IDB9ID0gZ3JpZC5nZXREYXRhKHgsIHkpO1xuICByZXR1cm4gPEFkb3JuZXJQYW5lbCB4PXt4fSB5PXt5fSBhZG9ybmVyU3RhdHVzPXthZG9ybmVyU3RhdHVzfS8+XG59IiwiZXhwb3J0IGNvbnN0IFJPV1MgPSA0O1xuZXhwb3J0IGNvbnN0IENPTFVNTlMgPSA0OyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IFBhbmVsIGZyb20gJy4vUGFuZWwnO1xuaW1wb3J0IHtST1dTLCBDT0xVTU5TfSBmcm9tICcuLi9saWIvY29uc3RhbnRzJ1xuXG5jb25zdCBmbGV4aWJsZSA9IENvbXAgPT4gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHt4LCB5LCBkeCwgZHksIGFkb3JuZXJTdGF0dXMsIG9uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0fSA9IHByb3BzO1xuICBjb25zdCB6SW5kZXggPSAoUk9XUyAtIHkpICogMTAgKyBDT0xVTU5TIC0geDtcbiAgY29uc3QgcGFuZWxDbGFzc2VzID0gWydkYXRhLXBhbmVsJ107XG5cbiAgaWYgKGFkb3JuZXJTdGF0dXMgIT09IDApIHtcbiAgICBwYW5lbENsYXNzZXMucHVzaCgnYWN0aXZlLXBhbmVsJyk7XG4gIH1cblxuICByZXR1cm4gPFBhbmVsIHg9e3h9IHk9e3l9IGR4PXtkeH0gZHk9e2R5fSBzdHlsZT17YHotaW5kZXg6JHt6SW5kZXh9O2B9IHBhbmVsQ2xhc3Nlcz17cGFuZWxDbGFzc2VzfT5cbiAgICA8ZGl2IGNsYXNzPVwibW92ZS1oYW5kbGVcIiBkcmFnZ2FibGU9XCJ0cnVlXCIgb25EcmFnU3RhcnQ9e29uTW92ZVN0YXJ0fT48L2Rpdj5cbiAgICA8Q29tcCB7Li4ucHJvcHN9IC8+XG4gICAgPGRpdiBjbGFzcz1cInJlc2l6ZS1oYW5kbGVcIiBkcmFnZ2FibGU9XCJ0cnVlXCIgb25EcmFnU3RhcnQ9e29uUmVzaXplU3RhcnR9PjwvZGl2PlxuICA8L1BhbmVsPlxufTtcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGU7IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgZmxleGlibGUgZnJvbSAnLi9GbGV4aWJsZURhdGFQYW5lbCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZsZXhpYmxlKHByb3BzID0+IDxidXR0b24gb25DbGljaz17cHJvcHMub25DbGlja30+KzwvYnV0dG9uPik7IiwiZXhwb3J0IGRlZmF1bHQgKENvbXApID0+IChwcm9wcywgc2VydmljZXMpID0+IHtcbiAgY29uc3Qge3gsIHl9ID0gcHJvcHM7XG4gIGNvbnN0IHthY3Rpb25zfSA9IHNlcnZpY2VzO1xuXG4gIGNvbnN0IG9uUmVzaXplU3RhcnQgPSBldiA9PiB7XG4gICAgZXYuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnY29weSc7XG4gICAgZXYuZGF0YVRyYW5zZmVyLnNldERhdGEoJ3RleHQvcGxhaW4nLCBKU09OLnN0cmluZ2lmeSh7eCwgeSwgb3BlcmF0aW9uOiAncmVzaXplJ30pKTtcbiAgICBhY3Rpb25zLnN0YXJ0UmVzaXplKHt4LCB5fSk7XG4gIH07XG5cbiAgY29uc3Qgb25Nb3ZlU3RhcnQgPSBldiA9PiB7XG4gICAgZXYuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbW92ZSc7XG4gICAgZXYuZGF0YVRyYW5zZmVyLnNldERhdGEoJ3RleHQvcGxhaW4nLCBKU09OLnN0cmluZ2lmeSh7eCwgeSwgb3BlcmF0aW9uOiAnbW92ZSd9KSk7XG4gICAgYWN0aW9ucy5zdGFydE1vdmUoe3gsIHl9KTtcbiAgfTtcblxuICByZXR1cm4gQ29tcChPYmplY3QuYXNzaWduKHByb3BzLCB7b25SZXNpemVTdGFydCwgb25Nb3ZlU3RhcnR9KSwgc2VydmljZXMpO1xufTtcblxuIiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgRW1wdHlEYXRhUGFuZWwgZnJvbSAnLi4vdmlld3MvRW1wdHlEYXRhUGFuZWwnO1xuaW1wb3J0IGZsZXhpYmxlIGZyb20gJy4vRmxleGlibGVEYXRhUGFuZWwnO1xuXG5leHBvcnQgZGVmYXVsdCBmbGV4aWJsZSgocHJvcHMsIHtncmlkLCBhY3Rpb25zfSkgPT4ge1xuICBjb25zdCB7eCwgeSwgb25SZXNpemVTdGFydCwgb25Nb3ZlU3RhcnR9ID0gcHJvcHM7XG4gIGNvbnN0IHBhbmVsRGF0YSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcblxuICBjb25zdCBvbkNsaWNrID0gXyA9PiB7XG4gICAgYWN0aW9ucy5vcGVuTW9kYWwoe3gsIHksIHRpdGxlOiAnQ3JlYXRlIG5ldyBkYXRhIHBhbmVsJywgbW9kYWxUeXBlOiAnY3JlYXRlUGFuZWxEYXRhJ30pO1xuICB9O1xuXG4gIHJldHVybiA8RW1wdHlEYXRhUGFuZWwgey4uLnBhbmVsRGF0YX0gb25Nb3ZlU3RhcnQ9e29uTW92ZVN0YXJ0fSBvbkNsaWNrPXtvbkNsaWNrfSBvblJlc2l6ZVN0YXJ0PXtvblJlc2l6ZVN0YXJ0fS8+O1xufSk7IiwiaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgZmxleGlibGUgZnJvbSAnLi9GbGV4aWJsZURhdGFQYW5lbCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZsZXhpYmxlKHByb3BzID0+IHtcbiAgY29uc3Qge2RhdGEgPSB7fSwgb25SZXNldCwgb25FZGl0fSA9IHByb3BzO1xuICBjb25zdCB7cHJvY2Vzc2luZyA9IGZhbHNlfSA9IGRhdGE7XG4gIHJldHVybiAoPGRpdiBjbGFzcz1cInBhbmVsLWNvbnRlbnRcIj5cbiAgICA8aGVhZGVyIGNsYXNzPVwicGFuZWwtaGVhZGVyXCI+XG4gICAgICA8aDI+e2RhdGEudGl0bGV9PC9oMj5cbiAgICAgIDxidXR0b24gb25DbGljaz17b25SZXNldH0+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gb25DbGljaz17b25FZGl0fT5FZGl0PC9idXR0b24+XG4gICAgPC9oZWFkZXI+XG4gICAgPGRpdiBjbGFzcz1cInBhbmVsLWJvZHlcIj5cbiAgICAgIDxkaXYgYXJpYS1oaWRkZW49e1N0cmluZyghcHJvY2Vzc2luZyl9IGNsYXNzPVwicHJvY2Vzc2luZy1vdmVybGF5XCI+XG4gICAgICAgIFByb2Nlc3NpbmcgLi4uXG4gICAgICA8L2Rpdj5cbiAgICAgIHtwcm9wcy5jaGlsZHJlbn1cbiAgICA8L2Rpdj5cbiAgPC9kaXY+KTtcbn0pOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuXG5leHBvcnQgY29uc3QgSXNzdWVDYXJkID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtpc3N1ZSA9IHt9fSA9IHByb3BzO1xuICBjb25zdCB7c3RhdGUsIGNyZWF0ZWRfYXQsIHVzZXIsIG51bWJlciwgaHRtbF91cmwsIHRpdGxlLCBjb21tZW50c30gPSBpc3N1ZTtcbiAgcmV0dXJuIDxhcnRpY2xlIGNsYXNzPVwiaXNzdWVcIj5cbiAgICA8aDM+e3RpdGxlfTwvaDM+XG4gICAgPGEgcmVsPVwic2VsZlwiIGhyZWY9e2h0bWxfdXJsfT4je251bWJlcn08L2E+XG4gICAgPHNwYW4gY2xhc3M9XCJzdGF0dXNcIj57c3RhdGV9PC9zcGFuPlxuICAgIDxwIGNsYXNzPVwibWV0YVwiPm9wZW5lZCBvblxuICAgICAgPHRpbWU+IHsobmV3IERhdGUoY3JlYXRlZF9hdCkpLnRvRGF0ZVN0cmluZygpfSA8L3RpbWU+XG4gICAgICBieSA8YSByZWw9XCJhdXRob3JcIiBocmVmPXt1c2VyLmh0bWxfdXJsfT57dXNlci5sb2dpbn08L2E+XG4gICAgPC9wPlxuICAgIDxwPlxuICAgICAge2NvbW1lbnRzfSBDXG4gICAgPC9wPlxuICA8L2FydGljbGU+XG59O1xuXG5cbmV4cG9ydCBjb25zdCBJc3N1ZXNMaXN0ID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtpc3N1ZXMgPSBbXX0gPSBwcm9wcztcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzPVwiaXNzdWVzLWxpc3QtY29udGFpbmVyXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwiZmFrZS1ib3JkZXJcIj48L2Rpdj5cbiAgICAgIDx1bCBjbGFzcz1cImlzc3Vlcy1saXN0XCI+XG4gICAgICAgIHtcbiAgICAgICAgICBpc3N1ZXMubWFwKGkgPT4gPGxpPjxJc3N1ZUNhcmQgaXNzdWU9e2l9Lz48L2xpPilcbiAgICAgICAgfVxuICAgICAgPC91bD5cbiAgICAgIDxkaXYgY2xhc3M9XCJmYWtlLWJvcmRlclwiPjwvZGl2PlxuICAgIDwvZGl2Pik7XG59OyIsImltcG9ydCB7SXNzdWVzTGlzdH0gZnJvbSAnLi4vdmlld3MvSXNzdWVzJ1xuaW1wb3J0IHtofSBmcm9tICdmbGFjbyc7XG5cblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtzbWFydExpc3QsIGl0ZW1zID1bXX0gPSBwcm9wcztcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzPVwiaXNzdWVzLWNvbnRhaW5lclwiPlxuICAgICAgey8qPGJ1dHRvbiBvbkNsaWNrPXtldiA9PiB7Ki99XG4gICAgICAgIHsvKnNtYXJ0TGlzdC5zb3J0KHtwb2ludGVyOiAndGl0bGUnLCBkaXJlY3Rpb246IFsnYXNjJywgJ2Rlc2MnXVtNYXRoLnJhbmRvbSgpID4gMC41ID8gMSA6IDBdfSkqL31cbiAgICAgIHsvKn19PmNsaWNrPC9idXR0b24+Ki99XG4gICAgICA8SXNzdWVzTGlzdCBpc3N1ZXM9e2l0ZW1zLm1hcChpID0+IGkudmFsdWUpfS8+XG4gICAgPC9kaXY+KTtcblxufSIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IExpc3REYXRhUGFuZWwgZnJvbSAnLi4vdmlld3MvTGlzdERhdGFQYW5lbCc7XG5pbXBvcnQgZmxleGlibGUgZnJvbSAnLi9GbGV4aWJsZURhdGFQYW5lbCc7XG5pbXBvcnQgU21hcnRJc3N1ZXNMaXN0IGZyb20gJy4vU21hcnRJc3N1ZUxpc3QnO1xuXG4vL3RvZG9cbmNvbnN0IER1bW15TGlzdCA9ICgpID0+IDxkaXY+XG4gIDxwPkVycm9yOiBsaXN0IHR5cGUgbm90IHN1cHBvcnRlZDwvcD5cbjwvZGl2PjtcblxuXG5leHBvcnQgZGVmYXVsdCBmbGV4aWJsZSgoKHByb3BzLCBzZXJ2aWNlcykgPT4ge1xuICBjb25zdCB7Z3JpZCwgc21hcnRMaXN0cywgY29ubmVjdCwgYWN0aW9uc30gPSBzZXJ2aWNlcztcbiAgY29uc3Qge3gsIHksIG9uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0fSA9IHByb3BzO1xuICBjb25zdCBwYW5lbERhdGEgPSBncmlkLmdldERhdGEoeCwgeSk7XG4gIGNvbnN0IHNtYXJ0TGlzdCA9IHNtYXJ0TGlzdHMuZmluZE9yQ3JlYXRlKHgsIHkpO1xuICBjb25zdCBjb25uZWN0RnVuYyA9IGNvbm5lY3Qoc3RhdGUgPT4gc3RhdGUuc21hcnRMaXN0LmZpbmQoc2wgPT4gc2wueCA9PT0geCAmJiBzbC55ID09PSB5KSk7XG5cbiAgY29uc3QgU21hcnRMaXN0Q29tcG9uZW50ID0gY29ubmVjdEZ1bmMoKHByb3BzKSA9PiBnZXRMaXN0Q29tcG9uZW50KHBhbmVsRGF0YS5kYXRhLnNvdXJjZSkocHJvcHMsIHNlcnZpY2VzKSk7XG5cbiAgY29uc3QgY2xpY2tSZXNldCA9IF8gPT4ge1xuICAgIGFjdGlvbnMub3Blbk1vZGFsKHtcbiAgICAgIG1vZGFsVHlwZTogJ2Fza0NvbmZpcm1hdGlvbicsXG4gICAgICBtZXNzYWdlOiBgWW91IGFyZSBhYm91dCB0byBsb3NlIHRoZSBkYXRhIHJlbGF0ZWQgdG8gdGhlIHBhbmVsIFwiJHtwYW5lbERhdGEuZGF0YS50aXRsZX1cIi4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHByb2NlZWQgP2AsXG4gICAgICBleGVjdXRlQWN0aW9uOiAoKSA9PiB7XG4gICAgICAgIGFjdGlvbnMucmVzZXRQYW5lbCh7eCwgeX0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuXG4gIGNvbnN0IGNsaWNrRWRpdCA9IF8gPT4ge1xuICAgIGFjdGlvbnMuZWRpdFBhbmVsKHt4LCB5fSk7XG4gICAgc21hcnRMaXN0LnJlbW92ZSgpO1xuICB9O1xuXG4gIHJldHVybiAoPExpc3REYXRhUGFuZWwgb25FZGl0PXtjbGlja0VkaXR9IG9uUmVzZXQ9e2NsaWNrUmVzZXR9IG9uTW92ZVN0YXJ0PXtvbk1vdmVTdGFydH1cbiAgICAgICAgICAgICAgICAgICAgICAgICBvblJlc2l6ZVN0YXJ0PXtvblJlc2l6ZVN0YXJ0fSB7Li4ucGFuZWxEYXRhfSA+XG4gICAgPFNtYXJ0TGlzdENvbXBvbmVudCBzbWFydExpc3Q9e3NtYXJ0TGlzdH0geD17eH0geT17eX0vPlxuICA8L0xpc3REYXRhUGFuZWw+KTtcbn0pKTtcblxuY29uc3QgZ2V0TGlzdENvbXBvbmVudCA9IChzb3VyY2UpID0+IHtcbiAgc3dpdGNoIChzb3VyY2UpIHtcbiAgICBjYXNlICdpc3N1ZXMnOlxuICAgICAgcmV0dXJuIFNtYXJ0SXNzdWVzTGlzdDtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIER1bW15TGlzdDtcbiAgfVxufTsiLCJpbXBvcnQgZmxleGlibGUgZnJvbSAnLi9GbGV4aWJsZURhdGFQYW5lbCc7XG5pbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUocHJvcHMgPT4ge1xuICByZXR1cm4gPHA+VGhhdCBpcyBhIGNoYXJ0PC9wPjtcbn0pOyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IENoYXJ0RGF0YVBhbmVsIGZyb20gJy4uL3ZpZXdzL0NoYXJ0RGF0YVBhbmVsJztcbmltcG9ydCBmbGV4aWJsZSBmcm9tICcuL0ZsZXhpYmxlRGF0YVBhbmVsJztcblxuZXhwb3J0IGRlZmF1bHQgZmxleGlibGUoKHByb3BzLCB7Z3JpZH0pID0+IHtcbiAgY29uc3Qge3gsIHksIG9uUmVzaXplU3RhcnQsIG9uTW92ZVN0YXJ0fSA9IHByb3BzO1xuICBjb25zdCBwYW5lbERhdGEgPSBncmlkLmdldERhdGEoeCwgeSk7XG4gIHJldHVybiA8Q2hhcnREYXRhUGFuZWwgb25Nb3ZlU3RhcnQ9e29uTW92ZVN0YXJ0fSBvblJlc2l6ZVN0YXJ0PXtvblJlc2l6ZVN0YXJ0fSB7Li4ucGFuZWxEYXRhfS8+XG59KTsiLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcbmltcG9ydCBFbXB0eURhdGFQYW5lbCBmcm9tICcuL0VtcHR5RGF0YVBhbmVsJztcbmltcG9ydCBMaXN0RGF0YVBhbmVsIGZyb20gJy4vTGlzdERhdGFQYW5lbCc7XG5pbXBvcnQgQ2hhcnREYXRhUGFuZWwgZnJvbSAnLi9DaGFydERhdGFQYW5lbCc7XG5cbmNvbnN0IGdldERhdGFQYW5lbCA9ICh0eXBlKSA9PiB7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2NoYXJ0JzpcbiAgICAgIHJldHVybiBDaGFydERhdGFQYW5lbDtcbiAgICBjYXNlICdsaXN0JzpcbiAgICAgIHJldHVybiBMaXN0RGF0YVBhbmVsO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gRW1wdHlEYXRhUGFuZWw7XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IChwcm9wcywgc2VydmljZXMpID0+IHtcbiAgY29uc3Qge3gsIHl9ID0gcHJvcHM7XG4gIGNvbnN0IHtncmlkfSA9IHNlcnZpY2VzO1xuICBjb25zdCBwYW5lbERhdGEgPSBncmlkLmdldERhdGEoeCwgeSk7XG4gIGNvbnN0IHtkYXRhID0ge319PXBhbmVsRGF0YTtcbiAgY29uc3QgUGFuZWwgPSBnZXREYXRhUGFuZWwoZGF0YS50eXBlKTtcbiAgcmV0dXJuIFBhbmVsKHByb3BzLCBzZXJ2aWNlcyk7XG59OyIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuXG5leHBvcnQgZGVmYXVsdCBwcm9wcyA9PiB7XG4gIGNvbnN0IHtpc09wZW4sIGNsb3NlTW9kYWwsIHRpdGxlfSA9IHByb3BzO1xuICBjb25zdCBvbktleURvd24gPSAoe2NvZGV9KSA9PiB7XG4gICAgaWYoY29kZSA9PT0gJ0VzY2FwZScpe1xuICAgICAgY2xvc2VNb2RhbCgpO1xuICAgIH1cbiAgfTtcblxuICByZXR1cm4gKDxkaXYgYXJpYS1oaWRkZW49e1N0cmluZyghaXNPcGVuKX0gb25LZXlEb3duPXtvbktleURvd259IGNsYXNzPVwibW9kYWxcIj5cbiAgICA8aGVhZGVyPlxuICAgICAgPGgyPnt0aXRsZX08L2gyPlxuICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtjbG9zZU1vZGFsfT5YPC9idXR0b24+XG4gICAgPC9oZWFkZXI+XG4gICAge3Byb3BzLmNoaWxkcmVufVxuICA8L2Rpdj4pXG59OyIsImltcG9ydCB7aCwgb25Nb3VudCwgd2l0aFN0YXRlfSBmcm9tICdmbGFjbyc7XG5pbXBvcnQgTW9kYWwgZnJvbSAnLi9Nb2RhbCc7XG5cbmNvbnN0IGF1dG9mb2N1cyA9IG9uTW91bnQoKHZub2RlKSA9PiB7XG4gIHZub2RlLmRvbS5mb2N1cygpO1xufSk7XG5jb25zdCBBdXRvZm9jdXNJbnB1dCA9IGF1dG9mb2N1cyhwcm9wcyA9PiA8aW5wdXQgey4uLnByb3BzfSAvPik7XG5cbmNvbnN0IFNvdXJjZVR5cGVTZWxlY3QgPSBwcm9wcyA9PiB7XG4gIGNvbnN0IHtvblVwZGF0ZX0gPSBwcm9wcztcbiAgcmV0dXJuIDxsYWJlbD5cbiAgICA8c3Bhbj5Tb3VyY2UgdHlwZTwvc3Bhbj5cbiAgICA8c2VsZWN0IHJlcXVpcmVkPVwidHJ1ZVwiIG9uQ2hhbmdlPXtldiA9PiBvblVwZGF0ZSh7c291cmNlOiBldi50YXJnZXQudmFsdWV9KX0gbmFtZT1cInNvdXJjZVR5cGVcIj5cbiAgICAgIDxvcHRpb24gdmFsdWU9XCJcIj4tPC9vcHRpb24+XG4gICAgICA8b3B0aW9uIHZhbHVlPVwiaXNzdWVzXCI+SXNzdWVzPC9vcHRpb24+XG4gICAgICA8b3B0aW9uIHZhbHVlPVwicHJzXCI+UHVsbCByZXF1ZXN0PC9vcHRpb24+XG4gICAgPC9zZWxlY3Q+XG4gIDwvbGFiZWw+XG59O1xuY29uc3QgTGlzdElucHV0ID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiAoPGRpdj5cbiAgICA8U291cmNlVHlwZVNlbGVjdCB7Li4ucHJvcHN9IC8+XG4gIDwvZGl2Pik7XG59O1xuY29uc3QgQ2hhcnRJbnB1dCA9ICgpID0+IDxwPkNoYXJ0IElucHV0PC9wPjtcbmNvbnN0IEFnZ3JlZ2F0aW9uSW5wdXQgPSAoKSA9PiA8cD5BZ2dyZWdhdGlvbklucHV0PC9wPjtcbmNvbnN0IE5vVHlwZUlucHV0ID0gKCkgPT4gPHA+U2VsZWN0IGEgcGFuZWwgdHlwZSA8L3A+O1xuXG5jb25zdCBnZXRJbnB1dFNlY3Rpb24gPSAoZGF0YSA9IHt9KSA9PiB7XG4gIGNvbnN0IHt0eXBlfSA9IGRhdGE7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2xpc3QnOlxuICAgICAgcmV0dXJuIExpc3RJbnB1dDtcbiAgICBjYXNlICdjaGFydCc6XG4gICAgICByZXR1cm4gQ2hhcnRJbnB1dDtcbiAgICBjYXNlICdhZ2dyZWdhdGlvbic6XG4gICAgICByZXR1cm4gQWdncmVnYXRpb25JbnB1dDtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIE5vVHlwZUlucHV0O1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgVHlwZVNlY3Rpb24gPSAocHJvcHMpID0+IHtcbiAgY29uc3Qge2RhdGEsIG9uVXBkYXRlfSA9IHByb3BzO1xuICBjb25zdCBJbnB1dFNlY3Rpb24gPSBnZXRJbnB1dFNlY3Rpb24oZGF0YSk7XG4gIGNvbnN0IHVwZGF0ZSA9IChldikgPT4ge1xuICAgIG9uVXBkYXRlKHt0eXBlOiBldi50YXJnZXQudmFsdWV9KTtcbiAgfTtcbiAgcmV0dXJuIChcbiAgICA8ZGl2PlxuICAgICAgPGxhYmVsPlxuICAgICAgICA8c3Bhbj5QYW5lbCB0eXBlOjwvc3Bhbj5cbiAgICAgICAgPHNlbGVjdCBvbkNoYW5nZT17dXBkYXRlfSByZXF1aXJlZD1cInRydWVcIiBuYW1lPVwidHlwZVwiPlxuICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJcIj4gLTwvb3B0aW9uPlxuICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsaXN0XCI+TGlzdDwvb3B0aW9uPlxuICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjaGFydFwiPkNoYXJ0PC9vcHRpb24+XG4gICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFnZ3JlZ2F0aW9uXCI+QWdncmVnYXRpb248L29wdGlvbj5cbiAgICAgICAgPC9zZWxlY3Q+XG4gICAgICA8L2xhYmVsPlxuICAgICAgPElucHV0U2VjdGlvbiBkYXRhPXtkYXRhfSBvblVwZGF0ZT17b25VcGRhdGV9Lz5cbiAgICA8L2Rpdj4pO1xufTtcblxuZXhwb3J0IGNvbnN0IEVkaXREYXRhUGFuZWxGb3JtID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHtkYXRhLCBvblVwZGF0ZSwgb25TdWJtaXR9PXByb3BzO1xuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XG4gICAgICA8Zm9ybSBvblN1Ym1pdD17b25TdWJtaXR9PlxuICAgICAgICA8bGFiZWw+XG4gICAgICAgICAgPHNwYW4+UGFuZWwgdGl0bGU6PC9zcGFuPlxuICAgICAgICAgIDxBdXRvZm9jdXNJbnB1dCBvbkNoYW5nZT17ZXYgPT4gb25VcGRhdGUoe3RpdGxlOiBldi50YXJnZXQudmFsdWV9KX0gbmFtZT1cInRpdGxlXCIgcmVxdWlyZWQ9XCJ0cnVlXCIvPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8VHlwZVNlY3Rpb24gZGF0YT17ZGF0YX0gb25VcGRhdGU9e29uVXBkYXRlfS8+XG4gICAgICAgIDxidXR0b24+Q3JlYXRlPC9idXR0b24+XG4gICAgICA8L2Zvcm0+XG4gICAgPC9kaXY+KTtcbn07XG5cbmV4cG9ydCBjb25zdCBFZGl0RGF0YVBhbmVsTW9kYWwgPSAocHJvcHMpID0+IHtcblxuICBjb25zdCBVcGRhdGFibGVGb3JtU2VjdGlvbiA9IHdpdGhTdGF0ZSgocHJvcHMsIHVwZGF0ZSkgPT4ge1xuICAgIGNvbnN0IHtkYXRhID0ge319ID0gcHJvcHM7XG4gICAgY29uc3Qgb25VcGRhdGUgPSAodmFsKSA9PiB7XG4gICAgICBPYmplY3QuYXNzaWduKGRhdGEsIHZhbCk7XG4gICAgICB1cGRhdGUoT2JqZWN0LmFzc2lnbihwcm9wcywge2RhdGF9KSk7XG4gICAgfTtcbiAgICByZXR1cm4gPEVkaXREYXRhUGFuZWxGb3JtIG9uVXBkYXRlPXtvblVwZGF0ZX0gey4uLnByb3BzfS8+O1xuICB9KTtcblxuICByZXR1cm4gKDxNb2RhbCBpc09wZW49e3Byb3BzLmlzT3Blbn0gY2xvc2VNb2RhbD17cHJvcHMuY2xvc2VNb2RhbH0gdGl0bGU9e3Byb3BzLnRpdGxlfT5cbiAgICA8VXBkYXRhYmxlRm9ybVNlY3Rpb24gey4uLnByb3BzfS8+XG4gIDwvTW9kYWw+KTtcbn07XG5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IHtFZGl0RGF0YVBhbmVsTW9kYWx9IGZyb20gJy4uL3ZpZXdzL0VkaXREYXRhUGFuZWxGb3JtJztcblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzLCB7YWN0aW9uc30pID0+IHtcbiAgY29uc3Qge3gsIHksIGRhdGEgPSB7fX0gPSBwcm9wcztcbiAgY29uc3Qgb25TdWJtaXQgPSBldiA9PiB7XG4gICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICBhY3Rpb25zLnVwZGF0ZVBhbmVsRGF0YSh7eCwgeSwgZGF0YTogZGF0YX0pO1xuICAgIGFjdGlvbnMuY2xvc2VNb2RhbCgpO1xuICB9O1xuXG4gIHJldHVybiA8RWRpdERhdGFQYW5lbE1vZGFsIGRhdGE9e2RhdGF9IGNsb3NlTW9kYWw9e2FjdGlvbnMuY2xvc2VNb2RhbH0gey4uLnByb3BzfSBvblN1Ym1pdD17b25TdWJtaXR9Lz5cbn1cblxuXG4iLCJpbXBvcnQge2h9IGZyb20gJ2ZsYWNvJztcbmltcG9ydCBNb2RhbCBmcm9tICcuL01vZGFsJztcblxuXG5leHBvcnQgZGVmYXVsdCAocHJvcHMpID0+IHtcbiAgY29uc3Qge2lzT3BlbiwgY2xvc2VNb2RhbCwgZXhlY3V0ZUFjdGlvbiwgbWVzc2FnZX0gPSBwcm9wcztcbiAgY29uc3QgY29uZmlybSA9IF8gPT4ge1xuICAgIGNsb3NlTW9kYWwoKTtcbiAgICBleGVjdXRlQWN0aW9uKCk7XG4gIH07XG4gIHJldHVybiA8TW9kYWwgaXNPcGVuPXtpc09wZW59IGNsb3NlTW9kYWw9e2Nsb3NlTW9kYWx9IHRpdGxlPVwiQXR0ZW50aW9uICFcIj5cbiAgICA8cD57bWVzc2FnZX08L3A+XG4gICAgPGRpdj5cbiAgICAgIDxidXR0b24gb25DbGljaz17Y29uZmlybX0+IENvbmZpcm08L2J1dHRvbj5cbiAgICAgIDxidXR0b24gb25DbGljaz17Y2xvc2VNb2RhbH0+IENhbmNlbDwvYnV0dG9uPlxuICAgIDwvZGl2PlxuICA8L01vZGFsPlxufSIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IENvbWZpcm1hdGlvbk1vZGFsIGZyb20gJy4uL3ZpZXdzL0NvbmZpcm1hdGlvbk1vZGFsJztcblxuZXhwb3J0IGRlZmF1bHQgKHByb3BzLCB7YWN0aW9uc30pID0+IDxDb21maXJtYXRpb25Nb2RhbCBjbG9zZU1vZGFsPXthY3Rpb25zLmNsb3NlTW9kYWx9IHsuLi5wcm9wc30gLz5cbiIsImltcG9ydCB7aH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEVkaXRQYW5lbERhdGFNb2RhbCBmcm9tICcuL0VkaXRQYW5lbERhdGFNb2RhbCc7XG5pbXBvcnQgQ29uZmlybWF0aW9uTW9kYWwgZnJvbSAnLi9Db25maXJtYXRpb25Nb2RhbCc7XG5pbXBvcnQge2RlZmF1bHQgYXMgTW9kYWxWaWV3fSAgZnJvbSAnLi4vdmlld3MvTW9kYWwnO1xuXG5leHBvcnQgY29uc3QgRW1wdHlNb2RhbCA9IChwcm9wcywge2FjdGlvbnN9KSA9PiB7XG4gIHJldHVybiAoPE1vZGFsVmlldyBpc09wZW49e3Byb3BzLmlzT3Blbn0gY2xvc2VNb2RhbD17YWN0aW9ucy5jbG9zZU1vZGFsfT5cbiAgICA8ZGl2PjwvZGl2PlxuICA8L01vZGFsVmlldz4pO1xufTtcblxuXG5jb25zdCBnZXRNb2RhbENvbXBvbmVudCA9IChtb2RhbFR5cGUpID0+IHtcbiAgc3dpdGNoIChtb2RhbFR5cGUpIHtcbiAgICBjYXNlICdjcmVhdGVQYW5lbERhdGEnOlxuICAgICAgcmV0dXJuIEVkaXRQYW5lbERhdGFNb2RhbDtcbiAgICBjYXNlICdhc2tDb25maXJtYXRpb24nOlxuICAgICAgcmV0dXJuIENvbmZpcm1hdGlvbk1vZGFsO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gRW1wdHlNb2RhbDtcbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgTW9kYWwgPSAocHJvcHMsIHNlcnZpY2VzKSA9PiB7XG4gIGNvbnN0IHttb2RhbFR5cGV9ID0gcHJvcHM7XG4gIGNvbnN0IE1vZGFsQ29tcG9uZW50ID0gZ2V0TW9kYWxDb21wb25lbnQobW9kYWxUeXBlKTtcbiAgcmV0dXJuIE1vZGFsQ29tcG9uZW50KHByb3BzLCBzZXJ2aWNlcyk7XG59OyIsImV4cG9ydCBmdW5jdGlvbiBzd2FwIChmKSB7XG4gIHJldHVybiAoYSwgYikgPT4gZihiLCBhKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvc2UgKGZpcnN0LCAuLi5mbnMpIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiBmbnMucmVkdWNlKChwcmV2aW91cywgY3VycmVudCkgPT4gY3VycmVudChwcmV2aW91cyksIGZpcnN0KC4uLmFyZ3MpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGN1cnJ5IChmbiwgYXJpdHlMZWZ0KSB7XG4gIGNvbnN0IGFyaXR5ID0gYXJpdHlMZWZ0IHx8IGZuLmxlbmd0aDtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgY29uc3QgYXJnTGVuZ3RoID0gYXJncy5sZW5ndGggfHwgMTtcbiAgICBpZiAoYXJpdHkgPT09IGFyZ0xlbmd0aCkge1xuICAgICAgcmV0dXJuIGZuKC4uLmFyZ3MpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBmdW5jID0gKC4uLm1vcmVBcmdzKSA9PiBmbiguLi5hcmdzLCAuLi5tb3JlQXJncyk7XG4gICAgICByZXR1cm4gY3VycnkoZnVuYywgYXJpdHkgLSBhcmdzLmxlbmd0aCk7XG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHkgKGZuKSB7XG4gIHJldHVybiAoLi4uYXJncykgPT4gZm4oLi4uYXJncyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0YXAgKGZuKSB7XG4gIHJldHVybiBhcmcgPT4ge1xuICAgIGZuKGFyZyk7XG4gICAgcmV0dXJuIGFyZztcbiAgfVxufSIsImNvbnN0IGFjdGlvbkNyZWF0b3IgPSBhY3Rpb25OYW1lID0+IG9wdHMgPT4gKE9iamVjdC5hc3NpZ24oe3R5cGU6IGFjdGlvbk5hbWV9LCBvcHRzKSlcblxuZXhwb3J0IGNvbnN0IGRyYWdPdmVyID0gYWN0aW9uQ3JlYXRvcignRFJBR19PVkVSJyk7XG5leHBvcnQgY29uc3QgZW5kUmVzaXplID0gYWN0aW9uQ3JlYXRvcignRU5EX1JFU0laRScpO1xuZXhwb3J0IGNvbnN0IHN0YXJ0UmVzaXplID0gYWN0aW9uQ3JlYXRvcignU1RBUlRfUkVTSVpFJyk7XG5leHBvcnQgY29uc3Qgc3RhcnRNb3ZlID0gYWN0aW9uQ3JlYXRvcignU1RBUlRfTU9WRScpO1xuZXhwb3J0IGNvbnN0IGVuZE1vdmUgPSBhY3Rpb25DcmVhdG9yKCdFTkRfTU9WRScpO1xuZXhwb3J0IGNvbnN0IG9wZW5Nb2RhbCA9IGFjdGlvbkNyZWF0b3IoJ09QRU5fTU9EQUwnKTtcbmV4cG9ydCBjb25zdCBjbG9zZU1vZGFsID0gYWN0aW9uQ3JlYXRvcignQ0xPU0VfTU9EQUwnKTtcbmV4cG9ydCBjb25zdCB1cGRhdGVQYW5lbERhdGEgPSBhY3Rpb25DcmVhdG9yKCdVUERBVEVfUEFORUxfREFUQScpO1xuZXhwb3J0IGNvbnN0IHVwZGF0ZVNtYXJ0TGlzdCA9IGFjdGlvbkNyZWF0b3IoJ1VQREFURV9TTUFSVF9MSVNUJyk7XG5leHBvcnQgY29uc3QgY3JlYXRlU21hcnRMaXN0ID0gYWN0aW9uQ3JlYXRvcignQ1JFQVRFX1NNQVJUX0xJU1QnKTtcbmV4cG9ydCBjb25zdCByZXNldFBhbmVsID0gYWN0aW9uQ3JlYXRvcignUkVTRVRfUEFORUwnKTtcbmV4cG9ydCBjb25zdCByZW1vdmVTbWFydExpc3QgPSBhY3Rpb25DcmVhdG9yKCdSRU1PVkVfU01BUlRfTElTVCcpOyIsIi8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgZ2xvYmFsYCBmcm9tIE5vZGUuanMuICovXG52YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsICYmIGdsb2JhbC5PYmplY3QgPT09IE9iamVjdCAmJiBnbG9iYWw7XG5cbmV4cG9ydCBkZWZhdWx0IGZyZWVHbG9iYWw7XG4iLCJpbXBvcnQgZnJlZUdsb2JhbCBmcm9tICcuL19mcmVlR2xvYmFsLmpzJztcblxuLyoqIERldGVjdCBmcmVlIHZhcmlhYmxlIGBzZWxmYC4gKi9cbnZhciBmcmVlU2VsZiA9IHR5cGVvZiBzZWxmID09ICdvYmplY3QnICYmIHNlbGYgJiYgc2VsZi5PYmplY3QgPT09IE9iamVjdCAmJiBzZWxmO1xuXG4vKiogVXNlZCBhcyBhIHJlZmVyZW5jZSB0byB0aGUgZ2xvYmFsIG9iamVjdC4gKi9cbnZhciByb290ID0gZnJlZUdsb2JhbCB8fCBmcmVlU2VsZiB8fCBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuXG5leHBvcnQgZGVmYXVsdCByb290O1xuIiwiaW1wb3J0IHJvb3QgZnJvbSAnLi9fcm9vdC5qcyc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIFN5bWJvbCA9IHJvb3QuU3ltYm9sO1xuXG5leHBvcnQgZGVmYXVsdCBTeW1ib2w7XG4iLCJpbXBvcnQgU3ltYm9sIGZyb20gJy4vX1N5bWJvbC5qcyc7XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZVxuICogW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzcuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBuYXRpdmVPYmplY3RUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBzeW1Ub1N0cmluZ1RhZyA9IFN5bWJvbCA/IFN5bWJvbC50b1N0cmluZ1RhZyA6IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VHZXRUYWdgIHdoaWNoIGlnbm9yZXMgYFN5bWJvbC50b1N0cmluZ1RhZ2AgdmFsdWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHJhdyBgdG9TdHJpbmdUYWdgLlxuICovXG5mdW5jdGlvbiBnZXRSYXdUYWcodmFsdWUpIHtcbiAgdmFyIGlzT3duID0gaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgc3ltVG9TdHJpbmdUYWcpLFxuICAgICAgdGFnID0gdmFsdWVbc3ltVG9TdHJpbmdUYWddO1xuXG4gIHRyeSB7XG4gICAgdmFsdWVbc3ltVG9TdHJpbmdUYWddID0gdW5kZWZpbmVkO1xuICAgIHZhciB1bm1hc2tlZCA9IHRydWU7XG4gIH0gY2F0Y2ggKGUpIHt9XG5cbiAgdmFyIHJlc3VsdCA9IG5hdGl2ZU9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICBpZiAodW5tYXNrZWQpIHtcbiAgICBpZiAoaXNPd24pIHtcbiAgICAgIHZhbHVlW3N5bVRvU3RyaW5nVGFnXSA9IHRhZztcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIHZhbHVlW3N5bVRvU3RyaW5nVGFnXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZ2V0UmF3VGFnO1xuIiwiLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlXG4gKiBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNy4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG5hdGl2ZU9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ29udmVydHMgYHZhbHVlYCB0byBhIHN0cmluZyB1c2luZyBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNvbnZlcnQuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBjb252ZXJ0ZWQgc3RyaW5nLlxuICovXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyh2YWx1ZSkge1xuICByZXR1cm4gbmF0aXZlT2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IG9iamVjdFRvU3RyaW5nO1xuIiwiaW1wb3J0IFN5bWJvbCBmcm9tICcuL19TeW1ib2wuanMnO1xuaW1wb3J0IGdldFJhd1RhZyBmcm9tICcuL19nZXRSYXdUYWcuanMnO1xuaW1wb3J0IG9iamVjdFRvU3RyaW5nIGZyb20gJy4vX29iamVjdFRvU3RyaW5nLmpzJztcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIG51bGxUYWcgPSAnW29iamVjdCBOdWxsXScsXG4gICAgdW5kZWZpbmVkVGFnID0gJ1tvYmplY3QgVW5kZWZpbmVkXSc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIHN5bVRvU3RyaW5nVGFnID0gU3ltYm9sID8gU3ltYm9sLnRvU3RyaW5nVGFnIDogdW5kZWZpbmVkO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBnZXRUYWdgIHdpdGhvdXQgZmFsbGJhY2tzIGZvciBidWdneSBlbnZpcm9ubWVudHMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHF1ZXJ5LlxuICogQHJldHVybnMge3N0cmluZ30gUmV0dXJucyB0aGUgYHRvU3RyaW5nVGFnYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUdldFRhZyh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkVGFnIDogbnVsbFRhZztcbiAgfVxuICByZXR1cm4gKHN5bVRvU3RyaW5nVGFnICYmIHN5bVRvU3RyaW5nVGFnIGluIE9iamVjdCh2YWx1ZSkpXG4gICAgPyBnZXRSYXdUYWcodmFsdWUpXG4gICAgOiBvYmplY3RUb1N0cmluZyh2YWx1ZSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGJhc2VHZXRUYWc7XG4iLCIvKipcbiAqIENyZWF0ZXMgYSB1bmFyeSBmdW5jdGlvbiB0aGF0IGludm9rZXMgYGZ1bmNgIHdpdGggaXRzIGFyZ3VtZW50IHRyYW5zZm9ybWVkLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byB3cmFwLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gdHJhbnNmb3JtIFRoZSBhcmd1bWVudCB0cmFuc2Zvcm0uXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gb3ZlckFyZyhmdW5jLCB0cmFuc2Zvcm0pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGFyZykge1xuICAgIHJldHVybiBmdW5jKHRyYW5zZm9ybShhcmcpKTtcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgb3ZlckFyZztcbiIsImltcG9ydCBvdmVyQXJnIGZyb20gJy4vX292ZXJBcmcuanMnO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBnZXRQcm90b3R5cGUgPSBvdmVyQXJnKE9iamVjdC5nZXRQcm90b3R5cGVPZiwgT2JqZWN0KTtcblxuZXhwb3J0IGRlZmF1bHQgZ2V0UHJvdG90eXBlO1xuIiwiLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZS4gQSB2YWx1ZSBpcyBvYmplY3QtbGlrZSBpZiBpdCdzIG5vdCBgbnVsbGBcbiAqIGFuZCBoYXMgYSBgdHlwZW9mYCByZXN1bHQgb2YgXCJvYmplY3RcIi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZSwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZSh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdExpa2UoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShfLm5vb3ApO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgIT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCc7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGlzT2JqZWN0TGlrZTtcbiIsImltcG9ydCBiYXNlR2V0VGFnIGZyb20gJy4vX2Jhc2VHZXRUYWcuanMnO1xuaW1wb3J0IGdldFByb3RvdHlwZSBmcm9tICcuL19nZXRQcm90b3R5cGUuanMnO1xuaW1wb3J0IGlzT2JqZWN0TGlrZSBmcm9tICcuL2lzT2JqZWN0TGlrZS5qcyc7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RUYWcgPSAnW29iamVjdCBPYmplY3RdJztcblxuLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNQcm90byA9IEZ1bmN0aW9uLnByb3RvdHlwZSxcbiAgICBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9ucy4gKi9cbnZhciBmdW5jVG9TdHJpbmcgPSBmdW5jUHJvdG8udG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKiBVc2VkIHRvIGluZmVyIHRoZSBgT2JqZWN0YCBjb25zdHJ1Y3Rvci4gKi9cbnZhciBvYmplY3RDdG9yU3RyaW5nID0gZnVuY1RvU3RyaW5nLmNhbGwoT2JqZWN0KTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHBsYWluIG9iamVjdCwgdGhhdCBpcywgYW4gb2JqZWN0IGNyZWF0ZWQgYnkgdGhlXG4gKiBgT2JqZWN0YCBjb25zdHJ1Y3RvciBvciBvbmUgd2l0aCBhIGBbW1Byb3RvdHlwZV1dYCBvZiBgbnVsbGAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBzaW5jZSAwLjguMFxuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBwbGFpbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogfVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChuZXcgRm9vKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc1BsYWluT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdCh7ICd4JzogMCwgJ3knOiAwIH0pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChPYmplY3QuY3JlYXRlKG51bGwpKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaXNQbGFpbk9iamVjdCh2YWx1ZSkge1xuICBpZiAoIWlzT2JqZWN0TGlrZSh2YWx1ZSkgfHwgYmFzZUdldFRhZyh2YWx1ZSkgIT0gb2JqZWN0VGFnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciBwcm90byA9IGdldFByb3RvdHlwZSh2YWx1ZSk7XG4gIGlmIChwcm90byA9PT0gbnVsbCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHZhciBDdG9yID0gaGFzT3duUHJvcGVydHkuY2FsbChwcm90bywgJ2NvbnN0cnVjdG9yJykgJiYgcHJvdG8uY29uc3RydWN0b3I7XG4gIHJldHVybiB0eXBlb2YgQ3RvciA9PSAnZnVuY3Rpb24nICYmIEN0b3IgaW5zdGFuY2VvZiBDdG9yICYmXG4gICAgZnVuY1RvU3RyaW5nLmNhbGwoQ3RvcikgPT0gb2JqZWN0Q3RvclN0cmluZztcbn1cblxuZXhwb3J0IGRlZmF1bHQgaXNQbGFpbk9iamVjdDtcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHN5bWJvbE9ic2VydmFibGVQb255ZmlsbChyb290KSB7XG5cdHZhciByZXN1bHQ7XG5cdHZhciBTeW1ib2wgPSByb290LlN5bWJvbDtcblxuXHRpZiAodHlwZW9mIFN5bWJvbCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdGlmIChTeW1ib2wub2JzZXJ2YWJsZSkge1xuXHRcdFx0cmVzdWx0ID0gU3ltYm9sLm9ic2VydmFibGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IFN5bWJvbCgnb2JzZXJ2YWJsZScpO1xuXHRcdFx0U3ltYm9sLm9ic2VydmFibGUgPSByZXN1bHQ7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJlc3VsdCA9ICdAQG9ic2VydmFibGUnO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn07XG4iLCIvKiBnbG9iYWwgd2luZG93ICovXG5pbXBvcnQgcG9ueWZpbGwgZnJvbSAnLi9wb255ZmlsbCc7XG5cbnZhciByb290O1xuXG5pZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7XG4gIHJvb3QgPSBzZWxmO1xufSBlbHNlIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gZ2xvYmFsO1xufSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gbW9kdWxlO1xufSBlbHNlIHtcbiAgcm9vdCA9IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG59XG5cbnZhciByZXN1bHQgPSBwb255ZmlsbChyb290KTtcbmV4cG9ydCBkZWZhdWx0IHJlc3VsdDtcbiIsImltcG9ydCBpc1BsYWluT2JqZWN0IGZyb20gJ2xvZGFzaC1lcy9pc1BsYWluT2JqZWN0JztcbmltcG9ydCAkJG9ic2VydmFibGUgZnJvbSAnc3ltYm9sLW9ic2VydmFibGUnO1xuXG4vKipcbiAqIFRoZXNlIGFyZSBwcml2YXRlIGFjdGlvbiB0eXBlcyByZXNlcnZlZCBieSBSZWR1eC5cbiAqIEZvciBhbnkgdW5rbm93biBhY3Rpb25zLCB5b3UgbXVzdCByZXR1cm4gdGhlIGN1cnJlbnQgc3RhdGUuXG4gKiBJZiB0aGUgY3VycmVudCBzdGF0ZSBpcyB1bmRlZmluZWQsIHlvdSBtdXN0IHJldHVybiB0aGUgaW5pdGlhbCBzdGF0ZS5cbiAqIERvIG5vdCByZWZlcmVuY2UgdGhlc2UgYWN0aW9uIHR5cGVzIGRpcmVjdGx5IGluIHlvdXIgY29kZS5cbiAqL1xuZXhwb3J0IHZhciBBY3Rpb25UeXBlcyA9IHtcbiAgSU5JVDogJ0BAcmVkdXgvSU5JVCdcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIFJlZHV4IHN0b3JlIHRoYXQgaG9sZHMgdGhlIHN0YXRlIHRyZWUuXG4gKiBUaGUgb25seSB3YXkgdG8gY2hhbmdlIHRoZSBkYXRhIGluIHRoZSBzdG9yZSBpcyB0byBjYWxsIGBkaXNwYXRjaCgpYCBvbiBpdC5cbiAqXG4gKiBUaGVyZSBzaG91bGQgb25seSBiZSBhIHNpbmdsZSBzdG9yZSBpbiB5b3VyIGFwcC4gVG8gc3BlY2lmeSBob3cgZGlmZmVyZW50XG4gKiBwYXJ0cyBvZiB0aGUgc3RhdGUgdHJlZSByZXNwb25kIHRvIGFjdGlvbnMsIHlvdSBtYXkgY29tYmluZSBzZXZlcmFsIHJlZHVjZXJzXG4gKiBpbnRvIGEgc2luZ2xlIHJlZHVjZXIgZnVuY3Rpb24gYnkgdXNpbmcgYGNvbWJpbmVSZWR1Y2Vyc2AuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gcmVkdWNlciBBIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgbmV4dCBzdGF0ZSB0cmVlLCBnaXZlblxuICogdGhlIGN1cnJlbnQgc3RhdGUgdHJlZSBhbmQgdGhlIGFjdGlvbiB0byBoYW5kbGUuXG4gKlxuICogQHBhcmFtIHthbnl9IFtwcmVsb2FkZWRTdGF0ZV0gVGhlIGluaXRpYWwgc3RhdGUuIFlvdSBtYXkgb3B0aW9uYWxseSBzcGVjaWZ5IGl0XG4gKiB0byBoeWRyYXRlIHRoZSBzdGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgaW4gdW5pdmVyc2FsIGFwcHMsIG9yIHRvIHJlc3RvcmUgYVxuICogcHJldmlvdXNseSBzZXJpYWxpemVkIHVzZXIgc2Vzc2lvbi5cbiAqIElmIHlvdSB1c2UgYGNvbWJpbmVSZWR1Y2Vyc2AgdG8gcHJvZHVjZSB0aGUgcm9vdCByZWR1Y2VyIGZ1bmN0aW9uLCB0aGlzIG11c3QgYmVcbiAqIGFuIG9iamVjdCB3aXRoIHRoZSBzYW1lIHNoYXBlIGFzIGBjb21iaW5lUmVkdWNlcnNgIGtleXMuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZW5oYW5jZXIgVGhlIHN0b3JlIGVuaGFuY2VyLiBZb3UgbWF5IG9wdGlvbmFsbHkgc3BlY2lmeSBpdFxuICogdG8gZW5oYW5jZSB0aGUgc3RvcmUgd2l0aCB0aGlyZC1wYXJ0eSBjYXBhYmlsaXRpZXMgc3VjaCBhcyBtaWRkbGV3YXJlLFxuICogdGltZSB0cmF2ZWwsIHBlcnNpc3RlbmNlLCBldGMuIFRoZSBvbmx5IHN0b3JlIGVuaGFuY2VyIHRoYXQgc2hpcHMgd2l0aCBSZWR1eFxuICogaXMgYGFwcGx5TWlkZGxld2FyZSgpYC5cbiAqXG4gKiBAcmV0dXJucyB7U3RvcmV9IEEgUmVkdXggc3RvcmUgdGhhdCBsZXRzIHlvdSByZWFkIHRoZSBzdGF0ZSwgZGlzcGF0Y2ggYWN0aW9uc1xuICogYW5kIHN1YnNjcmliZSB0byBjaGFuZ2VzLlxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjcmVhdGVTdG9yZShyZWR1Y2VyLCBwcmVsb2FkZWRTdGF0ZSwgZW5oYW5jZXIpIHtcbiAgdmFyIF9yZWYyO1xuXG4gIGlmICh0eXBlb2YgcHJlbG9hZGVkU3RhdGUgPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGVuaGFuY2VyID09PSAndW5kZWZpbmVkJykge1xuICAgIGVuaGFuY2VyID0gcHJlbG9hZGVkU3RhdGU7XG4gICAgcHJlbG9hZGVkU3RhdGUgPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIGVuaGFuY2VyICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmICh0eXBlb2YgZW5oYW5jZXIgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgdGhlIGVuaGFuY2VyIHRvIGJlIGEgZnVuY3Rpb24uJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVuaGFuY2VyKGNyZWF0ZVN0b3JlKShyZWR1Y2VyLCBwcmVsb2FkZWRTdGF0ZSk7XG4gIH1cblxuICBpZiAodHlwZW9mIHJlZHVjZXIgIT09ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIHRoZSByZWR1Y2VyIHRvIGJlIGEgZnVuY3Rpb24uJyk7XG4gIH1cblxuICB2YXIgY3VycmVudFJlZHVjZXIgPSByZWR1Y2VyO1xuICB2YXIgY3VycmVudFN0YXRlID0gcHJlbG9hZGVkU3RhdGU7XG4gIHZhciBjdXJyZW50TGlzdGVuZXJzID0gW107XG4gIHZhciBuZXh0TGlzdGVuZXJzID0gY3VycmVudExpc3RlbmVycztcbiAgdmFyIGlzRGlzcGF0Y2hpbmcgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBlbnN1cmVDYW5NdXRhdGVOZXh0TGlzdGVuZXJzKCkge1xuICAgIGlmIChuZXh0TGlzdGVuZXJzID09PSBjdXJyZW50TGlzdGVuZXJzKSB7XG4gICAgICBuZXh0TGlzdGVuZXJzID0gY3VycmVudExpc3RlbmVycy5zbGljZSgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZWFkcyB0aGUgc3RhdGUgdHJlZSBtYW5hZ2VkIGJ5IHRoZSBzdG9yZS5cbiAgICpcbiAgICogQHJldHVybnMge2FueX0gVGhlIGN1cnJlbnQgc3RhdGUgdHJlZSBvZiB5b3VyIGFwcGxpY2F0aW9uLlxuICAgKi9cbiAgZnVuY3Rpb24gZ2V0U3RhdGUoKSB7XG4gICAgcmV0dXJuIGN1cnJlbnRTdGF0ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGRzIGEgY2hhbmdlIGxpc3RlbmVyLiBJdCB3aWxsIGJlIGNhbGxlZCBhbnkgdGltZSBhbiBhY3Rpb24gaXMgZGlzcGF0Y2hlZCxcbiAgICogYW5kIHNvbWUgcGFydCBvZiB0aGUgc3RhdGUgdHJlZSBtYXkgcG90ZW50aWFsbHkgaGF2ZSBjaGFuZ2VkLiBZb3UgbWF5IHRoZW5cbiAgICogY2FsbCBgZ2V0U3RhdGUoKWAgdG8gcmVhZCB0aGUgY3VycmVudCBzdGF0ZSB0cmVlIGluc2lkZSB0aGUgY2FsbGJhY2suXG4gICAqXG4gICAqIFlvdSBtYXkgY2FsbCBgZGlzcGF0Y2goKWAgZnJvbSBhIGNoYW5nZSBsaXN0ZW5lciwgd2l0aCB0aGUgZm9sbG93aW5nXG4gICAqIGNhdmVhdHM6XG4gICAqXG4gICAqIDEuIFRoZSBzdWJzY3JpcHRpb25zIGFyZSBzbmFwc2hvdHRlZCBqdXN0IGJlZm9yZSBldmVyeSBgZGlzcGF0Y2goKWAgY2FsbC5cbiAgICogSWYgeW91IHN1YnNjcmliZSBvciB1bnN1YnNjcmliZSB3aGlsZSB0aGUgbGlzdGVuZXJzIGFyZSBiZWluZyBpbnZva2VkLCB0aGlzXG4gICAqIHdpbGwgbm90IGhhdmUgYW55IGVmZmVjdCBvbiB0aGUgYGRpc3BhdGNoKClgIHRoYXQgaXMgY3VycmVudGx5IGluIHByb2dyZXNzLlxuICAgKiBIb3dldmVyLCB0aGUgbmV4dCBgZGlzcGF0Y2goKWAgY2FsbCwgd2hldGhlciBuZXN0ZWQgb3Igbm90LCB3aWxsIHVzZSBhIG1vcmVcbiAgICogcmVjZW50IHNuYXBzaG90IG9mIHRoZSBzdWJzY3JpcHRpb24gbGlzdC5cbiAgICpcbiAgICogMi4gVGhlIGxpc3RlbmVyIHNob3VsZCBub3QgZXhwZWN0IHRvIHNlZSBhbGwgc3RhdGUgY2hhbmdlcywgYXMgdGhlIHN0YXRlXG4gICAqIG1pZ2h0IGhhdmUgYmVlbiB1cGRhdGVkIG11bHRpcGxlIHRpbWVzIGR1cmluZyBhIG5lc3RlZCBgZGlzcGF0Y2goKWAgYmVmb3JlXG4gICAqIHRoZSBsaXN0ZW5lciBpcyBjYWxsZWQuIEl0IGlzLCBob3dldmVyLCBndWFyYW50ZWVkIHRoYXQgYWxsIHN1YnNjcmliZXJzXG4gICAqIHJlZ2lzdGVyZWQgYmVmb3JlIHRoZSBgZGlzcGF0Y2goKWAgc3RhcnRlZCB3aWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBsYXRlc3RcbiAgICogc3RhdGUgYnkgdGhlIHRpbWUgaXQgZXhpdHMuXG4gICAqXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIEEgY2FsbGJhY2sgdG8gYmUgaW52b2tlZCBvbiBldmVyeSBkaXNwYXRjaC5cbiAgICogQHJldHVybnMge0Z1bmN0aW9ufSBBIGZ1bmN0aW9uIHRvIHJlbW92ZSB0aGlzIGNoYW5nZSBsaXN0ZW5lci5cbiAgICovXG4gIGZ1bmN0aW9uIHN1YnNjcmliZShsaXN0ZW5lcikge1xuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgbGlzdGVuZXIgdG8gYmUgYSBmdW5jdGlvbi4nKTtcbiAgICB9XG5cbiAgICB2YXIgaXNTdWJzY3JpYmVkID0gdHJ1ZTtcblxuICAgIGVuc3VyZUNhbk11dGF0ZU5leHRMaXN0ZW5lcnMoKTtcbiAgICBuZXh0TGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIHVuc3Vic2NyaWJlKCkge1xuICAgICAgaWYgKCFpc1N1YnNjcmliZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpc1N1YnNjcmliZWQgPSBmYWxzZTtcblxuICAgICAgZW5zdXJlQ2FuTXV0YXRlTmV4dExpc3RlbmVycygpO1xuICAgICAgdmFyIGluZGV4ID0gbmV4dExpc3RlbmVycy5pbmRleE9mKGxpc3RlbmVyKTtcbiAgICAgIG5leHRMaXN0ZW5lcnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIERpc3BhdGNoZXMgYW4gYWN0aW9uLiBJdCBpcyB0aGUgb25seSB3YXkgdG8gdHJpZ2dlciBhIHN0YXRlIGNoYW5nZS5cbiAgICpcbiAgICogVGhlIGByZWR1Y2VyYCBmdW5jdGlvbiwgdXNlZCB0byBjcmVhdGUgdGhlIHN0b3JlLCB3aWxsIGJlIGNhbGxlZCB3aXRoIHRoZVxuICAgKiBjdXJyZW50IHN0YXRlIHRyZWUgYW5kIHRoZSBnaXZlbiBgYWN0aW9uYC4gSXRzIHJldHVybiB2YWx1ZSB3aWxsXG4gICAqIGJlIGNvbnNpZGVyZWQgdGhlICoqbmV4dCoqIHN0YXRlIG9mIHRoZSB0cmVlLCBhbmQgdGhlIGNoYW5nZSBsaXN0ZW5lcnNcbiAgICogd2lsbCBiZSBub3RpZmllZC5cbiAgICpcbiAgICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb25seSBzdXBwb3J0cyBwbGFpbiBvYmplY3QgYWN0aW9ucy4gSWYgeW91IHdhbnQgdG9cbiAgICogZGlzcGF0Y2ggYSBQcm9taXNlLCBhbiBPYnNlcnZhYmxlLCBhIHRodW5rLCBvciBzb21ldGhpbmcgZWxzZSwgeW91IG5lZWQgdG9cbiAgICogd3JhcCB5b3VyIHN0b3JlIGNyZWF0aW5nIGZ1bmN0aW9uIGludG8gdGhlIGNvcnJlc3BvbmRpbmcgbWlkZGxld2FyZS4gRm9yXG4gICAqIGV4YW1wbGUsIHNlZSB0aGUgZG9jdW1lbnRhdGlvbiBmb3IgdGhlIGByZWR1eC10aHVua2AgcGFja2FnZS4gRXZlbiB0aGVcbiAgICogbWlkZGxld2FyZSB3aWxsIGV2ZW50dWFsbHkgZGlzcGF0Y2ggcGxhaW4gb2JqZWN0IGFjdGlvbnMgdXNpbmcgdGhpcyBtZXRob2QuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhY3Rpb24gQSBwbGFpbiBvYmplY3QgcmVwcmVzZW50aW5nIOKAnHdoYXQgY2hhbmdlZOKAnS4gSXQgaXNcbiAgICogYSBnb29kIGlkZWEgdG8ga2VlcCBhY3Rpb25zIHNlcmlhbGl6YWJsZSBzbyB5b3UgY2FuIHJlY29yZCBhbmQgcmVwbGF5IHVzZXJcbiAgICogc2Vzc2lvbnMsIG9yIHVzZSB0aGUgdGltZSB0cmF2ZWxsaW5nIGByZWR1eC1kZXZ0b29sc2AuIEFuIGFjdGlvbiBtdXN0IGhhdmVcbiAgICogYSBgdHlwZWAgcHJvcGVydHkgd2hpY2ggbWF5IG5vdCBiZSBgdW5kZWZpbmVkYC4gSXQgaXMgYSBnb29kIGlkZWEgdG8gdXNlXG4gICAqIHN0cmluZyBjb25zdGFudHMgZm9yIGFjdGlvbiB0eXBlcy5cbiAgICpcbiAgICogQHJldHVybnMge09iamVjdH0gRm9yIGNvbnZlbmllbmNlLCB0aGUgc2FtZSBhY3Rpb24gb2JqZWN0IHlvdSBkaXNwYXRjaGVkLlxuICAgKlxuICAgKiBOb3RlIHRoYXQsIGlmIHlvdSB1c2UgYSBjdXN0b20gbWlkZGxld2FyZSwgaXQgbWF5IHdyYXAgYGRpc3BhdGNoKClgIHRvXG4gICAqIHJldHVybiBzb21ldGhpbmcgZWxzZSAoZm9yIGV4YW1wbGUsIGEgUHJvbWlzZSB5b3UgY2FuIGF3YWl0KS5cbiAgICovXG4gIGZ1bmN0aW9uIGRpc3BhdGNoKGFjdGlvbikge1xuICAgIGlmICghaXNQbGFpbk9iamVjdChhY3Rpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FjdGlvbnMgbXVzdCBiZSBwbGFpbiBvYmplY3RzLiAnICsgJ1VzZSBjdXN0b20gbWlkZGxld2FyZSBmb3IgYXN5bmMgYWN0aW9ucy4nKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGFjdGlvbi50eXBlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBY3Rpb25zIG1heSBub3QgaGF2ZSBhbiB1bmRlZmluZWQgXCJ0eXBlXCIgcHJvcGVydHkuICcgKyAnSGF2ZSB5b3UgbWlzc3BlbGxlZCBhIGNvbnN0YW50PycpO1xuICAgIH1cblxuICAgIGlmIChpc0Rpc3BhdGNoaW5nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JlZHVjZXJzIG1heSBub3QgZGlzcGF0Y2ggYWN0aW9ucy4nKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgaXNEaXNwYXRjaGluZyA9IHRydWU7XG4gICAgICBjdXJyZW50U3RhdGUgPSBjdXJyZW50UmVkdWNlcihjdXJyZW50U3RhdGUsIGFjdGlvbik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlzRGlzcGF0Y2hpbmcgPSBmYWxzZTtcbiAgICB9XG5cbiAgICB2YXIgbGlzdGVuZXJzID0gY3VycmVudExpc3RlbmVycyA9IG5leHRMaXN0ZW5lcnM7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGxpc3RlbmVyc1tpXSgpO1xuICAgIH1cblxuICAgIHJldHVybiBhY3Rpb247XG4gIH1cblxuICAvKipcbiAgICogUmVwbGFjZXMgdGhlIHJlZHVjZXIgY3VycmVudGx5IHVzZWQgYnkgdGhlIHN0b3JlIHRvIGNhbGN1bGF0ZSB0aGUgc3RhdGUuXG4gICAqXG4gICAqIFlvdSBtaWdodCBuZWVkIHRoaXMgaWYgeW91ciBhcHAgaW1wbGVtZW50cyBjb2RlIHNwbGl0dGluZyBhbmQgeW91IHdhbnQgdG9cbiAgICogbG9hZCBzb21lIG9mIHRoZSByZWR1Y2VycyBkeW5hbWljYWxseS4gWW91IG1pZ2h0IGFsc28gbmVlZCB0aGlzIGlmIHlvdVxuICAgKiBpbXBsZW1lbnQgYSBob3QgcmVsb2FkaW5nIG1lY2hhbmlzbSBmb3IgUmVkdXguXG4gICAqXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRSZWR1Y2VyIFRoZSByZWR1Y2VyIGZvciB0aGUgc3RvcmUgdG8gdXNlIGluc3RlYWQuXG4gICAqIEByZXR1cm5zIHt2b2lkfVxuICAgKi9cbiAgZnVuY3Rpb24gcmVwbGFjZVJlZHVjZXIobmV4dFJlZHVjZXIpIHtcbiAgICBpZiAodHlwZW9mIG5leHRSZWR1Y2VyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIHRoZSBuZXh0UmVkdWNlciB0byBiZSBhIGZ1bmN0aW9uLicpO1xuICAgIH1cblxuICAgIGN1cnJlbnRSZWR1Y2VyID0gbmV4dFJlZHVjZXI7XG4gICAgZGlzcGF0Y2goeyB0eXBlOiBBY3Rpb25UeXBlcy5JTklUIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEludGVyb3BlcmFiaWxpdHkgcG9pbnQgZm9yIG9ic2VydmFibGUvcmVhY3RpdmUgbGlicmFyaWVzLlxuICAgKiBAcmV0dXJucyB7b2JzZXJ2YWJsZX0gQSBtaW5pbWFsIG9ic2VydmFibGUgb2Ygc3RhdGUgY2hhbmdlcy5cbiAgICogRm9yIG1vcmUgaW5mb3JtYXRpb24sIHNlZSB0aGUgb2JzZXJ2YWJsZSBwcm9wb3NhbDpcbiAgICogaHR0cHM6Ly9naXRodWIuY29tL3plbnBhcnNpbmcvZXMtb2JzZXJ2YWJsZVxuICAgKi9cbiAgZnVuY3Rpb24gb2JzZXJ2YWJsZSgpIHtcbiAgICB2YXIgX3JlZjtcblxuICAgIHZhciBvdXRlclN1YnNjcmliZSA9IHN1YnNjcmliZTtcbiAgICByZXR1cm4gX3JlZiA9IHtcbiAgICAgIC8qKlxuICAgICAgICogVGhlIG1pbmltYWwgb2JzZXJ2YWJsZSBzdWJzY3JpcHRpb24gbWV0aG9kLlxuICAgICAgICogQHBhcmFtIHtPYmplY3R9IG9ic2VydmVyIEFueSBvYmplY3QgdGhhdCBjYW4gYmUgdXNlZCBhcyBhbiBvYnNlcnZlci5cbiAgICAgICAqIFRoZSBvYnNlcnZlciBvYmplY3Qgc2hvdWxkIGhhdmUgYSBgbmV4dGAgbWV0aG9kLlxuICAgICAgICogQHJldHVybnMge3N1YnNjcmlwdGlvbn0gQW4gb2JqZWN0IHdpdGggYW4gYHVuc3Vic2NyaWJlYCBtZXRob2QgdGhhdCBjYW5cbiAgICAgICAqIGJlIHVzZWQgdG8gdW5zdWJzY3JpYmUgdGhlIG9ic2VydmFibGUgZnJvbSB0aGUgc3RvcmUsIGFuZCBwcmV2ZW50IGZ1cnRoZXJcbiAgICAgICAqIGVtaXNzaW9uIG9mIHZhbHVlcyBmcm9tIHRoZSBvYnNlcnZhYmxlLlxuICAgICAgICovXG4gICAgICBzdWJzY3JpYmU6IGZ1bmN0aW9uIHN1YnNjcmliZShvYnNlcnZlcikge1xuICAgICAgICBpZiAodHlwZW9mIG9ic2VydmVyICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIHRoZSBvYnNlcnZlciB0byBiZSBhbiBvYmplY3QuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvYnNlcnZlU3RhdGUoKSB7XG4gICAgICAgICAgaWYgKG9ic2VydmVyLm5leHQpIHtcbiAgICAgICAgICAgIG9ic2VydmVyLm5leHQoZ2V0U3RhdGUoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgb2JzZXJ2ZVN0YXRlKCk7XG4gICAgICAgIHZhciB1bnN1YnNjcmliZSA9IG91dGVyU3Vic2NyaWJlKG9ic2VydmVTdGF0ZSk7XG4gICAgICAgIHJldHVybiB7IHVuc3Vic2NyaWJlOiB1bnN1YnNjcmliZSB9O1xuICAgICAgfVxuICAgIH0sIF9yZWZbJCRvYnNlcnZhYmxlXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sIF9yZWY7XG4gIH1cblxuICAvLyBXaGVuIGEgc3RvcmUgaXMgY3JlYXRlZCwgYW4gXCJJTklUXCIgYWN0aW9uIGlzIGRpc3BhdGNoZWQgc28gdGhhdCBldmVyeVxuICAvLyByZWR1Y2VyIHJldHVybnMgdGhlaXIgaW5pdGlhbCBzdGF0ZS4gVGhpcyBlZmZlY3RpdmVseSBwb3B1bGF0ZXNcbiAgLy8gdGhlIGluaXRpYWwgc3RhdGUgdHJlZS5cbiAgZGlzcGF0Y2goeyB0eXBlOiBBY3Rpb25UeXBlcy5JTklUIH0pO1xuXG4gIHJldHVybiBfcmVmMiA9IHtcbiAgICBkaXNwYXRjaDogZGlzcGF0Y2gsXG4gICAgc3Vic2NyaWJlOiBzdWJzY3JpYmUsXG4gICAgZ2V0U3RhdGU6IGdldFN0YXRlLFxuICAgIHJlcGxhY2VSZWR1Y2VyOiByZXBsYWNlUmVkdWNlclxuICB9LCBfcmVmMlskJG9ic2VydmFibGVdID0gb2JzZXJ2YWJsZSwgX3JlZjI7XG59IiwiLyoqXG4gKiBQcmludHMgYSB3YXJuaW5nIGluIHRoZSBjb25zb2xlIGlmIGl0IGV4aXN0cy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBUaGUgd2FybmluZyBtZXNzYWdlLlxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHdhcm5pbmcobWVzc2FnZSkge1xuICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGNvbnNvbGUuZXJyb3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICBjb25zb2xlLmVycm9yKG1lc3NhZ2UpO1xuICB9XG4gIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICB0cnkge1xuICAgIC8vIFRoaXMgZXJyb3Igd2FzIHRocm93biBhcyBhIGNvbnZlbmllbmNlIHNvIHRoYXQgaWYgeW91IGVuYWJsZVxuICAgIC8vIFwiYnJlYWsgb24gYWxsIGV4Y2VwdGlvbnNcIiBpbiB5b3VyIGNvbnNvbGUsXG4gICAgLy8gaXQgd291bGQgcGF1c2UgdGhlIGV4ZWN1dGlvbiBhdCB0aGlzIGxpbmUuXG4gICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWVtcHR5ICovXG4gIH0gY2F0Y2ggKGUpIHt9XG4gIC8qIGVzbGludC1lbmFibGUgbm8tZW1wdHkgKi9cbn0iLCIvKipcbiAqIENvbXBvc2VzIHNpbmdsZS1hcmd1bWVudCBmdW5jdGlvbnMgZnJvbSByaWdodCB0byBsZWZ0LiBUaGUgcmlnaHRtb3N0XG4gKiBmdW5jdGlvbiBjYW4gdGFrZSBtdWx0aXBsZSBhcmd1bWVudHMgYXMgaXQgcHJvdmlkZXMgdGhlIHNpZ25hdHVyZSBmb3JcbiAqIHRoZSByZXN1bHRpbmcgY29tcG9zaXRlIGZ1bmN0aW9uLlxuICpcbiAqIEBwYXJhbSB7Li4uRnVuY3Rpb259IGZ1bmNzIFRoZSBmdW5jdGlvbnMgdG8gY29tcG9zZS5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gQSBmdW5jdGlvbiBvYnRhaW5lZCBieSBjb21wb3NpbmcgdGhlIGFyZ3VtZW50IGZ1bmN0aW9uc1xuICogZnJvbSByaWdodCB0byBsZWZ0LiBGb3IgZXhhbXBsZSwgY29tcG9zZShmLCBnLCBoKSBpcyBpZGVudGljYWwgdG8gZG9pbmdcbiAqICguLi5hcmdzKSA9PiBmKGcoaCguLi5hcmdzKSkpLlxuICovXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbXBvc2UoKSB7XG4gIGZvciAodmFyIF9sZW4gPSBhcmd1bWVudHMubGVuZ3RoLCBmdW5jcyA9IEFycmF5KF9sZW4pLCBfa2V5ID0gMDsgX2tleSA8IF9sZW47IF9rZXkrKykge1xuICAgIGZ1bmNzW19rZXldID0gYXJndW1lbnRzW19rZXldO1xuICB9XG5cbiAgaWYgKGZ1bmNzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoYXJnKSB7XG4gICAgICByZXR1cm4gYXJnO1xuICAgIH07XG4gIH1cblxuICBpZiAoZnVuY3MubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZ1bmNzWzBdO1xuICB9XG5cbiAgdmFyIGxhc3QgPSBmdW5jc1tmdW5jcy5sZW5ndGggLSAxXTtcbiAgdmFyIHJlc3QgPSBmdW5jcy5zbGljZSgwLCAtMSk7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHJlc3QucmVkdWNlUmlnaHQoZnVuY3Rpb24gKGNvbXBvc2VkLCBmKSB7XG4gICAgICByZXR1cm4gZihjb21wb3NlZCk7XG4gICAgfSwgbGFzdC5hcHBseSh1bmRlZmluZWQsIGFyZ3VtZW50cykpO1xuICB9O1xufSIsInZhciBfZXh0ZW5kcyA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gKHRhcmdldCkgeyBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykgeyB2YXIgc291cmNlID0gYXJndW1lbnRzW2ldOyBmb3IgKHZhciBrZXkgaW4gc291cmNlKSB7IGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc291cmNlLCBrZXkpKSB7IHRhcmdldFtrZXldID0gc291cmNlW2tleV07IH0gfSB9IHJldHVybiB0YXJnZXQ7IH07XG5cbmltcG9ydCBjb21wb3NlIGZyb20gJy4vY29tcG9zZSc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0b3JlIGVuaGFuY2VyIHRoYXQgYXBwbGllcyBtaWRkbGV3YXJlIHRvIHRoZSBkaXNwYXRjaCBtZXRob2RcbiAqIG9mIHRoZSBSZWR1eCBzdG9yZS4gVGhpcyBpcyBoYW5keSBmb3IgYSB2YXJpZXR5IG9mIHRhc2tzLCBzdWNoIGFzIGV4cHJlc3NpbmdcbiAqIGFzeW5jaHJvbm91cyBhY3Rpb25zIGluIGEgY29uY2lzZSBtYW5uZXIsIG9yIGxvZ2dpbmcgZXZlcnkgYWN0aW9uIHBheWxvYWQuXG4gKlxuICogU2VlIGByZWR1eC10aHVua2AgcGFja2FnZSBhcyBhbiBleGFtcGxlIG9mIHRoZSBSZWR1eCBtaWRkbGV3YXJlLlxuICpcbiAqIEJlY2F1c2UgbWlkZGxld2FyZSBpcyBwb3RlbnRpYWxseSBhc3luY2hyb25vdXMsIHRoaXMgc2hvdWxkIGJlIHRoZSBmaXJzdFxuICogc3RvcmUgZW5oYW5jZXIgaW4gdGhlIGNvbXBvc2l0aW9uIGNoYWluLlxuICpcbiAqIE5vdGUgdGhhdCBlYWNoIG1pZGRsZXdhcmUgd2lsbCBiZSBnaXZlbiB0aGUgYGRpc3BhdGNoYCBhbmQgYGdldFN0YXRlYCBmdW5jdGlvbnNcbiAqIGFzIG5hbWVkIGFyZ3VtZW50cy5cbiAqXG4gKiBAcGFyYW0gey4uLkZ1bmN0aW9ufSBtaWRkbGV3YXJlcyBUaGUgbWlkZGxld2FyZSBjaGFpbiB0byBiZSBhcHBsaWVkLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBBIHN0b3JlIGVuaGFuY2VyIGFwcGx5aW5nIHRoZSBtaWRkbGV3YXJlLlxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBhcHBseU1pZGRsZXdhcmUoKSB7XG4gIGZvciAodmFyIF9sZW4gPSBhcmd1bWVudHMubGVuZ3RoLCBtaWRkbGV3YXJlcyA9IEFycmF5KF9sZW4pLCBfa2V5ID0gMDsgX2tleSA8IF9sZW47IF9rZXkrKykge1xuICAgIG1pZGRsZXdhcmVzW19rZXldID0gYXJndW1lbnRzW19rZXldO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIChjcmVhdGVTdG9yZSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAocmVkdWNlciwgcHJlbG9hZGVkU3RhdGUsIGVuaGFuY2VyKSB7XG4gICAgICB2YXIgc3RvcmUgPSBjcmVhdGVTdG9yZShyZWR1Y2VyLCBwcmVsb2FkZWRTdGF0ZSwgZW5oYW5jZXIpO1xuICAgICAgdmFyIF9kaXNwYXRjaCA9IHN0b3JlLmRpc3BhdGNoO1xuICAgICAgdmFyIGNoYWluID0gW107XG5cbiAgICAgIHZhciBtaWRkbGV3YXJlQVBJID0ge1xuICAgICAgICBnZXRTdGF0ZTogc3RvcmUuZ2V0U3RhdGUsXG4gICAgICAgIGRpc3BhdGNoOiBmdW5jdGlvbiBkaXNwYXRjaChhY3Rpb24pIHtcbiAgICAgICAgICByZXR1cm4gX2Rpc3BhdGNoKGFjdGlvbik7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjaGFpbiA9IG1pZGRsZXdhcmVzLm1hcChmdW5jdGlvbiAobWlkZGxld2FyZSkge1xuICAgICAgICByZXR1cm4gbWlkZGxld2FyZShtaWRkbGV3YXJlQVBJKTtcbiAgICAgIH0pO1xuICAgICAgX2Rpc3BhdGNoID0gY29tcG9zZS5hcHBseSh1bmRlZmluZWQsIGNoYWluKShzdG9yZS5kaXNwYXRjaCk7XG5cbiAgICAgIHJldHVybiBfZXh0ZW5kcyh7fSwgc3RvcmUsIHtcbiAgICAgICAgZGlzcGF0Y2g6IF9kaXNwYXRjaFxuICAgICAgfSk7XG4gICAgfTtcbiAgfTtcbn0iLCJpbXBvcnQgY3JlYXRlU3RvcmUgZnJvbSAnLi9jcmVhdGVTdG9yZSc7XG5pbXBvcnQgY29tYmluZVJlZHVjZXJzIGZyb20gJy4vY29tYmluZVJlZHVjZXJzJztcbmltcG9ydCBiaW5kQWN0aW9uQ3JlYXRvcnMgZnJvbSAnLi9iaW5kQWN0aW9uQ3JlYXRvcnMnO1xuaW1wb3J0IGFwcGx5TWlkZGxld2FyZSBmcm9tICcuL2FwcGx5TWlkZGxld2FyZSc7XG5pbXBvcnQgY29tcG9zZSBmcm9tICcuL2NvbXBvc2UnO1xuaW1wb3J0IHdhcm5pbmcgZnJvbSAnLi91dGlscy93YXJuaW5nJztcblxuLypcbiogVGhpcyBpcyBhIGR1bW15IGZ1bmN0aW9uIHRvIGNoZWNrIGlmIHRoZSBmdW5jdGlvbiBuYW1lIGhhcyBiZWVuIGFsdGVyZWQgYnkgbWluaWZpY2F0aW9uLlxuKiBJZiB0aGUgZnVuY3Rpb24gaGFzIGJlZW4gbWluaWZpZWQgYW5kIE5PREVfRU5WICE9PSAncHJvZHVjdGlvbicsIHdhcm4gdGhlIHVzZXIuXG4qL1xuZnVuY3Rpb24gaXNDcnVzaGVkKCkge31cblxuaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicgJiYgdHlwZW9mIGlzQ3J1c2hlZC5uYW1lID09PSAnc3RyaW5nJyAmJiBpc0NydXNoZWQubmFtZSAhPT0gJ2lzQ3J1c2hlZCcpIHtcbiAgd2FybmluZygnWW91IGFyZSBjdXJyZW50bHkgdXNpbmcgbWluaWZpZWQgY29kZSBvdXRzaWRlIG9mIE5PREVfRU5WID09PSBcXCdwcm9kdWN0aW9uXFwnLiAnICsgJ1RoaXMgbWVhbnMgdGhhdCB5b3UgYXJlIHJ1bm5pbmcgYSBzbG93ZXIgZGV2ZWxvcG1lbnQgYnVpbGQgb2YgUmVkdXguICcgKyAnWW91IGNhbiB1c2UgbG9vc2UtZW52aWZ5IChodHRwczovL2dpdGh1Yi5jb20vemVydG9zaC9sb29zZS1lbnZpZnkpIGZvciBicm93c2VyaWZ5ICcgKyAnb3IgRGVmaW5lUGx1Z2luIGZvciB3ZWJwYWNrIChodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzMwMDMwMDMxKSAnICsgJ3RvIGVuc3VyZSB5b3UgaGF2ZSB0aGUgY29ycmVjdCBjb2RlIGZvciB5b3VyIHByb2R1Y3Rpb24gYnVpbGQuJyk7XG59XG5cbmV4cG9ydCB7IGNyZWF0ZVN0b3JlLCBjb21iaW5lUmVkdWNlcnMsIGJpbmRBY3Rpb25DcmVhdG9ycywgYXBwbHlNaWRkbGV3YXJlLCBjb21wb3NlIH07IiwiZXhwb3J0IGNvbnN0IHZhbHVlc0Zyb21EZWYgPSAocm93cywgY29sdW1ucykgPT4gKHt4ID0gMSwgeSA9IDEsIGR4ID0gMSwgZHkgPSAxfT17fSkgPT4ge1xuICBjb25zdCB2YWx1ZXMgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3dzICogY29sdW1uczsgaSsrKSB7XG4gICAgY29uc3QgciA9IE1hdGguZmxvb3IoaSAvIHJvd3MpICsgMTtcbiAgICBjb25zdCBjID0gaSAlIGNvbHVtbnMgKyAxO1xuICAgIHZhbHVlcy5wdXNoKHIgPj0geSAmJiByIDwgeSArIGR5ICYmIGMgPj0geCAmJiBjIDwgeCArIGR4ID8gMSA6IDApO1xuICB9XG4gIHJldHVybiB2YWx1ZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZGVmRnJvbUluZGV4ID0gKHJvd3MsIGNvbHVtbnMpID0+IChpKSA9PiB7XG4gIGNvbnN0IHggPSBpICUgY29sdW1ucyArIDE7XG4gIGNvbnN0IHkgPSBNYXRoLmZsb29yKGkgLyByb3dzKSArIDE7XG4gIHJldHVybiB7eCwgeX07XG59O1xuXG5leHBvcnQgY29uc3QgaW5kZXhGcm9tRGVmID0gKHJvd3MsIGNvbHVtbnMpID0+ICh4LCB5KSA9PiAoeSAtIDEpICogcm93cyArIHggLSAxO1xuXG5leHBvcnQgY29uc3QgQXJlYUZhY3RvcnkgPSAocm93cywgY29sdW1ucykgPT4ge1xuICBjb25zdCBpVG9EZWYgPSBkZWZGcm9tSW5kZXgocm93cywgY29sdW1ucyk7XG4gIGNvbnN0IGRlZlRvSSA9IGluZGV4RnJvbURlZihyb3dzLCBjb2x1bW5zKTtcblxuICBjb25zdCBmYWN0b3J5ID0gdmFsdWVzID0+IE9iamVjdC5jcmVhdGUoUHJvdG8sIHtcbiAgICB2YWx1ZXM6IHt2YWx1ZTogWy4uLnZhbHVlc119LCBsZW5ndGg6IHtcbiAgICAgIGdldCgpe1xuICAgICAgICByZXR1cm4gdmFsdWVzLmZpbHRlcih2ID0+IHYgPT09IDEpLmxlbmd0aFxuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgY29uc3QgUHJvdG8gPSB7XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKXtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHRoaXMudmFsdWVzO1xuICAgICAgcmV0dXJuIChmdW5jdGlvbiAqICgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAodmFsdWVzW2ldID09PSAxKSB7XG4gICAgICAgICAgICB5aWVsZCBpVG9EZWYoaSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgIH0sXG4gICAgaW50ZXJzZWN0aW9uKGFyZWEpe1xuICAgICAgcmV0dXJuIGZhY3RvcnkodGhpcy52YWx1ZXMubWFwKCh2LCBpKSA9PiB2ICogYXJlYS52YWx1ZXNbaV0pKTtcbiAgICB9LFxuICAgIGluY2x1ZGVzKGFyZWEpe1xuICAgICAgY29uc3QgaXNPbmUgPSB2ID0+IHYgPT09IDE7XG4gICAgICByZXR1cm4gdGhpcy5pbnRlcnNlY3Rpb24oYXJlYSkudmFsdWVzLmZpbHRlcihpc09uZSkubGVuZ3RoID09PSBhcmVhLnZhbHVlcy5maWx0ZXIoaXNPbmUpLmxlbmd0aDtcbiAgICB9LFxuICAgIGlzSW5jbHVkZWQoYXJlYSl7XG4gICAgICByZXR1cm4gYXJlYS5pbmNsdWRlcyh0aGlzKTtcbiAgICB9LFxuICAgIHVuaW9uKGFyZWEpe1xuICAgICAgcmV0dXJuIGZhY3RvcnkodGhpcy52YWx1ZXMubWFwKCh2LCBpKSA9PiB2ICsgYXJlYS52YWx1ZXNbaV0gPiAwID8gMSA6IDApKTtcbiAgICB9LFxuICAgIGNvbXBsZW1lbnQoKXtcbiAgICAgIHJldHVybiBmYWN0b3J5KHRoaXMudmFsdWVzLm1hcCh2ID0+IDEgLSB2KSk7XG4gICAgfSxcbiAgICBkZWJ1Zygpe1xuICAgICAgbGV0IHByaW50ID0gJyc7XG4gICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSByb3dzOyBpKyspIHtcbiAgICAgICAgbGV0IGxpbmUgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaiA9IDE7IGogPD0gY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgY29uc3QgaW5kZXhGcm9tRGVmMiA9IGRlZlRvSShqLCBpKTtcbiAgICAgICAgICBsaW5lLnB1c2godGhpcy52YWx1ZXNbaW5kZXhGcm9tRGVmMl0pO1xuICAgICAgICB9XG4gICAgICAgIHByaW50ICs9IGBcbiR7bGluZS5qb2luKCcgJyl9XG5gXG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhwcmludCk7XG4gICAgfVxuICB9O1xuICByZXR1cm4gZmFjdG9yeTtcbn07XG5cbmV4cG9ydCBjb25zdCBHcmlkID0gKHtwYW5lbHNEYXRhID0gW10sIHJvd3MgPSA0LCBjb2x1bW5zID0gNH0gPXt9KSA9PiB7XG4gIGNvbnN0IGlUb0RlZiA9IGRlZkZyb21JbmRleChyb3dzLCBjb2x1bW5zKTtcbiAgY29uc3QgYXJlYSA9IEFyZWFGYWN0b3J5KHJvd3MsIGNvbHVtbnMpO1xuICBjb25zdCB0b1ZhbHVlcyA9IHZhbHVlc0Zyb21EZWYocm93cywgY29sdW1ucyk7XG4gIGxldCBwYW5lbHMgPSBbLi4ucGFuZWxzRGF0YV07XG4gIGlmIChyb3dzICogY29sdW1ucy5sZW5ndGggIT09IHBhbmVsc0RhdGEubGVuZ3RoKSB7XG4gICAgcGFuZWxzID0gKG5ldyBBcnJheShyb3dzICogY29sdW1ucykpLmZpbGwoMCkubWFwKChfLCBpbmRleCkgPT4gT2JqZWN0LmFzc2lnbihpVG9EZWYoaW5kZXgpLCB7XG4gICAgICBkeDogMSxcbiAgICAgIGR5OiAxLFxuICAgICAgYWRvcm5lclN0YXR1czogMCxcbiAgICAgIGRhdGE6IHt9XG4gICAgfSkpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpe1xuICAgICAgcmV0dXJuIChmdW5jdGlvbiAqICgpIHtcbiAgICAgICAgZm9yIChsZXQgcCBvZiBwYW5lbHMpIHtcbiAgICAgICAgICB5aWVsZCBPYmplY3QuYXNzaWduKHt9LCBwKTtcbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICB9LFxuICAgIHVwZGF0ZUF0KHgsIHksIGRhdGEpe1xuICAgICAgY29uc3QgcCA9IHBhbmVscy5maW5kKHAgPT4gcC54ID09PSB4ICYmIHAueSA9PT0geSk7XG4gICAgICBPYmplY3QuYXNzaWduKHAsIGRhdGEpO1xuICAgICAgcmV0dXJuIHA7XG4gICAgfSxcbiAgICBwYW5lbCh4LCB5KXtcbiAgICAgIHJldHVybiBhcmVhKHRvVmFsdWVzKHBhbmVscy5maW5kKHAgPT4gcC54ID09PSB4ICYmIHAueSA9PT0geSkpKTtcbiAgICB9LFxuICAgIGFyZWEoeCwgeSwgZHggPSAxLCBkeSA9IDEpe1xuICAgICAgcmV0dXJuIGFyZWEodG9WYWx1ZXMoe3gsIHksIGR4LCBkeX0pKTtcbiAgICB9LFxuICAgIGdldERhdGEoeCwgeSl7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSxwYW5lbHMuZmluZChwID0+IHAueCA9PT0geCAmJiBwLnkgPT09IHkpIHx8IHt9KTtcbiAgICB9XG4gIH07XG59OyIsImltcG9ydCB7R3JpZH0gZnJvbSAnLi4vbGliL2dyaWQnO1xuaW1wb3J0IHtST1dTLCBDT0xVTU5TfSBmcm9tICcuLi9saWIvY29uc3RhbnRzJztcblxuZXhwb3J0IGRlZmF1bHQgR3JpZCh7cm93czogUk9XUywgY29sdW1uczogQ09MVU1OU30pO1xuIiwiaW1wb3J0IHtHcmlkfSBmcm9tICcuLi9saWIvZ3JpZCc7XG5cbmV4cG9ydCBkZWZhdWx0IChncmlkID0gR3JpZCgpKSA9PiAoc3RhdGUgPSB7YWN0aXZlOiBudWxsLCBwYW5lbHM6IFsuLi5ncmlkXX0sIGFjdGlvbikgPT4ge1xuXG4gIGNvbnN0IHJlc2l6ZU92ZXIgPSAoc3RhdGUsIGFjdGlvbikgPT4ge1xuICAgIGNvbnN0IHt4LCB5fSA9YWN0aW9uO1xuICAgIGNvbnN0IHthY3RpdmV9ID0gc3RhdGU7XG4gICAgY29uc3Qge3g6c3RhcnRYLCB5OnN0YXJ0WX0gPSBhY3RpdmU7XG4gICAgaWYgKHggPj0gc3RhcnRYICYmIHkgPj0gc3RhcnRZKSB7XG4gICAgICBjb25zdCBkeCA9IHggLSBzdGFydFggKyAxO1xuICAgICAgY29uc3QgZHkgPSB5IC0gc3RhcnRZICsgMTtcbiAgICAgIGNvbnN0IGFjdGl2ZUFyZWEgPSBncmlkLmFyZWEoc3RhcnRYLCBzdGFydFksIGR4LCBkeSk7XG4gICAgICBjb25zdCBpbmFjdGl2ZUFyZWEgPSBhY3RpdmVBcmVhLmNvbXBsZW1lbnQoKTtcbiAgICAgIGNvbnN0IGFsbEJ1dFN0YXJ0ID0gZ3JpZC5hcmVhKHN0YXJ0WCwgc3RhcnRZKS5jb21wbGVtZW50KCk7XG4gICAgICBjb25zdCBpbnZhbGlkQ2VsbHNBcmVhID0gWy4uLmFsbEJ1dFN0YXJ0XVxuICAgICAgICAubWFwKHAgPT4gZ3JpZC5wYW5lbChwLngsIHAueSkpXG4gICAgICAgIC5maWx0ZXIocCA9PiB7XG4gICAgICAgICAgY29uc3QgaW50ZXJzZWN0aW9uID0gcC5pbnRlcnNlY3Rpb24oYWN0aXZlQXJlYSk7XG4gICAgICAgICAgcmV0dXJuIGludGVyc2VjdGlvbi5sZW5ndGggPiAwICYmIGFjdGl2ZUFyZWEuaW5jbHVkZXMocCkgPT09IGZhbHNlO1xuICAgICAgICB9KVxuICAgICAgICAucmVkdWNlKChhY2MsIGN1cnJlbnQpID0+IGFjYy51bmlvbihjdXJyZW50KSwgZ3JpZC5hcmVhKDEsIDEsIDAsIDApKTtcblxuICAgICAgZm9yIChsZXQge3gsIHl9IG9mIGluYWN0aXZlQXJlYSkge1xuICAgICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAwfSk7XG4gICAgICB9XG5cbiAgICAgIGZvciAobGV0IHt4LCB5fSBvZiBhY3RpdmVBcmVhKSB7XG4gICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IDF9KTtcbiAgICAgIH1cblxuICAgICAgZm9yIChsZXQge3gsIHl9IG9mIGludmFsaWRDZWxsc0FyZWEpIHtcbiAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogLTF9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICAgIGFjdGl2ZTogT2JqZWN0LmFzc2lnbih7fSwgYWN0aXZlLCB7dmFsaWQ6IGludmFsaWRDZWxsc0FyZWEubGVuZ3RoID09PSAwfSksXG4gICAgICAgIHBhbmVsczogWy4uLmdyaWRdXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oc3RhdGUsIHthY3RpdmU6IE9iamVjdC5hc3NpZ24oe30uYWN0aXZlLCB7dmFsaWQ6IGZhbHNlfSl9KTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgbW92ZU92ZXIgPSAoc3RhdGUsIGFjdGlvbikgPT4ge1xuICAgIGNvbnN0IHt4LCB5fSA9YWN0aW9uO1xuICAgIGNvbnN0IHthY3RpdmV9ID0gc3RhdGU7XG4gICAgY29uc3Qge3g6c3RhcnRYLCB5OnN0YXJ0WX0gPSBhY3RpdmU7XG5cbiAgICBjb25zdCB7ZHgsIGR5fSA9IGdyaWQuZ2V0RGF0YShzdGFydFgsIHN0YXJ0WSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFBhbmVsID0gZ3JpZC5wYW5lbChzdGFydFgsIHN0YXJ0WSk7XG4gICAgY29uc3QgZXhwZWN0ZWRBcmVhID0gZ3JpZC5hcmVhKHgsIHksIGR4LCBkeSk7XG4gICAgY29uc3QgYWN0aXZlQXJlYSA9IG9yaWdpbmFsUGFuZWwudW5pb24oZXhwZWN0ZWRBcmVhKTtcbiAgICBsZXQgaW52YWxpZEFyZWE7XG5cbiAgICBpZiAoZXhwZWN0ZWRBcmVhLmxlbmd0aCA8IG9yaWdpbmFsUGFuZWwubGVuZ3RoKSB7XG4gICAgICBpbnZhbGlkQXJlYSA9IGFjdGl2ZUFyZWE7XG4gICAgfSBlbHNlIHtcbiAgICAgIGludmFsaWRBcmVhID0gWy4uLm9yaWdpbmFsUGFuZWwuY29tcGxlbWVudCgpXVxuICAgICAgICAubWFwKGEgPT4gZ3JpZC5wYW5lbChhLngsIGEueSkpXG4gICAgICAgIC5maWx0ZXIocCA9PiB7XG4gICAgICAgICAgY29uc3QgaW50ZXJzZWN0aW9uID0gcC5pbnRlcnNlY3Rpb24oZXhwZWN0ZWRBcmVhKTtcbiAgICAgICAgICByZXR1cm4gaW50ZXJzZWN0aW9uLmxlbmd0aCA+IDAgJiYgZXhwZWN0ZWRBcmVhLmluY2x1ZGVzKHApID09PSBmYWxzZTtcbiAgICAgICAgfSlcbiAgICAgICAgLnJlZHVjZSgoYWNjLCBjdXJyZW50KSA9PiBhY2MudW5pb24oY3VycmVudCksIGdyaWQuYXJlYSgxLCAxLCAwLCAwKSk7XG4gICAgfVxuXG4gICAgY29uc3QgaW5hY3RpdmVBcmVhID0gYWN0aXZlQXJlYS5jb21wbGVtZW50KCk7XG5cbiAgICBmb3IgKGxldCB7eCwgeX0gb2YgaW5hY3RpdmVBcmVhKSB7XG4gICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHthZG9ybmVyU3RhdHVzOiAwfSk7XG4gICAgfVxuXG4gICAgZm9yIChsZXQge3gsIHl9IG9mIGFjdGl2ZUFyZWEpIHtcbiAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IDF9KTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCB7eCwgeX0gb2YgaW52YWxpZEFyZWEpIHtcbiAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IC0xfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICBwYW5lbHM6IFsuLi5ncmlkXSxcbiAgICAgIGFjdGl2ZTogT2JqZWN0LmFzc2lnbih7fSwgYWN0aXZlLCB7dmFsaWQ6IGludmFsaWRBcmVhLmxlbmd0aCA9PT0gMH0pXG4gICAgfSk7XG4gIH07XG5cbiAgc3dpdGNoIChhY3Rpb24udHlwZSkge1xuICAgIGNhc2UgJ1NUQVJUX1JFU0laRSc6IHtcbiAgICAgIGNvbnN0IHt4LCB5fT1hY3Rpb247XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHthY3RpdmU6IHt4LCB5LCBvcGVyYXRpb246ICdyZXNpemUnfX0pO1xuICAgIH1cbiAgICBjYXNlICdTVEFSVF9NT1ZFJzoge1xuICAgICAgY29uc3Qge3gsIHl9PWFjdGlvbjtcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge2FjdGl2ZToge3gsIHksIG9wZXJhdGlvbjogJ21vdmUnfX0pO1xuICAgIH1cbiAgICBjYXNlICdEUkFHX09WRVInOiB7XG4gICAgICBjb25zdCB7YWN0aXZlID0ge319ID0gc3RhdGU7XG4gICAgICBpZiAoIWFjdGl2ZS5vcGVyYXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGFjdGl2ZS5vcGVyYXRpb24gPT09ICdtb3ZlJyA/IG1vdmVPdmVyKHN0YXRlLCBhY3Rpb24pIDogcmVzaXplT3ZlcihzdGF0ZSwgYWN0aW9uKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY2FzZSAnRU5EX1JFU0laRSc6IHtcbiAgICAgIGNvbnN0IHt4LCB5LCBzdGFydFgsIHN0YXJ0WX0gPWFjdGlvbjtcbiAgICAgIGNvbnN0IGR4ID0geCAtIHN0YXJ0WCArIDE7XG4gICAgICBjb25zdCBkeSA9IHkgLSBzdGFydFkgKyAxO1xuICAgICAgY29uc3Qge2FjdGl2ZX0gPXN0YXRlO1xuICAgICAgaWYgKGFjdGl2ZS52YWxpZCA9PT0gdHJ1ZSkge1xuICAgICAgICBjb25zdCBhY3RpdmVBcmVhID0gZ3JpZC5hcmVhKHN0YXJ0WCwgc3RhcnRZLCBkeCwgZHkpO1xuICAgICAgICBjb25zdCBbYmFzZUNlbGwsIC4uLm90aGVyQ2VsbHNdID0gYWN0aXZlQXJlYTtcbiAgICAgICAgZ3JpZC51cGRhdGVBdChzdGFydFgsIHN0YXJ0WSwge2R4LCBkeX0pO1xuICAgICAgICBmb3IgKGNvbnN0IHt4LCB5fSBvZiBvdGhlckNlbGxzKSB7XG4gICAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7ZHg6IDEsIGR5OiAxfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGZvciAobGV0IHt4LCB5fSBvZiBbLi4uZ3JpZF0pIHtcbiAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCB7YWRvcm5lclN0YXR1czogMH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtcbiAgICAgICAgcGFuZWxzOiBbLi4uZ3JpZF0sXG4gICAgICAgIGFjdGl2ZTogbnVsbFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNhc2UgJ0VORF9NT1ZFJzoge1xuICAgICAgY29uc3Qge3gsIHksIHN0YXJ0WCwgc3RhcnRZfSA9YWN0aW9uO1xuICAgICAgY29uc3QgZGVsdGFYID0gc3RhcnRYIC0geDtcbiAgICAgIGNvbnN0IGRlbHRhWSA9IHN0YXJ0WSAtIHk7XG4gICAgICBjb25zdCB7YWN0aXZlfSA9c3RhdGU7XG4gICAgICBpZiAoYWN0aXZlLnZhbGlkID09PSB0cnVlKSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0RGF0YSA9IGdyaWQuZ2V0RGF0YShzdGFydFgsIHN0YXJ0WSk7XG4gICAgICAgIGNvbnN0IHtkeCwgZHl9ID1zdGFydERhdGE7XG4gICAgICAgIGNvbnN0IGNsYWltZWRBcmVhID0gZ3JpZC5hcmVhKHgsIHksIGR4LCBkeSk7XG4gICAgICAgIGZvciAoe3g6IGN4LCB5OiBjeX0gb2YgY2xhaW1lZEFyZWEpIHtcbiAgICAgICAgICBjb25zdCBuZXdYID0gY3ggKyBkZWx0YVg7XG4gICAgICAgICAgY29uc3QgbmV3WSA9IGN5ICsgZGVsdGFZO1xuICAgICAgICAgIGNvbnN0IG5ld0RhdGEgPSBPYmplY3QuYXNzaWduKGdyaWQuZ2V0RGF0YShjeCwgY3kpLCB7eDogbmV3WCwgeTogbmV3WX0pO1xuICAgICAgICAgIGdyaWQudXBkYXRlQXQobmV3WCwgbmV3WSwgbmV3RGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgZ3JpZC51cGRhdGVBdCh4LCB5LCBPYmplY3QuYXNzaWduKHN0YXJ0RGF0YSwge3gsIHl9KSk7XG4gICAgICB9XG4gICAgICBmb3IgKGxldCB7eCwgeX0gb2YgWy4uLmdyaWRdKSB7XG4gICAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2Fkb3JuZXJTdGF0dXM6IDB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICAgIHBhbmVsczogWy4uLmdyaWRdLFxuICAgICAgICBhY3RpdmU6IG51bGxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjYXNlICdVUERBVEVfUEFORUxfREFUQSc6IHtcbiAgICAgIC8vdG9kbyByZW1vdmUgZGF0YUNvbmYgb2YgaGlkZGVuIHBhbmVscyA/XG4gICAgICBjb25zdCB7eCwgeSwgZGF0YX0gPSBhY3Rpb247XG4gICAgICBncmlkLnVwZGF0ZUF0KHgsIHksIHtkYXRhfSk7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtwYW5lbHM6IFsuLi5ncmlkXX0pO1xuICAgIH1cbiAgICBjYXNlICdSRVNFVF9QQU5FTCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5fSA9IGFjdGlvbjtcbiAgICAgIGdyaWQudXBkYXRlQXQoeCwgeSwge2RhdGE6IHt9fSk7XG5cbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge3BhbmVsczogWy4uLmdyaWRdfSk7XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3RhdGU7XG4gIH1cbn07XG5cbiIsImV4cG9ydCBkZWZhdWx0IChncmlkKSA9PiAoc3RhdGUgPSB7aXNPcGVuOiBmYWxzZX0sIGFjdGlvbikgPT4ge1xuICBjb25zdCB7dHlwZSwgdGl0bGUsIG1vZGFsVHlwZSwgeCwgeX0gPSBhY3Rpb247XG4gIGNvbnN0IG1vZGFsRGF0YSA9IE9iamVjdC5hc3NpZ24oe30sIGFjdGlvbik7XG4gIGRlbGV0ZSAgbW9kYWxEYXRhLnR5cGU7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ09QRU5fTU9EQUwnOiB7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIG1vZGFsRGF0YSwge2lzT3BlbjogdHJ1ZX0pO1xuICAgIH1cbiAgICBjYXNlICdDTE9TRV9NT0RBTCc6IHtcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwgbW9kYWxEYXRhLCB7aXNPcGVuOiBmYWxzZSwgdGl0bGU6ICcnLCBtb2RhbFR5cGU6ICdub25lJ30pO1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHN0YXRlO1xuICB9XG59OyIsImV4cG9ydCBkZWZhdWx0IChzdGF0ZSA9IFtdLCBhY3Rpb24pID0+IHtcbiAgY29uc3Qge3R5cGV9ID0gYWN0aW9uO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdDUkVBVEVfU01BUlRfTElTVCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5LCB0YWJsZVN0YXRlLCBpdGVtc30gPSBhY3Rpb247XG4gICAgICByZXR1cm4gc3RhdGUuY29uY2F0KHt4LCB5LCB0YWJsZVN0YXRlLCBpdGVtc30pO1xuICAgIH1cbiAgICBjYXNlICdVUERBVEVfU01BUlRfTElTVCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5LCB0YWJsZVN0YXRlLCBpdGVtc30gPSBhY3Rpb247XG4gICAgICByZXR1cm4gc3RhdGUubWFwKChzbCkgPT4ge1xuICAgICAgICBpZiAoc2wueCA9PT0geCAmJiBzbC55ID09PSB5KSB7XG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHNsLCB7dGFibGVTdGF0ZSwgaXRlbXN9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gc2w7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBjYXNlICdSRU1PVkVfU01BUlRfTElTVCc6IHtcbiAgICAgIGNvbnN0IHt4LCB5fSA9IGFjdGlvbjtcbiAgICAgIHJldHVybiBzdGF0ZS5maWx0ZXIoZiA9PiBmLnggIT09IHggfHwgZi55ICE9PSB5KTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgfVxufTsiLCJpbXBvcnQgZ3JpZFJlZHVjZXIgZnJvbSAnLi9ncmlkJztcbmltcG9ydCBtb2RhbFJlZHVjZXIgZnJvbSAnLi9tb2RhbCc7XG5pbXBvcnQgc21hcnRMaXN0UmVkdWNlciBmcm9tICcuL3NtYXJ0TGlzdCc7XG5cbmV4cG9ydCBkZWZhdWx0IChncmlkKSA9PiAoc3RhdGUgPSB7fSwgYWN0aW9uKSA9PiAoe1xuICBncmlkOiBncmlkUmVkdWNlcihncmlkKShzdGF0ZS5ncmlkLCBhY3Rpb24pLFxuICBtb2RhbDogbW9kYWxSZWR1Y2VyKGdyaWQpKHN0YXRlLm1vZGFsLCBhY3Rpb24pLFxuICBzbWFydExpc3Q6IHNtYXJ0TGlzdFJlZHVjZXIoc3RhdGUuc21hcnRMaXN0LCBhY3Rpb24pXG59KTtcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHBvaW50ZXIgKHBhdGgpIHtcblxuICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcblxuICBmdW5jdGlvbiBwYXJ0aWFsIChvYmogPSB7fSwgcGFydHMgPSBbXSkge1xuICAgIGNvbnN0IHAgPSBwYXJ0cy5zaGlmdCgpO1xuICAgIGNvbnN0IGN1cnJlbnQgPSBvYmpbcF07XG4gICAgcmV0dXJuIChjdXJyZW50ID09PSB1bmRlZmluZWQgfHwgcGFydHMubGVuZ3RoID09PSAwKSA/XG4gICAgICBjdXJyZW50IDogcGFydGlhbChjdXJyZW50LCBwYXJ0cyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXQgKHRhcmdldCwgbmV3VHJlZSkge1xuICAgIGxldCBjdXJyZW50ID0gdGFyZ2V0O1xuICAgIGNvbnN0IFtsZWFmLCAuLi5pbnRlcm1lZGlhdGVdID0gcGFydHMucmV2ZXJzZSgpO1xuICAgIGZvciAobGV0IGtleSBvZiBpbnRlcm1lZGlhdGUucmV2ZXJzZSgpKSB7XG4gICAgICBpZiAoY3VycmVudFtrZXldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY3VycmVudFtrZXldID0ge307XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50W2tleV07XG4gICAgICB9XG4gICAgfVxuICAgIGN1cnJlbnRbbGVhZl0gPSBPYmplY3QuYXNzaWduKGN1cnJlbnRbbGVhZl0gfHwge30sIG5ld1RyZWUpO1xuICAgIHJldHVybiB0YXJnZXQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdldCh0YXJnZXQpe1xuICAgICAgcmV0dXJuIHBhcnRpYWwodGFyZ2V0LCBbLi4ucGFydHNdKVxuICAgIH0sXG4gICAgc2V0XG4gIH1cbn07XG4iLCJpbXBvcnQge3N3YXB9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG5cbmZ1bmN0aW9uIHNvcnRCeVByb3BlcnR5IChwcm9wKSB7XG4gIGNvbnN0IHByb3BHZXR0ZXIgPSBwb2ludGVyKHByb3ApLmdldDtcbiAgcmV0dXJuIChhLCBiKSA9PiB7XG4gICAgY29uc3QgYVZhbCA9IHByb3BHZXR0ZXIoYSk7XG4gICAgY29uc3QgYlZhbCA9IHByb3BHZXR0ZXIoYik7XG5cbiAgICBpZiAoYVZhbCA9PT0gYlZhbCkge1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgaWYgKGJWYWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGlmIChhVmFsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIHJldHVybiBhVmFsIDwgYlZhbCA/IC0xIDogMTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBzb3J0RmFjdG9yeSAoe3BvaW50ZXIsIGRpcmVjdGlvbn0gPSB7fSkge1xuICBpZiAoIXBvaW50ZXIgfHwgZGlyZWN0aW9uID09PSAnbm9uZScpIHtcbiAgICByZXR1cm4gYXJyYXkgPT4gWy4uLmFycmF5XTtcbiAgfVxuXG4gIGNvbnN0IG9yZGVyRnVuYyA9IHNvcnRCeVByb3BlcnR5KHBvaW50ZXIpO1xuICBjb25zdCBjb21wYXJlRnVuYyA9IGRpcmVjdGlvbiA9PT0gJ2Rlc2MnID8gc3dhcChvcmRlckZ1bmMpIDogb3JkZXJGdW5jO1xuXG4gIHJldHVybiAoYXJyYXkpID0+IFsuLi5hcnJheV0uc29ydChjb21wYXJlRnVuYyk7XG59IiwiaW1wb3J0IHtjb21wb3NlfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHBvaW50ZXIgZnJvbSAnc21hcnQtdGFibGUtanNvbi1wb2ludGVyJztcblxuZnVuY3Rpb24gdHlwZUV4cHJlc3Npb24gKHR5cGUpIHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gQm9vbGVhbjtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIE51bWJlcjtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiAodmFsKSA9PiBuZXcgRGF0ZSh2YWwpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gY29tcG9zZShTdHJpbmcsICh2YWwpID0+IHZhbC50b0xvd2VyQ2FzZSgpKTtcbiAgfVxufVxuXG5jb25zdCBvcGVyYXRvcnMgPSB7XG4gIGluY2x1ZGVzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dC5pbmNsdWRlcyh2YWx1ZSk7XG4gIH0sXG4gIGlzKHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBPYmplY3QuaXModmFsdWUsIGlucHV0KTtcbiAgfSxcbiAgaXNOb3QodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+ICFPYmplY3QuaXModmFsdWUsIGlucHV0KTtcbiAgfSxcbiAgbHQodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0IDwgdmFsdWU7XG4gIH0sXG4gIGd0KHZhbHVlKXtcbiAgICByZXR1cm4gKGlucHV0KSA9PiBpbnB1dCA+IHZhbHVlO1xuICB9LFxuICBsdGUodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0IDw9IHZhbHVlO1xuICB9LFxuICBndGUodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0ID49IHZhbHVlO1xuICB9LFxuICBlcXVhbHModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IHZhbHVlID09IGlucHV0O1xuICB9LFxuICBub3RFcXVhbHModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IHZhbHVlICE9IGlucHV0O1xuICB9XG59O1xuXG5jb25zdCBldmVyeSA9IGZucyA9PiAoLi4uYXJncykgPT4gZm5zLmV2ZXJ5KGZuID0+IGZuKC4uLmFyZ3MpKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHByZWRpY2F0ZSAoe3ZhbHVlID0gJycsIG9wZXJhdG9yID0gJ2luY2x1ZGVzJywgdHlwZSA9ICdzdHJpbmcnfSkge1xuICBjb25zdCB0eXBlSXQgPSB0eXBlRXhwcmVzc2lvbih0eXBlKTtcbiAgY29uc3Qgb3BlcmF0ZU9uVHlwZWQgPSBjb21wb3NlKHR5cGVJdCwgb3BlcmF0b3JzW29wZXJhdG9yXSk7XG4gIGNvbnN0IHByZWRpY2F0ZUZ1bmMgPSBvcGVyYXRlT25UeXBlZCh2YWx1ZSk7XG4gIHJldHVybiBjb21wb3NlKHR5cGVJdCwgcHJlZGljYXRlRnVuYyk7XG59XG5cbi8vYXZvaWQgdXNlbGVzcyBmaWx0ZXIgbG9va3VwIChpbXByb3ZlIHBlcmYpXG5mdW5jdGlvbiBub3JtYWxpemVDbGF1c2VzIChjb25mKSB7XG4gIGNvbnN0IG91dHB1dCA9IHt9O1xuICBjb25zdCB2YWxpZFBhdGggPSBPYmplY3Qua2V5cyhjb25mKS5maWx0ZXIocGF0aCA9PiBBcnJheS5pc0FycmF5KGNvbmZbcGF0aF0pKTtcbiAgdmFsaWRQYXRoLmZvckVhY2gocGF0aCA9PiB7XG4gICAgY29uc3QgdmFsaWRDbGF1c2VzID0gY29uZltwYXRoXS5maWx0ZXIoYyA9PiBjLnZhbHVlICE9PSAnJyk7XG4gICAgaWYgKHZhbGlkQ2xhdXNlcy5sZW5ndGgpIHtcbiAgICAgIG91dHB1dFtwYXRoXSA9IHZhbGlkQ2xhdXNlcztcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBmaWx0ZXIgKGZpbHRlcikge1xuICBjb25zdCBub3JtYWxpemVkQ2xhdXNlcyA9IG5vcm1hbGl6ZUNsYXVzZXMoZmlsdGVyKTtcbiAgY29uc3QgZnVuY0xpc3QgPSBPYmplY3Qua2V5cyhub3JtYWxpemVkQ2xhdXNlcykubWFwKHBhdGggPT4ge1xuICAgIGNvbnN0IGdldHRlciA9IHBvaW50ZXIocGF0aCkuZ2V0O1xuICAgIGNvbnN0IGNsYXVzZXMgPSBub3JtYWxpemVkQ2xhdXNlc1twYXRoXS5tYXAocHJlZGljYXRlKTtcbiAgICByZXR1cm4gY29tcG9zZShnZXR0ZXIsIGV2ZXJ5KGNsYXVzZXMpKTtcbiAgfSk7XG4gIGNvbnN0IGZpbHRlclByZWRpY2F0ZSA9IGV2ZXJ5KGZ1bmNMaXN0KTtcblxuICByZXR1cm4gKGFycmF5KSA9PiBhcnJheS5maWx0ZXIoZmlsdGVyUHJlZGljYXRlKTtcbn0iLCJpbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoc2VhcmNoQ29uZiA9IHt9KSB7XG4gIGNvbnN0IHt2YWx1ZSwgc2NvcGUgPSBbXX0gPSBzZWFyY2hDb25mO1xuICBjb25zdCBzZWFyY2hQb2ludGVycyA9IHNjb3BlLm1hcChmaWVsZCA9PiBwb2ludGVyKGZpZWxkKS5nZXQpO1xuICBpZiAoIXNjb3BlLmxlbmd0aCB8fCAhdmFsdWUpIHtcbiAgICByZXR1cm4gYXJyYXkgPT4gYXJyYXk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGFycmF5ID0+IGFycmF5LmZpbHRlcihpdGVtID0+IHNlYXJjaFBvaW50ZXJzLnNvbWUocCA9PiBTdHJpbmcocChpdGVtKSkuaW5jbHVkZXMoU3RyaW5nKHZhbHVlKSkpKVxuICB9XG59IiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gc2xpY2VGYWN0b3J5ICh7cGFnZSA9IDEsIHNpemV9ID0ge30pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHNsaWNlRnVuY3Rpb24gKGFycmF5ID0gW10pIHtcbiAgICBjb25zdCBhY3R1YWxTaXplID0gc2l6ZSB8fCBhcnJheS5sZW5ndGg7XG4gICAgY29uc3Qgb2Zmc2V0ID0gKHBhZ2UgLSAxKSAqIGFjdHVhbFNpemU7XG4gICAgcmV0dXJuIGFycmF5LnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgYWN0dWFsU2l6ZSk7XG4gIH07XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gZW1pdHRlciAoKSB7XG5cbiAgY29uc3QgbGlzdGVuZXJzTGlzdHMgPSB7fTtcbiAgY29uc3QgaW5zdGFuY2UgPSB7XG4gICAgb24oZXZlbnQsIC4uLmxpc3RlbmVycyl7XG4gICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSAobGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdKS5jb25jYXQobGlzdGVuZXJzKTtcbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9LFxuICAgIGRpc3BhdGNoKGV2ZW50LCAuLi5hcmdzKXtcbiAgICAgIGNvbnN0IGxpc3RlbmVycyA9IGxpc3RlbmVyc0xpc3RzW2V2ZW50XSB8fCBbXTtcbiAgICAgIGZvciAobGV0IGxpc3RlbmVyIG9mIGxpc3RlbmVycykge1xuICAgICAgICBsaXN0ZW5lciguLi5hcmdzKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9LFxuICAgIG9mZihldmVudCwgLi4ubGlzdGVuZXJzKXtcbiAgICAgIGlmICghZXZlbnQpIHtcbiAgICAgICAgT2JqZWN0LmtleXMobGlzdGVuZXJzTGlzdHMpLmZvckVhY2goZXYgPT4gaW5zdGFuY2Uub2ZmKGV2KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBsaXN0ID0gbGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdO1xuICAgICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSBsaXN0ZW5lcnMubGVuZ3RoID8gbGlzdC5maWx0ZXIobGlzdGVuZXIgPT4gIWxpc3RlbmVycy5pbmNsdWRlcyhsaXN0ZW5lcikpIDogW107XG4gICAgICB9XG4gICAgICByZXR1cm4gaW5zdGFuY2U7XG4gICAgfVxuICB9O1xuICByZXR1cm4gaW5zdGFuY2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm94eUxpc3RlbmVyIChldmVudE1hcCkge1xuICByZXR1cm4gZnVuY3Rpb24gKHtlbWl0dGVyfSkge1xuXG4gICAgY29uc3QgcHJveHkgPSB7fTtcbiAgICBsZXQgZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuICAgIGZvciAobGV0IGV2IG9mIE9iamVjdC5rZXlzKGV2ZW50TWFwKSkge1xuICAgICAgY29uc3QgbWV0aG9kID0gZXZlbnRNYXBbZXZdO1xuICAgICAgZXZlbnRMaXN0ZW5lcnNbZXZdID0gW107XG4gICAgICBwcm94eVttZXRob2RdID0gZnVuY3Rpb24gKC4uLmxpc3RlbmVycykge1xuICAgICAgICBldmVudExpc3RlbmVyc1tldl0gPSBldmVudExpc3RlbmVyc1tldl0uY29uY2F0KGxpc3RlbmVycyk7XG4gICAgICAgIGVtaXR0ZXIub24oZXYsIC4uLmxpc3RlbmVycyk7XG4gICAgICAgIHJldHVybiBwcm94eTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJveHksIHtcbiAgICAgIG9mZihldil7XG4gICAgICAgIGlmICghZXYpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhldmVudExpc3RlbmVycykuZm9yRWFjaChldmVudE5hbWUgPT4gcHJveHkub2ZmKGV2ZW50TmFtZSkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChldmVudExpc3RlbmVyc1tldl0pIHtcbiAgICAgICAgICBlbWl0dGVyLm9mZihldiwgLi4uZXZlbnRMaXN0ZW5lcnNbZXZdKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcHJveHk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn0iLCJleHBvcnQgY29uc3QgVE9HR0xFX1NPUlQgPSAnVE9HR0xFX1NPUlQnO1xuZXhwb3J0IGNvbnN0IERJU1BMQVlfQ0hBTkdFRCA9ICdESVNQTEFZX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFBBR0VfQ0hBTkdFRCA9ICdDSEFOR0VfUEFHRSc7XG5leHBvcnQgY29uc3QgRVhFQ19DSEFOR0VEID0gJ0VYRUNfQ0hBTkdFRCc7XG5leHBvcnQgY29uc3QgRklMVEVSX0NIQU5HRUQgPSAnRklMVEVSX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFNVTU1BUllfQ0hBTkdFRCA9ICdTVU1NQVJZX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IFNFQVJDSF9DSEFOR0VEID0gJ1NFQVJDSF9DSEFOR0VEJztcbmV4cG9ydCBjb25zdCBFWEVDX0VSUk9SID0gJ0VYRUNfRVJST1InOyIsImltcG9ydCBzbGljZSBmcm9tICcuLi9zbGljZSc7XG5pbXBvcnQge2N1cnJ5LCB0YXAsIGNvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuaW1wb3J0IHtlbWl0dGVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuaW1wb3J0IHNsaWNlRmFjdG9yeSBmcm9tICcuLi9zbGljZSc7XG5pbXBvcnQge1xuICBTVU1NQVJZX0NIQU5HRUQsXG4gIFRPR0dMRV9TT1JULFxuICBESVNQTEFZX0NIQU5HRUQsXG4gIFBBR0VfQ0hBTkdFRCxcbiAgRVhFQ19DSEFOR0VELFxuICBGSUxURVJfQ0hBTkdFRCxcbiAgU0VBUkNIX0NIQU5HRUQsXG4gIEVYRUNfRVJST1Jcbn0gZnJvbSAnLi4vZXZlbnRzJztcblxuZnVuY3Rpb24gY3VycmllZFBvaW50ZXIgKHBhdGgpIHtcbiAgY29uc3Qge2dldCwgc2V0fSA9IHBvaW50ZXIocGF0aCk7XG4gIHJldHVybiB7Z2V0LCBzZXQ6IGN1cnJ5KHNldCl9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe1xuICBzb3J0RmFjdG9yeSxcbiAgdGFibGVTdGF0ZSxcbiAgZGF0YSxcbiAgZmlsdGVyRmFjdG9yeSxcbiAgc2VhcmNoRmFjdG9yeVxufSkge1xuICBjb25zdCB0YWJsZSA9IGVtaXR0ZXIoKTtcbiAgY29uc3Qgc29ydFBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc29ydCcpO1xuICBjb25zdCBzbGljZVBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc2xpY2UnKTtcbiAgY29uc3QgZmlsdGVyUG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdmaWx0ZXInKTtcbiAgY29uc3Qgc2VhcmNoUG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdzZWFyY2gnKTtcblxuICBjb25zdCBzYWZlQXNzaWduID0gY3VycnkoKGJhc2UsIGV4dGVuc2lvbikgPT4gT2JqZWN0LmFzc2lnbih7fSwgYmFzZSwgZXh0ZW5zaW9uKSk7XG4gIGNvbnN0IGRpc3BhdGNoID0gY3VycnkodGFibGUuZGlzcGF0Y2guYmluZCh0YWJsZSksIDIpO1xuXG4gIGNvbnN0IGRpc3BhdGNoU3VtbWFyeSA9IChmaWx0ZXJlZCkgPT4ge1xuICAgIGRpc3BhdGNoKFNVTU1BUllfQ0hBTkdFRCwge1xuICAgICAgcGFnZTogdGFibGVTdGF0ZS5zbGljZS5wYWdlLFxuICAgICAgc2l6ZTogdGFibGVTdGF0ZS5zbGljZS5zaXplLFxuICAgICAgZmlsdGVyZWRDb3VudDogZmlsdGVyZWQubGVuZ3RoXG4gICAgfSk7XG4gIH07XG5cbiAgY29uc3QgZXhlYyA9ICh7cHJvY2Vzc2luZ0RlbGF5ID0gMjB9ID0ge30pID0+IHtcbiAgICB0YWJsZS5kaXNwYXRjaChFWEVDX0NIQU5HRUQsIHt3b3JraW5nOiB0cnVlfSk7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaWx0ZXJGdW5jID0gZmlsdGVyRmFjdG9yeShmaWx0ZXJQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IHNlYXJjaEZ1bmMgPSBzZWFyY2hGYWN0b3J5KHNlYXJjaFBvaW50ZXIuZ2V0KHRhYmxlU3RhdGUpKTtcbiAgICAgICAgY29uc3Qgc29ydEZ1bmMgPSBzb3J0RmFjdG9yeShzb3J0UG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICBjb25zdCBzbGljZUZ1bmMgPSBzbGljZUZhY3Rvcnkoc2xpY2VQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IGV4ZWNGdW5jID0gY29tcG9zZShmaWx0ZXJGdW5jLCBzZWFyY2hGdW5jLCB0YXAoZGlzcGF0Y2hTdW1tYXJ5KSwgc29ydEZ1bmMsIHNsaWNlRnVuYyk7XG4gICAgICAgIGNvbnN0IGRpc3BsYXllZCA9IGV4ZWNGdW5jKGRhdGEpO1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChESVNQTEFZX0NIQU5HRUQsIGRpc3BsYXllZC5tYXAoZCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHtpbmRleDogZGF0YS5pbmRleE9mKGQpLCB2YWx1ZTogZH07XG4gICAgICAgIH0pKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGFibGUuZGlzcGF0Y2goRVhFQ19FUlJPUiwgZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChFWEVDX0NIQU5HRUQsIHt3b3JraW5nOiBmYWxzZX0pO1xuICAgICAgfVxuICAgIH0sIHByb2Nlc3NpbmdEZWxheSk7XG4gIH07XG5cbiAgY29uc3QgdXBkYXRlVGFibGVTdGF0ZSA9IGN1cnJ5KChwdGVyLCBldiwgbmV3UGFydGlhbFN0YXRlKSA9PiBjb21wb3NlKFxuICAgIHNhZmVBc3NpZ24ocHRlci5nZXQodGFibGVTdGF0ZSkpLFxuICAgIHRhcChkaXNwYXRjaChldikpLFxuICAgIHB0ZXIuc2V0KHRhYmxlU3RhdGUpXG4gICkobmV3UGFydGlhbFN0YXRlKSk7XG5cbiAgY29uc3QgcmVzZXRUb0ZpcnN0UGFnZSA9ICgpID0+IHVwZGF0ZVRhYmxlU3RhdGUoc2xpY2VQb2ludGVyLCBQQUdFX0NIQU5HRUQsIHtwYWdlOiAxfSk7XG5cbiAgY29uc3QgdGFibGVPcGVyYXRpb24gPSAocHRlciwgZXYpID0+IGNvbXBvc2UoXG4gICAgdXBkYXRlVGFibGVTdGF0ZShwdGVyLCBldiksXG4gICAgcmVzZXRUb0ZpcnN0UGFnZSxcbiAgICAoKSA9PiB0YWJsZS5leGVjKCkgLy8gd2Ugd3JhcCB3aXRoaW4gYSBmdW5jdGlvbiBzbyB0YWJsZS5leGVjIGNhbiBiZSBvdmVyd3JpdHRlbiAod2hlbiB1c2luZyB3aXRoIGEgc2VydmVyIGZvciBleGFtcGxlKVxuICApO1xuXG4gIGNvbnN0IGFwaSA9IHtcbiAgICBzb3J0OiB0YWJsZU9wZXJhdGlvbihzb3J0UG9pbnRlciwgVE9HR0xFX1NPUlQpLFxuICAgIGZpbHRlcjogdGFibGVPcGVyYXRpb24oZmlsdGVyUG9pbnRlciwgRklMVEVSX0NIQU5HRUQpLFxuICAgIHNlYXJjaDogdGFibGVPcGVyYXRpb24oc2VhcmNoUG9pbnRlciwgU0VBUkNIX0NIQU5HRUQpLFxuICAgIHNsaWNlOiBjb21wb3NlKHVwZGF0ZVRhYmxlU3RhdGUoc2xpY2VQb2ludGVyLCBQQUdFX0NIQU5HRUQpLCAoKSA9PiB0YWJsZS5leGVjKCkpLFxuICAgIGV4ZWMsXG4gICAgZXZhbChzdGF0ZSA9IHRhYmxlU3RhdGUpe1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBjb25zdCBzb3J0RnVuYyA9IHNvcnRGYWN0b3J5KHNvcnRQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IHNlYXJjaEZ1bmMgPSBzZWFyY2hGYWN0b3J5KHNlYXJjaFBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgY29uc3QgZmlsdGVyRnVuYyA9IGZpbHRlckZhY3RvcnkoZmlsdGVyUG9pbnRlci5nZXQoc3RhdGUpKTtcbiAgICAgICAgICBjb25zdCBzbGljZUZ1bmMgPSBzbGljZUZhY3Rvcnkoc2xpY2VQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IGV4ZWNGdW5jID0gY29tcG9zZShmaWx0ZXJGdW5jLCBzZWFyY2hGdW5jLCBzb3J0RnVuYywgc2xpY2VGdW5jKTtcbiAgICAgICAgICByZXR1cm4gZXhlY0Z1bmMoZGF0YSkubWFwKGQgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogZGF0YS5pbmRleE9mKGQpLCB2YWx1ZTogZH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICBvbkRpc3BsYXlDaGFuZ2UoZm4pe1xuICAgICAgdGFibGUub24oRElTUExBWV9DSEFOR0VELCBmbik7XG4gICAgfSxcbiAgICBnZXRUYWJsZVN0YXRlKCl7XG4gICAgICBjb25zdCBzb3J0ID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zb3J0KTtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IE9iamVjdC5hc3NpZ24oe30sIHRhYmxlU3RhdGUuc2VhcmNoKTtcbiAgICAgIGNvbnN0IHNsaWNlID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zbGljZSk7XG4gICAgICBjb25zdCBmaWx0ZXIgPSB7fTtcbiAgICAgIGZvciAobGV0IHByb3AgaW4gdGFibGVTdGF0ZS5maWx0ZXIpIHtcbiAgICAgICAgZmlsdGVyW3Byb3BdID0gdGFibGVTdGF0ZS5maWx0ZXJbcHJvcF0ubWFwKHYgPT4gT2JqZWN0LmFzc2lnbih7fSwgdikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtzb3J0LCBzZWFyY2gsIHNsaWNlLCBmaWx0ZXJ9O1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBpbnN0YW5jZSA9IE9iamVjdC5hc3NpZ24odGFibGUsIGFwaSk7XG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGluc3RhbmNlLCAnbGVuZ3RoJywge1xuICAgIGdldCgpe1xuICAgICAgcmV0dXJuIGRhdGEubGVuZ3RoO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGluc3RhbmNlO1xufSIsImltcG9ydCBzb3J0IGZyb20gJ3NtYXJ0LXRhYmxlLXNvcnQnO1xuaW1wb3J0IGZpbHRlciBmcm9tICdzbWFydC10YWJsZS1maWx0ZXInO1xuaW1wb3J0IHNlYXJjaCBmcm9tICdzbWFydC10YWJsZS1zZWFyY2gnO1xuaW1wb3J0IHRhYmxlIGZyb20gJy4vZGlyZWN0aXZlcy90YWJsZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7XG4gIHNvcnRGYWN0b3J5ID0gc29ydCxcbiAgZmlsdGVyRmFjdG9yeSA9IGZpbHRlcixcbiAgc2VhcmNoRmFjdG9yeSA9IHNlYXJjaCxcbiAgdGFibGVTdGF0ZSA9IHtzb3J0OiB7fSwgc2xpY2U6IHtwYWdlOiAxfSwgZmlsdGVyOiB7fSwgc2VhcmNoOiB7fX0sXG4gIGRhdGEgPSBbXVxufSwgLi4udGFibGVEaXJlY3RpdmVzKSB7XG5cbiAgY29uc3QgY29yZVRhYmxlID0gdGFibGUoe3NvcnRGYWN0b3J5LCBmaWx0ZXJGYWN0b3J5LCB0YWJsZVN0YXRlLCBkYXRhLCBzZWFyY2hGYWN0b3J5fSk7XG5cbiAgcmV0dXJuIHRhYmxlRGlyZWN0aXZlcy5yZWR1Y2UoKGFjY3VtdWxhdG9yLCBuZXdkaXIpID0+IHtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihhY2N1bXVsYXRvciwgbmV3ZGlyKHtcbiAgICAgIHNvcnRGYWN0b3J5LFxuICAgICAgZmlsdGVyRmFjdG9yeSxcbiAgICAgIHNlYXJjaEZhY3RvcnksXG4gICAgICB0YWJsZVN0YXRlLFxuICAgICAgZGF0YSxcbiAgICAgIHRhYmxlOiBjb3JlVGFibGVcbiAgICB9KSk7XG4gIH0sIGNvcmVUYWJsZSk7XG59IiwiaW1wb3J0IHRhYmxlRGlyZWN0aXZlIGZyb20gJy4vc3JjL3RhYmxlJztcbmltcG9ydCBmaWx0ZXJEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9maWx0ZXInO1xuaW1wb3J0IHNlYXJjaERpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3NlYXJjaCc7XG5pbXBvcnQgc2xpY2VEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zbGljZSc7XG5pbXBvcnQgc29ydERpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3NvcnQnO1xuaW1wb3J0IHN1bW1hcnlEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy9zdW1tYXJ5JztcbmltcG9ydCB3b3JraW5nSW5kaWNhdG9yRGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvd29ya2luZ0luZGljYXRvcic7XG5cbmV4cG9ydCBjb25zdCBzZWFyY2ggPSBzZWFyY2hEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgc2xpY2UgPSBzbGljZURpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBzdW1tYXJ5ID0gc3VtbWFyeURpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBzb3J0ID0gc29ydERpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBmaWx0ZXIgPSBmaWx0ZXJEaXJlY3RpdmU7XG5leHBvcnQgY29uc3Qgd29ya2luZ0luZGljYXRvciA9IHdvcmtpbmdJbmRpY2F0b3JEaXJlY3RpdmU7XG5leHBvcnQgY29uc3QgdGFibGUgPSB0YWJsZURpcmVjdGl2ZTtcbmV4cG9ydCBkZWZhdWx0IHRhYmxlO1xuIiwiZXhwb3J0IGRlZmF1bHQgW1xuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3Ny9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3N1wiLFxuICAgIFwiaWRcIjogMjMzMTIwNTQ4LFxuICAgIFwibnVtYmVyXCI6IDc3NyxcbiAgICBcInRpdGxlXCI6IFwiQWRqdXN0bWVudHMgZm9yIEFuZ3VsYXIgMS42XCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJNcldvb2tcIixcbiAgICAgIFwiaWRcIjogMjAyOTQwNDIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzIwMjk0MDQyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29va1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9Ncldvb2tcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL01yV29vay9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Ncldvb2svcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvTXJXb29rL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA2LTAyVDA5OjA1OjA2WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDYtMDZUMTU6MDQ6NDJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzc3XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3XCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3LmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzc3LnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIkNhdGNoIHRpbWVvdXQgcHJvbWlzZSBvbiBjYW5jZWwgYmVjYXVzZSBpdCB3aWxsIHRocm93IGFuIGVycm9yIGluIEFuZ3VsYXIgMS42XCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzUvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc1L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NVwiLFxuICAgIFwiaWRcIjogMjMyOTM5MDI0LFxuICAgIFwibnVtYmVyXCI6IDc3NSxcbiAgICBcInRpdGxlXCI6IFwiSG93IHRvIHNvcnQgd2hlbiBtb3JlIHRoYW4gb25lIHNpbmdsZSBwcm9wZXJ0eSB2YWx1ZSBpcyBnaXZlbiBwcm8gY29sdW1uIFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiYnZhaGRhdFwiLFxuICAgICAgXCJpZFwiOiAzMTIyMTc3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS8zMTIyMTc3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vYnZhaGRhdFwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9idmFoZGF0L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYnZhaGRhdC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2J2YWhkYXQvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDYtMDFUMTY6MzY6MTNaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNi0wMVQxODo1Mzo0NFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIlVzaW5nIGBhbmd1bGFyanMgMS41LjlgIGFzc3VtZSB0d28gZ2l2ZW4gcHJvcGVydGllcyBzdWNoIGFzIGBmb29gIGFuZCBgYmFyYCBiZWluZyBib3VuZCB0byBhIHNpbmdsZSBjb2x1bW4uXFxyXFxuSXMgdGhlcmUgYW55IHdheSB0byBpbnN0cnVjdCBgc3Qtc29ydGAgdG8gZWl0aGVyIHNvcnQgYWNjb3JkaW5nIHRvIHRoZSBgZm9vYCBvciBgYmFyYCB2YWx1ZXMuIFRoYXQncyBzb21ldGhpbmcgYWxvbmcgdGhlIGZvbGxvd2luZyBsaW5lczpcXHJcXG5cXHJcXG5gYGBodG1sXFxyXFxuPHRoIHN0LXNvcnQ9XFxcIltmaXJzdE5hbWUsIGxhc3ROYW1lXVxcXCI+Zmlyc3QgbmFtZSA8YnIgLz4gbGFzdCBuYW1lPC90aD5cXHJcXG5gYGBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzRcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3NC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzQvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzQvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzc0XCIsXG4gICAgXCJpZFwiOiAyMzAxMTg2NTMsXG4gICAgXCJudW1iZXJcIjogNzc0LFxuICAgIFwidGl0bGVcIjogXCJTbWFydCBUYWJsZSBwYWdpbmcgaXMgc2hvd2luZyBtb3JlIHBhZ2VzIHRoYW4gZXhwZWN0ZWRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIm1vc3RhZmFhc2FkXCIsXG4gICAgICBcImlkXCI6IDc2MjU1MzAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzc2MjU1MzA/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbW9zdGFmYWFzYWRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbW9zdGFmYWFzYWQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9tb3N0YWZhYXNhZC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL21vc3RhZmFhc2FkL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjI1ODYyNDIzLFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL25vdCUyMHJlcHJvZHVjaWJsZVwiLFxuICAgICAgICBcIm5hbWVcIjogXCJub3QgcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwiY29sb3JcIjogXCJlYjY0MjBcIixcbiAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBcImlkXCI6IDI1OTQzODUwNixcbiAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2xhYmVscy90byUyMGJlJTIwY2xvc2VkOiUyMGRvZXMlMjBub3QlMjBmb2xsb3clMjBndWlkZWxpbmVzXCIsXG4gICAgICAgIFwibmFtZVwiOiBcInRvIGJlIGNsb3NlZDogZG9lcyBub3QgZm9sbG93IGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImZiY2EwNFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH1cbiAgICBdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAzLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDUtMjBUMDA6NDE6NDFaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNS0yMlQxODozOTo1MVpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgYW0gdXNpbmcgU21hcnQgdGFibGUgaW4gYW5ndWxhcmpzIGFwcGxpY2F0aW9uLiBJbiB0aGUgcGFnaW5hdGlvbiBpdCBpcyBzaG93aW5nIGV4dHJhIHBhZ2VzIHdoaWNoIGRvbid0IGhhdmUgdGhlIGRhdGEuIEhvdyBjYW4gSSBkaXNwbGF5IHRoZSBleGFjdCBudW1iZXIgb2YgcGFnZXMgaW5zdGVhZCBvZiBleHRyYSBwYWdlcz9cXHJcXG5cXHJcXG5Gb3IgY2xhcmlmaWNhdGlvbiwgSSBoYXZlIDk0IHJlY29yZHMsIDE1IHBlciBwYWdlIHNvIHRoZXJlIHdpbGwgYmUgNyBwYWdlcyAsIGJ1dCB0aGUgcGFnaW5hdGlvbiBpcyBzaG93aW5nIDEwIHBhZ2VzLCBhZnRlciA3dGggcGFnZSB0aGVyZSBpcyBubyBkYXRhIGluIDgtMTB0aCBwYWdlcy5cXHJcXG5QbGVhc2Ugc3VnZ2VzdCBob3cgY2FuIEkgcmVzb2x2ZSB0aGlzLlxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3M1wiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzczL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3My9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3My9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczXCIsXG4gICAgXCJpZFwiOiAyMjcyNzU5MDAsXG4gICAgXCJudW1iZXJcIjogNzczLFxuICAgIFwidGl0bGVcIjogXCJGaXg6IFBhcnNlIGluaXRpYWwgcHJlZGljYXRlIGNvcnJlY3RseVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiZzAwZnktXCIsXG4gICAgICBcImlkXCI6IDg0MzgwNyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODQzODA3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9nMDBmeS1cIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2cwMGZ5LS9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9nMDBmeS0vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZzAwZnktL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA1LTA5VDA3OjM1OjE2WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDUtMDlUMDc6NDc6MzZaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzczXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczXCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczLmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzczLnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIlRoaXMgYnVnIGNhdXNlZCBvdGhlciBwbHVnaW5zIG5vdCB0byB3b3JrIGNvcnJlY3RseS5cXHJcXG5UaGUgaW5pdGlhbCBwcmVkaWNhdGUgd2Fzbid0IHBhcnNlZCB0aGUgc2FtZSB3YXkgaXQgd2FzIHBhcnNlZCBhZnRlciBjbGljayAtIHdoaWNoIHJlc3VsdGVkIGluIHRoZSBhcnJvd3Mgbm90IHBvaW50aW5nIHRoZSByaWdodCBkaXJlY3Rpb24uXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MlwiLFxuICAgIFwiaWRcIjogMjI1NDIyOTkyLFxuICAgIFwibnVtYmVyXCI6IDc3MixcbiAgICBcInRpdGxlXCI6IFwiUmVmcmVzaCB0YWJsZSB3aXRoIHdpdGggb3V0IHBhZ2UgbG9hZFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic21vaGFtbWVkeWFzaW5cIixcbiAgICAgIFwiaWRcIjogMjU1NjUxNDIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzI1NTY1MTQyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3Ntb2hhbW1lZHlhc2luXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Ntb2hhbW1lZHlhc2luL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc21vaGFtbWVkeWFzaW4vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zbW9oYW1tZWR5YXNpbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNS0wMVQxMTo0MjoxMVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA1LTAxVDE4OjEyOjQ3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGVsbG8sXFxyXFxuXFxyXFxuVGhpcyBpcyBub3QgYW4gaXNzdWUsXFxyXFxuXFxyXFxuSSB3YW50IHRvIGtub3cgaG93IHRvIHJlZnJlc2ggdGFibGUgd2l0aCBvdXQgcmVsb2FkIGNvbXBsZXRlIHBhZ2UuIGFuZCBpJ20gdXNpbmcgaHR0cCQgZm9yIENSVURcXHJcXG5cXHJcXG5wbGVhc2UgZ2l2ZSBtZSBhbnkgZXhhbXBsZSB3aGljaCBpcyB1c2luZyBzZXJ2ZXIgc2lkZSBkYXRhLlxcclxcblxcclxcbkFwcHJlY2lhdGUgZm9yIHF1aWNrIGFuZCBiZXN0IHJlc3BvbnNlLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcxL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzcxXCIsXG4gICAgXCJpZFwiOiAyMjUzMzE3ODYsXG4gICAgXCJudW1iZXJcIjogNzcxLFxuICAgIFwidGl0bGVcIjogXCJDdXN0b20gZmlsdGVyc1wiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwicmljaGFyZC1hdXN0aW5cIixcbiAgICAgIFwiaWRcIjogMTQzMTY0NjYsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0MzE2NDY2P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3JpY2hhcmQtYXVzdGluXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3JpY2hhcmQtYXVzdGluL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvcmljaGFyZC1hdXN0aW4vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9yaWNoYXJkLWF1c3Rpbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wNC0zMFQxNDo0OTo1MlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTA0LTMwVDE0OjQ5OjUyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc3MVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MVwiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MS5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc3MS5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzBcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc3MC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzAvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NzAvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzcwXCIsXG4gICAgXCJpZFwiOiAyMjQxNjExOTUsXG4gICAgXCJudW1iZXJcIjogNzcwLFxuICAgIFwidGl0bGVcIjogXCJGaWx0ZXIgd2l0aCBjbGljayBvZiBhIGJ1dHRvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiRm9zc2lsMDFcIixcbiAgICAgIFwiaWRcIjogODgzMjY4NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODgzMjY4Nz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9Gb3NzaWwwMVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9Gb3NzaWwwMS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0Zvc3NpbDAxL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvRm9zc2lsMDEvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAxLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDQtMjVUMTQ6Mzg6MTZaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wNC0yNlQxMjozNDo1M1pcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgd291bGQgbGlrZSB0byBmaWx0ZXIgc29tZSB0YWJsZSBjb2x1bW5zIGJ5IHRoZSBjbGljayBvZiBhIGJ1dHRvbi4gSXMgdGhpcyBwb3NzaWJsZSBhbmQgaWYgc28sIGhvdz9cXHJcXG5cXHJcXG5MZXRzIHNheSBJIGhhdmUgYSBjb2x1bW4gVVNFUlMgd2l0aCAzIHJvd3M6IEpvaG4sIEpvaG4sIFdpbGxpYW0uXFxyXFxuXFxyXFxuTm93IEkgaGF2ZSBhIGJ1dHRvbjpcXHJcXG5gPGJ1dHRvbiBuZy1jbGljaz1cXFwiZmlsdGVyKCdKb2huJylcXFwiPkpvaG48L2J1dHRvbj5gXFxyXFxuVGhpcyBzaG91bGQgbWFrZSB0aGUgdGFibGUgb25seSBzaG93IFVzZXJzLkpvaG4uXFxyXFxuXFxyXFxuVGhpcyBidXR0b24gd291bGQgcHJlZmVyYWJseSBiZSBwbGFjZWQgb3V0c2lkZSBvZiB0aGUgdGFibGUuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NjkvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzY5L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc2OVwiLFxuICAgIFwiaWRcIjogMjIxNzUyNzIwLFxuICAgIFwibnVtYmVyXCI6IDc2OSxcbiAgICBcInRpdGxlXCI6IFwiU29ydGluZyB3aXRoIGFzeW5jaHJvbm91c2x5IHJlY2VpdmVkIGRhdGFcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImJsYWNraGVhcnRlZFwiLFxuICAgICAgXCJpZFwiOiA0NjAxNzE3LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS80NjAxNzE3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9ibGFja2hlYXJ0ZWRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2JsYWNraGVhcnRlZC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9ibGFja2hlYXJ0ZWQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYmxhY2toZWFydGVkL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE3LTA0LTE0VDA2OjQ0OjA4WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDQtMTRUMTQ6MDE6MjZaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJJZiBkYXRhIGlzIHJlY2VpdmVkIGFzeW5jaHJvbm91c2x5IGFuZCBub3QgYXZhaWxhYmxlIGF0IHRoZSBtb21lbnQgb2YgdGFibGUgY3JlYXRpb24gLSB0YWJsZSBpcyBzb3J0ZWQgZGlmZmVyZW50bHkuXFxyXFxuXFxyXFxuRGF0YSBcXFwicmVjZWl2ZWRcXFwiXFxyXFxuJHNjb3BlLmRpc3BsYXllZC5wdXNoKHtcXHJcXG4gICAgICAgIGZpcnN0TmFtZTogXFxcIkExXFxcIixcXHJcXG4gICAgICAgIGJhbGFuY2U6IDMwMFxcclxcbiAgICAgIH0pO1xcclxcbiAgICAgICRzY29wZS5kaXNwbGF5ZWQucHVzaCh7XFxyXFxuICAgICAgICBmaXJzdE5hbWU6IFxcXCJBMlxcXCIsXFxyXFxuICAgICAgICBiYWxhbmNlOiAyMDBcXHJcXG4gICAgICB9KTtcXHJcXG4gICAgICAkc2NvcGUuZGlzcGxheWVkLnB1c2goe1xcclxcbiAgICAgICAgZmlyc3ROYW1lOiBcXFwiQTNcXFwiLFxcclxcbiAgICAgICAgYmFsYW5jZTogMTAwXFxyXFxuICAgICAgfSk7XFxyXFxuXFxyXFxuSWYgaXQgaXMgd2l0aGluICR0aW1lb3V0IHRhYmxlIHdpbGwgbG9vayBsaWtlLiBOb3RlIHNvcnRpbmcgaWNvbiBvbiBiYWxhbmNlIGNvbHVtbiBpcyB3cm9uZzpcXHJcXG5odHRwOi8vcGxua3IuY28vZWRpdC84QjBKeThicTFCRFBkblU2YkZHbD9wPXByZXZpZXdcXHJcXG5maXJzdCBuYW1lXFx0YmFsYW5jZVxcclxcbkExXFx0ICAgICAgICAgICAgICAgIDMwMFxcclxcbkEyXFx0ICAgICAgICAgICAgICAgIDIwMFxcclxcbkEzXFx0ICAgICAgICAgICAgICAgIDEwMFxcclxcblxcclxcbklmIGl0IGlzIHN5bmNocm9ub3VzOlxcclxcbmh0dHA6Ly9wbG5rci5jby9lZGl0L3J1ZjJMdW5ERjNwUVVNWENEMFp6P3A9cHJldmlld1xcclxcbmZpcnN0IG5hbWVcXHRiYWxhbmNlXFxyXFxuQTNcXHQgICAgICAgICAgICAgICAgMTAwXFxyXFxuQTJcXHQgICAgICAgICAgICAgICAgMjAwXFxyXFxuQTFcXHQgICAgICAgICAgICAgICAgMzAwXFxyXFxuXFxyXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzU0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbC83NTRcIixcbiAgICBcImlkXCI6IDIxMTk0ODk2MyxcbiAgICBcIm51bWJlclwiOiA3NTQsXG4gICAgXCJ0aXRsZVwiOiBcImFsbG93IGltcGxpY2l0IHRydWUgYXR0cmlidXRlcyBpbiBzdFNvcnRcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImRiZWluZGVyXCIsXG4gICAgICBcImlkXCI6IDM0Mjk1NSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMzQyOTU1P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2RiZWluZGVyXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RiZWluZGVyL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGJlaW5kZXIvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYmVpbmRlci9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMy0wNVQxMjoxNzoyN1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAzLTA1VDEyOjE3OjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc1NFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NFwiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NC5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc1NC5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCJUaGlzIHdvdWxkIGFsbG93IHNob3J0ZXIgYXR0cmlidXRlcyBvbiB0aGUgc29ydCBhdHRyaWJ1dGVzLCBhbmQgZGVmYXVsdHMgXFxcIlxcXCIgdG8gdHJ1ZSBwcm92aWRlZCB0aGUgYXR0cmlidXRlIGlzIGRlZmluZWQuXFxyXFxuYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3QtZGVzY2VuZGluZy1maXJzdD1cXFwidHJ1ZVxcXCIgLz5gIHRvIGA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LWRlc2NlbmRpbmctZmlyc3QgLz5gIFxcclxcbmA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNraXAtbmF0dXJhbD1cXFwidHJ1ZVxcXCIgLz5gIHRvIGA8dGggc3Qtc29ydD1cXFwiZmllbGRcXFwiIHN0LXNraXAtbmF0dXJhbCAvPmAgXFxyXFxuYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3Qtc29ydC1kZWZhdWx0PVxcXCJ0cnVlXFxcIiAvPmAgdG8gYDx0aCBzdC1zb3J0PVxcXCJmaWVsZFxcXCIgc3Qtc29ydC1kZWZhdWx0IC8+YCBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1My9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUzXCIsXG4gICAgXCJpZFwiOiAyMTE2MjY4MzQsXG4gICAgXCJudW1iZXJcIjogNzUzLFxuICAgIFwidGl0bGVcIjogXCJTYWZlIHNyYyB3YXRjaCBjb2xsZWN0aW9uXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJ2aWFuZGFudGVvc2N1cm9cIixcbiAgICAgIFwiaWRcIjogNDIzNTA3OSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczMuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvNDIzNTA3OT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm9cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vdmlhbmRhbnRlb3NjdXJvXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy92aWFuZGFudGVvc2N1cm8vc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvdmlhbmRhbnRlb3NjdXJvL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3ZpYW5kYW50ZW9zY3Vyby9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMy0wM1QwODozOTo0OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAzLTAzVDA4OjQwOjEzWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgdG8gYWxsIVxcclxcblxcclxcbkkgdXNlIHRoZSB4ZWRpdGFibGUgb24gZWFjaCBjZWxsLCBldmVyeSBlZGl0IGkgZW1pdCBhIHNvY2tldCBldmVudCB0aGF0IHJlZnJlc2ggZWxlbWVudHMgaW4gZXZlcnkgdXNlciBpcyAgdXNpbmcgdGhlIHRhYmxlLlxcclxcblxcclxcbkkgaGF2ZSBhIHByb2JsZW0gd2l0aCB0aGUgc3Qtc2FmZS1zcmMgYXR0cmlidXRlLlxcclxcblxcclxcbkkgYnVpbGQgdGhlIHRhYmxlIHdpdGggYW4gb2JqZWN0IGxpa2UgdGhpczpcXHJcXG5cXHJcXG5gYGBqYXZhc2NyaXB0XFxyXFxucm93cyA9IFtcXHJcXG4gIHtcXHJcXG4gICAgIGlkOiA0NTYsXFxyXFxuICAgICBkYXRhOiBbXFxyXFxuICAgICAgIHtcXHJcXG4gICAgICAgICAgdmFsdWU6ICcnLFxcclxcbiAgICAgICAgICBuYW1lOiAnJ1xcclxcbiAgICAgICAgfSxcXHJcXG4gICAgICAgIC4uLi5cXHJcXG4gICAgIF1cXHJcXG4gIH0sXFxyXFxuICB7IC4uLiB9LCBcXHJcXG4gIC4uLlxcclxcbl1cXHJcXG5gYGBcXHJcXG5cXHJcXG5Tby4uLiBpbiB0aGUgbmctcmVwZWF0IG9mIHRyIGVsZW1lbnRzIGkgbmVlZCB0aGUgaWQgYXR0cmlidXRlIG9mIGVhY2ggcm93LCBidXQgdGhlIHRkIGVsZW1lbnRzIGFyZSB0aG9zZSBvZiB0aGUgYXJyYXkgJ2RhdGEnIG9mIGVhY2ggcm93LlxcclxcblxcclxcbldoZW4gaSBlZGl0IGEgdmFsdWUsIHRoZSBzb2NrZXQgZXZlbnQgaXMgZW1pdHRlZCwgYnV0IHRoZSBjb2xsZWN0aW9uIG9uIHRoZSBvdGhlciB1c2VyIGlzIG5vdCByZWZyZXNoZWQuLi4gc28sIHRoZSB2YWx1ZXMgYXJlIG5vdCB1cGRhdGVkLiBCdXQgaWYgaSBhZGQgYSByb3csIHRoZSB0YWJsZSBvbiB0aGUgb3RoZXIgdXNlcnMgaXMgcmVmcmVzaGVkLi4uIG9ubHkgdGhlIHZhbHVlcyBpbiB0aGUgY2VsbHMgYXJlIG91dCBvZiBkYXRlLlxcclxcblxcclxcbklmIGkgZG9uJ3QgdXNlIHNtYXJ0IHRhYmxlIGFsbCB3b3JrcyBmaW5lLCBidXQgaSBwcmVmZXIgdGhlIHNtYXJ0IHRhYmxlLlxcclxcblxcclxcbkluIHRoZSBjb2RlIG9mIHNtYXJ0IHRhYmxlIHRoZXJlIGlzIGEgd2F0Y2gsIGJ1dCBpIG5lZWQgYSB3YXRjaGNvbGxlY3Rpb24sIGlzIGl0IHBvc3NpYmxlP1xcclxcblxcclxcbkhvdz9cXHJcXG5cXHJcXG5UaGFua3NcXHJcXG5cXHJcXG5NYXNzaW1vXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NTIvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzUyL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc1MlwiLFxuICAgIFwiaWRcIjogMjA5OTQ5MzM3LFxuICAgIFwibnVtYmVyXCI6IDc1MixcbiAgICBcInRpdGxlXCI6IFwiVXBkYXRlIHNtYXJ0LXRhYmxlIGJ5IFdlYlNvY2tldFwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiSHlwZXJGbHlcIixcbiAgICAgIFwiaWRcIjogODk5MzcwNSxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODk5MzcwNT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9IeXBlckZseVwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9IeXBlckZseS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0h5cGVyRmx5L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvSHlwZXJGbHkvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiAyLFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTctMDItMjRUMDM6MTc6NDlaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNy0wMi0yNFQxMDo0NzoyNlpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIlRoZXJlIGFyZSAyIHRhYnMgaW4gdGhlIGNvbnRhaW5lci5cXHJcXG5FYWNoIHRhYiBoYXMgYSBzbWFydC10YWJsZSBpbiBpdC5cXHJcXG5cXHJcXG4gMS4gVXNlciBjbGlja3Mgb24gdGhlIHRhYi5cXHJcXG5cXHJcXG4gICAgXFx0JCgnYVtkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIl0nKS5vbignc2hvd24uYnMudGFiJywgZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHR2YXIgdGFyZ2V0ID0gJChlLnRhcmdldCkuYXR0cihcXFwiaHJlZlxcXCIpIC8vIGFjdGl2YXRlZCB0YWJcXHJcXG5cXHRcXHRcXHR2YXIgcmVsYXRlZFRhcmdldCA9ICQoZS5yZWxhdGVkVGFyZ2V0KS5hdHRyKFxcXCJocmVmXFxcIilcXHJcXG5cXHRcXHRcXHRpZiAodGFyZ2V0ID09IFxcXCIjdGFiMVxcXCIpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIxJykuZ2V0X3JlY29yZHMoKTtcXHJcXG5cXHRcXHRcXHR9IGVsc2UgaWYgKHRhcmdldCA9PSBcXFwiI3RhYjJcXFwiKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMicpLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH0pXFxyXFxuXFxyXFxuIDIuIENhbGwgc2VydmVyIHRvIGdldCBhbGwgcmVjb3JkIGFuZCBkaXNwbGF5IG9uIHRoZSB0YWJsZS4ob25seSBmaXJzdCB0aW1lKVxcclxcblxcclxcbiAgICBcXHQkc2NvcGUuZ290X3RhYjFfcmVjb3JkcyA9IGZhbHNlO1xcclxcblxcdFxcdCRzY29wZS5nZXRfcmVjb3JkcyA9IGZ1bmN0aW9uICgpIHtcXHJcXG5cXHRcXHRcXHRpZigkc2NvcGUuZ290X3RhYjFfcmVjb3JkcykgcmV0dXJuO1xcclxcblxcdFxcdFxcdHZhciB0b2RheSA9IG5ldyBEYXRlKCkudG9KU09OKCkuc2xpY2UoMCwxMCk7XFxyXFxuXFx0XFx0XFx0dmFyIHVybCA9IEZsYXNrLnVybF9mb3IoJ3JlY29yZGVyLnJlY29yZF9saXN0Jywge2luZm9fdHlwZTogMSwgZnJvbV9kYXRlOiB0b2RheSwgdG9fZGF0ZTogdG9kYXl9KTtcXHJcXG5cXHRcXHRcXHQkaHR0cC5nZXQodXJsKS5zdWNjZXNzKFxcclxcblxcdFxcdFxcdFxcdGZ1bmN0aW9uKGRhdGEpe1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS50YWIxX3JlY29yZHMgPSBkYXRhO1xcclxcblxcdFxcdFxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3JkcyA9IFtdLmNvbmNhdCgkc2NvcGUudGFiMV9yZWNvcmRzKTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuZ290X3RhYjFfcmVjb3JkcyA9IHRydWU7XFxyXFxuXFx0XFx0XFx0XFx0fVxcclxcblxcdFxcdFxcdCkuZXJyb3IoZnVuY3Rpb24ocmVzcG9uc2Upe1xcclxcblxcdFxcdFxcdFxcdGFsZXJ0KHJlc3BvbnNlKTtcXHJcXG5cXHRcXHRcXHR9KS5maW5hbGx5KGZ1bmN0aW9uICgpe1xcclxcblxcdFxcdFxcdH0pO1xcclxcblxcdFxcdH1cXHJcXG5cXHJcXG4gMy4gSWYgdGhlcmUgaXMgYSBuZXcgcmVjb3JkLCBnZXQgdGhlIHJlY29yZCBmcm9tIFdlYlNvY2tldC5cXHJcXG5cXHJcXG4gICAgXFx0dmFyIHVybCA9IFxcXCJ3czovL1xcXCIgKyB3aW5kb3cubG9jYXRpb24uaHJlZi5yZXBsYWNlKC9odHRwcz86XFxcXC9cXFxcLy8sJycpLnJlcGxhY2UoL1xcXFwvLiovLCcnKSArIFxcXCIvd3NcXFwiO1xcclxcblxcdFxcdHZhciB3cyA9IG5ldyBXZWJTb2NrZXQodXJsKTtcXHJcXG5cXHRcXHR3cy5vbmVycm9yID0gZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHRhbGVydChlKTtcXHJcXG5cXHRcXHRcXHRjb25zb2xlLmxvZyhcXFwiV2ViU29ja2V0IEVycm9yXFxcIiArIGUpO1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKGUpO1xcclxcblxcdFxcdH1cXHJcXG5cXHRcXHR3cy5vbmNsb3NlID0gZnVuY3Rpb24gKCkge1xcclxcblxcdFxcdFxcdGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFxcXCJsb2dvXFxcIikuc3R5bGUuY29sb3IgPSBcXFwiZ3JheVxcXCI7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdHdzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChlKSB7XFxyXFxuXFx0XFx0XFx0dmFyIG9iaiA9IEpTT04ucGFyc2UoZS5kYXRhKTtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuYXBwZW5kX3JlY29yZChvYmouc3RhdGUsIG9iai5yZWNvcmQpO1xcclxcblxcdFxcdH1cXHJcXG4gICAgXFx0JHNjb3BlLmFwcGVuZF9yZWNvcmQgPSBmdW5jdGlvbihpbmZvX3R5cGUsIHJlY29yZCl7XFxyXFxuICAgICAgICBcXHRpZiAoaW5mb190eXBlID09IDEpIHtcXHJcXG4gICAgICAgICAgICBcXHRTY29wZXMuZ2V0KCd0YWIxJykudW5zaGlmdF9yZWNvcmQocmVjb3JkKTtcXHJcXG4gICAgICAgIFxcdH0gZWxzZSBpZiAoaW5mb190eXBlID09IDIpIHtcXHJcXG4gICAgICAgICAgICBcXHRTY29wZXMuZ2V0KCd0YWIyJykuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdChKU09OLnBhcnNlKHJlY29yZCkpO1xcclxcbiAgICAgICAgXFx0fVxcclxcbiAgICBcXHR9O1xcclxcblxcclxcbiA0LiBVbnNoaWZ0IHRoZSByZWNvcmQgb24gdGhlIHN0LXNhZmUtc3JjIGFuZCByZWZyZXNoIHRoZSB0YWJsZS5cXHJcXG5cXHJcXG4gICAgIFxcdCRzY29wZS51bnNoaWZ0X3JlY29yZCA9IGZ1bmN0aW9uIChyZWNvcmQpIHtcXHJcXG5cXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMudW5zaGlmdChKU09OLnBhcnNlKHJlY29yZCkpO1xcclxcblxcdFxcdH07XFx0XFxyXFxuXFxyXFxuTXkgcXVlc3Rpb24gaXMgdGhlIHN0ZXAgNCBkaWQgbm90IHJlZnJlc2ggdGhlIHRhYmxlLlxcclxcbk9ubHkgaWYgSSBjbGljayBvbiBhbm90aGVyIHRhYiB0aGVuIGNsaWNrIG9uIHRoZSBvcmlnaW5hbCB0YWIuXFxyXFxuQnV0LCBjbGljayBvbiB0aGUgYnV0dG9uIGluIHRoZSB0YWIxIGl0IHdpbGwgdW5zaGlmdCBhIHJlY29yZCBhbmQgZGlzcGxheSBvbiB0aGUgZmlyc3Qgcm93IG9mIHRoZSB0YWJsZS5cXHJcXG5cXHJcXG4gICAgXFx0JHNjb3BlLmFkZFJhbmRvbUl0ZW0gPSBmdW5jdGlvbiBhZGRSYW5kb21JdGVtKCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicxJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFxyXFxuQWxzbywgSSBoYXZlIGEgcXVlc3Rpb24uXFxyXFxuV2h5IHRoZSBzdC1wYWdlc2l6ZWxpc3Q9XFxcIjEwLDUwLDEwMCwxMDAwXFxcIiBkaWQgbm90IHdvcmsgP1xcclxcblxcclxcbkkgaGF2ZSBbcGx1bmtlcl1bMV0gdG8gc2hvdyB0aGlzIHByb2JsZW0uIEJ1dCBJIGRvbid0IGtub3cgaG93IHRvIHNpbXVsYXRlIFdlYlNvY2tldC5cXHJcXG5cXHJcXG5cXHJcXG5IdG1sOlxcclxcblxcclxcbiAgICA8ZGl2IGlkPVxcXCJyaWdodF9jb250YWluZXJcXFwiIHN0eWxlPVxcXCJwb3NpdGlvbjogYWJzb2x1dGU7IHdpZHRoOiAzOCU7IGhlaWdodDogY2FsYygxMDAlIC0gMTA3cHgpOyByaWdodDogMHB4O1xcXCI+XFxyXFxuXFx0XFx0PHVsIGNsYXNzPVxcXCJuYXYgbmF2LXRhYnNcXFwiPlxcclxcblxcdFxcdFxcdDxsaSBjbGFzcz1cXFwiYWN0aXZlXFxcIj48YSBkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIiBocmVmPVxcXCIjdGFiMVxcXCI+dGFiMTwvYT48L2xpPlxcclxcblxcdFxcdFxcdDxsaSBjbGFzcz1cXFwiXFxcIj48YSBkYXRhLXRvZ2dsZT1cXFwidGFiXFxcIiBocmVmPVxcXCIjdGFiMlxcXCI+dGFiMjwvYT48L2xpPlxcclxcblxcdFxcdDwvdWw+XFxyXFxuXFx0XFx0PGRpdiBjbGFzcz1cXFwidGFiLWNvbnRlbnRcXFwiPlxcclxcblxcdFxcdFxcdDxkaXYgaWQ9XFxcInRhYjFcXFwiIGNsYXNzPVxcXCJ0YWItcGFuZSBmYWRlIGluIGFjdGl2ZVxcXCIgbmctY29udHJvbGxlcj1cXFwidGFiMVxcXCIgc3R5bGU9XFxcInBvc2l0aW9uOiBhYnNvbHV0ZTsgd2lkdGg6IDEwMCU7IGhlaWdodDogY2FsYygxMDAlIC0gNDJweCk7IHRvcDogNDJweDtcXFwiPlxcclxcblxcdFxcdFxcdFxcdDxidXR0b24gdHlwZT1cXFwiYnV0dG9uXFxcIiBuZy1jbGljaz1cXFwiYWRkUmFuZG9tSXRlbShyb3cpXFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1zbSBidG4tc3VjY2Vzc1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PGkgY2xhc3M9XFxcImdseXBoaWNvbiBnbHlwaGljb24tcGx1c1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC9pPiBBZGQgcmFuZG9tIGl0ZW1cXHJcXG5cXHRcXHRcXHRcXHQ8L2J1dHRvbj5cXHJcXG5cXHRcXHRcXHRcXHQ8dGFibGUgc3QtdGFibGU9XFxcInRhYjFfcmVjb3Jkc1xcXCIgc3Qtc2FmZS1zcmM9XFxcInNhZmVfdGFiMV9yZWNvcmRzXFxcIiBjbGFzcz1cXFwidGFibGUgdGFibGUtc3RyaXBlZFxcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRoZWFkPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogIzJBNjZBQjsgY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPnRpbWU8L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD5kZXZpY2U8L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIHN0eWxlPVxcXCJiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD48aW5wdXQgc3Qtc2VhcmNoPVxcXCJ0aW1lXFxcIiBjbGFzcz1cXFwiZm9ybS1jb250cm9sXFxcIiBwbGFjZWhvbGRlcj1cXFwidGltZSBzZWFyY2ggLi4uXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiAvPjwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRoPjxpbnB1dCBzdC1zZWFyY2g9XFxcImRldmljZVxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgcGxhY2Vob2xkZXI9XFxcImRldmljZSBzZWFyY2ggLi4uXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiAvPjwvdGg+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RoZWFkPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0Ym9keSBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgbmctcmVwZWF0PVxcXCJyZWNvcmQgaW4gdGFiMV9yZWNvcmRzXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGQ+eyRyZWNvcmQuX2RhdGV0aW1lJH08L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0ZD57JHJlY29yZC5fZGV2aWNlJH08L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90Ym9keT5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGZvb3Q+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRyPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdFxcdDx0ZCBjb2xzcGFuPVxcXCI0XFxcIiBjbGFzcz1cXFwidGV4dC1jZW50ZXJcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdFxcdFxcdDxkaXYgc3QtcGFnaW5hdGlvbj1cXFwiXFxcIiBzdC1pdGVtcy1ieS1wYWdlPVxcXCIxMFxcXCIgc3QtZGlzcGxheWVkLXBhZ2VzPVxcXCI3XFxcIiBzdC1wYWdlc2l6ZWxpc3Q9XFxcIjEwLDUwLDEwMCwxMDAwXFxcIj48L2Rpdj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHQ8L3RkPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90Zm9vdD5cXHJcXG5cXHRcXHRcXHRcXHQ8L3RhYmxlPlxcclxcblxcdFxcdFxcdDwvZGl2PlxcclxcblxcdFxcdFxcdDxkaXYgaWQ9XFxcInRhYjJcXFwiIGNsYXNzPVxcXCJ0YWItcGFuZSBmYWRlXFxcIiBuZy1jb250cm9sbGVyPVxcXCJ0YWIyXFxcIiBzdHlsZT1cXFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogMTAwJTsgaGVpZ2h0OiBjYWxjKDEwMCUgLSA0MnB4KTsgdG9wOiA0MnB4O1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0PHRhYmxlIHN0LXRhYmxlPVxcXCJ0YWIyX3JlY29yZHNcXFwiIHN0LXNhZmUtc3JjPVxcXCJzYWZlX3RhYjJfcmVjb3Jkc1xcXCIgY2xhc3M9XFxcInRhYmxlIHRhYmxlLXN0cmlwZWRcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dHIgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6ICMyQTY2QUI7IGNvbG9yOiB3aGl0ZTtcXFwiPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD50aW1lPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+ZGV2aWNlPC90aD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDx0ciBzdHlsZT1cXFwiYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGg+PGlucHV0IHN0LXNlYXJjaD1cXFwidGltZVxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgcGxhY2Vob2xkZXI9XFxcInRpbWUgc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0aD48aW5wdXQgc3Qtc2VhcmNoPVxcXCJkZXZpY2VcXFwiIGNsYXNzPVxcXCJmb3JtLWNvbnRyb2xcXFwiIHBsYWNlaG9sZGVyPVxcXCJkZXZpY2Ugc2VhcmNoIC4uLlxcXCIgdHlwZT1cXFwidGV4dFxcXCIgLz48L3RoPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdHI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PC90aGVhZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8dGJvZHkgc3R5bGU9XFxcImJhY2tncm91bmQtY29sb3I6IHdoaXRlO1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRyIG5nLXJlcGVhdD1cXFwicmVjb3JkIGluIHRhYjJfcmVjb3Jkc1xcXCI+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0PHRkPnskcmVjb3JkLl9kYXRldGltZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8dGQ+eyRyZWNvcmQuX2RldmljZSR9PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGJvZHk+XFxyXFxuXFx0XFx0XFx0XFx0XFx0PHRmb290PlxcclxcblxcdFxcdFxcdFxcdFxcdFxcdDx0cj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHQ8dGQgY29sc3Bhbj1cXFwiNFxcXCIgY2xhc3M9XFxcInRleHQtY2VudGVyXFxcIj5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHRcXHRcXHQ8ZGl2IHN0LXBhZ2luYXRpb249XFxcIlxcXCIgc3QtaXRlbXMtYnktcGFnZT1cXFwiMTBcXFwiIHN0LWRpc3BsYXllZC1wYWdlcz1cXFwiN1xcXCIgc3QtcGFnZXNpemVsaXN0PVxcXCIxMCw1MCwxMDAsMTAwMFxcXCI+PC9kaXY+XFxyXFxuXFx0XFx0XFx0XFx0XFx0XFx0XFx0PC90ZD5cXHJcXG5cXHRcXHRcXHRcXHRcXHRcXHQ8L3RyPlxcclxcblxcdFxcdFxcdFxcdFxcdDwvdGZvb3Q+XFxyXFxuXFx0XFx0XFx0XFx0PC90YWJsZT5cXHJcXG5cXHRcXHRcXHQ8L2Rpdj5cXHJcXG5cXHRcXHQ8L2Rpdj5cXHJcXG5cXHQ8L2Rpdj5cXHJcXG5cXHJcXG5KYXZhc2NyaXB0OlxcclxcblxcclxcbiAgICA8c2NyaXB0IHNyYz1cXFwiL3N0YXRpY3Mvc2NyaXB0cy9hbmd1bGFyLm1pbi5qc1xcXCI+PC9zY3JpcHQ+XFxyXFxuXFx0PHNjcmlwdCBzcmM9XFxcIi9zdGF0aWNzL3NjcmlwdHMvU21hcnQtVGFibGUtMi4xLjgvc21hcnQtdGFibGUubWluLmpzXFxcIj48L3NjcmlwdD5cXHJcXG5cXHQ8c2NyaXB0PlxcclxcblxcdHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnbWFwJywgWydzbWFydC10YWJsZSddKTtcXHJcXG5cXHRhcHAgPSBhbmd1bGFyLm1vZHVsZSgnbWFwJykuY29uZmlnKGZ1bmN0aW9uICgkaHR0cFByb3ZpZGVyLCAkaW50ZXJwb2xhdGVQcm92aWRlcikge1xcclxcblxcdFxcdCRodHRwUHJvdmlkZXIuZGVmYXVsdHMuaGVhZGVycy5jb21tb25bJ1gtUmVxdWVzdGVkLVdpdGgnXSA9ICdYTUxIdHRwUmVxdWVzdCc7XFxyXFxuXFx0XFx0JGludGVycG9sYXRlUHJvdmlkZXIuc3RhcnRTeW1ib2woJ3skJyk7XFxyXFxuXFx0XFx0JGludGVycG9sYXRlUHJvdmlkZXIuZW5kU3ltYm9sKCckfScpO1xcclxcblxcdH0pO1xcclxcblxcdGFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUpIHtcXHJcXG5cXHRcXHQkcm9vdFNjb3BlLiRvbignc2NvcGUuc3RvcmVkJywgZnVuY3Rpb24gKGV2ZW50LCBkYXRhKSB7XFxyXFxuXFx0XFx0XFx0Y29uc29sZS5sb2coXFxcInNjb3BlLnN0b3JlZFxcXCIsIGRhdGEpO1xcclxcblxcdFxcdH0pO1xcclxcblxcdH0pO1xcclxcblxcdGFwcC5jb250cm9sbGVyKCd0YWIxJywgWyckc2NvcGUnLCAnJGh0dHAnLCAnU2NvcGVzJywgZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsIFNjb3Blcykge1xcclxcblxcdFxcdFNjb3Blcy5zdG9yZSgndGFiMScsICRzY29wZSk7XFxyXFxuXFx0XFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSBmYWxzZTtcXHJcXG5cXHRcXHQkc2NvcGUuZ2V0X3JlY29yZHMgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0aWYoJHNjb3BlLmdvdF90YWIxX3JlY29yZHMpIHJldHVybjtcXHJcXG5cXHRcXHRcXHR2YXIgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSlNPTigpLnNsaWNlKDAsMTApO1xcclxcblxcdFxcdFxcdHZhciB1cmwgPSBGbGFzay51cmxfZm9yKCdyZWNvcmRlci5yZWNvcmRfbGlzdCcsIHtpbmZvX3R5cGU6IDEsIGZyb21fZGF0ZTogdG9kYXksIHRvX2RhdGU6IHRvZGF5fSk7XFxyXFxuXFx0XFx0XFx0JGh0dHAuZ2V0KHVybCkuc3VjY2VzcyhcXHJcXG5cXHRcXHRcXHRcXHRmdW5jdGlvbihkYXRhKXtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUudGFiMV9yZWNvcmRzID0gZGF0YTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIxX3JlY29yZHMgPSBbXS5jb25jYXQoJHNjb3BlLnRhYjFfcmVjb3Jkcyk7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLmdvdF90YWIxX3JlY29yZHMgPSB0cnVlO1xcclxcblxcdFxcdFxcdFxcdH1cXHJcXG5cXHRcXHRcXHQpLmVycm9yKGZ1bmN0aW9uKHJlc3BvbnNlKXtcXHJcXG5cXHRcXHRcXHRcXHRhbGVydChyZXNwb25zZSk7XFxyXFxuXFx0XFx0XFx0fSkuZmluYWxseShmdW5jdGlvbiAoKXtcXHJcXG5cXHRcXHRcXHR9KTtcXHJcXG5cXHRcXHR9XFxyXFxuXFx0XFx0JHNjb3BlLmFkZFJhbmRvbUl0ZW0gPSBmdW5jdGlvbiBhZGRSYW5kb21JdGVtKCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicxJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFx0XFx0JHNjb3BlLnVuc2hpZnRfcmVjb3JkID0gZnVuY3Rpb24gKHJlY29yZCkge1xcclxcblxcdFxcdFxcdCRzY29wZS5zYWZlX3RhYjFfcmVjb3Jkcy51bnNoaWZ0KHtfZGF0ZXRpbWU6JzIwMTctMDItMjMnLCBfZGV2aWNlOicyJ30pO1xcclxcblxcdFxcdH07XFxyXFxuXFx0XFx0JHNjb3BlLmdldF9yZWNvcmRzKCk7XFxyXFxuXFx0fV0pO1xcclxcblxcdGFwcC5jb250cm9sbGVyKCd0YWIyJywgWyckc2NvcGUnLCAnJGh0dHAnLCAnU2NvcGVzJywgZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsIFNjb3Blcykge1xcclxcblxcdFxcdFNjb3Blcy5zdG9yZSgndGFiMicsICRzY29wZSk7XFxyXFxuXFx0XFx0JHNjb3BlLmdvdF90YWIyX3JlY29yZHMgPSBmYWxzZTtcXHJcXG5cXHRcXHQkc2NvcGUuZ2V0X3JlY29yZHMgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0aWYoJHNjb3BlLmdvdF90YWIyX3JlY29yZHMpIHJldHVybjtcXHJcXG5cXHRcXHRcXHR2YXIgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSlNPTigpLnNsaWNlKDAsMTApO1xcclxcblxcdFxcdFxcdHZhciB1cmwgPSBGbGFzay51cmxfZm9yKCdyZWNvcmRlci5yZWNvcmRfbGlzdCcsIHtpbmZvX3R5cGU6IDIsIGZyb21fZGF0ZTogdG9kYXksIHRvX2RhdGU6IHRvZGF5fSk7XFxyXFxuXFx0XFx0XFx0JGh0dHAuZ2V0KHVybCkuc3VjY2VzcyhcXHJcXG5cXHRcXHRcXHRcXHRmdW5jdGlvbihkYXRhKXtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUudGFiMl9yZWNvcmRzID0gZGF0YTtcXHJcXG5cXHRcXHRcXHRcXHRcXHQkc2NvcGUuc2FmZV90YWIyX3JlY29yZHMgPSBbXS5jb25jYXQoJHNjb3BlLnRhYjJfcmVjb3Jkcyk7XFxyXFxuXFx0XFx0XFx0XFx0XFx0JHNjb3BlLmdvdF90YWIyX3JlY29yZHMgPSB0cnVlO1xcclxcblxcdFxcdFxcdFxcdH1cXHJcXG5cXHRcXHRcXHQpLmVycm9yKGZ1bmN0aW9uKHJlc3BvbnNlKXtcXHJcXG5cXHRcXHRcXHRcXHRhbGVydChyZXNwb25zZSk7XFxyXFxuXFx0XFx0XFx0fSkuZmluYWxseShmdW5jdGlvbiAoKXtcXHJcXG5cXHRcXHRcXHR9KTtcXHJcXG5cXHRcXHR9O1xcclxcbiBcXHRcXHQkc2NvcGUudW5zaGlmdF9yZWNvcmQgPSBmdW5jdGlvbiAocmVjb3JkKSB7XFxyXFxuXFx0XFx0XFx0JHNjb3BlLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG5cXHRcXHR9O1xcclxcblxcdH1dKTtcXHJcXG5cXHRhcHAuY29udHJvbGxlcigncHJldmlldycsIFsnJHNjb3BlJywgJyRodHRwJywgJ1Njb3BlcycsIGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCBTY29wZXMpIHtcXHJcXG5cXHRcXHQkKCdhW2RhdGEtdG9nZ2xlPVxcXCJ0YWJcXFwiXScpLm9uKCdzaG93bi5icy50YWInLCBmdW5jdGlvbiAoZSkge1xcclxcblxcdFxcdFxcdHZhciB0YXJnZXQgPSAkKGUudGFyZ2V0KS5hdHRyKFxcXCJocmVmXFxcIikgLy8gYWN0aXZhdGVkIHRhYlxcclxcblxcdFxcdFxcdHZhciByZWxhdGVkVGFyZ2V0ID0gJChlLnJlbGF0ZWRUYXJnZXQpLmF0dHIoXFxcImhyZWZcXFwiKVxcclxcblxcdFxcdFxcdGlmICh0YXJnZXQgPT0gXFxcIiN0YWIxXFxcIikge1xcclxcblxcdFxcdFxcdFxcdFNjb3Blcy5nZXQoJ3RhYjEnKS5nZXRfcmVjb3JkcygpO1xcclxcblxcdFxcdFxcdH0gZWxzZSBpZiAodGFyZ2V0ID09IFxcXCIjdGFiMlxcXCIpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIyJykuZ2V0X3JlY29yZHMoKTtcXHJcXG5cXHRcXHRcXHR9XFxyXFxuXFx0XFx0fSlcXHJcXG5cXHRcXHQkc2NvcGUuYXBwZW5kX3JlY29yZCA9IGZ1bmN0aW9uKGluZm9fdHlwZSwgcmVjb3JkKXtcXHJcXG5cXHRcXHRcXHRpZiAoaW5mb190eXBlID09IDEpIHtcXHJcXG5cXHRcXHRcXHRcXHRTY29wZXMuZ2V0KCd0YWIxJykudW5zaGlmdF9yZWNvcmQocmVjb3JkKTtcXHJcXG5cXHRcXHRcXHR9IGVsc2UgaWYgKGluZm9fdHlwZSA9PSAyKSB7XFxyXFxuXFx0XFx0XFx0XFx0U2NvcGVzLmdldCgndGFiMicpLnNhZmVfdGFiMV9yZWNvcmRzLnVuc2hpZnQoSlNPTi5wYXJzZShyZWNvcmQpKTtcXHJcXG5cXHRcXHRcXHR9XFxyXFxuXFx0XFx0fTtcXHJcXG5cXHRcXHR2YXIgdXJsID0gXFxcIndzOi8vXFxcIiArIHdpbmRvdy5sb2NhdGlvbi5ocmVmLnJlcGxhY2UoL2h0dHBzPzpcXFxcL1xcXFwvLywnJykucmVwbGFjZSgvXFxcXC8uKi8sJycpICsgXFxcIi93c1xcXCI7XFxyXFxuXFx0XFx0dmFyIHdzID0gbmV3IFdlYlNvY2tldCh1cmwpO1xcclxcblxcdFxcdHdzLm9uZXJyb3IgPSBmdW5jdGlvbiAoZSkge1xcclxcblxcdFxcdFxcdGFsZXJ0KGUpO1xcclxcblxcdFxcdFxcdGNvbnNvbGUubG9nKFxcXCJXZWJTb2NrZXQgRXJyb3JcXFwiICsgZSk7XFxyXFxuXFx0XFx0XFx0Y29uc29sZS5sb2coZSk7XFxyXFxuXFx0XFx0fVxcclxcblxcdFxcdHdzLm9uY2xvc2UgPSBmdW5jdGlvbiAoKSB7XFxyXFxuXFx0XFx0XFx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXFxcImxvZ29cXFwiKS5zdHlsZS5jb2xvciA9IFxcXCJncmF5XFxcIjtcXHJcXG5cXHRcXHR9XFxyXFxuXFx0XFx0d3Mub25tZXNzYWdlID0gZnVuY3Rpb24gKGUpIHtcXHJcXG5cXHRcXHRcXHR2YXIgb2JqID0gSlNPTi5wYXJzZShlLmRhdGEpO1xcclxcblxcdFxcdFxcdCRzY29wZS5hcHBlbmRfcmVjb3JkKG9iai5zdGF0ZSwgb2JqLnJlY29yZCk7XFxyXFxuXFx0XFx0fVxcclxcblxcdH1dKTtcXHJcXG5cXHRcXHJcXG5cXHRhcHAuZmFjdG9yeSgnU2NvcGVzJywgZnVuY3Rpb24gKCRyb290U2NvcGUpIHtcXHJcXG5cXHRcXHR2YXIgbWVtID0ge307XFxyXFxuXFx0XFx0cmV0dXJuIHtcXHJcXG5cXHRcXHRcXHRzdG9yZTogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcXHJcXG5cXHRcXHRcXHRcXHQkcm9vdFNjb3BlLiRlbWl0KCdzY29wZS5zdG9yZWQnLCBrZXkpO1xcclxcblxcdFxcdFxcdFxcdG1lbVtrZXldID0gdmFsdWU7XFxyXFxuXFx0XFx0XFx0fSxcXHJcXG5cXHRcXHRcXHRnZXQ6IGZ1bmN0aW9uIChrZXkpIHtcXHJcXG5cXHRcXHRcXHRcXHRyZXR1cm4gbWVtW2tleV07XFxyXFxuXFx0XFx0XFx0fVxcclxcblxcdFxcdH07XFxyXFxuXFx0fSk7XFxyXFxuXFx0PC9zY3JpcHQ+XFxyXFxuXFxyXFxuXFxyXFxuICBbMV06IGh0dHA6Ly9wbG5rci5jby9lZGl0L3dseXVIVlVRSE5tMlJjVk5HWUprP3A9cHJldmlld1wiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0OC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDhcIixcbiAgICBcImlkXCI6IDIwNzQ1MDExMSxcbiAgICBcIm51bWJlclwiOiA3NDgsXG4gICAgXCJ0aXRsZVwiOiBcInN0LXBlcnNpc3QgZXhhbXBsZSBpcyBub3Qgd29ya2luZyB3aXRoIHN0LXBpcGVcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImpvaG5pY29cIixcbiAgICAgIFwiaWRcIjogMTk1NjQ1OTIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE5NTY0NTkyP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY29cIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vam9obmljb1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiAyMjU4NjI0MjMsXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvbm90JTIwcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwibmFtZVwiOiBcIm5vdCByZXByb2R1Y2libGVcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImViNjQyMFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjU5NDM4NTA2LFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL3RvJTIwYmUlMjBjbG9zZWQ6JTIwZG9lcyUyMG5vdCUyMGZvbGxvdyUyMGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJuYW1lXCI6IFwidG8gYmUgY2xvc2VkOiBkb2VzIG5vdCBmb2xsb3cgZ3VpZGVsaW5lc1wiLFxuICAgICAgICBcImNvbG9yXCI6IFwiZmJjYTA0XCIsXG4gICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMi0xNFQwODozODo1NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTE0VDEzOjExOjU3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgLiB0aGlzIGV4YW1wbGUgaXMgbm90IHdvcmtpbmcgYXQgYWxsIHdpdGggc2VydmVyIHBhZ2luYXRpb24gXFxyXFxuaHR0cDovL3BsbmtyLmNvL2VkaXQvZWt3aU50P3A9cHJldmlld1xcclxcblxcclxcbml0IHNhdmVkIG9ubHkgdGhlIGRhdGEgb2YgZmlyc3QgcGFnZSBhbmQgZGVmYXVsdCBzb3J0IGluIGxvY2FsIHN0b3JhZ2UgYW5kIGRpZCBub3QgdXBkYXRlIHRoZSB0YWJsZVxcclxcblxcclxcbm15IHBpcGUgZnVuY3Rpb24gOlxcclxcblxcclxcblxcclxcbmAgICAgdGhpcy5jYWxsU2VydmVyID0gZnVuY3Rpb24gY2FsbFNlcnZlcih0YWJsZVN0YXRlKSB7XFxyXFxuXFxyXFxuICAgICAgICB2bS5pc0xvYWRpbmcgPSB0cnVlO1xcclxcbiAgICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XFxyXFxuICAgICAgICB2YXIgc3RhcnQgPSBwYWdpbmF0aW9uLnN0YXJ0IHx8IDA7ICBcXHJcXG4gICAgICAgIHZhciBudW1iZXIgPSBwYWdpbmF0aW9uLm51bWJlciB8fCAxMFxcclxcblxcclxcbiAgICAgICAgdm0uc3VibWl0ID0gZnVuY3Rpb24gKCl7XFxyXFxuICAgICAgICAgICAgdm0uaXNMb2FkaW5nID0gdHJ1ZTtcXHJcXG5cXHJcXG4gICAgICAgICAgICAkc2NvcGUuZmlsdGVyc0Zvcm0uJHNldFByaXN0aW5lKCk7XFxyXFxuICAgICAgICAgICAgc2VydmVyQ2FsbCgwLCAxMCwgdGFibGVTdGF0ZSxzZWFyY2hPYmopO1xcclxcbiAgICAgICAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XFxyXFxuICAgICAgICB9XFxyXFxuICAgICAgICBzZXJ2ZXJDYWxsKHN0YXJ0LCBudW1iZXIsIHRhYmxlU3RhdGUsc2VhcmNoT2JqKTtcXHJcXG5cXHJcXG4gICAgICB9O1xcclxcbmBcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0Ny9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0N1wiLFxuICAgIFwiaWRcIjogMjA1ODQ5MTQxLFxuICAgIFwibnVtYmVyXCI6IDc0NyxcbiAgICBcInRpdGxlXCI6IFwiSXNzdWUgIzcyNyBzdC1waXBlIG5vdCB3b3JraW5nIHdpdGggc3Qtc2FmZS1zcmNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcIkFsZXhOR1wiLFxuICAgICAgXCJpZFwiOiA4MjI4MTAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzgyMjgxMD92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkdcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vQWxleE5HXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4TkcvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9BbGV4Tkcvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvQWxleE5HL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL0FsZXhORy9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMi0wN1QxMDo0MDo1OFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTA3VDExOjA4OjEyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJwdWxsX3JlcXVlc3RcIjoge1xuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGxzLzc0N1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0N1wiLFxuICAgICAgXCJkaWZmX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0Ny5kaWZmXCIsXG4gICAgICBcInBhdGNoX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzc0Ny5wYXRjaFwiXG4gICAgfSxcbiAgICBcImJvZHlcIjogXCItIG9wdGlvbmFsIGFiaWxpdHkgdG8gcGlwZSBvbiBzYWZlY29weSBjaGFuZ2UgdXNpbmcgZXhpc3RpbmcgcGlwZUFmdGVyU2FmZUNvcHkgZmxhZyB1c2luZyB1bnByZXZlbnRQaXBlT25XYXRjaFwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQ0L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0NC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDRcIixcbiAgICBcImlkXCI6IDIwNDExMTA3MCxcbiAgICBcIm51bWJlclwiOiA3NDQsXG4gICAgXCJ0aXRsZVwiOiBcInN0LXNvcnQgd2l0aCBmdW5jdGlvbiByZXR1cm5pbmcgYSBwcm9taXNlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJza2lkdmRcIixcbiAgICAgIFwiaWRcIjogNTgzMjUxMyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvNTgzMjUxMz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vc2tpZHZkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9za2lkdmQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2tpZHZkL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3NraWR2ZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDIsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0zMFQxOTo0ODo0OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAyLTAxVDEyOjUxOjAyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuXFxyXFxuSSBhbSB1c2luZyBhbmd1bGFyIHYxLjUuOSBhbmQgc21hcnQtdGFibGUgdjIuMS4wLiAgSSBoYXZlIHNlYXJjaGVkIGZvciBhbnN3ZXJzIHRvIG15IHF1ZXN0aW9uIGJlbG93LCBidXQgaGF2ZSBub3QgYmVlbiBhYmxlIHRvIGZpbmQgYW55IHRoYXQgYWRkcmVzcyB0aGUgc3BlY2lmaWMgcHJvbWlzZS9hc3luYyBhdHRyaWJ1dGVzIG9mIGl0IC0gYXBvbG9naWVzIGlmIHRoaXMgaGFzIGJlZW4gYWRkcmVzc2VkIHNvbWV3aGVyZSBhbmQvb3IgaXMgYSBkdXBsaWNhdGUgLSBpZiBzbywga2luZGx5IHBsZWFzZSByZWZlciBtZSB0aGVyZS5cXHJcXG5cXHJcXG5JIGhhdmUgYmVlbiB1c2luZyBib3RoIHN0LXRhYmxlPVxcXCJkaXNwbGF5ZWRJdGVtc1xcXCIgYW5kIHN0LXNhZmUtc3JjPVxcXCJpdGVtc1xcXCIgZGlyZWN0aXZlcyBpbiBjb21iaW5hdGlvbiB3aXRoIHN0LXNvcnQuICBUaGlzIGNvbWJpbmF0aW9uIHN1Y2Nlc3NmdWxseSBhbmQgcmVsaWFibHkgd29ya3MgZm9yIG5lYXJseSBhbGwgY29uZGl0aW9ucyBJIGhhdmUgcnVuIGFjcm9zcy4gIFRoaXMgaW5jbHVkZXMgc2NlbmFyaW9zIHdoZXJlIHRoZSBzdC1zb3J0IGlzIGZ1bmN0aW9uIGJhc2VkLiAgSG93ZXZlciwgSSByZWNlbnRseSBlbmNvdW50ZXJlZCBhbiBuZWVkIHRvIGhhdmUgYSBmdW5jdGlvbiBiYXNlZCBzdC1zb3J0IHRoYXQgcmV0dXJucyBhIHByb21pc2UgaW5zdGVhZCBvZiB0aGUgdmFsdWUgZGlyZWN0bHkgKGkuZS4gdGhlIGZ1bmN0aW9uIHdpbGwgYXN5bmNocm9ub3VzbHkgcmVzb2x2ZSB0aGUgdmFsdWUsIGF0IGEgc2xpZ2h0bHkgbGF0ZXIgdGltZSAtIHdoZW4gaXQgYmVjb21lcyBhdmFpbGFibGUpLlxcclxcblxcclxcbk15IHF1ZXN0aW9uIGlzLCBzaG91bGQgdGhlIHN0LXNvcnQgYmUgZXhwZWN0ZWQgdG8gcHJvZHVjZSBhIHByZWRpY3RhYmxlIG9yZGVyaW5nIG9mIHRoZSByb3dzIGluIHRoYXQgY2FzZT8gIElmIHNvLCBpdCBkb2VzIG5vdCBhcHBlYXIgdG8gYmUuICBJIGFtIHRoZW9yaXppbmcgdGhhdCB0aGlzIG1heSBiZSBkbyB0byB0aGUgZmFjdCB0aGF0IHRoZSBhc3NvY2lhdGVkIHZhbHVlcyBhcmUgbm90IGF2YWlsYWJsZSB0byB0aGUgc29ydCBhbGdvcml0aG0gYWxsIHVwIGZyb250IC0gYnV0IHJhdGhlciBzdHJhZ2dsZSBpbiBpbiBhbiB1bnByZWRpY3RhYmxlIG9yZGVyIGFuZCB0aW1lIGZyYW1lLiAgQnkgdGhlIHdheSwgbm8gZXJyb3JzIG9yIG90aGVyIGluZGljYXRpb25zIGFyZSByZXR1cm5lZCB0aGF0IGEgcHJvYmxlbSBtYXkgZXhpc3QuICBTaG91bGQgSSBleHBlY3QgdGhpcyB0byB3b3JrLCBvciBpcyB0aGlzIGEga25vd24gbGltaXRhdGlvbj8gIEFyZSB0aGVyZSBhZGRpdGlvbmFsIGl0ZW1zIHRoYXQgY2FuIGJlIGRvbmUgdG8gbWFrZSBpdCB3b3JrIG9uIG15IHBhcnQgb3Igb3RoZXJ3aXNlIC0gaWYgc28sIEknZCBncmVhdGx5IGFwcHJlY2lhdGUgYW55IHRpcHMgb3IgdGhvdWdodHMgeW91IG1heSBoYXZlP1xcclxcblxcclxcblRJQSFcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDJcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0Mi9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDIvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDIvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQyXCIsXG4gICAgXCJpZFwiOiAyMDA4Mjk1NTAsXG4gICAgXCJudW1iZXJcIjogNzQyLFxuICAgIFwidGl0bGVcIjogXCJzdC1zb3J0LWRlZmF1bHQgb3ZlcndyaXRlcyBzdC1wZXJzaXN0IHN0YXRlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJhbmd1c3R1c1wiLFxuICAgICAgXCJpZFwiOiA5MTM3ODEwLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS85MTM3ODEwP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VzdHVzXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuZ3VzdHVzL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5ndXN0dXMvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmd1c3R1cy9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0xNFQyMTowMzoxM1pcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTE0VDIxOjAzOjEzWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiKipXb3JraW5nIGV4YW1wbGU6KipcXHJcXG5odHRwOi8vcGxua3IuY28vZWRpdC9VSTVyOXI/cD1wcmV2aWV3XFxyXFxuSXQncyBhIGZvcmsgb2YgdGhlIGBzdC1wZXJzaXN0YCBleGFtcGxlOyBJJ3ZlIGFkZGVkIGBzdC1zb3J0LWRlZmF1bHRgIGZpZWxkIGFuZCB1cGRhdGVkIGBzbWFydC10YWJsZWAgdG8gYHYyLjEuOGAgKG1hc3RlciBhcyBvZiBub3cpLlxcclxcblxcclxcbioqUmVwcm9kdWN0aW9uOioqXFxyXFxuMS4gVXNlIHBhZ2luYXRpb24gYW5kIHNvcnQgYnkgYW55IGNvbHVtbi5cXHJcXG4yLiByZWZyZXNoIHByZXZpZXdcXHJcXG5cXHJcXG4qKlJlc3VsdDoqKlxcclxcblRoZSBwZXJzaXN0ZWQgc3RhdGUgaXMgYXBwbGllZCBiZWZvcmUgdGhlIGRlZmF1bHQgc29ydCBvcmRlciBpcyBhcHBsaWVkLlxcclxcbioqRXhwZWN0ZWQ6KipcXHJcXG5QZXJzaXN0ZWQgc3RhdGUgc2hvdWxkIGJlIGFwcGxpZWQgbGFzdCB0aHVzIG92ZXJ3cml0aW5nIGRlZmF1bHQgc3RhdGUgb3JkZXIuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxXCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83NDEvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxL2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzQxL2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzc0MVwiLFxuICAgIFwiaWRcIjogMjAwNjQyNDE4LFxuICAgIFwibnVtYmVyXCI6IDc0MSxcbiAgICBcInRpdGxlXCI6IFwiSXMgdGhlcmUgYXJlIGEgd2F5IGZvciBhIHN0cmljdCBzZWFyY2ggaW4gY3VzdG9tIGRpcmVjdGl2ZT8gXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJreXJvZGFiYXNlXCIsXG4gICAgICBcImlkXCI6IDI1MTAzMjQzLFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMC5naXRodWJ1c2VyY29udGVudC5jb20vdS8yNTEwMzI0Mz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2t5cm9kYWJhc2VcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2Uvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva3lyb2RhYmFzZS9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2t5cm9kYWJhc2UvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9reXJvZGFiYXNlL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMzU1Mjk4NTksXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvZW5oYW5jZW1lbnRcIixcbiAgICAgICAgXCJuYW1lXCI6IFwiZW5oYW5jZW1lbnRcIixcbiAgICAgICAgXCJjb2xvclwiOiBcIjg0YjZlYlwiLFxuICAgICAgICBcImRlZmF1bHRcIjogdHJ1ZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDYsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0xM1QxNDoyNzowMlpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTE5VDA5OjAxOjE3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxyXFxuXFxyXFxuR3JlYXQgbGliISA6KVxcclxcblxcclxcbklzIHRoZXJlIGFyZSBhIHdheSB0byBtYXRjaCB0aGUgZXhhY3Qgc2VhcmNoIHRlcm0gaW5zdGVhZCBvZiBhIHN1YnN0cmluZz9cXHJcXG5DdXJyZW50bHkgaWYgSSBzZWFyY2ggZm9yIElEID0gNCwgdGhlIHNlYXJjaCBmdW5jdGlvbiByZXR1cm5zIElEID0gNCBhbmQgSUQgPSA0MDAwLCBJRCA9IDQwMDEgZXRjLlxcclxcbkhlcmUgaXMgYSBjb2RlIHNuaXBwZXQ6IFxcclxcblxcclxcbmAgLmRpcmVjdGl2ZShcXFwiY3VzdG9tV2F0Y2hGaWx0ZXJzXFxcIiwgZnVuY3Rpb24gKCkge1xcclxcblxcclxcbiAgICByZXR1cm4ge1xcclxcbiAgICAgIHJlc3RyaWN0OiBcXFwiQVxcXCIsXFxyXFxuICAgICAgcmVxdWlyZTogXFxcIl5zdFRhYmxlXFxcIixcXHJcXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XFxyXFxuICAgICAgXFx0c2NvcGUuJHdhdGNoQ29sbGVjdGlvbihhdHRycy5jdXN0b21XYXRjaEZpbHRlcnMsIGZ1bmN0aW9uIChmaWx0ZXJzKSB7XFxyXFxuXFxyXFxuICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSB7fTtcXHJcXG5cXHJcXG4gICAgICAgICAgYW5ndWxhci5mb3JFYWNoKGZpbHRlcnMsIGZ1bmN0aW9uICh2YWwsIGZpbHRlcikge1xcclxcbiAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSB7XFxyXFxuICAgICAgICAgICAgICByZXR1cm47XFxyXFxuICAgICAgICAgICAgfVxcclxcblxcdFxcdFxcclxcbiAgICAgICAgICAgIGN0cmwuc2VhcmNoKHZhbC50b1N0cmluZygpLCBmaWx0ZXIpO1xcclxcbiAgICAgICAgICB9KTtcXHJcXG5cXHJcXG4gICAgICAgICAgY3RybC5waXBlKCk7XFxyXFxuXFxyXFxuICAgICAgICB9KTtcXHJcXG4gICAgICB9XFxyXFxuICAgIH07XFxyXFxuICB9KTtgXFxyXFxuXFxyXFxuUGxlYXNlIGFkdmlzZVwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM5L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzlcIixcbiAgICBcImlkXCI6IDE5OTI5NjgwOCxcbiAgICBcIm51bWJlclwiOiA3MzksXG4gICAgXCJ0aXRsZVwiOiBcIkhvdyBjYW4gSSBzZWxlY3QgcGFnZSBhbmQgc29ydCBtYW51YWxseSB3aXRoIHNlcnZlciBzaWRlIHBhZ2luYXRpb24gP1wiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiam9obmljb1wiLFxuICAgICAgXCJpZFwiOiAxOTU2NDU5MixcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTk1NjQ1OTI/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljb1wiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9qb2huaWNvXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2pvaG5pY28vc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9qb2huaWNvL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvam9obmljby9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNy0wMS0wNlQyMTo0NDozOVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE3LTAxLTEwVDA3OjE0OjUyWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkgLiBpbSB1c2luZyBzbWFydCB0YWJsZSB3aXRoIHBhZ2luYXRpb24gaW4gc2VydmVyIHNpZGUuXFxyXFxuSSBhbSBrZWVwIHRoZSBzb3J0aW5nIGFuZCBwYWdpbmF0aW9uIGRldGFpbHMgaW4gbG9jYWwgc3RvcmFnZSBvciB1cmwgLFxcclxcbm15IHF1ZXN0aW9uIGlzIGhvdyBjYW4gSSBrZWVwIHRoZSBwYWdlIHdoZW4gdGhlIHVzZXIgd2FzIGFuZCB3aGVuIGhlIHdpbGwgY29tZSBiYWNrIHdpdGggdGhlIHNwZWNpZmljIHVybCBvciBqdXN0IGJhY2sgdG8gdGhlIHBhZ2UgaGUgd2lsbCBnZXQgdGhlIHNhbWUgcGFnZSBoZSB3YXMuP1xcclxcbnRoZSBzYW1lIGlzc3VlIGlzIHdpdGggU29ydGluZywgIEhvdyBjYW4gSSBzb3J0aW5nIGJ5IHVybCBwYXJhbWV0ZXJcXHJcXG5ob3cgY2FuIEkgZG8gdGhhdCwgICA/XFxyXFxuXFxyXFxuXFxyXFxudGh4IGZvciB0aGUgaGVscFwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczOC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzhcIixcbiAgICBcImlkXCI6IDE5NzQ5NzM4MixcbiAgICBcIm51bWJlclwiOiA3MzgsXG4gICAgXCJ0aXRsZVwiOiBcIkNhbid0IGxvYWQgaHR0cCBjb250ZW50IGZyb20gcGx1bmtlciB3aGVuIG9wZW5pbmcgdHV0b3JpYWwgc2l0ZSB2aWEgaHR0cHNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImFuYXRvbHkzMTRcIixcbiAgICAgIFwiaWRcIjogMTY0MTU5NCxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTY0MTU5ND92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0XCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FuYXRvbHkzMTRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYW5hdG9seTMxNC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FuYXRvbHkzMTQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hbmF0b2x5MzE0L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTI1VDExOjMxOjMyWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMjVUMTE6MzE6MzJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJXaGVuIEkgb3BlbiB0aGUgZm9sbG93aW5nIHdlYnNpdGU6IGh0dHBzOi8vbG9yZW56b2ZveDMuZ2l0aHViLmlvL3NtYXJ0LXRhYmxlLXdlYnNpdGUvIHNvbWUgY29udGVudCBub3QgbG9hZGluZyBidXQgdGhyb3dpbmcgZXhjZXB0aW9uIGluIGEgamF2YXNjcmlwdCBjb25zb2xlOlxcclxcblxcclxcbj4gTWl4ZWQgQ29udGVudDogVGhlIHBhZ2UgYXQgJ2h0dHBzOi8vbG9yZW56b2ZveDMuZ2l0aHViLmlvL3NtYXJ0LXRhYmxlLXdlYnNpdGUvJyB3YXMgbG9hZGVkIG92ZXIgSFRUUFMsIGJ1dCByZXF1ZXN0ZWQgYW4gaW5zZWN1cmUgcmVzb3VyY2UgJ2h0dHA6Ly9lbWJlZC5wbG5rci5jby9TT2NVazEnLiBUaGlzIHJlcXVlc3QgaGFzIGJlZW4gYmxvY2tlZDsgdGhlIGNvbnRlbnQgbXVzdCBiZSBzZXJ2ZWQgb3ZlciBIVFRQUy5cXHJcXG5cXHJcXG5UbyBmaXggdGhpcyBhbGwgaHR0cDovL2V4YW1wbGUuY29tIGxpbmtzIHNob3VsZCBiZSBjaGFuZ2VkIHRvIC8vZXhhbXBsZS5jb21cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM3XCIsXG4gICAgXCJpZFwiOiAxOTY0NjE3MzYsXG4gICAgXCJudW1iZXJcIjogNzM3LFxuICAgIFwidGl0bGVcIjogXCJQb3NzaWJsZSBpc3N1ZSB3aXRoIHJlaW5pdGlhbGlzaW5nIHRoZSBzY29wZS5wYWdlcyBjb2xsZWN0aW9uIGluIHJlZHJhdyBmdW5jdGlvblwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwic2FubnlqYWNvYnNzb25cIixcbiAgICAgIFwiaWRcIjogMTE3ODc4MzEsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzExNzg3ODMxP3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL3Nhbm55amFjb2Jzc29uXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3Nhbm55amFjb2Jzc29uL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc2FubnlqYWNvYnNzb24vZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zYW5ueWphY29ic3Nvbi9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMi0xOVQxNjo0MToxMVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEyLTIwVDEwOjA0OjAwWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiQW5ndWxhciB2ZXJzaW9uOiAxLjUuOFxcclxcblNtYXJ0IHRhYmxlIHZlcnNpb246IDIuMS44XFxyXFxuXFxyXFxuaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2Jsb2IvbWFzdGVyL3NyYy9zdFBhZ2luYXRpb24uanNcXHJcXG48cHJlPlxcclxcbm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxcclxcbiAgLmRpcmVjdGl2ZSgnc3RQYWdpbmF0aW9uJywgWydzdENvbmZpZycsIGZ1bmN0aW9uIChzdENvbmZpZykge1xcclxcbi4uLi5cXHJcXG4gICAgICAgIGZ1bmN0aW9uIHJlZHJhdyAoKSB7XFxyXFxuLi4uLlxcclxcbiAgICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xcclxcbi4uLi5cXHJcXG48L3ByZT5cXHJcXG5cXHJcXG5XaGVuIHVwZGF0aW5nIHRoZSA8Y29kZT5zdC1pdGVtcy1ieS1wYWdlPC9jb2RlPiB2YWx1ZSBhIDxjb2RlPnJlZHJhdygpPC9jb2RlPiBpcyB0cmlnZ2VyZWQuIEluIHRoZSBjYXNlIHRoZSBuZXcgdmFsdWUgaXMgdGhlIGxlbmd0aCBvZiB0aGUgaXRlbXMgaW4gdGhlIGJhY2tpbmcgY29sbGVjdGlvbiA8Y29kZT48L2NvZGU+IHRoZSA8Y29kZT5zY29wZS5wYWdlczwvY29kZT4gY29sbGVjdGlvbiBpcyByZWluaXRpYWxpc2VkLiBcXHJcXG5cXHJcXG5JdCBzZWVtcyB0byBtZSB0aGF0IHdlIGFyZSBsb29zaW5nIG91ciByZWZlcmVucyB0byB0aGUgPGNvZGU+c2NvcGUucGFnZXM8L2NvZGU+IGNvbGxlY3Rpb24gaW4gdGhlIHBhZ2luYXRpb24uaHRtbCB0ZW1wbGF0ZS4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9ibG9iL21hc3Rlci9kaXN0L3NtYXJ0LXRhYmxlLmpzIFxcclxcbjxwcmU+XFxyXFxubmcubW9kdWxlKCdzbWFydC10YWJsZScsIFtdKS5ydW4oWyckdGVtcGxhdGVDYWNoZScsIGZ1bmN0aW9uICgkdGVtcGxhdGVDYWNoZSkge1xcclxcbiAgICAkdGVtcGxhdGVDYWNoZS5wdXQoJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCcsXFxyXFxuLi4uLi48L3ByZT5cXHJcXG5cXHJcXG5JZiB3ZSBpbnN0ZWFkIG9mIHJlaW5pdGlhbGlzaW5nIHRoZSBjb2RlPnNjb3BlLnBhZ2VzPC9jb2RlPiBjb2xsZWN0aW9uIGluIHRoZSA8Y29kZT5yZWRyYXcoKTwvY29kZT4gZnVuY3Rpb24gd2Ugc2V0IHRoZSBsZW5ndGggdG8gemVybyA8Y29kZT5zY29wZS5wYWdlcy5sZW5ndGggPSAwOzwvY29kZT4gd2Ugd2lsbCBtYWludGFpbiBvdXIgcmVmZXJlbmNlcy4gV2hlbiBjaGFuZ2luZyB0aGUgdmFsdWUgZnJvbSB0aGUgbGVuZ3RoIG9mIHRoZSBiYWNraW5nIGNvbGxlY3Rpb24gdG8gc29tZSBvdGhlciB2YWx1ZSB0aGUgcGFnaW5hdGlvbiB3aWxsIHdvcmsuIFxcclxcblxcclxcbkkgZGlzY292ZXJlZCB0aGUgaXNzdWUgd2hlbiBhZGRpbmcgYSBcXFwidmlldyBhbGxcXFwiIG9wdGlvbiBmb3IgYSBzbWFydCB0YWJsZS4gSSB0cmllZCB3aXRoIC0xIHRvIHNob3cgYWxsLCBob3dldmVyIHRoYXQgY2F1c2VkIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24ubnVtYmVyT2ZQYWdlcyB0byBiZWNvbWUgbmVnYXRpdmUgd2l0aCBhbGwga2luZHMgb2Ygc2lkZSBlZmZlY3RzLlxcclxcblxcclxcbkknbSBuZXcgdG8gSmF2YVNjcmlwdCBhbmQgQW5ndWxhckpTIHNvIEkgbWF5IHZlcnkgd2VsbCBoYXZlIG1pc3N1bmRlcnN0b2QgdGhlIGlzc3VlLiAgXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzYvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM2L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNlwiLFxuICAgIFwiaWRcIjogMTk1MjA3NzMzLFxuICAgIFwibnVtYmVyXCI6IDczNixcbiAgICBcInRpdGxlXCI6IFwiU21hcnQgVGFibGUgcGFnZ2luZyByZWZyZXNoaW5nIElzc3VlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJoZW1yYWpyYXZcIixcbiAgICAgIFwiaWRcIjogMjMzOTY4MzQsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzIzMzk2ODM0P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdlwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9oZW1yYWpyYXZcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hlbXJhanJhdi9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oZW1yYWpyYXYvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGVtcmFqcmF2L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTEzVDA5OjU1OjU5WlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMTVUMTA6Mjk6MDdaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSxcXHJcXG5ob3cgY2FuIGkgY29udHJvbCBwYWdlIHJlZnJlc2hpbmcgaW4gc21hcnQgdGFibGUgb24gcmVmaWxsIGluc2lkZSBhbmd1bGFyIGNvbnRyb2xsZXIgd2hlbiBhbnkgYWN0aW9uIHBlcmZvcm0uXFxyXFxuZm9yIGV4YSA6IC0gSSBhbSBvbiBwYWdlIG5vIDYgYW5kIGkgY2xhaW0gYW4gb3JkZXIgdGhlbiBjb250cm9sIGNvbWVzIG9uIGZpcnN0IHBhZ2Ugd2hlbiByZWZpbGwgc21hcnQgdGFibGUuXFxyXFxuc28gaG93IGNhbiBiZSBjb250cm9sIHRoaXMgcmVmcmVzaC4uLnBsZWFzZSBwcm92aWRlIG1lIHNvbHV0aW9uIGltbWVkaWF0ZWx5LlxcclxcblxcclxcblRoYW5rcyBpbiBhZHZhbmNlXFxyXFxuSGVtcmFqIFJhdlxcclxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNVwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM1L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNS9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNS9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzVcIixcbiAgICBcImlkXCI6IDE5NTA4NTY3NSxcbiAgICBcIm51bWJlclwiOiA3MzUsXG4gICAgXCJ0aXRsZVwiOiBcInByb3BlcnR5IHdpdGggXFxcIi1cXFwiIGRhc2ggZG9lc250IHdvcmsgaW4gc2VhcmNoPyBPciBJIGFtIGRvaW5nIHNvbWV0aGluZyB3cm9uZyB3aXRoIHN0U2VhcmNoXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJnaW5hbWRhclwiLFxuICAgICAgXCJpZFwiOiA4NDUzNzksXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91Lzg0NTM3OT92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhclwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9naW5hbWRhclwiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9naW5hbWRhci9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2dpbmFtZGFyL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZ2luYW1kYXIvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtdLFxuICAgIFwic3RhdGVcIjogXCJvcGVuXCIsXG4gICAgXCJsb2NrZWRcIjogZmFsc2UsXG4gICAgXCJhc3NpZ25lZVwiOiBudWxsLFxuICAgIFwiYXNzaWduZWVzXCI6IFtdLFxuICAgIFwibWlsZXN0b25lXCI6IG51bGwsXG4gICAgXCJjb21tZW50c1wiOiA0LFxuICAgIFwiY3JlYXRlZF9hdFwiOiBcIjIwMTYtMTItMTJUMjE6MDY6NDhaXCIsXG4gICAgXCJ1cGRhdGVkX2F0XCI6IFwiMjAxNi0xMi0xNVQwNzowMzoyNFpcIixcbiAgICBcImNsb3NlZF9hdFwiOiBudWxsLFxuICAgIFwiYm9keVwiOiBcIkkgaGF2ZSBqc29uIG9iamVjdCBhcyAgIFxcclxcbmBgYFt7XFxcInRhc2staWRcXFwiOjUyLFxcXCJ0YXNrLXByaW9yaXR5XFxcIjoxLFxcXCJ0YXNrLW5hbWVcXFwiOlxcXCJNb2RpZnkgUHJvdmluY2VcXFwiLFxcXCJ0YXNrLWRlc2NyaXB0aW9uXFxcIjpcXFwiXFxcIixcXFwidGFzay1zdGF0dXNcXFwiOlxcXCJJblByb2dyZXNzXFxcIn0sLi4uXSAgYGBgXFxyXFxuYW5kIGluIGh0bWwgaW0gcmVuZGVyaW5nIGl0cyBhc1xcclxcbmBgYFxcclxcbjxkaXYgY2xhc3M9XFxcIndpZGdldC1ib2R5XFxcIiBzdC10YWJsZT1cXFwiZGlzcGxheVdvcmtsaXN0XFxcIiBzdC1zYWZlLXNyYz1cXFwid29ya2xpc3RcXFwiICA+XFxyXFxuPHRhYmxlIGNsYXNzPVxcXCJ0YWJsZSB0YWJsZS1ib3JkZXJlZCB0YWJsZS1zdHJpcGVkIHRhYmxlLWNvbmRlbnNlZFxcXCI+XFxyXFxuPHRoZWFkPi4uPC90aGVhZD5cXHJcXG48dGJvZHk+XFxyXFxuPHRyIG5nLXJlcGVhdD1cXFwicm93IGluIGRpc3BsYXlXb3JrbGlzdFxcXCI+XFxyXFxuICAgPHRkIGNsYXNzPVxcXCJ0ZXh0LWNlbnRlclxcXCIgPlxcclxcbiAgIHt7IHJvd1sndGFzay1pZCddIH19XFxyXFxuICA8L3RkPlxcclxcbjwvdGFibGU+IGBgYCAgXFxyXFxuXFxyXFxuRXZlcnl0aGluZyB3b3JrcyBmaW5lLCBub3cgd2hlbiBpbSB0cnlpbmcgdG8gZmlsdGVyIGJhc2VkIG9uIHByZWRpY2F0ZSBhcyAgXFxyXFxuPHRoPlxcclxcbiAgIDxpbnB1dCBzdC1zZWFyY2g9XFxcIid0YXNrLWlkJ1xcXCIgcGxhY2Vob2xkZXI9XFxcInNlYXJjaCBmb3IgdGFza0lkXFxcIlxcclxcbiAgY2xhc3M9XFxcImlucHV0LXNtIGZvcm0tY29udHJvbFxcXCIgdHlwZT1cXFwic2VhcmNoXFxcIi8+XFxyXFxuICA8L3RoPiAgXFxyXFxuYGBgICBcXHJcXG5JIGdldCBhbmd1bGFyLmpzOjEwMTUwIFR5cGVFcnJvcjogJHBhcnNlKC4uLikuYXNzaWduIGlzIG5vdCBhIGZ1bmN0aW9uXFxyXFxuXFxyXFxuXFxcImFuZ3VsYXJcXFwiOiBcXFwifjEuMlxcXCIsXFxyXFxuYW5ndWxhci1zbWFydC10YWJsZTogXFxcIl4yLjEuOFxcXCIsXFxyXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzQvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzM0L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczNFwiLFxuICAgIFwiaWRcIjogMTkyODQyOTAwLFxuICAgIFwibnVtYmVyXCI6IDczNCxcbiAgICBcInRpdGxlXCI6IFwic3QtcGlwZSB3aXRoIGRlZmF1bHQtc29ydC1jb2x1bW4gY2F1c2VzIGRvdWJsZSB4aHIgcmVxdWVzdCB3aGVuIGluaXRpYWxpemluZyB0YWJsZS5cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcInd6b2V0XCIsXG4gICAgICBcImlkXCI6IDI0ODE5ODIsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzI0ODE5ODI/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXRcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vd3pvZXRcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvd3pvZXQvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy93em9ldC9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3d6b2V0L3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMSxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEyLTAxVDEzOjExOjUzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTItMTJUMTI6MDk6NDJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSxcXHJcXG5cXHJcXG5XZSBhcmUgd29ya2luZyB3aXRoIHlvdXIgcGx1Z2luIHdoaWNoIGlzIHJlYWxseSBhd2Vzb21lLiBcXHJcXG5XZSBqdXN0IGZvdW5kIHRoYXQgd2hlbiBoYXZpbmcgYSBkZWZhdWx0LXNvcnQgZmllbGQgc2V0IHRvIHRydWUsIHRoZSBwaXBlIGlzIGNhbGxlZCB0d2ljZSwgY2F1c2luZyBkYXRhIGJlIGxvYWRlZCB0d2ljZSB1cG9uIGluaXRpYWxpemluZyBvZiB0aGUgcGFnZS4gXFxyXFxuXFxyXFxuSXQgaXMgdG90YWxseSBub3QgYSBzaG93c3RvcHBlciwgYnV0IEkgZ3Vlc3MgaXQgaXNuJ3QgdmVyeSBlZmZpY2llbnQgYXMgd2VsbC5cXHJcXG5cXHJcXG5XZSB1c2UgYW5ndWxhciDLhjEuNS44IGFuZCBhbmd1bGFyLXNtYXJ0LXRhYmxlIMuGMi4xLjguXFxyXFxuXFxyXFxuVGhhbmtzIGZvciB5b3VyIGVmZm9ydCBpbiB0aGlzIHBsdWdpbiFcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzNcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzczMy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzMvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MzMvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9wdWxsLzczM1wiLFxuICAgIFwiaWRcIjogMTkyMTMyOTUwLFxuICAgIFwibnVtYmVyXCI6IDczMyxcbiAgICBcInRpdGxlXCI6IFwiRXh0ZW5kIHNlbGVjdGlvbiB3aXRoIHNoaWZ0LWNsaWNrXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJSaG9iYWxcIixcbiAgICAgIFwiaWRcIjogMTQ5MTMyOTcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMxLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE0OTEzMjk3P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbFwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9SaG9iYWxcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL1Job2JhbC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9SaG9iYWwvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvUmhvYmFsL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTExLTI4VDIyOjE5OjUzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTEtMjhUMjI6MTk6NTNaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcInB1bGxfcmVxdWVzdFwiOiB7XG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvcHVsbHMvNzMzXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzXCIsXG4gICAgICBcImRpZmZfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzLmRpZmZcIixcbiAgICAgIFwicGF0Y2hfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL3B1bGwvNzMzLnBhdGNoXCJcbiAgICB9LFxuICAgIFwiYm9keVwiOiBcIlNlbGVjdGlvbiBjYW4gYmUgZXh0ZW5kZWQgd2l0aCBzaGlmdC1jbGljay5cXHJcXG5cXHJcXG5FeHRlbnNpb24gbWVhbnMgdGhhdCB0aGUgc3RhdGUgb2YgdGhlIGxhc3Qgcm93IHRoYXQgd2FzIHNlbGVjdGVkIGlzIGV4dGVuZGVkIHRocm91Z2ggdG8gdGhlIGN1cnJlbnRseVxcclxcbnNlbGVjdGVkIHJvdywgc28gYWxsIHJvd3MgaW4gYmV0d2VlbiB3aWxsIGVpdGhlciBiZSBzZWxlY3RlZCBvciBkZXNlbGVjdGVkLiBJZiB0aGVyZSB3YXMgbm8gcHJldmlvdXNseVxcclxcbnNlbGVjdGVkIHJvdywgc2hpZnQtY2xpY2sgd2lsbCBqdXN0IHNlbGVjdCB0aGUgY3VycmVudCByb3cuXFxyXFxuXFxyXFxuVG8gZ2V0IHRvIGEgZGVmaW5lZCBzdGF0ZSBvbiBwYWdpbmcgLyBmaWx0ZXJpbmcgLyBzb3J0aW5nLCBzZWxlY3Rpb25zIGFyZSBjbGVhcmVkIHdoZW4gZW50ZXJpbmcgcGlwZSgpIGlmIHRoZXJlIHdlcmUgYW55LiBPdGhlcndpc2UsIHRoZXJlIGNvdWxkIHJlbWFpbiBzZWxlY3RlZCBvYmplY3RzIHRoYXQgYXJlIG5vdCB2aXNpYmxlLlwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOFwiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI4L2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOC9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyOC9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjhcIixcbiAgICBcImlkXCI6IDE4NjI2NDg0OCxcbiAgICBcIm51bWJlclwiOiA3MjgsXG4gICAgXCJ0aXRsZVwiOiBcImdldCBvbmNsaWNrIHBhZ2luYXRpb24gaW4gY29udHJvbGxlclwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwiZG9uaTExMVwiLFxuICAgICAgXCJpZFwiOiAyMjgxNzI3NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMjI4MTcyNzc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9kb25pMTExXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RvbmkxMTEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kb25pMTExL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZG9uaTExMS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0zMVQxMTo0ODoyMFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTMxVDE4OjIxOjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSSBuZWVkIHRvIGRldGVjdCB0aGUgY3VycmVudCBwYWdpbmF0aW9uIGJ5IHRoZSBjb250cm9sbGVyIG9uIHRoZSBvbmNsaWNrIHBhZ2luYXRpb24uXFxyXFxuSXMgdGhlcmUgYW55IHdheSB0byBkbyBpdD9cXHJcXG5cXHJcXG5UaGFuayB5b3VcIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjdcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyNy9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjcvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjcvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI3XCIsXG4gICAgXCJpZFwiOiAxODQxNjgwODMsXG4gICAgXCJudW1iZXJcIjogNzI3LFxuICAgIFwidGl0bGVcIjogXCJzdC1waXBlIG5vdCB3b3JraW5nIHdpdGggc3Qtc2FmZS1zcmNcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImRhbmllbGUtYm90dGVsbGlcIixcbiAgICAgIFwiaWRcIjogODc2MDM1MyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczAuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvODc2MDM1Mz92PTNcIixcbiAgICAgIFwiZ3JhdmF0YXJfaWRcIjogXCJcIixcbiAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2RhbmllbGUtYm90dGVsbGlcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9mb2xsb3dlcnNcIixcbiAgICAgIFwiZm9sbG93aW5nX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvc3RhcnJlZHsvb3duZXJ9ey9yZXBvfVwiLFxuICAgICAgXCJzdWJzY3JpcHRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvZGFuaWVsZS1ib3R0ZWxsaS9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL3JlcG9zXCIsXG4gICAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2RhbmllbGUtYm90dGVsbGkvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9kYW5pZWxlLWJvdHRlbGxpL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogNCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEwLTIwVDA4OjQyOjEzWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTctMDItMDhUMTY6MTQ6MzBaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIaSB0aGVyZSFcXG5JIGhhdmUgYSBwcm9ibGVtIHVzaW5nIHNtYXJ0IHRhYmxlIHVzaW5nIHN0LXNhZmUtc3JjIGFuZCBzdC1waXBlIHRvZ2V0aGVyLlxcbkFzIGxvbmcgYXMgSSdtIHVzaW5nIHN0LXRhYmxlIGFuZCBzdC1zYWZlLXNyYyBkaXJlY3RpdmVzLCBJIGNhbiBzZWUgYWxsIHRoZSBpdGVtcyBpbiB0aGUgdGFibGUuXFxuQXMgbG9uZyBhcyBJJ20gdXNpbmcgc3QtdGFibGUgYW5kIHN0LXBpcGUgZGlyZWN0aXZlcywgSSBjYW4gc2VlIGFsbCB0aGUgaXRlbXMgaW4gdGhlIHRhYmxlLlxcbkJVVCB1c2luZyBzdC10YWJsZSwgc3Qtc2FmZS1zcmMgYW5kIHN0LXBpcGUgZGlyZWN0aXZlcywgbm8gaXRlbSBpcyBzaG93biBpbiB0aGUgdGFibGUuXFxuXFxuSSB0cmllZCB0aGUgc29sdXRpb24gc2hvd24gaW4gaXNzdWUgIzI0MiBidXQgaXQgZGlkbid0IHdvcmsuXFxuSW4gaXNzdWUgIzIzOCBqb3NoaWppbWl0IGhhZCBteSBzYW1lIHByb2JsZW0gYnV0IHRoZSBzb2x1dGlvbiB3YXM6IGRpc2NhcmQgc3Qtc2FmZS1zcmMuIEZvciBtZSBpdCdzIG5vdCBwb3NzaWJsZSBiZWNhdXNlIEkgbmVlZCB0byBmaWx0ZXIgbXkgdGFibGUuXFxuXFxuWW91IGNhbiBmaW5kIG15IGV4YW1wbGUgY29kZSBoZXJlOlxcbmh0dHA6Ly9wbG5rci5jby9lZGl0L05xRDQ3UT9wPXByZXZpZXdcXG5cXG5UaGFua3MgOilcXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjVcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyNS9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjUvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjUvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzI1XCIsXG4gICAgXCJpZFwiOiAxODM3NzM4NTAsXG4gICAgXCJudW1iZXJcIjogNzI1LFxuICAgIFwidGl0bGVcIjogXCJHbyB0byBzcGVjaWZpYyBwYWdlIGFmdGVyIGN1c3RvbSBmaWx0ZXJcIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImFhbGFyY29uZ1wiLFxuICAgICAgXCJpZFwiOiAxOTU1ODU4NyxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczEuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTk1NTg1ODc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FhbGFyY29uZ1wiLFxuICAgICAgXCJmb2xsb3dlcnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL2dpc3Rzey9naXN0X2lkfVwiLFxuICAgICAgXCJzdGFycmVkX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvYWFsYXJjb25nL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvb3Jnc1wiLFxuICAgICAgXCJyZXBvc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2FhbGFyY29uZy9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9hYWxhcmNvbmcvcmVjZWl2ZWRfZXZlbnRzXCIsXG4gICAgICBcInR5cGVcIjogXCJVc2VyXCIsXG4gICAgICBcInNpdGVfYWRtaW5cIjogZmFsc2VcbiAgICB9LFxuICAgIFwibGFiZWxzXCI6IFtcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiAyMjU4NjI0MjMsXG4gICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9sYWJlbHMvbm90JTIwcmVwcm9kdWNpYmxlXCIsXG4gICAgICAgIFwibmFtZVwiOiBcIm5vdCByZXByb2R1Y2libGVcIixcbiAgICAgICAgXCJjb2xvclwiOiBcImViNjQyMFwiLFxuICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogMjU5NDM4NTA2LFxuICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvbGFiZWxzL3RvJTIwYmUlMjBjbG9zZWQ6JTIwZG9lcyUyMG5vdCUyMGZvbGxvdyUyMGd1aWRlbGluZXNcIixcbiAgICAgICAgXCJuYW1lXCI6IFwidG8gYmUgY2xvc2VkOiBkb2VzIG5vdCBmb2xsb3cgZ3VpZGVsaW5lc1wiLFxuICAgICAgICBcImNvbG9yXCI6IFwiZmJjYTA0XCIsXG4gICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgfVxuICAgIF0sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDEsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0xOFQxODo1OTozOFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTMwVDIxOjU3OjQ0WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGkuXFxuXFxuSSdtIHVzaW5nIHRoZSBzbWFydCB0YWJsZSB3aXRoIGFuIGFwaSBhbmQgYWxzbyBpbmNsdWRlIGEgY3VzdG9tIGZpbHRlciBkaXJlY3RpdmUgc28gaSBjYW4gZmlsdGVyIGJ5IGRpZmZlcmVudCBjb2x1bW5zIGFuZCBpcyB3b3JraW5nIG9rLiBXaGVuIGkgY2xpY2sgb24gYSByb3cgaSBnbyB0byBhbm90aGVyIHBhZ2UgdG8gc2VlIG1vcmUgaW5mb3JtYXRpb24sIGluIHRoaXMgbmV3IHBhZ2UgdGhlcmVzIGEgXFxcImdvIGJhY2tcXFwiIGJ1dHRvbiAsIHNvIGkgc3RvcmUgdGhlIHRhYmxlIGNvbGxlY3Rpb24gb24gYSBzZXJ2aWNlIHNvIHdoZW4gaSBcXFwiZ28gYmFja1xcXCIgaSByZXN1bWUgdGhlIGNvbGxlY3Rpb24gd2l0aG91dCBjYWxsaW5nIHRoZSBhcGkgYW5kIHRoZSBjdXN0b20gZmlsdGVycyBydW5zIGFnYWluIGJlY2F1c2UgaSBnb3QgdGhlbSBzdG9yZWQgYWxzbyBvbiBhIHNlcnZpY2UuIFRoZSBpc3N1ZSB0aGF0IGkgY2FudCBzb2x2ZSBpcyB0byBnbyB0byBhbiBzcGVjaWZpYyBwYWdlIGFmdGVyIHRoZSBjdXN0b20gZmlsdGVyIGlzIGV4ZWN1dGUuXFxuXFxuSSB0cnkgdG8gdXNlIHRoZSBjb250cm9sbGVyLnNsaWNlKCkgd2F0Y2hpbmcgdGhlIGN0bHIuZ2V0RmlsdGVyZWRDb2xsZWN0aW9uIGJ1dCB0aGUgY3VzdG9tIGZpbHRlciBvdmVycmlkZSB0aGUgcGFnZSBjaGFuZ2VzIHRoYXQgdGhlIHNsaWRlIGZ1bmN0aW9uIG1ha2UuIEFsc28gaSB0cnkgdG8gdXNlIGEgcGVyc2lzdCBkaXJlY3RpdmUgb24gbG9jYWxzdG9yYWdlIGJ1dCBpcyB0aGUgc2FtZSwgdGhlIGN1c3RvbSBmaWx0ZXIgZXhlY3V0ZSBhbmQgb3ZlcnJpZGUgdGhlIGxvYWQgb2YgdGhlIGxvY2Fsc3RvcmFnZSBjb2xsZWN0aW9uIG92ZXJyaWRpbmcgdGhlIHBhZ2UuXFxuXFxuaXMgVGhlcmUgYSB3YXkgdG8gc2V0IGFuIHNwZWNpZmljIHBhZ2UgYWZ0ZXIgdGhlIGN1c3RvbSBmaWx0ZXI/IGZyb20gdGhlIGN1c3RvbSBmaWx0ZXIgZGlyZWN0aXZlIHRoZXJlcyBhIHdheSB0byBhY2Nlc3MgdGhlIHRhYmxlU3RhdGU/XFxuXFxubXkgY3VzdG9tIGZpbHRlciBsb29rcyBzaW1pbGFyIHRvIChvZiBjb3Vyc2Ugd2l0aCBzb21lIGN1c3RvbSBsb2dpYyk6XFxuXFxuYGBgIGphdmFzY3JpcHRcXG4uZmlsdGVyKCdjdXN0b21GaWx0ZXInLCBbJyRmaWx0ZXInLCBmdW5jdGlvbiAoJGZpbHRlcikge1xcbiAgIHJldHVybiBmdW5jdGlvbiBjdXN0b21GaWx0ZXIoYXJyYXksIGV4cHJlc3Npb24pIHtcXG4gICAgIHJldHVybiBvdXRwdXQ7XFxuICAgIH07XFxufV0pO1xcbmBgYFxcblwiXG4gIH0sXG4gIHtcbiAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyM1wiLFxuICAgIFwicmVwb3NpdG9yeV91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlXCIsXG4gICAgXCJsYWJlbHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIzL2xhYmVsc3svbmFtZX1cIixcbiAgICBcImNvbW1lbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMy9jb21tZW50c1wiLFxuICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMy9ldmVudHNcIixcbiAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjNcIixcbiAgICBcImlkXCI6IDE4MjY3Mzg3MyxcbiAgICBcIm51bWJlclwiOiA3MjMsXG4gICAgXCJ0aXRsZVwiOiBcIkhpZ2hsaWdodCBzZWFyY2ggdGVybT9cIixcbiAgICBcInVzZXJcIjoge1xuICAgICAgXCJsb2dpblwiOiBcImtkdW1vdmljXCIsXG4gICAgICBcImlkXCI6IDQ1MDM2ODAsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMyLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzQ1MDM2ODA/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWNcIixcbiAgICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20va2R1bW92aWNcIixcbiAgICAgIFwiZm9sbG93ZXJzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMva2R1bW92aWMvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL2ZvbGxvd2luZ3svb3RoZXJfdXNlcn1cIixcbiAgICAgIFwiZ2lzdHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9naXN0c3svZ2lzdF9pZH1cIixcbiAgICAgIFwic3RhcnJlZF91cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3N1YnNjcmlwdGlvbnNcIixcbiAgICAgIFwib3JnYW5pemF0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL29yZ3NcIixcbiAgICAgIFwicmVwb3NfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9rZHVtb3ZpYy9ldmVudHN7L3ByaXZhY3l9XCIsXG4gICAgICBcInJlY2VpdmVkX2V2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2tkdW1vdmljL3JlY2VpdmVkX2V2ZW50c1wiLFxuICAgICAgXCJ0eXBlXCI6IFwiVXNlclwiLFxuICAgICAgXCJzaXRlX2FkbWluXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImxhYmVsc1wiOiBbXSxcbiAgICBcInN0YXRlXCI6IFwib3BlblwiLFxuICAgIFwibG9ja2VkXCI6IGZhbHNlLFxuICAgIFwiYXNzaWduZWVcIjogbnVsbCxcbiAgICBcImFzc2lnbmVlc1wiOiBbXSxcbiAgICBcIm1pbGVzdG9uZVwiOiBudWxsLFxuICAgIFwiY29tbWVudHNcIjogMCxcbiAgICBcImNyZWF0ZWRfYXRcIjogXCIyMDE2LTEwLTEzVDAxOjM1OjMyWlwiLFxuICAgIFwidXBkYXRlZF9hdFwiOiBcIjIwMTYtMTAtMTNUMDE6MzU6MzJaXCIsXG4gICAgXCJjbG9zZWRfYXRcIjogbnVsbCxcbiAgICBcImJvZHlcIjogXCJIb3dkeSxcXG5cXG5JcyB0aGVyZSBhIHdheSB0byBoaWdobGlnaHQgdGhlIG1hdGNoaW5nIHNlYXJjaCB0ZXJtIHdpdGhpbiBhIHRhYmxlIGNlbGw/IEkgYW0gaW1hZ2luaW5nIHRoYXQgYW55IHRleHQgd2l0aGluIGEgdGFibGUgY2VsbCB0aGF0IG1hdGNoZXMgdGhlIHNlYXJjaCBxdWVyeSB3b3VsZCBiZSBlbmNsb3NlZCBpbiBhIHNwYW4gdGhhdCBjb3VsZCB0aGVuIGJlIHN0eWxlZCB3aXRoIGEgYmFja2dyb3VuZCBjb2xvciwgZXRjLlxcblxcbkRvZXMgdGhpcyBmdW5jdGlvbmFsaXR5IGV4aXN0P1xcblxcblRoYW5rcy5cXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjJcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcyMi9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjIvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MjIvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzIyXCIsXG4gICAgXCJpZFwiOiAxODI0ODEyNTYsXG4gICAgXCJudW1iZXJcIjogNzIyLFxuICAgIFwidGl0bGVcIjogXCJOZXcgRmVhdHVyZSBSZXF1ZXN0IDo6IFNlbGVjdCBBbGwgQnV0dG9uIHdpdGggdGhlIFRhYmxlXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJoYXJzaGlsZFwiLFxuICAgICAgXCJpZFwiOiA4NTc3MjE1LFxuICAgICAgXCJhdmF0YXJfdXJsXCI6IFwiaHR0cHM6Ly9hdmF0YXJzMS5naXRodWJ1c2VyY29udGVudC5jb20vdS84NTc3MjE1P3Y9M1wiLFxuICAgICAgXCJncmF2YXRhcl9pZFwiOiBcIlwiLFxuICAgICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkXCIsXG4gICAgICBcImh0bWxfdXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2hhcnNoaWxkXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL2hhcnNoaWxkL2ZvbGxvd2Vyc1wiLFxuICAgICAgXCJmb2xsb3dpbmdfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9mb2xsb3dpbmd7L290aGVyX3VzZXJ9XCIsXG4gICAgICBcImdpc3RzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9zdGFycmVkey9vd25lcn17L3JlcG99XCIsXG4gICAgICBcInN1YnNjcmlwdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9zdWJzY3JpcHRpb25zXCIsXG4gICAgICBcIm9yZ2FuaXphdGlvbnNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvcmVwb3NcIixcbiAgICAgIFwiZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvaGFyc2hpbGQvZXZlbnRzey9wcml2YWN5fVwiLFxuICAgICAgXCJyZWNlaXZlZF9ldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9oYXJzaGlsZC9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0xMC0xMlQwOTo0NTo0NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTEwLTIxVDA5OjAwOjUwWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSGksXFxuXFxuVGhpcyB0YWxrcyBhYm91dCB0aGUgc2ltaWxhciBjb25jZXJucyBhcyBtZW50aW9uZWQgaGVyZSA6LSBodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzI3MFxcblxcblRoZSBwcm92aWRlZCBkaXJlY3RpdmUgYWxzbyB3b3JrcyBsaWtlIGEgY2hhcm0uXFxuXFxuQnV0LCBpIGFtIHdvbmRlcmluZyBpZiBpdCBwb3NzaWJsZSB0byBpbmNsdWRlIGFuIGF1dG8tc2VsZWN0aW9uIGJ1dHRvbiB3aXRoIHRoZSBsaWJyYXJ5IGFuZCB0aGVuIG1heSBiZSB0b2dnbGluZyBpdHMgdXNhZ2VzIHdpdGggdGhlIGhlbHAgb2YgcHJvcGVydHkuXFxuXFxuSSBzZWFyY2hlZCBxdWl0ZSBhIGJpdCBidXQgbm90IGZvdW5kIGFueSBzdWNoIHJlcXVlc3QgbWFkZSBlYXJsaWVyLiBZb3UgY2FuIGRpc2NhcmQgaXQgaWYgc29tZXRoaW5nIGxpa2UgdGhpcyBoYXMgYWxyZWFkeSBiZWVuIGFkcmVzc2VkXFxuXCJcbiAgfSxcbiAge1xuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2XCIsXG4gICAgXCJyZXBvc2l0b3J5X3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGVcIixcbiAgICBcImxhYmVsc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTYvbGFiZWxzey9uYW1lfVwiLFxuICAgIFwiY29tbWVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2L2NvbW1lbnRzXCIsXG4gICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE2L2V2ZW50c1wiLFxuICAgIFwiaHRtbF91cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNlwiLFxuICAgIFwiaWRcIjogMTc3NzA1NDcwLFxuICAgIFwibnVtYmVyXCI6IDcxNixcbiAgICBcInRpdGxlXCI6IFwiQW5ndWxhciBTbWFydCBUYWJsZSBSZWxvYWQgRGF0YSBhbmQgUmVzZXQgRmlsdGVycyBBbG9uZyBXaXRoIFBhZ2luYXRpb24oV2l0aG91dCBzdC1waXBlKVwiLFxuICAgIFwidXNlclwiOiB7XG4gICAgICBcImxvZ2luXCI6IFwibmltYW50aGFoYXJzaGFuYVwiLFxuICAgICAgXCJpZFwiOiAxMDg2NDU5OCxcbiAgICAgIFwiYXZhdGFyX3VybFwiOiBcImh0dHBzOi8vYXZhdGFyczIuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMTA4NjQ1OTg/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9uaW1hbnRoYWhhcnNoYW5hXCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL25pbWFudGhhaGFyc2hhbmEvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9uaW1hbnRoYWhhcnNoYW5hL2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvbmltYW50aGFoYXJzaGFuYS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDIsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0wOS0xOVQwNToxNzo1OVpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTA5LTIxVDA2OjAzOjI3WlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiSSBoYXZlIHRoZSBzbWFydCB0YWJsZSB3aXRoIEFqYXggbG9hZGVkIGRhdGEgd2hlcmUgSSB3YW50IHRvIHJlc2V0IGZpbHRlcnMgYW5kIHJlbG9hZCBteSBkYXRhIGNvbGxlY3Rpb24gd2l0aCByZXNldCBvZiBwYWdpbmF0aW9uIGFzIHdlbGwgd2hlbiBhIGJ1dHRvbiBpcyBjbGlja2VkLiBNeSBjb2RlIGlzIGdpdmVuIGJlbG93LlxcblxcbioqSFRNTCoqXFxuXFxuYDxidXR0b24gbmctY2xpY2s9XFxcInJlc2V0RmlsdGVycygpO1xcXCIgdHlwZT1cXFwiYnV0dG9uXFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1pbmZvXFxcIj5SZXNldDwvYnV0dG9uPmBcXG5cXG4qKkpTKipcXG5cXG5gYGBcXG5cXG4kc2NvcGUucmVzZXRGaWx0ZXJzID0gZnVuY3Rpb24gKCkge1xcbiAgICAgICAgICAgICRzY29wZS5yb3dDb2xsZWN0aW9uID0gW107XFxuICAgICAgICAgICAgJHNjb3BlLmRpc3BsYXllZENvbGxlY3Rpb24gPSBbXTtcXG4gICAgICAgICAgICAkc2NvcGUucHJvZHVjdF90eXBlID0gbnVsbDtcXG4gICAgICAgICAgICAkc2NvcGUucHJvZHVjdF9jYXRlZ29yeSA9IG51bGw7XFxuICAgICAgICAgICAgJHNjb3BlLnNlYXJjaCA9IG51bGw7XFxuICAgICAgICAgICAgJHNjb3BlLnJvd0NvbGxlY3Rpb24gPSBuZXdfZGF0YTtcXG4gICAgICAgIH07XFxuYGBgXFxuXFxuSG93ZXZlciBJIGNhbid0IGdldCB0aGlzIG1hbmFnZWQgc2luY2UgcGFnaW5hdGlvbiBhbmQgZmlsdGVycyBhcmUgbm90IHJlc2V0dGluZy5cXG5cXG5JIGhhdmUgc2VlbiB0aGUgZm9sbG93aW5nIGJ1dCBJJ20gbm90IHN1cmUgaG93IGFjdHVhbGx5IHRoZSB0YWJsZVN0YXRlIE9iamVjdCBjYW4gYmUgYWNjZXNzZWQgc2luY2UgaXQncyB1bmRlZmluZWQgd2hlbiBJIGxvZyBpdCBvbiB0aGUgY29uc29sZSBhbmQgYWxzbyAqKkknbSBub3QgdXNpbmcgc3QtcGlwZSBkaXJlY3RpdmUqKi5cXG5cXG5gYGBcXG50YWJsZVN0YXRlID0gY3RybC50YWJsZVN0YXRlKClcXG50YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSB7fVxcbnRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDBcXG5gYGBcXG5cXG5QbGVhc2UgSGVscC4uLlxcblxcblRoYW5rIFlvdS5cXG5cIlxuICB9LFxuICB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTRcIixcbiAgICBcInJlcG9zaXRvcnlfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9sb3JlbnpvZm94My9TbWFydC1UYWJsZVwiLFxuICAgIFwibGFiZWxzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvbG9yZW56b2ZveDMvU21hcnQtVGFibGUvaXNzdWVzLzcxNC9sYWJlbHN7L25hbWV9XCIsXG4gICAgXCJjb21tZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTQvY29tbWVudHNcIixcbiAgICBcImV2ZW50c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL2xvcmVuem9mb3gzL1NtYXJ0LVRhYmxlL2lzc3Vlcy83MTQvZXZlbnRzXCIsXG4gICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9sb3JlbnpvZm94My9TbWFydC1UYWJsZS9pc3N1ZXMvNzE0XCIsXG4gICAgXCJpZFwiOiAxNzU5MDY1NzksXG4gICAgXCJudW1iZXJcIjogNzE0LFxuICAgIFwidGl0bGVcIjogXCJFeGNlbCBsaWtlIHRhYmxlIGNlbGwgc2VsZWN0aW9uXCIsXG4gICAgXCJ1c2VyXCI6IHtcbiAgICAgIFwibG9naW5cIjogXCJzdGFubGV5eHUyMDA1XCIsXG4gICAgICBcImlkXCI6IDUxNjI2ODcsXG4gICAgICBcImF2YXRhcl91cmxcIjogXCJodHRwczovL2F2YXRhcnMwLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzUxNjI2ODc/dj0zXCIsXG4gICAgICBcImdyYXZhdGFyX2lkXCI6IFwiXCIsXG4gICAgICBcInVybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNVwiLFxuICAgICAgXCJodG1sX3VybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9zdGFubGV5eHUyMDA1XCIsXG4gICAgICBcImZvbGxvd2Vyc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZm9sbG93ZXJzXCIsXG4gICAgICBcImZvbGxvd2luZ191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZm9sbG93aW5ney9vdGhlcl91c2VyfVwiLFxuICAgICAgXCJnaXN0c191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvZ2lzdHN7L2dpc3RfaWR9XCIsXG4gICAgICBcInN0YXJyZWRfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L3N0YXJyZWR7L293bmVyfXsvcmVwb31cIixcbiAgICAgIFwic3Vic2NyaXB0aW9uc191cmxcIjogXCJodHRwczovL2FwaS5naXRodWIuY29tL3VzZXJzL3N0YW5sZXl4dTIwMDUvc3Vic2NyaXB0aW9uc1wiLFxuICAgICAgXCJvcmdhbml6YXRpb25zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9vcmdzXCIsXG4gICAgICBcInJlcG9zX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9yZXBvc1wiLFxuICAgICAgXCJldmVudHNfdXJsXCI6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2Vycy9zdGFubGV5eHUyMDA1L2V2ZW50c3svcHJpdmFjeX1cIixcbiAgICAgIFwicmVjZWl2ZWRfZXZlbnRzX3VybFwiOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vdXNlcnMvc3RhbmxleXh1MjAwNS9yZWNlaXZlZF9ldmVudHNcIixcbiAgICAgIFwidHlwZVwiOiBcIlVzZXJcIixcbiAgICAgIFwic2l0ZV9hZG1pblwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJsYWJlbHNcIjogW10sXG4gICAgXCJzdGF0ZVwiOiBcIm9wZW5cIixcbiAgICBcImxvY2tlZFwiOiBmYWxzZSxcbiAgICBcImFzc2lnbmVlXCI6IG51bGwsXG4gICAgXCJhc3NpZ25lZXNcIjogW10sXG4gICAgXCJtaWxlc3RvbmVcIjogbnVsbCxcbiAgICBcImNvbW1lbnRzXCI6IDAsXG4gICAgXCJjcmVhdGVkX2F0XCI6IFwiMjAxNi0wOS0wOVQwMTo0MTo1NFpcIixcbiAgICBcInVwZGF0ZWRfYXRcIjogXCIyMDE2LTA5LTA5VDAzOjAwOjExWlwiLFxuICAgIFwiY2xvc2VkX2F0XCI6IG51bGwsXG4gICAgXCJib2R5XCI6IFwiRGVhciBEZXZlbG9wZXJzLFxcblxcbkknZCBsaWtlIHRvIGFzayB3aGV0aGVyIHRoZXJlIGlzIGFueSB3YXkgKG9yIHBsdWdpbikgdG8gZW5oYW5jZSB0YWJsZSBzZWxlY3RpbmcuIEkgd2FudCB0byBzZWxlY3QgdGFibGUgbGlrZSB3aGF0IHdlIGluIEV4Y2VsIGRvLiBJbiBjb25jcmV0ZTogXFxuLSBUaGUgc2VsZWN0aW9uIHdpbGwgaGF2ZSBhIGNvbG9yZWQgYm9yZGVyXFxuLSBXaGVuIHByZXNzIENUUkwrQywgZGF0YSB3aXRob3V0IGZvcm1hdCB3aWxsIGJlIGNvcGllZCBpbnRvIGNsaXBib2FyZC5cXG5cXG5JIGtub3cgSGFuZHNPblRhYmxlIChodHRwczovL2hhbmRzb250YWJsZS5jb20vZXhhbXBsZXMuaHRtbD9oZWFkZXJzKSBpcyBxdWl0ZSBnb29kIGF0IHRoaXMsIGJ1dCBpdHMgcGVyZm9ybWFuY2UgaXMgYSBuaWdodG1hcmUuIEknZCBsaWtlIHRvIHVzZSBteSBmYXZvcml0ZSBTbWFydC1UYWJsZSB0byBkZWxpdmVyIG5ldyBwcm9qZWN0cywgc28gSSdtIGFza2luZyA7LSlcXG5cIlxuICB9XG5dIiwiaW1wb3J0IHN0IGZyb20gJ3NtYXJ0LXRhYmxlLWNvcmUnO1xuaW1wb3J0IGRhdGEgZnJvbSAnLi4vbW9ja0RhdGEnO1xuXG5pbXBvcnQgZ3JpZCBmcm9tICcuL2dyaWQnO1xuaW1wb3J0IGFjdGlvbnMgZnJvbSAnLi9hY3Rpb25zJztcblxuY29uc3Qgc21hcnRMaXN0UmVnaXN0cnkgPSBbXTtcbmNvbnN0IG1hdGNoWFkgPSAoeCwgeSkgPT4gKGl0ZW0pID0+IHggPT09IGl0ZW0ueCAmJiB5ID09PSBpdGVtLnk7XG5jb25zdCBnZXQgPSAoeCwgeSkgPT4gc21hcnRMaXN0UmVnaXN0cnkuZmluZChtYXRjaFhZKHgsIHkpKTtcbmNvbnN0IGhhcyA9ICh4LCB5KSA9PiBnZXQoeCwgeSkgIT09IHZvaWQgMDtcblxuY29uc3QgZXh0ZW5kZWRTbWFydExpc3QgPSAoIG9wdHMgPT4ge1xuICBjb25zdCB7eCwgeX0gPSBvcHRzO1xuICBjb25zdCBpbnN0YW5jZSA9IHN0KG9wdHMpO1xuICByZXR1cm4gT2JqZWN0LmFzc2lnbihpbnN0YW5jZSwge1xuICAgIHJlbW92ZTogKCkgPT4ge1xuICAgICAgc21hcnRMaXN0UmVnaXN0cnkuc3BsaWNlKHNtYXJ0TGlzdFJlZ2lzdHJ5LmluZGV4T2YoaW5zdGFuY2UpLCAxKTtcbiAgICAgIGFjdGlvbnMucmVtb3ZlU21hcnRMaXN0KHt4LCB5fSk7XG4gICAgfVxuICB9KVxufSk7XG5cbmNvbnN0IGluc3RhbmNlID0ge1xuICBmaW5kT3JDcmVhdGUoeCwgeSl7XG4gICAgaWYgKCFoYXMoeCwgeSkpIHtcbiAgICAgIGNvbnN0IHNtYXJ0TGlzdCA9IGV4dGVuZGVkU21hcnRMaXN0KHtkYXRhLCB4LCB5fSk7XG4gICAgICBzbWFydExpc3Qub24oJ0VYRUNfQ0hBTkdFRCcsICh7d29ya2luZ30pID0+IHtcbiAgICAgICAgY29uc3Qge2RhdGE6cGFuZWxEYXRhfSA9IGdyaWQuZ2V0RGF0YSh4LCB5KTtcbiAgICAgICAgYWN0aW9ucy51cGRhdGVQYW5lbERhdGEoe3gsIHksIGRhdGE6IE9iamVjdC5hc3NpZ24oe30sIHBhbmVsRGF0YSwge3Byb2Nlc3Npbmc6IHdvcmtpbmd9KX0pO1xuICAgICAgfSk7XG4gICAgICBzbWFydExpc3Qub25EaXNwbGF5Q2hhbmdlKGl0ZW1zID0+IHtcbiAgICAgICAgYWN0aW9ucy51cGRhdGVTbWFydExpc3Qoe1xuICAgICAgICAgIHgsIHksXG4gICAgICAgICAgdGFibGVTdGF0ZTogc21hcnRMaXN0LmdldFRhYmxlU3RhdGUoKSxcbiAgICAgICAgICBpdGVtc1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgICAgc21hcnRMaXN0UmVnaXN0cnkucHVzaCh7eCwgeSwgc21hcnRMaXN0fSk7XG4gICAgICBhY3Rpb25zLmNyZWF0ZVNtYXJ0TGlzdCh7eCwgeSwgdGFibGVTdGF0ZTogc21hcnRMaXN0LmdldFRhYmxlU3RhdGUoKSwgaXRlbXM6IFtdfSk7XG4gICAgICBzbWFydExpc3QuZXhlYygpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0KHgsIHkpLnNtYXJ0TGlzdDtcbiAgfSxcbiAgZmluZCh4LCB5KXtcbiAgICBjb25zdCBzbCA9IGdldCh4LCB5KTtcbiAgICByZXR1cm4gc2wgIT09IHZvaWQgMCA/IHNsLnNtYXJ0TGlzdCA6IHNsO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBpbnN0YW5jZTtcblxuXG4iLCJpbXBvcnQge2NyZWF0ZVN0b3JlLCBhcHBseU1pZGRsZXdhcmUsIGNvbXBvc2V9IGZyb20gJ3JlZHV4JztcbmltcG9ydCBncmlkIGZyb20gJy4vZ3JpZCc7XG5pbXBvcnQgcmVkdWNlciBmcm9tICcuLi9yZWR1Y2Vycy9pbmRleCc7XG5pbXBvcnQgc21hcnRMaXN0UmVnaXN0cnkgZnJvbSAnLi9zbWFydExpc3RSZWdpc3RyeSc7XG5cbmNvbnN0IGluaXRpYWxTdGF0ZSA9IHtcbiAgZ3JpZDoge1xuICAgIHBhbmVsczogWy4uLmdyaWRdLFxuICAgIGFjdGl2ZTogbnVsbCxcbiAgfSxcbiAgc21hcnRMaXN0OiBbXVxufTtcblxuLyoqXG4gKiB0aGlzIHdpbGwgdXBkYXRlIHRoZSBkaWZmZXJlbnQgcmVnaXN0cmllcyB3aGVuIHBhbmVsIHBvc2l0aW9uaW5nIGNoYW5nZVxuICovXG5jb25zdCBzeW5jUmVnaXN0cmllcyA9IChzdG9yZSkgPT4gbmV4dCA9PiBhY3Rpb24gPT4ge1xuICBjb25zdCB7dHlwZSwgeCwgeSwgc3RhcnRYLCBzdGFydFl9ID0gYWN0aW9uO1xuICBpZiAodHlwZSA9PT0gJ1JFU0VUX1BBTkVMJykge1xuICAgIGNvbnN0IHNsID0gc21hcnRMaXN0UmVnaXN0cnkuZmluZCh4LCB5KTtcbiAgICBpZiAoc2wpIHtcbiAgICAgIHNsLnJlbW92ZSgpO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnRU5EX01PVkUnKSB7XG4gICAgY29uc3Qge2dyaWQ6e2FjdGl2ZX19ID0gc3RvcmUuZ2V0U3RhdGUoKTtcbiAgICBpZiAoYWN0aXZlLnZhbGlkID09PSB0cnVlKSB7XG4gICAgICBjb25zdCBvbGRTbCA9IHNtYXJ0TGlzdFJlZ2lzdHJ5LmZpbmQoc3RhcnRYLCBzdGFydFkpO1xuICAgICAgY29uc3QgbmV3U2wgPSBzbWFydExpc3RSZWdpc3RyeS5maW5kKHgsIHkpO1xuICAgICAgaWYgKG9sZFNsKSB7XG4gICAgICAgIG9sZFNsLnJlbW92ZSgpO1xuICAgICAgfVxuICAgICAgaWYgKG5ld1NsKSB7XG4gICAgICAgIG5ld1NsLnJlbW92ZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuZXh0KGFjdGlvbik7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBjcmVhdGVTdG9yZShyZWR1Y2VyKGdyaWQpLCBpbml0aWFsU3RhdGUsXG4gIGNvbXBvc2UoXG4gICAgYXBwbHlNaWRkbGV3YXJlKHN5bmNSZWdpc3RyaWVzKSxcbiAgICB3aW5kb3cuX19SRURVWF9ERVZUT09MU19FWFRFTlNJT05fXyAmJiB3aW5kb3cuX19SRURVWF9ERVZUT09MU19FWFRFTlNJT05fXygpXG4gIClcbik7XG4iLCJpbXBvcnQgKiBhcyBhY3Rpb25zIGZyb20gJy4uL2FjdGlvbnMvaW5kZXgnO1xuaW1wb3J0IHN0b3JlIGZyb20gJy4vc3RvcmUnO1xuXG5jb25zdCBvdXRwdXQgPSB7fTtcblxuZm9yKGxldCBhY3Rpb24gb2YgT2JqZWN0LmtleXMoYWN0aW9ucykpe1xuICBvdXRwdXRbYWN0aW9uXSA9IGFyZ3MgPT4gc3RvcmUuZGlzcGF0Y2goYWN0aW9uc1thY3Rpb25dKGFyZ3MpKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgb3V0cHV0OyIsImltcG9ydCBhY3Rpb25zIGZyb20gJy4vYWN0aW9ucyc7XG5pbXBvcnQgZ3JpZCBmcm9tICcuL2dyaWQnO1xuaW1wb3J0IHNtYXJ0TGlzdHMgZnJvbSAnLi9zbWFydExpc3RSZWdpc3RyeSc7XG5pbXBvcnQgc3RvcmUgZnJvbSAnLi9zdG9yZSc7XG5pbXBvcnQge2Nvbm5lY3R9IGZyb20gJ2ZsYWNvJztcblxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIGFjdGlvbnMsXG4gIGdyaWQsXG4gIHNtYXJ0TGlzdHMsXG4gIHN0b3JlLFxuICBjb25uZWN0OiBzbGljZVN0YXRlID0+IGNvbm5lY3Qoc3RvcmUsIGFjdGlvbnMsIHNsaWNlU3RhdGUpXG59OyIsImltcG9ydCBzZXJ2aWNlcyBmcm9tICcuLi9zZXJ2aWNlcy9pbmRleCdcblxuZXhwb3J0IGRlZmF1bHQgQ29tcCA9PiBwcm9wcyA9PiBDb21wKHByb3BzLCBzZXJ2aWNlcyk7IiwiaW1wb3J0IHttb3VudCwgaH0gZnJvbSAnZmxhY28nO1xuaW1wb3J0IEFkb3JuZXJQYW5lbCBmcm9tICcuL2NvbXBvbmVudHMvQWRvcm5lclBhbmVsJztcbmltcG9ydCBEYXRhUGFuZWwgZnJvbSAnLi9jb21wb25lbnRzL0RhdGFQYW5lbCc7XG5pbXBvcnQgTW9kYWwgZnJvbSAnLi9jb21wb25lbnRzL01vZGFsLmpzJztcbmltcG9ydCB7Y29tcG9zZX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJ1xuaW1wb3J0IHNlcnZpY2VzIGZyb20gJy4vc2VydmljZXMvaW5kZXgnXG5pbXBvcnQgaW5qZWN0IGZyb20gJy4vbGliL2RpLmpzJztcbmltcG9ydCB7Uk9XUywgQ09MVU1OU30gZnJvbSAnLi9saWIvY29uc3RhbnRzJztcblxuY29uc3QgY29ubmVjdFRvTW9kYWwgPSBzZXJ2aWNlcy5jb25uZWN0KHN0YXRlID0+IHN0YXRlLm1vZGFsKTtcbmNvbnN0IFNpZGVNb2RhbCA9IGNvbXBvc2UoaW5qZWN0LCBjb25uZWN0VG9Nb2RhbCkoTW9kYWwpO1xuXG5jb25zdCBnZXRDb29yZHNGcm9tTW91c2VFdmVudCA9IChjb2x1bW5zLCByb3dzKSA9PiAoZXYpID0+IHtcbiAgY29uc3Qge2N1cnJlbnRUYXJnZXQsIG9mZnNldFgsIG9mZnNldFl9ID0gZXY7XG4gIGNvbnN0IHtvZmZzZXRXaWR0aCwgb2Zmc2V0SGVpZ2h0fSA9IGN1cnJlbnRUYXJnZXQ7XG4gIGxldCB4cGl4ID0gb2Zmc2V0WDtcbiAgbGV0IHlwaXggPSBvZmZzZXRZO1xuICBsZXQge3RhcmdldH0gPSBldjtcbiAgd2hpbGUgKHRhcmdldCAhPT0gY3VycmVudFRhcmdldCkge1xuICAgIHhwaXggKz0gdGFyZ2V0Lm9mZnNldExlZnQ7XG4gICAgeXBpeCArPSB0YXJnZXQub2Zmc2V0VG9wO1xuICAgIHRhcmdldCA9IHRhcmdldC5vZmZzZXRQYXJlbnQ7XG4gIH1cbiAgY29uc3QgeCA9IE1hdGguZmxvb3IoKHhwaXggLyBvZmZzZXRXaWR0aCkgKiBDT0xVTU5TKSArIDE7XG4gIGNvbnN0IHkgPSBNYXRoLmZsb29yKCh5cGl4IC8gb2Zmc2V0SGVpZ2h0KSAqIFJPV1MpICsgMTtcbiAgcmV0dXJuIHt4LCB5fTtcbn07XG5cbmNvbnN0IENvbnRhaW5lciA9IGluamVjdCgoe3BhbmVsc30sIHthY3Rpb25zLCBjb25uZWN0fSkgPT4ge1xuXG4gIC8vY3JlYXRlIHN1YnNjcmlwdGlvbiB0byBwYW5lbCh4LHkpXG4gIGNvbnN0IGZpbmRQYW5lbEZyb21TdGF0ZSA9ICh4LCB5KSA9PiBzdGF0ZSA9PiBzdGF0ZS5ncmlkLnBhbmVscy5maW5kKCh7eDpweCwgeTpweX0pID0+IHggPT09IHB4ICYmIHkgPT09IHB5KTtcbiAgY29uc3Qgc3Vic2NyaWJlVG8gPSAoeCwgeSkgPT4gY29ubmVjdChmaW5kUGFuZWxGcm9tU3RhdGUoeCwgeSkpO1xuICBjb25zdCBzdWJzY3JpYmVGdW5jdGlvbnMgPSBwYW5lbHMubWFwKCh7eCwgeX0pID0+IGNvbXBvc2UoaW5qZWN0LCBzdWJzY3JpYmVUbyh4LCB5KSkpO1xuXG4gIC8vY3JlYXRlIGNvbm5lY3RlZCBjb21wb25lbnRzXG4gIGNvbnN0IEFkb3JuZXJQYW5lbENvbXBvbmVudHMgPSBzdWJzY3JpYmVGdW5jdGlvbnMubWFwKHN1YnNjcmliZSA9PiBzdWJzY3JpYmUoQWRvcm5lclBhbmVsKSk7XG4gIGNvbnN0IERhdGFQYW5lbENvbXBvbmVudHMgPSBzdWJzY3JpYmVGdW5jdGlvbnMubWFwKHN1YnNjcmliZSA9PiBzdWJzY3JpYmUoRGF0YVBhbmVsKSk7XG5cbiAgY29uc3QgY29vcmRzID0gZ2V0Q29vcmRzRnJvbU1vdXNlRXZlbnQoQ09MVU1OUywgUk9XUyk7XG5cbiAgY29uc3Qgb25EcmFnT3ZlciA9IChldikgPT4ge1xuICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3Qge3gsIHl9ID0gY29vcmRzKGV2KTtcbiAgICBhY3Rpb25zLmRyYWdPdmVyKCh7eCwgeX0pKTtcbiAgfTtcblxuICBjb25zdCBvbkRyb3AgPSBldiA9PiB7XG4gICAgY29uc3Qge2RhdGFUcmFuc2Zlcn0gPSBldjtcbiAgICBjb25zdCBkYXRhID0gZGF0YVRyYW5zZmVyLmdldERhdGEoJ3RleHQvcGxhaW4nKTtcbiAgICBjb25zdCBKc29uRGF0YSA9IEpTT04ucGFyc2UoZGF0YSk7XG4gICAgY29uc3Qge3g6c3RhcnRYLCB5OnN0YXJ0WSwgb3BlcmF0aW9ufSA9IEpzb25EYXRhO1xuICAgIGlmIChzdGFydFggJiYgc3RhcnRZICYmIFsnbW92ZScsICdyZXNpemUnXS5pbmNsdWRlcyhvcGVyYXRpb24pKSB7XG4gICAgICBjb25zdCB7eCwgeX0gPSBjb29yZHMoZXYpO1xuICAgICAgY29uc3QgYXJncyA9IHt4LCBzdGFydFgsIHksIHN0YXJ0WX07XG4gICAgICBpZiAob3BlcmF0aW9uID09PSAncmVzaXplJykge1xuICAgICAgICBhY3Rpb25zLmVuZFJlc2l6ZShhcmdzKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBhY3Rpb25zLmVuZE1vdmUoYXJncyk7XG4gICAgICB9XG4gICAgfVxuICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gIH07XG5cbiAgcmV0dXJuICg8ZGl2IGNsYXNzPVwiZ3JpZC1jb250YWluZXJcIj5cbiAgICA8ZGl2IGNsYXNzPVwiZ3JpZCBhZG9ybmVyLWxheWVyXCI+XG4gICAgICB7XG4gICAgICAgIEFkb3JuZXJQYW5lbENvbXBvbmVudHMubWFwKFBhbmVsID0+IDxQYW5lbC8+KVxuICAgICAgfVxuICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJncmlkIGRhdGEtbGF5ZXJcIiBvbkRyYWdvdmVyPXtvbkRyYWdPdmVyfSBvbkRyb3A9e29uRHJvcH0+XG4gICAgICB7XG4gICAgICAgIERhdGFQYW5lbENvbXBvbmVudHMubWFwKFBhbmVsID0+IDxQYW5lbC8+KVxuICAgICAgfVxuICAgIDwvZGl2PlxuICAgIDxTaWRlTW9kYWwgLz5cbiAgPC9kaXY+KTtcbn0pO1xuXG5jb25zdCB7Z3JpZDp7cGFuZWxzfX0gPSBzZXJ2aWNlcy5zdG9yZS5nZXRTdGF0ZSgpO1xuXG5tb3VudChDb250YWluZXIsIHtcbiAgcGFuZWxzOiBwYW5lbHNcbn0sIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYWluJykpO1xuIl0sIm5hbWVzIjpbIm1vdW50IiwiQWRvcm5lclBhbmVsIiwiZmxleGlibGUiLCJFbXB0eURhdGFQYW5lbCIsImNvbm5lY3QiLCJMaXN0RGF0YVBhbmVsIiwiQ2hhcnREYXRhUGFuZWwiLCJvblVwZGF0ZSIsInVwZGF0ZSIsIk1vZGFsIiwiTW9kYWxWaWV3Iiwic3dhcCIsImNvbXBvc2UiLCJjdXJyeSIsInRhcCIsIlN5bWJvbCIsIm9iamVjdFByb3RvIiwiaGFzT3duUHJvcGVydHkiLCJzeW1Ub1N0cmluZ1RhZyIsIm5hdGl2ZU9iamVjdFRvU3RyaW5nIiwicm9vdCIsInBvbnlmaWxsIiwiJCRvYnNlcnZhYmxlIiwicG9pbnRlciIsImZpbHRlciIsInNvcnRGYWN0b3J5Iiwic29ydCIsInNlYXJjaCIsInRhYmxlIiwic3QiLCJhY3Rpb25zIiwic21hcnRMaXN0UmVnaXN0cnkiLCJzbWFydExpc3RzIl0sIm1hcHBpbmdzIjoiQUFBQSxNQUFNLGVBQWUsR0FBRyxDQUFDLEtBQUssTUFBTTtFQUNsQyxRQUFRLEVBQUUsTUFBTTtFQUNoQixRQUFRLEVBQUUsRUFBRTtFQUNaLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQztFQUNkLFNBQVMsRUFBRSxDQUFDO0NBQ2IsQ0FBQyxDQUFDOzs7Ozs7Ozs7QUFTSCxBQUFnQixTQUFTLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsUUFBUSxFQUFFO0VBQ3hELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLO0lBQ25ELE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0QsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0dBQ2xDLEVBQUUsRUFBRSxDQUFDO0tBQ0gsR0FBRyxDQUFDLEtBQUssSUFBSTs7TUFFWixNQUFNLElBQUksR0FBRyxPQUFPLEtBQUssQ0FBQztNQUMxQixPQUFPLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxLQUFLLFVBQVUsR0FBRyxLQUFLLEdBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ2xGLENBQUMsQ0FBQzs7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LE9BQU8sQ0FBQyxDQUFDLENBQUM7O0FDRHBELGtCQUFlLENBQUMsSUFBSSxHQUFHLElBQUksRUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLEVBQUUsTUFBTSxLQUFLOztFQUV2RixNQUFNLFVBQVUsR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEtBQUs7SUFDcEMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUM7SUFDckIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQztJQUN2QixNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDO0lBQ3BDLElBQUksQ0FBQyxJQUFJLE1BQU0sSUFBSSxDQUFDLElBQUksTUFBTSxFQUFFO01BQzlCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO01BQzFCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO01BQzFCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7TUFDckQsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO01BQzdDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO01BQzNELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxHQUFHLFdBQVcsQ0FBQztTQUN0QyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDOUIsTUFBTSxDQUFDLENBQUMsSUFBSTtVQUNYLE1BQU0s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
