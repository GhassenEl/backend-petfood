const EICAR_SIGNATURE =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const TEXT_SIGNATURES = [
  {
    id: 'eicar',
    category: 'malware',
    severity: 'critical',
    label: 'Signature EICAR (test anti-virus)',
    pattern: /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/i,
  },
  {
    id: 'script_tag',
    category: 'xss',
    severity: 'high',
    label: 'Balise script HTML',
    pattern: /<\s*script[\s>]/i,
  },
  {
    id: 'javascript_uri',
    category: 'xss',
    severity: 'high',
    label: 'URI javascript:',
    pattern: /javascript\s*:/i,
  },
  {
    id: 'onerror_handler',
    category: 'xss',
    severity: 'high',
    label: 'Gestionnaire onerror',
    pattern: /\bonerror\s*=/i,
  },
  {
    id: 'eval_call',
    category: 'injection',
    severity: 'high',
    label: 'Appel eval()',
    pattern: /\beval\s*\(/i,
  },
  {
    id: 'sql_union',
    category: 'injection',
    severity: 'medium',
    label: 'Injection SQL UNION',
    pattern: /\bunion\s+select\b/i,
  },
  {
    id: 'php_shell',
    category: 'webshell',
    severity: 'critical',
    label: 'Coquille PHP',
    pattern: /<\?php|system\s*\(|passthru\s*\(|shell_exec\s*\(/i,
  },
  {
    id: 'powershell',
    category: 'malware',
    severity: 'high',
    label: 'Commande PowerShell',
    pattern: /powershell(\.exe)?\s+(-enc|-encodedcommand)/i,
  },
  {
    id: 'suspicious_url',
    category: 'phishing',
    severity: 'medium',
    label: 'URL suspecte',
    pattern: /https?:\/\/[^\s]*(\.ru|\.cn|bit\.ly|tinyurl|login-verify|secure-update)/i,
  },
  {
    id: 'base64_pe',
    category: 'malware',
    severity: 'critical',
    label: 'Binaire PE encodé (MZ)',
    pattern: /data:application\/octet-stream;base64,\s*TV[qQ]/i,
  },
];

const FILE_EXTENSIONS = [
  { ext: '.exe', severity: 'critical', label: 'Exécutable Windows' },
  { ext: '.bat', severity: 'high', label: 'Script batch' },
  { ext: '.cmd', severity: 'high', label: 'Script CMD' },
  { ext: '.scr', severity: 'high', label: 'Écran de veille / malware' },
  { ext: '.vbs', severity: 'high', label: 'Script VBScript' },
  { ext: '.ps1', severity: 'high', label: 'Script PowerShell' },
  { ext: '.dll', severity: 'medium', label: 'Bibliothèque DLL' },
  { ext: '.js', severity: 'low', label: 'Fichier JavaScript téléversé' },
];

const MAX_SNIPPET = 120;

const snippet = (value, matchIndex = 0) => {
  const text = String(value || '');
  const start = Math.max(0, matchIndex - 20);
  return text.slice(start, start + MAX_SNIPPET).replace(/\s+/g, ' ').trim();
};

const scanString = (text) => {
  const input = String(text || '');
  if (!input.trim()) {
    return { safe: true, threats: [], scannedLength: 0 };
  }

  const threats = [];
  for (const sig of TEXT_SIGNATURES) {
    const match = input.match(sig.pattern);
    if (match) {
      threats.push({
        id: sig.id,
        category: sig.category,
        severity: sig.severity,
        label: sig.label,
        matched: match[0].slice(0, 80),
        snippet: snippet(input, match.index || 0),
      });
    }
  }

  return {
    safe: threats.length === 0,
    threats,
    scannedLength: input.length,
  };
};

const scanFileMeta = ({ filename = '', mimeType = '', contentBase64 = '' } = {}) => {
  const threats = [];
  const lowerName = String(filename).toLowerCase();

  for (const rule of FILE_EXTENSIONS) {
    if (lowerName.endsWith(rule.ext)) {
      threats.push({
        id: `file_ext_${rule.ext.replace('.', '')}`,
        category: 'malware',
        severity: rule.severity,
        label: rule.label,
        matched: rule.ext,
        snippet: filename,
      });
    }
  }

  const b64 = String(contentBase64 || '');
  if (b64.startsWith('TVq') || b64.includes('TVqQ')) {
    threats.push({
      id: 'pe_header',
      category: 'malware',
      severity: 'critical',
      label: 'En-tête PE Windows détecté',
      matched: 'MZ/PE',
      snippet: filename || 'base64',
    });
  }

  if (/application\/(x-msdownload|octet-stream|x-dosexec)/i.test(mimeType)) {
    threats.push({
      id: 'dangerous_mime',
      category: 'malware',
      severity: 'high',
      label: 'Type MIME exécutable',
      matched: mimeType,
      snippet: filename,
    });
  }

  return { safe: threats.length === 0, threats };
};

const SENSITIVE_KEYS = new Set([
  'message',
  'content',
  'text',
  'body',
  'description',
  'comment',
  'subject',
  'title',
  'notes',
]);

const scanPayload = (payload, depth = 0) => {
  if (depth > 6) return { safe: true, threats: [] };

  if (typeof payload === 'string') {
    return scanString(payload);
  }

  if (Array.isArray(payload)) {
    const merged = [];
    for (const item of payload) {
      const result = scanPayload(item, depth + 1);
      if (!result.safe) merged.push(...result.threats);
    }
    return { safe: merged.length === 0, threats: merged };
  }

  if (payload && typeof payload === 'object') {
    const merged = [];
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' && (SENSITIVE_KEYS.has(key) || value.length > 40)) {
        const result = scanString(value);
        if (!result.safe) merged.push(...result.threats);
      } else if (typeof value === 'object' && value !== null) {
        const result = scanPayload(value, depth + 1);
        if (!result.safe) merged.push(...result.threats);
      }
    }
    return { safe: merged.length === 0, threats: merged };
  }

  return { safe: true, threats: [] };
};

module.exports = {
  EICAR_SIGNATURE,
  TEXT_SIGNATURES,
  scanString,
  scanPayload,
  scanFileMeta,
  signatureCount: TEXT_SIGNATURES.length + FILE_EXTENSIONS.length,
};
