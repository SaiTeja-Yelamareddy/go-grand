import { Mutex } from 'async-mutex';
import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

/**
 * Custom Supabase-backed authentication state adapter for Baileys WhatsApp Web API.
 * Stores credentials (`creds`) and Signal cryptographic keys (`pre-key`, `session`, `sender-key`, etc.)
 * in Supabase to survive cloud container restarts, redeployments, and dyno recycling.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Configured Supabase client
 * @param {string} [sessionId='default'] - Unique session identifier
 * @param {object} [options={}] - Additional options (tableName, localCache)
 */
export const useSupabaseAuthState = async (supabase, sessionId = 'default', options = {}) => {
  if (!supabase) {
    throw new Error('[SUPABASE AUTH] A valid Supabase client instance is required.');
  }

  const mutex = new Mutex();
  const memoryCache = new Map();

  // Detect which table is available: primary 'whatsapp_auth_state' or fallback 'app_settings'
  let targetTable = options.tableName || 'whatsapp_auth_state';
  let useFallbackAppSettings = false;

  try {
    const { error } = await supabase.from(targetTable).select('key_id').limit(1);
    if (error && (error.code === 'PGRST205' || error.message?.includes('not find the table') || error.message?.includes('does not exist'))) {
      console.log(`[SUPABASE AUTH] Notice: Table '${targetTable}' not found. Falling back to 'app_settings' table for session storage.`);
      targetTable = 'app_settings';
      useFallbackAppSettings = true;
    } else if (error) {
      console.warn(`[SUPABASE AUTH] Table check warning for '${targetTable}':`, error.message);
    } else {
      console.log(`[SUPABASE AUTH] ✅ Using dedicated '${targetTable}' table for WhatsApp session persistence.`);
    }
  } catch (err) {
    console.warn('[SUPABASE AUTH] Table detection error, falling back to app_settings:', err.message);
    targetTable = 'app_settings';
    useFallbackAppSettings = true;
  }

  const formatKeyId = (keyId) => {
    return useFallbackAppSettings ? `wa_auth:${sessionId}:${keyId}` : keyId;
  };

  /**
   * Reads raw data from Supabase for a single keyId
   */
  const readData = async (keyId) => {
    const dbKey = formatKeyId(keyId);
    if (memoryCache.has(dbKey)) {
      return memoryCache.get(dbKey);
    }

    try {
      if (useFallbackAppSettings) {
        const { data, error } = await supabase
          .from(targetTable)
          .select('value')
          .eq('key', dbKey)
          .maybeSingle();

        if (error || !data || !data.value) return null;

        const parsed = typeof data.value === 'string'
          ? JSON.parse(data.value, BufferJSON.reviver)
          : JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);

        memoryCache.set(dbKey, parsed);
        return parsed;
      } else {
        const { data, error } = await supabase
          .from(targetTable)
          .select('value')
          .eq('session_id', sessionId)
          .eq('key_id', keyId)
          .maybeSingle();

        if (error || !data || !data.value) return null;

        const parsed = typeof data.value === 'string'
          ? JSON.parse(data.value, BufferJSON.reviver)
          : JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);

        memoryCache.set(dbKey, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn(`[SUPABASE AUTH] Error reading key '${keyId}':`, err.message);
      return null;
    }
  };

  /**
   * Writes data for a single keyId to Supabase
   */
  const writeData = async (data, keyId) => {
    const dbKey = formatKeyId(keyId);
    memoryCache.set(dbKey, data);

    return mutex.acquire().then(async (release) => {
      try {
        const serialized = JSON.stringify(data, BufferJSON.replacer);

        if (useFallbackAppSettings) {
          const { error } = await supabase.from(targetTable).upsert(
            {
              key: dbKey,
              value: JSON.parse(serialized),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'key' }
          );
          if (error) {
            console.error(`[SUPABASE AUTH] Upsert error for key '${dbKey}':`, error.message);
          }
        } else {
          const { error } = await supabase.from(targetTable).upsert(
            {
              session_id: sessionId,
              key_id: keyId,
              value: JSON.parse(serialized),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'session_id,key_id' }
          );
          if (error) {
            console.error(`[SUPABASE AUTH] Upsert error for key '${keyId}':`, error.message);
          }
        }
      } catch (err) {
        console.error(`[SUPABASE AUTH] Exception writing key '${keyId}':`, err.message);
      } finally {
        release();
      }
    });
  };

  /**
   * Clears the entire session (used on logout or session reset)
   */
  const clearAuthState = async () => {
    memoryCache.clear();
    return mutex.acquire().then(async (release) => {
      try {
        if (useFallbackAppSettings) {
          const prefix = `wa_auth:${sessionId}:`;
          const { error } = await supabase
            .from(targetTable)
            .delete()
            .gte('key', prefix)
            .lt('key', `${prefix}\uffff`);
          if (error) {
            console.warn('[SUPABASE AUTH] Error clearing session from app_settings:', error.message);
          } else {
            console.log(`[SUPABASE AUTH] 🧹 Successfully cleared all auth keys for session '${sessionId}'`);
          }
        } else {
          const { error } = await supabase
            .from(targetTable)
            .delete()
            .eq('session_id', sessionId);
          if (error) {
            console.warn('[SUPABASE AUTH] Error clearing session from whatsapp_auth_state:', error.message);
          } else {
            console.log(`[SUPABASE AUTH] 🧹 Successfully cleared all auth keys for session '${sessionId}'`);
          }
        }
      } catch (err) {
        console.warn('[SUPABASE AUTH] Exception clearing session:', err.message);
      } finally {
        release();
      }
    });
  };

  // 1. Initialize or load stored credentials
  console.log(`[SUPABASE AUTH] 🔍 Fetching WhatsApp credentials for session '${sessionId}'...`);
  const existingCreds = await readData('creds');
  const creds = existingCreds || initAuthCreds();

  if (existingCreds) {
    console.log(`[SUPABASE AUTH] ✅ Existing session credentials loaded successfully (Me ID: ${creds.me?.id || 'pairing initiated'}).`);
  } else {
    console.log('[SUPABASE AUTH] ℹ️ No existing credentials found. Initialized fresh authentication credentials.');
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          const missingIds = [];

          // Check memory cache first
          for (const id of ids) {
            const keyId = `${type}-${id}`;
            const dbKey = formatKeyId(keyId);
            if (memoryCache.has(dbKey)) {
              let val = memoryCache.get(dbKey);
              if (type === 'app-state-sync-key' && val) {
                val = proto.Message.AppStateSyncKeyData.fromObject(val);
              }
              data[id] = val;
            } else {
              missingIds.push(id);
            }
          }

          if (missingIds.length === 0) {
            return data;
          }

          try {
            if (useFallbackAppSettings) {
              const dbKeys = missingIds.map((id) => formatKeyId(`${type}-${id}`));
              const { data: rows, error } = await supabase
                .from(targetTable)
                .select('key, value')
                .in('key', dbKeys);

              if (!error && rows) {
                const rowMap = new Map();
                for (const row of rows) {
                  rowMap.set(row.key, row.value);
                }

                for (const id of missingIds) {
                  const dbKey = formatKeyId(`${type}-${id}`);
                  const rawVal = rowMap.get(dbKey);
                  let value = null;
                  if (rawVal) {
                    value = typeof rawVal === 'string'
                      ? JSON.parse(rawVal, BufferJSON.reviver)
                      : JSON.parse(JSON.stringify(rawVal), BufferJSON.reviver);
                    memoryCache.set(dbKey, value);
                  }
                  if (type === 'app-state-sync-key' && value) {
                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                  }
                  data[id] = value;
                }
              } else {
                for (const id of missingIds) {
                  data[id] = null;
                }
              }
            } else {
              const keyIds = missingIds.map((id) => `${type}-${id}`);
              const { data: rows, error } = await supabase
                .from(targetTable)
                .select('key_id, value')
                .eq('session_id', sessionId)
                .in('key_id', keyIds);

              if (!error && rows) {
                const rowMap = new Map();
                for (const row of rows) {
                  rowMap.set(row.key_id, row.value);
                }

                for (const id of missingIds) {
                  const keyId = `${type}-${id}`;
                  const rawVal = rowMap.get(keyId);
                  let value = null;
                  if (rawVal) {
                    value = typeof rawVal === 'string'
                      ? JSON.parse(rawVal, BufferJSON.reviver)
                      : JSON.parse(JSON.stringify(rawVal), BufferJSON.reviver);
                    memoryCache.set(formatKeyId(keyId), value);
                  }
                  if (type === 'app-state-sync-key' && value) {
                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                  }
                  data[id] = value;
                }
              } else {
                for (const id of missingIds) {
                  data[id] = null;
                }
              }
            }
          } catch (err) {
            console.warn(`[SUPABASE AUTH] Batch fetch error for keys of type '${type}':`, err.message);
            for (const id of missingIds) {
              data[id] = null;
            }
          }

          return data;
        },

        set: async (data) => {
          const upserts = [];
          const deletes = [];

          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const keyId = `${category}-${id}`;
              const dbKey = formatKeyId(keyId);

              if (value) {
                memoryCache.set(dbKey, value);
                const serialized = JSON.stringify(value, BufferJSON.replacer);

                if (useFallbackAppSettings) {
                  upserts.push({
                    key: dbKey,
                    value: JSON.parse(serialized),
                    updated_at: new Date().toISOString(),
                  });
                } else {
                  upserts.push({
                    session_id: sessionId,
                    key_id: keyId,
                    value: JSON.parse(serialized),
                    updated_at: new Date().toISOString(),
                  });
                }
              } else {
                memoryCache.delete(dbKey);
                deletes.push(useFallbackAppSettings ? dbKey : keyId);
              }
            }
          }

          return mutex.acquire().then(async (release) => {
            try {
              if (upserts.length > 0) {
                const onConflict = useFallbackAppSettings ? 'key' : 'session_id,key_id';
                const { error } = await supabase
                  .from(targetTable)
                  .upsert(upserts, { onConflict });

                if (error) {
                  console.error('[SUPABASE AUTH] Batch upsert error:', error.message);
                }
              }

              if (deletes.length > 0) {
                if (useFallbackAppSettings) {
                  const { error } = await supabase
                    .from(targetTable)
                    .delete()
                    .in('key', deletes);
                  if (error) {
                    console.warn('[SUPABASE AUTH] Batch delete error (app_settings):', error.message);
                  }
                } else {
                  const { error } = await supabase
                    .from(targetTable)
                    .delete()
                    .eq('session_id', sessionId)
                    .in('key_id', deletes);
                  if (error) {
                    console.warn('[SUPABASE AUTH] Batch delete error (whatsapp_auth_state):', error.message);
                  }
                }
              }
            } catch (err) {
              console.error('[SUPABASE AUTH] Exception during batch keys update:', err.message);
            } finally {
              release();
            }
          });
        },
      },
    },
    saveCreds: async () => {
      return writeData(creds, 'creds');
    },
    clearAuthState,
  };
};
