import {h} from 'flaco';
import flexible from './FlexibleDataPanel';
import {StatsBars, List, Sigma} from '../components/icons';

export default flexible(props =>
  <div class="empty-panel-toolbar">
    <button onClick={props.createSmartList}><List/></button>
    <button onClick={props.createSmartChart}><StatsBars/></button>
    <button onClick={props.createSmartAggregation}><Sigma/></button>
  </div>);