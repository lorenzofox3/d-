import {h, onMount, onUpdate, onUnMount} from 'flaco';
import {dropdown} from 'lrtiste';

const dropdownify = Comp => {
  let dd;

  const mount = onMount(vnode => {
    dd = dropdown({element: vnode.dom});
  });

  const onupdate = onUpdate(n => {
    if (dd) {
      dd.clean()
    }
    dd = dropdown({element: n.dom});
    dd.collapse();
  });

  const unmount = onUnMount(_ => dd.clean());

  return unmount(mount(onupdate(Comp)));
};

export const Dropdown = dropdownify(props => {
  const {children} =props;
  delete props.children;
  return <div class="dropdown" {...props}>
    {children}
  </div>
});

export const MenuButton = props => {
  const {children} =props;
  delete props.children;
  return <button aria-haspopup="true" aria-expanded="false" type="button" {...props}>
    {children}
  </button>
};

export const Menu = props => {
  const {children} =props;
  delete props.children;
  return <ul role="menu" {...props}>
    {children}
  </ul>
};

export const MenuItem = props => {
  const {children, activateItem} = props;
  const onKeyDown = ev => {
    const {code} = ev;
    if (code === 'Enter' || code === 'Space') {
      activateItem();
    }
  };

  const onClick = _ => {
    activateItem();
  };

  delete props.children;
  return <li onKeyDown={onKeyDown} onClick={onClick} role="menuitem">
    {children}
  </li>
};