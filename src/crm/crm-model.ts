export interface CrmStageItem {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_CRM_STAGES: CrmStageItem[] = [
  { id: "new_lead", name: "New Lead", color: "blue" },
  { id: "contacted", name: "Contacted", color: "amber" },
  { id: "qualified", name: "Qualified", color: "teal" },
  { id: "order_placed", name: "Order Placed", color: "emerald" },
  { id: "delivered", name: "Delivered", color: "green" },
  { id: "cancelled", name: "Cancelled / Lost", color: "rose" },
];

export function groupCustomersByStage(customers: any[], stages = DEFAULT_CRM_STAGES) {
  const map: Record<string, any[]> = {};
  for (const s of stages) {
    map[s.id] = [];
  }

  for (const c of customers) {
    const stageId = c?.crm_stage || c?.profile?.crmStage || "new_lead";
    if (map[stageId]) {
      map[stageId].push(c);
    } else {
      map["new_lead"].push(c);
    }
  }

  return map;
}
