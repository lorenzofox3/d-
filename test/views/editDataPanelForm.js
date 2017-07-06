import zora from 'zora';
import {h, mount} from 'flaco';
import {CreateSmartChartForm, CreateSmartListForm} from '../../src/views/EditDataPanelForm';

export default zora()
  .test('create chart panel form: should display the form', function * (t) {
    const container = document.createElement('div');
    mount(CreateSmartChartForm, {
      onSubmit: _ => {
      }
    }, container);
    const form = container.querySelector('form');
    t.ok(form.title,'input title should be defined');
  })
  .test('creaete smart list: should display the form', function * (t) {
    const container = document.createElement('div');
    mount(CreateSmartListForm, {
      onSubmit: _ => {
      }
    }, container);
    const form = container.querySelector('form');
    t.ok(form.title,'input title should be defined');
    t.ok(form.sourceType,'sourceType should be defined');
  })
