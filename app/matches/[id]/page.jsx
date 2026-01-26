'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import './match.css';

export default function MatchPage() {
    const params = useParams();
    const id = params?.id;

    const [match, setMatch] = useState(null);
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
        if (!id) return;
        const fetchMatch = async () => {
            try {
                setError('');
                setLoading(true);
                const res = await fetch(`/api/matches/${id}`);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a mérkőzés betöltésekor');
                }
                setMatch(data.match);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchMatch();
    }, [id]);

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleString('hu-HU', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderScore = (m) => {
        if (m.status === 'upcoming') return 'vs';
        return `${m.homeScore} - ${m.awayScore}`;
    };

    return (
        <div className="match-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="match-container">
                <div className="match-breadcrumb">
                    <Link href="/tabella">Vissza a táblához</Link>
                    {match && (
                        <span className="crumb">{match.leagueCountry} • {match.leagueName}</span>
                    )}
                </div>

                {loading && (
                    <div className="match-card">
                        <p>Mérkőzés betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="match-card error">
                        <p>{error}</p>
                    </div>
                )}

                {match && !loading && !error && (() => {
                    const homeGoals = (match.goals || []).filter(g => g.teamId === match.homeTeam.id);
                    const awayGoals = (match.goals || []).filter(g => g.teamId === match.awayTeam.id);

                    return (
                        <section className="match-card">
                            <div className="match-header">
                                <div className="team-block">
                                    <p className="eyebrow">Hazai</p>
                                    <h2>
                                        <Link href={`/teams/${match.homeTeam.id}`} className="team-link">{match.homeTeam.name}</Link>
                                    </h2>
                                </div>

                                <div className="score-block">
                                    <p className="status">{match.status === 'finished' ? 'Vége' : 'Közelgő'}</p>
                                    <p className="score">{renderScore(match)}</p>
                                    <p className="date">{formatDate(match.matchDate)}</p>
                                </div>

                                <div className="team-block right">
                                    <p className="eyebrow">Vendég</p>
                                    <h2>
                                        <Link href={`/teams/${match.awayTeam.id}`} className="team-link">{match.awayTeam.name}</Link>
                                    </h2>
                                </div>
                            </div>

                            <div className="meta-row">
                                <span>{match.leagueName}</span>
                                <span>{match.leagueCountry}</span>
                                <span>ID: {match.id}</span>
                            </div>

                            {match.status === 'finished' && (
                                <div className="goals-grid">
                                    <div className="goal-col">
                                        <h3>Hazai gólok</h3>
                                        {homeGoals.length === 0 ? (
                                            <p className="muted">Nincs gól.</p>
                                        ) : (
                                            <ul>
                                                {homeGoals.map(g => (
                                                    <li key={g.id}>
                                                        <span className="minute">{g.minute}'.</span>
                                                        <span className="scorer">{g.playerName}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="goal-col">
                                        <h3>Vendég gólok</h3>
                                        {awayGoals.length === 0 ? (
                                            <p className="muted">Nincs gól.</p>
                                        ) : (
                                            <ul>
                                                {awayGoals.map(g => (
                                                    <li key={g.id}>
                                                        <span className="minute">{g.minute}'.</span>
                                                        <span className="scorer">{g.playerName}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    );
                })()}
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
