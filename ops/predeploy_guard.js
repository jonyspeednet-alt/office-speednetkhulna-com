#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scanTargets = [
  { name: 'office', dir: path.resolve(root, '..', 'office.speednetkhulna.com'), pgOnly: true },
  { name: 'partner', dir: path.resolve(root, '..', 'partner.speednetkhulna.com'), pgOnly: true },
  { name: 'my-server', dir: path.join(root, 'server'), pgOnly: true },
];

const textExt = new Set(['.php', '.js', '.json', '.md', '.css', '.html', '.env', '.sql', '.txt', '.yml', '.yaml', '.ps1', '.sh']);
const ignoreDirNames = new Set(['node_modules', '.git', 'uploads', '.well-known']);

const mojibakePatterns = [
  /\u00e0\u00a6/g,         // "à¦" style mojibake
  /\u00c3./g,              // "Ã." style mojibake
  /\u00e2\u20ac[\u009c\u009d\u201c\u201d"'`]/g, // "â€" quote artifacts
  /\u00e2\u20ac\u201d/g,   // "â€”"
  /\u00e2\u20ac\u201c/g,   // "â€“"
];

const findings = [];

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return textExt.has(ext) || path.basename(filePath).startsWith('.env');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirNames.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (entry.isFile() && shouldScanFile(full)) out.push(full);
  }
  return out;
}

function hasUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

function addFinding(scope, type, file, detail) {
  findings.push({ scope, type, file, detail });
}

for (const target of scanTargets) {
  const files = walk(target.dir);
  for (const file of files) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch (e) {
      addFinding(target.name, 'read_error', file, e.message);
      continue;
    }

    if (hasUtf8Bom(buf)) {
      addFinding(target.name, 'utf8_bom', file, 'File contains UTF-8 BOM; use UTF-8 without BOM.');
    }

    const text = buf.toString('utf8');
    const ext = path.extname(file).toLowerCase();
    const isCodeLike = !['.md', '.txt'].includes(ext);

    for (const pat of mojibakePatterns) {
      if (pat.test(text)) {
        addFinding(target.name, 'mojibake', file, `Pattern matched: ${pat}`);
        break;
      }
    }

    if (target.pgOnly && isCodeLike) {
      if (/mysqli_/i.test(text)) {
        addFinding(target.name, 'forbidden_mysql_ref', file, 'Found mysqli_ usage in PG-only scope.');
      }
      if (/mysql\s*:/i.test(text)) {
        addFinding(target.name, 'forbidden_mysql_ref', file, 'Found mysql: DSN in PG-only scope.');
      }
      if (target.name === 'my-server') {
        if (/mysql2/i.test(text) || /require\(['\"]mysql/i.test(text) || /createConnection\(/.test(text)) {
          addFinding(target.name, 'forbidden_mysql_ref', file, 'Found mysql driver usage in my-server.');
        }
      }
    }
  }
}

if (findings.length === 0) {
  console.log('PREDEPLOY_GUARD: PASS');
  process.exit(0);
}

console.error('PREDEPLOY_GUARD: FAIL');
for (const f of findings) {
  console.error(`[${f.scope}] ${f.type}: ${f.file}`);
  console.error(`  -> ${f.detail}`);
}
process.exit(1);
