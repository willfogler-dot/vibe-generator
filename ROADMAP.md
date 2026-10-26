# Roadmap

Goal: TV for music. One beautiful, realistic, cinematic landscape you can leave running, which responds to the music subtly and naturally.

## Code layout
- `index.html`: UI shell, audio analysis (`Listen`), jazz-cover engine (`Engine`, `Synth`), app glue
- `js/world.js`: the 3D world (terrain, sky, light, vegetation, water, camera, music hooks)
- `js/three.module.min.js` and `js/addons/`: Three.js r169, vendored (no CDN at runtime)
- `js/ez-tree.es.js`: EZ-Tree procedural trees (MIT)
- `assets/`: rocks, grass, flowers, ground and water textures, horse and bird models
- `classic/`: the previous version, kept as-is

## Task A: environment and cinematic experience (now)
Done in this pass:
- Continuous camera glide. No cuts. A slow "altitude mood" drifts between low passes through the grass and high vistas over minutes; spring-smoothed height and look target, gentle banking.
- Realistic base: textured terrain, EZ-Tree trees with distance stand-ins, photo grass cards and flowers, scanned rocks, reflective water, sun shadows, sky-based lighting, HDR bloom, light shafts.
- The note orb is now off by default (Settings > Note orb).

Next, in priority order:
1. Distant ground. Fields beyond the grass radius still read as flat texture. Add far grass impostors / color-varied meadow shading, and better ground detail (normal + AO).
2. Lighting quality. Smooth time-of-day transitions (blend presets instead of switching), a softer sky and cloud model, ambient occlusion.
3. Composition. Bias the path past landmarks (ruins, giant tree, lakes) so the glide frames them, and add scenic slow-downs.
4. Performance on the target laptop. Measure fps; tune the quality tiers (shadow size, grass radius, tree LOD distance).

## Task B: music synchronization (next)
Principle: the world breathes with the song; nothing pulses to every beat.
- Bass → wind gusts rolling through grass and trees (exists), tiny camera float
- Mids → water ripple strength, cloud drift, pollen density
- Highs → sparkle on water, pollen/firefly glints
- Song sections (long-term energy) → camera altitude mood, light warmth, fog density, flight speed (exists, slow)
- Big moments → sun breaks through (light shafts), birds take off

Audio sources, honestly:
- Audio file: most reliable, analysed directly
- Shared tab / system audio: Chrome or Edge only. Tab audio works everywhere Chrome does; system audio needs Windows + "Entire screen"
- Microphone: works anywhere, hears the room, lowest quality
- Spotify: no direct connection (their developer terms forbid analysing their audio). Play it and share the tab or system audio.

## Task C: world expansion (later)
More environments (highlands, forest, coast exist in rough form), weather, seasons, a larger and more varied world, WebGPU/TSL path for denser vegetation.
