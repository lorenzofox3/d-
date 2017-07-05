import {h} from 'flaco';
import {CreateSmartListModal, CreateSmartChartModal} from './EditPanelDataModal';
import ConfirmationModal from './ConfirmationModal';
import {default as ModalView}  from '../views/Modal';


export const EmptyModal = ModalView((props) => {
    return <div></div>;
});

const getModalComponent = (modalType) => {
  switch (modalType) {
    case 'createSmartListPanelData':
      return CreateSmartListModal;
    case 'createSmartChartPanelData':
      return CreateSmartChartModal;
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