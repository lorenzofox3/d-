import {h} from 'flaco';

export default (props) => {
  return (
    <div class="modal-content">
      <form onSubmit={props.onSubmit}>
        <label>
          <span>Panel title:</span>
          <input name="title" required="true"/>
        </label>
        <button>Create</button>
      </form>
    </div>);
};