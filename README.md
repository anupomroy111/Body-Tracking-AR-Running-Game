# ROY SPEED — Body-Tracked AR Endless Runner

[![Live Demo](https://img.shields.io/badge/Live_Demo-Play_Now-22d3ee?style=for-the-badge)](https://anupomroy111.github.io/Body-Tracking-AR-Running-Game/)
[![License: MIT](https://img.shields.io/badge/License-MIT-34d399?style=for-the-badge)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-0.160-8b7cf6?style=for-the-badge)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose_Landmarker-f5b83d?style=for-the-badge)](https://developers.google.com/mediapipe)

An endless runner where **your whole body is the controller**. Stand in front of your webcam, and on-device AI pose estimation turns your real movements — stepping sideways, raising your arms, squatting, hitting a T-pose — into lane changes, jumps, slides, and hoverboard activations inside a neon 3D city. No wearable, no install, no backend: everything runs in the browser.

**[Play the live demo](https://anupomroy111.github.io/Body-Tracking-AR-Running-Game/)** (camera permission required for AR mode; touch/keyboard mode works on any device).

---

## Why this project

Most browser games use a keyboard or a touchscreen. ROY SPEED explores a different input surface: **full-body pose estimation as a real-time game controller**, running entirely client-side at 30 fps on a laptop webcam. The engineering challenge is turning noisy landmark streams into reliable, low-latency game events — solved here with calibrated baselines, exponential smoothing, hysteresis thresholds, and per-gesture cooldowns.

## Features

### Body-tracking AR mode
- **MediaPipe PoseLandmarker** (lite model) with GPU delegate and automatic CPU fallback
- Four natural gestures mapped to game actions, with a calibration step that adapts to the player's height and camera distance
- Live **gesture coach bar** during the first seconds of a run, highlighting each gesture the moment it is recognized
- Mirrored skeleton avatar rendered over a corner picture-in-picture panel — the camera feed never obstructs gameplay
- Graceful degradation: if the body leaves the frame, the run continues and touch/keyboard input takes over

### The game
- 3D endless runner built on **Three.js**: trains, low barriers, overhead gates, rooftop riding, and four visually distinct zones that cycle as distance grows
- Power-ups: coin magnet, shield, double score, jetpack — plus a hoverboard with its own cooldown
- Speed ramps continuously; difficulty tiers (Recruit / Pilot / Ace) tune base speed, ramp rate, and obstacle density
- **4 unlockable runners** with real gameplay perks (magnet range, jump height, speed/score bonus, free shield)
- Rotating **mission system** with coin + score rewards; progress persists across sessions
- Coin bank, best score per difficulty, best distance, and total-run statistics — all saved locally
- Crash → run summary → instant restart loop; pause/resume; auto-pause when the tab loses focus

### Craft
- **Zero audio assets** — music, wind, coins, and gesture cues are synthesized live with the WebAudio API
- Fully responsive: phone portrait, phone landscape, tablet, and desktop; safe-area aware
- Premium dashboard with sidebar navigation (bottom tab bar on mobile), stat cards, runner gallery, mission tracker, and an illustrated control guide
- Screen-shake, hit vignette, particle dust, coin popups, and milestone banners for game feel
- No build step, no dependencies to install — plain ES modules and CDN import maps

## Controls

| Action | Body gesture | Keyboard | Touch |
| --- | --- | --- | --- |
| Switch lane | Step left / right | `←` `→` or `A` `D` | Swipe left / right |
| Jump | Raise both arms | `↑` / `W` / `Space` | Swipe up |
| Slide | Squat | `↓` / `S` | Swipe down |
| Hoverboard | T-pose | `H` | BOARD button |
| Pause | — | `Esc` / `P` | Pause button |
| Mute | — | `M` | Sound button |

## Tech stack

| Layer | Technology |
| --- | --- |
| Rendering | Three.js 0.160 (WebGL), custom canvas background simulation |
| Pose estimation | MediaPipe Tasks Vision 0.10.14 — PoseLandmarker (lite), VIDEO mode |
| Audio | WebAudio API — fully procedural synthesis |
| State & persistence | Vanilla ES modules, `localStorage` |
| UI | Hand-written CSS design system (Inter + Space Grotesk), no framework |
| Delivery | Static site, CDN import maps, no bundler |

## How the pose pipeline works

```
webcam frame ──▶ PoseLandmarker.detectForVideo() ──▶ 33 landmarks
                                                        │
                    calibrated leg baseline ◀── 2 s standing calibration
                                                        │
        ┌───────────────────────────────────────────────┤
        │ hip X (smoothed, frame thirds + hysteresis) ──▶ lane event
        │ both wrists above shoulders / hip velocity ──▶ jump event
        │ leg compression vs baseline + hip drop ──────▶ slide (held)
        │ wrists at shoulder height, opposite sides ───▶ T-pose → board
        └───────────────────────────────────────────────┘
                    per-gesture cooldowns + event queue ──▶ game loop
```

Landmark heuristics are deliberately simple and explainable; reliability comes from the signal conditioning around them (smoothing factor 0.45, lane hysteresis bands, 260–2000 ms cooldowns, slow baseline adaptation while standing).

## Project structure

```
├── index.html          # App shell: HUD, dashboard, calibration, modals
├── css/
│   └── style.css       # Design system + responsive rules (no framework)
└── js/
    ├── main.js         # Game loop, 3D world, entities, progression, UI logic
    ├── pose.js         # PoseTracker: MediaPipe wrapper, gesture analysis, avatar overlay
    └── audio.js        # Procedural WebAudio engine (music, wind, SFX)
```

## Run locally

Any static file server works — no install, no build:

```bash
npx serve .
# or
python -m http.server 8080
```

Open `http://localhost:8080`. Camera access requires a secure context (`localhost` or HTTPS). For AR mode, stand 2–3 m from the camera so your full body is in frame.

## Roadmap

- Gesture remapping and sensitivity settings
- Additional zone themes and obstacle patterns
- Gamepad API support
- Daily challenge runs with shareable score cards

## License

[MIT](LICENSE) © 2026 Anupom Roy

---

Built by **[Anupom Roy](https://github.com/anupomroy111)** — feedback and contributions welcome.