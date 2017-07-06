import {h} from 'flaco';
import modal from './Modal';

export default (props) => {
  const {closeModal, executeAction, message} = props;
  const confirm = _ => {
    closeModal();
    executeAction();
  };
  const Comp = modal(props =>
    <div>
      <p>{message}</p>
      <div>
        <button onClick={confirm}>Confirm</button>
        <button onClick={closeModal}>Cancel</button>
      </div>
    </div>);
  return Comp({title: 'Attention !', ...props});
};