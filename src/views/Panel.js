import {h} from 'flaco';

export default (props) => {
  //todo destruct with rest {...otherProps} instead of deleting stuffs
  const {dx = 1, dy = 1, x, y, panelClasses, children, style = ''} = props;
  delete props.children;
  delete props.panelClasses;
  delete props.dx;
  delete props.dy;
  delete props.x;
  delete props.y;
  delete props.style;

  const positionStyle = `
    --grid-column-offset: ${x};
    --grid-row-offset: ${y};
    --grid-row-span: ${dy};
    --grid-column-span: ${dx};
    ${style}
`;

  const classes = ['panel'].concat(panelClasses).join(' ');

  return (<div {...props} style={positionStyle} class={classes}>
    {children}
  </div>);
}