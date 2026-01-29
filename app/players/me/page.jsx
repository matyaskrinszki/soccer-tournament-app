'use client';

import './page.css';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';

export default function PlayerMePage() {
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

    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authMode, setAuthMode] = useState('login');

    const [player, setPlayer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [emailValue, setEmailValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');
    const [confirmValue, setConfirmValue] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const [teamName, setTeamName] = useState('');
    const [leagueId, setLeagueId] = useState('');
    const [leagues, setLeagues] = useState([]);
    const [creatingTeam, setCreatingTeam] = useState(false);

    const canCreateTeam = useMemo(() => player && !player.team, [player]);

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

        const fetchPlayer = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await fetch(`/api/players/${playerId}`);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a játékos betöltésekor');
                }
                setPlayer(data.player);
                setEmailValue(data.player.email || '');
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPlayer();
    }, [playerId, isLoggedIn]);

    useEffect(() => {
        if (!isLoggedIn) return;
        const fetchLeagues = async () => {
            try {
                const res = await fetch('/api/leagues');
                if (!res.ok) return;
                const data = await res.json();
                setLeagues(data.leagues || []);
                if (!leagueId && data.leagues?.length) {
                    setLeagueId(data.leagues[0].id);
                }
            } catch (err) {
                // ignore
            }
        };

        fetchLeagues();
    }, [isLoggedIn, leagueId]);

    const handleProfileSubmit = async (event) => {
        event.preventDefault();
        setSuccess('');
        setError('');

        if (passwordValue && passwordValue !== confirmValue) {
            setError('A jelszavak nem egyeznek');
            return;
        }

        setSavingProfile(true);
        try {
            const payload = {
                email: emailValue?.trim(),
                password: passwordValue ? passwordValue : undefined,
            };

            const res = await fetch(`/api/players/${playerId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Nem sikerült frissíteni a profilt');
            }

            if (data?.player?.email) {
                localStorage.setItem('email', data.player.email);
                setUserEmail(data.player.email);
            }

            setPasswordValue('');
            setConfirmValue('');
            setSuccess('A profil frissítése sikeres.');
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingProfile(false);
        }
    };

    const handleCreateTeam = async (event) => {
        event.preventDefault();
        setSuccess('');
        setError('');

        if (!teamName.trim()) {
            setError('A csapatnév megadása kötelező');
            return;
        }

        if (!leagueId) {
            setError('Válassz ligát');
            return;
        }

        setCreatingTeam(true);
        try {
            const res = await fetch('/api/teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: teamName.trim(),
                    leagueId,
                    playerId,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Nem sikerült létrehozni a csapatot');
            }

            setSuccess('A csapat létrehozva. Te lettél a csapatkapitány.');
            setTeamName('');
            if (data?.teamId) {
                setPlayer((prev) => prev ? { ...prev, team: { id: data.teamId, name: teamName, leagueName: leagues.find((l) => l.id === leagueId)?.name } } : prev);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCreatingTeam(false);
        }
    };

    return (
        <div className="player-me-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="player-me-container">
                <div className="player-breadcrumb">
                    <Link href="/players">Vissza a játékosokhoz</Link>
                </div>

                {!isLoggedIn && (
                    <section className="player-card">
                        <h1>Bejelentkezés szükséges</h1>
                        <p className="subhead">A saját profilod megtekintéséhez jelentkezz be.</p>
                        <div className="button-row">
                            <button onClick={() => handleOpenAuth('login')}>Bejelentkezés</button>
                            <button onClick={() => handleOpenAuth('signup')}>Regisztráció</button>
                        </div>
                    </section>
                )}

                {isLoggedIn && loading && (
                    <div className="player-card">
                        <p>Profil betöltése...</p>
                    </div>
                )}

                {isLoggedIn && error && !loading && (
                    <div className="player-card error">
                        <p>{error}</p>
                    </div>
                )}

                {isLoggedIn && player && !loading && !error && (
                    <>
                        <section className="player-card">
                            <div className="player-header">
                                <div>
                                    <h1>Saját profil</h1>
                                    <p className="subhead">Itt módosíthatod az adataidat és létrehozhatsz csapatot.</p>
                                </div>
                            </div>

                            <div className="player-meta">
                                <p><strong>Játékos ID:</strong> {player.id}</p>
                                <p><strong>Csapat:</strong> {player.team ? (
                                    <Link href={`/teams/${player.team.id}`} className="team-link">{player.team.name}</Link>
                                ) : (
                                    <span className="no-team">Nincs csapata</span>
                                )}</p>
                            </div>
                        </section>

                        <section className="player-card">
                            <h2>Profil módosítása</h2>
                            <form onSubmit={handleProfileSubmit} className="form-grid">
                                <label>
                                    Email
                                    <input
                                        type="email"
                                        value={emailValue}
                                        onChange={(e) => setEmailValue(e.target.value)}
                                    />
                                </label>
                                <label>
                                    Új jelszó
                                    <input
                                        type="password"
                                        value={passwordValue}
                                        onChange={(e) => setPasswordValue(e.target.value)}
                                        placeholder="Hagyd üresen, ha nem változtatod"
                                    />
                                </label>
                                <label>
                                    Új jelszó megerősítése
                                    <input
                                        type="password"
                                        value={confirmValue}
                                        onChange={(e) => setConfirmValue(e.target.value)}
                                    />
                                </label>
                                <div className="button-row">
                                    <button type="submit" disabled={savingProfile}>
                                        {savingProfile ? 'Mentés...' : 'Mentés'}
                                    </button>
                                </div>
                            </form>
                        </section>

                        <section className="player-card">
                            <h2>Új csapat létrehozása</h2>
                            {!canCreateTeam && (
                                <p className="muted">Csak csapat nélküli játékos hozhat létre új csapatot.</p>
                            )}
                            {canCreateTeam && (
                                <form onSubmit={handleCreateTeam} className="form-grid">
                                    <label>
                                        Csapat neve
                                        <input
                                            type="text"
                                            value={teamName}
                                            onChange={(e) => setTeamName(e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        Liga
                                        <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
                                            {leagues.map((league) => (
                                                <option key={league.id} value={league.id}>
                                                    {league.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className="button-row">
                                        <button type="submit" disabled={creatingTeam}>
                                            {creatingTeam ? 'Létrehozás...' : 'Csapat létrehozása'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </section>

                        {success && (
                            <div className="player-card success">
                                <p>{success}</p>
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
