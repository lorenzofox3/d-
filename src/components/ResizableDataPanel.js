import {h} from 'flaco';
import {EmptyPanel, ListPanel, ChartPanel} from '../views/ResizableDataPanel';
import SmartIssuesList from './SmartIssueList';

export const EmptyDataPanel = (props, grid, actions) => {
  const {x, y, onDragStart} = props;
  const panelData = grid.getData(x, y);

  const onClick = _ => {
    actions.openModal({x, y, title: 'Create new data panel', modalType: 'createPanelData'});
  };

  return <EmptyPanel {...panelData} onClick={onClick} onDragStart={onDragStart}/>;
};

export const DataListPanel = (props, grid) => {
  const {x, y, onDragStart} = props;
  const panelData = grid.getData(x, y);
  return (<ListPanel onDragStart={onDragStart} {...panelData} >
    <SmartIssuesList x={x} y={y} />
  </ListPanel>);
};

export const ChartDataPanel = (props, grid) => {
  const {x, y, onDragStart} = props;
  const panelData = grid.getData(x, y);

  return <ChartPanel onDragStart={onDragStart} {...panelData}/>
};

const getDataPanel = (type) => {
  switch (type) {
    case 'chart':
      return ChartDataPanel;
    case 'list':
      return DataListPanel;
    default:
      return EmptyDataPanel;
  }
};

export const DataPanel = (props, grid, actions) => {
  const {x, y} = props;
  const panelData = grid.getData(x, y);
  const {data = {}}=panelData;

  const onDragStart = ev => {
    ev.dataTransfer.dropEffect = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y}));
    actions.startResize({x, y});
  };

  const Panel = getDataPanel(data.type);

  return Panel(Object.assign({onDragStart}, props), grid, actions);
};

