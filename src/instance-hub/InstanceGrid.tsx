import React from "react";
import { InstanceCard, type InstanceCardData } from "./InstanceCard";

export interface InstanceGridProps {
  instances: InstanceCardData[];
  selectedInstanceId?: string | null;
  onSelectInstance: (id: string) => void;
  onToggleActive: (id: string, currentActive: number, e: React.MouseEvent) => void;
  onRenameInstance: (id: string, currentName: string, e: React.MouseEvent) => void;
  onResetLogin: (id: string, e: React.MouseEvent) => void;
  onDeleteInstance: (id: string, e: React.MouseEvent) => void;
  onSetSystemAlertBot?: (id: string, e: React.MouseEvent) => void;
  isSuperAdmin?: boolean;
}

export const InstanceGrid: React.FC<InstanceGridProps> = ({
  instances,
  selectedInstanceId,
  onSelectInstance,
  onToggleActive,
  onRenameInstance,
  onResetLogin,
  onDeleteInstance,
  onSetSystemAlertBot,
  isSuperAdmin = false,
}) => {
  if (instances.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {instances.map((inst) => (
        <InstanceCard
          key={inst.id}
          instance={inst}
          allInstances={instances}
          isSelected={selectedInstanceId === inst.id}
          onSelect={onSelectInstance}
          onToggleActive={onToggleActive}
          onRename={onRenameInstance}
          onResetLogin={onResetLogin}
          onDelete={onDeleteInstance}
          onSetSystemAlertBot={onSetSystemAlertBot}
          isSuperAdmin={isSuperAdmin}
        />
      ))}
    </div>
  );
};
