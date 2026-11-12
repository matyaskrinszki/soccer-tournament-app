'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import ReportPanel from './ReportPanel';
import './match.css';

export default function MatchPage() {
    const params = useParams();
    const id = params?.id;
    const { isLoggedIn } = useAuth();
    // Bumped to load the match again, e.g. after the captains' reports recorded the result
    const [reloadKey, setReloadKey] = useState(0);

    const [match, setMatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id) return;
        const fetchMatch = async () => {
            try {
                setError('');
                setLoading(true);
                const res = await fetch(`/api/matches/${id}`);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a mérkőzés betöltésekor');
                }
                setMatch(data.match);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchMatch();
    }, [id, reloadKey]);

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleString('hu-HU', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderScore = (m) => {
        if (m.status === 'upcoming') return 'vs';
        return `${m.homeScore} - ${m.awayScore}`;
    };

    return (
        <div className="match-page">
            <main className="match-container">
                <div className="match-breadcrumb">
                    <Link href="/tabella">Vissza a táblához</Link>
                    {match && (
                        <span className="crumb">{match.leagueCountry} • {match.leagueName}</span>
                    )}
                </div>

                {loading && (
                    <div className="match-card">
                        <p>Mérkőzés betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="match-card error">
                        <p>{error}</p>
                    </div>
                )}

                {match && !loading && !error && (() => {
                    const homeGoals = (match.goals || []).filter(g => g.teamId === match.homeTeam.id);
                    const awayGoals = (match.goals || []).filter(g => g.teamId === match.awayTeam.id);
                    // Goals without a recorded scorer (e.g. own goals) have no goal rows
                    const unknownGoals = (score, goals) => score - goals.reduce((sum, g) => sum + g.goals, 0);
                    const homeUnknown = unknownGoals(match.homeScore, homeGoals);
                    const awayUnknown = unknownGoals(match.awayScore, awayGoals);

                    return (
                        <section className="match-card">
                            <div className="match-header">
                                <div className="team-block">
                                    <p className="eyebrow">Hazai</p>
                                    <h2>
                                        <Link href={`/teams/${match.homeTeam.id}`} className="team-link">{match.homeTeam.name}</Link>
                                    </h2>
                                </div>

                                <div className="score-block">
                                    <p className="status">{match.status === 'finished' ? 'Vége' : 'Közelgő'}</p>
                                    <p className="score">{renderScore(match)}</p>
                                    <p className="date">{formatDate(match.matchDate)}</p>
                                </div>

                                <div className="team-block right">
                                    <p className="eyebrow">Vendég</p>
                                    <h2>
                                        <Link href={`/teams/${match.awayTeam.id}`} className="team-link">{match.awayTeam.name}</Link>
                                    </h2>
                                </div>
                            </div>

                            <div className="meta-row">
                                <span>{match.leagueName}</span>
                                <span>{match.leagueCountry}</span>
                                <span>ID: {match.id}</span>
                            </div>

                            {match.status === 'finished' && (
                                <div className="goals-grid">
                                    <div className="goal-col">
                                        <h3>Hazai gólok</h3>
                                        {homeGoals.length === 0 && homeUnknown <= 0 ? (
                                            <p className="muted">Nincs gól.</p>
                                        ) : (
                                            <ul>
                                                {homeGoals.map(g => (
                                                    <li key={g.playerId}>
                                                        <Link href={`/players/${g.playerId}`} className="scorer">{g.playerName}</Link>
                                                        {g.goals > 1 && <span className="goal-count">×{g.goals}</span>}
                                                    </li>
                                                ))}
                                                {homeUnknown > 0 && (
                                                    <li className="muted">
                                                        Ismeretlen góllövő
                                                        {homeUnknown > 1 && <span className="goal-count">×{homeUnknown}</span>}
                                                    </li>
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="goal-col">
                                        <h3>Vendég gólok</h3>
                                        {awayGoals.length === 0 && awayUnknown <= 0 ? (
                                            <p className="muted">Nincs gól.</p>
                                        ) : (
                                            <ul>
                                                {awayGoals.map(g => (
                                                    <li key={g.playerId}>
                                                        <Link href={`/players/${g.playerId}`} className="scorer">{g.playerName}</Link>
                                                        {g.goals > 1 && <span className="goal-count">×{g.goals}</span>}
                                                    </li>
                                                ))}
                                                {awayUnknown > 0 && (
                                                    <li className="muted">
                                                        Ismeretlen góllövő
                                                        {awayUnknown > 1 && <span className="goal-count">×{awayUnknown}</span>}
                                                    </li>
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    );
                })()}

                {/* Only the captains of the two teams see it (checked on the server) */}
                {match && !loading && !error && isLoggedIn && match.status === 'upcoming' && (
                    <ReportPanel
                        key={match.id}
                        match={match}
                        onFinalized={() => setReloadKey((key) => key + 1)}
                    />
                )}
            </main>
        </div>
    );
}
