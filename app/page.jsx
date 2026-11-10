'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SampleBadge, seasonLabel } from './components/SeasonPicker';
import './page.css';

function formatDate(matchDate) {
    return new Date(matchDate).toLocaleDateString('hu-HU', {
        month: 'short',
        day: 'numeric',
    });
}

function formatDateTime(matchDate) {
    return new Date(matchDate).toLocaleString('hu-HU', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function Home() {
    const [home, setHome] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchHome = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/home');
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Hiba történt a kezdőlap betöltésekor');
                }
                setHome(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchHome();
    }, []);

    return (
        <div className="app">
            <main className="main-content">
                <section className="hero">
                    <div>
                        <p className="eyebrow">Futballbajnokság</p>
                        <h1>Eredmények, következő mérkőzések és tabella</h1>
                        <p className="subhead">Gyors áttekintés a bajnokság állásáról és a legutóbbi mérkőzésekről.</p>
                    </div>
                </section>

                {loading && <p className="home-status">Betöltés...</p>}
                {error && <p className="home-status home-error">{error}</p>}

                {home && (
                    <>
                        <div className="home-columns">
                            <section className="results-section" id="results">
                                <h2>Legutóbbi eredmények</h2>
                                {home.latestResults.length === 0 ? (
                                    <p className="empty">Még nincs lejátszott mérkőzés.</p>
                                ) : (
                                    home.latestResults.map((match) => (
                                        <Link key={match.id} href={`/matches/${match.id}`} className="result-item">
                                            <div>
                                                <div className="teams">{match.homeTeamName} - {match.awayTeamName}</div>
                                                <div className="meta">{match.leagueName} · {formatDate(match.matchDate)}</div>
                                            </div>
                                            <div className="score">{match.homeScore} - {match.awayScore}</div>
                                        </Link>
                                    ))
                                )}
                            </section>

                            <section className="fixtures-section" id="fixtures">
                                <h2>Következő mérkőzések</h2>
                                {home.nextFixtures.length === 0 ? (
                                    <p className="empty">Nincs kiírt következő mérkőzés.</p>
                                ) : (
                                    home.nextFixtures.map((match) => (
                                        <Link key={match.id} href={`/matches/${match.id}`} className="result-item">
                                            <div>
                                                <div className="teams">{match.homeTeamName} - {match.awayTeamName}</div>
                                                <div className="meta">{match.leagueName}</div>
                                            </div>
                                            <div className="kickoff">{formatDateTime(match.matchDate)}</div>
                                        </Link>
                                    ))
                                )}
                                <Link href="/schedule" className="section-link">Teljes menetrend →</Link>
                            </section>
                        </div>

                        <section className="standings-section" id="standings">
                            <h2>Tabella élmezőnye</h2>
                            {home.standingsSeason && (
                                <p className="standings-season">
                                    {seasonLabel(home.standingsSeason)}
                                    {home.standingsSeason.isSample && <SampleBadge />}
                                </p>
                            )}
                            {home.standings.length === 0 ? (
                                <p className="empty">Még nincs publikált menetrend.</p>
                            ) : (
                                <div className="standings-grid">
                                    {home.standings.map((league) => (
                                        <div key={league.id} className="league-summary">
                                            <h3>{league.name}</h3>
                                            <div className="table-scroll">
                                                <table className="standings-table">
                                                    <thead>
                                                        <tr>
                                                            <th>#</th>
                                                            <th>Csapat</th>
                                                            <th>M</th>
                                                            <th>Pont</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {league.teams.map((team) => (
                                                            <tr key={team.id}>
                                                                <td>{team.position}</td>
                                                                <td>
                                                                    <Link href={`/teams/${team.id}`}>{team.name}</Link>
                                                                </td>
                                                                <td>{team.played}</td>
                                                                <td><strong>{team.points}</strong></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Link href="/tabella" className="section-link">Teljes tabella →</Link>
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}
