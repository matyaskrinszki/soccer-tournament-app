'use client';

import './page.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/client-auth';
import { useAuth } from '../components/AuthContext';

export default function PlayersBrowsePage() {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [captainTeam, setCaptainTeam] = useState(null);
    const { isLoggedIn, playerId: currentPlayerId } = useAuth();
    const [isCaptain, setIsCaptain] = useState(false);
    const [recruitingId, setRecruitingId] = useState(null);
    const [recruitError, setRecruitError] = useState('');
    const [invitedPlayerIds, setInvitedPlayerIds] = useState([]);
    const [successRecruitingId, setSuccessRecruitingId] = useState(null);

    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await fetch('/api/players');
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a játékosok betöltésekor');
                }
                setPlayers(data.players || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPlayers();
    }, []);

    useEffect(() => {
        const resolveCurrentPlayer = async () => {
            if (!isLoggedIn || !currentPlayerId) {
                setIsCaptain(false);
                setCaptainTeam(null);
                return;
            }

            /*
                Check if section can be made simpler by using a single API call
                that returns player's team and captaincy info together with player details, 
                instead of having to fetch teams list and find the captaincy info on the client side. 
                This would also reduce the amount of data transferred, 
                since we don't need the whole teams list on the client side.
            */
            try {
                const res = await fetch('/api/teams-list');
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Hiba történt a csapatok lekérdezésekor');
                }

                const team = (data.teams || []).find((t) => Number(t.captainPlayerId) === Number(currentPlayerId));
                if (team) {
                    setIsCaptain(true);
                    setCaptainTeam({
                        id: team.id,
                        name: team.name,
                        leagueName: team.leagueName,
                    });
                } else {
                    setIsCaptain(false);
                    setCaptainTeam(null);
                }
            } catch (err) {
                setIsCaptain(false);
                setCaptainTeam(null);
            }
        };

        resolveCurrentPlayer();
    }, [isLoggedIn, currentPlayerId]);

    useEffect(() => {
        const fetchInvitedPlayers = async () => {
            if (!captainTeam || !isLoggedIn) {
                setInvitedPlayerIds([]);
                return;
            }

            try {
                const res = await fetch(`/api/recruitment-invitations?teamId=${captainTeam.id}`, {
                    headers: getAuthHeaders(),
                });
                const data = await res.json();
                if (res.ok && data.invitedPlayerIds) {
                    setInvitedPlayerIds(data.invitedPlayerIds);
                } else {
                    setInvitedPlayerIds([]);
                }
            } catch (err) {
                setInvitedPlayerIds([]);
            }
        };

        fetchInvitedPlayers();
    }, [captainTeam, isLoggedIn]);

    useEffect(() => {
        if (successRecruitingId === null) return;

        const timer = setTimeout(() => {
            setSuccessRecruitingId(null);
        }, 2000);

        return () => clearTimeout(timer);
    }, [successRecruitingId]);

    const handleRecruit = async (player) => {
        if (!captainTeam || !currentPlayerId || recruitingId) return;
        setRecruitError('');
        setRecruitingId(player.id);

        try {
            const res = await fetch(`/api/recruitment-invitations`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    playerId: player.id,
                    teamId: captainTeam.id,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Nem sikerült a meghívót elküldeni');
            }

            setInvitedPlayerIds(prev => [...prev, player.id]);
            
            setSuccessRecruitingId(player.id);
        } catch (err) {
            setRecruitError(err.message);
        } finally {
            setRecruitingId(null);
        }
    };

    return (
        <div className="players-page">
            <main className="players-container">
                <header className="players-header">
                    <div>
                        <p className="eyebrow">Játékosok</p>
                        <h1>Játékosok böngészése</h1>
                        <p className="subhead">Név szerint rendezett lista. Kattints egy játékosra a részletekért.</p>
                    </div>
                </header>

                {loading && (
                    <div className="players-card">
                        <p>Játékosok betöltése...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="players-card error">
                        <p>{error}</p>
                    </div>
                )}

                {recruitError && !loading && !error && (
                    <div className="players-card error">
                        <p>{recruitError}</p>
                    </div>
                )}

                {!loading && !error && players.length === 0 && (
                    <div className="players-card empty">
                        <p>Nincs elérhető játékos.</p>
                    </div>
                )}

                {!loading && !error && players.length > 0 && (
                    <section className="players-list">
                        {players.map((player) => (
                            <div key={player.id} className="player-row">
                                <Link href={`/players/${player.id}`} className="player-link">
                                    <div>
                                        <h3>{player.name || "Nincs név"}</h3>
                                        {player.team ? (
                                            <p className="player-meta">Csapat: {player.team.name}</p>
                                        ) : (
                                            <p className="player-meta">Csapat: Nincs csapata</p>
                                        )}
                                    </div>
                                </Link>
                                { /* Check successRecruitingId necessity */ }
                                {isLoggedIn && isCaptain && !player.team && (!invitedPlayerIds.includes(player.id) || successRecruitingId === player.id) && (
                                    <button
                                        type="button"
                                        className={`recruit-player-btn${successRecruitingId === player.id ? ' success' : ''}`}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            handleRecruit(player);
                                        }}
                                        disabled={Boolean(recruitingId) || successRecruitingId === player.id}
                                    >
                                        {successRecruitingId === player.id ? 'Sikeres' : (recruitingId === player.id ? 'Meghívás...' : 'Meghívás')}
                                    </button>
                                )}
                            </div>
                        ))}
                    </section>
                )}
            </main>
        </div>
    );
}
