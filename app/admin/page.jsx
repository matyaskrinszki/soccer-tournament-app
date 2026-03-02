'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';
import { getAuthHeaders } from '../../lib/client-auth';
import './admin.css';

export default function AdminPage() {
    const router = useRouter();
    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        if (typeof window === 'undefined') return false;
        const token = localStorage.getItem('token');
        const email = localStorage.getItem('email');
        return Boolean(token && email);
    });
    const [userEmail, setUserEmail] = useState(() => {
        if (typeof window === 'undefined') return '';
        return localStorage.getItem('email') ?? '';
    });
    const [userRole, setUserRole] = useState(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authMode, setAuthMode] = useState('login');

    // Tabs
    const [activeTab, setActiveTab] = useState('overview');

    // Stats
    const [stats, setStats] = useState({
        totalPlayers: 0,
        totalTeams: 0,
        totalMatches: 0,
    });

    const handleOpenAuth = (mode) => {
        setAuthMode(mode);
        setShowAuthModal(true);
    };

    const handleCloseAuth = () => {
        setShowAuthModal(false);
    };

    const handleAuthSuccess = (email) => {
        setIsLoggedIn(true);
        setUserEmail(email);
        setShowAuthModal(false);
    };

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (!isHydrated) return;

        const role = localStorage.getItem('role');
        setUserRole(role);

        if (role !== 'Admin') {
            setError('Nincs jogosultságod az oldal megtekintéséhez');
            setTimeout(() => {
                router.push('/');
            }, 3000);
        }
    }, [isHydrated, router]);

    useEffect(() => {
        const fetchStats = async () => {
            if (!isHydrated || userRole !== 'Admin') return;

            try {
                setLoading(true);
                setError('');

                const [playersRes, teamsRes, matchesRes] = await Promise.all([
                    fetch('/api/players'),
                    fetch('/api/teams-list'),
                    fetch('/api/matches'),
                ]);

                if (!playersRes.ok) {
                    throw new Error(`Játékosok betöltése sikertelen: ${playersRes.status}`);
                }
                if (!teamsRes.ok) {
                    throw new Error(`Csapatok betöltése sikertelen: ${teamsRes.status}`);
                }
                if (!matchesRes.ok) {
                    throw new Error(`Mérkőzések betöltése sikertelen: ${matchesRes.status}`);
                }

                const playersData = await playersRes.json();
                const teamsData = await teamsRes.json();
                const matchesData = await matchesRes.json();

                setStats({
                    totalPlayers: (playersData.players || []).length,
                    totalTeams: (teamsData.teams || []).length,
                    totalMatches: (matchesData.matches || []).length,
                });
            } catch (err) {
                console.error('Admin stats fetch error:', err);
                setError(`Hiba az adatok betöltésekor: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };

        if (isHydrated) {
            fetchStats();
        }
    }, [isHydrated, userRole]);

    // During SSR, render a neutral loading state to avoid hydration mismatch
    if (!isHydrated) {
        return (
            <div className="admin-page">
                <Header
                    isLoggedIn={false}
                    userEmail=""
                    setIsLoggedIn={setIsLoggedIn}
                    onOpenAuth={handleOpenAuth}
                />
                <main className="admin-container">
                    <div className="admin-card">
                        <p>Betöltés...</p>
                    </div>
                </main>
            </div>
        );
    }

    if (!isLoggedIn) {
        return (
            <div className="admin-page">
                <Header
                    isLoggedIn={isLoggedIn}
                    userEmail={userEmail}
                    setIsLoggedIn={setIsLoggedIn}
                    onOpenAuth={handleOpenAuth}
                />
                <main className="admin-container">
                    <div className="admin-card error">
                        <h2>Bejelentkezés szükséges</h2>
                        <p>Az adminisztrációs oldal megtekintéséhez be kell jelentkezned.</p>
                    </div>
                </main>

                {showAuthModal && (
                    <AuthModal
                        mode={authMode}
                        onClose={handleCloseAuth}
                        onSuccess={handleAuthSuccess}
                    />
                )}
            </div>
        );
    }

    if (userRole !== 'Admin') {
        return (
            <div className="admin-page">
                <Header
                    isLoggedIn={isLoggedIn}
                    userEmail={userEmail}
                    setIsLoggedIn={setIsLoggedIn}
                    onOpenAuth={handleOpenAuth}
                />
                <main className="admin-container">
                    <div className="admin-card error">
                        <h2>Hozzáférés megtagadva</h2>
                        <p>Nincs jogosultságod az oldal megtekintéséhez. Az oldal átirányítása 3 másodperc múlva...</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="admin-container">
                <div className="admin-header">
                    <h1>Szervezés</h1>
                    <p className="admin-subtitle">Bajnokság szervezési kezelőpult</p>
                </div>

                {error && <div className="admin-card error"><p>{error}</p></div>}

                <div className="admin-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        Áttekintés
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'leagues' ? 'active' : ''}`}
                        onClick={() => setActiveTab('leagues')}
                    >
                        Ligák
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'matches' ? 'active' : ''}`}
                        onClick={() => setActiveTab('matches')}
                    >
                        Mérkőzések
                    </button>
                </div>

                {loading ? (
                    <div className="admin-card">
                        <p>Betöltés...</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'overview' && (
                            <div className="admin-overview">
                                <div className="stat-card">
                                    <h3>Játékosok</h3>
                                    <p className="stat-number">{stats.totalPlayers}</p>
                                </div>
                                <div className="stat-card">
                                    <h3>Csapatok</h3>
                                    <p className="stat-number">{stats.totalTeams}</p>
                                </div>
                                <div className="stat-card">
                                    <h3>Mérkőzések</h3>
                                    <p className="stat-number">{stats.totalMatches}</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'leagues' && (
                            <div className="admin-card">
                                <h3>Ligák szervezése</h3>
                                <p>Ez a funkció hamarosan elérhető lesz.</p>
                            </div>
                        )}

                        {activeTab === 'matches' && (
                            <div className="admin-card">
                                <h3>Mérkőzések szervezése</h3>
                                <p>Ez a funkció hamarosan elérhető lesz.</p>
                            </div>
                        )}
                    </>
                )}
            </main>

            {showAuthModal && (
                <AuthModal
                    mode={authMode}
                    onClose={handleCloseAuth}
                    onSuccess={handleAuthSuccess}
                />
            )}
        </div>
    );
}
