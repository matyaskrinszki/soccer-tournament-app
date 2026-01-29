'use client';

import './page.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';

export default function PlayersBrowsePage() {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [captainTeam, setCaptainTeam] = useState(null);
    const [currentPlayerId, setCurrentPlayerId] = useState(null);
    const [isCaptain, setIsCaptain] = useState(false);
    const [recruitingId, setRecruitingId] = useState(null);
    const [recruitError, setRecruitError] = useState('');

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
        const fetchPlayers = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await fetch('/api/players');
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a játékosok betöltésekor');
                }
                setPlayers(data.players || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPlayers();
    }, []);

    useEffect(() => {
        const resolveCurrentPlayer = async () => {
            if (!isLoggedIn) {
                setCurrentPlayerId(null);
                setIsCaptain(false);
                setCaptainTeam(null);
                return;
            }

            let playerId = null;
            if (typeof window !== 'undefined') {
                const storedPlayerId = localStorage.getItem('playerId');
                if (storedPlayerId) {
                    playerId = Number(storedPlayerId);
                }
            }

            if (!playerId && userEmail) {
                try {
                    const res = await fetch(`/api/players?email=${encodeURIComponent(userEmail)}`);
                    const data = await res.json();
                    if (res.ok && data?.player?.id) {
                        playerId = data.player.id;
                        if (typeof window !== 'undefined') {
                            localStorage.setItem('playerId', String(playerId));
                        }
                    }
                } catch (err) {
                    playerId = null;
                }
            }

            if (!playerId) {
                setCurrentPlayerId(null);
                setIsCaptain(false);
                setCaptainTeam(null);
                return;
            }

            setCurrentPlayerId(playerId);

            try {
                const res = await fetch('/api/teams-list');
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a csapatok lekérdezésekor');
                }

                const team = (data.teams || []).find((t) => Number(t.captainPlayerId) === Number(playerId));
                if (team) {
                    setIsCaptain(true);
                    setCaptainTeam({
                        id: team.id,
                        name: team.name,
                        leagueName: team.leagueName,
                    });
                } else {
                    setIsCaptain(false);
                    setCaptainTeam(null);
                }
            } catch (err) {
                setIsCaptain(false);
                setCaptainTeam(null);
            }
        };

        resolveCurrentPlayer();
    }, [isLoggedIn, userEmail]);

    const handleRecruit = async (player) => {
        if (!captainTeam || !currentPlayerId || recruitingId) return;
        setRecruitError('');
        setRecruitingId(player.id);

        try {
            const res = await fetch(`/api/teams/${captainTeam.id}/recruit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    captainId: currentPlayerId,
                    playerId: player.id,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Nem sikerült a játékost hozzáadni a csapathoz');
            }

            setPlayers((prev) =>
                prev.map((p) =>
                    p.id === player.id
                        ? {
                            ...p,
                            team: {
                                id: captainTeam.id,
                                name: captainTeam.name,
                                leagueName: captainTeam.leagueName,
                            },
                        }
                        : p
                )
            );
        } catch (err) {
            setRecruitError(err.message);
        } finally {
            setRecruitingId(null);
        }
    };

    return (
        <div className="players-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="players-container">
                <header className="players-header">
                    <div>
                        <p className="eyebrow">Játékosok</p>
                        <h1>Játékosok böngészése</h1>
                        <p className="subhead">Név szerint rendezett lista. Kattints egy játékosra a részletekért.</p>
                    </div>
                </header>

                {loading && (
                    <div className="players-card">
                        <p>Játékosok betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="players-card error">
                        <p>{error}</p>
                    </div>
                )}

                {recruitError && !loading && !error && (
                    <div className="players-card error">
                        <p>{recruitError}</p>
                    </div>
                )}

                {!loading && !error && players.length === 0 && (
                    <div className="players-card empty">
                        <p>Nincs elérhető játékos.</p>
                    </div>
                )}

                {!loading && !error && players.length > 0 && (
                    <section className="players-list">
                        {players.map((player) => (
                            <div key={player.id} className="player-row">
                                <Link href={`/players/${player.id}`} className="player-link">
                                    <div>
                                        <h3>{player.name || player.email}</h3>
                                        {player.team ? (
                                            <p className="player-meta">Csapat: {player.team.name}</p>
                                        ) : (
                                            <p className="player-meta">Csapat: Nincs csapata</p>
                                        )}
                                    </div>
                                </Link>
                                {isLoggedIn && isCaptain && !player.team && (
                                    <button
                                        type="button"
                                        className="recruit-player-btn"
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            handleRecruit(player);
                                        }}
                                        disabled={Boolean(recruitingId)}
                                    >
                                        {recruitingId === player.id ? 'Hozzáadás...' : 'Toborzás'}
                                    </button>
                                )}
                            </div>
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
