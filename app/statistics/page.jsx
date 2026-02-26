'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';
import './page.css';

export default function StatisticsPage() {
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

    const handleAuthSuccess = (email) => {
        setIsLoggedIn(true);
        setUserEmail(email);
        setShowAuthModal(false);
    };

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [stats, setStats] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await fetch('/api/statistics');
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Nem sikerült a statisztika betöltése');
                }
                setStats(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    return (
        <div className="statistics-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="statistics-container">
                <header className="statistics-header">
                    <div>
                        <p className="eyebrow">Elemzés</p>
                        <h1>Bajnokság Statisztikák</h1>
                        <p className="subhead">Részletes statisztikák és elemzések az összes ligáról és játékosról.</p>
                    </div>
                </header>

                {loading && (
                    <div className="stats-card">
                        <p>Statisztika betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="stats-card error">
                        <p>{error}</p>
                    </div>
                )}

                {stats && !loading && !error && (
                    <>
                        {/* Match Statistics */}
                        {stats.matchStats && (
                            <section className="stats-card">
                                <h2>Mérkőzés Statisztikák</h2>
                                <div className="stats-grid">
                                    <div className="stat-box">
                                        <p className="stat-label">Összes mérkőzés</p>
                                        <p className="stat-value">{stats.matchStats.totalMatches || 0}</p>
                                    </div>
                                    <div className="stat-box">
                                        <p className="stat-label">Befejezett</p>
                                        <p className="stat-value">{stats.matchStats.finishedMatches || 0}</p>
                                    </div>
                                    <div className="stat-box">
                                        <p className="stat-label">Közelgő</p>
                                        <p className="stat-value">{stats.matchStats.upcomingMatches || 0}</p>
                                    </div>
                                    <div className="stat-box">
                                        <p className="stat-label">Átlag gólok/mérkőzés</p>
                                        <p className="stat-value">{stats.matchStats.avgGoalsPerMatch || 0}</p>
                                    </div>
                                    <div className="stat-box">
                                        <p className="stat-label">Max gólok egy mérkőzésben</p>
                                        <p className="stat-value">{stats.matchStats.maxGoalsInMatch || 0}</p>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Top Scorers */}
                        {stats.topScorers && stats.topScorers.length > 0 && (
                            <section className="stats-card">
                                <h2>Top 10 Góllövő - Globális</h2>
                                <div className="table-wrapper">
                                    <table className="stats-table">
                                        <thead>
                                            <tr>
                                                <th>Helyezés</th>
                                                <th>Játékos</th>
                                                <th>Gólok</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.topScorers.map((scorer, idx) => (
                                                <tr key={scorer.id}>
                                                    <td className="rank">{idx + 1}</td>
                                                    <td>
                                                        <Link href={`/players/${scorer.id}`} className="player-link">
                                                            {scorer.name}
                                                        </Link>
                                                    </td>
                                                    <td className="goals">{scorer.goals}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* Top Scorers by League */}
                        {stats.scorersByLeague && stats.scorersByLeague.length > 0 && (
                            <section className="stats-card">
                                <h2>Góllövőlista Liga Szerint</h2>
                                <div className="league-scorers">
                                    {(() => {
                                        const groupedByLeague = {};
                                        stats.scorersByLeague.forEach((scorer) => {
                                            if (!groupedByLeague[scorer.leagueId]) {
                                                groupedByLeague[scorer.leagueId] = {
                                                    leagueName: scorer.leagueName,
                                                    scorers: [],
                                                };
                                            }
                                            groupedByLeague[scorer.leagueId].scorers.push(scorer);
                                        });

                                        return Object.entries(groupedByLeague).map(([leagueId, leagueData]) => (
                                            <div key={leagueId} className="league-column">
                                                <h3>{leagueData.leagueName}</h3>
                                                <table className="stats-table compact">
                                                    <thead>
                                                        <tr>
                                                            <th>Játékos</th>
                                                            <th>Gólok</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {leagueData.scorers.slice(0, 5).map((scorer) => (
                                                            <tr key={`${leagueId}-${scorer.id}`}>
                                                                <td>
                                                                    <Link href={`/players/${scorer.id}`} className="player-link">
                                                                        {scorer.name}
                                                                    </Link>
                                                                </td>
                                                                <td className="goals">{scorer.goals}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </section>
                        )}

                        {/* Highest Scoring Matches */}
                        {stats.highestScoringMatches && stats.highestScoringMatches.length > 0 && (
                            <section className="stats-card">
                                <h2>Legtöbb Gólos Mérkőzések</h2>
                                <div className="matches-list">
                                    {stats.highestScoringMatches.map((match) => (
                                        <Link
                                            key={match.id}
                                            href={`/matches/${match.id}`}
                                            className="match-item"
                                        >
                                            <div className="match-teams">
                                                <p className="team-name">{match.homeName}</p>
                                                <p className="score">{match.homeScore} - {match.awayScore}</p>
                                                <p className="team-name">{match.awayName}</p>
                                            </div>
                                            <div className="match-info">
                                                <span className="total-goals">{match.totalGoals} gól</span>
                                                <span className="league">{match.leagueName}</span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Top Teams */}
                        {stats.topTeams && stats.topTeams.length > 0 && (
                            <section className="stats-card">
                                <h2>Top Csapatok</h2>
                                <div className="table-wrapper">
                                    <table className="stats-table">
                                        <thead>
                                            <tr>
                                                <th>Helyezés</th>
                                                <th>Csapat</th>
                                                <th>Mérkőzés</th>
                                                <th>Gy</th>
                                                <th>D</th>
                                                <th>V</th>
                                                <th>Pont</th>
                                                <th>Gy%</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.topTeams.map((team, idx) => (
                                                <tr key={team.id}>
                                                    <td className="rank">{idx + 1}</td>
                                                    <td>
                                                        <Link href={`/teams/${team.id}`} className="team-link">
                                                            {team.name}
                                                        </Link>
                                                    </td>
                                                    <td>{team.matches}</td>
                                                    <td>{team.wins}</td>
                                                    <td>{team.draws}</td>
                                                    <td>{team.losses}</td>
                                                    <td className="points">{team.points}</td>
                                                    <td>{team.winPercentage}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* Most Defensive Teams */}
                        {stats.defensiveTeams && stats.defensiveTeams.length > 0 && (
                            <section className="stats-card">
                                <h2>Legjobb Védekezés (Legkevesebb Kapott Gól)</h2>
                                <div className="table-wrapper">
                                    <table className="stats-table">
                                        <thead>
                                            <tr>
                                                <th>Helyezés</th>
                                                <th>Csapat</th>
                                                <th>Liga</th>
                                                <th>Mérkőzés</th>
                                                <th>Kapott Gólok</th>
                                                <th>Avg Kapott</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.defensiveTeams.map((team, idx) => (
                                                <tr key={team.id}>
                                                    <td className="rank">{idx + 1}</td>
                                                    <td>
                                                        <Link href={`/teams/${team.id}`} className="team-link">
                                                            {team.name}
                                                        </Link>
                                                    </td>
                                                    <td className="league-cell">{team.leagueName}</td>
                                                    <td>{team.matches}</td>
                                                    <td>{team.concededGoals || 0}</td>
                                                    <td>{team.avgConcededPerMatch || 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* League Statistics */}
                        {stats.leagueStats && stats.leagueStats.length > 0 && (
                            <section className="stats-card">
                                <h2>Liga Statisztikák</h2>
                                <div className="table-wrapper">
                                    <table className="stats-table">
                                        <thead>
                                            <tr>
                                                <th>Liga</th>
                                                <th>Ország</th>
                                                <th>Csapatok</th>
                                                <th>Összes Mérkőzés</th>
                                                <th>Befejezett</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.leagueStats.map((league) => (
                                                <tr key={league.id}>
                                                    <td className="league-name">{league.name}</td>
                                                    <td>{league.country}</td>
                                                    <td>{league.teamCount}</td>
                                                    <td>{league.totalMatches}</td>
                                                    <td>{league.finishedMatches}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>

            {showAuthModal && (
                <AuthModal
                    mode={authMode}
                    onClose={handleCloseAuth}
                    onSuccess={handleAuthSuccess}
                />
            )}
        </div>
    );
}
