'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Whether the previous entry in this tab's history is a page of this app.
 * navigation.entries() only lists the same-origin entries next to the current
 * one, so index > 0 means "back" stays inside the app. Browsers without the
 * Navigation API get the fallback link.
 * @returns {boolean}
 */
function canGoBackInApp() {
    return (window.navigation?.currentEntry?.index ?? 0) > 0;
}

/**
 * "Vissza" link: goes back to the previous page of the app, or to fallbackHref
 * when the page was opened directly (pasted link, new tab, bookmark).
 * Ctrl/Cmd/Shift-clicks keep the normal link behaviour (open fallbackHref).
 * @param {Object} props
 * @param {string} props.fallbackHref
 */
export default function BackLink({ fallbackHref }) {
    const router = useRouter();

    const handleClick = (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (!canGoBackInApp()) return;
        event.preventDefault();
        router.back();
    };

    return (
        <Link href={fallbackHref} onClick={handleClick}>
            Vissza
        </Link>
    );
}
