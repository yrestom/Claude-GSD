#!/usr/bin/env node
// Claude Code Statusline - GSD Edition
// Shows: model | current task | directory | context usage

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Read JSON from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // Context window display (shows USED percentage)
    let ctx = '';
    if (remaining != null) {
      const rem = Math.round(remaining);
      const used = Math.max(0, Math.min(100, 100 - rem));

      // Build progress bar (10 segments)
      const filled = Math.floor(used / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

      // Color based on usage
      if (used < 50) {
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m💀 ${bar} ${used}%\x1b[0m`;
      }
    }

    // Current task from todos
    let task = '';
    const homeDir = os.homedir();
    const todosDir = path.join(homeDir, '.claude', 'todos');
    if (session && fs.existsSync(todosDir)) {
      const files = fs.readdirSync(todosDir)
        .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        try {
          const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
          const inProgress = todos.find(t => t.status === 'in_progress');
          if (inProgress) task = inProgress.activeForm || '';
        } catch (e) {}
      }
    }

    // Mosic project status (Mosic-only architecture - no local .planning files)
    let mosicStatus = '';
    const configFile = path.join(dir, 'config.json');
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (config.mosic?.project_id) {
          // Has active Mosic project - show active task or project indicator
          const activeTask = config.mosic?.session?.active_task_identifier
                          || config.mosic?.session?.active_task;
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(activeTask || '');
          if (activeTask && !isUuid) {
            // Show active task identifier (e.g., "AUTH-1")
            mosicStatus = `\x1b[32m◉ ${activeTask}\x1b[0m │ `;
          } else {
            // Show Mosic is connected but no active task (or only UUID available)
            mosicStatus = '\x1b[32m◉ Mosic\x1b[0m │ ';
          }

          // Workflow phase indicator from last_action
          const phaseMap = {
            'discuss-task':             'DS',
            'research-task':            'RS',
            'research-phase':           'RS',
            'plan-task':                'PL',
            'plan-phase':               'PL',
            'execute-phase':             'EX',
            'execute-task':             'EX',
            'execute-task-interrupted': 'EX!',
            'verify-task':              'VF',
            'verify-work':              'VF',
          };
          const lastAction = config.mosic?.session?.last_action;
          const phase = lastAction ? phaseMap[lastAction] : null;
          if (phase) {
            mosicStatus = mosicStatus.replace(/ │ $/, '') + ` \x1b[2;36m${phase}\x1b[0m │ `;
          }
        }
      } catch (e) {}
    }

    // Git branch (only shown when not main/master)
    let branch = '';
    try {
      const raw = execSync(`git -C "${dir}" branch --show-current 2>/dev/null`, { timeout: 2000 })
        .toString().trim();
      if (raw && raw !== 'main' && raw !== 'master') branch = raw;
    } catch (e) {}

    // Output
    const dirname = path.basename(dir);
    const branchStr = branch ? `\x1b[33m${branch}\x1b[0m │ ` : '';
    if (task) {
      process.stdout.write(`${mosicStatus}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ ${branchStr}\x1b[2m${dirname}\x1b[0m${ctx}`);
    } else {
      process.stdout.write(`${mosicStatus}\x1b[2m${model}\x1b[0m │ ${branchStr}\x1b[2m${dirname}\x1b[0m${ctx}`);
    }
  } catch (e) {
    // Silent fail - don't break statusline on parse errors
  }
});
