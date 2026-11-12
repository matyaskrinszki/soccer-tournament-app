import Link from 'next/link';
import './PlayerStats.css';

function formatDate(matchDate) {
    return new Date(matchDate).toLocaleString('hu-HU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Goals per season and the current team's matches, for the public and the own
 * profile. `stats` comes from GET /api/players/[id] (lib/player-stats.js).
 */
export default function PlayerStats({ stats, team }) {
    if (!stats) return null;
    const { goalsBySeason, teamSeason, teamMatches } = stats;

    return (
        <>
            <section className="player-card">
                <h2>Gólok szezononként</h2>
                {goalsBySeason.length === 0 ? (
                    <p className="muted">Még nincs rögzített gólja.</p>
                ) : (
                    <div className="table-scroll">
                        <table className="player-stats-table">
                            <thead>
                                <tr>
                                    <th>Szezon</th>
                                    <th>Csapat</th>
                                    <th className="num">Gólok</th>
                                    <th className="num">Gólos meccsek</th>
                                </tr>
                            </thead>
                            <tbody>
                                {goalsBySeason.map((row) => (
                                    <tr key={`${row.seasonId}-${row.teamId}`}>
                                        <td>
                                            {row.seasonName}
                                            {row.isSample && <span className="muted"> (minta)</span>}
                                        </td>
                                        <td>
                                            <Link href={`/teams/${row.teamId}`} className="team-link">{row.teamName}</Link>
                                        </td>
                                        <td className="num">{row.goals}</td>
                                        <td className="num">{row.matchesWithGoal}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {team && (
                <section className="player-card">
                    <h2>A csapat mérkőzései</h2>
                    {!teamSeason ? (
                        <p className="muted">A csapatnak még nincs mérkőzése.</p>
                    ) : (
                        <>
                            <p className="muted">
                                {team.name} · {teamSeason.name}
                                {teamSeason.isSample && ' (minta)'}. Felállítási adat nincs, ezért ez a csapat
                                összes mérkőzése, nem csak azok, amelyeken a játékos pályára lépett.
                            </p>
                            <div className="player-match-list">
                                {teamMatches.map((m) => {
                                    const isHome = m.homeTeamId === team.id;
                                    const opponent = isHome ? m.awayName : m.homeName;
                                    return (
                                        <Link href={`/matches/${m.id}`} key={m.id} className="player-match-row">
                                            <span className="player-match-date">{formatDate(m.matchDate)}</span>
                                            <span>
                                                <span className="muted">{isHome ? 'Otthon' : 'Idegenben'} · </span>
                                                {opponent}
                                            </span>
                                            <span className="player-match-result">
                                                {m.status === 'finished' ? `${m.homeScore} - ${m.awayScore}` : 'Közelgő'}
                                                {m.playerGoals > 0 && (
                                                    <span className="player-match-goals" title="A játékos góljai">
                                                        ⚽ {m.playerGoals}
                                                    </span>
                                                )}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </section>
            )}
        </>
    );
}
