import {h} from 'flaco';

export default (props) => {
  return (
    <div class="modal-content">
      <form>
        <label>
          <span>Panel title:</span>
          <input required="true"/>
        </label>
        <button>Create</button>
      </form>
    </div>);
};