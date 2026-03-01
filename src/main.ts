type Vec3 = { x: number; y: number; z: number };

type MorphKind = "worm" | "flagellate" | "protozoa" | "virus";

type Genome = {
  kind: MorphKind;
  segments: number;
  segmentRadius: number;
  tailAmplitude: number;
  tailFrequency: number;
  stiffness: number;
  thrust: number;
  drag: number;
  wander: number;
  sociability: number;
  personalSpace: number;
  turnRate: number;
  // morphology controls
  membraneJitter: number;
  flagellaCount: number;
  spikeLength: number;
  colorA: [number, number, number];
  colorB: [number, number, number];
};

type Organism = {
  genome: Genome;
  head: Vec3;
  vel: Vec3;
  dir: Vec3;
  nodes: Vec3[];
  phase: number;
  energyUsed: number;
  distance: number;
  uniqueCells: Set<number>;
  fitness: number;
  age: number;
  lifespan: number;
  maturityAge: number;
  reproductionCooldown: number;
  energy: number;
  trophic: "prey" | "predator";
  birthScale: number;
  struggle: number;
};

type Food = { pos: Vec3; vel: Vec3; energy: number; respawnTimer: number };
type Egg = { pos: Vec3; vel: Vec3; parentA: Genome; parentB?: Genome; hatchTimer: number; trophic: "prey" | "predator" };
type Corpse = { pos: Vec3; vel: Vec3; color: [number, number, number]; size: number; life: number; maxLife: number };

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas unavailable");

const SPECIES = 18;
const ELITE = 4;
const BASE_LIFESPAN = 72;
const TANK_RADIUS = 1.8;
const MAX_SEGMENTS = 10;
const FOOD_COUNT = 34;

const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
let generation = 1;
let worldAge = 0;
let births = 0;
let deaths = 0;
let paused = false;
let showBestOnly = false;
let timeScale = 1.6;
let evolutionSpeed = 1.2;
let drift = 1.0;

let organisms: Organism[] = Array.from({ length: SPECIES }, () => makeOrganism(randomGenome(rng), rng));
let foods: Food[] = Array.from({ length: FOOD_COUNT }, () => ({ pos: randomPointInSphere(rng, TANK_RADIUS * 0.82), vel: { x: 0, y: 0, z: 0 }, energy: 0.4 + rng() * 0.9, respawnTimer: 0 }));
let eggs: Egg[] = [];
let corpses: Corpse[] = [];
let bestEver = cloneGenome(organisms[0].genome);
let bestScoreEver = -Infinity;

type SpeciesProfile = { preyDrive: number; speed: number; mobility: number; aggression: number; attractiveness: number };
const speciesProfiles = new Map<string, SpeciesProfile>();
let selectedSpeciesKey = "";

function speciesKeyOf(o: Organism): string {
  const segBin = Math.max(1, Math.min(9, Math.round(o.genome.segments / 2)));
  const sizeBin = Math.max(1, Math.min(9, Math.round(o.genome.segmentRadius * 50)));
  return `${o.genome.kind}.${o.trophic}.s${segBin}.r${sizeBin}`;
}

function ensureSpeciesProfile(key: string): SpeciesProfile {
  let p = speciesProfiles.get(key);
  if (!p) {
    p = { preyDrive: 1, speed: 1, mobility: 1, aggression: 1, attractiveness: 1 };
    speciesProfiles.set(key, p);
  }
  return p;
}

function randomGenome(r: () => number): Genome {
  const kinds: MorphKind[] = ["worm", "flagellate", "protozoa", "virus"];
  const kind = kinds[(r() * kinds.length) | 0];

  let seg = 4 + ((r() * (MAX_SEGMENTS - 3)) | 0);
  if (kind === "protozoa") seg = 3 + ((r() * 4) | 0);
  if (kind === "virus") seg = 1 + ((r() * 2) | 0);

  const hue = r();
  return {
    kind,
    segments: seg,
    segmentRadius: kind === "virus" ? 0.08 + r() * 0.08 : 0.05 + r() * 0.08,
    tailAmplitude: 0.04 + r() * 0.32,
    tailFrequency: 0.2 + r() * 2.0,
    stiffness: 0.05 + r() * 0.35,
    thrust: kind === "virus" ? 0.03 + r() * 0.12 : 0.08 + r() * 0.45,
    drag: 0.78 + r() * 0.2,
    wander: 0.01 + r() * 0.12,
    sociability: -0.7 + r() * 1.4,
    personalSpace: 0.12 + r() * 0.5,
    turnRate: 0.5 + r() * 1.5,
    membraneJitter: r() * 0.9,
    flagellaCount: 1 + ((r() * 5) | 0),
    spikeLength: r() * 0.9,
    colorA: hslToRgb(hue, 0.75, 0.62),
    colorB: hslToRgb((hue + 0.28 + r() * 0.16) % 1, 0.85, 0.55),
  };
}

function makeOrganism(genome: Genome, r: () => number): Organism {
  const head = randomPointInSphere(r, TANK_RADIUS * 0.65);
  const dir = normalize({ x: r() - 0.5, y: r() - 0.5, z: r() - 0.5 });
  const nodes: Vec3[] = [];
  for (let i = 0; i < genome.segments; i++) {
    nodes.push({ x: head.x - dir.x * i * genome.segmentRadius * 1.9, y: head.y - dir.y * i * genome.segmentRadius * 1.9, z: head.z - dir.z * i * genome.segmentRadius * 1.9 });
  }
  const lifespan = BASE_LIFESPAN * (0.7 + r() * 0.9);
  return {
    genome,
    head: { ...head },
    vel: { x: 0, y: 0, z: 0 },
    dir,
    nodes,
    phase: r() * Math.PI * 2,
    energyUsed: 0,
    distance: 0,
    uniqueCells: new Set<number>(),
    fitness: 0,
    age: 0,
    lifespan,
    maturityAge: lifespan * (0.2 + r() * 0.22),
    reproductionCooldown: 2 + r() * 3,
    energy: 1.2 + r() * 1.0,
    trophic: r() < 0.22 ? "predator" : "prey",
    birthScale: 0.03,
    struggle: 0,
  };
}

