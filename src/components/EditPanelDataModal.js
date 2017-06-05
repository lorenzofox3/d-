import {h} from 'flaco';
import EditPanelDataForm from '../views/EditDataPanelForm';

export default (props, grid, actions) =>{
    const {x,y} = props;
    const onSubmit = ev => {
      ev.preventDefault();
      const {target} = ev;
      const title = target.title.value;
      actions.updatePanelData({x, y, data: {title}});
    };
    return <EditPanelDataForm onSubmit={onSubmit} />
};