import flexible from './FlexibleDataPanel';
import {h} from 'flaco';
import {Equalizer, Bin2, Wrench} from '../components/icons';

export default flexible(props => {
  const {data = {}, onReset, onEdit, onToggleToolBar} = props;
  const {processing = false} = data;
  const showToolbar = String(data.showToolBar === true);
  //todo aria-controls
  return (<div class="panel-content">
    <header class="panel-header">
      <h2>{data.title}</h2>
      <button aria-haspopup="true" aria-pressed={showToolbar} aria-expanded={showToolbar} onClick={onToggleToolBar}><Wrench/></button>
      <button onClick={onEdit}><Equalizer/></button>
      <button onClick={onReset}><Bin2/>
      </button>
    </header>
    <div class="panel-body">
      <div aria-hidden={String(!processing)} class="processing-overlay">
        Processing ...
      </div>
      {props.children}
    </div>
  </div>);
});