import {h} from 'flaco';
import flexible from './FlexibleDataPanel';

export default flexible(props => {
  const {data = {}, onReset, onEdit} = props;
  const {processing = false} = data;
  return (<div class="panel-content">
    <header class="panel-header">
      <h2>{data.title}</h2>
      <button onClick={onReset}>Reset</button>
      <button onClick={onEdit}>Edit</button>
    </header>
    <div class="panel-body">
      <div aria-hidden={String(!processing)} class="processing-overlay">
        Processing ...
      </div>
      {props.children}
    </div>
  </div>);
});