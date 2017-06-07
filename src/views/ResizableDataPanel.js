import {ROWS, COLUMNS} from '../lib/const';
import {h} from 'flaco';
import Panel from './Panel';

const resizable = Comp => (props) => {
  const {x, y, dx, dy, adornerStatus, onDragStart} = props;
  const zIndex = (ROWS - y) * 10 + COLUMNS - x;
  const panelClasses = ['data-panel'];

  //todo
  delete props.onDragStart;

  if (adornerStatus !== 0) {
    panelClasses.push('active-panel');
  }

  return <Panel x={x} y={y} dx={dx} dy={dy} style={`z-index:${zIndex};`} panelClasses={panelClasses}>
    <Comp {...props} />
    <div class="resize-handle" draggable="true" onDragStart={onDragStart}></div>
  </Panel>
};

export const EmptyPanel = resizable(props => {
  return (<button onClick={props.onClick}>+</button>);
});

export const ChartPanel = resizable(props =>{
  return <p>That is a chart</p>;
});


export const ListPanel = resizable(props => {
  const {data = {}} = props;
  return (<div class="panel-content">
    <header class="panel-header">
      <h2>{data.title}</h2>
    </header>
    <div class="panel-body">
      {props.children}
    </div>
  </div>);
});