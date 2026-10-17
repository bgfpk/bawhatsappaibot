export type CrmPipelineStageActionId = "next" | "contacted" | "quotation" | "follow_up" | "won" | "lost";

export const CRM_PIPELINE_STAGE_ACTIONS: Array<{ id: CrmPipelineStageActionId; label: string }> = [
  { id: "next", label: "Next" },
  { id: "contacted", label: "Contacted" },
  { id: "quotation", label: "Quotation" },
  { id: "follow_up", label: "Follow-up" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const NEXT_STAGE: Record<string, { status: string; dealStage: string }> = {
  new: { status: "Contacted", dealStage: "Lead" },
  contacted: { status: "Quotation Needed", dealStage: "Quotation" },
  quotation: { status: "Negotiation", dealStage: "Negotiation" },
  negotiation: { status: "Payment Pending", dealStage: "Payment" },
  payment: { status: "Order Confirmed", dealStage: "Order Confirmed" },
};

export function crmPipelineColumnId(lead: any) {
  if (lead.status === "Lost" || lead.status === "Invalid" || lead.dealStage === "Lost" || lead.dealStage === "Cancelled") return "lost";
  if (lead.status === "Completed" || lead.dealStage === "Completed" || lead.status === "Order Confirmed" || lead.dealStage === "Order Confirmed") return "won";
  if (lead.status === "Payment Pending" || lead.dealStage === "Payment") return "payment";
  if (lead.status === "Negotiation" || lead.dealStage === "Negotiation") return "negotiation";
  if (lead.status === "Quotation Needed" || lead.status === "Quotation Sent" || lead.dealStage === "Quotation") return "quotation";
  if (["AI Replied", "Assigned", "Contacted", "Call Required", "Not Answered", "Interested"].includes(lead.status)) return "contacted";
  return "new";
}

export function buildCrmPipelineStagePatch(lead: any, actionId: CrmPipelineStageActionId) {
  if (actionId === "contacted") return { status: "Contacted", dealStage: lead.dealStage || "Lead" };
  if (actionId === "quotation") return { status: "Quotation Needed", dealStage: "Quotation" };
  if (actionId === "follow_up") return { status: "Call Required", dealStage: lead.dealStage || "Lead" };
  if (actionId === "won") return { status: "Order Confirmed", dealStage: "Order Confirmed" };
  if (actionId === "lost") return { status: "Lost", dealStage: "Lost" };
  return NEXT_STAGE[crmPipelineColumnId(lead)] || { status: lead.status || "Contacted", dealStage: lead.dealStage || "Lead" };
}
