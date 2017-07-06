import {h} from 'flaco';
import panel from './Panel';
import {ROWS, COLUMNS} from '../lib/constants'
import {Enlarge, Enlarge2} from '../components/icons';

export default Comp => panel((props) => {
  const {x, y, dx = 1, dy = 1, adornerStatus, onResizeStart, onMoveStart} = props;
  const z = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['panel', 'data-panel'];

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return (<div x={x} y={y} dx={dx} dy={dy} z={z} class={panelClasses.join(' ')}>
    <div class="move-handle" draggable="true" onDragStart={onMoveStart}>
      <Enlarge/>
    </div>
    <Comp {...props} />
    <div class="resize-handle" draggable="true" onDragStart={onResizeStart}>
      <Enlarge2/>
    </div>
  </div>);
});