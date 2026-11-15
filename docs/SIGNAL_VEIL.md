# SIGNAL VEIL — Reveal the Hidden Patterns of Astronaut Health

SIGNAL VEIL is AURORA's signature interactive feature. You look out from inside an EVA helmet. Your breath has fogged the visor. You wipe it with your glove, and behind the condensation is a constellation of one crew member's health signals, driven entirely by the Constellation Engine (`docs/CONSTELLATION_ENGINE.md`).

Everything in the demonstration is synthetic and labelled as such. Nothing here is a medical device or medical advice.

---

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173/signal-veil.html>. No network, API key or setup is needed.

| URL | What it shows |
|---|---|
| `/signal-veil.html` | The demonstration with the WebGL2 fog shader |
| `/signal-veil.html?fog=2d` | The same, forcing the Canvas 2D fog fallback |

`npm run build` emits both `dist/index.html` (main app) and `dist/signal-veil.html`.

## What a visitor can do

1. **Wipe the fog.** Drag with mouse, pen or finger. The cleared path follows the pointer, has feathered edges, persists, and overlapping strokes combine. Brush radius is adjustable. When about 80% is wiped the rest dissolves; "Clear all fog" and the Enter key do the same; "Fog the visor again" resets it.
2. **Read the constellation.** Ten signals in five categories around a central dial that shows the engine's joint statistic against its limit.
3. **Inspect a signal.** Click it: current value, personal baseline, change, robust z, smoothed deviation, history chart with the baseline band, detected deviations, trend, data quality and a plain-language reason for its status.
4. **Draw a connection.** Drag from one signal to another. If the engine supports a relationship, a luminous line appears with particles travelling from the leading signal to the following one, and the panel shows the statistics, the lag profile, the paired measurements and the limitations. If not, the line is dashed and the panel explains why it cannot be established. **Drawing never creates a relationship; it reveals the engine's result for that pair on that day.**
5. **Travel through the mission.** Scrub, step, play, pause and reset the timeline. Every position shows exactly what the engine would have computed that day.
6. **Replay.** "Replay how the pattern developed" plays from 30 days before the pattern began to 26 days after the engine reported it, pausing on the reporting day. The caption is generated from the data each day.
7. **Data lens** (button or `L`). A magnifying disc with a precise numeric readout for the signal beneath it.
8. **Response tracking.** See what the measurements did before and after a recorded protocol action, and record one yourself.

Keyboard: `L` lens, `P` play/pause, `←` `→` day, `Esc` clear selection, `Enter` on the visor clears the fog.

## How visual states map to data

No animation implies a health event unless the engine reported one.

| What you see | Engine state |
|---|---|
| Glow size and brightness | Magnitude of the smoothed deviation |
| Slow, calm breathing | `normal` |
| Thin outer ring | Within its own limit, but shifted enough to count toward a joint pattern |
| A single sharp ping | `unusual` (an outlying reading) |
| A slowly rotating arc | `drifting` (gradual trend) |
| Expanding rings, faster with larger shift | `sustained` |
| Dashed grey ring, no glow, "no data since day N" | `stale` |
| Dotted hollow ring, "baseline pending" | `insufficient-data` |
| Ember ring and dotted ember figure joining signals | Core members of a reported joint pattern |
| Luminous line with travelling particles | A supported relationship you drew |
| Dashed or dotted grey line | A pair you drew that is not established, or lacks data |
| Central dial | Joint statistic (MEWMA T²) against its control limit |

Ambient dust and the lunar limb are decoration and carry no data.

## Graphics and rendering

Two stacked canvases inside a CSS helmet.

**Scene canvas (Canvas 2D).** `render/SceneRenderer.ts` draws the star field, plate grid, lunar limb, guide ring, dial, pattern figure, links, particles, nodes and labels. The static backdrop is pre-rendered once per size. Glows are cached sprites. Particles and ring phases are computed analytically from the clock, so the frame loop allocates nothing per particle.

**Fog canvas (WebGL2, GLSL ES 3.00).** `render/shaders.ts` is one full-screen fragment pass:

- **Fog body**: five-octave fractal value noise that drifts slowly.
- **Frosted blur**: the scene canvas is re-uploaded as a texture every frame with a full mip chain; the shader samples higher mip levels where fog is thicker, so signals appear as soft luminous shapes under the fog.
- **Condensation beads**: two procedural layers on jittered grids. Each bead has a surface normal used to refract a sharper, displaced view of the scene, a specular highlight and a lit crescent.
- **Sliding drops**: beads that descend with stick-slip motion and leave narrow wet trails.
- **Wipe mask**: a 320×200 single-channel field (`model/wipeMask.ts`) uploaded only when it changes. The shader perturbs it with streak noise so wiped edges are irregular, and gathers beads along wipe edges using the mask gradient.
- **Breath**: each exhale briefly mists the glass near the bottom centre. It never alters the wipe mask.
- **Dissolve**: when the fog is cleared, thin areas go first.
- **Data lens**: a clear, barrel-magnified disc with a lit glass rim.
- Output is premultiplied and transparent where the glass is clear, so the crisp 2D canvas shows through untouched. When no fog remains and the lens is off, the fog pass stops.

**Helmet (`ui/HelmetFrame.tsx`, CSS only).** Shell, seal, curved visor glass, the raised gold sun-shade edge, and reflections that shift against the pointer like a head moving inside a helmet.

**Fallback.** Without WebGL2, `Canvas2DFogSurface` renders a procedural, wipeable fog from the same mask. If neither is available the constellation is shown without fog.

