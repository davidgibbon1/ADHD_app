"use client";

import React, { createContext, useEffect, useState } from "react";
import { getOrCreateUserId } from "../localStorage/storageUtils";
import { addTask } from "../localStorage/storageUtils";
import { Task } from "../types";

// Simple user interface for local authentication
interface LocalUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
});

// Example tasks for demo purposes
const createDemoTasks = (userId: string) => {
  const now = Date.now();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const demoTasks: Omit<Task, 'id'>[] = [
    {
      title: 'Complete project setup',
      completed: false,
      userId,
      createdAt: now,
      updatedAt: now,
      metadata: {
        priority: 'high',
        energy: 'medium',
        tags: ['work', 'setup'],
        dueDate: new Date().toISOString()
      }
    },
    {
      title: 'Review documentation',
      completed: false,
      userId,
      createdAt: now,
      updatedAt: now,
      metadata: {
        priority: 'medium',
        energy: 'low',
        tags: ['study'],
        dueDate: tomorrow.toISOString()
      }
    },
    {
      title: 'Take a walk',
      completed: true,
      userId,
      createdAt: now - 86400000, // yesterday
      updatedAt: now - 43200000, // 12 hours ago
      metadata: {
        priority: 'low',
        energy: 'medium',
        tags: ['health', 'personal']
      }
    }
  ];
  
  // Add demo tasks to local storage
  demoTasks.forEach(task => addTask(task));
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for user on initial load
    const checkLocalUser = () => {
      const isSignedIn = localStorage.getItem('isSignedIn') === 'true';
      
      if (isSignedIn) {
        const userId = getOrCreateUserId();
        setUser({
          uid: userId,
          displayName: localStorage.getItem('user_display_name') || 'Local User',
          email: localStorage.getItem('user_email') || 'local@example.com',
          photoURL: localStorage.getItem('user_photo') || null,
        });
      } else {
        setUser(null);
      }
      
      setLoading(false);
    };

    checkLocalUser();
  }, []);

  const signIn = () => {
    const userId = getOrCreateUserId();
    const firstSignIn = localStorage.getItem('isSignedIn') !== 'true';
    
    // Store user info in local storage
    localStorage.setItem('isSignedIn', 'true');
    localStorage.setItem('user_display_name', 'Local User');
    localStorage.setItem('user_email', 'local@example.com');
    
    // Set user in context
    setUser({
      uid: userId,
      displayName: 'Local User',
      email: 'local@example.com',
      photoURL: null,
    });
    
    // Add demo tasks on first sign in
    if (firstSignIn) {
      createDemoTasks(userId);
    }
  };

  const signOut = () => {
    // Clear auth state from local storage
    localStorage.setItem('isSignedIn', 'false');
    
    // Update context
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
