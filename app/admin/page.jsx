'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';
import { getAuthHeaders } from '../../lib/client-auth';
import './admin.css';

export default function AdminPage() {
    const router = useRouter();
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
    const [userRole, setUserRole] = useState(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authMode, setAuthMode] = useState('login');

    // Tabs
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedSeason, setSelectedSeason] = useState(null);

    // Data
    const [stats, setStats] = useState({ totalPlayers: 0, totalTeams: 0, totalMatches: 0 });
    const [seasons, setSeasons] = useState([]);
    const [pitches, setPitches] = useState([]);
    const [timeSlots, setTimeSlots] = useState([]);
    const [schedules, setSchedules] = useState([]);

    // Form states
    const [seasonForm, setSeasonForm] = useState({ name: '', startDate: '', endDate: '' });
    const [pitchForm, setPitchForm] = useState({ name: '', location: '' });
    const [scheduling, setScheduling] = useState(false);
    const [autoGeneratingSlots, setAutoGeneratingSlots] = useState(false);
    const [clearingSeasonDates, setClearingSeasonDates] = useState(false);
    const [updatingSeasonStatusId, setUpdatingSeasonStatusId] = useState(null);

    // Dev/demo: seeding test preferences
    const [leagues, setLeagues] = useState([]);
    const [seedLeagueId, setSeedLeagueId] = useState('all');
    const [seedingPreferences, setSeedingPreferences] = useState(false);

    const selectedSeasonDetails = seasons.find(
        (season) => String(season.id) === String(selectedSeason),
    );

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

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (!isHydrated) return;

        const role = localStorage.getItem('role');
        setUserRole(role);

        if (role !== 'Admin') {
            setError('Nincs jogosultságod az oldal megtekintéséhez');
            setTimeout(() => {
                router.push('/');
            }, 3000);
        }
    }, [isHydrated, router]);

    useEffect(() => {
        const fetchStats = async () => {
            if (!isHydrated || userRole !== 'Admin') return;

            try {
                setLoading(true);
                setError('');

                const [playersRes, teamsRes, matchesRes] = await Promise.all([
                    fetch('/api/players'),
                    fetch('/api/teams-list'),
                    fetch('/api/matches'),
                ]);

                if (!playersRes.ok || !teamsRes.ok || !matchesRes.ok) {
                    throw new Error('Hiba az adatok betöltésekor');
                }

                const playersData = await playersRes.json();
                const teamsData = await teamsRes.json();
                const matchesData = await matchesRes.json();

                setStats({
                    totalPlayers: (playersData.players || []).length,
                    totalTeams: (teamsData.teams || []).length,
                    totalMatches: (matchesData.matches || []).length,
                });
            } catch (err) {
                console.error('Admin data fetch error:', err);
                setError(`Hiba az adatok betöltésekor: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };

        if (isHydrated) {
            fetchStats();
        }
    }, [isHydrated, userRole]);

    useEffect(() => {
        if (!isHydrated || !['seasons', 'pitches', 'schedule'].includes(activeTab)) return;

        const fetchSeasons = async () => {
            try {
                const res = await fetch('/api/admin/seasons', {
                    headers: getAuthHeaders(),
                });
                if (!res.ok) throw new Error('Hiba a szezonok lekérdezésekor');
                const data = await res.json();
                const fetchedSeasons = data.seasons || [];
                setSeasons(fetchedSeasons);

                if (fetchedSeasons.length === 0) {
                    setSelectedSeason(null);
                    return;
                }

                setSelectedSeason((previousSeasonId) => {
                    const stillExists = fetchedSeasons.some(
                        (season) => season.id === previousSeasonId,
                    );
                    return stillExists
                        ? previousSeasonId
                        : fetchedSeasons[0].id;
                });
            } catch (err) {
                console.error('Seasons fetch error:', err);
            }
        };

        fetchSeasons();
    }, [isHydrated, activeTab]);

    // Leagues for the test-preference seeding dropdown (seasons tab only)
    useEffect(() => {
        if (!isHydrated || activeTab !== 'seasons') return;

        const fetchLeagues = async () => {
            try {
                const res = await fetch('/api/leagues');
                if (!res.ok) throw new Error('Hiba a ligák lekérdezésekor');
                const data = await res.json();
                setLeagues(data.leagues || []);
            } catch (err) {
                console.error('Leagues fetch error:', err);
            }
        };

        fetchLeagues();
    }, [isHydrated, activeTab]);

    useEffect(() => {
        if (!isHydrated || !selectedSeason || !['pitches', 'schedule'].includes(activeTab)) return;

        const fetchPitchesAndSlots = async () => {
            try {
                const [pitchesRes, slotsRes, schedulesRes] = await Promise.all([
                    fetch(`/api/admin/pitches?seasonId=${selectedSeason}`, { headers: getAuthHeaders() }),
                    fetch(`/api/admin/time-slots?seasonId=${selectedSeason}`, { headers: getAuthHeaders() }),
                    fetch(`/api/admin/generate-schedule?seasonId=${selectedSeason}`, { headers: getAuthHeaders() }),
                ]);

                if (pitchesRes.ok) {
                    const data = await pitchesRes.json();
                    setPitches(data.pitches || []);
                }
                if (slotsRes.ok) {
                    const data = await slotsRes.json();
                    setTimeSlots(data.timeSlots || []);
                }
                if (schedulesRes.ok) {
                    const data = await schedulesRes.json();
                    setSchedules(data.schedules || []);
                }
            } catch (err) {
                console.error('Pitches/slots fetch error:', err);
            }
        };

        fetchPitchesAndSlots();
    }, [isHydrated, selectedSeason, activeTab]);

    const handleCreateSeason = async () => {
        if (!seasonForm.name) {
            setError('Szezon név szükséges');
            return;
        }

        try {
            const res = await fetch('/api/admin/seasons', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: seasonForm.name,
                    startDate: seasonForm.startDate,
                    endDate: seasonForm.endDate,
                }),
            });

            if (!res.ok) throw new Error('Hiba a szezon létrehozásakor');
            
            setSeasonForm({ name: '', startDate: '', endDate: '' });
            // Refresh seasons
            const refreshRes = await fetch('/api/admin/seasons', {
                headers: getAuthHeaders(),
            });
            if (refreshRes.ok) {
                const data = await refreshRes.json();
                setSeasons(data.seasons || []);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const handleAddPitch = async () => {
        if (!pitchForm.name || !selectedSeason) {
            setError('Pálya név szükséges');
            return;
        }

        try {
            const res = await fetch('/api/admin/pitches', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    seasonId: selectedSeason,
                    name: pitchForm.name,
                    location: pitchForm.location,
                }),
            });

            if (!res.ok) throw new Error('Hiba a pálya hozzáadásakor');
            
            setPitchForm({ name: '', location: '' });
            // Refresh pitches
            const refreshRes = await fetch(`/api/admin/pitches?seasonId=${selectedSeason}`, {
                headers: getAuthHeaders(),
            });
            if (refreshRes.ok) {
                const data = await refreshRes.json();
                setPitches(data.pitches || []);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const handleAutoGenerateTimeSlots = async () => {
        if (!selectedSeason) {
            setError('Szezon kiválasztása szükséges az automatikus generáláshoz');
            return;
        }

        const season = seasons.find(
            (item) => String(item.id) === String(selectedSeason),
        );

        if (!season?.start_date || !season?.end_date) {
            setError('A kiválasztott szezonhoz kezdő és záró dátum beállítása szükséges');
            return;
        }

        try {
            setAutoGeneratingSlots(true);
            setError('');

            const res = await fetch('/api/admin/time-slots/generate', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    seasonId: selectedSeason,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Hiba az automatikus időpont generálás során');
            }

            const refreshRes = await fetch(`/api/admin/time-slots?seasonId=${selectedSeason}`, {
                headers: getAuthHeaders(),
            });
            if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                setTimeSlots(refreshData.timeSlots || []);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setAutoGeneratingSlots(false);
        }
    };

    const handleDeleteTimeSlot = async (timeSlotId) => {
        try {
            setError('');
            setSuccess('');
            const res = await fetch('/api/admin/time-slots', {
                method: 'DELETE',
                headers: getAuthHeaders(),
                body: JSON.stringify({ timeSlotId }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Hiba az időpont törlésekor');
            }

            setTimeSlots((prev) => prev.filter((slot) => slot.id !== timeSlotId));
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDeleteSeasonDates = async () => {
        if (!selectedSeason) {
            setError('Szezon kiválasztása szükséges');
            return;
        }

        const seasonName = selectedSeasonDetails?.name || 'kiválasztott szezon';
        const confirmed = window.confirm(
            `Biztosan törölni szeretnéd a ${seasonName} szezon összes dátumát/időpontját? Ez visszafordíthatatlan művelet.`,
        );

        if (!confirmed) {
            return;
        }

        try {
            setClearingSeasonDates(true);
            setError('');
            setSuccess('');

            const res = await fetch('/api/admin/time-slots', {
                method: 'DELETE',
                headers: getAuthHeaders(),
                body: JSON.stringify({ seasonId: selectedSeason }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Hiba a szezon dátumainak törlésekor');
            }

            setTimeSlots([]);
            setSchedules([]);
            setSuccess(`Sikeres törlés: ${data.deletedTimeSlots || 0} időpont eltávolítva a szezonból.`);
        } catch (err) {
            setError(err.message);
        } finally {
            setClearingSeasonDates(false);
        }
    };

    const handleGenerateSchedule = async () => {
        if (!selectedSeason) {
            setError('Szezon kiválasztása szükséges');
            return;
        }

        try {
            setScheduling(true);
            setError('');
            setSuccess('');
            const res = await fetch('/api/admin/generate-schedule', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ seasonId: selectedSeason }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Hiba az ütemezés generálása során');
            }

            const generatedLeagueCount = data.generatedLeagueCount || 0;
            const totalMatchCount = data.totalMatchCount || 0;
            setSuccess(
                `Sikeres ütemezés: ${generatedLeagueCount} liga, ${totalMatchCount} mérkőzés generálva.`,
            );

            // Refresh schedules
            const refreshRes = await fetch(`/api/admin/generate-schedule?seasonId=${selectedSeason}`, {
                headers: getAuthHeaders(),
            });
            if (refreshRes.ok) {
                const schedData = await refreshRes.json();
                setSchedules(schedData.schedules || []);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setScheduling(false);
        }
    };

    const handleSeedPreferences = async () => {
        if (!selectedSeason) {
            setError('Szezon kiválasztása szükséges');
            return;
        }

        const leagueLabel =
            seedLeagueId === 'all'
                ? 'az összes liga'
                : leagues.find((league) => league.id === seedLeagueId)?.name || seedLeagueId;
        const confirmed = window.confirm(
            `Ez felülírja ${leagueLabel} csapatainak meglévő preferenciáit a kiválasztott szezonban. Folytatod?`,
        );
        if (!confirmed) return;

        try {
            setSeedingPreferences(true);
            setError('');
            setSuccess('');

            const res = await fetch('/api/admin/seed-preferences', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ seasonId: selectedSeason, leagueId: seedLeagueId }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Hiba a teszt preferenciák feltöltésekor');
            }

            setSuccess(`Teszt preferenciák feltöltve: ${data.teamCount} csapat (${data.seasonName}).`);
        } catch (err) {
            setError(err.message);
        } finally {
            setSeedingPreferences(false);
        }
    };

    const handleSeasonStatusChange = async (seasonId, status) => {
        const season = seasons.find((item) => item.id === seasonId);
        if (!season) {
            return;
        }

        try {
            setUpdatingSeasonStatusId(seasonId);
            setError('');
            setSuccess('');

            const res = await fetch('/api/admin/seasons', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    seasonId,
                    status,
                    startDate: season.start_date,
                    endDate: season.end_date,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Hiba a szezon állapot frissítésekor');
            }

            setSeasons((prev) =>
                prev.map((item) =>
                    item.id === seasonId ? { ...item, status } : item,
                ),
            );
            setSuccess('Szezon állapot frissítve.');
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdatingSeasonStatusId(null);
        }
    };

    const dayNames = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];

    // During SSR, render a neutral loading state to avoid hydration mismatch
    if (!isHydrated) {
        return (
            <div className="admin-page">
                <Header
                    isLoggedIn={false}
                    userEmail=""
                    setIsLoggedIn={setIsLoggedIn}
                    onOpenAuth={handleOpenAuth}
                />
                <main className="admin-container">
                    <div className="admin-card">
                        <p>Betöltés...</p>
                    </div>
                </main>
            </div>
        );
    }

    if (!isLoggedIn) {
        return (
            <div className="admin-page">
                <Header
                    isLoggedIn={isLoggedIn}
                    userEmail={userEmail}
                    setIsLoggedIn={setIsLoggedIn}
                    onOpenAuth={handleOpenAuth}
                />
                <main className="admin-container">
                    <div className="admin-card error">
                        <h2>Bejelentkezés szükséges</h2>
                        <p>Az adminisztrációs oldal megtekintéséhez be kell jelentkezned.</p>
                    </div>
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

    if (userRole !== 'Admin') {
        return (
            <div className="admin-page">
                <Header
                    isLoggedIn={isLoggedIn}
                    userEmail={userEmail}
                    setIsLoggedIn={setIsLoggedIn}
                    onOpenAuth={handleOpenAuth}
                />
                <main className="admin-container">
                    <div className="admin-card error">
                        <h2>Hozzáférés megtagadva</h2>
                        <p>Nincs jogosultságod az oldal megtekintéséhez. Az oldal átirányítása 3 másodperc múlva...</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <Header
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                setIsLoggedIn={setIsLoggedIn}
                onOpenAuth={handleOpenAuth}
            />

            <main className="admin-container">
                <div className="admin-header">
                    <h1>Szervezés</h1>
                    <p className="admin-subtitle">Bajnokság szervezési kezelőpult</p>
                </div>

                {error && <div className="admin-card error"><p>{error}</p></div>}
                {success && <div className="admin-card success"><p>{success}</p></div>}

                <div className="admin-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        Áttekintés
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'seasons' ? 'active' : ''}`}
                        onClick={() => setActiveTab('seasons')}
                    >
                        Szezonok
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'pitches' ? 'active' : ''}`}
                        onClick={() => setActiveTab('pitches')}
                    >
                        Pályák
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
                        onClick={() => setActiveTab('schedule')}
                    >
                        Ütemezés
                    </button>
                </div>

                {loading && activeTab === 'overview' ? (
                    <div className="admin-card">
                        <p>Betöltés...</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'overview' && (
                            <div className="admin-overview">
                                <div className="stat-card">
                                    <h3>Játékosok</h3>
                                    <p className="stat-number">{stats.totalPlayers}</p>
                                </div>
                                <div className="stat-card">
                                    <h3>Csapatok</h3>
                                    <p className="stat-number">{stats.totalTeams}</p>
                                </div>
                                <div className="stat-card">
                                    <h3>Mérkőzések</h3>
                                    <p className="stat-number">{stats.totalMatches}</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'seasons' && (
                            <div className="admin-card">
                                <h3>Szezonok kezelése</h3>

                                <div className="form-section">
                                    <h4>Új szezon létrehozása</h4>
                                    <input 
                                        type="text"
                                        placeholder="Szezon név (pl. 2024-25)"
                                        value={seasonForm.name}
                                        onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                                    />
                                    <input 
                                        type="date"
                                        value={seasonForm.startDate}
                                        onChange={(e) => setSeasonForm({ ...seasonForm, startDate: e.target.value })}
                                    />
                                    <input 
                                        type="date"
                                        value={seasonForm.endDate}
                                        onChange={(e) => setSeasonForm({ ...seasonForm, endDate: e.target.value })}
                                    />
                                    <button onClick={handleCreateSeason} className="btn-primary">Szezon létrehozása</button>
                                </div>

                                <div className="seasons-list">
                                    <h4>Meglévő szezonok</h4>
                                    {seasons.length === 0 ? (
                                        <p>Nincsenek szezonok.</p>
                                    ) : (
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Név</th>
                                                    <th>Állapot</th>
                                                    <th>Kezdés</th>
                                                    <th>Befejezés</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {seasons.map(season => (
                                                    <tr key={season.id} onClick={() => setSelectedSeason(season.id)} style={{cursor: 'pointer', backgroundColor: selectedSeason === season.id ? '#f0f0f0' : ''}}>
                                                        <td>{season.name}</td>
                                                        <td>
                                                            <select
                                                                className="status-select"
                                                                value={season.status}
                                                                onChange={(e) => handleSeasonStatusChange(season.id, e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                disabled={updatingSeasonStatusId === season.id}
                                                            >
                                                                <option value="setup">setup</option>
                                                                <option value="team-preferences">team-preferences</option>
                                                                <option value="generated">generated</option>
                                                                <option value="active">active</option>
                                                                <option value="completed">completed</option>
                                                            </select>
                                                        </td>
                                                        <td>{season.start_date || '-'}</td>
                                                        <td>{season.end_date || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Dev/demo tool: random valid preferences for testing schedule generation */}
                                <div className="form-section">
                                    <h4>Teszt preferenciák feltöltése (fejlesztéshez)</h4>
                                    <p>
                                        Kiválasztott szezon: <strong>{selectedSeasonDetails?.name || '-'}</strong>
                                    </p>
                                    <p>
                                        Minden csapat véletlenszerű, de érvényes preferenciákat kap (legalább 8 kedvelt,
                                        legfeljebb 8 kerülendő időpont). A meglévő preferenciák felülíródnak.
                                        Előfeltétel: a szezonhoz már legyenek generált időpontok.
                                    </p>
                                    <p>
                                        Ütemezéshez az „Összes liga” kell: a generálás minden legalább 2 csapatos ligát
                                        egyszerre ütemez.
                                    </p>
                                    <select
                                        value={seedLeagueId}
                                        onChange={(e) => setSeedLeagueId(e.target.value)}
                                    >
                                        <option value="all">Összes liga</option>
                                        {leagues.map((league) => (
                                            <option key={league.id} value={league.id}>
                                                {league.name} ({league.teams?.length ?? 0} csapat)
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleSeedPreferences}
                                        className="btn-primary"
                                        disabled={!selectedSeason || seedingPreferences}
                                    >
                                        {seedingPreferences ? 'Feltöltés folyamatban...' : 'Teszt preferenciák feltöltése'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'pitches' && (
                            <div className="admin-card">
                                <h3>Pályák és időpontok kezelése</h3>
                                
                                {!selectedSeason ? (
                                    <p>Válassz ki egy szezonüt az előbb, majd térj vissza.</p>
                                ) : (
                                    <>
                                        <div className="form-section">
                                            <h4>Új pálya hozzáadása</h4>
                                            <input 
                                                type="text"
                                                placeholder="Pálya neve"
                                                value={pitchForm.name}
                                                onChange={(e) => setPitchForm({ ...pitchForm, name: e.target.value })}
                                            />
                                            <input 
                                                type="text"
                                                placeholder="Helyszín (opcionális)"
                                                value={pitchForm.location}
                                                onChange={(e) => setPitchForm({ ...pitchForm, location: e.target.value })}
                                            />
                                            <button onClick={handleAddPitch} className="btn-primary">Pálya hozzáadása</button>
                                        </div>

                                        <div className="form-section">
                                            <h4>Automatikus időpont generálás</h4>
                                            <p>Hétfő-péntek, 17:00-23:00, 1 órás blokkok (17-18, 18-19, 19-20, 20-21, 21-22, 22-23).</p>
                                            <p>
                                                Generálási időszak: {selectedSeasonDetails?.start_date || '-'} - {selectedSeasonDetails?.end_date || '-'}
                                            </p>
                                            <button onClick={handleAutoGenerateTimeSlots} className="btn-primary" disabled={autoGeneratingSlots}>
                                                {autoGeneratingSlots ? 'Generálás folyamatban...' : 'Időpontok automatikus generálása'}
                                            </button>
                                        </div>

                                        <div className="slots-list">
                                            <h4>Konfigurálva időpontok ({timeSlots.length})</h4>
                                            <div className="slots-actions">
                                                <button
                                                    type="button"
                                                    className="btn-danger"
                                                    onClick={handleDeleteSeasonDates}
                                                    disabled={clearingSeasonDates || !selectedSeason}
                                                >
                                                    {clearingSeasonDates ? 'Törlés folyamatban...' : 'Összes dátum törlése ebből a szezonból'}
                                                </button>
                                            </div>
                                            {timeSlots.length === 0 ? (
                                                <p>Nincsenek időpontok konfigurálva.</p>
                                            ) : (
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th>Dátum</th>
                                                            <th>Pálya</th>
                                                            <th>Nap</th>
                                                            <th>Időpont</th>
                                                            <th>Művelet</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {timeSlots.map(slot => {
                                                            const pitch = pitches.find(p => p.id === slot.pitchId);
                                                            return (
                                                                <tr key={slot.id}>
                                                                    <td>{slot.slotDate || '-'}</td>
                                                                    <td>{pitch?.name || 'Ismeretlen'}</td>
                                                                    <td>{dayNames[slot.dayOfWeek]}</td>
                                                                    <td>{slot.startTime} - {slot.endTime}</td>
                                                                    <td>
                                                                        <button className="btn-danger" onClick={() => handleDeleteTimeSlot(slot.id)}>
                                                                            Törlés
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'schedule' && (
                            <div className="admin-card">
                                <h3>Ütemezés generálása</h3>
                                
                                {!selectedSeason ? (
                                    <p>Válassz ki egy szezonüt az előbb, majd térj vissza.</p>
                                ) : (
                                    <>
                                        <div className="schedule-info">
                                            <p>Ütemezés a kiválasztott szezon minden ligájára készül el.</p>
                                            <p>Pályák konfigurálva: {pitches.length}</p>
                                            <p>Időpontok konfigurálva: {timeSlots.length}</p>
                                            <button 
                                                onClick={handleGenerateSchedule} 
                                                className="btn-primary"
                                                disabled={scheduling || timeSlots.length === 0}
                                            >
                                                {scheduling ? 'Generálás folyamatban...' : 'Ütemezés generálása'}
                                            </button>
                                        </div>

                                        {schedules.length > 0 && (
                                            <div className="schedules-history">
                                                <h4>Generálási előzmények</h4>
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th>Generálva</th>
                                                            <th>Liga</th>
                                                            <th>Melégedettség %</th>
                                                            <th>Állapot</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {schedules.map(schedule => (
                                                            <tr key={schedule.id}>
                                                                <td>{new Date(schedule.generatedAt).toLocaleString('hu-HU')}</td>
                                                                <td>{schedule.leagueName || schedule.leagueId || '-'}</td>
                                                                <td>{schedule.algorithmScore}%</td>
                                                                <td>{schedule.status === 'current' ? '✓ Aktív' : 'Archiválva'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
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
