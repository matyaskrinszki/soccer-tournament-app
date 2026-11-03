'use client';

import './page.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function StandingsPage() {
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedLeagueId, setSelectedLeagueId] = useState(null);
    const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);

    useEffect(() => {
        const fetchLeagues = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/leagues');
                if (!response.ok) {
                    throw new Error('Hiba történt a bajnokságok betöltésekor');
                }
                const data = await response.json();
                setLeagues(data.leagues);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchLeagues();
    }, []);

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

                {loading ? (
                    <div className="loading-message">
                        <p>Bajnokságok betöltése...</p>
                    </div>
                ) : error ? (
                    <div className="error-message">
                        <p>{error}</p>
                    </div>
                ) : (
                    <div className="league-selector-container">
                        <div className="league-selector">
                            <button
                                className="league-selector-btn"
                                onClick={() => setShowLeagueDropdown(!showLeagueDropdown)}
                            >
                                {selectedLeagueId ? leagues.find(l => l.id === selectedLeagueId)?.name : 'Válassz ligát'}
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

                {selectedLeagueId && leagues.find(l => l.id === selectedLeagueId) && (
                    <section className="league-standings">
                        {(() => {
                            const league = leagues.find(l => l.id === selectedLeagueId);
                            return (
                                <>
                                    <div className="league-header">
                                        <p className="eyebrow">{league.country}</p>
                                        <h2>{league.name}</h2>
                                        <p className="team-count-text">{league.teams.length} csapat</p>
                                    </div>

                                    <table className="standings-table">
                                        <thead>
                                            <tr>
                                                <th>Csapat</th>
                                                <th title="Mérkőzések száma">Ms</th>
                                                <th title="Győzelmek">Gy</th>
                                                <th title="Döntetlenek">D</th>
                                                <th title="Vereségek">V</th>
                                                <th>Pont</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {league.teams.map((team, idx) => (
                                                <tr key={team.id}>
                                                    <td>
                                                        <span className="position">{idx + 1}</span>
                                                        <Link href={`/teams/${team.id}`} className="team-name">
                                                            {team.name}
                                                        </Link>
                                                    </td>
                                                    <td>{team.matches}</td>
                                                    <td>{team.wins}</td>
                                                    <td>{team.draws}</td>
                                                    <td>{team.losses}</td>
                                                    <td className="points">{team.points}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            );
                        })()}
                    </section>
                )}
            </div>
        </div>
    );
}
