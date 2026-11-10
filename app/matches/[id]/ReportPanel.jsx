'use client';

import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../../lib/client-auth';

const STATE_TEXT = {
    open: 'Még egyik csapat sem jelentett eredményt.',
    'other-reported':
        'Az ellenfél kapitánya már jelentett eredményt. Ha a két jelentés egyezik, az eredmény automatikusan rögzül.',
    waiting: 'A jelentésed elmentve. Az ellenfél kapitányának jelentésére vár.',
    mismatch:
        'A két jelentés eltér. A szervező dönt a végleges eredményről; addig módosíthatod a jelentésedet.',
};

const OUTCOME_TEXT = {
    waiting: 'Jelentés elmentve. Az ellenfél kapitányának jelentésére vár.',
    finalized: 'A két jelentés egyezik, az eredmény rögzítve.',
    mismatch: 'Jelentés elmentve, de eltér az ellenfél jelentésétől. A szervező dönt.',
};

function toGoalCount(value) {
    const count = Number(value);
    return Number.isInteger(count) && count > 0 ? count : 0;
}

// Goal counts of the own report, keyed by player id
function countsFromReport(report) {
    return Object.fromEntries(
        (report?.scorers ?? []).map((scorer) => [scorer.playerId, String(scorer.goals)]),
    );
}

/**
 * Result report form for the captain of either team. Renders nothing for anyone
 * else, and nothing once the match has a result.
 */
export default function ReportPanel({ match, onFinalized }) {
    const [form, setForm] = useState(null);
    const [homeScore, setHomeScore] = useState('');
    const [awayScore, setAwayScore] = useState('');
    const [counts, setCounts] = useState({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null); // { type: 'error' | 'success', text }

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/matches/${match.id}/report`, { headers: getAuthHeaders() })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled || !data?.isCaptain) return;
                setForm(data);
                setHomeScore(data.report?.homeScore ?? '');
                setAwayScore(data.report?.awayScore ?? '');
                setCounts(countsFromReport(data.report));
            })
            // The panel is optional: without it the page still works
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [match.id]);

    if (!form || form.state === 'finished') return null;

    const { team } = form;
    const isHome = team.id === match.homeTeam.id;
    const ownScoreInput = isHome ? homeScore : awayScore;
    const ownScore = ownScoreInput === '' ? null : Number(ownScoreInput);
    const assigned = team.players.reduce((sum, player) => sum + toGoalCount(counts[player.id]), 0);
    const leftover = ownScore === null ? 0 : ownScore - assigned;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);
        try {
            const scorers = team.players
                .map((player) => ({ playerId: player.id, goals: toGoalCount(counts[player.id]) }))
                .filter((scorer) => scorer.goals > 0);
            const res = await fetch(`/api/matches/${match.id}/report`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ homeScore, awayScore, scorers }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Hiba a jelentés mentésekor');
            }

            if (data.outcome === 'finalized') {
                onFinalized();
                return;
            }
            // outcome is "waiting" or "mismatch", the same as the form states
            setForm((prev) => ({ ...prev, report: data.report, state: data.outcome }));
            setMessage({ type: 'success', text: OUTCOME_TEXT[data.outcome] });
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="match-card report-panel">
            <h3>Eredmény jelentése ({team.name} kapitányaként)</h3>

            {!form.canReport ? (
                <p className="muted">{form.reason}</p>
            ) : (
                <>
                    <p className="muted">{STATE_TEXT[form.state]}</p>

                    {message && <p className={`report-message ${message.type}`}>{message.text}</p>}

                    <form onSubmit={handleSubmit}>
                        <div className="report-score">
                            <label>
                                {match.homeTeam.name}
                                <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    value={homeScore}
                                    onChange={(e) => setHomeScore(e.target.value)}
                                    disabled={saving}
                                    required
                                />
                            </label>
                            <span>-</span>
                            <label>
                                <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    value={awayScore}
                                    onChange={(e) => setAwayScore(e.target.value)}
                                    disabled={saving}
                                    required
                                />
                                {match.awayTeam.name}
                            </label>
                        </div>

                        <h4>{team.name} góllövői</h4>
                        <ul className="report-scorers">
                            {team.players.map((player) => (
                                <li key={player.id}>
                                    <label htmlFor={`report-goals-${player.id}`}>
                                        {player.name || 'Névtelen játékos'}
                                        {player.id === team.captainPlayerId && (
                                            <span className="muted"> (K)</span>
                                        )}
                                    </label>
                                    <input
                                        id={`report-goals-${player.id}`}
                                        type="number"
                                        min="0"
                                        max="99"
                                        placeholder="0"
                                        value={counts[player.id] ?? ''}
                                        onChange={(e) =>
                                            setCounts((prev) => ({ ...prev, [player.id]: e.target.value }))
                                        }
                                        disabled={saving}
                                    />
                                </li>
                            ))}
                        </ul>
                        {ownScore !== null && (
                            <p className={`report-summary ${leftover < 0 ? 'error' : ''}`}>
                                {leftover < 0
                                    ? `Túl sok gól: ${assigned} megadva, a csapat ${ownScore} gólt szerzett`
                                    : leftover > 0
                                      ? `${leftover} gól a kapitányhoz kerül`
                                      : 'Minden gól góllövőhöz rendelve'}
                            </p>
                        )}

                        <button type="submit" className="report-submit" disabled={saving || leftover < 0}>
                            {saving ? 'Mentés...' : form.report ? 'Jelentés módosítása' : 'Eredmény jelentése'}
                        </button>
                    </form>
                </>
            )}
        </section>
    );
}
