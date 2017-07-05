import {h, onMount, withState} from 'flaco';
import modal from './Modal';
import {compose} from 'smart-table-operators';
import {Tree, StarFull, Notification, Users, Embed2} from '../components/icons';

const autofocus = onMount((vnode) => {
  vnode.dom.focus();
});
const AutofocusInput = autofocus(props => <input {...props} />);
const statefullModal = compose(withState, modal);

const SourceTypeSelect = props => {
  const {onUpdate} = props;
  const changeValue = ev => onUpdate({source: ev.target.value});
  return <fieldset>
    <legend>Select a data source:</legend>
    <div>
      <label>
        <input required class="visuallyhidden" onChange={changeValue} value="issues" name="sourceType" type="radio"/>
        <div class="value-icon">
          <Notification/>
          <span>Issues</span>
        </div>
      </label>
      <label>
        <input required class="visuallyhidden" onChange={changeValue} value="prs" name="sourceType" type="radio"/>
        <div class="value-icon">
          <Tree/>
          <span>Pull requests</span>
        </div>
      </label>
      <label>
        <input required onChange={changeValue} class="visuallyhidden" value="stargazers" name="sourceType"
               type="radio"/>
        <div class="value-icon">
          <StarFull/>
          <span>Stargazers</span>
        </div>
      </label>
      <label>
        <input required onChange={changeValue} class="visuallyhidden" value="contributors" name="sourceType"
               type="radio"/>
        <div class="value-icon">
          <Users/>
          <span>Contributors</span>
        </div>
      </label>
      <label>
        <input required onChange={changeValue} class="visuallyhidden" value="commits" name="sourceType" type="radio"/>
        <div class="value-icon">
          <Embed2/>
          <span>Commits</span>
        </div>
      </label>
    </div>
  </fieldset>
};

export const CreateSmartListForm = (props) => {
  const {onUpdate, onSubmit} = props;
  return (
    <div class="modal-content">
      <form onSubmit={onSubmit}>
        <label>
          <span>Panel title:</span>
          <AutofocusInput onChange={ev => onUpdate({title: ev.target.value})} name="title" required="true"/>
        </label>
        <SourceTypeSelect {...props}/>
        <button>Create</button>
      </form>
    </div>);
};

export const CreateSmartChartForm = props => {
  const {onSubmit, onUpdate} = props;
  return (<div class="modal-content">
    <form onSubmit={onSubmit}>
      <label>
        <span>Panel title:</span>
        <AutofocusInput onChange={ev => onUpdate({title: ev.target.value})} name="title" required="true"/>
      </label>
      <button>Create</button>
    </form>
  </div>);
};

export const CreateSmartListDataPanel = props => {
  const UpdatableFormSection = statefullModal((props, update) => {
    const {data} = props;
    const onUpdate = (val) => {
      Object.assign(data, val);
      update({data, ...props});
    };
    return CreateSmartListForm({onUpdate, ...props});
  });
  return UpdatableFormSection(props);
};

export const CreateSmartChartDataPanel = props => {
  const UpdatableFormSection = statefullModal((props, update) => {
    const {data} = props;
    const onUpdate = val => {
      Object.assign(data, val);
      update({data, ...props});
    };
    return CreateSmartChartForm({onUpdate, ...props})
  });

  return UpdatableFormSection(props);
};

