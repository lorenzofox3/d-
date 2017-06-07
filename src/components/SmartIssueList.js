import {IssuesList} from '../views/Issues'
import {h} from 'flaco';
import App from '../lib/store';


const connectToSmartList = (x, y) => App.connect(state => state.smartList.find(sl => sl.x === x && sl.y === y));

export default (props) => {

  const {x, y} = props;
  const smartTable = App.smartListRegistry.getSmartList(x, y);
  const connect = connectToSmartList(x, y);

  const Comp = connect(({items=[]}) => (
    <div class="issues-container">
      <button onClick={ev => {
        smartTable.sort({pointer: 'title', direction:['asc','desc'][Math.random() > 0.5 ? 1 :0]})
      }}>click
      </button>
      <IssuesList issues={items.map(i=>i.value)} />
    </div>));

  return <Comp/>;
}