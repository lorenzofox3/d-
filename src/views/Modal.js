import {h} from 'flaco';
import {Cross} from '../components/icons';

const modal = Comp => props => {
  const {isOpen, closeModal, title} = props;
  const onKeyDown = ({code}) => {
    if (code === 'Escape') {
      closeModal();
    }
  };

  return (<div aria-hidden={String(!isOpen)} onKeyDown={onKeyDown} class="modal">
    <header>
      <h2>{title}</h2>
      <button onClick={closeModal}><Cross></Cross></button>
    </header>
    <div class="blurry-background"></div>
    <Comp {...props}/>
  </div>)
};

export default modal;