import {h} from 'flaco';

export const IssueCard = (props) => {
  const {issue = {}} = props;
  const {state, created_at, user, number, html_url, title, comments} = issue;
  return <article class="issue">
    <h3>{title}</h3>
    <a rel="self" href={html_url}>#{number}</a>
    <span class="status">{state}</span>
    <p class="meta">opened on
      <time> {(new Date(created_at)).toDateString()} </time>
      by <a rel="author" href={user.html_url}>{user.login}</a>
    </p>
    <p>
      {comments} C
    </p>
  </article>
};


export const IssuesList = (props) => {
  const {issues = []} = props;
  return (
    <div class="issues-list-container">
      <div class="fake-border"></div>
      <ul class="issues-list">
        {
          issues.map(i => <li><IssueCard issue={i}/></li>)
        }
      </ul>
      <div class="fake-border"></div>
    </div>);
};