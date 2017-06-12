import {h} from 'flaco';
import Modal from './Modal';


export default (props) => {
  const {isOpen, closeModal, executeAction, message} = props;
  const confirm = _ => {
    closeModal();
    executeAction();
  };
  return <Modal isOpen={isOpen} closeModal={closeModal} title="Attention !">
    <p>{message}</p>
    <div>
      <button onClick={confirm}> Confirm</button>
      <button onClick={closeModal}> Cancel</button>
    </div>
  </Modal>
}