import {mount, h} from 'flaco';
import Modal from './components/Modal.js';
import {compose} from 'smart-table-operators'
import services from './services/index'
import inject from './lib/di.js';
import {AdornerGrid, DataGrid} from './components/grid';

const connectToModal = services.connect(state => state.modal);
const SideModal = compose(inject, connectToModal)(Modal);
const Container = inject(({panels}, services) => {

  const Adorners = props => AdornerGrid(props, services);

  const DataGridPanels = props => DataGrid(props, services);

  return (<div class="grid-container">
    <Adorners panels={panels}/>
    <DataGridPanels panels={panels}/>
    <SideModal />
  </div>);
});

const {grid: {panels}} = services.store.getState();

mount(Container, {
  panels: panels
}, document.getElementById('main'));
