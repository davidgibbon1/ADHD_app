"use client";

import { useAuth } from '../lib/hooks/useAuth';

export default function SignInWithGoogle() {
  const { signIn } = useAuth();

  return (
    <button
      onClick={signIn}
      className="flex items-center justify-center bg-white text-gray-700 font-semibold py-2 px-4 rounded-full border border-gray-300 hover:bg-gray-100 transition duration-300 ease-in-out"
    >
      <img src="/google-icon.svg" alt="Google logo" className="w-6 h-6 mr-2" />
      Sign in with Local Account
    </button>
  );
}
