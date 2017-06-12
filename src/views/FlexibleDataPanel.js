import {h} from 'flaco';
import Panel from './Panel';
import {ROWS, COLUMNS} from '../lib/constants'

const flexible = Comp => (props) => {
  const {x, y, dx, dy, adornerStatus, onResizeStart, onMoveStart} = props;
  const zIndex = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['data-panel'];

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return <Panel x={x} y={y} dx={dx} dy={dy} style={`z-index:${zIndex};`} panelClasses={panelClasses}>
    <div class="move-handle" draggable="true" onDragStart={onMoveStart}></div>
    <Comp {...props} />
    <div class="resize-handle" draggable="true" onDragStart={onResizeStart}></div>
  </Panel>
};

export default flexible;