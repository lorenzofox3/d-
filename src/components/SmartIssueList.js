import {IssuesList} from '../views/Issues'
import {h} from 'flaco';


export default (props) => {
  const {smartList, items =[]} = props;
  return (
    <div class="issues-container">
      {/*<button onClick={ev => {*/}
        {/*smartList.sort({pointer: 'title', direction: ['asc', 'desc'][Math.random() > 0.5 ? 1 : 0]})*/}
      {/*}}>click</button>*/}
      <IssuesList issues={items.map(i => i.value)}/>
    </div>);

}