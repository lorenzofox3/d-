import zora from 'zora';
import combinator from '../../src/views/Panel';
import panel from '../../src/views/FlexibleDataPanel';
import AdornerPanel from '../../src/views/AdornerPanel';
import {h, mount} from 'flaco';

const wait = (time = 10) => new Promise((resolve) => {
  setTimeout(() => resolve(true), time);
});

export default zora()
  .test('should set positioning variables', function * (t) {
    const container = document.createElement('div');
    const comp = combinator(props => <div {...props}>foo</div>);
    mount(comp, {dx: 2, dy: 3, x: 1, y: 4, z: 100}, container);
    const panel = container.querySelector('div');
    yield wait();
    t.equal(Number(panel.style.getPropertyValue('--grid-column-offset')), 1);
    t.equal(Number(panel.style.getPropertyValue('--grid-row-offset')), 4);
    t.equal(Number(panel.style.getPropertyValue('--grid-column-span')), 2);
    t.equal(Number(panel.style.getPropertyValue('--grid-row-span')), 3);
    t.equal(Number(panel.style.getPropertyValue('z-index')), 100);
  })
  .test('should create a flexible panel', function * (t) {
    const container = document.createElement('div');
    const comp = panel(props => <p>foo</p>);
    mount(comp, {
      x: 2, y: 3, dx: 1, dy: 1
    }, container);
    const move = container.querySelector('.move-handle');
    const resize = container.querySelector('.resize-handle');
    const p = container.querySelector('p');
    t.ok(move, 'the move handle should be defined');
    t.equal(move.getAttribute('draggable'), 'true');
    t.ok(resize, 'the resize handle should be defined');
    t.equal(resize.getAttribute('draggable'), 'true');
    t.equal(p.innerHTML, 'foo', 'component should have been wrapped');
  })
  .test('flexible panel should have classnames depending on adorner status', function * (t) {
    const container = document.createElement('div');
    const comp = panel(props => <p>foo</p>);
    mount(comp, {
      x: 2, y: 3, dx: 1, dy: 1, adornerStatus: 0
    }, container);
    let div = container.firstChild;
    t.ok(div.classList.contains('panel'));
    t.ok(div.classList.contains('data-panel'));
    t.ok(div.classList.contains('active-panel') === false);
    container.innerHTML = '';
    mount(comp, {
      x: 2, y: 3, dx: 1, dy: 1, adornerStatus: 1
    }, container);
    div = container.firstChild;
    t.ok(div.classList.contains('panel'));
    t.ok(div.classList.contains('data-panel'));
    t.ok(div.classList.contains('active-panel'));
  })
  .test('adorner panel: should have the valid class if the panel is set as valid', function * (t) {
    const container = document.createElement('div');
    mount(<AdornerPanel adornerStatus={1}/>, {}, container);
    let div = container.firstChild;
    t.ok(div.classList.contains('valid-panel'));
    t.notOk(div.classList.contains('invalid-panel'));
    container.innerHTML='';
    mount(<AdornerPanel adornerStatus={-1}/>, {}, container);
    div=  container.firstChild;
    t.notOk(div.classList.contains('valid-panel'));
    t.ok(div.classList.contains('invalid-panel'));
  })