function resetOrganismMetrics(o: Organism) {
  o.energyUsed = 0;
  o.distance = 0;
  o.uniqueCells.clear();
  o.fitness = 0;
}

function stepOrganism(o: Organism, dt: number, t: number, interaction: Vec3, urge: Vec3) {
  const g = o.genome;
  const profile = ensureSpeciesProfile(speciesKeyOf(o));
  const noise = curlish(o.head, t);
  const wobble = Math.sin(t * g.tailFrequency + o.phase) * g.tailAmplitude;

  const steer = add(add(scale(noise, g.wander + 0.02), scale(interaction, 0.75 * profile.mobility)), scale(urge, 1.05 * profile.preyDrive));
  o.dir = normalize(add(scale(o.dir, 1 - 0.06 * g.turnRate * profile.mobility), scale(steer, 0.09 * g.turnRate * profile.mobility)));

  const up = Math.abs(dot(o.dir, { x: 0, y: 1, z: 0 })) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const side = normalize(cross(o.dir, up));

  const swimForce = add(add(scale(o.dir, g.thrust * profile.speed), scale(side, wobble * 0.25 * profile.mobility)), scale(interaction, 0.18 * profile.mobility));
  o.vel = add(scale(o.vel, g.drag), scale(swimForce, dt * (1.8 * profile.speed)));

  const old = { ...o.head };
  o.head = add(o.head, scale(o.vel, dt));
  const dHead = sub(o.head, old);
  o.distance += length(dHead);
  o.energyUsed += (length(swimForce) + Math.abs(wobble) * 0.4) * dt;

  const dist = length(o.head);
  if (dist > TANK_RADIUS - 0.03) {
    const n = scale(o.head, 1 / Math.max(1e-6, dist));
    o.head = scale(n, TANK_RADIUS - 0.03);
    o.vel = sub(o.vel, scale(n, 1.8 * dot(o.vel, n)));
    o.dir = normalize(sub(o.dir, scale(n, 1.2 * dot(o.dir, n))));
  }

  o.nodes[0] = { ...o.head };
  for (let i = 1; i < o.nodes.length; i++) {
    const prev = o.nodes[i - 1];
    const cur = o.nodes[i];
    const toPrev = sub(prev, cur);
    const d = length(toPrev);
    const rest = g.segmentRadius * 1.9;
    const dir = d > 1e-6 ? scale(toPrev, 1 / d) : { x: 0, y: 0, z: 0 };
    const target = sub(prev, scale(dir, rest));
    o.nodes[i] = add(scale(cur, 1 - g.stiffness), scale(target, g.stiffness));
  }

  const cx = Math.floor((o.head.x / TANK_RADIUS * 0.5 + 0.5) * 12);
  const cy = Math.floor((o.head.y / TANK_RADIUS * 0.5 + 0.5) * 12);
  const cz = Math.floor((o.head.z / TANK_RADIUS * 0.5 + 0.5) * 12);
  const key = (cx & 15) | ((cy & 15) << 4) | ((cz & 15) << 8);
  o.uniqueCells.add(key);

  o.energy -= dt * (0.018 + 0.06 * g.thrust + 0.03 * g.wander);
  o.birthScale = clamp(o.birthScale + dt * 0.1, 0.02, 1);
  o.struggle = Math.max(0, o.struggle - dt * 1.4);
}

function evaluateFitness(o: Organism) {
  const exploration = o.uniqueCells.size / 200;
  const efficiency = o.distance / Math.max(0.001, o.energyUsed);
  const grace = Math.max(0, 1 - Math.abs(length(o.vel) - 0.2));
  o.fitness = exploration * 1.2 + efficiency * 1.2 + grace * 0.5;
}

function spawnChild(parentA: Organism, parentB: Organism): Organism {
  const childGenome = mutate(crossover(parentA.genome, parentB.genome, rng), rng);
  const child = makeOrganism(childGenome, rng);
  const mixPos = scale(add(parentA.head, parentB.head), 0.5);
  child.head = add(mixPos, scale(normalize({ x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 }), 0.08));
  child.nodes[0] = { ...child.head };
  child.vel = scale(add(parentA.vel, parentB.vel), 0.35);
  child.birthScale = 0.03;
  return child;
}

function spawnClone(parent: Organism): Organism {
  const childGenome = mutate(cloneGenome(parent.genome), rng);
  const child = makeOrganism(childGenome, rng);
  child.head = add(parent.head, scale(normalize({ x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 }), 0.06));
  child.nodes[0] = { ...child.head };
  child.vel = add(scale(parent.vel, 0.65), scale(normalize({ x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 }), 0.05));
  child.trophic = parent.trophic;
  child.birthScale = 0.03;
  return child;
}

function layEgg(parent: Organism, mate?: Organism) {
  eggs.push({
    pos: add(parent.head, scale(parent.dir, -0.07)),
    vel: scale(parent.vel, 0.35),
    parentA: cloneGenome(parent.genome),
    parentB: mate ? cloneGenome(mate.genome) : undefined,
    hatchTimer: 4 + rng() * 6,
    trophic: parent.trophic,
  });
}

function hatchEgg(egg: Egg): Organism {
  const g = egg.parentB ? mutate(crossover(egg.parentA, egg.parentB, rng), rng) : mutate(cloneGenome(egg.parentA), rng);
  const child = makeOrganism(g, rng);
  child.head = { ...egg.pos };
  child.vel = add(scale(egg.vel, 0.5), scale(normalize({ x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 }), 0.03));
  child.nodes[0] = { ...child.head };
  child.trophic = egg.trophic;
  child.birthScale = 0.025;
  return child;
}

