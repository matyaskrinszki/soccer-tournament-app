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
    // Remembers which player the team was fetched for, so after logout or a user
    // switch the old value is ignored without having to reset it
    const [captainTeam, setCaptainTeam] = useState({ playerId: null, teamId: null });
    // On phones the links are behind a "Menü" button (Header.css hides it on wider screens)
    const [menuOpen, setMenuOpen] = useState(false);
    const captainTeamId =
        isLoggedIn && playerId && captainTeam.playerId === playerId ? captainTeam.teamId : null;

    useEffect(() => {
        if (!isLoggedIn || !playerId) {
            return;
        }

        let cancelled = false;
        const fetchCaptainTeam = async () => {
            let teamId = null;
            try {
                const res = await fetch(`/api/player-requests?playerId=${playerId}`, {
                    headers: getAuthHeaders(),
                });
                if (res.ok) {
                    const data = await res.json();
                    teamId = data?.captainTeamId ?? null;
                }
            } catch (err) {
                // No "Csapatom" link if the request fails
            }
            if (!cancelled) {
                setCaptainTeam({ playerId, teamId });
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
                    <Link
                        href="/"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                        onClick={() => setMenuOpen(false)}
                    >
                        <h1>Futballbajnokság</h1>
                    </Link>
                    <button
                        type="button"
                        className="nav-toggle"
                        aria-expanded={menuOpen}
                        aria-controls="main-nav"
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        {menuOpen ? 'Bezárás' : 'Menü'}
                    </button>
                    {/* Choosing a page closes the phone menu */}
                    <nav
                        id="main-nav"
                        className={`nav ${menuOpen ? 'open' : ''}`}
                        onClick={(e) => {
                            if (e.target.closest('a')) setMenuOpen(false);
                        }}
                    >
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
