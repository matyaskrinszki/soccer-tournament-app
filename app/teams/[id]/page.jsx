'use client';

import { useParams } from 'next/navigation';
import TeamClient from './TeamClient';
import './team.css';

export default function TeamPage() {
    const params = useParams();
    const id = params?.id;
    return <TeamClient id={id} />;
}
