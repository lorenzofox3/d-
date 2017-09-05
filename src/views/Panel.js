import {h, onMount, onUpdate} from 'flaco';
import {compose} from 'smart-table-operators';

const setCustomProperties = vnode => {
  const {props, dom} = vnode;
  const {x, y, dx, dy, z} = (props || {});
  if (dom) {
    dom.style.setProperty('--grid-column-offset', x);
    dom.style.setProperty('--grid-row-offset', y);
    dom.style.setProperty('--grid-column-span', dx);
    dom.style.setProperty('--grid-row-span', dy);
    if (z) {
      dom.style.setProperty('z-index', z);
    }
  }
};

export default compose(onMount(setCustomProperties), onUpdate(setCustomProperties));