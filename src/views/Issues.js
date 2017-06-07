import {h} from 'flaco';

export const IssueCard = (props) => {
  const {issue = {}} = props;
  const {id, state, created_at, number, html_url, title} = issue;
  return <article class="issue">
    <header>
      <a href={html_url}>#{number}</a>
      <div>
        <h3>{title}</h3>
        <small>created at:
          <time>{created_at}</time>
        </small>
      </div>
      <span>{state}</span>
    </header>
  </article>
};


export const IssuesList = (props) => {
  const {issues = []} = props;
  return (<ul class="issues-list">
    {
      issues.map(i => <li><IssueCard issue={i}/></li>)
    }
  </ul>);
};