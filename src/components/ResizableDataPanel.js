import {h} from 'flaco';
import {EmptyPanel} from '../views/ResizableDataPanel';


export const EmptyDataPanel = (props, grid, actions) => {
  const {x, y} = props;
  const panelData = grid.getData(x, y);

  const onDragStart = ev => {
    ev.dataTransfer.dropEffect = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y}));
    actions.startResize({x, y});
  };

  const onClick = _ => {
    actions.openModal({x, y, title: 'Create new data panel', modalType: 'newDataPanel'});
  };

  return <EmptyPanel {...panelData} onClick={onClick} onDragStart={onDragStart}/>;
};