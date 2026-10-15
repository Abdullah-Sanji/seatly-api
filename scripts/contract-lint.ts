import SwaggerParser from '@apidevtools/swagger-parser';
import { CONTRACT_PATH, loadContract } from '../src/contract/contract';

/** Fails if contracts/openapi.yaml is not a valid OpenAPI document or any $ref is dangling. */
async function main(): Promise<void> {
  const contract = loadContract();
  await SwaggerParser.validate(contract as never);
  const paths = Object.keys(contract.paths ?? {});
  const operations = paths.flatMap((p) => Object.keys(contract.paths[p]).filter((m) => m !== 'parameters'));
  console.log(`contract ok: ${paths.length} paths, ${operations.length} operations (${CONTRACT_PATH})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
