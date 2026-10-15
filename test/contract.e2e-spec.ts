import { listHttpRoutes, loadContract, toExpressPath } from '../src/contract/contract';
import { startTestApp, TestContext } from './setup/test-app';

/**
 * The contract is the source of truth for the frontend, so every route the API serves must be
 * in it and every operation in it must be served. Response shapes are validated on every e2e
 * request by enableContractValidation(); this file only pins the route inventory.
 */
describe('contracts/openapi.yaml', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  function contractRoutes(): string[] {
    const contract = loadContract();
    return Object.entries(contract.paths).flatMap(([path, item]) =>
      Object.keys(item as Record<string, unknown>)
        .filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
        .map((method) => `${method.toUpperCase()} ${toExpressPath(path)}`),
    );
  }

  it('documents every route the API serves, and serves every documented operation', () => {
    const served = listHttpRoutes(ctx.app).map((r) => `${r.method} ${r.path}`);
    const documented = contractRoutes();
    expect(served.sort()).toEqual(documented.sort());
  });
});
