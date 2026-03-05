# Maze Puzzle (browser + hostable)

This is a **2D maze puzzle** that runs fully in the browser (no backend required). It generates a new solvable maze and lets you play using keyboard or swipe.

## Run locally

Any static server works. For example, with Python:

```bash
cd maze-puzzle
python -m http.server 8000
```

Open `http://localhost:8000`.

## Host on a server

Because it's just static files, you can host it almost anywhere:

- **Nginx/Apache/IIS**: copy the `maze-puzzle/` folder contents to your web root.
- **GitHub Pages / Netlify / Vercel static**: deploy the folder as a static site.

## Controls

- **Move**: Arrow keys / WASD, or swipe on the maze
- **New maze**: `N`
- **Reset**: `R`
- **Toggle solution**: `H`
