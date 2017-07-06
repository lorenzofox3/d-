import {h} from 'flaco'
import panel from '../views/Panel';

export default panel(({x, y, adornerStatus}) => {
  const classes = ['panel'];
  if (adornerStatus === 1) {
    classes.push('valid-panel');
  } else if (adornerStatus === -1) {
    classes.push('invalid-panel');
  }
  return <div class={classes.join(' ')} x={x} y={y} dx={1} dy={1}></div>;
});