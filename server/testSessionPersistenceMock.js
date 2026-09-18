import assert from 'assert';
import { useSupabaseAuthState } from './supabaseAuth.js';

function createMockSupabase() {
  const rows = [];

  function query(table, operation = 'select') {
    const filters = [];
    let payload = null;
    const builder = {
      select() {
        operation = 'select';
        return builder;
      },
      limit() {
        return builder;
      },
      eq(column, value) {
        filters.push([column, value]);
        return builder;
      },
      in(column, values) {
        filters.push([column, values]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(execute(true));
      },
      order() {
        return builder;
      },
      upsert(nextPayload) {
        payload = Array.isArray(nextPayload) ? nextPayload : [nextPayload];
        for (const nextRow of payload) {
          const index = rows.findIndex((row) =>
            row.session_id === nextRow.session_id && row.key_id === nextRow.key_id
          );
          if (index >= 0) rows[index] = nextRow;
          else rows.push(nextRow);
        }
        return Promise.resolve({ data: payload, error: null });
      },
      delete() {
        operation = 'delete';
        return builder;
      },
      then(resolve, reject) {
        return Promise.resolve(execute(false)).then(resolve, reject);
      },
    };

    function execute(single) {
      if (operation === 'delete') {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (filters.every(([column, value]) => Array.isArray(value) ? value.includes(rows[i][column]) : rows[i][column] === value)) {
            rows.splice(i, 1);
          }
        }
        return { data: null, error: null };
      }

      const matched = rows.filter((row) =>
        filters.every(([column, value]) => Array.isArray(value) ? value.includes(row[column]) : row[column] === value)
      );
      return {
        data: single ? (matched[0] || null) : matched,
        error: null,
      };
    }

    return builder;
  }

  return {
    from(table) {
      return {
        select() {
          return query(table);
        },
        upsert(payload) {
          return query(table).upsert(payload);
        },
        delete() {
          return query(table, 'delete');
        },
      };
    },
    rows,
  };
}

const supabase = createMockSupabase();
const sessionId = 'mock-session';

const first = await useSupabaseAuthState(supabase, sessionId);
first.state.creds.me = { id: 'mock-user', name: 'Go Grand' };
first.state.creds.registered = true;
await first.saveCreds();

await first.state.keys.set({
  'pre-key': {
    '1': {
      keyPair: {
        public: Buffer.from('public-key'),
        private: Buffer.from('private-key'),
      },
    },
  },
});

const restarted = await useSupabaseAuthState(supabase, sessionId);
assert.equal(restarted.hasValidCreds, true, 'valid credentials should survive restart');
assert.equal(restarted.state.creds.me.id, 'mock-user', 'credentials should reload after restart');
const restoredKeys = await restarted.state.keys.get('pre-key', ['1']);
assert.equal(Buffer.isBuffer(restoredKeys['1'].keyPair.public), true, 'BufferJSON should restore Buffers');
assert.equal(restoredKeys['1'].keyPair.public.toString(), 'public-key');

restarted.state.creds.accountSyncCounter = 2;
await restarted.saveCreds();
const updated = await useSupabaseAuthState(supabase, sessionId);
assert.equal(updated.state.creds.accountSyncCounter, 2, 'credential updates should persist');

// A simulated temporary disconnect/reconnect does not clear persisted state.
const afterReconnect = await useSupabaseAuthState(supabase, sessionId);
assert.equal(afterReconnect.hasValidCreds, true, 'temporary reconnect should not require QR');
assert.equal(supabase.rows.length > 0, true, 'session records remain available until explicit logout');

await afterReconnect.clearAuthState();
const afterLogout = await useSupabaseAuthState(supabase, sessionId);
assert.equal(afterLogout.hasValidCreds, false, 'explicit logout should clear the session');

console.log('MOCK SESSION PERSISTENCE TEST PASSED');
