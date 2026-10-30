'use client';

import './schedule.css';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';

const STATUS_LABELS = {
    generated: 'Tervezet',
    active: 'Folyamatban',
    completed: 'Lezárva',
};

// slot_date is "YYYY-MM-DD". Build the Date from its parts so it stays local
// time; new Date("2026-11-03") would be parsed as UTC midnight.
function formatDate(slotDate) {
    if (!slotDate) return 'Dátum nélkül';
    const [y, m, d] = slotDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    });
}

// useSearchParams() needs a Suspense boundary in the App Router, so the
// default export only wraps the real page component.
export default function SchedulePage() {
    return (
        <Suspense fallback={null}>
            <SchedulePageContent />
        </Suspense>
    );
}

function SchedulePageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        if (typeof window === 'undefined') return false;
        return Boolean(localStorage.getItem('token') && localStorage.getItem('email'));
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

    const handleAuthSuccess = (email, _token, info) => {
        setShowAuthModal(false);
        if (info) return;
        setIsLoggedIn(true);
        setUserEmail(email);
    };

    // The URL is the single source of truth for the selected season.
    const seasonId = searchParams.get('seasonId');
    const [data, setData] = useState({ seasons: [], season: null, leagues: [] });
    const [leagueFilter, setLeagueFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const fetchSchedule = async () => {
            setLoading(true);
            setError('');
            try {
                const query = seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : '';
                const res = await fetch(`/api/schedule${query}`);
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json.error || 'Hiba történt a menetrend betöltésekor');
                }
                if (!cancelled) {
                    setData(json);
                    setLeagueFilter('all');
                }
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchSchedule();
        return () => {
            cancelled = true;
        };
    }, [seasonId]);

    const handleSeasonChange = (event) => {
        // Changing the URL updates searchParams, which re-runs the fetch effect.
        router.replace(`/schedule?seasonId=${event.target.value}`, { scroll: false });
    };

    // All visible matches grouped by date, in date order (the API already sorts them).
    const days = useMemo(() => {
        const visibleLeagues = data.leagues.filter(
            (league) => leagueFilter === 'all' || league.leagueId === leagueFilter,
        );
        const matches = visibleLeagues
            .flatMap((league) =>
                league.matches.map((match) => ({ ...match, leagueName: league.leagueName })),
            )
            .sort((a, b) =>
                (a.slotDate ?? '').localeCompare(b.slotDate ?? '') ||
                (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
                (a.pitchName ?? '').localeCompare(b.pitchName ?? ''),
            );

        const groups = [];
        for (const match of matches) {
            const last = groups[groups.length - 1];
            if (last && last.date === match.slotDate) {
                last.matches.push(match);
            } else {
                groups.push({ date: match.slotDate, matches: [match] });
            }
        }
        return groups;
    }, [data.leagues, leagueFilter]);

    const { seasons, season, leagues } = data;
    const showLeagueColumn = leagueFilter === 'all' && leagues.length > 1;

    return (
        <div className="schedule-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <div className="schedule-app">
                <header className="schedule-header">
                    <p className="eyebrow">Menetrend</p>
                    <h1>Mérkőzések időpontjai</h1>
                    <p className="subhead">A szezon generált menetrendje dátum szerint.</p>
                </header>

                {loading ? (
                    <p className="schedule-message">Menetrend betöltése...</p>
                ) : error ? (
                    <p className="schedule-message schedule-error">{error}</p>
                ) : !season ? (
                    <p className="schedule-message">Még nincs nyilvános menetrend.</p>
                ) : (
                    <>
                        <div className="schedule-controls">
                            <label>
                                Szezon
                                <select value={season.id} onChange={handleSeasonChange}>
                                    {seasons.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({STATUS_LABELS[s.status] ?? s.status})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {leagues.length > 1 && (
                                <label>
                                    Liga
                                    <select
                                        value={leagueFilter}
                                        onChange={(e) => setLeagueFilter(e.target.value)}
                                    >
                                        <option value="all">Minden liga</option>
                                        {leagues.map((league) => (
                                            <option key={league.leagueId} value={league.leagueId}>
                                                {league.leagueName ?? league.leagueId}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                        </div>

                        {season.status === 'generated' && (
                            <p className="schedule-note">
                                Ez a menetrend még tervezet, az időpontok változhatnak.
                            </p>
                        )}

                        {leagues.length === 0 ? (
                            <p className="schedule-message">Ehhez a szezonhoz még nem készült menetrend.</p>
                        ) : (
                            <>
                                <div className="league-scores">
                                    {leagues
                                        .filter((l) => leagueFilter === 'all' || l.leagueId === leagueFilter)
                                        .map((league) => (
                                            <div key={league.id} className="league-score">
                                                <span className="league-score-name">
                                                    {league.leagueName ?? league.leagueId}
                                                </span>
                                                <span className="league-score-value">
                                                    {league.matches.length} mérkőzés · elégedettség {league.algorithmScore}%
                                                </span>
                                            </div>
                                        ))}
                                </div>

                                {days.map((day) => (
                                    <section key={day.date ?? 'no-date'} className="schedule-day">
                                        <h2>{formatDate(day.date)}</h2>
                                        <ul className="match-list">
                                            {day.matches.map((match) => (
                                                <li key={match.id} className="match-row">
                                                    <span className="match-time">
                                                        {match.startTime}–{match.endTime}
                                                    </span>
                                                    <span className="match-teams">
                                                        <Link href={`/teams/${match.homeTeamId}`}>
                                                            {match.homeTeamName}
                                                        </Link>
                                                        <span className="match-vs">–</span>
                                                        <Link href={`/teams/${match.awayTeamId}`}>
                                                            {match.awayTeamName}
                                                        </Link>
                                                    </span>
                                                    <span className="match-meta">
                                                        {match.pitchName}
                                                        {showLeagueColumn && ` · ${match.leagueName}`}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>

            {showAuthModal && (
                <AuthModal
                    mode={authMode}
                    onClose={() => setShowAuthModal(false)}
                    onSuccess={handleAuthSuccess}
                />
            )}
        </div>
    );
}
