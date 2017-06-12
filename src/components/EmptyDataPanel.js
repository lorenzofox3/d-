import {h} from 'flaco';
import EmptyDataPanel from '../views/EmptyDataPanel';
import flexible from './FlexibleDataPanel';

export default flexible((props, {grid, actions}) => {
  const {x, y, onResizeStart, onMoveStart} = props;
  const panelData = grid.getData(x, y);

  const onClick = _ => {
    actions.openModal({x, y, title: 'Create new data panel', modalType: 'createPanelData'});
  };

  return <EmptyDataPanel {...panelData} onMoveStart={onMoveStart} onClick={onClick} onResizeStart={onResizeStart}/>;
});