import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in (you can expand this with actual authentication)
  useEffect(() => {
    const checkUser = async () => {
      try {
        // For now, we'll use a simple approach - you can implement proper auth later
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
          setCurrentUser(JSON.parse(storedUser));
        }
      } catch (error) {
        throw error;
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  const login = async (username, password) => {
    try {
      // Query system-users collection
      const usersRef = collection(db, 'system-users');
      const q = query(usersRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        // Simple password check (in production, use proper hashing)
        if (userData.password === password) {
          const user = {
            id: userDoc.id,
            username: userData.username,
            role: userData.role
          };
          setCurrentUser(user);
          localStorage.setItem('currentUser', JSON.stringify(user));
          return { success: true, user };
        }
      }
      return { success: false, error: 'Invalid credentials' };
    } catch (error) {
      return { success: false, error: 'Login failed' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
  };

  const value = {
    currentUser,
    login,
    logout,
    isAdmin: currentUser?.role === 'admin',
    isAssistant: currentUser?.role === 'assistant'
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};