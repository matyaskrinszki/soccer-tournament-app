'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '../admin-api';

const SEASON_STATUSES = ['setup', 'team-preferences', 'generated', 'active', 'completed'];

export default function SeasonsTab({
    seasons,
    selectedSeason,
    onSelectSeason,
    onSeasonsChanged,
    onSeasonUpdated,
    notify,
}) {
    const [seasonForm, setSeasonForm] = useState({ name: '', startDate: '', endDate: '' });
    const [updatingSeasonStatusId, setUpdatingSeasonStatusId] = useState(null);

    // Dev/demo: seeding test preferences
    const [leagues, setLeagues] = useState([]);
    const [seedLeagueId, setSeedLeagueId] = useState('all');
    const [seedingPreferences, setSeedingPreferences] = useState(false);

    // Leagues for the test-preference seeding dropdown
    useEffect(() => {
        const fetchLeagues = async () => {
            try {
                const res = await fetch('/api/leagues');
                if (!res.ok) throw new Error('Hiba a ligák lekérdezésekor');
                const data = await res.json();
                setLeagues(data.leagues || []);
            } catch (err) {
                console.error('Leagues fetch error:', err);
            }
        };

        fetchLeagues();
    }, []);

    const handleCreateSeason = async () => {
        if (!seasonForm.name) {
            notify.error('Szezon név szükséges');
            return;
        }

        try {
            notify.clear();
            await adminFetch('/api/admin/seasons', {
                method: 'POST',
                body: seasonForm,
                errorMessage: 'Hiba a szezon létrehozásakor',
            });
            setSeasonForm({ name: '', startDate: '', endDate: '' });
            await onSeasonsChanged();
        } catch (err) {
            notify.error(err.message);
        }
    };

    const handleSeasonStatusChange = async (season, status) => {
        try {
            setUpdatingSeasonStatusId(season.id);
            notify.clear();

            await adminFetch('/api/admin/seasons', {
                method: 'PUT',
                body: {
                    seasonId: season.id,
                    status,
                    startDate: season.start_date,
                    endDate: season.end_date,
                },
                errorMessage: 'Hiba a szezon állapot frissítésekor',
            });

            onSeasonUpdated(season.id, { status });
            notify.success('Szezon állapot frissítve.');
        } catch (err) {
            notify.error(err.message);
        } finally {
            setUpdatingSeasonStatusId(null);
        }
    };

    const handleSeedPreferences = async () => {
        if (!selectedSeason) {
            notify.error('Szezon kiválasztása szükséges');
            return;
        }

        const leagueLabel =
            seedLeagueId === 'all'
                ? 'az összes liga'
                : leagues.find((league) => league.id === seedLeagueId)?.name || seedLeagueId;
        const confirmed = window.confirm(
            `Ez felülírja ${leagueLabel} csapatainak meglévő preferenciáit a kiválasztott szezonban. Folytatod?`,
        );
        if (!confirmed) return;

        try {
            setSeedingPreferences(true);
            notify.clear();

            const data = await adminFetch('/api/admin/seed-preferences', {
                method: 'POST',
                body: { seasonId: selectedSeason.id, leagueId: seedLeagueId },
                errorMessage: 'Hiba a teszt preferenciák feltöltésekor',
            });

            notify.success(`Teszt preferenciák feltöltve: ${data.teamCount} csapat (${data.seasonName}).`);
        } catch (err) {
            notify.error(err.message);
        } finally {
            setSeedingPreferences(false);
        }
    };

    return (
        <div className="admin-card">
            <h3>Szezonok kezelése</h3>

            <div className="form-section">
                <h4>Új szezon létrehozása</h4>
                <input
                    type="text"
                    placeholder="Szezon név (pl. 2024-25)"
                    value={seasonForm.name}
                    onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                />
                <input
                    type="date"
                    value={seasonForm.startDate}
                    onChange={(e) => setSeasonForm({ ...seasonForm, startDate: e.target.value })}
                />
                <input
                    type="date"
                    value={seasonForm.endDate}
                    onChange={(e) => setSeasonForm({ ...seasonForm, endDate: e.target.value })}
                />
                <button onClick={handleCreateSeason} className="btn-primary">Szezon létrehozása</button>
            </div>

            <div className="seasons-list">
                <h4>Meglévő szezonok</h4>
                {seasons.length === 0 ? (
                    <p>Nincsenek szezonok.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Név</th>
                                <th>Állapot</th>
                                <th>Kezdés</th>
                                <th>Befejezés</th>
                            </tr>
                        </thead>
                        <tbody>
                            {seasons.map((season) => (
                                <tr
                                    key={season.id}
                                    onClick={() => onSelectSeason(season.id)}
                                    className={`selectable-row ${selectedSeason?.id === season.id ? 'selected' : ''}`}
                                >
                                    <td>{season.name}</td>
                                    <td>
                                        <select
                                            className="status-select"
                                            value={season.status}
                                            onChange={(e) => handleSeasonStatusChange(season, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={updatingSeasonStatusId === season.id}
                                        >
                                            {SEASON_STATUSES.map((status) => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>{season.start_date || '-'}</td>
                                    <td>{season.end_date || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Dev/demo tool: random valid preferences for testing schedule generation */}
            <div className="form-section">
                <h4>Teszt preferenciák feltöltése (fejlesztéshez)</h4>
                <p>
                    Kiválasztott szezon: <strong>{selectedSeason?.name || '-'}</strong>
                </p>
                <p>
                    Minden csapat véletlenszerű, de érvényes preferenciákat kap (legalább 8 kedvelt,
                    legfeljebb 8 kerülendő időpont). A meglévő preferenciák felülíródnak.
                    Előfeltétel: a szezonhoz már legyenek generált időpontok.
                </p>
                <p>
                    Ütemezéshez az „Összes liga” kell: a generálás minden legalább 2 csapatos ligát
                    egyszerre ütemez.
                </p>
                <select
                    value={seedLeagueId}
                    onChange={(e) => setSeedLeagueId(e.target.value)}
                >
                    <option value="all">Összes liga</option>
                    {leagues.map((league) => (
                        <option key={league.id} value={league.id}>
                            {league.name} ({league.teams?.length ?? 0} csapat)
                        </option>
                    ))}
                </select>
                <button
                    onClick={handleSeedPreferences}
                    className="btn-primary"
                    disabled={!selectedSeason || seedingPreferences}
                >
                    {seedingPreferences ? 'Feltöltés folyamatban...' : 'Teszt preferenciák feltöltése'}
                </button>
            </div>
        </div>
    );
}