**Performance.** Measured in Chromium at 1143×825 device pixels with the shader active: median frame 16.7 ms, 95th percentile 16.8 ms (60 fps). Device pixel ratio is capped at 1.75. The loop pauses when the page is hidden or the canvas is off-screen and is cancelled on unmount. WebGL context loss and restore are handled.

**Reduced motion.** With `prefers-reduced-motion`, drift, particles, breath, and parallax stop; the fog clears instantly; frames are drawn only when something changes.

**Accessibility.** The "Data table" button shows every encoded value as a table. The Signal tab lists all signals as buttons, and "Test a relationship" offers the same result as drawing a line. The timeline has a labelled range input. Status colours are not a good/bad code.

## Architecture

```
src/engine/                    Constellation Engine (no React, no DOM)
src/data/veilMission.ts        Deterministic 150-day synthetic mission
src/data/engineAdapters.ts     Main-app DailyRecord -> engine dataset
src/features/signal-veil/
  model/      layout, wipeMask, pointer, veilReducer, snapshot   (pure, tested)
  render/     shaders, FogRenderer, SceneRenderer                (no statistics)
  ui/         HelmetFrame, panels, charts, timeline, data table
  SignalVeilCanvas.tsx       visor + constellation, fully controlled
  SignalVeilExperience.tsx   the whole feature for any dataset
  SignalVeilDemo.tsx         the built-in demonstration
```

The renderer consumes a `VeilSnapshot` built by `model/snapshot.ts` from engine results. It contains no statistics of its own.

---

## Integration instructions for the main application

SIGNAL VEIL does not modify navigation, layout, branding or packaging. It imports only shared primitives (`Button`, `Badge`, `Checkbox`, `Segmented`) and the tokens in `src/index.css`.

### Option A: link to the standalone page (no code change beyond a link)

```tsx
<a href="./signal-veil.html">Signal Veil</a>
```

### Option B: add it as a page in the main app (four small edits)

1. `src/types/index.ts`: add `'signal-veil'` to `PageId`.
2. `src/hooks/useMission.tsx`: add `'signal-veil'` to the `valid` array in `pageFromHash`.
3. `src/App.tsx`:

```tsx
const SignalVeil = lazy(() => import('./features/signal-veil').then((m) => ({ default: m.SignalVeilDemo })))
// ...
{page === 'signal-veil' && <SignalVeil />}
```

4. `src/components/layout/Sidebar.tsx`: add one entry to `NAV`, for example:

```tsx
{ id: 'signal-veil', label: 'Signal Veil', icon: Sparkles, group: 'operations' },
```

### Option C: show a main-app crew member in the visor

```tsx
import { SignalVeilExperience } from './features/signal-veil'
import { datasetFromDailyRecords } from './data/engineAdapters'

const dataset = useMemo(() => datasetFromDailyRecords(records, astronaut, EVENTS, viewDay), [records, astronaut, viewDay])

<SignalVeilExperience
  dataset={dataset}
  config={{ baseline: { mode: 'rolling' } }}  // long missions: follow expected adaptation
  onSelectIndicator={(id) => {}}
  onSelectRelationship={(result) => {}}
  onDayChange={(day) => {}}
  onReplayChange={(playing) => {}}
  onReset={() => {}}
/>
```

### `SignalVeilExperience` props

| Prop | Type | Purpose |
|---|---|---|
| `dataset` | `MissionDataset` | Health records, indicator definitions, events, recorded actions |
| `config` | `DeepPartial<EngineConfig>` | Engine settings (optional) |
| `analysis` | `MissionAnalysis` | Prebuilt analysis to share with the app (optional) |
| `initialDay` | `number` | Day shown first (default: last day) |
| `userActions` | `RecordedAction[]` | Extra recorded actions, such as user-entered ones |
| `onRecordAction`, `onRemoveAction` | callbacks | Enable the "Record an action" form |
| `startClear` | `boolean` | Skip the fog |
| `forceCanvas2D` | `boolean` | Use the Canvas 2D fog renderer |
| `onSelectIndicator` | `(id \| null) => void` | A signal was selected or deselected |
| `onSelectRelationship` | `(RelationshipResult \| null) => void` | A connection was drawn or cleared |
| `onDayChange` | `(day) => void` | Timeline position changed |
| `onReplayChange` | `(playing) => void` | Playback started or stopped |
| `onReset` | `() => void` | The visual interaction was reset |

`SignalVeilCanvas` is the visor alone and is fully controlled: it takes a `VeilSnapshot` (from `buildSnapshot(analysis, day, revealedLinks)`), `selectedId`, `connection`, `lens`, `brush`, `fogEpoch`, `clearEpoch`, and reports `onSelect`, `onConnect`, `onFogProgress` and `onLensTarget`.

## Tests

```bash
npm test
```

136 tests. Visualization coverage (69 tests): fog reveal and reset, brush feathering and circularity, stroke trajectory, pointer interpretation (wipe, select, connect, lens, cancel), node selection, connection selection, timeline, replay state, layout and hit-testing, and the snapshot's fidelity to engine output. Shader output itself is verified by eye in the browser, not by automated pixel tests.

## Known limitations

- The fog shader needs WebGL2 for the full effect. The fallback is simpler: no refraction, beads or sliding drops.
- The demonstration follows one crew member. The component accepts any dataset, but the page has no crew switcher.
- Fog state is not saved between visits; recorded user actions are, in `localStorage`.
- The helmet uses a fixed dark palette in both themes, by design.
- Shader appearance was checked in Chromium on one machine. Other GPUs and browsers were not tested.
