import modal from '../../src/views/modal';
import Confirmation from '../../src/views/ConfirmationModal';
import zora from 'zora';
import {h, mount} from 'flaco';
import {wait} from '../util';

export default zora()
  .test('modal combinator: should have wrapped a component into a modal', function * (t) {
    let count = 0;
    const Comp = props => <p id="wrapped">Hello {props.world}</p>;
    const Wrapped = modal(Comp);
    const container = document.createElement('div');
    const closeModal = _ => {
      count++;
    };

    mount(Wrapped, {world: 'world', isOpen: true, closeModal, title: 'test modal'}, container);

    //event registration happen on next tick;
    yield wait();

    const title = container.querySelector('h2');
    const p = container.querySelector('p#wrapped');
    const button = container.querySelector('button');
    const modalDiv = container.querySelector('div.modal');

    button.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, clientX: 23, clientY: 234}));

    t.equal(title.innerHTML, 'test modal', 'should have set the title on the modal header');
    t.equal(p.innerHTML, 'Hello world', 'should have wrapped the component and forwarded properties');
    t.equal(modalDiv.getAttribute('aria-hidden'), 'false', 'should set the aria-attributes accordingly to isOpen');
    t.equal(count, 1, 'should have called the close modal function on button click');

    modalDiv.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape', bubbles: true, cancelable: true}));
    t.equal(count, 2, 'should have called the close modal function on Escape');

  })
  .test('confirmation modal: should display the message and selections buttons', function * (t) {
    const container = document.createElement('div');
    mount(Confirmation, {message: 'from confirmation'}, container);
    const p = container.querySelector('p');
    t.equal(p.innerHTML, 'from confirmation', 'should have set the message');
    const buttons = container.querySelectorAll('button');
    const h2 = container.querySelector('h2');
    t.equal(buttons.length, 3, 'should have 3 buttons');
    const [cross, confirm, cancel] = buttons;
    t.equal(confirm.innerHTML, 'Confirm', 'Confirm button should be first');
    t.equal(cancel.innerHTML, 'Cancel', 'Cancel button should be second');
    t.equal(h2.innerHTML, 'Attention !', 'should have set the default title');
  })
  .test('confirmation modal: should execute bound action and close modal', function * (t) {
    let closed = false;
    let confirmed = false;

    const closeModal = _ => closed = true;
    const executeAction = _ => confirmed = true;

    const container = document.createElement('div');
    mount(Confirmation, {message: 'from confirmation', closeModal, executeAction}, container);

    yield wait();

    const [b1, confirm, b2] = container.querySelectorAll('button');
    confirm.dispatchEvent(new MouseEvent('click'));
    t.equal(closed, true,'modal should be closed');
    t.equal(confirmed, true,'modal should have executed the bound action');
  })
  .test('confirmation modal: should close modal on cancel', function * (t) {
    let closed = false;
    let confirmed = false;

    const closeModal = _ => closed = true;
    const executeAction = _ => confirmed = true;

    const container = document.createElement('div');
    mount(Confirmation, {message: 'from confirmation', closeModal, executeAction}, container);

    yield wait();

    const [b1, confirm, cancel] = container.querySelectorAll('button');
    cancel.dispatchEvent(new MouseEvent('click'));
    t.equal(closed, true,'modal should be closed');
    t.equal(confirmed, false,'modal should not have executed the bound action');

  })
