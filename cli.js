#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { convert, backupFileName, PUZZLE_NAMES } = require('./converter');

const USAGE = `Usage: node cli.js <cstimer-export.txt> [--target cubic|twisty] [-o <backup.txt>]

  --target  App that will restore the backup. Default: cubic.
  -o        Output file. Default: Backup_csTimer_<date>.txt in the current folder.`;

function main(argv) {
  let input = null;
  let output = null;
  let target = 'cubic';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      return 0;
    } else if (arg === '-o' || arg === '--output') {
      output = argv[++i];
    } else if (arg === '--target' || arg === '-t') {
      target = argv[++i];
    } else if (!input) {
      input = arg;
    } else {
      console.error(USAGE);
      return 1;
    }
  }

  if (!input || !output && argv.includes('-o') || !['cubic', 'twisty'].includes(target)) {
    console.error(USAGE);
    return 1;
  }

  let result;
  try {
    result = convert(fs.readFileSync(input, 'utf8'), target);
  } catch (e) {
    console.error('Error: ' + e.message);
    return 1;
  }

  output = output || path.join(process.cwd(), backupFileName());
  fs.writeFileSync(output, result.csv, 'utf8');

  for (const s of result.sessions) {
    console.log(`  ${s.name} (${s.scrType}) -> ${PUZZLE_NAMES[s.puzzle]} / ${s.category}: ${s.solves.length} solves`);
  }
  console.log(`Wrote ${result.solveCount} solves from ${result.sessions.length} sessions to ${output}`);
  if (result.skipped) console.log(`Skipped ${result.skipped} records that could not be read.`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
