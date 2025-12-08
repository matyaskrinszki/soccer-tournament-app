'use client';

import React, { useState } from 'react';
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
            // Validation
            if (!email || !password) {
                setError('Az email cím és a jelszó megadása kötelező');
                setLoading(false);
                return;
            }

            if (mode === 'signup') {
                if (password !== confirmPassword) {
                    setError('A jelszavak nem egyeznek');
                    setLoading(false);
                    return;
                }

                if (password.length < 8) {
                    setError('A jelszónak legalább 8 karakter hosszúnak kell lennie');
                    setLoading(false);
                    return;
                }

                if (!/[A-Z]/.test(password)) {
                    setError('A jelszónak tartalmaznia kell legalább egy nagybetűt');
                    setLoading(false);
                    return;
                }

                if (!/[a-z]/.test(password)) {
                    setError('A jelszónak tartalmaznia kell legalább egy kisbetűt');
                    setLoading(false);
                    return;
                }

                if (!/[0-9]/.test(password)) {
                    setError('A jelszónak tartalmaznia kell legalább egy számot');
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
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
