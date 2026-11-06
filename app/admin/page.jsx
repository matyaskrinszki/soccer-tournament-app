'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthContext';
import { adminFetch } from './admin-api';
import OverviewTab from './tabs/OverviewTab';
import SeasonsTab from './tabs/SeasonsTab';
import PitchesTab from './tabs/PitchesTab';
import ScheduleTab from './tabs/ScheduleTab';
import ResultsTab from './tabs/ResultsTab';
import './admin.css';

const TABS = [
    { id: 'overview', label: 'Áttekintés' },
    { id: 'seasons', label: 'Szezonok' },
    { id: 'pitches', label: 'Pályák' },
    { id: 'schedule', label: 'Ütemezés' },
    { id: 'results', label: 'Eredmények' },
];

// Tabs that work on one season show the season picker above their content
const SEASON_TABS = ['pitches', 'schedule', 'results'];

export default function AdminPage() {
    const router = useRouter();
    const { isHydrated, isLoggedIn, isAdmin } = useAuth();

    const [activeTab, setActiveTab] = useState('overview');
    const [message, setMessage] = useState(null); // { type: 'error' | 'success', text }

    const [seasons, setSeasons] = useState([]);
    const [selectedSeasonId, setSelectedSeasonId] = useState(null);
    const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;

    // Passed to the tabs so they all report through the same message card
    const notify = useMemo(
        () => ({
            error: (text) => setMessage({ type: 'error', text }),
            success: (text) => setMessage({ type: 'success', text }),
            clear: () => setMessage(null),
        }),
        [],
    );

    // State is only set in the promise callbacks, never synchronously, so the
    // effect below can call this on mount
    const reloadSeasons = useCallback(
        () =>
            adminFetch('/api/admin/seasons', {
                errorMessage: 'Hiba a szezonok lekérdezésekor',
            }).then(
                (data) => {
                    const fetchedSeasons = data.seasons || [];
                    setSeasons(fetchedSeasons);
                    // Keep the selection if the season still exists, otherwise pick the newest
                    setSelectedSeasonId((previousId) =>
                        fetchedSeasons.some((season) => season.id === previousId)
                            ? previousId
                            : fetchedSeasons[0]?.id ?? null,
                    );
                },
                (err) => notify.error(err.message),
            ),
        [notify],
    );

    // Merge changed fields into one season, e.g. after a status change or publishing
    const updateSeason = useCallback((seasonId, changes) => {
        setSeasons((prev) =>
            prev.map((season) => (season.id === seasonId ? { ...season, ...changes } : season)),
        );
    }, []);

    useEffect(() => {
        if (isAdmin) reloadSeasons();
    }, [isAdmin, reloadSeasons]);

    // Logged-in non-admins are sent back to the home page
    useEffect(() => {
        if (!isHydrated || !isLoggedIn || isAdmin) return;
        const timer = setTimeout(() => router.push('/'), 3000);
        return () => clearTimeout(timer);
    }, [isHydrated, isLoggedIn, isAdmin, router]);

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        setMessage(null);
    };

    if (!isHydrated) {
        return (
            <AdminShell>
                <div className="admin-card">
                    <p>Betöltés...</p>
                </div>
            </AdminShell>
        );
    }

    if (!isLoggedIn) {
        return (
            <AdminShell>
                <div className="admin-card error">
                    <h2>Bejelentkezés szükséges</h2>
                    <p>Az adminisztrációs oldal megtekintéséhez be kell jelentkezned.</p>
                </div>
            </AdminShell>
        );
    }

    if (!isAdmin) {
        return (
            <AdminShell>
                <div className="admin-card error">
                    <h2>Hozzáférés megtagadva</h2>
                    <p>Nincs jogosultságod az oldal megtekintéséhez. Az oldal átirányítása 3 másodperc múlva...</p>
                </div>
            </AdminShell>
        );
    }

    return (
        <AdminShell>
            <div className="admin-header">
                <h1>Szervezés</h1>
                <p className="admin-subtitle">Bajnokság szervezési kezelőpult</p>
            </div>

            {message && (
                <div className={`admin-card ${message.type}`}>
                    <p>{message.text}</p>
                </div>
            )}

            <div className="admin-tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => handleTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {SEASON_TABS.includes(activeTab) && seasons.length > 0 && (
                <div className="season-picker">
                    <label htmlFor="admin-season">Szezon</label>
                    <select
                        id="admin-season"
                        value={selectedSeasonId ?? ''}
                        onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
                    >
                        {seasons.map((season) => (
                            <option key={season.id} value={season.id}>
                                {season.name} ({season.status})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {activeTab === 'overview' && <OverviewTab onOpenTab={handleTabChange} />}

            {activeTab === 'seasons' && (
                <SeasonsTab
                    seasons={seasons}
                    selectedSeason={selectedSeason}
                    onSelectSeason={setSelectedSeasonId}
                    onSeasonsChanged={reloadSeasons}
                    onSeasonUpdated={updateSeason}
                    notify={notify}
                />
            )}

            {SEASON_TABS.includes(activeTab) && !selectedSeason && (
                <div className="admin-card">
                    <p>Még nincs szezon. Hozz létre egyet a Szezonok fülön.</p>
                </div>
            )}

            {/* key: a different season starts the tab with fresh state */}
            {activeTab === 'pitches' && selectedSeason && (
                <PitchesTab key={selectedSeason.id} season={selectedSeason} notify={notify} />
            )}

            {activeTab === 'schedule' && selectedSeason && (
                <ScheduleTab
                    key={selectedSeason.id}
                    season={selectedSeason}
                    onSeasonUpdated={updateSeason}
                    notify={notify}
                />
            )}

            {activeTab === 'results' && selectedSeason && (
                <ResultsTab key={selectedSeason.id} season={selectedSeason} notify={notify} />
            )}
        </AdminShell>
    );
}

function AdminShell({ children }) {
    return (
        <div className="admin-page">
            <main className="admin-container">{children}</main>
        </div>
    );
}
