const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const text = fs.readFileSync(envPath, 'utf8');
let changed = false;

const next = text
  .split(/\r?\n/)
  .map((line) => {
    const match = line.match(/^(DATABASE_URL=)(.*)$/);
    if (!match) return line;

    let value = match[2].trim();
    const first = value.charCodeAt(0);
    const last = value.charCodeAt(value.length - 1);

    if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
      value = value.slice(1, -1);
    }

    const parts = value.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^/]+)(\/.*)$/);
    if (!parts) return line;

    changed = true;
    return `${match[1]}${parts[1]}${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[4]}${parts[5]}`;
  })
  .join('\n');

if (!changed) {
  throw new Error('Could not safely rewrite DATABASE_URL. Check that it contains user:password@host/database.');
}

fs.writeFileSync(envPath, next);
console.log('DATABASE_URL rewritten without printing credentials.');
