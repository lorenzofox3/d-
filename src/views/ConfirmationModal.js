import {h} from 'flaco';
import modal from './Modal';
import {autofocus} from '../ui-kit/util';

const FocusedButton = autofocus(props => {
  const {children} = props;
  delete props.children;
  return <button {...props}>{children}</button>
});

export default (props) => {
  const {closeModal, executeAction, message} = props;
  const confirm = _ => {
    closeModal();
    executeAction();
  };
  const Comp = modal(props =>
    <div class="modal-content">
      <p class="form-content">{message}</p>
      <div class="form-buttons">
        <button onClick={confirm}><span class="focus-adorner">Confirm</span></button>
        <FocusedButton onClick={closeModal}><span class="focus-adorner">Cancel</span></FocusedButton>
      </div>
    </div>);
  return Comp({title: 'Attention !', ...props});
};