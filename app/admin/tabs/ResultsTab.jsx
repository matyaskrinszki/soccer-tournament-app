'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { toLocalDateTimeKey } from '../../../lib/home';

const FILTERS = [
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
    const [filter, setFilter] = useState('awaiting');

    useEffect(() => {
        adminFetch(`/api/admin/matches?seasonId=${season.id}`, {
            errorMessage: 'Hiba a mérkőzések lekérdezésekor',
        })
            .then((data) => setMatches(data.matches || []))
            .catch((err) => notify.error(err.message));
    }, [season.id, notify]);

    // Same comparison as the server: match_date is local time without a time zone
    const nowKey = toLocalDateTimeKey(new Date());

    const visibleMatches = useMemo(() => {
        if (!matches) return [];
        if (filter === 'finished') return matches.filter((m) => m.status === 'finished');
        if (filter === 'awaiting') {
            return matches.filter((m) => m.status === 'upcoming' && m.matchDate <= nowKey);
        }
        return matches;
    }, [matches, filter, nowKey]);

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
                    Ehhez a szezonhoz még nincsenek mérkőzések. Az eredmények a menetrend
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
                            </button>
                        ))}
                    </div>

                    {visibleMatches.length === 0 ? (
                        <p>Nincs a szűrésnek megfelelő mérkőzés.</p>
                    ) : (
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
                                        onSaved={handleSaved}
                                        notify={notify}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </div>
    );
}

function ResultRow({ match, canRecord, onSaved, notify }) {
    const [homeScore, setHomeScore] = useState(match.homeScore ?? '');
    const [awayScore, setAwayScore] = useState(match.awayScore ?? '');
    const [saving, setSaving] = useState(false);

    const isFinished = match.status === 'finished';
    const isUnchanged =
        isFinished &&
        String(homeScore) === String(match.homeScore) &&
        String(awayScore) === String(match.awayScore);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            notify.clear();
            const data = await adminFetch(`/api/admin/matches/${match.id}`, {
                method: 'PUT',
                body: { homeScore, awayScore },
                errorMessage: 'Hiba az eredmény mentésekor',
            });
            onSaved(data.match);
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
                    <button
                        type="submit"
                        form={`result-${match.id}`}
                        className="btn-primary btn-small"
                        disabled={saving || isUnchanged}
                    >
                        {saving ? 'Mentés...' : isFinished ? 'Javítás' : 'Mentés'}
                    </button>
                )}
            </td>
        </tr>
    );
}
