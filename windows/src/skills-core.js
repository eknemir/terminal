'use strict';
// Pure parts of the Skills tab (main.js): the folder-name rule and SKILL.md's frontmatter (name, description).
const SKILL_NAME = /^[a-z0-9-]{1,64}$/;
const validSkillName = (name) => SKILL_NAME.test(name || '');

function parseSkillMd(txt) {
  const out = { name: '', description: '' };
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(String(txt == null ? '' : txt));
  if (m) {
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const kv = /^(name|description):\s*(.*)$/.exec(lines[i]);
      if (!kv) continue;
      let v = kv[2].trim();
      if (/^[>|][-+]?$/.test(v)) { // folded / literal block
        const buf = [];
        while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) buf.push(lines[++i].trim());
        v = buf.join(' ');
      }
      v = v.replace(/^(['"])([\s\S]*)\1$/, '$2');
      out[kv[1]] = v;
    }
  }
  return out;
}

module.exports = { SKILL_NAME, validSkillName, parseSkillMd };
