'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthHeaders } from '../../../lib/client-auth';
import './preferences.css';

const dayNames = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];

export default function PreferencesPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // State for seasons, teams, and preferences
  const [seasons, setSeasons] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [saving, setSaving] = useState(false);

  // Set hydrated flag on mount
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Fetch user's teams and active seasons
  useEffect(() => {
    if (!isHydrated) return;
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        
        // Get user's teams
        const teamsRes = await fetch('/api/players/me/teams', {
          headers: getAuthHeaders(),
        });
        if (teamsRes.ok) {
          const teamsData = await teamsRes.json();
          setUserTeams(teamsData);
        }

        // Get seasons that are in team-preferences status
        const seasonsRes = await fetch('/api/admin/seasons', {
          headers: getAuthHeaders(),
        });
        if (seasonsRes.ok) {
          const seasonsData = await seasonsRes.json();
          const seasonsList = seasonsData.seasons || seasonsData;
          // Filter for team-preferences status
          const activeSeasons = seasonsList.filter(s => s.status === 'team-preferences');
          setSeasons(activeSeasons);
          if (activeSeasons.length > 0) {
            setSelectedSeason(activeSeasons[0].id);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Nem sikerült az adatok betöltése');
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [isHydrated]);

  // Fetch time slots and existing preferences when season/team changes
  useEffect(() => {
    if (!selectedSeason || !selectedTeam) return;

    const fetchSlotsAndPreferences = async () => {
      try {
        // Get time slots for season
        const slotsRes = await fetch(`/api/admin/time-slots?seasonId=${selectedSeason}`, {
          headers: getAuthHeaders(),
        });
        if (slotsRes.ok) {
          const slotsData = await slotsRes.json();
          const slotsList = slotsData.timeSlots || slotsData;
          setTimeSlots(slotsList);
        }

        // Get team's existing preferences
        const prefsRes = await fetch(
          `/api/teams/preferences?seasonId=${selectedSeason}&teamId=${selectedTeam}`,
          {
            headers: getAuthHeaders(),
          }
        );
        if (prefsRes.ok) {
          const prefsData = await prefsRes.json();
          const prefsMap = {};
          prefsData.forEach((pref) => {
            prefsMap[pref.time_slot_id] = pref.preference;
          });
          setPreferences(prefsMap);
        }
      } catch (err) {
        console.error('Error fetching slots and preferences:', err);
        setError('Nem sikerült az időpontok betöltése');
      }
    };

    fetchSlotsAndPreferences();
  }, [selectedSeason, selectedTeam]);

  // Handle preference toggle
  const handlePreferenceChange = (timeSlotId, newPreference) => {
    setPreferences((prev) => {
      const updated = { ...prev };
      if (updated[timeSlotId] === newPreference) {
        delete updated[timeSlotId];
      } else {
        updated[timeSlotId] = newPreference;
      }
      return updated;
    });
  };

  // Save preferences
  const handleSavePreferences = async () => {
    if (!selectedTeam || !selectedSeason) {
      setError('Válassz csapatot és szezont');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Save each preference
      for (const [timeSlotId, preference] of Object.entries(preferences)) {
        await fetch('/api/teams/preferences', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            seasonId: selectedSeason,
            teamId: selectedTeam,
            timeSlotId: parseInt(timeSlotId),
            preference,
          }),
        });
      }

      setSuccess('Preferenciák sikeresen elmentve!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving preferences:', err);
      setError('Nem sikerült a preferenciák mentése');
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
            <h1>Mérkőzésidőpont Preferenciák</h1>
          </div>
          <div className="preferences-card error">
            <p>Nem vagy csapatvezető. Hogy állítsd be az időpont-preferenciákat, légy csapatvezető.</p>
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
            <h1>Mérkőzésidőpont Preferenciák</h1>
          </div>
          <div className="preferences-card">
            <p>Jelenleg nincsenek aktív szezonok, amelyekhez preferenciákat lehetne megadni.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preferences-page">
      <div className="preferences-container">
        <div className="preferences-header">
          <h1>Mérkőzésidőpont Preferenciák</h1>
          <p className="preferences-subtitle">
            Jelöld ki az időpontokat, amelyekben szeretne játszani a csapatod!
          </p>
        </div>

        {error && <div className="preferences-card error">{error}</div>}
        {success && <div className="preferences-card success">{success}</div>}

        <div className="preferences-card">
          {/* Season and Team Selection */}
          <div className="selector-section">
            <div className="selector-group">
              <label htmlFor="season-select">Szezon:</label>
              <select
                id="season-select"
                value={selectedSeason || ''}
                onChange={(e) => {
                  setSelectedSeason(parseInt(e.target.value));
                  setPreferences({});
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
                  setPreferences({});
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

          {/* Time Slots Grid */}
          {selectedSeason && selectedTeam && timeSlots.length > 0 && (
            <>
              <div className="time-slots-section">
                <h3>Elérhető időpontok</h3>
                <div className="time-slots-grid">
                  {timeSlots.map((slot) => (
                    <div key={slot.id} className="time-slot-card">
                      <div className="slot-header">
                        <div className="slot-day">{dayNames[slot.dayOfWeek]}</div>
                        <div className="slot-time">
                          {slot.startTime} - {slot.endTime}
                        </div>
                      </div>
                      <div className="slot-location">{slot.pitchName || `Pálya ${slot.pitchId}`}</div>
                      <div className="slot-preferences">
                        <button
                          className={`pref-btn preferred ${
                            preferences[slot.id] === 'preferred' ? 'active' : ''
                          }`}
                          onClick={() => handlePreferenceChange(slot.id, 'preferred')}
                          title="Játszani szeretnénk"
                        >
                          ✓ Jó
                        </button>
                        <button
                          className={`pref-btn neutral ${
                            preferences[slot.id] === 'neutral' ? 'active' : ''
                          }`}
                          onClick={() => handlePreferenceChange(slot.id, 'neutral')}
                          title="Közömbös"
                        >
                          = Mindegy
                        </button>
                        <button
                          className={`pref-btn unavailable ${
                            preferences[slot.id] === 'unavailable' ? 'active' : ''
                          }`}
                          onClick={() => handlePreferenceChange(slot.id, 'unavailable')}
                          title="Nem tudunk játszani"
                        >
                          ✗ Nem
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="save-section">
                <button
                  className="btn-save"
                  onClick={handleSavePreferences}
                  disabled={saving}
                >
                  {saving ? 'Mentés...' : 'Preferenciák Mentése'}
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
