# 🐙 Octo Rescue — a Debris Free Oceans game

A phone-friendly browser game made for [Debris Free Oceans](https://debrisfreeoceans.org).
You play as the DFO octopus. Clean trash out of the sea, and when a boater throws trash
overboard, the octopus gets mad, drags their boat under and eats them.

## Play
Open `index.html` in a browser, or host the folder on any static host (GitHub Pages, Netlify, the DFO website…):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

On a phone, use **Add to Home Screen** to play fullscreen. After the first load it also works offline.

## How it works
| | |
|---|---|
| **Swim** | Drag anywhere on the screen (relative drag, so your thumb never covers the octopus). Desktop: arrow keys / WASD. `P`/`Esc` pauses. |
| **Clean up** | Swim into bottles, cans, bags, six-pack rings, cups, tires and ghost nets. Quick pickups build a combo. |
| **Litterbugs** | Some boaters toss trash overboard. When one does, the octopus gets mad and the boat is tagged **😡 LITTERBUG**. The ♻ sailboats are the good guys, so leave them alone. |
| **Fight back** | Litterbugs throw bottles at you, harpoon boats aim and fire (watch for the red dotted line), and while you wrestle a boat the boater whacks you with an oar. Any bottle that misses becomes more trash. |
| **Devour** | Swim up under a litterbug's boat. The octopus wraps its tentacles around it, drags it down and eats the boater (+250, or +500 for a trawler, and some health back). The wreck spills its trash, so clean that up too. |
| **RAGE** | The meter fills when you see someone litter, when you get hit, and when you collect trash. When it's full the octopus turns red for 8 seconds: faster, can't be hurt, double points, and it can grab *any* polluter, even one that hasn't been tagged yet. |
| **Lose** | When the octopus's health runs out, or when the **OCEAN** meter hits zero because too much trash has piled up (trash on the sea floor counts double). |

A new level starts every 32 seconds. Harpoon boats show up at level 3 and net-dumping trawlers at level 5.
The game-over screen shows a random ocean-debris fact and links to debrisfreeoceans.org.

## Files
- `index.html`, `style.css`: menus and overlays
- `game.js`: the whole game (Canvas 2D + Web Audio, no dependencies or build step)
- `assets/octopus.png`: the octopus silhouette taken from the DFO logo, tinted and animated in-game
- `assets/dfo-logo-white.png`, `assets/icon-*.png`: DFO logo and app icons (from debrisfreeoceans.org)
- `manifest.json`, `sw.js`: installable / offline support
