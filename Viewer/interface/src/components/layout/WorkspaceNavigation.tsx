import { ListFilter, Bookmark, BarChart3, Users, Search, MessageSquare, Info, Settings2, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { t } from '../../i18n';

const sections = [
    { title: 'analysis', items: [['events', ListFilter], ['notes', Bookmark], ['stats', BarChart3], ['players', Users], ['finder', Search]] },
    { title: 'workspace', items: [['exports', Download], ['chat', MessageSquare], ['info', Info], ['settings', Settings2]] }
] as const;
export const panelLabel = (key: string) => t(key === 'notes' ? 'bookmarks' : key === 'stats' ? 'statistics' : key);

export function WorkspaceNavigation({ active, onChange }: { active?: string; onChange(page?: string): void }) {
    const { t } = useTranslation();
    return <nav className="replay-interface workspace-nav" aria-label={t('workspace')}>
        {sections.map(group => <div key={group.title}><small>{t(group.title)}</small>
            {group.items.map(([key, Icon]) => <Button key={key} variant="ghost" aria-label={panelLabel(key)} title={panelLabel(key)} aria-pressed={active === key} aria-expanded={active === key} onClick={() => onChange(active === key ? undefined : key)}>
                <Icon /><span>{panelLabel(key)}</span>
            </Button>)}
        </div>)}
    </nav>;
}
