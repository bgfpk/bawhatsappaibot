import React from "react";
import { DEFAULT_CRM_STAGES, groupCustomersByStage } from "./crm-model";
import { DashboardPageHeader, ToneBadge } from "../components/dashboard/DashboardPrimitives";
import { Kanban, ArrowRight, UserCheck, Bot } from "lucide-react";

export interface CrmPipelineProps {
  customers: any[];
  onSelectCustomer: (customer: any) => void;
  onUpdateStage?: (customerId: string, newStage: string) => Promise<void> | void;
}

export const CrmPipeline: React.FC<CrmPipelineProps> = ({
  customers = [],
  onSelectCustomer,
  onUpdateStage,
}) => {
  const grouped = groupCustomersByStage(customers);

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Pipeline"
        title="CRM & Lead Pipeline"
        description="Visual deal lifecycle management for WhatsApp leads, online inquiries, and direct orders."
        icon={Kanban}
      />

      <div className="grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-3 lg:grid-cols-6 custom-scrollbar pb-2">
        {DEFAULT_CRM_STAGES.map((stage) => {
          const stageCustomers = grouped[stage.id] || [];

          return (
            <div
              key={stage.id}
              className="flex min-w-[220px] flex-col rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-3 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between border-b border-[var(--ca-border-subtle)] pb-2">
                <h4 className="text-xs font-black tracking-tight text-[var(--ca-text-primary)]">
                  {stage.name}
                </h4>
                <span className="rounded-full bg-[var(--ca-surface-2)] px-2 py-0.5 text-[10px] font-black text-[var(--ca-text-muted)]">
                  {stageCustomers.length}
                </span>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5">
                {stageCustomers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--ca-border-subtle)] p-4 text-center text-[11px] font-medium text-[var(--ca-text-muted)]">
                    No leads in this stage
                  </div>
                ) : (
                  stageCustomers.map((cust, idx) => {
                    const name = cust.name || cust.profile?.customerName || "Lead " + String(cust.$id || idx).slice(-4);
                    const phone = cust.phone || cust.customer_id || "No phone";
                    const isHuman = Boolean(cust.profile?.manualReviewRequired);
                    const isPaused = Boolean(cust.profile?.aiPaused);

                    return (
                      <div
                        key={cust.$id || idx}
                        onClick={() => onSelectCustomer(cust)}
                        className="group cursor-pointer rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3 shadow-sm transition-all hover:border-emerald-500 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <h5 className="truncate text-xs font-black text-[var(--ca-text-primary)]">
                            {name}
                          </h5>
                          {isHuman ? (
                            <ToneBadge tone="blue" className="text-[9px] py-0 px-1.5">
                              Human
                            </ToneBadge>
                          ) : isPaused ? (
                            <ToneBadge tone="neutral" className="text-[9px] py-0 px-1.5">
                              Paused
                            </ToneBadge>
                          ) : (
                            <ToneBadge tone="teal" className="text-[9px] py-0 px-1.5">
                              AI
                            </ToneBadge>
                          )}
                        </div>

                        <p className="mt-1 font-mono text-[10px] font-semibold text-[var(--ca-text-muted)]">
                          {phone}
                        </p>

                        <div className="mt-2 flex items-center justify-between pt-2 border-t border-[var(--ca-border-subtle)]">
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline">
                            Customer 360
                          </span>
                          <ArrowRight className="h-3 w-3 text-[var(--ca-text-muted)] group-hover:text-emerald-500" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
