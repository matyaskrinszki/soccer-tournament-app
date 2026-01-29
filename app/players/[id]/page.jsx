'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import './player.css';

export default function PlayerPage() {
    const params = useParams();
    const id = params?.id;

    const [player, setPlayer] = useState(null);
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
        const fetchPlayer = async () => {
            try {
                setError('');
                setLoading(true);
                const res = await fetch(`/api/players/${id}`);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a játékos betöltésekor');
                }
                setPlayer(data.player);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchPlayer();
    }, [id]);

    return (
        <div className="player-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="player-container">
                <div className="player-breadcrumb">
                    <Link href="/tabella">Vissza a táblához</Link>
                    {player && player.team && (
                        <span className="crumb">{player.team.leagueName}</span>
                    )}
                </div>

                {loading && (
                    <div className="player-card">
                        <p>Játékos betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="player-card error">
                        <p>{error}</p>
                    </div>
                )}

                {player && !loading && !error && (
                    <section className="player-card">
                        <div className="player-header">
                            <div>
                                {player.team && <p className="eyebrow">{player.team.leagueName}</p>}
                                <h1>{player.name}</h1>
                                {player.email && <p className="subhead">Email: {player.email}</p>}
                            </div>
                            <div className="stat-pill">
                                <span>Gólok</span>
                                <strong>{player.goals}</strong>
                            </div>
                        </div>

                        <div className="player-meta">
                            {player.team ? (
                                <p><strong>Csapat:</strong> <Link href={`/teams/${player.team.id}`} className="team-link">{player.team.name}</Link></p>
                            ) : (
                                <p><strong>Csapat:</strong> <span className="no-team">Nincs csapata</span></p>
                            )}
                            <p><strong>Játékos ID:</strong> {player.id}</p>
                        </div>
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
