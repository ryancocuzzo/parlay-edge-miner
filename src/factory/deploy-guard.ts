import { execFileSync } from 'node:child_process';

export const PROTECTED_PATHS = [
  'src/auth.ts',
  'src/auth.config.ts',
  'src/middleware.ts',
  'src/allowlist.ts',
  'src/jobs.ts',
  'src/data/usage.ts',
  'src/app/admin/',
  'src/app/api/',
  'src/app/login/',
  'src/app/privacy/',
  'src/app/requests/',
  'src/factory/',
  'prisma/seed.ts',
  '.github/',
  'AGENTS.md',
  'vercel.json',
  'next.config.js',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.env',
];

export const PROTECTED_TABLES = ['AllowlistUser', 'FeatureRequest', 'FactorySettings', '_prisma_migrations'];

const DESTRUCTIVE_SQL = /\b(DROP|TRUNCATE|RENAME|GRANT|REVOKE)\b|(?<!\bON\s+)\b(DELETE|UPDATE)\b|ALTER\s+COLUMN|SET\s+NOT\s+NULL/i;

export type FileChange = { status: string; path: string };

export const reviewChanges = (changes: FileChange[], migrationSql: Record<string, string>): string[] => [
  ...changes
    .filter(({ path }) => PROTECTED_PATHS.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}.`))))
    .map(({ path }) => `protected file changed: ${path}`),
  ...changes
    .filter(({ status, path }) => path.startsWith('prisma/migrations/') && status !== 'A')
    .map(({ path }) => `existing migration modified: ${path}`),
  ...Object.entries(migrationSql).flatMap(([path, sql]) => [
    ...(DESTRUCTIVE_SQL.test(sql) ? [`destructive SQL in ${path}`] : []),
    ...PROTECTED_TABLES.filter((table) => sql.includes(`"${table}"`)).map((table) => `migration touches ${table} in ${path}`),
  ]),
];

const SKIP_DEPLOY = 0;
const DEPLOY = 1;

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const main = (): number => {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('deploy-guard: only production builds deploy');
    return SKIP_DEPLOY;
  }
  git('fetch', '--depth=200', 'origin', 'main');
  const isAncestor = (commit: string, of: string) => {
    try {
      git('merge-base', '--is-ancestor', commit, of);
      return true;
    } catch {
      return false;
    }
  };
  const [first, second] = [process.env.VERCEL_GIT_PREVIOUS_SHA, process.env.GUARD_APPROVED_SHA].filter(
    (sha): sha is string => !!sha && isAncestor(sha, 'HEAD'),
  );
  const base = first && second && isAncestor(first, second) ? second : first ?? second;
  if (!base) {
    console.error('deploy-guard: no deployed or approved commit in history to diff against, refusing to deploy');
    return SKIP_DEPLOY;
  }
  const changes = git('diff', '--name-status', '--no-renames', base, 'HEAD')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status = '', path = ''] = line.split('\t');
      return { status, path };
    });
  const migrationSql = Object.fromEntries(
    changes
      .filter(({ status, path }) => status === 'A' && path.startsWith('prisma/migrations/') && path.endsWith('.sql'))
      .map(({ path }) => [path, git('show', `HEAD:${path}`)]),
  );
  const violations = reviewChanges(changes, migrationSql);
  if (violations.length) {
    console.error(`deploy-guard: refusing to deploy ${base.slice(0, 7)}..HEAD\n- ${violations.join('\n- ')}`);
    console.error('An admin ships protected changes by setting GUARD_APPROVED_SHA in Vercel to the reviewed commit, then pushing it.');
    return SKIP_DEPLOY;
  }
  console.log(`deploy-guard: ${changes.length} files changed since ${base.slice(0, 7)}, all allowed`);
  return DEPLOY;
};

if (process.argv[1]?.endsWith('deploy-guard.ts')) process.exit(main());
