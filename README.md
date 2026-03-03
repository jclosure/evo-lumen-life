# Evo Lumen Life 🧬🌊

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)](#)
[![Status](https://img.shields.io/badge/status-experimental-ffb347)](#)

A cross-platform artificial-life sandbox where soft-bodied organisms swim, hunt, reproduce, and evolve in real time.

**Live demo:** https://evo-lumen-life.vercel.app

> **Tagline:** *Not a reset-heavy sim. A living reef with overlapping generations, pressure, adaptation, and weird surprises.*

---

## Why this exists

Most life sims fall into one of two traps:
1. too abstract to feel alive,
2. too rigid to feel emergent.

**Evo Lumen Life** is designed to sit in the middle:
- continuous lifecycles,
- visible ecology,
- editable species behavior,
- and a scene that stays watchable for long sessions.

---

## What’s in the tank right now

### Continuous ecosystem (no hard generation swaps)
Organisms age, reproduce, and die asynchronously. Population turnover is gradual and overlapping.

### Reproduction modes
- Sexual reproduction (crossover + mutation)
- Asexual reproduction (mutated split/clone)
- Worms lay eggs that drift, hatch, and grow over time

### Trophic behavior
- Prey forage micro food particles
- Predators chase prey
- Prey flee and seek edge refuge under stress
- Predation is struggle + gradual consumption (not instant delete)

### Visual ecology
- Multi-form organisms: worms, flagellates, protozoa, virus-like agents
- Tiny drifting nutrient particles with local flow disturbance
- Corpses/remains fade out instead of hard-disappearing
- Worm swimming motion tuned for lateral tail swish

### Dynamic species controls
The species list is generated from lineages currently alive in the simulation.

For any selected species, you can tune live:
- prey drive
- speed
- mobility
- aggression
- sexual attractiveness

As new lineages appear, the list updates.

---

## Quick start

```bash
cd ~/projects/evo-lumen-life
npm install
npm run dev
```

Then open the local URL printed by Vite.

---

## Controls

### Global
- Pause / Resume
- Show Champion / Show Ecosystem
- New Genesis
- Export Champion
- Time / Evolution / Drift sliders

### Species tuning
- Choose an active species from dropdown
- Adjust behavior traits
- Changes apply immediately

---

## Project goals

- Make artificial life that is **fun to watch**.
- Make behavior modifications **immediate and tactile**.
- Keep the stack **portable** (Mac/Linux/Windows browser-first).
- Let novelty emerge from pressure, not scripted choreography.

---

## Tech stack

- TypeScript
- Vite
- Canvas 2D renderer (chosen for portability and reliability)

---

## Roadmap ideas

- lineage tree + speciation timeline
- mating pursuit / courtship behavior
- egg predation and guarding
- scavenger niche around remains
- camera follow / documentary mode
- save + replay worlds

---

## Try it, break it, evolve it

If you enjoy emergent systems, this is your playground.
Fork it, push it too far, and share the weird species that appear.
