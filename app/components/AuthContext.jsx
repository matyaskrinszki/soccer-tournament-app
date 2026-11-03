'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// The logged-in user is kept in localStorage (token, email, playerId, role) so it
// survives reloads. This context reads it once after hydration and is the only
// place that writes it, so every page and the Header see the same state.

const STORAGE_KEYS = ['token', 'email', 'playerId', 'role'];

const AuthContext = createContext(null);

function readStoredUser() {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('email');
    if (!token || !email) return null;

    const storedId = localStorage.getItem('playerId');
    return {
        email,
        playerId: storedId ? Number(storedId) : null,
        role: localStorage.getItem('role'),
    };
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    // localStorage doesn't exist during SSR: until the first client render
    // finishes nobody knows yet whether the user is logged in
    const [isHydrated, setIsHydrated] = useState(false);
    // 'login' | 'signup' while the AuthModal is open, null otherwise
    const [authModalMode, setAuthModalMode] = useState(null);

    useEffect(() => {
        setUser(readStoredUser());
        setIsHydrated(true);

        // Keep tabs in sync when the user logs in or out in another one
        const handleStorage = (event) => {
            if (event.key === null || STORAGE_KEYS.includes(event.key)) {
                setUser(readStoredUser());
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    /**
     * Store the response of /api/auth/login or /api/auth/signup
     * @param {{token: string, email: string, playerId?: number, role?: string}} data
     */
    const login = useCallback((data) => {
        localStorage.setItem('token', data.token);
        localStorage.setItem('email', data.email);
        if (data.playerId) {
            localStorage.setItem('playerId', String(data.playerId));
        } else {
            localStorage.removeItem('playerId');
        }
        if (data.role) {
            localStorage.setItem('role', data.role);
        } else {
            localStorage.removeItem('role');
        }
        setUser(readStoredUser());
        setAuthModalMode(null);
    }, []);

    const logout = useCallback(() => {
        STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
        setUser(null);
    }, []);

    // After the profile page changes the email address
    const updateEmail = useCallback((email) => {
        localStorage.setItem('email', email);
        setUser((prev) => (prev ? { ...prev, email } : prev));
    }, []);

    const openAuthModal = useCallback((mode) => setAuthModalMode(mode), []);
    const closeAuthModal = useCallback(() => setAuthModalMode(null), []);

    const value = useMemo(
        () => ({
            isHydrated,
            isLoggedIn: Boolean(user),
            userEmail: user?.email ?? '',
            playerId: user?.playerId ?? null,
            role: user?.role ?? null,
            isAdmin: user?.role === 'Admin',
            login,
            logout,
            updateEmail,
            authModalMode,
            openAuthModal,
            closeAuthModal,
        }),
        [isHydrated, user, login, logout, updateEmail, authModalMode, openAuthModal, closeAuthModal],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used inside <AuthProvider>');
    }
    return context;
}
