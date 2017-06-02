import {h} from 'flaco'
import NewDataPanel from './NewDataPanelModal';

const DefaultModal = props => <div>{props.children}</div>;

export default (props) => {
  let ModalContent = DefaultModal;

  if (props.modalType === 'newDataPanel') {
    ModalContent = NewDataPanel;
  }

  return (<div aria-hidden={String(!props.isOpen)} class="modal">
    <header>
      <h2>{props.title}</h2>
      <button onClick={props.closeModal}>X</button>
    </header>
    <ModalContent {...props}/>
  </div>);
}