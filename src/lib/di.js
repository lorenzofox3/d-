import services from '../services/index'

export default Comp => props => Comp(props, services);