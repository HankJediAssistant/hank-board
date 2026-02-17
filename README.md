# Hank Board

A sleek, real-time family kanban board and dashboard built for households that want to stay organized together. Track tasks, assign family members, set priorities, and monitor scheduled jobs -- all from a beautiful dark/light-themed web UI.

![Hank Board Screenshot](docs/screenshot.png)

## Features

- **Kanban Board** -- Drag-and-drop task cards across customizable columns
- **Family Members** -- Assign tasks to family members with `@mentions` and color-coded chips
- **Priority Levels** -- Tag tasks `!high`, `!medium`, or `!low` with visual indicators
- **Dashboard** -- At-a-glance stats: completion rates, high-priority items, per-person progress bars
- **Scheduled Jobs** -- View and monitor cron jobs managed by OpenClaw
- **Real-time Updates** -- Server-Sent Events push live changes to all connected browsers
- **Dark / Light Theme** -- Toggle between themes with persistent preference
- **Filter by Person** -- Click family member chips to filter the entire board
- **Inline Editing** -- Edit task text, assignees, and priority directly on the card
- **Responsive Design** -- Works on desktop, tablet, and mobile
- **Markdown-backed Storage** -- Tasks are stored in a human-readable `TODO.md` file

## Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/hank-board.git
cd hank-board

# Install dependencies
npm install

# Set up your family configuration (required)
cp config/family.example.json config/family.json
# Edit config/family.json with your family members (see Configuration below)

# Start the server
npm start
```

The board will be running at **http://localhost:3456**.

## Configuration

### Family Members

Copy the example config and customize it with your family:

```bash
cp config/family.example.json config/family.json
```

Edit `config/family.json` with your family members:

```json
[
  { "id": "dad", "name": "Dad", "role": "Parent", "color": "#4ecdc4" },
  { "id": "mom", "name": "Mom", "role": "Parent", "color": "#ff6b6b" },
  { "id": "kid1", "name": "Alex", "role": "Son, 14", "color": "#feca57" },
  { "id": "kid2", "name": "Sam", "role": "Daughter, 12", "color": "#a29bfe" }
]
```

| Field   | Description                                      |
|---------|--------------------------------------------------|
| `id`    | Unique lowercase identifier (used in @mentions)  |
| `name`  | Display name shown on the board                  |
| `role`  | Short description (e.g. "Mom", "Son, 14")        |
| `color` | Hex color for avatar and task chips              |

**Note:** `config/family.json` is gitignored to keep your personal data private. Only the example file is committed.

### Environment

Hank Board reads task data from OpenClaw's workspace:

| Path | Purpose |
|------|---------|
| `~/.openclaw/workspace/TODO.md` | Kanban board task storage |
| `~/.openclaw/cron/jobs.json` | Scheduled job definitions |

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JS (single-file SPA, no build step)
- **Storage:** Flat-file Markdown (`TODO.md`)
- **Real-time:** Server-Sent Events (SSE)
- **Fonts:** Inter (Google Fonts)

## License

MIT