function runLifecycle(dt: number) {
  const newborns: Organism[] = [];

  for (const o of organisms) {
    o.age += dt;
    o.reproductionCooldown -= dt;

    evaluateFitness(o);
    // smooth fitness so behavior is less jittery
    o.fitness = o.fitness * 0.25 + (o.distance / Math.max(0.001, o.energyUsed + 0.01)) * 0.75;

    if (o.fitness > bestScoreEver) {
      bestScoreEver = o.fitness;
      bestEver = cloneGenome(o.genome);
    }

    const mature = o.age > o.maturityAge;
    const reproBase = 0.03 * evolutionSpeed;
    const reproFitness = clamp(o.fitness * 0.2, 0, 0.55);
    const reproChance = (reproBase + reproFitness) * dt;

    if (mature && o.reproductionCooldown <= 0 && o.energy > 0.8 && rng() < reproChance) {
      const useSexual = rng() < 0.68;
      let child: Organism | null = null;
      if (useSexual) {
        // mate competition: pick from nearby mature candidates, fallback tournament
        const mates = organisms.filter(m => m !== o && m.age > m.maturityAge && m.energy > 0.6);
        let mate = tournament(organisms, rng);
        if (mates.length) {
          let bestMate = mates[(rng() * mates.length) | 0];
          let bestScore = -1e9;
          for (let k = 0; k < Math.min(8, mates.length); k++) {
            const cand = mates[(rng() * mates.length) | 0];
            const p = ensureSpeciesProfile(speciesKeyOf(cand));
            const dist = length(sub(cand.head, o.head));
            const score = p.attractiveness * 1.2 + cand.energy * 0.4 - dist * 0.35;
            if (score > bestScore) {
              bestScore = score;
              bestMate = cand;
            }
          }
          mate = bestMate;
        }
        if (o.genome.kind === "worm") {
          layEgg(o, mate);
        } else {
          child = spawnChild(o, mate);
        }
        o.energy -= 0.42;
        mate.energy -= 0.25;
      } else {
        // asexual budding / split
        if (o.genome.kind === "worm") {
          layEgg(o);
        } else {
          child = spawnClone(o);
        }
        o.energy -= 0.52;
      }
      if (child) {
        newborns.push(child);
        births++;
        generation++;
      }
      o.reproductionCooldown = 2.6 + rng() * 4.0;
      o.energyUsed += 0.12;
    }
  }

  // eggs drift and hatch
  const remainingEggs: Egg[] = [];
  for (const egg of eggs) {
    egg.hatchTimer -= dt;
    egg.vel = add(scale(egg.vel, 0.95), scale(curlish(egg.pos, worldAge), dt * 0.04));
    egg.pos = add(egg.pos, scale(egg.vel, dt));
    const r = length(egg.pos);
    if (r > TANK_RADIUS * 0.88) {
      const n = scale(egg.pos, 1 / Math.max(1e-6, r));
      egg.pos = scale(n, TANK_RADIUS * 0.88);
      egg.vel = sub(egg.vel, scale(n, 1.3 * dot(egg.vel, n)));
    }
    if (egg.hatchTimer <= 0) {
      newborns.push(hatchEgg(egg));
      births++;
      generation++;
    } else {
      remainingEggs.push(egg);
    }
  }
  eggs = remainingEggs;

  const survivors: Organism[] = [];
  for (const o of organisms) {
    const oldAge = o.age / Math.max(0.1, o.lifespan);
    const frailty = oldAge > 0.7 ? (oldAge - 0.7) * 0.55 : 0;
    const lowFitness = o.fitness < 0.08 ? 0.06 : 0;
    const deathChance = (frailty + lowFitness) * dt;

    if (o.age >= o.lifespan || o.energy <= -0.05 || rng() < deathChance) {
      deaths++;
      corpses.push({
        pos: { ...o.head },
        vel: scale(o.vel, 0.35),
        color: mixRgb(o.genome.colorA, o.genome.colorB, 0.5),
        size: clamp(o.genome.segmentRadius * 0.9, 0.03, 0.12),
        life: 7 + rng() * 8,
        maxLife: 7 + rng() * 8,
      });
      continue;
    }
    survivors.push(o);
  }

  organisms = survivors.concat(newborns);

  while (organisms.length < SPECIES) {
    const anchor = organisms.length > 0 ? tournament(organisms, rng) : makeOrganism(randomGenome(rng), rng);
    const mate = organisms.length > 0 ? tournament(organisms, rng) : anchor;
    const child = rng() < (0.12 + 0.2 * drift)
      ? makeOrganism(randomGenome(rng), rng)
      : spawnChild(anchor, mate);
    organisms.push(child);
    births++;
    generation++;
  }

  if (organisms.length > SPECIES) {
    organisms.sort((a, b) => (b.fitness - a.fitness) - (a.age - b.age) * 0.02);
    organisms.length = SPECIES;
  }
}

function crossover(a: Genome, b: Genome, r: () => number): Genome {
  return {
    kind: r() < 0.5 ? a.kind : b.kind,
    segments: r() < 0.5 ? a.segments : b.segments,
    segmentRadius: r() < 0.5 ? a.segmentRadius : b.segmentRadius,
    tailAmplitude: r() < 0.5 ? a.tailAmplitude : b.tailAmplitude,
    tailFrequency: r() < 0.5 ? a.tailFrequency : b.tailFrequency,
    stiffness: r() < 0.5 ? a.stiffness : b.stiffness,
    thrust: r() < 0.5 ? a.thrust : b.thrust,
    drag: r() < 0.5 ? a.drag : b.drag,
    wander: r() < 0.5 ? a.wander : b.wander,
    sociability: r() < 0.5 ? a.sociability : b.sociability,
    personalSpace: r() < 0.5 ? a.personalSpace : b.personalSpace,
    turnRate: r() < 0.5 ? a.turnRate : b.turnRate,
    membraneJitter: r() < 0.5 ? a.membraneJitter : b.membraneJitter,
    flagellaCount: r() < 0.5 ? a.flagellaCount : b.flagellaCount,
    spikeLength: r() < 0.5 ? a.spikeLength : b.spikeLength,
    colorA: r() < 0.5 ? a.colorA : b.colorA,
    colorB: r() < 0.5 ? a.colorB : b.colorB,
  };
}

