# cs-to-cubic-timer

This tool converts all sessions in a csTimer export file into one backup file. Cubic Timer and Twisty Timer can restore that backup file. Each csTimer session becomes a category under a puzzle in the app.

The conversion runs on your computer. The tool does not upload your times.

## Use the web page

You can use the online version at [claude.ai/artifact/8mKuDEMCb4tK6mXqzH4Frr](https://claude.ai/artifact/8mKuDEMCb4tK6mXqzH4Frr). You can also open `index.html` from this folder. Both pages do the same conversion.

1. Open [cstimer.net](https://cstimer.net) on the device that has your times.
2. Click EXPORT, then click Export to file.
3. Open the online version. Alternatively, open `index.html` from this folder in a browser, and keep `converter.js` in the same folder.
4. Drop the csTimer file onto the page.
5. Select Cubic Timer or Twisty Timer.
6. Look at the session table. If a session has the wrong puzzle or category name, change it.
7. Click Download backup file. In the online version, click Save backup file and confirm the save.
8. Copy the backup file to your phone.
9. In the app, open the side menu and tap Export/Import. Tap Import…, then From backup, and choose the file.

## Use the command line

You must have Node.js 18 or later.

```bash
node cli.js cstimer_20261011_101500.txt --target cubic -o backup.txt
```

The `--target` value is `cubic` or `twisty`. The default is `cubic`. If you do not give `-o`, the tool writes `Backup_csTimer_<date>.txt` in the current folder. The command line always uses the default puzzle for each session.

## How sessions become puzzles

The tool reads the scramble type of each csTimer session and picks the puzzle from it.

| csTimer scramble type | Cubic Timer | Twisty Timer |
| --- | --- | --- |
| WCA 2x2 to 7x7, Clock, Megaminx, Pyraminx, Skewb, Square-1 | Same puzzle | Same puzzle |
| Other scrambles for those puzzles, for example `222o` or `pyrl4e` | Same puzzle | Same puzzle |
| 3x3 one-handed | 3x3 OH | 3x3 |
| 3x3, 4x4, 5x5 blindfolded | 3x3, 4x4, 5x5 BLD | 3x3, 4x4, 5x5 |
| 3x3 fewest moves | 3x3 FMC | 3x3 |
| FTO | FTO | 3x3 |
| All other types | Other, with the category `<type>_<session name>` | 3x3 |

The category name is the csTimer session name. If two sessions get the same puzzle and the same name, the tool adds a number to the second name, for example `OH (2)`.

## What the tool converts

| csTimer data | Backup data |
| --- | --- |
| Time | Time in milliseconds. A +2 penalty adds 2000 to the time, the same as the apps do. |
| Penalty | 0 for no penalty, 1 for +2, 2 for DNF |
| Date | Date in milliseconds |
| Scramble | Scramble. The tool adjusts Square-1 and Megaminx scrambles the same way that the Cubic Timer csTimer import does, so that the scramble images show. |
| Comment | Comment |
| Multi-phase splits | Lines in the comment, for example `P1: 7.50` |

## Restoring more than one time

The apps ignore a solve that already exists with the same puzzle, category, time, scramble, and date. If you restore the same file two times, the second restore adds no duplicates. If you change a puzzle or category name between two restores, the app adds those solves again.

## Note about Cubic Timer

Cubic Timer also has its own csTimer import, at Export/Import, Import…, From csTimer export TXT. This tool gives you three more things:

1. It makes a backup for Twisty Timer, which has no csTimer import.
2. It lets you pick the puzzle and category for each session before you import.
3. It puts non-WCA scrambles of a WCA puzzle, for example `222o`, under that puzzle instead of Other.

## Backup file format

When you back up in the apps, they write a file in this format. The tool writes the same format. The first line is a header. Each other line is one solve with seven fields in quotes, separated by `;`:

```
"Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment"
"333";"3x3 main";"10500";"1600000000000";"R U R' U'";"0";""
```

The apps read the file with opencsv 3.7. Thus, the tool writes `"` as `\"` and `\` as `\\` inside a field. A comment can contain line breaks.

## Run the tests

```bash
npm test
```
