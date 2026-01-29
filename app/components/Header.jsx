'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import './Header.css';

export default function Header({ isLoggedIn, userEmail, setIsLoggedIn, onOpenAuth }) {
    const router = useRouter();
    const [playerId, setPlayerId] = useState(() => {
        if (typeof window === 'undefined') return null;
        const storedId = localStorage.getItem('playerId');
        return storedId ? Number(storedId) : null;
    });
    const [isResolvingPlayer, setIsResolvingPlayer] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        localStorage.removeItem('playerId');
        setIsLoggedIn(false);
    };

    useEffect(() => {
        if (!isLoggedIn || !userEmail) return;
        const storedId = localStorage.getItem('playerId');
        if (storedId) {
            setPlayerId(Number(storedId));
            return;
        }

        let cancelled = false;
        const fetchPlayerId = async () => {
            setIsResolvingPlayer(true);
            try {
                const res = await fetch(`/api/players?email=${encodeURIComponent(userEmail)}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data?.player?.id) {
                    localStorage.setItem('playerId', String(data.player.id));
                    if (!cancelled) {
                        setPlayerId(data.player.id);
                    }
                }
            } catch (err) {
                // ignore
            } finally {
                if (!cancelled) setIsResolvingPlayer(false);
            }
        };

        fetchPlayerId();
        return () => {
            cancelled = true;
        };
    }, [isLoggedIn, userEmail]);

    const handleUserEmailClick = () => {
        router.push('/players/me');
    };

    return (
        <header className="header">
            <div className="header-container">
                <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <h1>Futballbajnokság</h1>
                </Link>
                <nav className="nav">
                    <a href="/tabella">Tabella</a>
                    <a href="#results">Eredmények</a>
                    <a href="#news">Hírek</a>
                    <Link href="/players">Játékosok</Link>
                    <Link href="/teams">Csapatok</Link>
                    {isLoggedIn ? (
                        <>
                            <button
                                className="user-email-link"
                                onClick={handleUserEmailClick}
                                disabled={isResolvingPlayer}
                            >
                                {isResolvingPlayer ? 'Betöltés...' : userEmail}
                            </button>
                            <button onClick={handleLogout}>Kijelentkezés</button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => onOpenAuth('login')}>Bejelentkezés</button>
                            <button onClick={() => onOpenAuth('signup')}>Regisztráció</button>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
}
