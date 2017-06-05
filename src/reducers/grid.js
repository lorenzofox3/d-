import {Grid} from '../lib/grid';

// const state = {
//  panels:[ ... {
//     x, y, dx, dy, adornerStatus:0
//  }],
//  active:{x,y}
// }


export default (grid = Grid()) => (state = {active: null, panels: [...grid]}, action) => {
  switch (action.type) {
    case 'START_RESIZE': {
      const {x, y}=action;
      return Object.assign({}, state, {active: {x, y}});
    }
    case 'RESIZE_OVER': {
      const {x, y} =action;
      const {active} = state;
      const {x:startX, y:startY} = active;
      if (x >= startX && y >= startY) {
        const dx = x - startX + 1;
        const dy = y - startY + 1;
        const activeArea = grid.area(startX, startY, dx, dy);
        const inactiveArea = activeArea.complement();
        const allButStart = grid.area(startX, startY).complement();
        const invalidCellsArea = [...allButStart]
          .map(p => grid.panel(p.x, p.y))
          .filter(p => {
            const intersection = p.intersection(activeArea);
            return intersection.length > 0 && activeArea.includes(p) === false;
          })
          .reduce((acc, current) => acc.union(current), grid.area(1, 1, 0, 0));

        for (let {x, y} of inactiveArea) {
          grid.updateAt(x, y, {adornerStatus: 0});
        }

        for (let {x, y} of activeArea) {
          grid.updateAt(x, y, {adornerStatus: 1});
        }

        for (let {x, y} of invalidCellsArea) {
          grid.updateAt(x, y, {adornerStatus: -1});
        }

        return Object.assign({}, state, {panels: [...grid]});
      } else {
        return state;
      }
    }
    case 'END_RESIZE': {
      const {x, y, startX, startY} =action;
      const dx = x - startX + 1;
      const dy = y - startY + 1;
      if (x >= startX && y >= startY) {
        const activeArea = grid.area(startX, startY, dx, dy);
        const allButStart = grid.area(startX, startY).complement();
        const invalidCellsArea = [...allButStart]
          .map(p => grid.panel(p.x, p.y))
          .filter(p => {
            const intersection = p.intersection(activeArea);
            return intersection.length > 0 && activeArea.includes(p) === false;
          })
          .reduce((acc, current) => acc.union(current), grid.area(1, 1, 0, 0));

        const [baseCell, ...otherCells] = activeArea;

        if (invalidCellsArea.length === 0) {
          grid.updateAt(startX, startY, {dx, dy});
          for (const {x, y} of otherCells) {
            grid.updateAt(x, y, {dx: 1, dy: 1});
          }
        }
      }

      for (let {x, y} of [...grid]) {
        grid.updateAt(x, y, {adornerStatus: 0});
      }

      return Object.assign({}, state, {
        panels: [...grid],
        active: null
      });
    }
    case 'UPDATE_PANEL_DATA': {
      const {x, y, data} = action;
      grid.updateAt(x, y, {data});
      return Object.assign({}, state, {panels: [...grid]});
    }
    default:
      return state;
  }
};

