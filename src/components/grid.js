import {h, connect} from 'flaco';
import AdornerPanel from './AdornerPanel';
import DataPanel from './DataPanel';
import {ROWS, COLUMNS} from '../lib/constants';

const findPanelFromState = (x, y) => state => state.grid.panels.find(({x: px, y: py}) => x === px && y === py);

export const AdornerGrid = (props, services) => {
  const {panels = []} = props;
  const {connect} = services;
  const subscribeTo = (x, y) => connect(findPanelFromState(x, y));
  const PanelComponents = panels.map(({x, y}) => subscribeTo(x, y)(props => AdornerPanel(props, services)));

  return <div class="grid adorner-layer">
    {
      PanelComponents.map(Panel => <Panel/>)
    }
  </div>;
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

export const DataGrid = (props, services) => {
  const {panels = []} = props;
  const {connect, actions} = services;
  const subscribeTo = (x, y) => connect(findPanelFromState(x, y));
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

  return <div class="grid data-layer" onDragover={onDragOver} onDrop={onDrop}>
    {
      PanelComponents.map(Panel => <Panel/>)
    }
  </div>;
};