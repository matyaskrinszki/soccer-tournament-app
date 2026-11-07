'use client';

import './SeasonPicker.css';

const STATUS_LABELS = {
    active: 'folyamatban',
    completed: 'lezárult',
};

/**
 * Label of a season as returned by the API (see lib/seasons.js)
 * @param {{name: string, status: string, isSample: boolean}} season
 * @returns {string}
 */
export function seasonLabel(season) {
    const status = STATUS_LABELS[season.status];
    return status ? `${season.name} (${status})` : season.name;
}

/**
 * Season dropdown for the public pages. Shows a "Mintaadat" badge when the
 * selected season is the seeded sample season.
 * @param {Object} props
 * @param {Object[]} props.seasons - Seasons with matches, default first
 * @param {Object|null} props.season - The season shown
 * @param {(seasonId: number) => void} props.onChange
 */
export default function SeasonPicker({ seasons, season, onChange }) {
    if (!season) return null;

    return (
        <div className="public-season-picker">
            <label htmlFor="season-select">Szezon</label>
            <select
                id="season-select"
                value={season.id}
                onChange={(event) => onChange(Number(event.target.value))}
            >
                {seasons.map((option) => (
                    <option key={option.id} value={option.id}>
                        {seasonLabel(option)}
                    </option>
                ))}
            </select>
            {season.isSample && <SampleBadge />}
        </div>
    );
}

export function SampleBadge() {
    return (
        <span
            className="sample-badge"
            title="Bemutató adatok, amíg nincs lejátszott valódi szezon"
        >
            Mintaadat
        </span>
    );
}
