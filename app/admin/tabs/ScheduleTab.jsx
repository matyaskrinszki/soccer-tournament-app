'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { GENERATABLE_STATUSES, PUBLISHED_STATUSES } from '../season-statuses';

// Statuses in which /schedule shows the season publicly
const PUBLIC_STATUSES = ['generated', ...PUBLISHED_STATUSES];

export default function ScheduleTab({ season, onSeasonUpdated, notify }) {
    const [pitchCount, setPitchCount] = useState(0);
    const [timeSlotCount, setTimeSlotCount] = useState(0);
    const [schedules, setSchedules] = useState([]);
    const [scheduling, setScheduling] = useState(false);
    const [publishing, setPublishing] = useState(false);

    const loadSchedules = useCallback(async () => {
        const data = await adminFetch(`/api/admin/generate-schedule?seasonId=${season.id}`, {
            errorMessage: 'Hiba az ütemezések lekérdezésekor',
        });
        setSchedules(data.schedules || []);
    }, [season.id]);

    useEffect(() => {
        const load = async () => {
            const [pitchesData, slotsData] = await Promise.all([
                adminFetch(`/api/admin/pitches?seasonId=${season.id}`),
                adminFetch(`/api/admin/time-slots?seasonId=${season.id}`),
                loadSchedules(),
            ]);
            setPitchCount((pitchesData.pitches || []).length);
            setTimeSlotCount((slotsData.timeSlots || []).length);
        };
        load().catch((err) => notify.error(err.message));
    }, [season.id, loadSchedules, notify]);

    const isSeasonPublished = PUBLISHED_STATUSES.includes(season.status);
    const canGenerate = GENERATABLE_STATUSES.includes(season.status);
    const hasCurrentSchedule = schedules.some((schedule) => schedule.status === 'current');

    const handleGenerateSchedule = async () => {
        try {
            setScheduling(true);
            notify.clear();
            const data = await adminFetch('/api/admin/generate-schedule', {
                method: 'POST',
                body: { seasonId: season.id },
                errorMessage: 'Hiba az ütemezés generálása során',
            });

            onSeasonUpdated(season.id, { status: data.seasonStatus });
            notify.success(
                `Sikeres ütemezés: ${data.generatedLeagueCount || 0} liga, ${data.totalMatchCount || 0} mérkőzés generálva.`,
            );
            await loadSchedules();
        } catch (err) {
            notify.error(err.message);
        } finally {
            setScheduling(false);
        }
    };

    const handlePublishSchedule = async () => {
        const confirmed = window.confirm(
            'A publikálás után a sorsolás nem generálható újra, és a szezon aktív lesz. Folytatod?',
        );
        if (!confirmed) return;

        try {
            setPublishing(true);
            notify.clear();
            const data = await adminFetch('/api/admin/publish-schedule', {
                method: 'POST',
                body: { seasonId: season.id },
                errorMessage: 'Hiba a sorsolás publikálásakor',
            });

            onSeasonUpdated(season.id, { status: 'active' });
            notify.success(
                `Sorsolás publikálva: ${data.leagueCount} liga, ${data.publishedMatchCount} mérkőzés.`,
            );
        } catch (err) {
            notify.error(err.message);
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="admin-card">
            <h3>Ütemezés generálása</h3>

            <div className="schedule-info">
                <p>Ütemezés a kiválasztott szezon minden ligájára készül el, a nevezett csapatokkal.</p>
                {season.status === 'setup' && (
                    <p>Generálni a nevezés lezárása után lehet (Szezonok fül).</p>
                )}
                <p>Pályák konfigurálva: {pitchCount}</p>
                <p>Időpontok konfigurálva: {timeSlotCount}</p>
                <button
                    onClick={handleGenerateSchedule}
                    className="btn-primary"
                    disabled={scheduling || !canGenerate || timeSlotCount === 0}
                >
                    {scheduling ? 'Generálás folyamatban...' : 'Ütemezés generálása'}
                </button>
            </div>

            {hasCurrentSchedule && (
                <div className="schedule-info">
                    {isSeasonPublished ? (
                        <p>A sorsolás publikálva van, a mérkőzések bekerültek a rendszerbe.</p>
                    ) : (
                        <>
                            <p>
                                A publikálás a jelenlegi ütemezést valódi mérkőzésekké alakítja,
                                és a szezon aktív lesz. Utána a sorsolás nem generálható újra.
                            </p>
                            <button
                                onClick={handlePublishSchedule}
                                className="btn-primary"
                                disabled={publishing || season.status !== 'generated'}
                            >
                                {publishing ? 'Publikálás folyamatban...' : 'Sorsolás publikálása'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {hasCurrentSchedule && (
                <div className="schedule-info">
                    {PUBLIC_STATUSES.includes(season.status) ? (
                        <Link href={`/schedule?seasonId=${season.id}`} className="btn-primary">
                            Sorsolás megtekintése
                        </Link>
                    ) : (
                        <p>A sorsolás az első sikeres generálás után lesz nyilvános.</p>
                    )}
                </div>
            )}

            {schedules.length > 0 && (
                <div className="schedules-history">
                    <h4>Generálási előzmények</h4>
                    <div className="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>Generálva</th>
                                    <th>Liga</th>
                                    <th>Elégedettség %</th>
                                    <th>Állapot</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedules.map((schedule) => (
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
                </div>
            )}
        </div>
    );
}