function mutate(g: Genome, r: () => number): Genome {
  const m = cloneGenome(g);
  const s = drift;
  if (r() < 0.12 * s) {
    const kinds: MorphKind[] = ["worm", "flagellate", "protozoa", "virus"];
    m.kind = kinds[(r() * kinds.length) | 0];
  }
  if (r() < 0.24 * s) m.segments = clampInt(m.segments + (r() < 0.5 ? -1 : 1), 1, MAX_SEGMENTS);
  m.segmentRadius = clamp(m.segmentRadius + (r() - 0.5) * 0.025 * s, 0.04, 0.14);
  m.tailAmplitude = clamp(m.tailAmplitude + (r() - 0.5) * 0.1 * s, 0.01, 0.38);
  m.tailFrequency = clamp(m.tailFrequency + (r() - 0.5) * 0.6 * s, 0.12, 2.4);
  m.stiffness = clamp(m.stiffness + (r() - 0.5) * 0.12 * s, 0.03, 0.55);
  m.thrust = clamp(m.thrust + (r() - 0.5) * 0.18 * s, 0.04, 0.6);
  m.drag = clamp(m.drag + (r() - 0.5) * 0.08 * s, 0.74, 0.99);
  m.wander = clamp(m.wander + (r() - 0.5) * 0.04 * s, 0.004, 0.16);
  m.sociability = clamp(m.sociability + (r() - 0.5) * 0.35 * s, -0.9, 0.9);
  m.personalSpace = clamp(m.personalSpace + (r() - 0.5) * 0.16 * s, 0.08, 0.75);
  m.turnRate = clamp(m.turnRate + (r() - 0.5) * 0.36 * s, 0.4, 2.4);
  m.membraneJitter = clamp(m.membraneJitter + (r() - 0.5) * 0.25 * s, 0, 1.2);
  m.flagellaCount = clampInt(m.flagellaCount + (r() < 0.5 ? -1 : 1), 1, 6);
  m.spikeLength = clamp(m.spikeLength + (r() - 0.5) * 0.4 * s, 0, 1.2);
  if (r() < 0.3) {
    m.colorA = hslToRgb((rgbHue(m.colorA) + (r() - 0.5) * 0.1 + 1) % 1, 0.76, 0.62);
    m.colorB = hslToRgb((rgbHue(m.colorB) + (r() - 0.5) * 0.1 + 1) % 1, 0.86, 0.55);
  }
  return m;
}

function tournament(arr: Organism[], r: () => number): Organism {
  let best = arr[(r() * arr.length) | 0];
  for (let i = 0; i < 3; i++) {
    const c = arr[(r() * arr.length) | 0];
    if (c.fitness > best.fitness) best = c;
  }
  return best;
}

function cloneGenome(g: Genome): Genome {
  return { ...g, colorA: [...g.colorA] as [number, number, number], colorB: [...g.colorB] as [number, number, number] };
}

function step(dt: number, time: number) {
  if (paused) return;

  const subSteps = 2;
  const h = dt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    const interactions: Vec3[] = organisms.map(() => ({ x: 0, y: 0, z: 0 }));
    const urges: Vec3[] = organisms.map(() => ({ x: 0, y: 0, z: 0 }));

    for (let i = 0; i < organisms.length; i++) {
      for (let j = i + 1; j < organisms.length; j++) {
        const a = organisms[i];
        const b = organisms[j];
        const ab = sub(b.head, a.head);
        const d = Math.max(0.0001, length(ab));
        const n = scale(ab, 1 / d);

        const space = 0.5 * (a.genome.personalSpace + b.genome.personalSpace);
        const social = 0.5 * (a.genome.sociability + b.genome.sociability);

        let f = 0;
        if (d < space) f = -(space - d) * 1.45;
        else if (d < 1.5) f = social * (d - space) * 0.08 - 0.035; // less clumping, more spacing

        const force = scale(n, f);
        interactions[i] = add(interactions[i], force);
        interactions[j] = sub(interactions[j], force);

        // predator/prey chase + flee
        if (a.trophic === "predator" && b.trophic === "prey") {
          const pa = ensureSpeciesProfile(speciesKeyOf(a));
          const pb = ensureSpeciesProfile(speciesKeyOf(b));
          urges[i] = add(urges[i], scale(n, 0.45 * pa.aggression));
          urges[j] = sub(urges[j], scale(n, 0.8 * pb.mobility));
          if (d < 0.18) b.struggle = Math.max(b.struggle, 0.9);
          if (d < 0.1 && b.birthScale > 0.5) {
            // struggle + consumption over time (not instant)
            a.energy += 0.28 * h;
            b.energy -= 0.5 * h;
            b.vel = add(b.vel, scale(normalize({ x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 }), 0.04));
          }
        } else if (b.trophic === "predator" && a.trophic === "prey") {
          const pb = ensureSpeciesProfile(speciesKeyOf(b));
          const pa = ensureSpeciesProfile(speciesKeyOf(a));
          urges[j] = sub(urges[j], scale(n, 0.45 * pb.aggression));
          urges[i] = sub(urges[i], scale(n, 0.8 * pa.mobility));
          if (d < 0.18) a.struggle = Math.max(a.struggle, 0.9);
          if (d < 0.1 && a.birthScale > 0.5) {
            b.energy += 0.28 * h;
            a.energy -= 0.5 * h;
            a.vel = add(a.vel, scale(normalize({ x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 }), 0.04));
          }
        }
      }
    }

    // food behavior (tiny drifting particles with local fluid coupling)
    for (let fi = 0; fi < foods.length; fi++) {
      const food = foods[fi];
      if (food.respawnTimer > 0) {
        food.respawnTimer -= h;
        if (food.respawnTimer <= 0) {
          food.pos = randomPointInSphere(rng, TANK_RADIUS * 0.82);
          food.vel = { x: 0, y: 0, z: 0 };
          food.energy = 0.4 + rng() * 0.9;
        }
        continue;
      }

      // background micro-current + gentle buoyancy
      const current = curlish(food.pos, time + s * h);
      let accel = add(scale(current, 0.06), { x: 0, y: 0.018, z: 0 });

      for (let i = 0; i < organisms.length; i++) {
        const o = organisms[i];
        const toFood = sub(food.pos, o.head);
        const d = length(toFood);

        // prey are attracted to food
        if (o.trophic === "prey" && d < 0.95) urges[i] = add(urges[i], scale(normalize(toFood), 0.36));

        // local flow disturbance: particles sway around swimmers
        if (d < 0.5) {
          const away = normalize(toFood);
          const swirl = normalize(cross(o.vel, away));
          const push = (0.5 - d) * 0.55;
          accel = add(accel, add(scale(away, push), scale(swirl, push * 0.7)));
        }

        if (o.trophic === "prey" && d < 0.06) {
          o.energy += food.energy;
          food.respawnTimer = 4 + rng() * 7;
          break;
        }
      }

      if (food.respawnTimer <= 0) {
        food.vel = add(scale(food.vel, 0.93), scale(accel, h));
        food.pos = add(food.pos, scale(food.vel, h));

        const r = length(food.pos);
        if (r > TANK_RADIUS * 0.86) {
          const n = scale(food.pos, 1 / Math.max(1e-6, r));
          food.pos = scale(n, TANK_RADIUS * 0.86);
          food.vel = sub(food.vel, scale(n, 1.5 * dot(food.vel, n)));
        }
      }
    }

    for (let i = 0; i < organisms.length; i++) {
      const o = organisms[i];
      if (o.trophic === "prey") {
        // edge refuge: prey prefer perimeter, strongly when stressed by predators
        const stress = o.struggle;
        const rEdge = length(o.head) / TANK_RADIUS;
        const toEdge = normalize(o.head);
        const baselineRefuge = clamp(1 - rEdge, 0, 1) * 0.1;
        const panicRefuge = stress > 0.08 ? 0.65 * stress : 0;
        urges[i] = add(urges[i], scale(toEdge, baselineRefuge + panicRefuge));
      }
      stepOrganism(o, h, time + s * h, interactions[i], urges[i]);
    }
  }

  // corpses drift/fade and are gradually scavenged
  const nextCorpses: Corpse[] = [];
  for (const c of corpses) {
    c.life -= dt;
    if (c.life <= 0) continue;
    c.vel = add(scale(c.vel, 0.94), scale(curlish(c.pos, worldAge), dt * 0.03));
    c.pos = add(c.pos, scale(c.vel, dt));
    const rr = length(c.pos);
    if (rr > TANK_RADIUS * 0.88) {
      const n = scale(c.pos, 1 / Math.max(1e-6, rr));
      c.pos = scale(n, TANK_RADIUS * 0.88);
      c.vel = sub(c.vel, scale(n, 1.2 * dot(c.vel, n)));
    }
    nextCorpses.push(c);
  }
  corpses = nextCorpses;

  worldAge += dt;
  runLifecycle(dt);
}

