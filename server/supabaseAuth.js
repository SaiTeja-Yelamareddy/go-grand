import { Mutex } from 'async-mutex';
import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

// Diagnostics state for monitoring
let lastSaveTimestamp = null;
let lastSaveError = null;
let saveOperationsCount = 0;

export const getAuthStateDiagnostics = () => ({
  last_auth_state_save_at: lastSaveTimestamp,
  auth_state_save_error: lastSaveError,
  save_operations_count: saveOperationsCount,
});

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
      console.log(`[SUPABASE AUTH] Table '${targetTable}' not found. Using 'app_settings' table for session storage.`);
      targetTable = 'app_settings';
      useFallbackAppSettings = true;
    } else if (error) {
      throw new Error(`Supabase auth table check failed for '${targetTable}': ${error.message}`);
    } else {
      console.log(`[SUPABASE AUTH] ✅ Using dedicated '${targetTable}' table for WhatsApp session persistence.`);
    }
  } catch (err) {
    console.error('[SUPABASE AUTH] Table detection failed:', err.message);
    throw err;
  }

  const formatKeyId = (keyId) => {
    return useFallbackAppSettings ? `wa_auth:${sessionId}:${keyId}` : keyId;
  };

  const parseStoredValue = (value) => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string'
      ? JSON.parse(value, BufferJSON.reviver)
      : JSON.parse(JSON.stringify(value), BufferJSON.reviver);
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

        if (error) throw new Error(`Supabase read failed for '${dbKey}': ${error.message}`);
        if (!data || data.value === null || data.value === undefined) return null;

        const parsed = parseStoredValue(data.value);

        memoryCache.set(dbKey, parsed);
        return parsed;
      } else {
        const { data, error } = await supabase
          .from(targetTable)
          .select('value')
          .eq('session_id', sessionId)
          .eq('key_id', keyId)
          .maybeSingle();

        if (error) throw new Error(`Supabase read failed for '${dbKey}': ${error.message}`);
        if (!data || data.value === null || data.value === undefined) return null;

        const parsed = parseStoredValue(data.value);

        memoryCache.set(dbKey, parsed);
        return parsed;
      }
    } catch (err) {
      console.error(`[SUPABASE AUTH] Error reading key '${keyId}':`, err.message);
      throw err;
    }
  };

  /**
   * Writes data for a single keyId to Supabase
   */
  const writeData = async (data, keyId) => {
    const dbKey = formatKeyId(keyId);
    const release = await mutex.acquire();
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
          lastSaveError = error.message;
          console.error(`[SUPABASE AUTH ERROR] Upsert failed for key '${dbKey}':`, error.message);
          throw error;
        } else {
          memoryCache.set(dbKey, data);
          lastSaveTimestamp = new Date().toISOString();
          lastSaveError = null;
          saveOperationsCount++;
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
          lastSaveError = error.message;
          console.error(`[SUPABASE AUTH ERROR] Upsert failed for key '${keyId}':`, error.message);
          throw error;
        } else {
          memoryCache.set(dbKey, data);
          lastSaveTimestamp = new Date().toISOString();
          lastSaveError = null;
          saveOperationsCount++;
        }
      }
      memoryCache.set(dbKey, data);
    } catch (err) {
      lastSaveError = err.message;
      console.error(`[SUPABASE AUTH EXCEPTION] Failed writing key '${keyId}':`, err.message);
      throw err;
    } finally {
      release();
    }
  };

  /**
   * Clears the entire session (used on explicit user logout only)
   */
  const clearAuthState = async () => {
    memoryCache.clear();
    const release = await mutex.acquire();
    try {
      if (useFallbackAppSettings) {
        const prefix = `wa_auth:${sessionId}:`;
        const { error } = await supabase
          .from(targetTable)
          .delete()
          .gte('key', prefix)
          .lt('key', `${prefix}\uffff`);
        if (error) {
          throw new Error(`Supabase auth clear failed: ${error.message}`);
        } else {
          console.log(`[SUPABASE AUTH] 🧹 Successfully cleared all auth keys for session '${sessionId}'`);
        }
      } else {
        const { error } = await supabase
          .from(targetTable)
          .delete()
          .eq('session_id', sessionId);
        if (error) {
          throw new Error(`Supabase auth clear failed: ${error.message}`);
        } else {
          console.log(`[SUPABASE AUTH] 🧹 Successfully cleared all auth keys for session '${sessionId}'`);
        }
      }
    } catch (err) {
      console.error('[SUPABASE AUTH] Exception clearing session:', err.message);
      throw err;
    } finally {
      release();
    }
  };

  // 1. Initialize or load stored credentials
  console.log(`[SUPABASE AUTH] 🔍 Fetching WhatsApp credentials for session '${sessionId}'...`);
  const existingCreds = await readData('creds');
  const creds = existingCreds || initAuthCreds();
  const hasValidCreds = !!(existingCreds && existingCreds.me && existingCreds.me.id);

  if (hasValidCreds) {
    console.log('[SUPABASE AUTH] ✅ Existing authenticated credentials loaded.');
  } else if (existingCreds) {
    console.log('[SUPABASE AUTH] ℹ️ Found uncompleted pairing credentials. Ready to connect.');
  } else {
    console.log('[SUPABASE AUTH] ℹ️ No existing credentials found in Supabase. Fresh credentials initialized.');
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
                    value = parseStoredValue(rawVal);
                    memoryCache.set(dbKey, value);
                  }
                  if (type === 'app-state-sync-key' && value) {
                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                  }
                  data[id] = value;
                }
              } else if (error) {
                throw new Error(`Supabase key read failed for '${type}': ${error.message}`);
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
                    value = parseStoredValue(rawVal);
                    memoryCache.set(formatKeyId(keyId), value);
                  }
                  if (type === 'app-state-sync-key' && value) {
                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                  }
                  data[id] = value;
                }
              } else if (error) {
                throw new Error(`Supabase key read failed for '${type}': ${error.message}`);
              } else {
                for (const id of missingIds) {
                  data[id] = null;
                }
              }
            }
          } catch (err) {
            console.error(`[SUPABASE AUTH] Batch fetch error for keys of type '${type}':`, err.message);
            throw err;
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
                // Cache only after the complete batch has been accepted below.
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
                deletes.push(useFallbackAppSettings ? dbKey : keyId);
              }
            }
          }

          const release = await mutex.acquire();
          try {
            if (upserts.length > 0) {
              const onConflict = useFallbackAppSettings ? 'key' : 'session_id,key_id';
              
              // Chunk upserts in batches of 50 to prevent large payload network drops
              const chunkSize = 50;
              for (let i = 0; i < upserts.length; i += chunkSize) {
                const chunk = upserts.slice(i, i + chunkSize);
                const { error } = await supabase
                  .from(targetTable)
                  .upsert(chunk, { onConflict });

                if (error) {
                  lastSaveError = error.message;
                  console.error('[SUPABASE AUTH ERROR] Batch upsert error:', error.message);
                  throw error;
                } else {
                  lastSaveTimestamp = new Date().toISOString();
                  lastSaveError = null;
                  saveOperationsCount += chunk.length;
                }
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
                  throw error;
                }
              } else {
                const { error } = await supabase
                  .from(targetTable)
                  .delete()
                  .eq('session_id', sessionId)
                  .in('key_id', deletes);
                if (error) {
                  console.warn('[SUPABASE AUTH] Batch delete error (whatsapp_auth_state):', error.message);
                  throw error;
                }
              }
            }
            for (const category in data) {
              for (const id in data[category]) {
                const dbKey = formatKeyId(`${category}-${id}`);
                if (data[category][id]) memoryCache.set(dbKey, data[category][id]);
                else memoryCache.delete(dbKey);
              }
            }
          } catch (err) {
            lastSaveError = err.message;
            console.error('[SUPABASE AUTH EXCEPTION] Batch keys update failed:', err.message);
            throw err;
          } finally {
            release();
          }
        },
      },
    },
    saveCreds: async () => {
      return writeData(creds, 'creds');
    },
    hasValidCreds,
    clearAuthState,
    getDiagnostics: async () => {
      const credsValue = await readData('creds');
      const requiredCredentialsExist = Boolean(
        credsValue && credsValue.noiseKey && credsValue.signedIdentityKey &&
        credsValue.signedPreKey && credsValue.registrationId && credsValue.advSecretKey
      );
      let keyStoreReadable = false;
      let keyCount = 0;
      const keyQuery = useFallbackAppSettings
        ? supabase.from(targetTable).select('key,value', { count: 'exact', head: false }).like('key', `wa_auth:${sessionId}:%`).limit(1)
        : supabase.from(targetTable).select('key_id,value', { count: 'exact', head: false }).eq('session_id', sessionId).limit(1);
      const { data: keyRows, error: keyError, count } = await keyQuery;
      if (keyError) throw new Error(`Supabase auth key diagnostic failed: ${keyError.message}`);
      if (Array.isArray(keyRows)) {
        keyStoreReadable = keyRows.length === 0 || keyRows.every((row) => parseStoredValue(row.value) !== null);
      }
      keyCount = count || 0;
      return {
        session_exists: Boolean(credsValue),
        required_credentials_exist: requiredCredentialsExist,
        credentials_deserialized: Boolean(credsValue),
        signal_key_store_readable: keyStoreReadable,
        stored_key_count: keyCount,
        storage_table: targetTable,
        uses_local_auth_files: false,
        last_save_at: lastSaveTimestamp,
        last_save_error: lastSaveError,
        save_operations_count: saveOperationsCount,
      };
    },
  };
};
