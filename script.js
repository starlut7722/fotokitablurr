let model, video, canvas, ctx, animationId, currentStream, currentDeviceId, availableCameras = [], isBlurred = false, twoFingerStartTime = null, fpsCounter = 0, fps = 0, fpsUpdateTime = 0, isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const TWO_FINGER_THRESHOLD = 500;
const blurOverlay = document.getElementById('blurOverlay');
const notification = document.getElementById('notification');
const counterNumber = document.getElementById('counterNumber');
const counterCircle = document.querySelector('.counter-circle');
const fpsValue = document.getElementById('fpsValue');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loadingScreen = document.getElementById('loadingScreen');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const cameraList = document.getElementById('cameraList');
const cameraNameDisplay = document.getElementById('cameraName');
const debugContent = document.getElementById('debugContent');
const permissionOverlay = document.getElementById('permissionOverlay');
const permBtn = document.getElementById('permBtn');

function debug(msg) { console.log(msg); if (debugContent && !isMobile) { const lines = debugContent.innerHTML.split('<br>').filter(l => l); lines.push(msg); if (lines.length > 8) lines.shift(); debugContent.innerHTML = lines.join('<br>'); } }

if (permBtn) permBtn.addEventListener('click', async () => { try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); permissionOverlay.classList.add('hidden'); init(); } catch (err) { alert('Gagal: ' + err.message); } });

async function getAvailableCameras() { try { const devices = await navigator.mediaDevices.enumerateDevices(); availableCameras = devices.filter(d => d.kind === 'videoinput'); renderCameraList(); } catch (e) {} }

function renderCameraList() {
    if (!cameraList) return;
    cameraList.innerHTML = '';
    availableCameras.forEach((cam, i) => {
        const d = document.createElement('div');
        d.className = 'camera-option';
        if (cam.deviceId === currentDeviceId) d.classList.add('active');
        const label = cam.label || `Kamera ${i+1}`;
        d.innerHTML = `<span class="cam-icon">📷</span><div class="cam-info"><div class="cam-name">${label}</div></div>`;
        d.onclick = () => switchCamera(cam.deviceId);
        cameraList.appendChild(d);
    });
    const r = document.createElement('div');
    r.className = 'camera-option';
    r.style.borderTop = '1px solid rgba(0,212,255,0.2)';
    r.innerHTML = '<span class="cam-icon">🔄</span><div class="cam-info"><div class="cam-name">Refresh</div></div>';
    r.onclick = (e) => { e.stopPropagation(); getAvailableCameras(); };
    cameraList.appendChild(r);
}

switchCameraBtn?.addEventListener('click', (e) => { e.stopPropagation(); cameraList.classList.toggle('show'); });
document.addEventListener('click', (e) => { if (cameraList && !cameraList.contains(e.target) && e.target !== switchCameraBtn) cameraList.classList.remove('show'); });

async function switchCamera(deviceId) {
    try {
        if (currentStream) currentStream.getTracks().forEach(t => t.stop());
        currentStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: isMobile ? 720 : 1280 }, height: { ideal: isMobile ? 480 : 720 } } });
        video.srcObject = currentStream;
        currentDeviceId = deviceId;
        updateCameraInfo(deviceId);
        renderCameraList();
        cameraList.classList.remove('show');
        statusDot?.classList.remove('warning');
    } catch (err) { alert('Gagal ganti kamera'); }
}

function updateCameraInfo(deviceId) {
    const cam = availableCameras.find(c => c.deviceId === deviceId);
    if (cam && cameraNameDisplay) { const name = cam.label || 'Kamera'; cameraNameDisplay.textContent = name.length > 20 ? name.slice(0,20)+'...' : name; }
}

function countFingersUp(kp) {
    if (!kp || kp.length < 21) return 0;
    let c = 0;
    const isRight = kp[4].x < kp[3].x;
    if (isRight) { if (kp[4].x < kp[3].x - 10) c++; } else { if (kp[4].x > kp[3].x + 10) c++; }
    if (kp[8].y < kp[6].y - 5) c++;
    if (kp[12].y < kp[10].y - 5) c++;
    if (kp[16].y < kp[14].y - 5) c++;
    if (kp[20].y < kp[18].y - 5) c++;
    return c;
}

