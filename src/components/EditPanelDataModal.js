import {h} from 'flaco';
import {EditDataPanelModal} from '../views/EditDataPanelForm';

export default (props, {actions}) => {
  const {x, y, data = {}} = props;
  const onSubmit = ev => {
    ev.preventDefault();
    actions.updatePanelData({x, y, data: data});
    actions.closeModal();
  };

  return <EditDataPanelModal data={data} closeModal={actions.closeModal} {...props} onSubmit={onSubmit}/>
}


