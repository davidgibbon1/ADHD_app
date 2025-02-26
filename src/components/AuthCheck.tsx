'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import SignInWithGoogle from './SignInWithGoogle';

export default function AuthCheck({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold text-white">Welcome to Task Manager</h1>
        <p className="text-white/70 mb-4">Please sign in to manage your tasks</p>
        <SignInWithGoogle />
      </div>
    );
  }

  return <>{children}</>;
} 