function project(p: Vec3, w: number, h: number) {
  const yaw = performance.now() * 0.00012;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x = p.x * cy - p.z * sy;
  const z = p.x * sy + p.z * cy;
  const y = p.y;

  const camZ = 4.2;
  const zz = z + camZ;
  const f = 0.85 / Math.max(0.3, zz);
  return {
    x: w * 0.5 + x * w * f,
    y: h * 0.5 - y * h * f,
    s: f,
    z: zz,
  };
}

function draw() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(innerWidth * dpr);
  const h = Math.floor(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  // background
  const g = ctx.createRadialGradient(w * 0.2, h * 0.2, 0, w * 0.5, h * 0.5, Math.max(w, h));
  g.addColorStop(0, "#101a3a");
  g.addColorStop(0.6, "#0a1027");
  g.addColorStop(1, "#050812");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // food particles (micro scale)
  for (const food of foods) {
    if (food.respawnTimer > 0) continue;
    const f = project(food.pos, w, h);
    const fr = clamp((0.55 + food.energy * 0.35) * dpr * (1.0 + f.s * 0.9), 0.7 * dpr, 2.0 * dpr);

    // faint halo
    ctx.beginPath();
    ctx.fillStyle = "rgba(140,255,170,0.22)";
    ctx.arc(f.x, f.y, fr * 2.0, 0, Math.PI * 2);
    ctx.fill();

    // core particle
    ctx.beginPath();
    ctx.fillStyle = "rgba(165,255,185,0.88)";
    ctx.arc(f.x, f.y, fr, 0, Math.PI * 2);
    ctx.fill();
  }

  // fading corpses / remains
  for (const c of corpses) {
    const p = project(c.pos, w, h);
    const a = clamp(c.life / c.maxLife, 0, 1);
    const r = clamp(c.size * w * p.s * 0.65, 1.0 * dpr, 5.0 * dpr);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${Math.round(c.color[0] * 255)},${Math.round(c.color[1] * 255)},${Math.round(c.color[2] * 255)},${0.25 * a})`;
    ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = `rgba(${Math.round(c.color[0] * 255)},${Math.round(c.color[1] * 255)},${Math.round(c.color[2] * 255)},${0.45 * a})`;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // eggs (worm hatch stage)
  for (const egg of eggs) {
    const e = project(egg.pos, w, h);
    const r = clamp(2.2 * dpr * (1 + e.s * 0.2), 1.6 * dpr, 3.6 * dpr);
    const pulse = 0.75 + 0.25 * Math.sin(worldAge * 4 + e.x * 0.01);
    ctx.beginPath();
    ctx.fillStyle = `rgba(250,230,180,${0.45 * pulse})`;
    ctx.arc(e.x, e.y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,246,220,${0.9 * pulse})`;
    ctx.ellipse(e.x, e.y, r, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const list = showBestOnly ? [makeOrganism(cloneGenome(bestEver), () => 0.5)] : organisms;
  const heads = list
    .map((o) => ({ o, p: project(o.head, w, h) }))
    .sort((a, b) => b.p.z - a.p.z);

  for (const item of heads) {
    const o = item.o;
    if (o.genome.kind === "worm") drawWorm(o, w, h, dpr);
    else if (o.genome.kind === "flagellate") drawFlagellate(o, w, h, dpr);
    else if (o.genome.kind === "protozoa") drawProtozoa(o, w, h, dpr);
    else drawVirus(o, w, h, dpr);

    if (o.struggle > 0.01) {
      const hp = project(o.head, w, h);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,80,80,${0.5 * o.struggle})`;
      ctx.lineWidth = Math.max(1, 2.2 * dpr * o.struggle);
      ctx.arc(hp.x, hp.y, 8 * dpr * o.struggle, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // tank ring
  const rr = Math.min(w, h) * 0.42;
  ctx.strokeStyle = "rgba(130,190,255,0.25)";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5, rr, 0, Math.PI * 2);
  ctx.stroke();
}

function rgba(c: [number, number, number], a: number) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

function litColor(c: [number, number, number], lit: number): [number, number, number] {
  return [clamp(c[0] * lit, 0, 1), clamp(c[1] * lit, 0, 1), clamp(c[2] * lit, 0, 1)];
}

function drawWorm(o: Organism, w: number, h: number, dpr: number) {
  const g = o.genome;
  const rawPts = o.nodes.map((p) => project(p, w, h));
  const flowDir = { x: o.dir.x, y: o.dir.y };
  const flowLen = Math.max(1e-6, Math.hypot(flowDir.x, flowDir.y));
  const nx = -flowDir.y / flowLen;
  const ny = flowDir.x / flowLen;
  const pts = rawPts.map((p, i) => {
    const t = i / Math.max(1, rawPts.length - 1);
    // lateral tail swish for swimming (not peristaltic crawling)
    const swish = Math.sin(worldAge * (3.0 + o.genome.tailFrequency * 1.8) - t * 10 + o.phase) * t * 1.6 * dpr;
    return { ...p, x: p.x + nx * swish, y: p.y + ny * swish };
  });
  if (pts.length < 2) return;

  const widths = pts.map((q, i) => {
    const t = i / Math.max(1, pts.length - 1);
    const radius3 = g.segmentRadius * (1 - t * 0.72) * o.birthScale;
    return Math.max(0.7 * dpr, radius3 * w * q.s * 1.35);
  });

  // soft outer glow tube
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const c = mixRgb(g.colorA, g.colorB, i / Math.max(1, pts.length - 1));
    ctx.strokeStyle = rgba(c, 0.18);
    ctx.lineWidth = Math.max(widths[i], widths[i + 1]) * 2.0;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();
  }

  // main tapered body tube
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const t = i / Math.max(1, pts.length - 1);
    const base = mixRgb(g.colorA, g.colorB, t);
    const lit = 0.72 + 0.55 * (1 - o.nodes[i].z / TANK_RADIUS);
    const c = litColor(base, lit);

    ctx.strokeStyle = rgba(c, 0.96);
    ctx.lineWidth = Math.max(widths[i], widths[i + 1]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();
  }

  // subtle dorsal highlight for volume
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = Math.max(1, Math.max(widths[i], widths[i + 1]) * 0.22);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x - widths[i] * 0.12, a.y - widths[i] * 0.12);
    const mx = (a.x + b.x) * 0.5 - widths[i] * 0.08;
    const my = (a.y + b.y) * 0.5 - widths[i] * 0.08;
    ctx.quadraticCurveTo(mx, my, b.x - widths[i + 1] * 0.12, b.y - widths[i + 1] * 0.12);
    ctx.stroke();
  }

  // head cap
  const h0 = pts[0];
  const hc = litColor(g.colorA, 1.1);
  ctx.beginPath();
  ctx.fillStyle = rgba(hc, 0.95);
  ctx.ellipse(h0.x, h0.y, widths[0] * 0.65, widths[0] * 0.5, Math.atan2(o.dir.y, o.dir.x), 0, Math.PI * 2);
  ctx.fill();
}

function drawFlagellate(o: Organism, w: number, h: number, dpr: number) {
  const g = o.genome;
  const head = project(o.head, w, h);
  const headR = Math.max(4 * dpr, g.segmentRadius * w * head.s * 1.4 * o.birthScale);
  const c = litColor(g.colorA, 1.05);

  // body
  ctx.beginPath();
  ctx.fillStyle = rgba(c, 0.9);
  ctx.ellipse(head.x, head.y, headR * 1.2, headR * 0.85, Math.atan2(o.dir.y, o.dir.x), 0, Math.PI * 2);
  ctx.fill();

  // nucleus
  ctx.beginPath();
  ctx.fillStyle = rgba(g.colorB, 0.75);
  ctx.arc(head.x + headR * 0.18, head.y - headR * 0.06, headR * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // flagella
  const count = clampInt(g.flagellaCount, 1, 6);
  for (let f = 0; f < count; f++) {
    const a = (f / count) * Math.PI * 2 + o.phase * 0.3;
    const len = headR * (1.6 + 0.5 * Math.sin(performance.now() * 0.003 + f));
    const x1 = head.x + Math.cos(a) * headR * 0.7;
    const y1 = head.y + Math.sin(a) * headR * 0.7;
    const x2 = x1 + Math.cos(a + 0.5 * Math.sin(performance.now() * 0.004 + f)) * len;
    const y2 = y1 + Math.sin(a + 0.5 * Math.sin(performance.now() * 0.004 + f)) * len;
    ctx.strokeStyle = rgba(g.colorB, 0.7);
    ctx.lineWidth = Math.max(1, headR * 0.12);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) * 0.5 + Math.sin(a * 3) * headR * 0.35, (y1 + y2) * 0.5 + Math.cos(a * 2) * headR * 0.35, x2, y2);
    ctx.stroke();
  }
}

function drawProtozoa(o: Organism, w: number, h: number, dpr: number) {
  const g = o.genome;
  const head = project(o.head, w, h);
  const r = Math.max(6 * dpr, g.segmentRadius * w * head.s * 1.9 * o.birthScale);
  const jit = 0.15 + g.membraneJitter * 0.2;
  const pts = 18;

  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const wob = 1 + jit * Math.sin(a * 3 + performance.now() * 0.003 + o.phase);
    const x = head.x + Math.cos(a) * r * wob;
    const y = head.y + Math.sin(a) * r * (0.85 + 0.18 * Math.cos(a * 2 + o.phase));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(g.colorA, 0.84);
  ctx.fill();

  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + o.phase;
    ctx.beginPath();
    ctx.fillStyle = rgba(g.colorB, 0.55);
    ctx.arc(head.x + Math.cos(a) * r * 0.35, head.y + Math.sin(a * 1.2) * r * 0.25, r * (0.12 + 0.05 * i), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVirus(o: Organism, w: number, h: number, dpr: number) {
  const g = o.genome;
  const head = project(o.head, w, h);
  const r = Math.max(2.2 * dpr, g.segmentRadius * w * head.s * 0.42 * o.birthScale);

  // core
  ctx.beginPath();
  ctx.fillStyle = rgba(g.colorA, 0.9);
  ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
  ctx.fill();

  // spikes
  const spikes = 10;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 + performance.now() * 0.0006;
    const len = r * (0.45 + 0.9 * g.spikeLength);
    const x1 = head.x + Math.cos(a) * r;
    const y1 = head.y + Math.sin(a) * r;
    const x2 = head.x + Math.cos(a) * (r + len);
    const y2 = head.y + Math.sin(a) * (r + len);
    ctx.strokeStyle = rgba(g.colorB, 0.72);
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = rgba(g.colorB, 0.85);
    ctx.arc(x2, y2, Math.max(1, r * 0.16), 0, Math.PI * 2);
    ctx.fill();
  }
}

const hudRefs: {
  gen?: HTMLElement;
  best?: HTMLElement;
  controls?: HTMLElement;
  pauseBtn?: HTMLButtonElement;
  viewBtn?: HTMLButtonElement;
  timeSlider?: HTMLInputElement;
  evoSlider?: HTMLInputElement;
  driftSlider?: HTMLInputElement;
  timeVal?: HTMLElement;
  evoVal?: HTMLElement;
  driftVal?: HTMLElement;
  speciesSelect?: HTMLSelectElement;
  preyDrive?: HTMLInputElement;
  speedDrive?: HTMLInputElement;
  mobilityDrive?: HTMLInputElement;
  aggressionDrive?: HTMLInputElement;
  attractDrive?: HTMLInputElement;
} = {};

function initHud() {
  if (hudRefs.gen) return;
  hud.innerHTML = `
    <div><strong>Evo Lumen Life — Reef Mode</strong> · 3D evolving swimmers (portable renderer)</div>
    <div id="hud_gen"></div>
    <div id="hud_best"></div>
    <div id="hud_controls_text"></div>
    <div class="row">
      <button id="pause">Pause</button>
      <button id="view">Show Champion</button>
      <button id="nuke">New Genesis</button>
      <button id="export">Export Champion</button>
    </div>
    <div class="row">
      <label>Time <input id="timeScale" type="range" min="0.4" max="3" step="0.05" value="${timeScale}"> <code id="timeVal"></code></label>
      <label>Evolution <input id="evoSpeed" type="range" min="0.4" max="3" step="0.05" value="${evolutionSpeed}"> <code id="evoVal"></code></label>
      <label>Drift <input id="drift" type="range" min="0.2" max="2.5" step="0.05" value="${drift}"> <code id="driftVal"></code></label>
    </div>
    <div class="row"><label>Species <select id="speciesSelect"></select></label></div>
    <div class="row">
      <label>PreyDrive <input id="spPrey" type="range" min="0.2" max="2.5" step="0.05" value="1"></label>
      <label>Speed <input id="spSpeed" type="range" min="0.2" max="2.5" step="0.05" value="1"></label>
    </div>
    <div class="row">
      <label>Mobility <input id="spMob" type="range" min="0.2" max="2.5" step="0.05" value="1"></label>
      <label>Aggression <input id="spAgg" type="range" min="0.2" max="2.5" step="0.05" value="1"></label>
      <label>Attract <input id="spAttr" type="range" min="0.2" max="2.5" step="0.05" value="1"></label>
    </div>
  `;

  hudRefs.gen = hud.querySelector<HTMLElement>("#hud_gen")!;
  hudRefs.best = hud.querySelector<HTMLElement>("#hud_best")!;
  hudRefs.controls = hud.querySelector<HTMLElement>("#hud_controls_text")!;
  hudRefs.pauseBtn = hud.querySelector<HTMLButtonElement>("#pause")!;
  hudRefs.viewBtn = hud.querySelector<HTMLButtonElement>("#view")!;
  hudRefs.timeSlider = hud.querySelector<HTMLInputElement>("#timeScale")!;
  hudRefs.evoSlider = hud.querySelector<HTMLInputElement>("#evoSpeed")!;
  hudRefs.driftSlider = hud.querySelector<HTMLInputElement>("#drift")!;
  hudRefs.timeVal = hud.querySelector<HTMLElement>("#timeVal")!;
  hudRefs.evoVal = hud.querySelector<HTMLElement>("#evoVal")!;
  hudRefs.driftVal = hud.querySelector<HTMLElement>("#driftVal")!;
  hudRefs.speciesSelect = hud.querySelector<HTMLSelectElement>("#speciesSelect")!;
  hudRefs.preyDrive = hud.querySelector<HTMLInputElement>("#spPrey")!;
  hudRefs.speedDrive = hud.querySelector<HTMLInputElement>("#spSpeed")!;
  hudRefs.mobilityDrive = hud.querySelector<HTMLInputElement>("#spMob")!;
  hudRefs.aggressionDrive = hud.querySelector<HTMLInputElement>("#spAgg")!;
  hudRefs.attractDrive = hud.querySelector<HTMLInputElement>("#spAttr")!;

  hudRefs.pauseBtn.addEventListener("click", () => { paused = !paused; });
  hudRefs.viewBtn.addEventListener("click", () => { showBestOnly = !showBestOnly; });
  hud.querySelector<HTMLButtonElement>("#nuke")!.onclick = () => {
    organisms = Array.from({ length: SPECIES }, () => makeOrganism(randomGenome(rng), rng));
    eggs = [];
    corpses = [];
    foods = Array.from({ length: FOOD_COUNT }, () => ({ pos: randomPointInSphere(rng, TANK_RADIUS * 0.82), vel: { x: 0, y: 0, z: 0 }, energy: 0.4 + rng() * 0.9, respawnTimer: 0 }));
    generation = 1;
    worldAge = 0;
    births = 0;
    deaths = 0;
    bestScoreEver = -Infinity;
    bestEver = cloneGenome(organisms[0].genome);
    selectedSpeciesKey = "";
  };
  hud.querySelector<HTMLButtonElement>("#export")!.onclick = () => {
    const payload = {
      app: "evo-lumen-life",
      mode: "reef-2d-render",
      version: 3,
      createdAt: new Date().toISOString(),
      generation,
      bestScoreEver,
      bestGenome: bestEver,
      controls: { timeScale, evolutionSpeed, drift },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `evo-lumen-reef-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const applyTime = () => {
    timeScale = Number(hudRefs.timeSlider!.value);
    hudRefs.timeVal!.textContent = `${timeScale.toFixed(2)}x`;
  };
  const applyEvo = () => {
    evolutionSpeed = Number(hudRefs.evoSlider!.value);
    hudRefs.evoVal!.textContent = `${evolutionSpeed.toFixed(2)}x`;
  };
  const applyDrift = () => {
    drift = Number(hudRefs.driftSlider!.value);
    hudRefs.driftVal!.textContent = `${drift.toFixed(2)}x`;
  };

  const syncSpeciesSliders = () => {
    if (!selectedSpeciesKey) return;
    const p = ensureSpeciesProfile(selectedSpeciesKey);
    hudRefs.preyDrive!.value = String(p.preyDrive);
    hudRefs.speedDrive!.value = String(p.speed);
    hudRefs.mobilityDrive!.value = String(p.mobility);
    hudRefs.aggressionDrive!.value = String(p.aggression);
    hudRefs.attractDrive!.value = String(p.attractiveness);
  };
  const applySpecies = () => {
    if (!selectedSpeciesKey) return;
    const p = ensureSpeciesProfile(selectedSpeciesKey);
    p.preyDrive = Number(hudRefs.preyDrive!.value);
    p.speed = Number(hudRefs.speedDrive!.value);
    p.mobility = Number(hudRefs.mobilityDrive!.value);
    p.aggression = Number(hudRefs.aggressionDrive!.value);
    p.attractiveness = Number(hudRefs.attractDrive!.value);
  };

  for (const ev of ["input", "change"]) {
    hudRefs.timeSlider.addEventListener(ev, applyTime);
    hudRefs.evoSlider.addEventListener(ev, applyEvo);
    hudRefs.driftSlider.addEventListener(ev, applyDrift);
    hudRefs.preyDrive.addEventListener(ev, applySpecies);
    hudRefs.speedDrive.addEventListener(ev, applySpecies);
    hudRefs.mobilityDrive.addEventListener(ev, applySpecies);
    hudRefs.aggressionDrive.addEventListener(ev, applySpecies);
    hudRefs.attractDrive.addEventListener(ev, applySpecies);
  }
  hudRefs.speciesSelect.addEventListener("change", () => {
    selectedSpeciesKey = hudRefs.speciesSelect!.value;
    syncSpeciesSliders();
  });

  // initialize visible values immediately
  applyTime();
  applyEvo();
  applyDrift();
  syncSpeciesSliders();
}

let lastSpeciesUiRefresh = 0;

function refreshSpeciesUi() {
  const keys = Array.from(new Set(organisms.map(speciesKeyOf))).sort();
  if (!keys.length) return;
  for (const k of keys) ensureSpeciesProfile(k);

  if (!selectedSpeciesKey || !keys.includes(selectedSpeciesKey)) selectedSpeciesKey = keys[0];

  const sel = hudRefs.speciesSelect!;
  if (sel.options.length !== keys.length || Array.from(sel.options).some((o, i) => o.value !== keys[i])) {
    sel.innerHTML = keys.map(k => `<option value="${k}">${k}</option>`).join("");
  }
  sel.value = selectedSpeciesKey;

  const p = ensureSpeciesProfile(selectedSpeciesKey);
  hudRefs.preyDrive!.value = String(p.preyDrive);
  hudRefs.speedDrive!.value = String(p.speed);
  hudRefs.mobilityDrive!.value = String(p.mobility);
  hudRefs.aggressionDrive!.value = String(p.aggression);
  hudRefs.attractDrive!.value = String(p.attractiveness);
}

function updateHud() {
  initHud();
  if (worldAge - lastSpeciesUiRefresh > 0.5) {
    refreshSpeciesUi();
    lastSpeciesUiRefresh = worldAge;
  }
  const best = organisms.reduce((a, b) => (a.fitness > b.fitness ? a : b));
  const predators = organisms.filter(o => o.trophic === "predator").length;
  const prey = organisms.length - predators;
  hudRefs.gen!.innerHTML = `birth-gen <code>${generation}</code> · world age <code>${worldAge.toFixed(1)}s</code> · pop <code>${organisms.length}</code> (pred <code>${predators}</code> / prey <code>${prey}</code>) · eggs <code>${eggs.length}</code> · births <code>${births}</code> · deaths <code>${deaths}</code>`;
  hudRefs.best!.innerHTML = `best now <code>${best.fitness.toFixed(3)}</code> (${best.genome.kind}) · best ever <code>${bestScoreEver.toFixed(3)}</code> · render <code>${showBestOnly ? "champion" : "ecosystem"}</code>`;
  hudRefs.controls!.innerHTML = `time <code>${timeScale.toFixed(2)}x</code> · evolution <code>${evolutionSpeed.toFixed(2)}x</code> · drift <code>${drift.toFixed(2)}x</code>`;
  hudRefs.pauseBtn!.textContent = paused ? "Resume" : "Pause";
  hudRefs.viewBtn!.textContent = showBestOnly ? "Show Ecosystem" : "Show Champion";
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt * timeScale, now * 0.001);
  draw();
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function clampInt(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v | 0)); }
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(a: Vec3, s: number): Vec3 { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function length(a: Vec3): number { return Math.hypot(a.x, a.y, a.z); }
function normalize(a: Vec3): Vec3 { const l = length(a); return l > 1e-6 ? scale(a, 1 / l) : { x: 1, y: 0, z: 0 }; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }

function randomPointInSphere(r: () => number, radius: number): Vec3 {
  for (;;) {
    const p = { x: (r() * 2 - 1) * radius, y: (r() * 2 - 1) * radius, z: (r() * 2 - 1) * radius };
    if (length(p) <= radius) return p;
  }
}

function curlish(p: Vec3, t: number): Vec3 {
  const x = p.x, y = p.y, z = p.z;
  return normalize({
    x: Math.sin(y * 1.9 + t * 0.21) - Math.cos(z * 1.6 - t * 0.17),
    y: Math.sin(z * 1.5 + t * 0.18) - Math.cos(x * 1.8 + t * 0.15),
    z: Math.sin(x * 1.7 - t * 0.19) - Math.cos(y * 1.4 + t * 0.13),
  });
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function rgbHue(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return h;
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}
