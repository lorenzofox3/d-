import {h} from 'flaco'

export default modalCombinator = (Comp) => (props, grid, actions) => {
  const Wrapped = () => Comp(props, grid, actions);
  return (<div aria-hidden={String(!props.isOpen)} class="modal">
    <header>
      <h2>{props.title}</h2>
      <button onClick={actions.closeModal}>X</button>
    </header>
    <Wrapped/>
  </div>);
};