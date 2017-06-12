import {h} from 'flaco'
import AdornerPanel from '../views/AdornerPanel';

export default (props, {grid}) => {
  const {x, y} = props;
  const {adornerStatus = 0} = grid.getData(x, y);
  return <AdornerPanel x={x} y={y} adornerStatus={adornerStatus}/>
}