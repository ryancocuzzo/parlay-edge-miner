import { parseEnv } from './env';
import { run } from './run';

const main = async (): Promise<void> => {
  console.log(await run(parseEnv(process.env)));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
