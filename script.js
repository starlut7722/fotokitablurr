// ============================================
// GLOBAL VARIABLES
// ============================================
let hands, video, canvas, ctx, animationId, currentStream, currentDeviceId;
let availableCameras = [];
let isBlurred = false;
let twoFingerStartTime = null;
let fpsCounter = 0, fps = 0, fpsUpdateTime = 0;
let isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const THRESHOLD = 500;

// ============================================
// DOM ELEMENTS
// ============================================
const blurOverlay = document.getElementById('blurOverlay');
const notification = document.getElementById('notification');
const counterNumber = document.getElementById('counterNumber');
const counterCircle = document.querySelector('.counter-circle');
const fpsValue = document.getElementById('fpsValue');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loadingScreen = document.getElementById('loadingScreen');
const loadingText = document.getElementById('loadingText');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const cameraList = document.getElementById('cameraList');
const cameraNameDisplay = document.getElementById('cameraName');

// ============================================
// UPDATE LOADING TEXT
// ============================================
function updateLoading(msg) {
    console.log('[LOADING]', msg);
    if (loadingText) loadingText.textContent = msg;
}

// ============================================
// CAMERA FUNCTIONS
// ============================================
async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(d => d.kind === 'videoinput');
        console.log('📷 Kamera ditemukan:', availableCameras.length);
        renderCamList();
    } catch (e) {
        console.error('Error getCameras:', e);
    }
}

function renderCamList() {
    if (!cameraList) return;
    cameraList.innerHTML = '';
    
    availableCameras.forEach((cam, i) => {
        const d = document.createElement('div');
        d.className = 'camera-option' + (cam.deviceId === currentDeviceId ? ' active' : '');
        d.innerHTML = `<span class="cam-icon">📷</span><div class="cam-info"><div class="cam-name">${cam.label || 'Kamera ' + (i+1)}</div></div>`;
        d.onclick = () => switchCam(cam.deviceId);
        cameraList.appendChild(d);
    });
    
    const r = document.createElement('div');
    r.className = 'camera-option';
    r.style.borderTop = '1px solid rgba(0,212,255,0.2)';
    r.innerHTML = '<span class="cam-icon">🔄</span><div class="cam-info"><div class="cam-name">Refresh</div></div>';
    r.onclick = (e) => { e.stopPropagation(); getCameras(); };
    cameraList.appendChild(r);
}

switchCameraBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    cameraList.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (cameraList && !cameraList.contains(e.target) && e.target !== switchCameraBtn) {
        cameraList.classList.remove('show');
    }
});

async function switchCam(id) {
    try {
        if (currentStream) currentStream.getTracks().forEach(t => t.stop());
        
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: { exact: id },
                width: { ideal: isMobile ? 720 : 1280 },
                height: { ideal: isMobile ? 480 : 720 }
            }
        });
        
        video.srcObject = currentStream;
        currentDeviceId = id;
        updateCamInfo(id);
        renderCamList();
        cameraList.classList.remove('show');
        if (statusDot) statusDot.classList.remove('warning');
        console.log('✅ Kamera diganti');
    } catch (e) {
        console.error('Gagal ganti kamera:', e);
    }
}

function updateCamInfo(id) {
    const cam = availableCameras.find(c => c.deviceId === id);
    if (cam && cameraNameDisplay) {
        cameraNameDisplay.textContent = (cam.label || 'Kamera').slice(0, 25);
    }
}

// ============================================
// FINGER COUNTING (MediaPipe style)
// ============================================
function countFingers(landmarks) {
    if (!landmarks || landmarks.length < 21) return 0;
    
    let count = 0;
    
    // Thumb: bandingkan x dari tip (4) dan IP joint (3)
    if (landmarks[4].x < landmarks[3].x) count++;
    
    // Index: tip (8) harus di atas PIP joint (6)
    if (landmarks[8].y < landmarks[6].y) count++;
    
    // Middle: tip (12) harus di atas PIP joint (10)
    if (landmarks[12].y < landmarks[10].y) count++;
    
    // Ring: tip (16) harus di atas PIP joint (14)
    if (landmarks[16].y < landmarks[14].y) count++;
    
    // Pinky: tip (20) harus di atas PIP joint (18)
    if (landmarks[20].y < landmarks[18].y) count++;
    
    return count;
}

