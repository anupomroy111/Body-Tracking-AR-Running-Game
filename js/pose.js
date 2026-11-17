// ROY SPEED — full-body pose tracking (MediaPipe PoseLandmarker)
export class PoseTracker {
  constructor(video, overlay) {
    this.video = video;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.landmarker = null;
    this.ready = false;
    this.present = false;
    this.lastDetect = 0;
    this.lastVideoTime = -1;
    this.lm = null;
    this.hipX = 0.5; this.hipY = 0.6;
    this.prevHipY = 0.6; this.prevT = 0;
    this.baselineLeg = 0;
    this.calibrating = false;
    this.calibSamples = [];
    this.calibT = 0;
    this.slideHeld = false;
    this.events = [];
    this.pip = false;
    this.detectInterval = 33;
    this.camInPip = true;
    this.gestureLabel = '';
    this.gestureLabelT = 0;
    this.lastLane = 1; this.lastLaneT = 0;
    this.lastJumpT = 0; this.lastBoardT = 0;
    this.armsUp = false; this.tpose = false;
    this.gestureLabel = '';
  }

  async init(onStatus) {
    onStatus('Loading body-tracking AI model…');
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    const opts = (delegate) => ({
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    try {
      this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch {
      this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts('CPU'));
    }
    this.ready = true;
  }

  toScreen(p) {
    const vw = innerWidth, vh = innerHeight;
    const vW = this.video.videoWidth || 1280, vH = this.video.videoHeight || 720;
    const s = Math.max(vw / vW, vh / vH);
    const ox = (vw - vW * s) / 2, oy = (vh - vH * s) / 2;
    return { x: vw - (p.x * vW * s + ox), y: p.y * vH * s + oy };
  }

  startCalibration() {
    this.calibrating = true;
    this.calibSamples = [];
    this.calibT = 0;
    this.baselineLeg = 0;
  }

  update(now, dt) {
    if (!this.ready || this.video.readyState < 2) return;
    if (now - this.lastDetect >= (this.detectInterval || 33) && this.video.currentTime !== this.lastVideoTime) {
      this.lastDetect = now;
      this.lastVideoTime = this.video.currentTime;
      let res;
      try { res = this.landmarker.detectForVideo(this.video, now); } catch { return; }
      const lms = res.landmarks;
      if (lms && lms.length) {
        const lm = lms[0];
        const vis = (i) => (lm[i].visibility ?? 1) > 0.5;
        this.present = vis(23) && vis(24) && vis(11) && vis(12);
        this.lm = lm;
        if (this.present) this.analyze(lm, now, dt);
      } else {
        this.present = false;
        this.lm = null;
        this.slideHeld = false;
      }
    }
    this.draw();
  }

  analyze(lm, now, dt) {
    const mx = (i) => 1 - lm[i].x;
    const hipX = (mx(23) + mx(24)) / 2;
    const hipY = (lm[23].y + lm[24].y) / 2;
    const shoY = (lm[11].y + lm[12].y) / 2;
    const shoX = (mx(11) + mx(12)) / 2;
    const ankY = (lm[27].y + lm[28].y) / 2;
    const leg = Math.max(0.02, ankY - hipY);
    this.hipX += (hipX - this.hipX) * 0.45;
    this.hipY = hipY;

    if (this.calibrating) {
      this.calibT += dt;
      this.calibSamples.push(leg);
      if (this.calibT >= 2.0) {
        const s = [...this.calibSamples].sort((a, b) => a - b);
        this.baselineLeg = s[Math.floor(s.length / 2)] || 0.3;
        this.calibrating = false;
      }
      return;
    }
    if (!this.baselineLeg) this.baselineLeg = leg;
    // slow adaptation to distance changes while standing
    if (!this.slideHeld) this.baselineLeg += (leg - this.baselineLeg) * 0.004;

    // lane from body position (thirds of frame, hysteresis + cooldown)
    let lane = this.hipX < 0.40 ? 0 : this.hipX > 0.60 ? 2 : 1;
    if (lane !== this.lastLane) {
      const edge = lane === 0 ? 0.40 : lane === 2 ? 0.60 : (this.lastLane === 0 ? 0.44 : 0.56);
      const crossed = lane === 0 ? this.hipX < edge - 0.02 : lane === 2 ? this.hipX > edge + 0.02 : (this.hipX > 0.44 && this.hipX < 0.56);
      if (crossed && now - this.lastLaneT > 260) {
        this.lastLane = lane; this.lastLaneT = now;
        this.events.push({ type: 'lane', lane });
      }
    }

    // jump: both wrists above shoulders, or fast upward hip velocity
    const armsUp = lm[15].y < shoY - 0.04 && lm[16].y < shoY - 0.04;
    const hipVel = dt > 0 ? (this.prevHipY - hipY) / dt : 0;
    this.prevHipY = hipY;
    this.armsUp = armsUp;
    if ((armsUp || hipVel > 0.5) && now - this.lastJumpT > 500) {
      this.lastJumpT = now;
      this.events.push({ type: 'jump' });
      this.gestureLabel = 'JUMP';
      this.gestureLabelT = now;
    }

    // slide: squat = leg compression vs calibrated standing baseline
    const squat = leg < this.baselineLeg * 0.68 && hipY > shoY + 0.04;
    if (squat && !this.slideHeld) { this.gestureLabel = 'SLIDE'; this.gestureLabelT = now; }
    this.slideHeld = squat;

    // hoverboard: T-pose (both arms extended sideways at shoulder height)
    const tpose =
      Math.abs(lm[15].y - shoY) < 0.08 && Math.abs(lm[16].y - shoY) < 0.08 &&
      Math.abs(mx(15) - shoX) > 0.17 && Math.abs(mx(16) - shoX) > 0.17 &&
      (mx(15) - shoX) * (mx(16) - shoX) < 0;
    this.tpose = tpose;
    if (tpose && now - this.lastBoardT > 2000) {
      this.lastBoardT = now;
      this.events.push({ type: 'board' });
      this.gestureLabel = 'BOARD';
      this.gestureLabelT = now;
    }

    // pose angles for mirroring onto the 3D runner
    const torso = Math.max(0.05, hipY - shoY);
    const seg = (a, b) => ({ nx: (mx(b) - mx(a)) / torso, ny: (lm[b].y - lm[a].y) / torso });
    const aL = seg(11, 15), aR = seg(12, 16), lL = seg(23, 27), lR = seg(24, 28);
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    this.poseAngles = {
      armL: { x: cl((1.15 - aL.ny) * -1.1, -2.7, 0.7), z: cl(aL.nx * 1.15, -2.2, 2.2) },
      armR: { x: cl((1.15 - aR.ny) * -1.1, -2.7, 0.7), z: cl(aR.nx * 1.15, -2.2, 2.2) },
      legL: { x: cl((1.55 - lL.ny) * -0.85, -1.3, 0.8), z: cl(lL.nx * 0.7, -0.9, 0.9) },
      legR: { x: cl((1.55 - lR.ny) * -0.85, -1.3, 0.8), z: cl(lR.nx * 0.7, -0.9, 0.9) },
      lean: cl((shoX - hipX) / torso * 0.9, -0.5, 0.5)
    };
  }

  // direct landmark injection (QA / alternate pose sources)
  ingest(lm, now, dt) {
    const vis = (i) => (lm[i].visibility ?? 1) > 0.5;
    this.lm = lm;
    this.present = vis(23) && vis(24) && vis(11) && vis(12);
    if (this.present) this.analyze(lm, now, dt);
    else this.slideHeld = false;
    this.draw();
  }

  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  pipRect() {
    const vw = innerWidth, vh = innerHeight;
    const w = Math.max(96, Math.min(160, vw * 0.26));
    const h = Math.min(vh * 0.3, w * 1.35);
    return { x: vw - w - 10, y: 56, w, h };
  }

  drawCamera(R) {
    const c = this.octx;
    c.save();
    c.beginPath(); c.rect(R.x, R.y, R.w, R.h); c.clip();
    c.fillStyle = 'rgba(8,4,22,.92)';
    c.fillRect(R.x, R.y, R.w, R.h);
    if (this.video.readyState >= 2 && this.camInPip) {
      const vW = this.video.videoWidth || 1280, vH = this.video.videoHeight || 720;
      const s = Math.max(R.w / vW, R.h / vH);
      const dw = vW * s, dh = vH * s;
      c.translate(R.x + R.w, R.y);
      c.scale(-1, 1);
      c.globalAlpha = 0.85;
      c.drawImage(this.video, (R.w - dw) / 2, (R.h - dh) / 2, dw, dh);
    }
    c.restore();
  }

  drawFrame(R, col, label) {
    const c = this.octx;
    c.globalAlpha = 0.75; c.shadowBlur = 0;
    c.strokeStyle = col; c.lineWidth = 1.5;
    c.strokeRect(R.x, R.y, R.w, R.h);
    c.lineWidth = 3; c.globalAlpha = 0.95;
    const t = 9;
    c.beginPath();
    c.moveTo(R.x, R.y + t); c.lineTo(R.x, R.y); c.lineTo(R.x + t, R.y);
    c.moveTo(R.x + R.w - t, R.y); c.lineTo(R.x + R.w, R.y); c.lineTo(R.x + R.w, R.y + t);
    c.moveTo(R.x + R.w, R.y + R.h - t); c.lineTo(R.x + R.w, R.y + R.h); c.lineTo(R.x + R.w - t, R.y + R.h);
    c.moveTo(R.x + t, R.y + R.h); c.lineTo(R.x, R.y + R.h); c.lineTo(R.x, R.y + R.h - t);
    c.stroke();
    c.globalAlpha = 0.88;
    c.fillStyle = 'rgba(8,4,22,.85)';
    c.fillRect(R.x, R.y + R.h - 16, R.w, 16);
    c.fillStyle = col;
    c.beginPath(); c.arc(R.x + 8, R.y + R.h - 8, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2ecff';
    c.font = '600 10px Inter, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(label, R.x + 15, R.y + R.h - 8);
    c.globalAlpha = 1;
  }

  draw() {
    const c = this.octx, vw = innerWidth, vh = innerHeight;
    c.clearRect(0, 0, vw, vh);
    const pip = !!this.pip;
    const R = pip ? this.pipRect() : { x: 0, y: 0, w: vw, h: vh };
    const col = this.slideHeld ? '#ffc233' : this.armsUp ? '#3df5a6' : this.tpose ? '#ff2d95' : '#22d3ee';
    if (pip) {
      this.drawCamera(R);
      const fresh = performance.now() - (this.gestureLabelT || 0) < 900;
      this.drawFrame(R, this.present ? col : '#9d92c4',
        this.present ? (fresh && this.gestureLabel ? this.gestureLabel : 'BODY TRACKING') : 'SEARCHING…');
    }
    if (!this.present || !this.lm) return;
    const lm = this.lm;
    let map;
    if (pip) {
      const vW = this.video.videoWidth || 1280, vH = this.video.videoHeight || 720;
      const s = Math.max(R.w / vW, R.h / vH);
      const ox = (R.w - vW * s) / 2, oy = (R.h - vH * s) / 2;
      map = (p) => ({ x: R.x + R.w - (p.x * vW * s + ox), y: R.y + p.y * vH * s + oy });
      c.save();
      c.beginPath(); c.rect(R.x, R.y, R.w, R.h - 16); c.clip();
    } else map = (p) => this.toScreen(p);
    const pts = lm.map(map);
    const vis = (i) => (lm[i].visibility ?? 1) > 0.4;
    const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
    const size = Math.max(pip ? 10 : 24, d(11, 12));
    const limbW = Math.max(pip ? 2.5 : 6, Math.min(pip ? 10 : 26, size * 0.34));
    const cx = (pts[11].x + pts[12].x + pts[23].x + pts[24].x) / 4;
    const cy = (pts[11].y + pts[12].y + pts[23].y + pts[24].y) / 4;
    const aura = c.createRadialGradient(cx, cy, 0, cx, cy, size * 2.4);
    aura.addColorStop(0, col + '30');
    aura.addColorStop(1, col + '00');
    c.fillStyle = aura;
    c.fillRect(cx - size * 2.4, cy - size * 2.4, size * 4.8, size * 4.8);
    if (vis(11) && vis(12) && vis(23) && vis(24)) {
      c.beginPath();
      c.moveTo(pts[11].x, pts[11].y); c.lineTo(pts[12].x, pts[12].y);
      c.lineTo(pts[24].x, pts[24].y); c.lineTo(pts[23].x, pts[23].y);
      c.closePath();
      c.globalAlpha = 0.26; c.fillStyle = col; c.fill();
      c.globalAlpha = 0.85; c.lineWidth = pip ? 1.2 : 2.5; c.strokeStyle = col; c.stroke();
    }
    const hx = (pts[11].x + pts[12].x) / 2, hy = (pts[11].y + pts[12].y) / 2 - size * 0.52;
    const hr = size * 0.26;
    c.globalAlpha = 0.35; c.fillStyle = col;
    c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.95; c.lineWidth = pip ? 1.2 : 2.5; c.strokeStyle = col;
    c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#ff2d95'; c.lineWidth = Math.max(pip ? 1.5 : 3, hr * 0.42); c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx - hr * 0.68, hy - hr * 0.1); c.lineTo(hx + hr * 0.68, hy - hr * 0.1); c.stroke();
    const LIMBS = [[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]];
    c.lineCap = 'round';
    for (const [a, b] of LIMBS) {
      if (!vis(a) || !vis(b)) continue;
      c.shadowColor = col; c.shadowBlur = pip ? 6 : 16;
      c.globalAlpha = 0.2; c.strokeStyle = col; c.lineWidth = limbW * 1.9;
      c.beginPath(); c.moveTo(pts[a].x, pts[a].y); c.lineTo(pts[b].x, pts[b].y); c.stroke();
      c.globalAlpha = 0.8; c.lineWidth = limbW;
      c.beginPath(); c.moveTo(pts[a].x, pts[a].y); c.lineTo(pts[b].x, pts[b].y); c.stroke();
      c.shadowBlur = 0;
      c.globalAlpha = 0.9; c.strokeStyle = '#f2ecff'; c.lineWidth = limbW * 0.3;
      c.beginPath(); c.moveTo(pts[a].x, pts[a].y); c.lineTo(pts[b].x, pts[b].y); c.stroke();
    }
    c.globalAlpha = 0.95; c.fillStyle = '#f2ecff';
    for (const i of [13, 14, 25, 26]) {
      if (!vis(i)) continue;
      c.beginPath(); c.arc(pts[i].x, pts[i].y, limbW * 0.32, 0, Math.PI * 2); c.fill();
    }
    for (const i of [15, 16]) {
      if (!vis(i)) continue;
      c.fillStyle = '#ff2d95';
      c.beginPath(); c.arc(pts[i].x, pts[i].y, limbW * 0.55, 0, Math.PI * 2); c.fill();
    }
    for (const i of [27, 28]) {
      if (!vis(i)) continue;
      c.fillStyle = '#ffc233';
      c.beginPath(); c.ellipse(pts[i].x, pts[i].y, limbW * 0.75, limbW * 0.45, 0, 0, Math.PI * 2); c.fill();
    }
    // hip lane marker
    const hip = pip ? map({ x: 1 - this.hipX, y: this.hipY }) : this.toScreen({ x: 1 - this.hipX, y: this.hipY });
    c.globalAlpha = 0.8;
    c.strokeStyle = '#ff2d95';
    c.lineWidth = pip ? 1 : 2;
    c.beginPath();
    c.arc(hip.x, hip.y, pip ? 6 : 16, 0, Math.PI * 2);
    c.stroke();
    if (pip) c.restore();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
  }

  clearOverlay() { this.octx.clearRect(0, 0, innerWidth, innerHeight); }

  dispose() {
    if (this.landmarker) { try { this.landmarker.close(); } catch {} this.landmarker = null; }
    this.ready = false;
    this.present = false;
    this.clearOverlay();
  }
}