import {mount, h, connect} from 'flaco';
import {createStore} from 'redux';
import reducer from './reducers/index';
import  * as actionCreators from './actions/index';
import {Grid} from './lib/grid'
import subscribe from './containers/panel';
import AdornerPanel from './components/AdornerPanel';
import DataPanel from './components/DataPanel';
import {ROWS, COLUMNS} from './lib/const';
import Modal from './components/Modal';
import connectModal from './containers/modal';

//todo: find  this from server etc
const grid = Grid({rows: ROWS, columns: COLUMNS});
const initialState = {
  grid: {
    panels: [...grid],
    active: null
  }
};
//

const store = createStore(reducer(grid), initialState);
const actions = {
  resizeOver: (arg) => store.dispatch(actionCreators.resizeOver(arg)),
  endResize: (arg) => store.dispatch(actionCreators.endResize(arg)),
  startResize: (arg) => store.dispatch(actionCreators.startResize(arg)),
  openModal: (args) => store.dispatch(actionCreators.openModal(args)),
  closeModal: (args) => store.dispatch(actionCreators.closeModal(args))
};

const onDragResize = (x, y) => ev => {
  ev.dataTransfer.dropEffect = 'move';
  ev.dataTransfer.setData('text/plain', JSON.stringify({x, y}));
  actions.startResize({x, y});
};

const onClickOpenModal = (x, y) => ev => {
  actions.openModal({x, y, title:'Create new data panel', modalType:'newDataPanel'});
};

const ResizableDataPanel = (props) => {
  const {x, y} = props;
  const onDragStart = onDragResize(x, y);
  const onClick = onClickOpenModal(x, y);
  return <DataPanel onDragStart={onDragStart} onClick={onClick} {...props} ></DataPanel>
};

const SideModal = connectModal(store, actions)(props => {
  return (<Modal closeModal={actions.closeModal} {...props} ></Modal>);
});


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

const Container = ({panels}) => {
  const subscribeTo = subscribe(store, actions);
  const subscribeFunctions = panels.map(({x, y}) => subscribeTo(x, y));

  const AdornerPanelComponents = subscribeFunctions.map(subscribe => subscribe(props => <AdornerPanel {...props} />));
  const DataPanelComponents = subscribeFunctions.map(subscribe => subscribe(props =>
    <ResizableDataPanel {...props} />));

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
      <SideModal></SideModal>
    </div>)
};

const {grid:{panels}} = store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));

//todo remove dirty hack: kick with initial state
setTimeout(() => store.dispatch({type: 'FOO'}), 50);