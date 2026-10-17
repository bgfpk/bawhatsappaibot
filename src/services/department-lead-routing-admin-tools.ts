/**
 * Department Lead Routing Admin Assistant Tools
 * 
 * Provides server-authoritative Admin BA tools allowing authorized owners/admins
 * to view departments, check routing audit status, and manually reassign leads
 * to different departments with full tenant isolation and audit history.
 */

import { registerAdminAction } from "./admin-action-registry-service.ts";
import {
  listDepartments,
  getDepartment,
  listAuditRecords,
  reassignLeadDepartment,
} from "./department-lead-routing-service.ts";

registerAdminAction({
  actionId: "list_departments",
  category: "lead_routing",
  label: "List Lead Routing Departments",
  description: "Lists all configured departments for lead routing, showing department name, responsibility description, WhatsApp destination, and fallback status.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "lead_departments_listed",
  handler: async (context) => {
    const departments = await listDepartments(context.accountId);
    if (departments.length === 0) {
      return {
        success: true,
        message: "📋 *Lead Routing Departments*\n\nNo departments are currently configured. You can create departments in Settings -> Lead Routing / Departments.",
        data: { departments: [] },
      };
    }

    const lines = departments.map((d, i) => {
      const statusIcon = d.enabled ? "🟢" : "⚪";
      const fallbackBadge = d.isFallback ? " *(Fallback)*" : "";
      return `${i + 1}. ${statusIcon} *${d.name}*${fallbackBadge}\n   • Dest: \`${d.whatsappNumberNormalized}\`\n   • Handles: ${d.description}`;
    });

    return {
      success: true,
      message: `📋 *Configured Departments (${departments.length})*\n\n${lines.join("\n\n")}`,
      data: { departments },
    };
  },
});

registerAdminAction({
  actionId: "get_lead_routing_status",
  category: "lead_routing",
  label: "Get Lead Routing Status",
  description: "Retrieves recent lead routing records and forwarding audit status for this business account.",
  riskLevel: "READ",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "lead_routing_status_inspected",
  handler: async (context, params) => {
    const records = listAuditRecords(context.accountId);
    const targetLeadId = params?.leadId ? String(params.leadId).trim() : undefined;

    const filtered = targetLeadId
      ? records.filter((r) => r.leadId === targetLeadId)
      : records.slice(0, 10);

    if (filtered.length === 0) {
      return {
        success: true,
        message: targetLeadId
          ? `ℹ️ No routing audit records found for lead *${targetLeadId}*.`
          : "ℹ️ No leads have been routed yet.",
        data: { records: [] },
      };
    }

    const items = filtered.map((r) => {
      const statusBadge =
        r.status === "forwarded" ? "✅ Forwarded" :
        r.status === "failed" ? "❌ Failed" :
        r.status === "unassigned" ? "⚠️ Unassigned" :
        r.status === "pending_contact_number" ? "⏳ Pending Phone" : `🔄 ${r.status}`;
      return `• Lead *#${r.leadId}* (${r.leadName || "Customer"}) → *${r.departmentName || "Unassigned"}* [${statusBadge}]\n  Phone: ${r.customerPhone || "N/A"} | Dest: ${r.destinationPhone || "N/A"}`;
    });

    return {
      success: true,
      message: `📊 *Lead Routing Records (${filtered.length})*\n\n${items.join("\n")}`,
      data: { records: filtered },
    };
  },
});

registerAdminAction({
  actionId: "reassign_lead_department",
  category: "lead_routing",
  label: "Reassign Lead Department",
  description: "Manually reassigns a lead to a new department and forwards the grounded lead summary to the new department's WhatsApp number.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "admin",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "lead_manually_reassigned",
  handler: async (context, params) => {
    const leadId = String(params?.leadId || "").trim();
    const departmentId = String(params?.departmentId || params?.newDepartmentId || "").trim();
    const reason = params?.reason ? String(params.reason).trim() : "Admin manual reassignment";

    if (!leadId) {
      return { success: false, message: "❌ Lead ID is required for reassignment.", error: "MISSING_LEAD_ID" };
    }
    if (!departmentId) {
      return { success: false, message: "❌ Target Department ID is required.", error: "MISSING_DEPARTMENT_ID" };
    }

    const targetDept = await getDepartment(context.accountId, departmentId);
    if (!targetDept) {
      return { success: false, message: `❌ Department "${departmentId}" not found for this account.`, error: "DEPT_NOT_FOUND" };
    }

    try {
      const result = await reassignLeadDepartment(
        context.accountId,
        context.botId,
        leadId,
        departmentId,
        context.adminRole,
        reason
      );

      if (result.success) {
        return {
          success: true,
          message: `✅ *Lead Reassigned Successfully*\n\nLead *#${leadId}* has been reassigned to *${targetDept.name}* (\`${targetDept.whatsappNumberNormalized}\`). Summary has been forwarded.`,
          data: { auditRecord: result.auditRecord },
        };
      } else {
        return {
          success: false,
          message: `⚠️ *Reassignment Incomplete*\n\nLead *#${leadId}* updated to *${targetDept.name}*, but WhatsApp forwarding failed: ${result.auditRecord?.failureReason || "Transport error"}.`,
          error: result.auditRecord?.failureReason,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `❌ Failed to reassign lead: ${err?.message || "Unknown error"}`,
        error: err?.message,
      };
    }
  },
});
