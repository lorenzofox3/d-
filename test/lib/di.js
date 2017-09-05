import zora from 'zora';
import inject from '../../src/lib/di';

export default zora()
  .test('should inject the services as second argument', function * (t) {
    const Comp = (props, services) => services;
    const withDi = inject(Comp);
    const result = withDi({foo: 'bar'});

    t.ok(result.grid, 'grid service should be defined');
    t.ok(result.actions, 'actions service should be defined');
    t.ok(result.smartLists, 'smart list service should be defined');
    t.ok(result.store, 'store service should be defined');
    t.ok(result.connect, 'connect service should be defined');
  });