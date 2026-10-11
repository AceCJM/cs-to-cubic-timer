/*
 * Converts a csTimer export file into a Twisty Timer / Cubic Timer backup file.
 *
 * csTimer export (Export -> "Export to file"):
 *   {
 *     "session1": [[[penalty, timeMs, ...phases], scramble, comment, unixSeconds], ...],
 *     "session2": ...,
 *     "properties": { "sessionData": "{\"1\":{\"name\":..,\"opt\":{\"scrType\":\"333\"}}}", ... }
 *   }
 *   Sessions and sessionData may be stored as JSON strings or as plain values.
 *   penalty: 0 = OK, 2000 = +2, -1 = DNF. timeMs never includes the +2.
 *
 * Twisty / Cubic Timer backup (Export -> Back up):
 *   Header "Puzzle","Category","Time(millis)","Date(millis)","Scramble","Penalty","Comment"
 *   then one row per solve, ';' separated, every field quoted, '\' as the escape char
 *   (opencsv 3.7). penalty: 0 = OK, 1 = +2, 2 = DNF. Time includes the +2.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CsToCubic = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PUZZLES = {
    cubic: ['222', '333', '444', '555', '666', '777', 'skewb', 'mega', 'pyra', 'sq1', 'clock',
      '333oh', '333bld', '444bld', '555bld', '333mbld', '333fmc', 'fto', 'bfto', 'other'],
    twisty: ['222', '333', '444', '555', '666', '777', 'skewb', 'mega', 'pyra', 'sq1', 'clock']
  };

  var PUZZLE_NAMES = {
    '222': '2x2', '333': '3x3', '444': '4x4', '555': '5x5', '666': '6x6', '777': '7x7',
    skewb: 'Skewb', mega: 'Megaminx', pyra: 'Pyraminx', sq1: 'Square-1', clock: 'Clock',
    '333oh': '3x3 OH', '333bld': '3x3 BLD', '444bld': '4x4 BLD', '555bld': '5x5 BLD',
    '333mbld': '3x3 MBLD', '333fmc': '3x3 FMC', fto: 'FTO', bfto: 'FTO BLD', other: 'Other'
  };

  // Same table Cubic Timer uses for its own csTimer import (PuzzleUtils.convertCstimerPuzzleType).
  var EXACT = {
    '333': '333', '222so': '222', '444wca': '444', '555wca': '555', '666wca': '666',
    '777wca': '777', '333ni': '333bld', '333fm': '333fmc', '333oh': '333oh', 'clkwca': 'clock',
    'mgmp': 'mega', 'pyrso': 'pyra', 'skbso': 'skewb', 'sqrs': 'sq1', '444bld': '444bld',
    '555bld': '555bld', 'fto': 'fto', 'ftoso': 'fto'
  };

  // Non-WCA scramble variants of the same puzzle (e.g. "222o", "pyrl4e", "sq1h").
  var PREFIXES = [
    [/^222/, '222'], [/^444/, '444'], [/^555/, '555'], [/^666/, '666'], [/^777/, '777'],
    [/^pyr/, 'pyra'], [/^skb/, 'skewb'], [/^sq(1|r)/, 'sq1'], [/^clk/, 'clock'], [/^mgm/, 'mega'],
    [/^fto/, 'fto']
  ];

  // Cubic Timer puzzle types that Twisty Timer does not have.
  var TWISTY_FALLBACK = {
    '333oh': '333', '333bld': '333', '444bld': '444', '555bld': '555', '333mbld': '333',
    '333fmc': '333', fto: '333', bfto: '333', other: '333'
  };

  function parseMaybeJson(value) {
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  /** Picks the puzzle type for a csTimer scramble type. */
  function mapScrType(scrType, target) {
    var puzzle = EXACT[scrType];
    if (!puzzle) {
      for (var i = 0; i < PREFIXES.length && !puzzle; i++) {
        if (PREFIXES[i][0].test(scrType)) puzzle = PREFIXES[i][1];
      }
    }
    if (!puzzle) puzzle = 'other';
    if (target === 'twisty' && TWISTY_FALLBACK[puzzle]) puzzle = TWISTY_FALLBACK[puzzle];
    return puzzle;
  }

  /**
   * Reads a csTimer export (text or parsed object) and returns its sessions in csTimer order.
   * Each session gets a suggested puzzle and category for the given target app.
   */
  function readSessions(input, target) {
    target = target || 'cubic';
    var data;
    try {
      data = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : input;
    } catch (e) {
      throw new Error('This file is not a csTimer export (it is not valid JSON).');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('This file is not a csTimer export.');
    }

    var props = parseMaybeJson(data.properties) || {};
    var sessionData = {};
    try {
      sessionData = parseMaybeJson(props.sessionData) || {};
    } catch (e) {
      sessionData = {};
    }

    var ids = {};
    Object.keys(data).forEach(function (key) {
      var m = /^session(\d+)$/.exec(key);
      if (m) ids[m[1]] = true;
    });
    Object.keys(sessionData).forEach(function (id) { ids[id] = true; });
    if (Object.keys(ids).length === 0) {
      throw new Error('No csTimer sessions found in this file. Use csTimer "Export to file".');
    }

    var sessions = Object.keys(ids).map(function (id) {
      var meta = sessionData[id] || {};
      var opt = meta.opt || {};
      var scrType = opt.scrType || '333';
      var name = meta.name !== undefined && meta.name !== null && String(meta.name) !== ''
        ? String(meta.name) : 'Session ' + id;
      var solves = [];
      var raw = data['session' + id];
      if (raw !== undefined) {
        try {
          solves = parseMaybeJson(raw) || [];
        } catch (e) {
          solves = [];
        }
      }
      var puzzle = mapScrType(scrType, target);
      return {
        id: id,
        name: name,
        scrType: scrType,
        rank: typeof meta.rank === 'number' ? meta.rank : Number(id),
        solves: Array.isArray(solves) ? solves : [],
        puzzle: puzzle,
        category: puzzle === 'other' ? scrType + '_' + name : name,
        include: true
      };
    });

    sessions.sort(function (a, b) { return a.rank - b.rank || Number(a.id) - Number(b.id); });
    dedupeCategories(sessions);
    return sessions;
  }

  /** Two sessions that land in the same puzzle and category would merge, so number them. */
  function dedupeCategories(sessions) {
    var seen = {};
    sessions.forEach(function (s) {
      var base = s.category;
      var n = 1;
      while (seen[s.puzzle + '\n' + s.category]) {
        n++;
        s.category = base + ' (' + n + ')';
      }
      seen[s.puzzle + '\n' + s.category] = true;
    });
  }

  function formatSeconds(ms) {
    var s = ms / 1000;
    if (s < 60) return s.toFixed(2);
    var min = Math.floor(s / 60);
    var rest = (s - min * 60).toFixed(2);
    return min + ':' + (rest < 10 ? '0' : '') + rest;
  }

  /** Converts one csTimer solve record. Returns null when the record is unusable. */
  function convertSolve(record, puzzle, category) {
    if (!Array.isArray(record) || !Array.isArray(record[0])) return null;
    var times = record[0];
    var rawPenalty = Number(times[0]);
    var time = Number(times[1]);
    var date = Number(record[3]);
    if (!isFinite(time) || !isFinite(date)) return null;

    var penalty = 0;
    if (rawPenalty === -1) {
      penalty = 2;
    } else if (rawPenalty > 0) {
      // csTimer stores +2 as 2000. Larger values only come from manual penalty edits.
      penalty = 1;
      time += rawPenalty;
    }

    // Multi-phase splits are stored after the total, cumulative, last phase first.
    var phases = [];
    if (times.length > 2) {
      var marks = times.slice(1).map(Number).concat([0]);
      for (var j = marks.length - 2; j >= 0; j--) {
        phases.push('P' + (phases.length + 1) + ': ' + formatSeconds(marks[j] - marks[j + 1]));
      }
    }

    var comment = record[2] === undefined || record[2] === null ? '' : String(record[2]);
    if (phases.length) comment = phases.join('\n') + (comment ? '\n' + comment : '');

    // Same clean-up Cubic Timer applies so its scramble images render.
    var scramble = record[1] === undefined || record[1] === null ? '' : String(record[1]);
    if (puzzle === 'sq1') {
      scramble = scramble.replace(/\//g, ' /').replace(/^ /, '');
    } else if (puzzle === 'mega') {
      scramble = scramble.replace(/ {2}/g, '');
    }

    return {
      puzzle: puzzle,
      category: category,
      time: Math.round(time),
      date: Math.round(date * 1000),
      scramble: scramble,
      penalty: penalty,
      comment: comment
    };
  }

  /** Converts the chosen sessions into a flat list of solves, oldest first. */
  function convertSessions(sessions) {
    var solves = [];
    var skipped = 0;
    sessions.forEach(function (s) {
      if (!s.include) return;
      s.solves.forEach(function (record) {
        var solve = convertSolve(record, s.puzzle, s.category);
        if (solve) solves.push(solve); else skipped++;
      });
    });
    solves.sort(function (a, b) { return a.date - b.date; });
    return { solves: solves, skipped: skipped };
  }

  // opencsv 3.7 with quote '"' and escape '\': both characters must be escaped with '\'.
  function quote(value) {
    return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function toBackupCsv(solves) {
    var lines = [['Puzzle', 'Category', 'Time(millis)', 'Date(millis)', 'Scramble', 'Penalty', 'Comment']
      .map(quote).join(';')];
    solves.forEach(function (s) {
      lines.push([s.puzzle, s.category, s.time, s.date, s.scramble, s.penalty, s.comment]
        .map(quote).join(';'));
    });
    return lines.join('\n') + '\n';
  }

  /**
   * Splits a backup into records the way the apps read it: a port of opencsv 3.7
   * CSVReader/CSVParser with separator ';', quote '"', escape '\', strictQuotes on.
   * With strictQuotes, characters outside quotes are dropped. A quoted field can span lines.
   */
  function readCsvRecords(text) {
    var lines = text.split(/\r\n|\r|\n/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    var records = [];
    var pending = null;
    var inField = false; // parser state that opencsv keeps across lines
    var result = null;

    lines.forEach(function (line) {
      var tokens = [];
      var sb = '';
      var inQuotes = false;
      if (pending !== null) {
        sb = pending;
        pending = null;
        inQuotes = true;
      }
      for (var i = 0; i < line.length; i++) {
        var c = line.charAt(i);
        var quoted = inQuotes || inField;
        if (c === '\\') {
          if (quoted && i + 1 < line.length && (line.charAt(i + 1) === '"' || line.charAt(i + 1) === '\\')) {
            sb += line.charAt(++i);
          }
        } else if (c === '"') {
          if (quoted && i + 1 < line.length && line.charAt(i + 1) === '"') {
            sb += line.charAt(++i);
          } else {
            inQuotes = !inQuotes;
          }
          inField = !inField;
        } else if (c === ';' && !inQuotes) {
          tokens.push(sb);
          sb = '';
          inField = false;
        } else if (inQuotes) {
          sb += c;
          inField = true;
        }
      }
      if (inQuotes) {
        pending = sb + '\n';
      } else {
        inField = false;
        tokens.push(sb);
      }
      if (tokens.length) result = result ? result.concat(tokens) : tokens;
      if (pending === null) {
        records.push(result || []);
        result = null;
      }
    });
    // At the end of the file opencsv drops an unclosed quoted field but keeps the fields before it.
    if (pending !== null && result) records.push(result);
    return records;
  }

  var LONG = /^[+-]?\d+$/;

  /**
   * Reads a Cubic Timer or Twisty Timer backup file. The first line is the header.
   * Rows the apps would reject are counted in `errors`, as the apps do.
   */
  function parseBackup(text) {
    text = String(text).replace(/^\uFEFF/, '');
    if (!/^"?Puzzle"?[,;]"?Category"?[,;]"?Time\(millis\)/.test(text)) {
      throw new Error('This file is not a Cubic Timer or Twisty Timer backup.');
    }
    var records = readCsvRecords(text);
    var solves = [];
    var errors = 0;
    records.slice(1).forEach(function (f) {
      if (f.length < 7 || !LONG.test(f[2]) || !LONG.test(f[3]) || !LONG.test(f[5])) {
        errors++;
        return;
      }
      solves.push({
        puzzle: f[0], category: f[1], time: Number(f[2]), date: Number(f[3]),
        scramble: f[4], penalty: Number(f[5]), comment: f[6]
      });
    });
    return { solves: solves, errors: errors };
  }

  /**
   * Two solves are the same solve when they finished at the same millisecond and have the
   * same raw time. csTimer dates are whole seconds, converted to milliseconds, so they match
   * the date the apps store for a solve imported from csTimer. Puzzle, category, scramble and
   * comment are not part of the key, so a solve still matches after you move or rename it in
   * the app. The +2 is taken off the time, so a solve still matches after a penalty change.
   */
  function solveKey(s) {
    return s.date + '|' + (s.penalty === 1 ? s.time - 2000 : s.time);
  }

  /**
   * Adds the csTimer solves to the solves of an existing backup. A csTimer solve that the
   * backup already has, or that came earlier in the csTimer file, is left out. The backup's
   * own rows are all kept: the apps can hold different solves with the same date, for example
   * after a .txt import that has no dates.
   */
  function mergeSolves(existing, incoming) {
    var seen = {};
    existing.forEach(function (s) { seen[solveKey(s)] = true; });
    var added = [];
    incoming.forEach(function (s) {
      var key = solveKey(s);
      if (seen[key]) return;
      seen[key] = true;
      added.push(s);
    });
    var solves = existing.concat(added);
    solves.sort(function (a, b) { return a.date - b.date; });
    return { solves: solves, added: added.length, duplicates: incoming.length - added.length };
  }

  /** Category names in a backup, per puzzle, so new sessions can join one of them. */
  function categoriesByPuzzle(solves) {
    var map = {};
    solves.forEach(function (s) {
      (map[s.puzzle] = map[s.puzzle] || {})[s.category] = true;
    });
    Object.keys(map).forEach(function (p) { map[p] = Object.keys(map[p]).sort(); });
    return map;
  }

  function backupFileName(now) {
    var d = now || new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'Backup_csTimer_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '.txt';
  }

  /**
   * One call conversion: csTimer export text in, backup file text out.
   * With `backupText`, the csTimer solves are added to that existing backup.
   */
  function convert(input, target, backupText) {
    var sessions = readSessions(input, target);
    var result = convertSessions(sessions);
    var backup = backupText !== undefined && backupText !== null
      ? parseBackup(backupText) : { solves: [], errors: 0 };
    var merged = mergeSolves(backup.solves, result.solves);
    return {
      sessions: sessions,
      solves: merged.solves,
      solveCount: merged.solves.length,
      csv: toBackupCsv(merged.solves),
      skipped: result.skipped,
      existing: backup.solves.length,
      backupErrors: backup.errors,
      added: merged.added,
      duplicates: merged.duplicates
    };
  }

  return {
    PUZZLES: PUZZLES,
    PUZZLE_NAMES: PUZZLE_NAMES,
    mapScrType: mapScrType,
    readSessions: readSessions,
    convertSolve: convertSolve,
    convertSessions: convertSessions,
    toBackupCsv: toBackupCsv,
    readCsvRecords: readCsvRecords,
    parseBackup: parseBackup,
    mergeSolves: mergeSolves,
    categoriesByPuzzle: categoriesByPuzzle,
    backupFileName: backupFileName,
    convert: convert
  };
}));
