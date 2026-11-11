import './CalendarExport.css';

/**
 * Download link for a team's matches as an .ics file (GET /api/teams/[id]/calendar),
 * with a hint on importing it into Google Calendar.
 */
export default function CalendarExport({ teamId }) {
    return (
        <div className="calendar-export">
            <a className="calendar-export-btn" href={`/api/teams/${teamId}/calendar`} download>
                Mérkőzések exportálása (Google Naptár)
            </a>
            <p className="calendar-export-hint">
                Google Naptárban: Beállítások → Importálás és exportálás → Importálás, majd válaszd
                ki a letöltött .ics fájlt.
            </p>
        </div>
    );
}
