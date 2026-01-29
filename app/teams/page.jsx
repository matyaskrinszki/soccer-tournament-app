'use client';

import './page.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';

export default function TeamsBrowsePage() {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
    const [playerId, setPlayerId] = useState(() => {
        if (typeof window === 'undefined') return null;
        const storedId = localStorage.getItem('playerId');
        return storedId ? Number(storedId) : null;
    });
    const [playerTeam, setPlayerTeam] = useState(null);
    const [joiningTeamId, setJoiningTeamId] = useState(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authMode, setAuthMode] = useState('login');

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
        if (!isLoggedIn || !userEmail) return;
        const storedId = localStorage.getItem('playerId');
        if (storedId) {
            setPlayerId(Number(storedId));
            return;
        }

        let cancelled = false;
        const resolvePlayer = async () => {
            try {
                const res = await fetch(`/api/players?email=${encodeURIComponent(userEmail)}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data?.player?.id && !cancelled) {
                    localStorage.setItem('playerId', String(data.player.id));
                    setPlayerId(data.player.id);
                }
            } catch (err) {
                // ignore
            }
        };
        resolvePlayer();

        return () => {
            cancelled = true;
        };
    }, [isLoggedIn, userEmail]);

    useEffect(() => {
        if (!playerId || !isLoggedIn) return;

        const fetchPlayerTeam = async () => {
            try {
                const res = await fetch(`/api/players/${playerId}`);
                if (!res.ok) return;
                const data = await res.json();
                setPlayerTeam(data.player?.team || null);
            } catch (err) {
                // ignore
            }
        };

        fetchPlayerTeam();
    }, [playerId, isLoggedIn]);

    useEffect(() => {
        const fetchTeams = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await fetch('/api/teams-list');
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a csapatok betöltésekor');
                }
                setTeams(data.teams || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchTeams();
    }, []);

    const handleJoinTeam = async (e, teamId) => {
        e.preventDefault();
        e.stopPropagation();

        if (!playerId) return;

        setJoiningTeamId(teamId);
        try {
            const res = await fetch(`/api/teams/${teamId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ playerId }),
            });

            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Nem sikerült csatlakozni a csapathoz');
                setJoiningTeamId(null);
                return;
            }

            const joinedTeam = teams.find((t) => t.id === teamId);
            setPlayerTeam(joinedTeam || { id: teamId });
            setJoiningTeamId(null);
        } catch (err) {
            alert('Nem sikerült csatlakozni a csapathoz');
            setJoiningTeamId(null);
        }
    };

    return (
        <div className="teams-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="teams-container">
                <header className="teams-header">
                    <div>
                        <p className="eyebrow">Csapatok</p>
                        <h1>Csapatok böngészése</h1>
                        <p className="subhead">Név szerint rendezett lista. Kattints egy csapatra a részletekért.</p>
                    </div>
                </header>

                {loading && (
                    <div className="teams-card">
                        <p>Csapatok betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="teams-card error">
                        <p>{error}</p>
                    </div>
                )}

                {!loading && !error && teams.length === 0 && (
                    <div className="teams-card empty">
                        <p>Nincs elérhető csapat.</p>
                    </div>
                )}

                {!loading && !error && teams.length > 0 && (
                    <section className="teams-list">
                        {teams.map((team) => (
                            <Link key={team.id} href={`/teams/${team.id}`} className="team-row">
                                <div className="team-info">
                                    <h3>{team.name}</h3>
                                    <p className="team-meta">Liga: {team.leagueName}</p>
                                    {team.captainName && (
                                        <p className="team-meta">Kapitány: {team.captainName}</p>
                                    )}
                                    <p className="team-stats">
                                        {team.matches} M • {team.wins} Gy • {team.draws} D • {team.losses} V • {team.points} Pont
                                    </p>
                                </div>
                                {isLoggedIn && playerId && !playerTeam && (
                                    <button
                                        className="join-team-btn"
                                        onClick={(e) => handleJoinTeam(e, team.id)}
                                        disabled={joiningTeamId === team.id}
                                    >
                                        {joiningTeamId === team.id ? 'Csatlakozás...' : 'Csatlakozás'}
                                    </button>
                                )}
                            </Link>
                        ))}
                    </section>
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
