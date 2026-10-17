import {
  addAllowlist,
  listAllowlist,
  removeAllowlist,
  createSlateStore,
} from '@/lib/store';
import { parseEnv } from '@/env';
import { refreshSlate, settleOpenSnapshots, rollupStrategyBenchmarks, seedFixtureBenchmarks } from '@/run';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BacktestFixture } from '@/backtest';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const users = await listAllowlist();

  return (
    <div>
      <h1>Admin</h1>
      <p className="lede">Public for now. Allowlist, slate refresh, settle, and weekly benchmark rollup.</p>

      <section className="panel">
        <h2>Allowlist</h2>
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="mono">{user.email}</td>
                  <td>
                    <span className="tag">{user.isAdmin ? 'admin' : 'user'}</span>
                  </td>
                  <td>
                    {!user.isAdmin && (
                      <form
                        action={async () => {
                          'use server';
                          await removeAllowlist(user.email);
                          revalidatePath('/admin');
                        }}
                      >
                        <button type="submit" className="secondary">
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="stack"
          style={{ marginTop: '1rem' }}
          action={async (formData) => {
            'use server';
            const nextEmail = String(formData.get('email') ?? '').toLowerCase();
            const isAdmin = formData.get('isAdmin') === 'on';
            if (nextEmail) await addAllowlist(nextEmail, isAdmin);
            revalidatePath('/admin');
          }}
        >
          <label>
            Add email
            <input type="email" name="email" required />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" name="isAdmin" style={{ width: 'auto' }} /> Admin
          </label>
          <button type="submit">Add</button>
        </form>
      </section>

      <section className="panel">
        <h2>Operations</h2>
        <div className="ops">
          <form
            action={async () => {
              'use server';
              const env = parseEnv(process.env);
              await refreshSlate({
                oddsApiKey: env.oddsApiKey,
                store: createSlateStore(),
                twilio: env.twilio,
              });
              revalidatePath('/');
              revalidatePath('/results');
            }}
          >
            <button type="submit">Refresh slate</button>
          </form>
          <form
            action={async () => {
              'use server';
              const env = parseEnv(process.env);
              await settleOpenSnapshots({
                oddsApiKey: env.oddsApiKey,
                store: createSlateStore(),
              });
              revalidatePath('/results');
            }}
          >
            <button type="submit" className="secondary">
              Settle open snapshots
            </button>
          </form>
          <form
            action={async () => {
              'use server';
              await rollupStrategyBenchmarks({ store: createSlateStore() });
              revalidatePath('/results');
            }}
          >
            <button type="submit" className="secondary">
              Roll up this week
            </button>
          </form>
          <form
            action={async () => {
              'use server';
              const fixtures = JSON.parse(
                readFileSync(join(process.cwd(), 'fixtures/ncaaf/week-1.json'), 'utf8'),
              ) as BacktestFixture[];
              await seedFixtureBenchmarks({ store: createSlateStore(), fixtures });
              revalidatePath('/results');
            }}
          >
            <button type="submit" className="secondary">
              Reseed fixture benchmarks
            </button>
          </form>
        </div>
      </section>

    </div>
  );
}
