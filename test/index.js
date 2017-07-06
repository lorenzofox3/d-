import zora from 'zora';
import libs from './lib/index';
import actions from './actions/index';
import reducers from './reducers/index';
import views from './views/index';

zora()
  .test(libs)
  .test(actions)
  .test(reducers)
  .test(views)
  .run();