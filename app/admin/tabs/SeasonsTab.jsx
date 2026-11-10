'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../admin-api';
import { statusLabel } from '../season-statuses';

// The manual step each status allows; the rest happen when generating and
// publishing (see lib/season-status.js)
const STATUS_ACTIONS = {
    setup: {
        action: 'close-registration',
        label: 'Nevezés lezárása',
        confirm: 'A nevezés lezárása után csapat nem nevezhet és nem léphet vissza. Folytatod?',
        success: 'Nevezés lezárva, a kapitányok megadhatják a preferenciáikat.',
    },
    active: {
        action: 'complete',
        label: 'Szezon lezárása',
        confirm: 'A lezárt szezon végleges. Folytatod?',
        success: 'Szezon lezárva.',
    },
};

export default function SeasonsTab({
    seasons,
    selectedSeason,
    onSelectSeason,
    onSeasonsChanged,
    onSeasonUpdated,
    notify,
}) {
    const [seasonForm, setSeasonForm] = useState({ name: '', startDate: '', endDate: '' });
    const [changingStatusId, setChangingStatusId] = useState(null);

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

    const handleStatusAction = async (season) => {
        const step = STATUS_ACTIONS[season.status];
        if (!step || !window.confirm(step.confirm)) return;

        try {
            setChangingStatusId(season.id);
            notify.clear();

            const data = await adminFetch('/api/admin/seasons', {
                method: 'PUT',
                body: { seasonId: season.id, action: step.action },
                errorMessage: 'Hiba a szezon állapot frissítésekor',
            });

            onSeasonUpdated(season.id, { status: data.status });
            notify.success(step.success);
        } catch (err) {
            notify.error(err.message);
        } finally {
            setChangingStatusId(null);
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
                    <div className="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>Név</th>
                                    <th>Állapot</th>
                                    <th>Nevezett csapatok</th>
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
                                            {statusLabel(season.status)}
                                            {STATUS_ACTIONS[season.status] && (
                                                <button
                                                    className="btn-secondary status-action"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStatusAction(season);
                                                    }}
                                                    disabled={changingStatusId === season.id}
                                                >
                                                    {STATUS_ACTIONS[season.status].label}
                                                </button>
                                            )}
                                        </td>
                                        <td>{season.registeredTeamIds?.length ?? 0}</td>
                                        <td>{season.start_date || '-'}</td>
                                        <td>{season.end_date || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedSeason && (
                <SeasonTeamsPanel
                    key={selectedSeason.id}
                    season={selectedSeason}
                    onRegistrationsChanged={onSeasonsChanged}
                    notify={notify}
                />
            )}

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
                    Csak a nevezett csapatok kapnak preferenciát, és csak a nevezés lezárása után.
                    Ütemezéshez az „Összes liga” kell: a generálás minden legalább 2 nevezett
                    csapatos ligát egyszerre ütemez.
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

/**
 * Teams registered for the selected season. While the season is in setup the
 * admin can register or withdraw any team, e.g. to prepare a test season.
 */
function SeasonTeamsPanel({ season, onRegistrationsChanged, notify }) {
    const [teams, setTeams] = useState([]);
    const [minPlayers, setMinPlayers] = useState(0);
    const [changingTeamId, setChangingTeamId] = useState(null);
    const canChange = season.status === 'setup';

    // State is only set in the promise callbacks, so the effect can call this on mount
    const loadTeams = useCallback(
        () =>
            adminFetch(`/api/admin/seasons/${season.id}/teams`, {
                errorMessage: 'Hiba a nevezések lekérdezésekor',
            }).then(
                (data) => {
                    setTeams(data.teams || []);
                    setMinPlayers(data.minPlayers);
                },
                (err) => notify.error(err.message),
            ),
        [season.id, notify],
    );

    useEffect(() => {
        loadTeams();
    }, [loadTeams]);

    const handleToggle = async (team) => {
        try {
            setChangingTeamId(team.id);
            notify.clear();
            await adminFetch(`/api/teams/${team.id}/seasons`, {
                method: team.registered ? 'DELETE' : 'POST',
                body: { seasonId: season.id },
                errorMessage: 'Hiba a nevezés módosításakor',
            });
            await Promise.all([loadTeams(), onRegistrationsChanged()]);
        } catch (err) {
            notify.error(err.message);
        } finally {
            setChangingTeamId(null);
        }
    };

    const shownTeams = canChange ? teams : teams.filter((team) => team.registered);

    return (
        <div className="form-section">
            <h4>Nevezések – {season.name}</h4>
            <p>
                {canChange
                    ? `Nevezni legalább ${minPlayers} játékossal lehet. A nevezés lezárásakor a létszámot újra ellenőrizzük.`
                    : 'A nevezés lezárult, a lista már nem módosítható.'}
            </p>
            {shownTeams.length === 0 ? (
                <p>Nincs nevezett csapat.</p>
            ) : (
                <div className="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>Csapat</th>
                                <th>Liga</th>
                                <th>Játékosok</th>
                                {canChange && <th>Nevezés</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {shownTeams.map((team) => (
                                <tr key={team.id}>
                                    <td>{team.name}</td>
                                    <td>{team.leagueName}</td>
                                    <td>{team.playerCount}</td>
                                    {canChange && (
                                        <td>
                                            <button
                                                className={team.registered ? 'btn-secondary' : 'btn-primary'}
                                                onClick={() => handleToggle(team)}
                                                disabled={
                                                    changingTeamId === team.id ||
                                                    (!team.registered && team.playerCount < minPlayers)
                                                }
                                            >
                                                {team.registered ? 'Visszavonás' : 'Nevezés'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
