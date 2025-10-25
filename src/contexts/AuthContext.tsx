
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import { useToast } from '@/components/ui/use-toast';

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  coins: number;
}

interface AuthContextProps {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    async function getInitialSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          
          if (session?.user) {
            await fetchProfile(session.user.id);
          } else {
            setProfile(null);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
        toast({
          title: "Auth Error",
          description: "Failed to restore your session. Please log in again.",
          variant: "destructive",
        });
        if (mounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        }
      }
    }

    getInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted) {
        console.log('Auth state change:', event, session); // Debug log
        
        if (event === 'SIGNED_OUT') {
          // Clear all auth state immediately on sign out
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id);
          
          // Show verification notification if user just verified email
          if (event === 'SIGNED_IN' && session.user.email_confirmed_at) {
            toast({
              title: "Account Verified! 🎉",
              description: "Your email has been successfully verified. Welcome to SAKURAZE!",
              duration: 5000,
            });
          }
        } else {
          setProfile(null);
          setIsLoading(false);
        }

        switch (event) {
          case 'TOKEN_REFRESHED':
            console.log('Auth token refreshed');
            break;
          case 'USER_UPDATED':
            if (session?.user) {
              await fetchProfile(session.user.id);
            }
            break;
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [toast]);

  const fetchProfile = async (userId: string) => {
    try {
      setIsLoading(true);
      
      // First try to fetch the existing profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create one
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) throw new Error('User data not available');
          
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([
              {
                id: userId,
                username: userData.user.email?.split('@')[0] || `user_${Date.now()}`,
                display_name: userData.user.user_metadata?.display_name || null,
                avatar_url: null,
                bio: null,
                coins: 0
              }
            ])
            .select()
            .single();

          if (createError) {
            throw createError;
          }
          
          setProfile(newProfile);
          toast({
            title: "Profile Created",
            description: "Your profile has been created successfully.",
          });
          return;
        }
        throw error;
      }
      
      setProfile(data);
    } catch (error: any) {
      console.error('Error in profile operation:', error);
      toast({
        title: "Error",
        description: error.message || "There was an error loading your profile. Please try again.",
        variant: "destructive",
      });
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password
      });

      if (error) {
        console.error('Sign in error:', error);
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      if (!data.user) {
        throw new Error('No user data received');
      }
      
      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
      navigate('/');
      return { error: null };
    } catch (error: any) {
      console.error('Unexpected sign in error:', error);
      toast({
        title: "Login Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return { error };
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    try {
      // First check if username is already taken
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single();

      if (existingUser) {
        toast({
          title: "Signup Failed",
          description: "Username is already taken",
          variant: "destructive",
        });
        return { error: new Error('Username is already taken') };
      }

      // Proceed with signup
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username,
          },
          emailRedirectTo: window.location.origin + '/auth/callback'
        },
      });

      if (error) {
        console.error('Sign up error:', error);
        toast({
          title: "Signup Failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      if (data.user?.identities?.length === 0) {
        toast({
          title: "Account Exists",
          description: "An account with this email already exists. Please log in instead.",
          variant: "destructive",
        });
        return { error: new Error('Account exists') };
      }

      toast({
        title: "Signup Successful",
        description: "Please check your email for confirmation.",
      });
      return { error: null };
    } catch (error: any) {
      console.error('Unexpected sign up error:', error);
      toast({
        title: "Signup Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Clear all auth-related state immediately
      setProfile(null);
      setUser(null);
      setSession(null);
      setIsLoading(false);
      
      // Show success message
      toast({
        title: "Logged Out",
        description: "You have been logged out successfully.",
      });

      // Navigate after state is cleared
      navigate('/auth/login');
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    try {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (!error) {
        setProfile(prev => prev ? { ...prev, ...updates } : null);
        toast({
          title: "Profile Updated",
          description: "Your profile has been updated successfully.",
        });
      } else {
        toast({
          title: "Update Failed",
          description: error.message,
          variant: "destructive",
        });
      }

      return { error };
    } catch (error: any) {
      return { error };
    }
  };

  const value = {
    session,
    user,
    profile,
    isLoading,
    signIn,
    signUp,
    signOut,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
