import {IssuesList} from '../views/Issues'
import {h} from 'flaco';

export default (props) => {
  const {smartList, items =[], data={}} = props;
  const {showToolBar} = data;
  return (
    <div class="issues-container">
      <IssuesList showToolBar={showToolBar} smartList={smartList} issues={items.map(i => i.value)}/>
    </div>);

}