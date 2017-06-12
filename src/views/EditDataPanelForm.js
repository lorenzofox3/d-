import {h, onMount, withState} from 'flaco';
import Modal from './Modal';

const autofocus = onMount((vnode) => {
  vnode.dom.focus();
});
const AutofocusInput = autofocus(props => <input {...props} />);

const SourceTypeSelect = props => {
  const {onUpdate} = props;
  return <label>
    <span>Source type</span>
    <select required="true" onChange={ev => onUpdate({source: ev.target.value})} name="sourceType">
      <option value="">-</option>
      <option value="issues">Issues</option>
      <option value="prs">Pull request</option>
    </select>
  </label>
};
const ListInput = (props) => {
  return (<div>
    <SourceTypeSelect {...props} />
  </div>);
};
const ChartInput = () => <p>Chart Input</p>;
const AggregationInput = () => <p>AggregationInput</p>;
const NoTypeInput = () => <p>Select a panel type </p>;

const getInputSection = (data = {}) => {
  const {type} = data;
  switch (type) {
    case 'list':
      return ListInput;
    case 'chart':
      return ChartInput;
    case 'aggregation':
      return AggregationInput;
    default:
      return NoTypeInput;
  }
};

export const TypeSection = (props) => {
  const {data, onUpdate} = props;
  const InputSection = getInputSection(data);
  const update = (ev) => {
    onUpdate({type: ev.target.value});
  };
  return (
    <div>
      <label>
        <span>Panel type:</span>
        <select onChange={update} required="true" name="type">
          <option value=""> -</option>
          <option value="list">List</option>
          <option value="chart">Chart</option>
          <option value="aggregation">Aggregation</option>
        </select>
      </label>
      <InputSection data={data} onUpdate={onUpdate}/>
    </div>);
};

export const EditDataPanelForm = (props) => {
  const {data, onUpdate, onSubmit}=props;
  return (
    <div class="modal-content">
      <form onSubmit={onSubmit}>
        <label>
          <span>Panel title:</span>
          <AutofocusInput onChange={ev => onUpdate({title: ev.target.value})} name="title" required="true"/>
        </label>
        <TypeSection data={data} onUpdate={onUpdate}/>
        <button>Create</button>
      </form>
    </div>);
};

export const EditDataPanelModal = (props) => {

  const UpdatableFormSection = withState((props, update) => {
    const {data = {}} = props;
    const onUpdate = (val) => {
      Object.assign(data, val);
      update(Object.assign(props, {data}));
    };
    return <EditDataPanelForm onUpdate={onUpdate} {...props}/>;
  });

  return (<Modal isOpen={props.isOpen} closeModal={props.closeModal} title={props.title}>
    <UpdatableFormSection {...props}/>
  </Modal>);
};

