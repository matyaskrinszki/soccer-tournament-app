'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../admin-api';

const DAY_NAMES = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];

export default function PitchesTab({ season, notify }) {
    const [pitches, setPitches] = useState([]);
    const [timeSlots, setTimeSlots] = useState([]);
    const [pitchForm, setPitchForm] = useState({ name: '', location: '' });
    const [autoGeneratingSlots, setAutoGeneratingSlots] = useState(false);
    const [clearingSeasonDates, setClearingSeasonDates] = useState(false);

    const loadPitches = useCallback(async () => {
        const data = await adminFetch(`/api/admin/pitches?seasonId=${season.id}`, {
            errorMessage: 'Hiba a pályák lekérdezésekor',
        });
        setPitches(data.pitches || []);
    }, [season.id]);

    const loadTimeSlots = useCallback(async () => {
        const data = await adminFetch(`/api/admin/time-slots?seasonId=${season.id}`, {
            errorMessage: 'Hiba az időpontok lekérdezésekor',
        });
        setTimeSlots(data.timeSlots || []);
    }, [season.id]);

    useEffect(() => {
        Promise.all([loadPitches(), loadTimeSlots()]).catch((err) => notify.error(err.message));
    }, [loadPitches, loadTimeSlots, notify]);

    const handleAddPitch = async () => {
        if (!pitchForm.name) {
            notify.error('Pálya név szükséges');
            return;
        }

        try {
            notify.clear();
            await adminFetch('/api/admin/pitches', {
                method: 'POST',
                body: { seasonId: season.id, name: pitchForm.name, location: pitchForm.location },
                errorMessage: 'Hiba a pálya hozzáadásakor',
            });
            setPitchForm({ name: '', location: '' });
            await loadPitches();
        } catch (err) {
            notify.error(err.message);
        }
    };

    const handleAutoGenerateTimeSlots = async () => {
        if (!season.start_date || !season.end_date) {
            notify.error('A kiválasztott szezonhoz kezdő és záró dátum beállítása szükséges');
            return;
        }

        try {
            setAutoGeneratingSlots(true);
            notify.clear();
            await adminFetch('/api/admin/time-slots/generate', {
                method: 'POST',
                body: { seasonId: season.id },
                errorMessage: 'Hiba az automatikus időpont generálás során',
            });
            await loadTimeSlots();
        } catch (err) {
            notify.error(err.message);
        } finally {
            setAutoGeneratingSlots(false);
        }
    };

    const handleDeleteTimeSlot = async (timeSlotId) => {
        try {
            notify.clear();
            await adminFetch('/api/admin/time-slots', {
                method: 'DELETE',
                body: { timeSlotId },
                errorMessage: 'Hiba az időpont törlésekor',
            });
            setTimeSlots((prev) => prev.filter((slot) => slot.id !== timeSlotId));
        } catch (err) {
            notify.error(err.message);
        }
    };

    const handleDeleteSeasonDates = async () => {
        const confirmed = window.confirm(
            `Biztosan törölni szeretnéd a ${season.name} szezon összes dátumát/időpontját? Ez visszafordíthatatlan művelet.`,
        );
        if (!confirmed) return;

        try {
            setClearingSeasonDates(true);
            notify.clear();
            const data = await adminFetch('/api/admin/time-slots', {
                method: 'DELETE',
                body: { seasonId: season.id },
                errorMessage: 'Hiba a szezon dátumainak törlésekor',
            });
            setTimeSlots([]);
            notify.success(`Sikeres törlés: ${data.deletedTimeSlots || 0} időpont eltávolítva a szezonból.`);
        } catch (err) {
            notify.error(err.message);
        } finally {
            setClearingSeasonDates(false);
        }
    };

    return (
        <div className="admin-card">
            <h3>Pályák és időpontok kezelése</h3>

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
                    Generálási időszak: {season.start_date || '-'} - {season.end_date || '-'}
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
                        disabled={clearingSeasonDates}
                    >
                        {clearingSeasonDates ? 'Törlés folyamatban...' : 'Összes dátum törlése ebből a szezonból'}
                    </button>
                </div>
                {timeSlots.length === 0 ? (
                    <p>Nincsenek időpontok konfigurálva.</p>
                ) : (
                    <div className="table-scroll">
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
                                {timeSlots.map((slot) => {
                                    const pitch = pitches.find((p) => p.id === slot.pitchId);
                                    return (
                                        <tr key={slot.id}>
                                            <td>{slot.slotDate || '-'}</td>
                                            <td>{pitch?.name || 'Ismeretlen'}</td>
                                            <td>{DAY_NAMES[slot.dayOfWeek]}</td>
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
                    </div>
                )}
            </div>
        </div>
    );
}
