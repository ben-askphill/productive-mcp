#!/usr/bin/env node
/**
 * Productive Time Tracking MCP Server
 *
 * An MCP server for managing time entries and timers in Productive.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration from environment variables
const API_TOKEN = process.env.PRODUCTIVE_API_TOKEN || "";
const ORGANIZATION_ID = process.env.PRODUCTIVE_ORGANIZATION_ID || "";
const USER_ID = process.env.PRODUCTIVE_USER_ID || "";
const BASE_URL = "https://api.productive.io/api/v2";

function getHeaders(): HeadersInit {
  return {
    "Content-Type": "application/vnd.api+json",
    "X-Auth-Token": API_TOKEN,
    "X-Organization-Id": ORGANIZATION_ID,
  };
}

function checkConfig(): string | null {
  const missing: string[] = [];
  if (!API_TOKEN) missing.push("PRODUCTIVE_API_TOKEN");
  if (!ORGANIZATION_ID) missing.push("PRODUCTIVE_ORGANIZATION_ID");
  if (!USER_ID) missing.push("PRODUCTIVE_USER_ID");
  if (missing.length > 0) {
    return `Missing environment variables: ${missing.join(", ")}`;
  }
  return null;
}

// Helper to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// =============================================================================
// API Functions
// =============================================================================

async function listProjects(
  status: string = "active",
  search?: string
): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const params = new URLSearchParams({ "page[size]": "50" });

  if (status === "active") {
    params.set("filter[status]", "1");
  } else if (status === "archived") {
    params.set("filter[status]", "2");
  }

  if (search) {
    params.set("filter[name]", search);
  }

  const response = await fetch(`${BASE_URL}/projects?${params}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    return `Error fetching projects: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const projects = data.data || [];

  if (projects.length === 0) {
    return "No projects found.";
  }

  let result = "**Projects:**\n\n";
  for (const project of projects) {
    const attrs = project.attributes || {};
    const projectId = project.id;
    const name = attrs.name || "Unnamed";
    result += `- **${name}** (ID: ${projectId})\n`;
  }

  return result;
}

async function getProject(projectId: string): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const params = new URLSearchParams({
    include: "company,project_manager",
  });

  const response = await fetch(`${BASE_URL}/projects/${projectId}?${params}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      return `Project with ID ${projectId} not found.`;
    }
    return `Error fetching project: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const project = data.data;
  const attrs = project.attributes || {};

  // Build included lookup
  const included: Record<string, any> = {};
  for (const i of data.included || []) {
    included[`${i.type}:${i.id}`] = i;
  }

  // Get company name
  const companyRel = project.relationships?.company?.data;
  let companyName = "";
  if (companyRel) {
    const companyKey = `${companyRel.type}:${companyRel.id}`;
    if (included[companyKey]) {
      companyName = included[companyKey].attributes?.name || "Unknown";
    }
  }

  // Get project manager name
  const pmRel = project.relationships?.project_manager?.data;
  let pmName = "";
  if (pmRel) {
    const pmKey = `${pmRel.type}:${pmRel.id}`;
    if (included[pmKey]) {
      const pm = included[pmKey].attributes || {};
      pmName = `${pm.first_name || ""} ${pm.last_name || ""}`.trim() || "Unknown";
    }
  }

  let result = `**Project: ${attrs.name || "Unnamed"}**\n\n`;
  result += `- **ID:** ${project.id}\n`;
  if (companyName) result += `- **Company:** ${companyName}\n`;
  if (pmName) result += `- **Project Manager:** ${pmName}\n`;
  if (attrs.project_number) result += `- **Project Number:** ${attrs.project_number}\n`;
  if (attrs.status !== undefined) {
    const statusText = attrs.status === 1 ? "Active" : attrs.status === 2 ? "Archived" : `Status ${attrs.status}`;
    result += `- **Status:** ${statusText}\n`;
  }
  if (attrs.budget_total) result += `- **Budget Total:** ${attrs.budget_total}\n`;
  if (attrs.billable !== undefined) result += `- **Billable:** ${attrs.billable ? "Yes" : "No"}\n`;
  if (attrs.started_at) result += `- **Started:** ${attrs.started_at}\n`;
  if (attrs.ended_at) result += `- **Ended:** ${attrs.ended_at}\n`;

  result += `\nUse \`list_deals\` with search to find deals/budgets for this project.`;

  return result;
}

async function listDeals(search?: string): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const params = new URLSearchParams({
    "page[size]": "50",
    include: "project",
  });

  if (search) {
    params.set("filter[name]", search);
  }

  const response = await fetch(`${BASE_URL}/deals?${params}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    return `Error fetching deals: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const deals = data.data || [];
  const included: Record<string, any> = {};
  for (const i of data.included || []) {
    included[`${i.type}:${i.id}`] = i;
  }

  if (deals.length === 0) {
    return "No deals found.";
  }

  let result = "**Deals:**\n\n";
  for (const deal of deals) {
    const attrs = deal.attributes || {};
    const dealId = deal.id;
    const name = attrs.name || "Unnamed";
    const startDate = attrs.date || "No start date";
    const endDate = attrs.end_date || "No end date";

    // Get project name
    const projectRel = deal.relationships?.project?.data;
    let projectName = "";
    if (projectRel) {
      const projectKey = `${projectRel.type}:${projectRel.id}`;
      if (included[projectKey]) {
        projectName = ` (Project: ${included[projectKey].attributes?.name || "Unknown"})`;
      }
    }

    result += `- **${name}** (Deal ID: ${dealId})${projectName}\n`;
    result += `  Date Range: ${startDate} to ${endDate}\n`;
  }

  return result;
}

async function listServices(
  dealId?: string,
  search?: string
): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const params = new URLSearchParams({
    "page[size]": "50",
    "filter[time_tracking_enabled]": "true",
  });

  if (dealId) {
    params.set("filter[deal_id]", dealId);
  }

  if (search) {
    params.set("filter[name]", search);
  }

  const response = await fetch(`${BASE_URL}/services?${params}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    return `Error fetching services: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const services = data.data || [];

  if (services.length === 0) {
    return "No services found. Try using list_deals first to find the correct deal ID.";
  }

  let result = "**Services:**\n\n";
  for (const service of services) {
    const attrs = service.attributes || {};
    const serviceId = service.id;
    const name = attrs.name || "Unnamed";
    result += `- **${name}** (Service ID: ${serviceId})\n`;
  }

  result += "\nUse a Service ID with create_time_entry to log time.";

  return result;
}

async function listTimeEntries(
  days: number = 7,
  projectId?: string
): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const params = new URLSearchParams({
    "page[size]": "50",
    "filter[person_id]": USER_ID,
    "filter[after]": formatDate(startDate),
    "filter[before]": formatDate(endDate),
    include: "service,task",
  });

  if (projectId) {
    params.set("filter[project_id]", projectId);
  }

  const response = await fetch(`${BASE_URL}/time_entries?${params}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    return `Error fetching time entries: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const entries = data.data || [];
  const included: Record<string, any> = {};
  for (const i of data.included || []) {
    included[`${i.type}:${i.id}`] = i;
  }

  if (entries.length === 0) {
    return `No time entries found in the last ${days} days.`;
  }

  let result = `**Time Entries (last ${days} days):**\n\n`;
  for (const entry of entries) {
    const attrs = entry.attributes || {};
    const entryId = entry.id;
    const entryDate = attrs.date || "Unknown date";
    const minutes = attrs.time || 0;
    const hours = minutes / 60;
    const note = attrs.note || "";

    // Get service name
    const serviceRel = entry.relationships?.service?.data;
    let serviceName = "Unknown service";
    if (serviceRel) {
      const serviceKey = `${serviceRel.type}:${serviceRel.id}`;
      if (included[serviceKey]) {
        serviceName = included[serviceKey].attributes?.name || "Unknown";
      }
    }

    result += `- **${entryDate}** | ${hours.toFixed(1)}h | ${serviceName}`;
    if (note) {
      result += ` | ${note}`;
    }
    result += ` (ID: ${entryId})\n`;
  }

  return result;
}

async function createTimeEntry(
  serviceId: string,
  hours: number,
  entryDate?: string,
  note?: string
): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const date = entryDate || formatDate(new Date());
  const minutes = Math.round(hours * 60);

  const payload: any = {
    data: {
      type: "time_entries",
      attributes: {
        date: date,
        time: minutes,
      },
      relationships: {
        person: {
          data: {
            type: "people",
            id: USER_ID,
          },
        },
        service: {
          data: {
            type: "services",
            id: serviceId,
          },
        },
      },
    },
  };

  if (note) {
    payload.data.attributes.note = note;
  }

  const response = await fetch(`${BASE_URL}/time_entries`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return `Error creating time entry: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const entryId = data.data?.id;

  return `Time entry created successfully (ID: ${entryId}). Logged ${hours}h on ${date}.`;
}

async function updateTimeEntry(
  entryId: string,
  hours?: number,
  entryDate?: string,
  note?: string
): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const attributes: any = {};

  if (hours !== undefined) {
    attributes.time = Math.round(hours * 60);
  }

  if (entryDate !== undefined) {
    attributes.date = entryDate;
  }

  if (note !== undefined) {
    attributes.note = note;
  }

  if (Object.keys(attributes).length === 0) {
    return "No updates specified. Provide at least one of: hours, entryDate, note.";
  }

  const payload = {
    data: {
      type: "time_entries",
      id: entryId,
      attributes: attributes,
    },
  };

  const response = await fetch(`${BASE_URL}/time_entries/${entryId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return `Error updating time entry: ${response.status} - ${await response.text()}`;
  }

  return `Time entry ${entryId} updated successfully.`;
}

async function deleteTimeEntry(entryId: string): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const response = await fetch(`${BASE_URL}/time_entries/${entryId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    return `Error deleting time entry: ${response.status} - ${await response.text()}`;
  }

  return `Time entry ${entryId} deleted successfully.`;
}

async function listTimers(): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const params = new URLSearchParams({
    "filter[person_id]": USER_ID,
    include: "time_entry",
  });

  const response = await fetch(`${BASE_URL}/timers?${params}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    return `Error fetching timers: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const timers = data.data || [];

  if (timers.length === 0) {
    return "No active timers.";
  }

  let result = "**Active Timers:**\n\n";
  for (const timer of timers) {
    const attrs = timer.attributes || {};
    const timerId = timer.id;
    const startedAt = attrs.started_at || "Unknown";
    const totalTime = attrs.total_time || 0; // in seconds

    const hours = Math.floor(totalTime / 3600);
    const minutes = Math.floor((totalTime % 3600) / 60);

    result += `- Timer ${timerId}: Running for ${hours}h ${minutes}m (started: ${startedAt})\n`;
  }

  return result;
}

async function startTimer(serviceId: string, note?: string): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  // First, create a time entry for today with 0 minutes
  const today = formatDate(new Date());

  const timeEntryPayload: any = {
    data: {
      type: "time_entries",
      attributes: {
        date: today,
        time: 0,
      },
      relationships: {
        person: {
          data: {
            type: "people",
            id: USER_ID,
          },
        },
        service: {
          data: {
            type: "services",
            id: serviceId,
          },
        },
      },
    },
  };

  if (note) {
    timeEntryPayload.data.attributes.note = note;
  }

  // Create the time entry
  const timeEntryResponse = await fetch(`${BASE_URL}/time_entries`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(timeEntryPayload),
  });

  if (!timeEntryResponse.ok) {
    return `Error creating time entry for timer: ${timeEntryResponse.status} - ${await timeEntryResponse.text()}`;
  }

  const timeEntryData = await timeEntryResponse.json();
  const timeEntryId = timeEntryData.data?.id;

  // Now create the timer linked to this time entry
  const timerPayload = {
    data: {
      type: "timers",
      attributes: {},
      relationships: {
        time_entry: {
          data: {
            type: "time_entries",
            id: timeEntryId,
          },
        },
      },
    },
  };

  const timerResponse = await fetch(`${BASE_URL}/timers`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(timerPayload),
  });

  if (!timerResponse.ok) {
    return `Error starting timer: ${timerResponse.status} - ${await timerResponse.text()}`;
  }

  const timerData = await timerResponse.json();
  const timerId = timerData.data?.id;

  return `Timer started (Timer ID: ${timerId}, Time Entry ID: ${timeEntryId}).`;
}

async function stopTimer(timerId: string): Promise<string> {
  const error = checkConfig();
  if (error) return `Configuration error: ${error}`;

  const response = await fetch(`${BASE_URL}/timers/${timerId}/stop`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    return `Error stopping timer: ${response.status} - ${await response.text()}`;
  }

  const data = await response.json();
  const attrs = data.data?.attributes || {};
  const totalTime = attrs.total_time || 0;

  const hours = Math.floor(totalTime / 3600);
  const minutes = Math.floor((totalTime % 3600) / 60);

  return `Timer ${timerId} stopped. Total time: ${hours}h ${minutes}m.`;
}

// =============================================================================
// MCP Server Setup
// =============================================================================

const server = new Server(
  {
    name: "productive-time-tracking",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description:
          "List projects from Productive. Use to find project IDs before listing services.",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description:
                "Filter by status: 'active', 'archived', or 'all' (default: active)",
              enum: ["active", "archived", "all"],
            },
            search: {
              type: "string",
              description: "Search term to filter projects by name",
            },
          },
        },
      },
      {
        name: "get_project",
        description:
          "Get detailed information about a specific project by ID. Returns project details including company, project manager, status, and budget info.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "The ID of the project to retrieve",
            },
          },
          required: ["project_id"],
        },
      },
      {
        name: "list_deals",
        description:
          "List deals (budgets/contracts) from Productive. Use this to find the deal ID, then use list_services with the deal_id to find services to log time against.",
        inputSchema: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Search term to filter deals by name (e.g., 'Kamera')",
            },
          },
        },
      },
      {
        name: "list_services",
        description:
          "List services (billable activities) from Productive. Services are what you log time against. Use deal_id to filter services for a specific deal/budget.",
        inputSchema: {
          type: "object",
          properties: {
            deal_id: {
              type: "string",
              description: "Filter services by deal ID (use list_deals to find deal IDs)",
            },
            search: {
              type: "string",
              description: "Search term to filter services by name",
            },
          },
        },
      },
      {
        name: "list_time_entries",
        description: "List your recent time entries from Productive.",
        inputSchema: {
          type: "object",
          properties: {
            days: {
              type: "number",
              description: "Number of days to look back (default: 7)",
            },
            project_id: {
              type: "string",
              description: "Filter by project ID",
            },
          },
        },
      },
      {
        name: "create_time_entry",
        description:
          "Create a new time entry in Productive. Requires a service ID (use list_services to find one).",
        inputSchema: {
          type: "object",
          properties: {
            service_id: {
              type: "string",
              description: "The ID of the service to log time against",
            },
            hours: {
              type: "number",
              description:
                "Number of hours to log (e.g., 1.5 for 1 hour 30 minutes)",
            },
            entry_date: {
              type: "string",
              description: "Date in YYYY-MM-DD format (default: today)",
            },
            note: {
              type: "string",
              description: "Optional note/description for the time entry",
            },
          },
          required: ["service_id", "hours"],
        },
      },
      {
        name: "update_time_entry",
        description: "Update an existing time entry in Productive.",
        inputSchema: {
          type: "object",
          properties: {
            entry_id: {
              type: "string",
              description: "The ID of the time entry to update",
            },
            hours: {
              type: "number",
              description: "New number of hours",
            },
            entry_date: {
              type: "string",
              description: "New date in YYYY-MM-DD format",
            },
            note: {
              type: "string",
              description: "New note/description",
            },
          },
          required: ["entry_id"],
        },
      },
      {
        name: "delete_time_entry",
        description: "Delete a time entry from Productive.",
        inputSchema: {
          type: "object",
          properties: {
            entry_id: {
              type: "string",
              description: "The ID of the time entry to delete",
            },
          },
          required: ["entry_id"],
        },
      },
            {
        name: "list_timers",
        description: "List all active timers for the current user.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "start_timer",
        description:
          "Start a new timer for tracking time. Creates a time entry and starts tracking.",
        inputSchema: {
          type: "object",
          properties: {
            service_id: {
              type: "string",
              description: "The ID of the service to track time for",
            },
            note: {
              type: "string",
              description: "Optional note for the time entry",
            },
          },
          required: ["service_id"],
        },
      },
      {
        name: "stop_timer",
        description: "Stop an active timer.",
        inputSchema: {
          type: "object",
          properties: {
            timer_id: {
              type: "string",
              description: "The ID of the timer to stop",
            },
          },
          required: ["timer_id"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "list_projects":
        result = await listProjects(
          (args?.status as string) || "active",
          args?.search as string | undefined
        );
        break;

      case "get_project":
        result = await getProject(args?.project_id as string);
        break;

      case "list_deals":
        result = await listDeals(args?.search as string | undefined);
        break;

      case "list_services":
        result = await listServices(
          args?.deal_id as string | undefined,
          args?.search as string | undefined
        );
        break;

      case "list_time_entries":
        result = await listTimeEntries(
          (args?.days as number) || 7,
          args?.project_id as string | undefined
        );
        break;

      case "create_time_entry":
        result = await createTimeEntry(
          args?.service_id as string,
          args?.hours as number,
          args?.entry_date as string | undefined,
          args?.note as string | undefined
        );
        break;

      case "update_time_entry":
        result = await updateTimeEntry(
          args?.entry_id as string,
          args?.hours as number | undefined,
          args?.entry_date as string | undefined,
          args?.note as string | undefined
        );
        break;

      case "delete_time_entry":
        result = await deleteTimeEntry(args?.entry_id as string);
        break;

      case "list_timers":
        result = await listTimers();
        break;

      case "start_timer":
        result = await startTimer(
          args?.service_id as string,
          args?.note as string | undefined
        );
        break;

      case "stop_timer":
        result = await stopTimer(args?.timer_id as string);
        break;

      default:
        result = `Unknown tool: ${name}`;
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Productive MCP Server running on stdio");
}

main().catch(console.error);
