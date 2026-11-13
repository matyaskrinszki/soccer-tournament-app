'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { toLocalDateTimeKey } from '../../../lib/home';

const FILTERS = [
    { id: 'mismatches', label: 'Eltérések' },
    { id: 'awaiting', label: 'Eredményre vár' },
    { id: 'finished', label: 'Lejátszott' },
    { id: 'all', label: 'Összes' },
];

function formatKickoff(matchDate) {
    return new Date(matchDate).toLocaleString('hu-HU', {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function ResultsTab({ season, notify }) {
    const [matches, setMatches] = useState(null);
    // Matches whose two captain reports differ, keyed by match id
    const [mismatches, setMismatches] = useState({});
    const [filter, setFilter] = useState('awaiting');

    useEffect(() => {
        adminFetch(`/api/admin/matches?seasonId=${season.id}`, {
            errorMessage: 'Hiba a mérkőzések lekérdezésekor',
        })
            .then((data) => {
                setMatches(data.matches || []);
                const byMatch = Object.fromEntries(
                    (data.mismatches || []).map((item) => [item.matchId, item]),
                );
                setMismatches(byMatch);
                // Open mismatches are the first thing to deal with
                if (Object.keys(byMatch).length > 0) setFilter('mismatches');
            })
            .catch((err) => notify.error(err.message));
    }, [season.id, notify]);

    // Same comparison as the server: match_date is local time without a time zone
    const nowKey = toLocalDateTimeKey(new Date());

    // Recording the result resolves a mismatch, so only upcoming matches count
    const openMismatchIds = useMemo(
        () =>
            new Set(
                (matches ?? [])
                    .filter((m) => m.status === 'upcoming' && mismatches[m.id])
                    .map((m) => m.id),
            ),
        [matches, mismatches],
    );

    const visibleMatches = useMemo(() => {
        if (!matches) return [];
        if (filter === 'mismatches') return matches.filter((m) => openMismatchIds.has(m.id));
        if (filter === 'finished') return matches.filter((m) => m.status === 'finished');
        if (filter === 'awaiting') {
            return matches.filter((m) => m.status === 'upcoming' && m.matchDate <= nowKey);
        }
        return matches;
    }, [matches, filter, nowKey, openMismatchIds]);

    const handleSaved = (saved) => {
        setMatches((prev) => prev.map((m) => (m.id === saved.id ? { ...m, ...saved } : m)));
    };

    if (!matches) {
        return <div className="admin-card"><p>Betöltés...</p></div>;
    }

    return (
        <div className="admin-card">
            <h3>Eredmények rögzítése</h3>

            {matches.length === 0 ? (
                <p>
                    Ehhez a szezonhoz még nincsenek mérkőzések. Az eredmények a sorsolás
                    publikálása után rögzíthetők (Ütemezés fül).
                </p>
            ) : (
                <>
                    <div className="results-filters">
                        {FILTERS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`filter-chip ${filter === item.id ? 'active' : ''}`}
                                onClick={() => setFilter(item.id)}
                            >
                                {item.label}
                                {item.id === 'mismatches' && ` (${openMismatchIds.size})`}
                            </button>
                        ))}
                    </div>

                    {filter === 'mismatches' && visibleMatches.length > 0 && (
                        <p className="results-hint">
                            Ezeknél a mérkőzéseknél a két kapitány jelentése eltér. Rögzítsd a
                            végleges eredményt a szokásos módon, ezzel az eltérés megszűnik.
                        </p>
                    )}

                    {visibleMatches.length === 0 ? (
                        <p>
                            {filter === 'mismatches'
                                ? 'Nincs nyitott eltérés.'
                                : 'Nincs a szűrésnek megfelelő mérkőzés.'}
                        </p>
                    ) : (
                        <div className="table-scroll">
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        <th>Időpont</th>
                                        <th>Liga</th>
                                        <th>Hazai</th>
                                        <th>Eredmény</th>
                                        <th>Vendég</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleMatches.map((match) => (
                                        <ResultRow
                                            key={match.id}
                                            match={match}
                                            canRecord={match.matchDate <= nowKey}
                                            mismatch={
                                                openMismatchIds.has(match.id)
                                                    ? mismatches[match.id]
                                                    : null
                                            }
                                            onSaved={handleSaved}
                                            notify={notify}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

const countKey = (teamId, playerId) => `${teamId}:${playerId}`;

// Goal counts per player as recorded in the database, keyed by countKey
function countsFromDetails(details) {
    const counts = {};
    for (const team of [details.homeTeam, details.awayTeam]) {
        for (const player of team.players) {
            counts[countKey(team.id, player.id)] = player.goals > 0 ? String(player.goals) : '';
        }
    }
    return counts;
}

function toGoalCount(value) {
    const count = Number(value);
    return Number.isInteger(count) && count > 0 ? count : 0;
}

function ResultRow({ match, canRecord, mismatch, onSaved, notify }) {
    const [homeScore, setHomeScore] = useState(match.homeScore ?? '');
    const [awayScore, setAwayScore] = useState(match.awayScore ?? '');
    const [saving, setSaving] = useState(false);
    const [scorersOpen, setScorersOpen] = useState(false);
    // Possible scorers and recorded goals, loaded when first needed
    const [details, setDetails] = useState(null);
    const [counts, setCounts] = useState({});

    const isFinished = match.status === 'finished';
    const scorersChanged =
        details !== null &&
        Object.entries(countsFromDetails(details)).some(
            ([key, value]) => toGoalCount(value) !== toGoalCount(counts[key]),
        );
    const isUnchanged =
        isFinished &&
        String(homeScore) === String(match.homeScore) &&
        String(awayScore) === String(match.awayScore) &&
        !scorersChanged;

    const sides = details
        ? [
              { team: details.homeTeam, score: homeScore },
              { team: details.awayTeam, score: awayScore },
          ].map(({ team, score }) => ({
              team,
              score: score === '' ? null : Number(score),
              assigned: team.players.reduce(
                  (sum, player) => sum + toGoalCount(counts[countKey(team.id, player.id)]),
                  0,
              ),
          }))
        : [];
    const tooManyScorers = sides.some((side) => side.score !== null && side.assigned > side.score);

    const loadDetails = async () => {
        const data = await adminFetch(`/api/admin/matches/${match.id}`, {
            errorMessage: 'Hiba a góllövők lekérdezésekor',
        });
        setDetails(data.match);
        setCounts(countsFromDetails(data.match));
        return data.match;
    };

    const toggleScorers = async () => {
        if (scorersOpen) {
            setScorersOpen(false);
            return;
        }
        try {
            if (!details) await loadDetails();
            setScorersOpen(true);
        } catch (err) {
            notify.error(err.message);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            notify.clear();

            // Without opening the editor, the recorded scorers are kept
            const loaded = details ?? (await loadDetails());
            const currentCounts = details ? counts : countsFromDetails(loaded);
            const scorers = [loaded.homeTeam, loaded.awayTeam].flatMap((team) =>
                team.players
                    .map((player) => ({
                        teamId: team.id,
                        playerId: player.id,
                        goals: toGoalCount(currentCounts[countKey(team.id, player.id)]),
                    }))
                    .filter((scorer) => scorer.goals > 0),
            );

            const data = await adminFetch(`/api/admin/matches/${match.id}`, {
                method: 'PUT',
                body: { homeScore, awayScore, scorers },
                errorMessage: 'Hiba az eredmény mentésekor',
            });
            onSaved(data.match);
            // Show the stored scorers
            await loadDetails();
            notify.success(
                `Eredmény mentve: ${match.homeTeamName} ${data.match.homeScore} - ${data.match.awayScore} ${match.awayTeamName}`,
            );
        } catch (err) {
            notify.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <tr>
                <td>
                    <Link href={`/matches/${match.id}`}>{formatKickoff(match.matchDate)}</Link>
                </td>
                <td>{match.leagueName || '-'}</td>
                <td className="team-cell">{match.homeTeamName}</td>
                <td>
                    {canRecord ? (
                        <form className="score-form" id={`result-${match.id}`} onSubmit={handleSave}>
                            <input
                                type="number"
                                min="0"
                                max="99"
                                aria-label={`${match.homeTeamName} góljai`}
                                value={homeScore}
                                onChange={(e) => setHomeScore(e.target.value)}
                                disabled={saving}
                                required
                            />
                            <span>-</span>
                            <input
                                type="number"
                                min="0"
                                max="99"
                                aria-label={`${match.awayTeamName} góljai`}
                                value={awayScore}
                                onChange={(e) => setAwayScore(e.target.value)}
                                disabled={saving}
                                required
                            />
                        </form>
                    ) : (
                        <span className="score-pending">még nem játszották</span>
                    )}
                </td>
                <td className="team-cell">{match.awayTeamName}</td>
                <td>
                    {canRecord && (
                        <div className="result-actions">
                            <button
                                type="button"
                                className="btn-secondary btn-small"
                                onClick={toggleScorers}
                                aria-expanded={scorersOpen}
                                disabled={saving}
                            >
                                Góllövők
                            </button>
                            <button
                                type="submit"
                                form={`result-${match.id}`}
                                className="btn-primary btn-small"
                                disabled={saving || isUnchanged || tooManyScorers}
                            >
                                {saving ? 'Mentés...' : isFinished ? 'Javítás' : 'Mentés'}
                            </button>
                        </div>
                    )}
                </td>
            </tr>
            {mismatch && (
                <tr className="reports-row">
                    <td colSpan={6}>
                        <div className="reports-grid">
                            <CaptainReport
                                title={`${match.homeTeamName} kapitánya`}
                                report={mismatch.home}
                                match={match}
                            />
                            <CaptainReport
                                title={`${match.awayTeamName} kapitánya`}
                                report={mismatch.away}
                                match={match}
                            />
                        </div>
                        {mismatch.scoresAgree && (
                            <p className="scorers-summary error">
                                A két jelentés eredménye egyezik, de nem lehetett automatikusan
                                rögzíteni (pl. egy megadott góllövő azóta elhagyta a csapatot).
                            </p>
                        )}
                    </td>
                </tr>
            )}
            {scorersOpen && details && (
                <tr className="scorers-row">
                    <td colSpan={6}>
                        <div className="scorers-grid">
                            {sides.map((side) => (
                                <ScorerList
                                    key={side.team.id}
                                    side={side}
                                    counts={counts}
                                    disabled={saving}
                                    onChange={(key, value) =>
                                        setCounts((prev) => ({ ...prev, [key]: value }))
                                    }
                                />
                            ))}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// One captain's report in the mismatch list. Captains only report their own
// team's scorers; goals without a scorer are recorded with an unknown scorer.
function CaptainReport({ title, report, match }) {
    const ownScore = report.teamId === match.homeTeamId ? report.homeScore : report.awayScore;
    const assigned = report.scorers.reduce((sum, scorer) => sum + scorer.goals, 0);

    return (
        <div className="captain-report">
            <h4>{title}</h4>
            <p className="report-score">
                {match.homeTeamName} {report.homeScore} - {report.awayScore} {match.awayTeamName}
            </p>
            {report.scorers.length > 0 && (
                <ul>
                    {report.scorers.map((scorer) => (
                        <li key={scorer.playerId}>
                            {scorer.playerName || 'Névtelen játékos'}
                            {scorer.goals > 1 && ` ×${scorer.goals}`}
                        </li>
                    ))}
                </ul>
            )}
            {ownScore > assigned && (
                <p className="score-pending">
                    {ownScore - assigned} gól ismeretlen góllövővel
                </p>
            )}
            <p className="score-pending">
                Jelentette: {report.reportedBy.name || 'ismeretlen'} ·{' '}
                {formatReportedAt(report.updatedAt)}
            </p>
        </div>
    );
}

// updated_at is SQLite's CURRENT_TIMESTAMP: UTC, without a time zone
function formatReportedAt(updatedAt) {
    return new Date(`${updatedAt.replace(' ', 'T')}Z`).toLocaleString('hu-HU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function ScorerList({ side, counts, disabled, onChange }) {
    const { team, score, assigned } = side;
    const leftover = score === null ? 0 : score - assigned;

    let summary;
    let isError = false;
    if (leftover < 0) {
        summary = `Túl sok gól: ${assigned} megadva, a csapat ${score} gólt szerzett`;
        isError = true;
    } else if (leftover > 0) {
        summary = `${leftover} gól ismeretlen góllövővel kerül rögzítésre (pl. öngól)`;
    } else {
        summary = 'Minden gól góllövőhöz rendelve';
    }

    return (
        <div className="scorers-team">
            <h4>{team.name}</h4>
            {team.players.length === 0 ? (
                <p className="score-pending">Nincs játékos a csapatban</p>
            ) : (
                <ul>
                    {team.players.map((player) => {
                        const key = countKey(team.id, player.id);
                        return (
                            <li key={player.id}>
                                <label htmlFor={`goals-${key}`}>
                                    {player.name || 'Névtelen játékos'}
                                    {player.id === team.captainPlayerId && (
                                        <span className="captain-mark"> (K)</span>
                                    )}
                                </label>
                                <input
                                    id={`goals-${key}`}
                                    type="number"
                                    min="0"
                                    max="99"
                                    placeholder="0"
                                    value={counts[key] ?? ''}
                                    onChange={(e) => onChange(key, e.target.value)}
                                    disabled={disabled}
                                />
                            </li>
                        );
                    })}
                </ul>
            )}
            {score !== null && (
                <p className={`scorers-summary ${isError ? 'error' : ''}`}>{summary}</p>
            )}
        </div>
    );
}
