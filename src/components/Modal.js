import {h} from 'flaco';
import EditPanelDataModal from '../components/EditPanelDataModal';
import {default as ModalView}  from '../views/Modal';

export const EmptyModal = (props, grid, actions) => {
  return (<ModalView isOpen={props.isOpen} closeModal={actions.closeModal}>
    <div></div>
  </ModalView>);
};


export default Modal = (props, grid, actions) => {
  const {modalType} = props;
  const ModalComponent = modalType === 'createPanelData' ? EditPanelDataModal : EmptyModal;
  return ModalComponent(props, grid, actions);
};