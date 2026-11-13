'use client';

import './page.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import SeasonPicker from '../components/SeasonPicker';

// "+3", "0", "-2"
function formatGoalDifference(value) {
    return value > 0 ? `+${value}` : String(value);
}

export default function StandingsPage() {
    const [leagues, setLeagues] = useState([]);
    const [season, setSeason] = useState(null);
    const [seasons, setSeasons] = useState([]);
    // null until the user picks one: the API then returns the default season
    const [requestedSeasonId, setRequestedSeasonId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedLeagueId, setSelectedLeagueId] = useState(null);
    const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetchStandings = async () => {
            try {
                setLoading(true);
                setError('');
                const query = requestedSeasonId ? `?seasonId=${requestedSeasonId}` : '';
                const response = await fetch(`/api/standings${query}`);
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Hiba történt a tabella betöltésekor');
                }
                if (cancelled) return;
                setLeagues(data.leagues);
                setSeason(data.season);
                setSeasons(data.seasons);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchStandings();
        return () => {
            cancelled = true;
        };
    }, [requestedSeasonId]);

    // A league picked in another season may not exist in this one
    const selectedLeague = leagues.find((league) => league.id === selectedLeagueId) ?? null;

    return (
        <div className="standings-page">
            <div className="standings-app">
                <header className="standings-header">
                    <div>
                        <p className="eyebrow">Tabella</p>
                        <h1>Ligák és csapatok</h1>
                        <p className="subhead">Válassz egy ligát a tabella megtekintéséhez.</p>
                    </div>
                </header>

                <SeasonPicker seasons={seasons} season={season} onChange={setRequestedSeasonId} />

                {loading ? (
                    <div className="loading-message">
                        <p>Bajnokságok betöltése...</p>
                    </div>
                ) : error ? (
                    <div className="error-message">
                        <p>{error}</p>
                    </div>
                ) : leagues.length === 0 ? (
                    <div className="loading-message">
                        <p>Még nincs publikált sorsolás, ezért tabella sincs.</p>
                    </div>
                ) : (
                    <div className="league-selector-container">
                        <div className="league-selector">
                            <button
                                className="league-selector-btn"
                                onClick={() => setShowLeagueDropdown(!showLeagueDropdown)}
                            >
                                {selectedLeague ? selectedLeague.name : 'Válassz ligát'}
                                <span className="dropdown-arrow">{showLeagueDropdown ? '▲' : '▼'}</span>
                            </button>

                            {showLeagueDropdown && (
                                <div className="league-dropdown">
                                    {leagues.map((league) => (
                                        <div
                                            key={league.id}
                                            className="league-option"
                                            onClick={() => {
                                                setSelectedLeagueId(league.id);
                                                setShowLeagueDropdown(false);
                                            }}
                                        >
                                            <p className="league-option-country">{league.country}</p>
                                            <p className="league-option-name">{league.name}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!loading && selectedLeague && (
                    <section className="league-standings">
                        {(() => {
                            const league = selectedLeague;
                            return (
                                <>
                                    <div className="league-header">
                                        <p className="eyebrow">{league.country}</p>
                                        <h2>{league.name}</h2>
                                        <p className="team-count-text">{league.teams.length} csapat</p>
                                    </div>

                                    <div className="table-scroll">
                                        <table className="standings-table">
                                            <thead>
                                                <tr>
                                                    <th>Csapat</th>
                                                    <th title="Mérkőzések száma">Ms</th>
                                                    <th title="Győzelmek">Gy</th>
                                                    <th title="Döntetlenek">D</th>
                                                    <th title="Vereségek">V</th>
                                                    <th title="Lőtt gólok">LG</th>
                                                    <th title="Kapott gólok">KG</th>
                                                    <th title="Gólkülönbség">GK</th>
                                                    <th>Pont</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {league.teams.map((team) => (
                                                    <tr key={team.id}>
                                                        <td>
                                                            <span className="position">{team.position}</span>
                                                            <Link href={`/teams/${team.id}`} className="team-name">
                                                                {team.name}
                                                            </Link>
                                                        </td>
                                                        <td>{team.played}</td>
                                                        <td>{team.wins}</td>
                                                        <td>{team.draws}</td>
                                                        <td>{team.losses}</td>
                                                        <td>{team.goalsFor}</td>
                                                        <td>{team.goalsAgainst}</td>
                                                        <td>{formatGoalDifference(team.goalDifference)}</td>
                                                        <td className="points">{team.points}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            );
                        })()}
                    </section>
                )}
            </div>
        </div>
    );
}
