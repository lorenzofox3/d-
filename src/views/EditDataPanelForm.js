import {h, onMount, withState} from 'flaco';
import modal from './Modal';
import {compose} from 'smart-table-operators';
import {autofocus} from '../ui-kit/util';
import {Tree, StarFull, Notification, Users, Embed2} from '../components/icons';

const AutofocusInput = autofocus(props => {
  delete props.children;
  return <input {...props} />
});
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
          <span class="focus-adorner">Issues</span>
        </div>
      </label>
      <label>
        <input required class="visuallyhidden" onChange={changeValue} value="prs" name="sourceType" type="radio"/>
        <div class="value-icon">
          <Tree/>
          <span class="focus-adorner">Pull requests</span>
        </div>
      </label>
      <label>
        <input required onChange={changeValue} class="visuallyhidden" value="stargazers" name="sourceType"
               type="radio"/>
        <div class="value-icon">
          <StarFull/>
          <span class="focus-adorner">Stargazers</span>
        </div>
      </label>
      <label>
        <input required onChange={changeValue} class="visuallyhidden" value="contributors" name="sourceType"
               type="radio"/>
        <div class="value-icon">
          <Users/>
          <span class="focus-adorner">Contributors</span>
        </div>
      </label>
      <label>
        <input required onChange={changeValue} class="visuallyhidden" value="commits" name="sourceType" type="radio"/>
        <div class="value-icon">
          <Embed2/>
          <span class="focus-adorner">Commits</span>
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
        <div class="form-content">
          <label>
            <AutofocusInput onChange={ev => onUpdate({title: ev.target.value})} name="title" required="true"/>
            <span class="focus-adorner">Panel title:</span>
          </label>
          <SourceTypeSelect {...props}/>
        </div>
        <div class="form-buttons">
          <button><span class="focus-adorner">Create</span></button>
        </div>
      </form>
    </div>);
};

export const CreateSmartChartForm = props => {
  const {onSubmit, onUpdate} = props;
  return (
    <div class="modal-content">
      <form onSubmit={onSubmit}>
        <div class="form-content">
          <label>
            <AutofocusInput onChange={ev => onUpdate({title: ev.target.value})} name="title" required="true"/>
            <span class="focus-adorner">Panel title:</span>
          </label>
          <SourceTypeSelect {...props}/>
        </div>
        <div class="form-buttons">
          <button><span class="focus-adorner">Create</span></button>
        </div>
      </form>
    </div>);
};

export const CreateSmartAggregationForm = props => {
  const {onSubmit, onUpdate} = props;
  return (
    <div class="modal-content">
      <form onSubmit={onSubmit}>
        <div class="form-content">
          <label>
            <AutofocusInput onChange={ev => onUpdate({title: ev.target.value})} name="title" required="true"/>
            <span class="focus-adorner">Panel title:</span>
          </label>
          <SourceTypeSelect {...props}/>
        </div>
        <div class="form-buttons">
          <button><span class="focus-adorner">Create</span></button>
        </div>
      </form>
    </div>
  )
};

const modalForm = Comp => props => {
  const UdpatableComp = statefullModal((props, update) => {
    const {data} = props;
    const onUpdate = val => {
      Object.assign(data, val);
      update({data, ...props});
    };
    return Comp({onUpdate, ...props});
  });
  return UdpatableComp(props);
};

export const CreateSmartListDataPanel = modalForm(CreateSmartListForm);
export const CreateSmartChartDataPanel = modalForm(CreateSmartChartForm);
export const CreateSmartAggregationDataPanel = modalForm(CreateSmartAggregationForm);
