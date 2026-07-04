// ============================================
// GLOBAL VARIABLES
// ============================================
let model, video, canvas, ctx, animationId, currentStream, currentDeviceId;
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
const permissionOverlay = document.getElementById('permissionOverlay');
const permBtn = document.getElementById('permBtn');

// ============================================
// UPDATE LOADING TEXT
// ============================================
function updateLoading(msg) {
    console.log(msg);
    if (loadingText) loadingText.textContent = msg;
}

// ============================================
// PERMISSION BUTTON
// ============================================
if (permBtn) {
    permBtn.onclick = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true });
            s.getTracks().forEach(t => t.stop());
            permissionOverlay.classList.add('hidden');
            init();
        } catch (e) {
            alert('Gagal akses kamera: ' + e.message);
        }
    };
}

// ============================================
// CAMERA FUNCTIONS
// ============================================
async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(d => d.kind === 'videoinput');
        renderCamList();
    } catch (e) {
        console.error(e);
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
    
    // Refresh button
    const r = document.createElement('div');
    r.className = 'camera-option';
    r.style.borderTop = '1px solid rgba(0,212,255,0.2)';
    r.innerHTML = '<span class="cam-icon">🔄</span><div class="cam-info"><div class="cam-name">Refresh</div></div>';
    r.onclick = (e) => { e.stopPropagation(); getCameras(); };
    cameraList.appendChild(r);
}

// Toggle camera list
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
    } catch (e) {
        alert('Gagal ganti kamera');
    }
}

function updateCamInfo(id) {
    const cam = availableCameras.find(c => c.deviceId === id);
    if (cam && cameraNameDisplay) {
        cameraNameDisplay.textContent = (cam.label || 'Kamera').slice(0, 25);
    }
}

// ============================================
// FINGER COUNTING
// ============================================
function countFingers(kp) {
    if (!kp || kp.length < 21) return 0;
    
    let c = 0;
    const isRight = kp[4].x < kp[3].x;
    
    // Thumb
    if (isRight) {
        if (kp[4].x < kp[3].x - 10) c++;
    } else {
        if (kp[4].x > kp[3].x + 10) c++;
    }
    
    // Other fingers
    if (kp[8].y < kp[6].y - 5) c++;
    if (kp[12].y < kp[10].y - 5) c++;
    if (kp[16].y < kp[14].y - 5) c++;
    if (kp[20].y < kp[18].y - 5) c++;
    
    return c;
}

// ============================================
// DRAWING
// ============================================
function drawHand(hand) {
    if (!ctx) return;
    const kp = hand.keypoints;
    if (!kp || kp.length === 0) return;
    
    const conn = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17]
    ];
    
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = isMobile ? 2 : 3;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = isMobile ? 8 : 15;
    
    conn.forEach(([a, b]) => {
        if (kp[a] && kp[b]) {
            ctx.beginPath();
            ctx.moveTo(kp[a].x, kp[a].y);
            ctx.lineTo(kp[b].x, kp[b].y);
            ctx.stroke();
        }
    });
    
    kp.forEach((p, i) => {
        if (!p) return;
        
        ctx.fillStyle = [4,8,12,16,20].includes(i) ? '#ffcc00' : '#00d4ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = isMobile ? 8 : 15;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, isMobile ? 4 : 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isMobile ? 2 : 3, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.shadowBlur = 0;
}

// ============================================
// MAIN DETECTION LOOP
// ============================================
async function detectHands() {
    if (!model || !video || video.readyState < 2) {
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
        const hands = await model.estimateHands(video);
        
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let totalFingers = 0;
        
        if (hands.length > 0) {
            hands.forEach(hand => {
                drawHand(hand);
                totalFingers += countFingers(hand.keypoints);
            });
        }
        
        updateUI(totalFingers);
        
    } catch (e) {
        // Silent error
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
// INIT
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
            setTimeout(() => reject(new Error('Timeout')), 8000);
        });
        
        // Canvas size
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Load AI Model
        updateLoading('Memuat AI Model...');
        
        model = await handPoseDetection.createDetector(
            handPoseDetection.SupportedModels.MediaPipeHands,
            {
                runtime: 'tfjs',
                modelType: 'lite',
                maxHands: 2,
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240'
            }
        );
        
        updateLoading('Selesai!');
        
        // Hide loading
        setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
                setTimeout(() => {
                    if (loadingScreen) loadingScreen.style.display = 'none';
                }, 500);
            }
        }, 500);
        
        if (statusText) statusText.textContent = 'Mendeteksi...';
        if (statusDot) statusDot.classList.remove('warning');
        
        // Listen for device changes
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            await getCameras();
            updateCamInfo(currentDeviceId);
        });
        
        // START!
        detectHands();
        
    } catch (err) {
        console.error('Init error:', err);
        updateLoading('Error: ' + err.message);
        
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            if (permissionOverlay) permissionOverlay.classList.remove('hidden');
        } else {
            alert('Error: ' + err.message + '\n\nRefresh halaman untuk mencoba lagi.');
        }
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
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
});

// ============================================
// START
// ============================================
window.addEventListener('load', () => {
    // Check camera permission first
    if (navigator.permissions) {
        navigator.permissions.query({ name: 'camera' }).then(result => {
            if (result.state === 'denied') {
                if (permissionOverlay) permissionOverlay.classList.remove('hidden');
            } else {
                init();
            }
        }).catch(() => {
            init();
        });
    } else {
        init();
    }
});
