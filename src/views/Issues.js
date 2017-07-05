import {h} from 'flaco';
import {Dropdown, MenuButton, Menu, MenuItem} from '../ui-kit/dropdown'
import {Bubbles, Notification, SortAmountAsc} from '../components/icons';

export const IssueCard = (props) => {
  const {issue = {}} = props;
  const {state, created_at, user, number, html_url, title, comments} = issue;
  const classes = state === 'open' ? ['valid'] : ['invalid'];
  return <article class="issue">
    <h3>{title}</h3>
    <a rel="self" href={html_url}>#{number}</a>
    <div class="status">
      <Notification classes={classes}/>
      <span class={classes.join('')}>{state}</span>
    </div>
    <p class="meta">opened on
      <time> {(new Date(created_at)).toDateString()} </time>
      by <a rel="author" href={user.html_url}>{user.login}</a>
    </p>
    <p class="comments">
      <Bubbles/>
      <span>{comments}</span>
    </p>
  </article>
};

//todo generate id for dropdowns
export const IssuesList = (props) => {
  const {issues = [], smartList, showToolBar} = props;
  return (
    <div class="issues-list-container">
      <div aria-hidden={String(showToolBar !== true)} role="toolbar">
        <Dropdown id="dropdown-sample">
          <MenuButton aria-controls="menu"><SortAmountAsc/></MenuButton>
          <Menu id="menu">
            <MenuItem activateItem={_ => smartList.sort({pointer: 'created_at', direction: 'desc'}) }> Newest</MenuItem>
            <MenuItem activateItem={_ => smartList.sort({pointer: 'created_at', direction: 'asc'}) }>Oldest</MenuItem>
            <MenuItem activateItem={_ => smartList.sort({pointer: 'comments', direction: 'desc'}) }>Most
              commented</MenuItem>
            <MenuItem activateItem={_ => smartList.sort({pointer: 'comments', direction: 'asc'}) }>Least
              commented</MenuItem>
            <MenuItem activateItem={_ => smartList.sort({pointer: 'updated_at', direction: 'desc'}) }>Recently
              updated</MenuItem>
            <MenuItem activateItem={_ => smartList.sort({pointer: 'updated_at', direction: 'asc'}) }>Least recently
              updated</MenuItem>
          </Menu>
        </Dropdown>
      </div>
      <ul class="issues-list">
        {
          issues.map(i => <li><IssueCard issue={i}/></li>)
        }
      </ul>
      <div class="fake-border"></div>
    </div>);
};