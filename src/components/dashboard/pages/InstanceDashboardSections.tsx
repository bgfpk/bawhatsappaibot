import React from "react";
import { Activity, Layers, QrCode, Terminal, Zap } from "lucide-react";
import { SectionHeader, SettingsCard } from "../DashboardPrimitives";

type InstanceSectionProps = {
  children: React.ReactNode;
};

function InstanceSection({
  title,
  description,
  icon,
  children,
}: InstanceSectionProps & {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <SettingsCard>
      <SectionHeader title={title} description={description} icon={icon} />
      {children}
    </SettingsCard>
  );
}

export function ConnectionOverview({ children }: InstanceSectionProps) {
  return (
    <InstanceSection title="WhatsApp Connection" description="Connection status, QR setup, reconnect state, and quick health signals." icon={QrCode}>
      {children}
    </InstanceSection>
  );
}

export function QuickActions({ children }: InstanceSectionProps) {
  return (
    <InstanceSection title="Quick Actions" description="Daily controls for language, engine state, template reloads, and sync." icon={Zap}>
      {children}
    </InstanceSection>
  );
}

export function SequencesMediaGroups({ children }: InstanceSectionProps) {
  return (
    <InstanceSection title="Saved Replies & Flows" description="Connect WhatsApp content groups for welcome flows, reusable replies, and media content." icon={Layers}>
      {children}
    </InstanceSection>
  );
}

export function LiveMonitor({ children }: InstanceSectionProps) {
  return (
    <InstanceSection title="Bot Activity" description="Incoming customer activity and live bot events for the selected WhatsApp number." icon={Terminal}>
      {children}
    </InstanceSection>
  );
}

export function DangerZone({ children }: InstanceSectionProps) {
  return (
    <InstanceSection title="Advanced / Danger Zone" description="Destructive or session-reset actions that should stay away from daily workflows." icon={Activity}>
      {children}
    </InstanceSection>
  );
}
