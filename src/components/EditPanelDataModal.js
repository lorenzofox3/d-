import {h} from 'flaco';
import {EditDataPanelModal} from '../views/EditDataPanelForm';

export default (props, grid, actions) => {
  const {x, y, data = {}, modalType} = props;
  const onSubmit = ev => {
    ev.preventDefault();
    actions.updatePanelData({x, y, data: data});
    const {type} = data;
    if (type === 'list') {

    }
    actions.closeModal();
  };

  return <EditDataPanelModal data={data} closeModal={actions.closeModal} {...props} onSubmit={onSubmit}/>
}