// ============================================
// DRAWING
// ============================================
function drawHand(landmarks) {
    if (!ctx || !landmarks) return;
    
    const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17]
    ];
    
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 10;
    
    connections.forEach(([a, b]) => {
        if (landmarks[a] && landmarks[b]) {
            ctx.beginPath();
            ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height);
            ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height);
            ctx.stroke();
        }
    });
    
    landmarks.forEach((p, i) => {
        const x = p.x * canvas.width;
        const y = p.y * canvas.height;
        
        // Finger tips warna kuning
        if ([4, 8, 12, 16, 20].includes(i)) {
            ctx.fillStyle = '#ffcc00';
            ctx.shadowColor = '#ffcc00';
        } else {
            ctx.fillStyle = '#00d4ff';
            ctx.shadowColor = '#00d4ff';
        }
        
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.shadowBlur = 0;
}

// ============================================
// MAIN DETECTION LOOP
// ============================================
async function detectHands() {
    if (!hands || !video || video.readyState < 2) {
        animationId = requestAnimationFrame(detectHands);
        return;
    }
    
    // FPS
    const now = performance.now();
    fpsCounter++;
    if (now - fpsUpdateTime >= 1000) {
        fps = Math.round((fpsCounter * 1000) / (now - fpsUpdateTime));
        if (fpsValue) fpsValue.textContent = fps;
        fpsCounter = 0;
        fpsUpdateTime = now;
    }
    
    try {
        const results = await hands.send({ image: video });
        
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let totalFingers = 0;
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            results.multiHandLandmarks.forEach(landmarks => {
                drawHand(landmarks);
                totalFingers += countFingers(landmarks);
            });
        }
        
        updateUI(totalFingers);
        
    } catch (e) {
        console.error('Detection error:', e);
    }
    
    animationId = requestAnimationFrame(detectHands);
}

// ============================================
// UI UPDATE
// ============================================
function updateUI(count) {
    if (counterNumber) counterNumber.textContent = count;
    
    if (counterCircle) {
        if (count === 2) {
            counterCircle.classList.add('active');
        } else {
            counterCircle.classList.remove('active');
        }
    }
    
    if (count === 2) {
        if (!twoFingerStartTime) twoFingerStartTime = performance.now();
        if (performance.now() - twoFingerStartTime >= THRESHOLD && !isBlurred) {
            applyBlur();
        }
    } else {
        twoFingerStartTime = null;
        if (isBlurred) removeBlur();
    }
}

function applyBlur() {
    isBlurred = true;
    if (blurOverlay) blurOverlay.classList.add('active');
    if (notification) setTimeout(() => notification.classList.add('show'), 100);
    if (statusText) statusText.textContent = '2 Jari! ✌️';
    if (statusDot) statusDot.classList.add('warning');
}

function removeBlur() {
    isBlurred = false;
    if (blurOverlay) blurOverlay.classList.remove('active');
    if (notification) notification.classList.remove('show');
    if (statusText) statusText.textContent = 'Mendeteksi...';
    if (statusDot) statusDot.classList.remove('warning');
}

// ============================================
// INIT - Pakai MediaPipe Hands langsung
// ============================================
async function init() {
    try {
        updateLoading('Mengakses kamera...');
        
        video = document.getElementById('webcam');
        canvas = document.getElementById('outputCanvas');
        ctx = canvas.getContext('2d');
        
        await getCameras();
        
        // Request camera
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: isMobile ? 720 : 1280 },
                height: { ideal: isMobile ? 480 : 720 },
                facingMode: isMobile ? 'environment' : 'user'
            }
        });
        
        video.srcObject = currentStream;
        
        const track = currentStream.getVideoTracks()[0];
        if (track) currentDeviceId = track.getSettings().deviceId;
        
        if (availableCameras.length === 0) await getCameras();
        updateCamInfo(currentDeviceId);
        renderCamList();
        
        // Wait for video
        updateLoading('Menunggu video...');
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                video.play().then(resolve).catch(reject);
            };
            setTimeout(() => reject(new Error('Timeout video')), 8000);
        });
        
        // Canvas size
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Load MediaPipe Hands
        updateLoading('Memuat AI Model...');
        
        hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
            }
        });
        
        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: isMobile ? 0 : 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5
        });
        
        hands.onResults((results) => {
            // This is handled in detectHands loop
        });
        
        updateLoading('Selesai!');
        console.log('✅ Model siap!');
        
        // Hide loading
        setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
                setTimeout(() => {
                    if (loadingScreen) loadingScreen.style.display = 'none';
                }, 500);
            }
        }, 300);
        
        if (statusText) statusText.textContent = 'Mendeteksi...';
        if (statusDot) statusDot.classList.remove('warning');
        
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            await getCameras();
            updateCamInfo(currentDeviceId);
        });
        
        // START!
        detectHands();
        
    } catch (err) {
        console.error('Init error:', err);
        updateLoading('Error: ' + err.message);
        
        if (loadingScreen) {
            const content = loadingScreen.querySelector('.loading-content');
            if (content) {
                content.innerHTML = `
                    <p style="color:#ff4444;">Error: ${err.message}</p>
                    <button onclick="location.reload()" style="margin-top:15px;padding:10px 20px;background:#00d4ff;border:none;border-radius:20px;color:#000;font-weight:bold;cursor:pointer;">Coba Lagi</button>
                `;
            }
        }
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    } else {
        if (!animationId) {
            fpsCounter = 0;
            fpsUpdateTime = performance.now();
            detectHands();
        }
    }
});

window.addEventListener('beforeunload', () => {
    if (animationId) cancelAnimationFrame(animationId);
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    if (hands) hands.close();
});

// ============================================
// START!
// ============================================
window.addEventListener('load', () => {
    console.log('🚀 Starting...');
    init();
});
