'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAuthHeaders } from '../../../lib/client-auth';
import './preferences.css';

const WEEKDAYS = [
  { index: 0, label: 'Hétfő', short: 'H' },
  { index: 1, label: 'Kedd', short: 'K' },
  { index: 2, label: 'Szerda', short: 'Sze' },
  { index: 3, label: 'Csütörtök', short: 'Cs' },
  { index: 4, label: 'Péntek', short: 'P' },
];

const START_TIMES = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const MAX_UNAVAILABLE = 8;

function buildCellKey(dayOfWeek, startTime) {
  return `${dayOfWeek}|${startTime}`;
}

function cyclePreference(currentValue, hasReachedUnavailableLimit) {
  if (currentValue === 'preferred') {
    if (hasReachedUnavailableLimit) return null;
    return 'unavailable';
  }
  if (currentValue === 'unavailable') return null;
  return 'preferred';
}

export default function PreferencesPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [seasons, setSeasons] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [weeklyPreferences, setWeeklyPreferences] = useState({});
  const [saving, setSaving] = useState(false);

  const availableWeeklyKeys = useMemo(() => {
    const keys = new Set();

    (timeSlots || []).forEach((slot) => {
      const dayOfWeek = Number(slot.dayOfWeek);
      if (!slot.slotDate || dayOfWeek < 0 || dayOfWeek > 4) {
        return;
      }

      if (!START_TIMES.includes(slot.startTime)) {
        return;
      }

      keys.add(buildCellKey(dayOfWeek, slot.startTime));
    });

    return keys;
  }, [timeSlots]);

  const preferredCount = useMemo(
    () => Object.values(weeklyPreferences).filter((pref) => pref === 'preferred').length,
    [weeklyPreferences],
  );

  const unavailableCount = useMemo(
    () => Object.values(weeklyPreferences).filter((pref) => pref === 'unavailable').length,
    [weeklyPreferences],
  );

  const adaptivePreferredMin = Math.min(8, availableWeeklyKeys.size);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    const fetchInitialData = async () => {
      try {
        setLoading(true);

        const teamsRes = await fetch('/api/players/me/teams', {
          headers: getAuthHeaders(),
        });
        let teams = [];
        if (teamsRes.ok) {
          teams = (await teamsRes.json()) || [];
          setUserTeams(teams);
        }
        const teamIds = new Set(teams.map((team) => team.id));

        const seasonsRes = await fetch('/api/admin/seasons', {
          headers: getAuthHeaders(),
        });
        if (seasonsRes.ok) {
          const seasonsData = await seasonsRes.json();
          const seasonsList = seasonsData.seasons || seasonsData || [];
          // Seasons collecting preferences that one of the captain's teams entered
          const activeSeasons = seasonsList.filter(
            (season) =>
              season.status === 'team-preferences' &&
              (season.registeredTeamIds || []).some((id) => teamIds.has(id)),
          );

          setSeasons(activeSeasons);
          if (activeSeasons.length > 0) {
            setSelectedSeason(activeSeasons[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Nem sikerült az adatok betöltése');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [isHydrated]);

  useEffect(() => {
    if (!selectedSeason || !selectedTeam) return;

    const fetchSlotsAndPreferences = async () => {
      try {
        const [slotsRes, prefsRes] = await Promise.all([
          fetch(`/api/admin/time-slots?seasonId=${selectedSeason}`, {
            headers: getAuthHeaders(),
          }),
          fetch(
            `/api/teams/preferences?seasonId=${selectedSeason}&teamId=${selectedTeam}`,
            {
              headers: getAuthHeaders(),
            },
          ),
        ]);

        let slotsList = [];
        if (slotsRes.ok) {
          const slotsData = await slotsRes.json();
          slotsList = slotsData.timeSlots || slotsData || [];
        }
        setTimeSlots(slotsList);

        if (!prefsRes.ok) {
          setWeeklyPreferences({});
          return;
        }

        const prefsData = await prefsRes.json();
        const prefsList = prefsData.preferences || [];
        const slotById = new Map((slotsList || []).map((slot) => [Number(slot.id), slot]));
        const votes = new Map();

        prefsList.forEach((pref) => {
          const slot = slotById.get(Number(pref.timeSlotId));
          const dayOfWeek = Number(slot?.dayOfWeek);

          if (!slot?.slotDate || dayOfWeek < 0 || dayOfWeek > 4) {
            return;
          }

          if (!START_TIMES.includes(slot.startTime)) {
            return;
          }

          const key = buildCellKey(dayOfWeek, slot.startTime);
          if (!votes.has(key)) {
            votes.set(key, { preferred: 0, unavailable: 0 });
          }

          if (pref.preference === 'preferred') {
            votes.get(key).preferred += 1;
          }

          if (pref.preference === 'unavailable') {
            votes.get(key).unavailable += 1;
          }
        });

        const nextWeeklyPreferences = {};
        votes.forEach((value, key) => {
          if (value.preferred > value.unavailable) {
            nextWeeklyPreferences[key] = 'preferred';
          } else if (value.unavailable > value.preferred) {
            nextWeeklyPreferences[key] = 'unavailable';
          }
        });

        setWeeklyPreferences(nextWeeklyPreferences);
      } catch (err) {
        console.error('Error fetching slots and preferences:', err);
        setError('Nem sikerült az időpontok betöltése');
      }
    };

    fetchSlotsAndPreferences();
  }, [selectedSeason, selectedTeam]);

  const handleSquareClick = (dayOfWeek, startTime) => {
    const key = buildCellKey(dayOfWeek, startTime);

    if (!availableWeeklyKeys.has(key)) {
      return;
    }

    setError(null);
    setWeeklyPreferences((prev) => {
      const updated = { ...prev };
      const currentPreference = updated[key];

      const currentUnavailableCount = Object.values(prev).filter(
        (pref) => pref === 'unavailable',
      ).length;
      const hasReachedUnavailableLimit = currentUnavailableCount >= MAX_UNAVAILABLE;
      const nextPreference = cyclePreference(currentPreference, hasReachedUnavailableLimit);

      if (!nextPreference) {
        delete updated[key];
      } else {
        updated[key] = nextPreference;
      }

      return updated;
    });
  };

  const handleSavePreferences = async () => {
    if (!selectedTeam || !selectedSeason) {
      setError('Válassz csapatot és szezont');
      return;
    }

    if (availableWeeklyKeys.size === 0) {
      setError('Nincsenek dátumhoz kötött időpontok a kiválasztott szezonban.');
      return;
    }

    if (preferredCount < adaptivePreferredMin) {
      setError(`Legalább ${adaptivePreferredMin} kedvelt időpontot kell megjelölni.`);
      return;
    }

    if (unavailableCount > MAX_UNAVAILABLE) {
      setError(`Legfeljebb ${MAX_UNAVAILABLE} kerülendő időpont jelölhető.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const recurringPreferences = Object.entries(weeklyPreferences).map(
        ([key, preference]) => {
          const [dayOfWeek, startTime] = key.split('|');
          return {
            dayOfWeek: Number(dayOfWeek),
            startTime,
            preference,
          };
        },
      );

      const response = await fetch('/api/teams/preferences', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          seasonId: selectedSeason,
          teamId: selectedTeam,
          recurringPreferences,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Nem sikerült a preferenciák mentése');
      }

      setSuccess(
        `Preferenciák mentve: kedvelt ${preferredCount}, kerülendő ${unavailableCount}.`,
      );
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving preferences:', err);
      setError(err.message || 'Nem sikerült a preferenciák mentése');
    } finally {
      setSaving(false);
    }
  };

  if (!isHydrated || loading) {
    return (
      <div className="preferences-page">
        <div className="preferences-container">
          <div className="loading">Betöltés...</div>
        </div>
      </div>
    );
  }

  if (!loading && userTeams.length === 0) {
    return (
      <div className="preferences-page">
        <div className="preferences-container">
          <div className="preferences-header">
            <h1>Mérkőzésidőpont-preferenciák</h1>
          </div>
          <div className="preferences-card error">
            <p>Nem vagy csapatkapitány. Az időpont-preferenciákat a csapatkapitány adhatja meg.</p>
          </div>
        </div>
      </div>
    );
  }

  if (seasons.length === 0) {
    return (
      <div className="preferences-page">
        <div className="preferences-container">
          <div className="preferences-header">
            <h1>Mérkőzésidőpont-preferenciák</h1>
          </div>
          <div className="preferences-card">
            <p>
              Jelenleg nincs olyan szezon, amelyre a csapatod nevezett és már preferenciákat
              lehet megadni. A nevezést a csapat oldalán teheted meg.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preferences-page">
      <div className="preferences-container">
        <div className="preferences-header">
          <h1>Mérkőzésidőpont-preferenciák</h1>
          <p className="preferences-subtitle">
            Egy heti mintát adsz meg, amit a rendszer a szezon minden hetére alkalmaz.
          </p>
        </div>

        {error && <div className="preferences-card error">{error}</div>}
        {success && <div className="preferences-card success">{success}</div>}

        <div className="preferences-card">
          <div className="selector-section">
            <div className="selector-group">
              <label htmlFor="season-select">Szezon:</label>
              <select
                id="season-select"
                value={selectedSeason || ''}
                onChange={(e) => {
                  setSelectedSeason(parseInt(e.target.value));
                  setWeeklyPreferences({});
                }}
              >
                <option value="">-- Válassz szezont --</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="selector-group">
              <label htmlFor="team-select">Csapat:</label>
              <select
                id="team-select"
                value={selectedTeam || ''}
                onChange={(e) => {
                  setSelectedTeam(parseInt(e.target.value));
                  setWeeklyPreferences({});
                }}
              >
                <option value="">-- Válassz csapatot --</option>
                {userTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedSeason && selectedTeam && timeSlots.length > 0 && (
            <>
              <div className="time-slots-section">
                <h3>Ismétlődő heti preferencia minta</h3>
                <p className="template-hint">
                  Kattintás: semleges -&gt; kedvelt (zöld) -&gt; kerülendő (piros) -&gt; semleges. Ha a
                  kerülendő limit betelt, a kedvelt mező következő kattintásra semlegesre vált.
                </p>

                <div className="preference-rules">
                  <span className={`rule-badge ${preferredCount >= adaptivePreferredMin ? 'ok' : 'warn'}`}>
                    Kedvelt: {preferredCount} / minimum {adaptivePreferredMin}
                  </span>
                  <span className={`rule-badge ${unavailableCount <= MAX_UNAVAILABLE ? 'ok' : 'warn'}`}>
                    Kerülendő: {unavailableCount} / maximum {MAX_UNAVAILABLE}
                  </span>
                </div>

                <div className="single-week-card">
                  <div className="calendar-table-wrap">
                    <table className="calendar-table recurring">
                      <colgroup>
                        <col className="time-col" />
                        {WEEKDAYS.map((day) => (
                          <col key={`col-${day.index}`} className="day-col" />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Idő</th>
                          {WEEKDAYS.map((day) => (
                            <th key={day.index} title={day.label}>
                              {/* preferences.css shows the short name on phones */}
                              <span className="day-long">{day.label}</span>
                              <span className="day-short">{day.short}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {START_TIMES.map((startTime) => (
                          <tr key={startTime}>
                            <td className="time-cell">{startTime}</td>
                            {WEEKDAYS.map((day) => {
                              const key = buildCellKey(day.index, startTime);
                              const value = weeklyPreferences[key] || 'neutral';
                              const isAvailable = availableWeeklyKeys.has(key);

                              return (
                                <td key={key}>
                                  <button
                                    type="button"
                                    className={`pref-square ${value}`}
                                    onClick={() => handleSquareClick(day.index, startTime)}
                                    disabled={!isAvailable}
                                    title={
                                      !isAvailable
                                        ? 'Nincs elérhető időpont ezen a napon/időben'
                                        : value === 'preferred'
                                          ? 'Kedvelt időpont'
                                          : value === 'unavailable'
                                            ? 'Kerülendő időpont'
                                            : 'Nincs preferencia'
                                    }
                                  >
                                    &nbsp;
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="save-section">
                <button
                  className="btn-save"
                  onClick={handleSavePreferences}
                  disabled={
                    saving ||
                    preferredCount < adaptivePreferredMin ||
                    unavailableCount > MAX_UNAVAILABLE
                  }
                >
                  {saving ? 'Mentés...' : 'Preferenciák mentése'}
                </button>
              </div>
            </>
          )}

          {selectedSeason && selectedTeam && timeSlots.length === 0 && (
            <p className="info-text">Erre a szezonra még nincsenek elérhető időpontok.</p>
          )}
        </div>
      </div>
    </div>
  );
}
