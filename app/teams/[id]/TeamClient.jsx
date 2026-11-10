'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '../../../lib/client-auth';
import { toLocalDateTimeKey } from '../../../lib/home';
import { useAuth } from '../../components/AuthContext';
import { SampleBadge } from '../../components/SeasonPicker';
import SeasonRegistration from './SeasonRegistration';

export default function TeamClient({ id }) {
    const [team, setTeam] = useState(null);
    // The team's table row and the season it is from; null if it has no matches yet
    const [standing, setStanding] = useState(null);
    const [standingSeason, setStandingSeason] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [upcomingMatches, setUpcomingMatches] = useState([]);
    const [previousMatches, setPreviousMatches] = useState([]);
    const [players, setPlayers] = useState([]);
    const [contentView, setContentView] = useState('matches'); // 'matches' or 'players'
    const [matchView, setMatchView] = useState('upcoming'); // 'upcoming' or 'previous'
    const { playerId: currentPlayerId } = useAuth();
    const [teamApplications, setTeamApplications] = useState([]);
    const [isTeamCaptain, setIsTeamCaptain] = useState(false);
    const [processingApplicationId, setProcessingApplicationId] = useState(null);
    const [kickingPlayerId, setKickingPlayerId] = useState(null);

    useEffect(() => {
        if (!id) return; // wait until id prop is available

        const fetchTeam = async () => {
            try {
                setError('');
                setLoading(true);
                const response = await fetch(`/api/teams/${id}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Hiba történt a csapat betöltésekor');
                }

                setTeam(data.team);
                setStanding(data.standing ?? null);
                setStandingSeason(data.season ?? null);
                setUpcomingMatches(data.upcomingMatches ?? []);
                setPreviousMatches(data.previousMatches ?? []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        const fetchPlayers = async () => {
            try {
                const response = await fetch(`/api/players`);
                const data = await response.json();
                if (response.ok) {
                    const teamPlayers = (data.players || []).filter(p => p.team?.id === parseInt(id));
                    setPlayers(teamPlayers);
                }
            } catch (err) {
                // ignore
            }
        };

        fetchTeam();
        fetchPlayers();
    }, [id]);

    useEffect(() => {
        if (!team || !currentPlayerId) {
            setIsTeamCaptain(false);
            setTeamApplications([]);
            return;
        }

        const captain = Number(team.captainPlayerId) === Number(currentPlayerId);
        setIsTeamCaptain(captain);
        if (!captain) {
            setTeamApplications([]);
            return;
        }

        const fetchApplications = async () => {
            try {
                const res = await fetch(`/api/player-requests?playerId=${currentPlayerId}`, {
                    headers: getAuthHeaders(),
                });
                if (!res.ok) {
                    setTeamApplications([]);
                    return;
                }

                const data = await res.json();
                setTeamApplications(data?.teamApplications || []);
            } catch (err) {
                setTeamApplications([]);
            }
        };

        fetchApplications();
    }, [team, currentPlayerId]);

    const handleJoinRequestResponse = async (requestId, action) => {
        setProcessingApplicationId(requestId);
        setError('');
        try {
            const res = await fetch(`/api/join-requests/${requestId}`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ action }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Nem sikerült a kérelem feldolgozása');
            }

            const requestsRes = await fetch(`/api/player-requests?playerId=${currentPlayerId}`, {
                headers: getAuthHeaders(),
            });
            const requestsData = await requestsRes.json();
            if (requestsRes.ok) {
                setTeamApplications(requestsData?.teamApplications || []);
            }

            const playersRes = await fetch('/api/players');
            const playersData = await playersRes.json();
            if (playersRes.ok) {
                const teamPlayers = (playersData.players || []).filter(p => p.team?.id === parseInt(id));
                setPlayers(teamPlayers);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setProcessingApplicationId(null);
        }
    };

    const handleKickPlayer = async (playerId) => {
        if (!id) return;
        setKickingPlayerId(playerId);
        setError('');

        try {
            const res = await fetch(`/api/teams/${id}/kick`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ playerId }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Nem sikerült eltávolítani a játékost');
            }

            setPlayers((prev) => prev.filter((p) => Number(p.id) !== Number(playerId)));
        } catch (err) {
            setError(err.message);
        } finally {
            setKickingPlayerId(null);
        }
    };

    // Kicked-off matches without a result can be reported by the captain; the same
    // comparison as the server, match_date is local time without a time zone
    const nowKey = toLocalDateTimeKey(new Date());

    return (
        <div className="team-page">
            <main className="team-container">
                <div className="team-breadcrumb">
                    <Link href="/tabella">Vissza a táblához</Link>
                    {team && (
                        <span className="crumb">
                            {team.league.country} • {team.league.name}
                        </span>
                    )}
                </div>

                {loading && (
                    <div className="team-card">
                        <p>Csapat betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="team-card error">
                        <p>{error}</p>
                    </div>
                )}

                {team && !loading && !error && (
                    <>
                        <section className="team-card">
                            <div className="team-header">
                                <div>
                                    <p className="eyebrow">{team.league.country}</p>
                                    <h1>{team.name}</h1>
                                    <p className="subhead">{team.league.name}</p>
                                </div>
                                <div className="points-pill">
                                    <span>Pont</span>
                                    <strong>{standing?.points ?? 0}</strong>
                                </div>
                            </div>

                            <p className="standing-season">
                                {standing && standingSeason ? (
                                    <>
                                        {standingSeason.name} • {standing.position}. hely
                                        {standingSeason.isSample && <SampleBadge />}
                                    </>
                                ) : (
                                    'Még nem játszott mérkőzést.'
                                )}
                            </p>

                            <div className="team-stats-grid">
                                <div className="stat-box">
                                    <p className="label">Mérkőzések</p>
                                    <p className="value">{standing?.played ?? 0}</p>
                                </div>
                                <div className="stat-box">
                                    <p className="label">Győzelem</p>
                                    <p className="value">{standing?.wins ?? 0}</p>
                                </div>
                                <div className="stat-box">
                                    <p className="label">Döntetlen</p>
                                    <p className="value">{standing?.draws ?? 0}</p>
                                </div>
                                <div className="stat-box">
                                    <p className="label">Vereség</p>
                                    <p className="value">{standing?.losses ?? 0}</p>
                                </div>
                                <div className="stat-box">
                                    <p className="label">Gólarány</p>
                                    <p className="value">{standing?.goalsFor ?? 0}:{standing?.goalsAgainst ?? 0}</p>
                                </div>
                            </div>
                        </section>

                        {isTeamCaptain && <SeasonRegistration teamId={id} />}

                        <section className="team-card">
                            <div className="section-head">
                                <div className="match-toggle">
                                    <button
                                        className={`toggle-btn ${contentView === 'matches' ? 'active' : ''}`}
                                        onClick={() => setContentView('matches')}
                                    >
                                        Mérkőzések
                                    </button>
                                    <button
                                        className={`toggle-btn ${contentView === 'players' ? 'active' : ''}`}
                                        onClick={() => setContentView('players')}
                                    >
                                        Játékosok
                                    </button>
                                </div>
                                {contentView === 'matches' && (
                                    <div className="match-toggle">
                                        <button
                                            className={`toggle-btn ${matchView === 'upcoming' ? 'active' : ''}`}
                                            onClick={() => setMatchView('upcoming')}
                                        >
                                            Közelgő
                                        </button>
                                        <button
                                            className={`toggle-btn ${matchView === 'previous' ? 'active' : ''}`}
                                            onClick={() => setMatchView('previous')}
                                        >
                                            Korábbi
                                        </button>
                                    </div>
                                )}
                            </div>

                            {contentView === 'matches' && (
                                matchView === 'upcoming' ? (
                                    upcomingMatches.length === 0 ? (
                                        <p className="muted">Nincsenek közelgő mérkőzések.</p>
                                    ) : (
                                        <div className="upcoming-list">
                                            {upcomingMatches.map((m) => {
                                                const isHome = m.homeTeamId === team.id;
                                                const opponent = isHome ? m.awayName : m.homeName;
                                                const date = new Date(m.matchDate);
                                                const formatted = date.toLocaleString('hu-HU', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });

                                                return (
                                                    <Link href={`/matches/${m.id}`} key={m.id} className="match-row">
                                                        <div className="match-date">{formatted}</div>
                                                        <div className="match-vs">
                                                            <span className="home-away">{isHome ? 'Otthon' : 'Idegenben'}</span>
                                                            <span className="opponent">{opponent}</span>
                                                            {/* The form is on the match page */}
                                                            {isTeamCaptain && m.matchDate <= nowKey && (
                                                                <span className="report-tag">Eredmény jelentése →</span>
                                                            )}
                                                        </div>
                                                        <div className="match-league">{m.leagueName}</div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )
                                ) : (
                                    previousMatches.length === 0 ? (
                                        <p className="muted">Nincsenek korábbi mérkőzések.</p>
                                    ) : (
                                        <div className="upcoming-list">
                                            {previousMatches.map((m) => {
                                                const isHome = m.homeTeamId === team.id;
                                                const opponent = isHome ? m.awayName : m.homeName;
                                                const date = new Date(m.matchDate);
                                                const formatted = date.toLocaleString('hu-HU', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });
                                                const result = `${m.homeScore} - ${m.awayScore}`;

                                                return (
                                                    <Link href={`/matches/${m.id}`} key={m.id} className="match-row">
                                                        <div className="match-date">{formatted}</div>
                                                        <div className="match-vs">
                                                            <span className="home-away">{isHome ? 'Otthon' : 'Idegenben'}</span>
                                                            <span className="opponent">{opponent}</span>
                                                            <span className="result">{result}</span>
                                                        </div>
                                                        <div className="match-league">{m.leagueName}</div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )
                                )
                            )}

                            {contentView === 'players' && (
                                players.length === 0 ? (
                                    <p className="muted">Nincsenek játékosok ebben a csapatban.</p>
                                ) : (
                                    <div className="players-grid">
                                        {players.map((player) => (
                                            <div key={player.id} className="player-mini-card-wrapper">
                                                <Link href={`/players/${player.id}`} className="player-card-link">
                                                    <div className="player-mini-card">
                                                        <h3>{player.name || "Nincs név"}</h3>
                                                    </div>
                                                </Link>
                                                {isTeamCaptain && Number(player.id) !== Number(team.captainPlayerId) && (
                                                    <button
                                                        type="button"
                                                        className="kick-player-btn"
                                                        onClick={() => handleKickPlayer(player.id)}
                                                        disabled={kickingPlayerId === player.id}
                                                    >
                                                        {kickingPlayerId === player.id ? 'Eltávolítás...' : 'Játékos kirakása'}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}

                            {isTeamCaptain && (
                                <div className="captain-management">
                                    <h3>Csatlakozási kérelmek</h3>
                                    {teamApplications.length === 0 ? (
                                        <p className="muted">Nincs függőben lévő csatlakozási kérelem.</p>
                                    ) : (
                                        <div className="applications-list">
                                            {teamApplications.map((application) => (
                                                <div key={application.id} className="application-item">
                                                    <div className="application-info">
                                                        <p className="application-name">{application.playerName || application.playerEmail}</p>
                                                        <p className="application-email">{application.playerEmail}</p>
                                                    </div>
                                                    <div className="application-actions">
                                                        <button
                                                            type="button"
                                                            className="toggle-btn active"
                                                            onClick={() => handleJoinRequestResponse(application.id, 'accept')}
                                                            disabled={processingApplicationId === application.id}
                                                        >
                                                            {processingApplicationId === application.id ? 'Feldolgozás...' : 'Elfogad'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="toggle-btn"
                                                            onClick={() => handleJoinRequestResponse(application.id, 'reject')}
                                                            disabled={processingApplicationId === application.id}
                                                        >
                                                            Elutasít
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}
