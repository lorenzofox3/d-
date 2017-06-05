import {h} from 'flaco'
import Panel from '../views/Panel';

export default ({x, y, adornerStatus}) => {
  const extraClasses = [];
  if (adornerStatus === 1) {
    extraClasses.push('valid-panel');
  } else if (adornerStatus === -1) {
    extraClasses.push('invalid-panel');
  }

  return <Panel panelClasses={extraClasses} x={x} y={y} dx={1} dy={1}></Panel>;
};