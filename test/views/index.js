import zora from 'zora';
import modalCombinator from './modal';
import EditForms from './editDataPanelForm'
import panels from './panels';

export default zora()
  .test(modalCombinator)
  .test(EditForms)
  .test(panels)
;