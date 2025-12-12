'use client';

import React, { useState } from 'react';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import './page.css';

export default function Home() {
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
    }; return (
        <div className="app">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />
            <main className="main-content">
                <section className="hero">
                    <div>
                        <p className="eyebrow">Futballbajnokság</p>
                        <h1>Legfrissebb hírek, tabella és eredmények</h1>
                        <p className="subhead">Gyors áttekintés a bajnokság állásáról és a legutóbbi mérkőzésekről.</p>
                    </div>
                </section>

                {/* News Section */}
                <section className="news-section" id="news">
                    <h2>Legújabb hírek</h2>
                    <div className="news-item">
                        <h3>Bajnokság szabályzata frissítve</h3>
                        <p>Megjelent: 2025. december 5.</p>
                    </div>
                    <div className="news-item">
                        <h3>Új szezon indult</h3>
                        <p>Megjelent: 2025. december 1.</p>
                    </div>
                </section>

                {/* Standings Section */}
                <section className="standings-section" id="standings">
                    <h2>Tabella</h2>
                    <table className="standings-table">
                        <thead>
                            <tr>
                                <th>Csapat</th>
                                <th>Mérkőzés</th>
                                <th>Győzelem</th>
                                <th>Döntetlen</th>
                                <th>Vereség</th>
                                <th>Pont</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>A csapat</td>
                                <td>10</td>
                                <td>7</td>
                                <td>2</td>
                                <td>1</td>
                                <td>23</td>
                            </tr>
                            <tr>
                                <td>B csapat</td>
                                <td>10</td>
                                <td>6</td>
                                <td>3</td>
                                <td>1</td>
                                <td>21</td>
                            </tr>
                            <tr>
                                <td>C csapat</td>
                                <td>10</td>
                                <td>5</td>
                                <td>2</td>
                                <td>3</td>
                                <td>17</td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                {/* Results Section */}
                <section className="results-section" id="results">
                    <h2>Legutóbbi eredmények</h2>
                    <div className="result-item">
                        <div>A csapat - B csapat</div>
                        <div className="score">3 - 1</div>
                    </div>
                    <div className="result-item">
                        <div>C csapat - A csapat</div>
                        <div className="score">2 - 2</div>
                    </div>
                </section>

                {showAuthModal && (
                    <AuthModal
                        mode={authMode}
                        onClose={handleCloseAuth}
                        onSuccess={handleAuthSuccess}
                    />
                )}
            </main>
        </div>
    );
}
