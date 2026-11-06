'use client';

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from 'react';

// The logged-in user is kept in localStorage (token, email, playerId, role) so it
// survives reloads. This context is the only place that writes it, so every page
// and the Header see the same state. localStorage is read through
// useSyncExternalStore, which re-renders whenever the stored values change.

const STORAGE_KEYS = ['token', 'email', 'playerId', 'role'];

const AuthContext = createContext(null);

// The "storage" event only fires in *other* tabs, so changes made in this tab
// notify the subscribers by hand
const listeners = new Set();

function notifyAuthChange() {
    listeners.forEach((listener) => listener());
}

function subscribe(listener) {
    listeners.add(listener);
    // Keep tabs in sync when the user logs in or out in another one
    const handleStorage = (event) => {
        if (event.key === null || STORAGE_KEYS.includes(event.key)) {
            listener();
        }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', handleStorage);
    };
}

// The snapshot must compare equal while nothing changed, so it is the stored
// values joined into one string; it is parsed into a user object below
function getStoredSnapshot() {
    return JSON.stringify(STORAGE_KEYS.map((key) => localStorage.getItem(key)));
}

// localStorage doesn't exist during SSR
function getServerSnapshot() {
    return null;
}

function parseStoredUser(snapshot) {
    if (snapshot === null) return null;

    const [token, email, storedId, role] = JSON.parse(snapshot);
    if (!token || !email) return null;

    return {
        email,
        playerId: storedId ? Number(storedId) : null,
        role,
    };
}

export function AuthProvider({ children }) {
    const snapshot = useSyncExternalStore(subscribe, getStoredSnapshot, getServerSnapshot);
    const user = useMemo(() => parseStoredUser(snapshot), [snapshot]);
    // Until the first client render nobody knows yet whether the user is logged in
    const isHydrated = snapshot !== null;
    // 'login' | 'signup' while the AuthModal is open, null otherwise
    const [authModalMode, setAuthModalMode] = useState(null);

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
        notifyAuthChange();
        setAuthModalMode(null);
    }, []);

    const logout = useCallback(() => {
        STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
        notifyAuthChange();
    }, []);

    // After the profile page changes the email address
    const updateEmail = useCallback((email) => {
        localStorage.setItem('email', email);
        notifyAuthChange();
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
