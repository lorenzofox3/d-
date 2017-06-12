import {h} from 'flaco';
import EmptyDataPanel from './EmptyDataPanel';
import ListDataPanel from './ListDataPanel';
import ChartDataPanel from './ChartDataPanel';

const getDataPanel = (type) => {
  switch (type) {
    case 'chart':
      return ChartDataPanel;
    case 'list':
      return ListDataPanel;
    default:
      return EmptyDataPanel;
  }
};

export default (props, services) => {
  const {x, y} = props;
  const {grid} = services;
  const panelData = grid.getData(x, y);
  const {data = {}}=panelData;
  const Panel = getDataPanel(data.type);
  return Panel(props, services);
};