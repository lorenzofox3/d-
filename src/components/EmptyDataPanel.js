import {h} from 'flaco';
import EmptyDataPanel from '../views/EmptyDataPanel';
import flexible from './FlexibleDataPanel';

export default flexible((props, {grid, actions}) => {
  const {x, y, onResizeStart, onMoveStart} = props;
  const panelData = grid.getData(x, y);

  const createSmartList = _ => {
    actions.openModal({x, y, title: 'Create new data panel', modalType: 'createSmartListPanelData'});
  };

  const createSmartChart = _ => {
    actions.openModal({x, y, title: 'Create new Chart data panel', modalType: 'createSmartChartPanelData'})
  };

  return <EmptyDataPanel {...panelData} onMoveStart={onMoveStart} createSmartList={createSmartList}
                         createSmartChart={createSmartChart}
                         onResizeStart={onResizeStart}/>;
});