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
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authMode, setAuthMode] = useState('login');

    // Tabs
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedLeague, setSelectedLeague] = useState(null);
    const [selectedSeason, setSelectedSeason] = useState(null);

    // Data
    const [leagues, setLeagues] = useState([]);
    const [stats, setStats] = useState({ totalPlayers: 0, totalTeams: 0, totalMatches: 0 });
    const [seasons, setSeasons] = useState([]);
    const [pitches, setPitches] = useState([]);
    const [timeSlots, setTimeSlots] = useState([]);
    const [schedules, setSchedules] = useState([]);

    // Form states
    const [seasonForm, setSeasonForm] = useState({ name: '', startDate: '', endDate: '' });
    const [pitchForm, setPitchForm] = useState({ name: '', location: '' });
    const [timeSlotForm, setTimeSlotForm] = useState({ pitchId: '', dayOfWeek: 0, startTime: '17:00', endTime: '18:00' });
    const [autoSlotForm, setAutoSlotForm] = useState({ startDate: '', endDate: '' });
    const [scheduling, setScheduling] = useState(false);
    const [autoGeneratingSlots, setAutoGeneratingSlots] = useState(false);

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

                const [playersRes, teamsRes, matchesRes, leaguesRes] = await Promise.all([
                    fetch('/api/players'),
                    fetch('/api/teams-list'),
                    fetch('/api/matches'),
                    fetch('/api/leagues'),
                ]);

                if (!playersRes.ok || !teamsRes.ok || !matchesRes.ok) {
                    throw new Error('Hiba az adatok betöltésekor');
                }

                const playersData = await playersRes.json();
                const teamsData = await teamsRes.json();
                const matchesData = await matchesRes.json();
                const leaguesData = leaguesRes.ok ? await leaguesRes.json() : { leagues: [] };

                setStats({
                    totalPlayers: (playersData.players || []).length,
                    totalTeams: (teamsData.teams || []).length,
                    totalMatches: (matchesData.matches || []).length,
                });

                setLeagues(leaguesData.leagues || []);
                if (leaguesData.leagues && leaguesData.leagues.length > 0) {
                    setSelectedLeague(leaguesData.leagues[0].id);
                }
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
        if (!isHydrated || !selectedLeague || activeTab !== 'seasons') return;

        const fetchSeasons = async () => {
            try {
                const res = await fetch(`/api/admin/seasons?leagueId=${selectedLeague}`, {
                    headers: getAuthHeaders(),
                });
                if (!res.ok) throw new Error('Hiba a szezonok lekérdezésekor');
                const data = await res.json();
                setSeasons(data.seasons || []);
                if (data.seasons && data.seasons.length > 0) {
                    setSelectedSeason(data.seasons[0].id);
                }
            } catch (err) {
                console.error('Seasons fetch error:', err);
            }
        };

        fetchSeasons();
    }, [isHydrated, selectedLeague, activeTab]);

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
        if (!seasonForm.name || !selectedLeague) {
            setError('Szezon név és liga szükséges');
            return;
        }

        try {
            const res = await fetch('/api/admin/seasons', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    leagueId: selectedLeague,
                    name: seasonForm.name,
                    startDate: seasonForm.startDate,
                    endDate: seasonForm.endDate,
                }),
            });

            if (!res.ok) throw new Error('Hiba a szezon létrehozásakor');
            
            setSeasonForm({ name: '', startDate: '', endDate: '' });
            // Refresh seasons
            const refreshRes = await fetch(`/api/admin/seasons?leagueId=${selectedLeague}`, {
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

    const handleAddTimeSlot = async () => {
        if (!timeSlotForm.pitchId || !selectedSeason) {
            setError('Pálya és szezon szükséges');
            return;
        }

        try {
            const res = await fetch('/api/admin/time-slots', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    seasonId: selectedSeason,
                    pitchId: parseInt(timeSlotForm.pitchId),
                    dayOfWeek: parseInt(timeSlotForm.dayOfWeek),
                    startTime: timeSlotForm.startTime,
                    endTime: timeSlotForm.endTime,
                }),
            });

            if (!res.ok) throw new Error('Hiba az időpont hozzáadásakor');
            
            setTimeSlotForm({ pitchId: '', dayOfWeek: 0, startTime: '17:00', endTime: '18:00' });
            // Refresh time slots
            const refreshRes = await fetch(`/api/admin/time-slots?seasonId=${selectedSeason}`, {
                headers: getAuthHeaders(),
            });
            if (refreshRes.ok) {
                const data = await refreshRes.json();
                setTimeSlots(data.timeSlots || []);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const handleAutoGenerateTimeSlots = async () => {
        if (!selectedSeason || !autoSlotForm.startDate || !autoSlotForm.endDate) {
            setError('Szezon, kezdő és záró dátum szükséges az automatikus generáláshoz');
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
                    startDate: autoSlotForm.startDate,
                    endDate: autoSlotForm.endDate,
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

    const handleGenerateSchedule = async () => {
        if (!selectedSeason) {
            setError('Szezon kiválasztása szükséges');
            return;
        }

        try {
            setScheduling(true);
            setError('');
            const res = await fetch('/api/admin/generate-schedule', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ seasonId: selectedSeason }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Hiba az ütemezés generálása során');
            }

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
                                
                                <div className="league-selector">
                                    <label>Liga kiválasztása:</label>
                                    <select value={selectedLeague || ''} onChange={(e) => setSelectedLeague(e.target.value)}>
                                        {leagues.map(league => (
                                            <option key={league.id} value={league.id}>{league.name}</option>
                                        ))}
                                    </select>
                                </div>

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
                                                        <td>{season.status}</td>
                                                        <td>{season.start_date || '-'}</td>
                                                        <td>{season.end_date || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
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
                                            <input
                                                type="date"
                                                value={autoSlotForm.startDate}
                                                onChange={(e) => setAutoSlotForm({ ...autoSlotForm, startDate: e.target.value })}
                                            />
                                            <input
                                                type="date"
                                                value={autoSlotForm.endDate}
                                                onChange={(e) => setAutoSlotForm({ ...autoSlotForm, endDate: e.target.value })}
                                            />
                                            <button onClick={handleAutoGenerateTimeSlots} className="btn-primary" disabled={autoGeneratingSlots}>
                                                {autoGeneratingSlots ? 'Generálás folyamatban...' : 'Időpontok automatikus generálása'}
                                            </button>
                                        </div>

                                        <div className="form-section">
                                            <h4>Új időpont hozzáadása</h4>
                                            <select value={timeSlotForm.pitchId} onChange={(e) => setTimeSlotForm({ ...timeSlotForm, pitchId: e.target.value })}>
                                                <option value="">Pálya kiválasztása</option>
                                                {pitches.map(pitch => (
                                                    <option key={pitch.id} value={pitch.id}>{pitch.name}</option>
                                                ))}
                                            </select>
                                            <select value={timeSlotForm.dayOfWeek} onChange={(e) => setTimeSlotForm({ ...timeSlotForm, dayOfWeek: e.target.value })}>
                                                {dayNames.map((day, index) => (
                                                    <option key={index} value={index}>{day}</option>
                                                ))}
                                            </select>
                                            <input 
                                                type="time"
                                                value={timeSlotForm.startTime}
                                                onChange={(e) => setTimeSlotForm({ ...timeSlotForm, startTime: e.target.value })}
                                            />
                                            <input 
                                                type="time"
                                                value={timeSlotForm.endTime}
                                                onChange={(e) => setTimeSlotForm({ ...timeSlotForm, endTime: e.target.value })}
                                            />
                                            <button onClick={handleAddTimeSlot} className="btn-primary">Időpont hozzáadása</button>
                                        </div>

                                        <div className="slots-list">
                                            <h4>Konfigurálva időpontok ({timeSlots.length})</h4>
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
                                                            <th>Melégedettség %</th>
                                                            <th>Állapot</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {schedules.map(schedule => (
                                                            <tr key={schedule.id}>
                                                                <td>{new Date(schedule.generatedAt).toLocaleString('hu-HU')}</td>
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
