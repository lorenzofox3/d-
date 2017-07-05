import {h} from 'flaco';
import {CreateSmartListDataPanel, CreateSmartChartDataPanel} from '../views/EditDataPanelForm';

const CreateDataPanel = (Comp, defaultData) => (props, {actions}) => {
  const {x, y, data = defaultData} = props;
  const onSubmit = ev => {
    ev.preventDefault();
    actions.updatePanelData({x, y, data});
    actions.closeModal();
  };
  return Comp({data, closeModal: actions.closeModal, onSubmit, ...props});
};

export const CreateSmartListModal = CreateDataPanel(CreateSmartListDataPanel, {type: 'list', showToolBar: true});

export const CreateSmartChartModal = CreateDataPanel(CreateSmartChartDataPanel, {type:'chart', showToolBar:true});


