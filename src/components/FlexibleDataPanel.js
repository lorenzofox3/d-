export default (Comp) => (props, services) => {
  const {x, y} = props;
  const {actions} = services;

  const onResizeStart = ev => {
    ev.dataTransfer.dropEffect = 'copy';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y, operation: 'resize'}));
    actions.startResize({x, y});
  };

  const onMoveStart = ev => {
    ev.dataTransfer.dropEffect = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({x, y, operation: 'move'}));
    actions.startMove({x, y});
  };

  return Comp(Object.assign(props, {onResizeStart, onMoveStart}), services);
};

