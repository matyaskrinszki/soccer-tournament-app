'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';

export default function TeamClient({ id }) {
    const [team, setTeam] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [upcomingMatches, setUpcomingMatches] = useState([]);
    const [previousMatches, setPreviousMatches] = useState([]);
    const [players, setPlayers] = useState([]);
    const [contentView, setContentView] = useState('matches'); // 'matches' or 'players'
    const [matchView, setMatchView] = useState('upcoming'); // 'upcoming' or 'previous'

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

    const handleAuthSuccess = (email, token) => {
        setIsLoggedIn(true);
        setUserEmail(email);
        setShowAuthModal(false);
    };

    useEffect(() => {
        if (!id) return; // wait until id prop is available

        const fetchTeam = async () => {
            try {
                setError('');
                setLoading(true);
                const response = await fetch(`/api/teams/${id}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Hiba történt a csapat betöltésekor');
                }

                setTeam(data.team);
                setUpcomingMatches(data.upcomingMatches ?? []);
                setPreviousMatches(data.previousMatches ?? []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        const fetchPlayers = async () => {
            try {
                const response = await fetch(`/api/players`);
                const data = await response.json();
                if (response.ok) {
                    const teamPlayers = (data.players || []).filter(p => p.team?.id === parseInt(id));
                    setPlayers(teamPlayers);
                }
            } catch (err) {
                // ignore
            }
        };

        fetchTeam();
        fetchPlayers();
    }, [id]);

    return (
        <div className="team-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="team-container">
                <div className="team-breadcrumb">
                    <Link href="/tabella">Vissza a táblához</Link>
                    {team && (
                        <span className="crumb">
                            {team.league.country} • {team.league.name}
                        </span>
                    )}
                </div>

                {loading && (
                    <div className="team-card">
                        <p>Csapat betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="team-card error">
                        <p>{error}</p>
                    </div>
                )}

                {team && !loading && !error && (
                    <>
                        <section className="team-card">
                            <div className="team-header">
                                <div>
                                    <p className="eyebrow">{team.league.country}</p>
                                    <h1>{team.name}</h1>
                                    <p className="subhead">{team.league.name}</p>
                                </div>
                                <div className="points-pill">
                                    <span>Pont</span>
                                    <strong>{team.points}</strong>
                                </div>
                            </div>

                            <div className="team-stats-grid">
                                <div className="stat-box">
                                    <p className="label">Mérkőzések</p>
                                    <p className="value">{team.matches}</p>
                                </div>
                                <div className="stat-box">
                                    <p className="label">Győzelem</p>
                                    <p className="value">{team.wins}</p>
                                </div>
                                <div className="stat-box">
                                    <p className="label">Döntetlen</p>
                                    <p className="value">{team.draws}</p>
                                </div>
                                <div className="stat-box">
                                    <p className="label">Vereség</p>
                                    <p className="value">{team.losses}</p>
                                </div>
                            </div>
                        </section>

                        <section className="team-card">
                            <div className="section-head">
                                <div className="match-toggle">
                                    <button
                                        className={`toggle-btn ${contentView === 'matches' ? 'active' : ''}`}
                                        onClick={() => setContentView('matches')}
                                    >
                                        Mérkőzések
                                    </button>
                                    <button
                                        className={`toggle-btn ${contentView === 'players' ? 'active' : ''}`}
                                        onClick={() => setContentView('players')}
                                    >
                                        Játékosok
                                    </button>
                                </div>
                                {contentView === 'matches' && (
                                    <div className="match-toggle">
                                        <button
                                            className={`toggle-btn ${matchView === 'upcoming' ? 'active' : ''}`}
                                            onClick={() => setMatchView('upcoming')}
                                        >
                                            Közelgő
                                        </button>
                                        <button
                                            className={`toggle-btn ${matchView === 'previous' ? 'active' : ''}`}
                                            onClick={() => setMatchView('previous')}
                                        >
                                            Korábbi
                                        </button>
                                    </div>
                                )}
                            </div>

                            {contentView === 'matches' && (
                                matchView === 'upcoming' ? (
                                    upcomingMatches.length === 0 ? (
                                        <p className="muted">Nincsenek közelgő mérkőzések.</p>
                                    ) : (
                                        <div className="upcoming-list">
                                            {upcomingMatches.map((m) => {
                                                const isHome = m.homeTeamId === team.id;
                                                const opponent = isHome ? m.awayName : m.homeName;
                                                const date = new Date(m.matchDate);
                                                const formatted = date.toLocaleString('hu-HU', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });

                                                return (
                                                    <Link href={`/matches/${m.id}`} key={m.id} className="match-row">
                                                        <div className="match-date">{formatted}</div>
                                                        <div className="match-vs">
                                                            <span className="home-away">{isHome ? 'Otthon' : 'Idegenben'}</span>
                                                            <span className="opponent">{opponent}</span>
                                                        </div>
                                                        <div className="match-league">{m.leagueName}</div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )
                                ) : (
                                    previousMatches.length === 0 ? (
                                        <p className="muted">Nincsenek korábbi mérkőzések.</p>
                                    ) : (
                                        <div className="upcoming-list">
                                            {previousMatches.map((m) => {
                                                const isHome = m.homeTeamId === team.id;
                                                const opponent = isHome ? m.awayName : m.homeName;
                                                const date = new Date(m.matchDate);
                                                const formatted = date.toLocaleString('hu-HU', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });
                                                const result = `${m.homeScore} - ${m.awayScore}`;

                                                return (
                                                    <Link href={`/matches/${m.id}`} key={m.id} className="match-row">
                                                        <div className="match-date">{formatted}</div>
                                                        <div className="match-vs">
                                                            <span className="home-away">{isHome ? 'Otthon' : 'Idegenben'}</span>
                                                            <span className="opponent">{opponent}</span>
                                                            <span className="result">{result}</span>
                                                        </div>
                                                        <div className="match-league">{m.leagueName}</div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )
                                )
                            )}

                            {contentView === 'players' && (
                                players.length === 0 ? (
                                    <p className="muted">Nincsenek játékosok ebben a csapatban.</p>
                                ) : (
                                    <div className="players-grid">
                                        {players.map((player) => (
                                            <Link href={`/players/${player.id}`} key={player.id} className="player-card-link">
                                                <div className="player-mini-card">
                                                    <h3>{player.name || player.email}</h3>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )
                            )}
                        </section>
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
