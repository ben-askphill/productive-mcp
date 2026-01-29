# Productive Time Tracking MCP Server

An MCP server for managing time entries and timers in [Productive](https://www.productive.io/).

## Features

- **List projects** - Find your projects
- **List services** - Find billable services within projects
- **Log time entries** - Create time entries with hours, date, and notes
- **Edit time entries** - Update existing entries
- **Delete time entries** - Remove entries
- **Start/stop timers** - Track time in real-time

## Setup

### 1. Install dependencies and build

```bash
cd productive-mcp
npm install
npm run build
```

### 2. Add to Claude Code

Run the following command (replace the path with your actual path):

```bash
claude mcp add productive -e PRODUCTIVE_API_TOKEN=your_token_here -e PRODUCTIVE_ORGANIZATION_ID=21562 -e PRODUCTIVE_USER_ID=1159352 -- node /Users/benrosenberg/productive/productive-mcp/dist/server.js
```

Or add manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "productive": {
      "command": "node",
      "args": ["/Users/benrosenberg/productive/productive-mcp/dist/server.js"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_token_here",
        "PRODUCTIVE_ORGANIZATION_ID": "21562",
        "PRODUCTIVE_USER_ID": "1159352"
      }
    }
  }
}
```

### 3. Add to Claude.ai Desktop (optional)

Add the same configuration to:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Configuration

| Variable | Description |
|----------|-------------|
| `PRODUCTIVE_API_TOKEN` | Your Personal Access Token (Settings > Integrations > API access) |
| `PRODUCTIVE_ORGANIZATION_ID` | From your Productive URL (e.g., `21562` from `app.productive.io/21562-ask-phill/`) |
| `PRODUCTIVE_USER_ID` | Your user ID in Productive |

## Usage Examples

Once connected, ask Claude:

- "List my projects in Productive"
- "Show services for project 12345"
- "Log 2 hours to service 6789 for today"
- "Show my time entries from the last week"
- "Start a timer for service 6789"
- "Stop timer 123"
- "Delete time entry 456"

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List projects (filter by status or search) |
| `list_services` | List services for a project |
| `list_time_entries` | View recent time entries |
| `create_time_entry` | Log time to a service |
| `update_time_entry` | Edit an existing time entry |
| `delete_time_entry` | Remove a time entry |
| `list_timers` | Show active timers |
| `start_timer` | Start tracking time |
| `stop_timer` | Stop an active timer |

## Understanding Productive's Data Model

- **Projects** contain **Budgets**
- **Budgets** contain **Services** (billable line items like "Development", "Design")
- **Time entries** are logged against **Services**
- **Timers** track time in real-time and create/update time entries

So to log time, the workflow is:
1. Find your project (`list_projects`)
2. Find the service within that project (`list_services project_id=...`)
3. Log time to the service (`create_time_entry service_id=...`)
