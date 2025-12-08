'use client';

import React from 'react';
import Link from 'next/link';
import './Header.css';

export default function Header({ isLoggedIn, userEmail, setIsLoggedIn, onOpenAuth }) {
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        setIsLoggedIn(false);
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
                    {isLoggedIn ? (
                        <>
                            <span className="user-email">{userEmail}</span>
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
