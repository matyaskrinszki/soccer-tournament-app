'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthHeaders } from '../../lib/client-auth';
import './Header.css';

export default function Header({ isLoggedIn, userEmail, setIsLoggedIn, onOpenAuth }) {
    const router = useRouter();
    const [playerId, setPlayerId] = useState(() => {
        if (typeof window === 'undefined') return null;
        const storedId = localStorage.getItem('playerId');
        return storedId ? Number(storedId) : null;
    });
    const [captainTeamId, setCaptainTeamId] = useState(null);
    const [userRole, setUserRole] = useState(() => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('role');
    });
    const [isHydrated, setIsHydrated] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        localStorage.removeItem('playerId');
        localStorage.removeItem('role');
        setPlayerId(null);
        setUserRole(null);
        setCaptainTeamId(null);
        setIsLoggedIn(false);
    };

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (!isLoggedIn || !userEmail) return;
        const storedId = localStorage.getItem('playerId');
        if (storedId) {
            setPlayerId(Number(storedId));
            return;
        } else {
            setPlayerId(null);
        }
    }, [isLoggedIn, userEmail]);

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

    useEffect(() => {
        if (!isLoggedIn) {
            setUserRole(null);
            return;
        }

        const role = localStorage.getItem('role');
        setUserRole(role);
    }, [isLoggedIn]);

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
                                <span className="auth-link" onClick={handleLogout}>Kijelentkezés</span>
                            </>
                        ) : (
                            <>
                                <span className="auth-link" onClick={() => onOpenAuth('login')}>Bejelentkezés</span>
                                <span className="auth-link" onClick={() => onOpenAuth('signup')}>Regisztráció</span>
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
                        <a href="/tabella">Tabella</a>
                        <Link href="/players">Játékosok</Link>
                        <Link href="/teams">Csapatok</Link>
                        <Link href="/statistics">Statisztikák</Link>
                        {isHydrated && isLoggedIn && (
                            <Link href="/matches/preferences">Preferenciák</Link>
                        )}
                        {isHydrated && isLoggedIn && captainTeamId && (
                            <Link href={`/teams/${captainTeamId}`}>Csapatom</Link>
                        )}
                        {isHydrated && isLoggedIn && userRole === 'Admin' && (
                            <Link href="/admin">Szervezés</Link>
                        )}
                    </nav>
                </div>
            </header>
        </>
    );
}
