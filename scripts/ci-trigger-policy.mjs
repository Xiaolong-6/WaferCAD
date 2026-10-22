#!/usr/bin/env node
// Keep the automatically scheduled CI surface small. This runs locally and in
// the existing five-minute release-evidence-contract, not a new browser job.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_PR_WORKFLOWS = Object.freeze([
  'quality.yml',
  'ready-impact.yml',
  'release-evidence-contract.yml',
]);
export const ALLOWED_PUSH_WORKFLOWS = Object.freeze(['pages.yml', 'product-manual-wiki.yml']);
export const ALLOWED_SCHEDULE_WORKFLOWS = Object.freeze(['daily-full.yml']);
const WORKFLOW_DIR = resolve(fileURLToPath(new URL('../.github/workflows/', import.meta.url)));

// Event declarations occur at indentation two under the top-level on: key.
// Never count push/pull_request strings in comments, jobs or documentation.
export function declaredEvents(yaml) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (start < 0) throw new Error('Missing explicit on: mapping');
  const events = new Set();
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = line.match(/^  ([a-z_]+):(?:\s*#.*)?$/);
    if (match) events.add(match[1]);
  }
  if (events.size === 0) throw new Error('No workflow event');
  return events;
}

export function auditWorkflowEvents(files) {
  const messages = [];
  const expected = [
    ['pull_request', ALLOWED_PR_WORKFLOWS],
    ['push', ALLOWED_PUSH_WORKFLOWS],
    ['schedule', ALLOWED_SCHEDULE_WORKFLOWS],
  ];
  for (const [name, raw] of Object.entries(files)) {
    let events;
    try {
      events = declaredEvents(raw);
    } catch (error) {
      messages.push(`${name}: ${error.message}`);
      continue;
    }
    for (const [event, allow] of expected) {
      if (events.has(event) && !allow.includes(name)) {
        messages.push(
          `${name}: forbidden automatic ${event}; route through the shared CI controller`,
        );
      }
    }
  }
  for (const [event, allow] of expected) {
    for (const name of allow) {
      if (!(name in files) || !declaredEvents(files[name]).has(event)) {
        messages.push(`${name}: missing required ${event} owner`);
      }
    }
  }
  const nightly = files['daily-full.yml'] || '';
  if (!/cron: ['"]30 2 \* \* \*['"]/.test(nightly)) {
    messages.push('daily-full.yml: schedule must be 02:30 UTC every day');
  }
  for (const required of [
    'quality.yml',
    'browser-regression.yml',
    'ui-v2-stage-c-m4.yml',
    'v2-history-recovery-lease.yml',
    'physical-facet-science.yml',
    'example-recipe-reconstruction.yml',
    'process-recipe-safety.yml',
  ]) {
    if (!nightly.includes(`./.github/workflows/${required}`)) {
      messages.push(`daily-full.yml: missing mandatory ${required}`);
    }
    if (!(files[required] || '').includes('  workflow_call:')) {
      messages.push(`${required}: missing reusable workflow_call interface`);
    }
  }
  if (!files['quality.yml']?.includes('Reject missing or stale PR proof before remote tests')) {
    messages.push('quality.yml: Draft/Ready must reject missing source-bound evidence');
  }
  if (!files['ready-impact.yml']?.includes('Ready impact verdict')) {
    messages.push('ready-impact.yml: fail-closed Ready verdict is required');
  }
  return messages;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const files = Object.fromEntries(
    readdirSync(WORKFLOW_DIR)
      .filter((name) => /\.ya?ml$/.test(name))
      .map((name) => [name, readFileSync(resolve(WORKFLOW_DIR, name), 'utf8')]),
  );
  const issues = auditWorkflowEvents(files);
  for (const issue of issues) console.error(`CI policy: ${issue}`);
  if (issues.length) process.exitCode = 1;
  else
    console.log(
      `CI routing policy valid: ${Object.keys(files).length} workflows, one daily schedule, three PR entrypoints.`,
    );
}
