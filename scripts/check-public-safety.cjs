const { execFileSync } = require('node:child_process');
const { readFileSync, statSync } = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();
const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: repoRoot,
  encoding: 'utf8'
})
  .split('\0')
  .filter(Boolean);

const blockedFilePattern = /(^|[\\/])\.env(\..+)?$/i;
const blockedExtensionPattern = /\.(pem|key|p12|pfx)$/i;
const maxScanBytes = 1024 * 1024;
const secretPatterns = [
  {
    name: 'private key block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/
  },
  {
    name: 'credential URL',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/i
  },
  {
    name: 'probable secret assignment',
    pattern: /\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|SERVICE_ROLE_KEY)[A-Z0-9_]*\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{16,}/
  }
];

const findings = [];

for (const relativePath of trackedFiles) {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  if (blockedFilePattern.test(normalizedPath)) {
    findings.push(`${normalizedPath}: tracked environment file`);
    continue;
  }

  if (blockedExtensionPattern.test(normalizedPath)) {
    findings.push(`${normalizedPath}: tracked credential file extension`);
    continue;
  }

  const absolutePath = path.join(repoRoot, relativePath);
  let size = 0;
  try {
    size = statSync(absolutePath).size;
  } catch {
    continue;
  }
  if (size > maxScanBytes) continue;

  let content = '';
  try {
    content = readFileSync(absolutePath, 'utf8');
  } catch {
    continue;
  }

  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) {
      findings.push(`${normalizedPath}: ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Public safety check failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`Public safety check passed for ${trackedFiles.length} tracked files.`);
