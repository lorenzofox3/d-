import {mount, h} from 'flaco';
import AdornerPanel from './components/AdornerPanel';
import DataPanel from './components/DataPanel';
import Modal from './components/Modal.js';
import {compose} from 'smart-table-operators'
import services from './services/index'
import inject from './lib/di.js';
import {ROWS, COLUMNS} from './lib/constants';

const connectToModal = services.connect(state => state.modal);
const SideModal = compose(inject, connectToModal)(Modal);

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

const Container = inject(({panels}, {actions, connect}) => {

  //create subscription to panel(x,y)
  const findPanelFromState = (x, y) => state => state.grid.panels.find(({x:px, y:py}) => x === px && y === py);
  const subscribeTo = (x, y) => connect(findPanelFromState(x, y));
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

const {grid:{panels}} = services.store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));
