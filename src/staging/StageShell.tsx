import React from 'react';
import { Link, NavLink } from 'react-router-dom';
export const campaignPages = [
  ['overview', 'Overview'],
  ['whatsapp-numbers', 'WhatsApp Numbers'],
  ['ai-assistant', 'AI Assistant'],
  ['products-services', 'Products & Services'],
  ['automations', 'Automations'],
  ['follow-ups', 'Follow-ups'],
  ['outbound', 'Outbound'],
  ['media-library', 'Media Library'],
  ['analytics', 'Analytics'],
  ['settings', 'Campaign Settings'],
] as const;
export function StageShell({
  children,
  email,
  campaign,
  onSignOut,
}: {
  children: React.ReactNode;
  email: string;
  onSignOut: () => void;
  campaign?: { id: string; name: string };
}) {
  const links = campaign
    ? campaignPages.map(([slug, title]) => ['/campaigns/' + campaign.id + '/' + slug, title])
    : [
        ['/', 'Account Home'],
        ['/campaigns', 'My Campaigns'],
        ['/whatsapp-numbers', 'WhatsApp Numbers'],
        ['/settings', 'Account Settings'],
        ['/recently-deleted', 'Recently Deleted'],
      ];
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link to="/campaigns" className="wordmark">
          <span className="brand-symbol">↗</span>BLACK ARROW
        </Link>
        {campaign && (
          <Link className="back-link" to="/campaigns">
            ← Back to My Campaigns
          </Link>
        )}
        <span className="nav-label">{campaign ? campaign.name : 'YOUR ACCOUNT'}</span>
        <nav aria-label={campaign ? 'Campaign navigation' : 'Account navigation'}>
          {links.map(([path, title]) => <NavLink key={path} to={path} end className={({ isActive }) => isActive ? 'active' : ''}>{title}</NavLink>)}
        </nav>
        <div className="sidebar-footer">Private workspace</div>
      </aside>
      <div className="workspace-main">
        <header>
          <span className="muted">{campaign?.name ?? 'Your account'}</span>
          <div className="account"><span>{email}</span><button className="quiet-button" onClick={onSignOut}>Sign out</button></div>
        </header>
        <main className="page-content">{children}</main>
        <footer>
          Black Arrow<span>Private business management</span>
        </footer>
      </div>
    </div>
  );
}
