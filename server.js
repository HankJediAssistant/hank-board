const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3456;
const TODO_PATH = path.join(process.env.HOME, '.openclaw/workspace/TODO.md');
const CRON_PATH = path.join(process.env.HOME, '.openclaw/cron/jobs.json');

// Family members - loaded from config/family.json
const FAMILY = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/family.json'), 'utf-8'));
const FAMILY_IDS = new Set(FAMILY.map(f => f.id));

// SSE clients
let sseClients = [];

app.use(express.json());
app.use(express.static('public'));

// --- SSE for real-time updates ---
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

function notifyRefresh(type = 'all') {
  const data = JSON.stringify({ type, timestamp: Date.now() });
  sseClients.forEach(c => c.write(`data: ${data}\n\n`));
}

app.post('/api/refresh', (req, res) => {
  notifyRefresh(req.body?.type || 'all');
  res.json({ ok: true, clients: sseClients.length });
});

// --- Task text parsing: @mentions and !priority ---
function parseTaskText(rawText) {
  const assignees = [];
  let text = rawText;

  // Extract @mentions for known family members
  text = text.replace(/@(\w+)/g, (match, name) => {
    if (FAMILY_IDS.has(name.toLowerCase())) {
      assignees.push(name.toLowerCase());
      return '';
    }
    return match;
  });

  // Extract !priority
  let priority = 'none';
  text = text.replace(/\s*!(high|medium|low)\b/gi, (match, p) => {
    priority = p.toLowerCase();
    return '';
  });

  return { text: text.replace(/\s+/g, ' ').trim(), assignees, priority };
}

function serializeTask(task) {
  let raw = task.text || '';
  if (task.assignees?.length) {
    raw += ' ' + task.assignees.map(a => '@' + a).join(' ');
  }
  if (task.priority && task.priority !== 'none') {
    raw += ' !' + task.priority;
  }
  return raw;
}

// --- TODO.md parsing ---
function parseTodoMd(content) {
  const lines = content.split('\n');
  const columns = [];
  let currentColumn = null;

  for (const line of lines) {
    const headerMatch = line.match(/^## (.+)$/);
    if (headerMatch) {
      if (currentColumn) columns.push(currentColumn);
      currentColumn = {
        id: headerMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: headerMatch[1],
        tasks: []
      };
      continue;
    }

    const taskMatch = line.match(/^- \[([ x])\] (.+)$/);
    if (taskMatch && currentColumn) {
      const { text, assignees, priority } = parseTaskText(taskMatch[2]);
      currentColumn.tasks.push({
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        done: taskMatch[1] === 'x',
        text,
        assignees,
        priority
      });
      continue;
    }

    const placeholderMatch = line.match(/^_\((.+)\)_$/);
    if (placeholderMatch && currentColumn) {
      currentColumn.placeholder = placeholderMatch[1];
    }
  }

  if (currentColumn) columns.push(currentColumn);
  return columns;
}

function toTodoMd(columns) {
  let md = '# TODO List\n\n';
  for (const col of columns) {
    md += `## ${col.title}\n`;
    if (col.tasks.length === 0 && col.placeholder) {
      md += `_(${col.placeholder})_\n`;
    }
    for (const task of col.tasks) {
      const checkbox = task.done ? '[x]' : '[ ]';
      md += `- ${checkbox} ${serializeTask(task)}\n`;
    }
    md += '\n';
  }
  md += '---\n';
  md += `*Last updated: ${new Date().toISOString().split('T')[0]}*\n`;
  return md;
}

// --- Cron jobs ---
function getCronJobs() {
  try {
    if (fs.existsSync(CRON_PATH)) {
      return JSON.parse(fs.readFileSync(CRON_PATH, 'utf-8')).jobs || [];
    }
  } catch (err) {
    console.error('Error reading cron jobs:', err);
  }
  return [];
}

// --- API: Family ---
app.get('/api/family', (req, res) => {
  res.json({ members: FAMILY });
});

// --- API: Board ---
app.get('/api/board', (req, res) => {
  try {
    const content = fs.readFileSync(TODO_PATH, 'utf-8');
    const columns = parseTodoMd(content);
    res.json({ columns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/board', (req, res) => {
  try {
    const { columns } = req.body;
    fs.writeFileSync(TODO_PATH, toTodoMd(columns));
    notifyRefresh('board');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Dashboard ---
app.get('/api/dashboard', (req, res) => {
  try {
    const cronJobs = getCronJobs();
    let columns = [];
    try {
      columns = parseTodoMd(fs.readFileSync(TODO_PATH, 'utf-8'));
    } catch {}

    const highPriorityTasks = [];
    const inProgressTasks = [];
    const personStats = {};
    let totalTasks = 0, completedTasks = 0;

    FAMILY.forEach(f => { personStats[f.id] = { total: 0, done: 0 }; });

    for (const col of columns) {
      for (const task of col.tasks) {
        totalTasks++;
        if (task.done) completedTasks++;

        // High priority: explicit !high or in a high-priority column
        const isHighPriority = task.priority === 'high'
          || col.title.includes('High Priority')
          || col.title.includes('🔥');

        if (isHighPriority && !task.done) {
          highPriorityTasks.push({ ...task, column: col.title });
        }

        // In-progress tasks for "today's focus"
        if (col.title.toLowerCase().includes('in progress') && !task.done) {
          inProgressTasks.push({ ...task, column: col.title });
        }

        // Per-person stats
        for (const a of (task.assignees || [])) {
          if (personStats[a]) {
            personStats[a].total++;
            if (task.done) personStats[a].done++;
          }
        }
      }
    }

    const upcomingJobs = cronJobs
      .filter(j => j.enabled)
      .sort((a, b) => (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0));

    res.json({
      upcomingJobs,
      highPriorityTasks,
      inProgressTasks,
      personStats,
      totalTasks,
      completedTasks,
      totalJobs: cronJobs.length,
      enabledJobs: cronJobs.filter(j => j.enabled).length,
      family: FAMILY
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Cron jobs ---
app.get('/api/cron/jobs', (req, res) => {
  try {
    res.json({ jobs: getCronJobs() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Hank Board running at http://localhost:${PORT}`);
  console.log(`📋 TODO: ${TODO_PATH}`);
  console.log(`📅 Cron: ${CRON_PATH}`);
});
