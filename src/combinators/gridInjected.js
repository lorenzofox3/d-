/**
 * inject the grid instance and actions into a component as second and third arguments
 */
export default (grid, actions) => Comp => (props, ...args) => Comp(props, grid, actions, ...args);