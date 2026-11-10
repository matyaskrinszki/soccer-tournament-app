'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '../admin-api';

export default function OverviewTab({ onOpenTab }) {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        adminFetch('/api/admin/stats', { errorMessage: 'Hiba az adatok betöltésekor' })
            .then((data) => {
                if (!cancelled) setStats(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (error) {
        return <div className="admin-card error"><p>{error}</p></div>;
    }

    if (!stats) {
        return <div className="admin-card"><p>Betöltés...</p></div>;
    }

    const { matches } = stats;

    return (
        <>
            <div className="admin-overview">
                <StatCard label="Játékosok" value={stats.players} />
                <StatCard label="Csapatok" value={stats.teams} detail={`${stats.leagues} ligában`} />
                <StatCard
                    label="Szezonok"
                    value={stats.seasons}
                    detail={`${stats.activeSeasons} aktív`}
                />
                <StatCard
                    label="Mérkőzések"
                    value={matches.total}
                    detail={`${matches.finished} lejátszott · ${matches.upcoming} hátralévő`}
                />
                <StatCard label="Függő csatlakozási kérelmek" value={stats.pendingJoinRequests} />
                <StatCard label="Eredmény-eltérések" value={matches.mismatches} />
            </div>

            {matches.mismatches > 0 && (
                <div className="admin-card attention">
                    <p>
                        <strong>{matches.mismatches}</strong> mérkőzésnél eltér a két kapitány
                        által jelentett eredmény.
                    </p>
                    <button className="btn-primary" onClick={() => onOpenTab('results')}>
                        Eltérések megtekintése
                    </button>
                </div>
            )}

            {matches.awaitingResult > 0 && (
                <div className="admin-card attention">
                    <p>
                        <strong>{matches.awaitingResult}</strong> lejátszott mérkőzésnek még nincs
                        rögzített eredménye.
                    </p>
                    <button className="btn-primary" onClick={() => onOpenTab('results')}>
                        Eredmények rögzítése
                    </button>
                </div>
            )}
        </>
    );
}

function StatCard({ label, value, detail }) {
    return (
        <div className="stat-card">
            <h3>{label}</h3>
            <p className="stat-number">{value}</p>
            {detail && <p className="stat-detail">{detail}</p>}
        </div>
    );
}
