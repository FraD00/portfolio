# Francesco d'Ecclesiis — Portfolio

My personal developer portfolio.

On **desktop** it opens as an interactive first-person **3D room**, built from scratch with Three.js: you wake up on a sofa, walk around, and use the TV as a "browser" to open the project pages. On **mobile** it falls back to a classic HTML/CSS site with the same content.

## Built with
- **Three.js** (loaded from a CDN — no build step)
- **Vanilla JavaScript** — first-person controls (Pointer Lock), AABB collisions, raycasting, a small state machine, and reactive objects
- **HTML / CSS** for the classic site and the in-world UI

## Projects featured
- **Crazy Coffee** — cozy coffee-shop sim · Unreal Engine 5
- **Insect Must Die** — 2D platformer · Unity / C#
- **Interactive 3D Portfolio** — this site

## Run locally
It's a fully static site. Serve the folder with any static server, for example:

```bash
npx serve
```

Then open the local URL it prints (use a desktop browser for the 3D version).

## Live
_Deploying on Netlify._
