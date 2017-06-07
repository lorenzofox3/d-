import {h} from 'flaco';

export default props => {
  const {isOpen, closeModal, title} = props;
  const onKeyDown = ({code}) => {
    if(code === 'Escape'){
      closeModal();
    }
  };

  return (<div aria-hidden={String(!isOpen)} onKeyDown={onKeyDown} class="modal">
    <header>
      <h2>{title}</h2>
      <button onClick={closeModal}>X</button>
    </header>
    {props.children}
  </div>)
};