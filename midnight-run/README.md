# Midnight Run

Trapped in the city after midnight. Collect clues, dodge security drones, outrun the hooded ones, escape the Warden. Someone keeps leaving you messages at every checkpoint.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

**Vercel / Netlify**: push to GitHub, import the repo, accept the Vite defaults (build `npm run build`, output `dist`).

**GitHub Pages**: push to `main`. Repo Settings -> Pages -> Source: GitHub Actions. The included workflow does the rest.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move |
| Shift | Sprint (drains stamina; makes hunters hear you from farther) |
| Space | EMP pulse: freezes nearby drones and hunters, staggers the Warden |
| P / Esc | Pause |
| R | Restart level |
| M | Mute |

## Rules

- Stand in a drone's light and ALERT fills. Full = caught.
- Caught = respawn at last checkpoint and lose 8s. Timer hits zero = level failed.
- Hooded hunters chase when you get close. They are slower than you.
- Collect every clue to unlock the exit. Coffee = +8s. Violet cells = +1 EMP.
- Level 6: your first clue wakes the Warden. He ignores walls and slams a marked circle every few seconds.

## Tuning

- `src/levels.js` -> `LEVELS`: time, drone count/speed/light radius, hunters, clues. Change `seed` for a different city.
- `src/levels.js` -> `MESSAGES`: the 15 checkpoint texts (one per checkpoint, in order). `ENDING`: the finale.
- `src/main.js`: player speed (`movePlayer`), hunter speed (`updateHunters`), Warden speed/slam (`updateBoss`).

## Structure

```
src/levels.js  level configs, messages, procedural city generator
src/main.js    game loop, rules, rendering, HUD, screens
src/audio.js   WebAudio sound effects (no asset files)
```
