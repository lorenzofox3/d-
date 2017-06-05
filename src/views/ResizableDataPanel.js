import {ROWS, COLUMNS} from '../lib/const';
import {h} from 'flaco';
import Panel from './Panel';

export const EmptyPanel = (props) => {
  const {x, y, dx, dy, adornerStatus, onDragStart, onClick} = props;
  const zIndex = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['empty-panel'];

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return <Panel x={x} y={y} dx={dx} dy={dy} style={`z-index:${zIndex};`} panelClasses={panelClasses}>
    <button onClick={onClick}>+</button>
    <div class="resize-handle" draggable="true" onDragStart={onDragStart}></div>
  </Panel>
};