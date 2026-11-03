'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthHeaders } from '../../lib/client-auth';
import { useAuth } from './AuthContext';
import './Header.css';

export default function Header() {
    const router = useRouter();
    const { isHydrated, isLoggedIn, userEmail, playerId, isAdmin, logout, openAuthModal } = useAuth();
    const [captainTeamId, setCaptainTeamId] = useState(null);

    useEffect(() => {
        if (!isLoggedIn || !playerId) {
            setCaptainTeamId(null);
            return;
        }

        let cancelled = false;
        const fetchCaptainTeam = async () => {
            try {
                const res = await fetch(`/api/player-requests?playerId=${playerId}`, {
                    headers: getAuthHeaders(),
                });
                if (!res.ok) {
                    if (!cancelled) setCaptainTeamId(null);
                    return;
                }

                const data = await res.json();
                if (!cancelled) {
                    setCaptainTeamId(data?.captainTeamId ?? null);
                }
            } catch (err) {
                if (!cancelled) setCaptainTeamId(null);
            }
        };

        fetchCaptainTeam();
        return () => {
            cancelled = true;
        };
    }, [isLoggedIn, playerId]);

    const handleUserEmailClick = () => {
        router.push('/players/me');
    };

    return (
        <>
            <div className="top-bar">
                <div className="top-bar-container">
                    <div className="top-bar-spacer" />
                    <div className="auth-section">
                        {!isHydrated ? (
                            <>
                                <span className="auth-link">Betöltés...</span>
                            </>
                        ) : isLoggedIn ? (
                            <>
                                <span
                                    className="auth-link user-email-link"
                                    onClick={handleUserEmailClick}
                                    style={{ cursor: 'pointer', opacity: 1 }}
                                >
                                    {userEmail}
                                </span>
                                <span className="auth-link" onClick={logout}>Kijelentkezés</span>
                            </>
                        ) : (
                            <>
                                <span className="auth-link" onClick={() => openAuthModal('login')}>Bejelentkezés</span>
                                <span className="auth-link" onClick={() => openAuthModal('signup')}>Regisztráció</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <header className="header">
                <div className="header-container">
                    <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <h1>Futballbajnokság</h1>
                    </Link>
                    <nav className="nav">
                        <Link href="/tabella">Tabella</Link>
                        <Link href="/schedule">Menetrend</Link>
                        <Link href="/players">Játékosok</Link>
                        <Link href="/teams">Csapatok</Link>
                        <Link href="/statistics">Statisztikák</Link>
                        {isLoggedIn && (
                            <Link href="/matches/preferences">Preferenciák</Link>
                        )}
                        {isLoggedIn && captainTeamId && (
                            <Link href={`/teams/${captainTeamId}`}>Csapatom</Link>
                        )}
                        {isAdmin && (
                            <Link href="/admin">Szervezés</Link>
                        )}
                    </nav>
                </div>
            </header>
        </>
    );
}
