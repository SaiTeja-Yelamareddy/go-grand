import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';
import { logoutOwner as clearLegacyOwnerSession } from '../config/authConfig';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isOwner: boolean;
  loadingAuth: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isOwner: false,
  loadingAuth: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function checkOwnerProfile(userId: string) {
      try {
        const { data, error } = await supabase
          .from('owner_profiles')
          .select('*')
          .eq('user_id', userId)
          .eq('role', 'owner')
          .eq('active', true)
          .maybeSingle();
        
        if (mounted) {
          if (data && !error) {
            setIsOwner(true);
          } else {
            setIsOwner(false);
            if (error) console.error('Error fetching owner profile:', error);
          }
          setLoadingAuth(false);
        }
      } catch (err) {
        if (mounted) {
          setIsOwner(false);
          setLoadingAuth(false);
        }
      }
    }

    const initAuth = async () => {
      // Clear legacy
      clearLegacyOwnerSession();

      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await checkOwnerProfile(session.user.id);
        } else {
          setIsOwner(false);
          setLoadingAuth(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // We only re-check if it's SIGNED_IN or INITIAL_SESSION to avoid redundant calls on TOKEN_REFRESHED
        // But for safety, if user ID changed, we must re-check.
        setLoadingAuth(true);
        await checkOwnerProfile(session.user.id);
      } else {
        setIsOwner(false);
        setLoadingAuth(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, isOwner, loadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
