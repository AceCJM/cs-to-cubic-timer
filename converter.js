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
      data = typeof input === 'string' ? JSON.parse(input.replace(/^﻿/, '')) : input;
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

  function backupFileName(now) {
    var d = now || new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'Backup_csTimer_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '.txt';
  }

  /** One call conversion: csTimer export text in, backup file text out. */
  function convert(input, target) {
    var sessions = readSessions(input, target);
    var result = convertSessions(sessions);
    return {
      csv: toBackupCsv(result.solves),
      sessions: sessions,
      solveCount: result.solves.length,
      skipped: result.skipped
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
    backupFileName: backupFileName,
    convert: convert
  };
}));
