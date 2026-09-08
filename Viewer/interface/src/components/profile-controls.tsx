import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@base-ui/react/switch';
import { Radio, Settings2 } from 'lucide-react';
import { Select } from './ui/select';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import i18n from '../i18n';
import { notify } from './feedback/overlays';

export type SelectProps = Parameters<typeof Select>[0];
export function mountSelect(element: HTMLElement, props: SelectProps) {
    const root = createRoot(element);
    const update = (next: SelectProps) => root.render(<div className="replay-interface control-host"><Select {...next} /></div>);
    update(props); return { update, unmount: () => root.unmount() };
}
export function mountSwitch(element: HTMLElement, checked: boolean, onChange: (value: boolean) => void, label: string) {
    const root = createRoot(element);
    const update = (value: boolean, text: string) => root.render(<div className="replay-interface control-host"><Switch.Root className="ui-switch" checked={value} onCheckedChange={onChange} aria-label={text}><Switch.Thumb className="ui-switch-thumb" /></Switch.Root></div>);
    update(checked, label); return { update, unmount: () => root.unmount() };
}
export function LanguageSettings() {
    const { t } = useTranslation();
    return <label className="setting-field"><span>{t('language')}</span><Select label={t('language')} value={i18n.language} onChange={value => void i18n.changeLanguage(value)} options={[{ value: 'en', label: 'English' }, { value: 'zh-CN', label: i18n.t('languageName', { lng: 'zh-CN' }) }]} /><small>{t('languageHint')}</small></label>;
}
export function SettingsButton() {
    const { t } = useTranslation(); const [open, setOpen] = useState(false);
    return <><Button variant="ghost" onClick={() => setOpen(true)}><Settings2 />{t('settings')}</Button><Modal open={open} onClose={() => setOpen(false)} title={t('settings')}><div className="dialog-content"><LanguageSettings /></div></Modal></>;
}
export function mountLanguage(element: HTMLElement) { const root = createRoot(element); root.render(<div className="replay-interface control-host"><LanguageSettings /></div>); return () => root.unmount(); }
function Connection({ connect, status }: { connect(id: string): Promise<void>; status: string }) {
    const { t } = useTranslation(); const [open, setOpen] = useState(false), [id, setId] = useState(''), [busy, setBusy] = useState(false);
    return <><Button variant="ghost" onClick={() => setOpen(true)}><Radio />{t('live')}</Button><Modal open={open} onClose={() => setOpen(false)} title={t('live')} description={t('liveHint')}>
        <form className="dialog-content" noValidate onSubmit={e => { e.preventDefault(); if (!/^\d{17}$/.test(id.trim())) { notify(t('invalidSteamId')); return; } setBusy(true); void connect(id.trim()).catch(error => notify(String(error))).finally(() => setBusy(false)); }}>
            <div className="connection-row">
                <label className="setting-field">Steam ID<Input value={id} onChange={e => setId(e.target.value)} autoComplete="off" placeholder="7656…" /></label>
                <p className="connection-status" role="status">{status}</p>
                <Button disabled={busy} type="submit">{t('connect')}</Button>
            </div>
        </form></Modal></>;
}
export function mountConnection(element: HTMLElement, connect: (id: string) => Promise<void>, status: string) {
    const root = createRoot(element); const update = (value: string) => root.render(<div className="replay-interface control-host"><Connection connect={connect} status={value} /></div>);
    update(status); return { update, unmount: () => root.unmount() };
}
