import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Facility, UserRole } from '../types';
import api from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  activeFacilityId: number;
  setActiveFacilityId: (id: number) => void;
  facilities: Facility[];
  isLoading: boolean;
  login: (credentials: { username?: string; email?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
  hasRole: (roles: UserRole[]) => boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('ss_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ss_token'));
  const [activeFacilityId, setActiveFacilityIdState] = useState<number>(() => {
    const saved = localStorage.getItem('ss_active_facility');
    if (saved) return parseInt(saved, 10);
    const savedUser = localStorage.getItem('ss_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser).facility_id || 1;
      } catch {
        return 1;
      }
    }
    return 1;
  });
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setActiveFacilityId = (id: number) => {
    setActiveFacilityIdState(id);
    localStorage.setItem('ss_active_facility', id.toString());
  };

  const loadFacilities = async () => {
    try {
      const res = await api.getFacilities();
      if (res.data) {
        setFacilities(res.data);
      }
    } catch {
      // Ignored if unauthenticated
    }
  };

  const refreshUserData = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await api.getMe();
      if (res.data) {
        setUser(res.data);
        localStorage.setItem('ss_user', JSON.stringify(res.data));
        if (res.data.role === 'STAFF') {
          setActiveFacilityId(res.data.facility_id);
        }
      }
    } catch {
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      refreshUserData();
      loadFacilities();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (credentials: { username?: string; email?: string; password: string }) => {
    setIsLoading(true);
    try {
      const data = await api.login(credentials);
      if (data) {
        setToken(data.token);
        setUser(data.user);
        setActiveFacilityId(data.user.facility_id || 1);
        await loadFacilities();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } catch {
      // Ignore network errors during logout
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      localStorage.removeItem('ss_active_facility');
      setIsLoading(false);
    }
  };

  const isAuthenticated = !!token && !!user;
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER';
  const isStaff = user?.role === 'STAFF';

  const hasRole = (roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeFacilityId,
        setActiveFacilityId,
        facilities,
        isLoading,
        login,
        logout,
        isAuthenticated,
        isAdmin,
        isManager,
        isStaff,
        hasRole,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
