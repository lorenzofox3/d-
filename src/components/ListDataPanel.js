import {h} from 'flaco';
import ListDataPanel from '../views/ListDataPanel';
import flexible from './FlexibleDataPanel';
import SmartIssuesList from './SmartIssueList';

//todo
const DummyList = () => <div>
  <p>Error: list type not supported</p>
</div>;


export default flexible(((props, services) => {
  const {grid, smartLists, connect, actions} = services;
  const {x, y, onResizeStart, onMoveStart} = props;
  const panelData = grid.getData(x, y);
  const smartList = smartLists.findOrCreate(x, y);
  const connectFunc = connect(state => state.smartList.find(sl => sl.x === x && sl.y === y));

  const SmartListComponent = connectFunc((props) => getListComponent(panelData.data.source)(props, services));

  const clickReset = _ => {
    actions.openModal({
      modalType: 'askConfirmation',
      message: `You are about to lose the data related to the panel "${panelData.data.title}". Are you sure you want to proceed ?`,
      executeAction: () => {
        actions.resetPanel({x, y});
      }
    });
  };

  const clickEdit = _ => {
    actions.editPanel({x, y});
    smartList.remove();
  };

  return (<ListDataPanel onEdit={clickEdit} onReset={clickReset} onMoveStart={onMoveStart}
                         onResizeStart={onResizeStart} {...panelData} >
    <SmartListComponent smartList={smartList} x={x} y={y}/>
  </ListDataPanel>);
}));

const getListComponent = (source) => {
  switch (source) {
    case 'issues':
      return SmartIssuesList;
    default:
      return DummyList;
  }
};