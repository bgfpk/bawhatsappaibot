export type IntegrationStatus = "Supported" | "Where Configured" | "Where Configured and Supported" | "Public Developer Interface";

export type PublicIntegration = {
  name: string;
  description: string;
  status: IntegrationStatus;
};

export const AVAILABLE_INTEGRATIONS: PublicIntegration[] = [
  { name: "WooCommerce", description: "Configured product catalog details and workspace order context where available.", status: "Where Configured" },
  { name: "WordPress & Website Knowledge", description: "Configured website pages and policies for grounded customer replies.", status: "Where Configured" },
  { name: "PostEx Courier", description: "Query delivery tracking status updates for active orders where configured.", status: "Where Configured and Supported" },
  { name: "Leopards Courier", description: "Retrieve tracking information for supported consignment numbers where configured.", status: "Where Configured and Supported" },
  { name: "Public REST API", description: "Connect custom web forms and business software using REST API endpoints.", status: "Public Developer Interface" },
  { name: "Event Webhooks", description: "Configure spreadsheet destination URLs and handle inbound billing callbacks.", status: "Public Developer Interface" },
];

export const PLANNED_INTEGRATIONS: PublicIntegration[] = [];
