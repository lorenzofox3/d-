import Panel from './Panel';
import {ROWS, COLUMNS} from '../lib/const';
import {h} from 'flaco';

export default ({dx, dy, x, y, adornerStatus = 0, onDragStart}) => {

  const panelClasses = ['empty-panel'];

  const zIndex = (ROWS - y) * 10 + COLUMNS - x;

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return (<Panel style={`z-index:${zIndex};`} x={x} y={y} dx={dx} dy={dy} panelClasses={panelClasses}>
    <button>+</button>
    <div class="resize-handle" draggable="true" onDragStart={onDragStart}></div>
  </Panel>);
}