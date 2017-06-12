import {h} from 'flaco';
import ComfirmationModal from '../views/ConfirmationModal';

export default (props, {actions}) => <ComfirmationModal closeModal={actions.closeModal} {...props} />
