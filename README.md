# Play Puck Level 1

Space Cadet pinball energy, air hockey soul.

This is a tiny prototype of a pinball style air hockey game:
- Puck physics
- Two mallet flippers
- Banks (bumpers)
- Goal zone scoring
- Drain penalty
- Score multipliers from bank hits

## Controls
- A = left mallet
- L = right mallet
- Space = launch
- Q = nudge left
- P = nudge right

## Run locally
Just open `index.html` in a browser.

If you want a local server:
- Python: `python -m http.server 8000`
- Then open: `http://localhost:8000`

## Deploy on GitHub Pages
1. Push this repo to GitHub
2. Repo Settings -> Pages
3. Build and deployment -> Deploy from a branch
4. Branch: `main` and folder: `/ (root)`

## Roadmap
- Better flipper feel (stronger kick, better collision)
- Real missions and objectives
- Audio callouts ("PLAY PUCK", "BANK IT", etc.)
- Level 2: Blitz Mode chaos
