import {onMount} from 'flaco';

export const autofocus = onMount((vnode) => {
  vnode.dom.focus();
});
