import {mount, h} from 'flaco';
import AdornerPanel from './components/AdornerPanel';
import {DataPanel} from './components/ResizableDataPanel';
import {ROWS, COLUMNS} from './lib/const';
import App from './lib/store';
import Modal from './components/Modal.js';
import {compose} from 'smart-table-operators'

const {store, connect, gridify} = App;

const connectToModal = connect(state => state.modal);
const SideModal = compose(gridify,connectToModal)(Modal);

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
  const subscribeFunctions = panels.map(({x, y}) => compose(gridify, subscribeTo(x, y)));

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

  return (<div class="grid-container">
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
    <SideModal />
  </div>);
});

const {grid:{panels}} = store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));
