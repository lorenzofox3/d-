import {h} from 'flaco';
import EditPanelDataModal from './EditPanelDataModal';
import ConfirmationModal from './ConfirmationModal';
import {default as ModalView}  from '../views/Modal';

export const EmptyModal = (props, {actions}) => {
  return (<ModalView isOpen={props.isOpen} closeModal={actions.closeModal}>
    <div></div>
  </ModalView>);
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

export default Modal = (props, services) => {
  const {modalType} = props;
  const ModalComponent = getModalComponent(modalType);
  return ModalComponent(props, services);
};