function drawHand(hand) {
    if (!ctx) return;
    const kp = hand.keypoints;
    if (!kp || kp.length === 0) return;
    const conn = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = isMobile ? 2 : 3;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = isMobile ? 8 : 15;
    conn.forEach(([a,b]) => { if(kp[a]&&kp[b]){ ctx.beginPath(); ctx.moveTo(kp[a].x,kp[a].y); ctx.lineTo(kp[b].x,kp[b].y); ctx.stroke(); } });
    kp.forEach((p,i) => {
        if(!p) return;
        ctx.fillStyle = [4,8,12,16,20].includes(i) ? '#ffcc00' : '#00d4ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = isMobile ? 8 : 15;
        ctx.beginPath(); ctx.arc(p.x,p.y,isMobile?4:6,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(p.x,p.y,isMobile?2:3,0,Math.PI*2); ctx.fill();
    });
    ctx.shadowBlur = 0;
}

async function detectHands() {
    if (!model || !video || video.readyState < 2) { animationId = requestAnimationFrame(detectHands); return; }
    const now = performance.now();
    fpsCounter++;
    if (now - fpsUpdateTime >= 1000) { fps = Math.round((fpsCounter * 1000) / (now - fpsUpdateTime)); if(fpsValue)fpsValue.textContent = fps; fpsCounter = 0; fpsUpdateTime = now; }
    try {
        const hands = await model.estimateHands(video);
        if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        let totalFingers = 0;
        if (hands.length > 0) { hands.forEach(h => { drawHand(h); totalFingers += countFingersUp(h.keypoints); }); }
        updateFingerUI(totalFingers);
    } catch(e) {}
    animationId = requestAnimationFrame(detectHands);
}

function updateFingerUI(count) {
    if(counterNumber) counterNumber.textContent = count;
    if(counterCircle) { if(count===2) counterCircle.classList.add('active'); else counterCircle.classList.remove('active'); }
    if(count===2) { if(!twoFingerStartTime) twoFingerStartTime = performance.now(); if(performance.now()-twoFingerStartTime>=TWO_FINGER_THRESHOLD && !isBlurred) applyBlur(); }
    else { twoFingerStartTime=null; if(isBlurred) removeBlur(); }
}

function applyBlur() { isBlurred=true; if(blurOverlay)blurOverlay.classList.add('active'); if(notification)setTimeout(()=>notification.classList.add('show'),100); if(statusText)statusText.textContent='2 Jari! ✌️'; if(statusDot)statusDot.classList.add('warning'); }
function removeBlur() { isBlurred=false; if(blurOverlay)blurOverlay.classList.remove('active'); if(notification)notification.classList.remove('show'); if(statusText)statusText.textContent='Mendeteksi...'; if(statusDot)statusDot.classList.remove('warning'); }

async function init() {
    try {
        video = document.getElementById('webcam');
        canvas = document.getElementById('outputCanvas');
        ctx = canvas.getContext('2d');
        await getAvailableCameras();
        currentStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: isMobile ? 720 : 1280 }, height: { ideal: isMobile ? 480 : 720 }, facingMode: isMobile ? 'environment' : 'user' } });
        video.srcObject = currentStream;
        const track = currentStream.getVideoTracks()[0];
        if(track) currentDeviceId = track.getSettings().deviceId;
        if(availableCameras.length===0) await getAvailableCameras();
        updateCameraInfo(currentDeviceId);
        renderCameraList();
        await new Promise((res,rej)=>{ video.onloadedmetadata = () => { video.play().then(res).catch(rej); }; setTimeout(()=>rej(new Error('Timeout')),8000); });
        function rc(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        rc();
        window.addEventListener('resize', rc);
        model = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, { runtime: 'tfjs', modelType: isMobile?'lite':'full', maxHands: 2, solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240' });
        if(loadingScreen){ loadingScreen.classList.add('hidden'); setTimeout(()=>{ if(loadingScreen)loadingScreen.style.display='none'; },500); }
        if(statusText)statusText.textContent='Mendeteksi...';
        if(statusDot)statusDot.classList.remove('warning');
        navigator.mediaDevices.addEventListener('devicechange', async ()=>{ await getAvailableCameras(); updateCameraInfo(currentDeviceId); });
        detectHands();
    } catch(err) {
        console.error(err);
        if(err.name==='NotAllowedError') { if(permissionOverlay)permissionOverlay.classList.remove('hidden'); }
    }
}

document.addEventListener('visibilitychange', () => { if(document.hidden){ if(animationId){cancelAnimationFrame(animationId);animationId=null;} } else { if(!animationId){fpsCounter=0;fpsUpdateTime=performance.now();detectHands();} } });
window.addEventListener('beforeunload', () => { if(animationId)cancelAnimationFrame(animationId); if(currentStream)currentStream.getTracks().forEach(t=>t.stop()); });
window.addEventListener('load', () => { if(navigator.permissions){ navigator.permissions.query({name:'camera'}).then(r=>{ if(r.state==='denied'){ if(permissionOverlay)permissionOverlay.classList.remove('hidden'); } else { init(); } }).catch(()=>init()); } else { init(); } });