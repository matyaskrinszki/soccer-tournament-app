'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '../../../lib/client-auth';

const STATUS_TEXT = {
    setup: 'nevezés nyitva',
    'team-preferences': 'preferenciák megadása',
    generated: 'menetrend készül',
    active: 'folyamatban',
    completed: 'lezárult',
};

/**
 * Captain's view: register the team for seasons in setup, or withdraw it.
 * @param {{teamId: string|number}} props
 */
export default function SeasonRegistration({ teamId }) {
    const [data, setData] = useState(null); // { playerCount, minPlayers, seasons }
    const [error, setError] = useState('');
    const [changingSeasonId, setChangingSeasonId] = useState(null);

    // State is only set in the promise callbacks, so the effect can call this on mount
    const load = useCallback(
        () =>
            fetch(`/api/teams/${teamId}/seasons`)
                .then(async (res) => {
                    const body = await res.json();
                    if (!res.ok) throw new Error(body.error || 'Hiba a nevezések betöltésekor');
                    return body;
                })
                .then(setData, (err) => setError(err.message)),
        [teamId],
    );

    useEffect(() => {
        load();
    }, [load]);

    const handleChange = async (season) => {
        setChangingSeasonId(season.id);
        setError('');
        try {
            const res = await fetch(`/api/teams/${teamId}/seasons`, {
                method: season.registered ? 'DELETE' : 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ seasonId: season.id }),
            });
            const body = await res.json();
            if (!res.ok) {
                throw new Error(body.error || 'Nem sikerült módosítani a nevezést');
            }
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setChangingSeasonId(null);
        }
    };

    if (!data) {
        return error ? <p className="registration-error">{error}</p> : null;
    }

    const hasEnoughPlayers = data.playerCount >= data.minPlayers;

    return (
        <section className="team-card">
            <h2>Szezon nevezés</h2>
            <p className="registration-note">
                A csapatnak {data.playerCount} játékosa van. Nevezni legalább {data.minPlayers} játékossal
                lehet, és a létszámot a nevezés lezárásakor újra ellenőrizzük.
            </p>
            {error && <p className="registration-error">{error}</p>}

            {data.seasons.length === 0 ? (
                <p className="registration-note">Jelenleg nincs nyitott nevezésű szezon.</p>
            ) : (
                <ul className="registration-list">
                    {data.seasons.map((season) => (
                        <li key={season.id}>
                            <div>
                                <strong>{season.name}</strong>
                                <span className="registration-status">
                                    {STATUS_TEXT[season.status] ?? season.status}
                                    {season.registered && ' • nevezve'}
                                </span>
                            </div>
                            {season.status === 'setup' && (
                                <button
                                    className="registration-btn"
                                    onClick={() => handleChange(season)}
                                    disabled={
                                        changingSeasonId === season.id ||
                                        (!season.registered && !hasEnoughPlayers)
                                    }
                                >
                                    {season.registered ? 'Nevezés visszavonása' : 'Nevezés'}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
