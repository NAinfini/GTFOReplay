import { useState } from 'react';
import { Terminal, ListFilter, Bookmark, BarChart3, Users, Search, MessageSquare, Info, Settings2, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { t } from '../../i18n';

const sections = [
    { title: 'analysis', items: [['events', ListFilter], ['notes', Bookmark], ['stats', BarChart3], ['players', Users], ['finder', Search]] },
    { title: 'workspace', items: [['exports', Download], ['chat', MessageSquare], ['info', Info], ['logs', Terminal], ['settings', Settings2]] }
] as const;
export const panelLabel = (key: string) => t(key === 'notes' ? 'bookmarks' : key === 'stats' ? 'statistics' : key);

export function WorkspaceNavigation({ active, onChange }: { active?: string; onChange(page?: string): void }) {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('gtfo-replay.sidebar-collapsed') === 'true');
    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('gtfo-replay.sidebar-collapsed', String(next));
    };
    return <nav className="replay-interface workspace-nav" data-collapsed={collapsed} aria-label={t('workspace')}>
        <Button className="sidebar-toggle" variant="ghost" aria-label={t(collapsed ? 'expandSidebar' : 'collapseSidebar')} title={t(collapsed ? 'expandSidebar' : 'collapseSidebar')} aria-expanded={!collapsed} onClick={toggle}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span>{t('sidebar')}</span>
        </Button>
        {sections.map(group => <div key={group.title}><small>{t(group.title)}</small>
            {group.items.map(([key, Icon]) => <Button key={key} variant="ghost" aria-label={panelLabel(key)} title={panelLabel(key)} aria-pressed={active === key} aria-expanded={active === key} onClick={() => onChange(active === key ? undefined : key)}>
                <Icon /><span>{panelLabel(key)}</span>
            </Button>)}
        </div>)}
    </nav>;
}
