import {mount, h, connect} from 'flaco';
import {createStore} from 'redux';
import reducer from './reducer';
import  * as actionCreators from './actions';
import {Grid} from './grid'


const ROWS = 4;
const COLUMNS = 4;

//todo remove this
const grid = Grid();
const defaultState = {
  panels: [...grid]
};
//


const store = createStore(reducer(grid), defaultState);

const actions = {
  resizeOver: (arg) => store.dispatch(actionCreators.resizeOver(arg)),
  endResize: (arg) => store.dispatch(actionCreators.endResize(arg)),
  startResize: (arg) => store.dispatch(actionCreators.startResize(arg)),
};

const MovingPanel = (props) => {
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

  return (<div {...props} style={positionStyle} class={classes}>
    {children}
  </div>);
};

const AdornerPanel = ({x, y, adornerStatus}) => {
  const extraClasses = [];
  if (adornerStatus === 1) {
    extraClasses.push('valid-panel');
  } else if (adornerStatus === -1) {
    extraClasses.push('invalid-panel');
  }

  return <MovingPanel panelClasses={extraClasses} x={x} y={y} dx={1} dy={1}></MovingPanel>;
};

const DataPanel = ({dx, dy, x, y, adornerStatus = 0}) => {

  const onDragStart = ev => {
    ev.dataTransfer.dropEffect = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y}));
    actions.startResize({x, y});
  };

  const panelClasses = ['empty-panel'];

  const zIndex = (ROWS - y) * 10 + COLUMNS - x;

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }


  return (<MovingPanel style={`z-index:${zIndex};`} x={x} y={y} dx={dx} dy={dy} panelClasses={panelClasses}>
    <button>+</button>
    <div class="resize-handle" draggable="true" onDragStart={onDragStart}></div>
  </MovingPanel>);
};

const Container = ({panels}) => {

  const findPanelFromState = (x, y) => state => state.panels.find(({x:px, y:py}) => x === px && y === py);
  const subscribeFunctions = panels.map(({x, y}) => connect(store, actions, findPanelFromState(x, y)));

  const AdornerPanelComponents = subscribeFunctions.map(subscribe => subscribe(props => <AdornerPanel {...props} />));
  const DataPanelComponents = subscribeFunctions.map(subscribe => subscribe(props => <DataPanel {...props} />));

  const onDragOver = (ev) => {
    ev.preventDefault();
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
    actions.resizeOver(({x, y}));
  };

  const onDrop = ev => {
    const {currentTarget, offsetX, offsetY, dataTransfer} = ev;
    const {offsetWidth, offsetHeight} = currentTarget;
    const data = dataTransfer.getData('text/plain');
    const JsonData = JSON.parse(data);
    const {x:startX, y:startY} = JsonData;
    if (startX && startY) {
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
      actions.endResize(({x, startX, y, startY}));
    }
  };

  return (
    <div class="grid-container">
      <div class="grid adorner-layer">
        {
          AdornerPanelComponents.map(Panel => <Panel/>)
        }
      </div>
      <div class="grid data-layer" onDragover={onDragOver} onDrop={onDrop}>
        {
          DataPanelComponents.map(Panel => <Panel/>)
        }
      </div>
    </div>)
};

const {panels} = store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));

//todo remove dirty hack: kick with initial state
setTimeout(() => store.dispatch({type: 'FOO'}), 50);