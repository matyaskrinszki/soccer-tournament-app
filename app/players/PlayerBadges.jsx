'use client';

import { useState } from 'react';
import { getAuthHeaders } from '../../lib/client-auth';
import './PlayerBadges.css';

/**
 * The player's badges (lib/badges.js). Public profile: the visible ones. Own
 * profile (`editable`): every earned badge with a switch for the public profile.
 */
export default function PlayerBadges({ playerId, badges, editable = false }) {
    const [items, setItems] = useState(badges ?? []);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState('');

    const toggle = async (badge) => {
        setSavingId(badge.id);
        setError('');
        try {
            const res = await fetch(`/api/players/${playerId}/badges`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ badgeId: badge.id, visible: !badge.visible }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Nem sikerült menteni a beállítást');
            }
            setItems(data.badges);
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingId(null);
        }
    };

    return (
        <section className="player-card">
            <h2>Kitűzők</h2>
            {items.length === 0 ? (
                <p className="muted">Még nincs kitűzője.</p>
            ) : (
                <ul className="badge-list">
                    {items.map((badge) => (
                        <li key={badge.id} className={`badge-item ${editable && !badge.visible ? 'hidden-badge' : ''}`}>
                            <span className="badge-name">{badge.name}</span>
                            <span className="badge-desc">{badge.description}</span>
                            {editable && (
                                <label className="badge-toggle">
                                    <input
                                        type="checkbox"
                                        checked={badge.visible}
                                        disabled={savingId === badge.id}
                                        onChange={() => toggle(badge)}
                                    />
                                    Látható a nyilvános profilon
                                </label>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {error && <p className="badge-error">{error}</p>}
        </section>
    );
}
