'use client';

import React, { useState } from 'react';
import { validateAuth } from '../../lib/validation';
import './AuthModal.css';

export default function AuthModal({ mode, onClose, onSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Validation using shared utility
            const emailError = validateAuth.email(email);
            if (emailError) {
                setError(emailError);
                setLoading(false);
                return;
            }

            const passwordError = validateAuth.password(password);
            if (passwordError) {
                setError(passwordError);
                setLoading(false);
                return;
            }

            if (mode === 'signup') {
                const matchError = validateAuth.passwordMatch(password, confirmPassword);
                if (matchError) {
                    setError(matchError);
                    setLoading(false);
                    return;
                }
            }

            const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'An error occurred');
                setLoading(false);
                return;
            }

            // Success
            localStorage.setItem('token', data.token);
            localStorage.setItem('email', data.email);
            onSuccess(data.email, data.token);
        } catch (err) {
            setError('Hálózati hiba történt. Kérjük, próbáld újra.');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="close-btn" onClick={onClose}>×</button>
                <h2>{mode === 'login' ? 'Bejelentkezés' : 'Regisztráció'}</h2>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Az e-mail címed"
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Jelszó</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="A jelszavad"
                            disabled={loading}
                        />
                    </div>

                    {mode === 'signup' && (
                        <div className="form-group">
                            <label htmlFor="confirmPassword">Jelszó megerősítése</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Erősítsd meg a jelszót"
                                disabled={loading}
                            />
                        </div>
                    )}

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? 'Feldolgozás...' : (mode === 'login' ? 'Bejelentkezés' : 'Regisztráció')}
                    </button>
                </form>
            </div>
        </div>
    );
}
