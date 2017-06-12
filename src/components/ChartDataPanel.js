import {h} from 'flaco';
import ChartDataPanel from '../views/ChartDataPanel';
import flexible from './FlexibleDataPanel';

export default flexible((props, {grid}) => {
  const {x, y, onResizeStart, onMoveStart} = props;
  const panelData = grid.getData(x, y);
  return <ChartDataPanel onMoveStart={onMoveStart} onResizeStart={onResizeStart} {...panelData}/>
});