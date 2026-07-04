// ============================================
// GLOBAL VARIABLES
// ============================================
let detector = null;
let video = null;
let canvas = null;
let ctx = null;
let animationId = null;
let currentStream = null;
let currentDeviceId = null;
let availableCameras = [];
let isBlurred = false;
let twoFingerStartTime = null;
let fpsCounter = 0;
let fps = 0;
let fpsUpdateTime = 0;
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
// HELPER
// ============================================
function log(msg) {
    console.log('[LOG]', msg);
    if (loadingText) loadingText.textContent = msg;
}

// ============================================
// CAMERA
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
        d.innerHTML = '<span class="cam-icon">📷</span><div class="cam-info"><div class="cam-name">' + (cam.label || 'Kamera ' + (i+1)) + '</div></div>';
        d.onclick = function() { switchCam(cam.deviceId); };
        cameraList.appendChild(d);
    });
}

switchCameraBtn.onclick = function(e) {
    e.stopPropagation();
    cameraList.classList.toggle('show');
};

document.addEventListener('click', function(e) {
    if (cameraList && !cameraList.contains(e.target) && e.target !== switchCameraBtn) {
        cameraList.classList.remove('show');
    }
});

async function switchCam(id) {
    try {
        if (currentStream) currentStream.getTracks().forEach(function(t) { t.stop(); });
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: id }, width: { ideal: isMobile ? 720 : 1280 }, height: { ideal: isMobile ? 480 : 720 } }
        });
        video.srcObject = currentStream;
        currentDeviceId = id;
        updateCamInfo(id);
        renderCamList();
        cameraList.classList.remove('show');
        statusDot.classList.remove('warning');
    } catch (e) {
        console.error(e);
    }
}

function updateCamInfo(id) {
    var cam = availableCameras.find(function(c) { return c.deviceId === id; });
    if (cam && cameraNameDisplay) {
        cameraNameDisplay.textContent = (cam.label || 'Kamera').slice(0, 25);
    }
}

// ============================================
// FINGER COUNTING
// ============================================
function countFingers(keypoints) {
    if (!keypoints || keypoints.length < 21) return 0;
    var count = 0;
    if (keypoints[4].x < keypoints[3].x) count++;
    if (keypoints[8].y < keypoints[6].y) count++;
    if (keypoints[12].y < keypoints[10].y) count++;
    if (keypoints[16].y < keypoints[14].y) count++;
    if (keypoints[20].y < keypoints[18].y) count++;
    return count;
}

// ============================================
// DRAWING
// ============================================
function drawHand(keypoints) {
    if (!ctx || !keypoints) return;
    var conn = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 10;
    conn.forEach(function(pair) {
        var a = pair[0], b = pair[1];
        if (keypoints[a] && keypoints[b]) {
            ctx.beginPath();
            ctx.moveTo(keypoints[a].x, keypoints[a].y);
            ctx.lineTo(keypoints[b].x, keypoints[b].y);
            ctx.stroke();
        }
    });
    keypoints.forEach(function(p, i) {
        if (!p) return;
        ctx.fillStyle = [4,8,12,16,20].indexOf(i) >= 0 ? '#ffcc00' : '#00d4ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;
}

// ============================================
// MAIN LOOP
// ============================================
async function detectHands() {
    if (!detector || !video || video.readyState < 2) {
        animationId = requestAnimationFrame(detectHands);
        return;
    }
    var now = performance.now();
    fpsCounter++;
    if (now - fpsUpdateTime >= 1000) {
        fps = Math.round((fpsCounter * 1000) / (now - fpsUpdateTime));
        fpsValue.textContent = fps;
        fpsCounter = 0;
        fpsUpdateTime = now;
    }
    try {
        var hands = await detector.estimateHands(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var totalFingers = 0;
        if (hands.length > 0) {
            hands.forEach(function(hand) {
                drawHand(hand.keypoints);
                totalFingers += countFingers(hand.keypoints);
            });
        }
        updateUI(totalFingers);
    } catch (e) {
        console.error(e);
    }
    animationId = requestAnimationFrame(detectHands);
}

// ============================================
// UI
// ============================================
function updateUI(count) {
    counterNumber.textContent = count;
    if (count === 2) {
        counterCircle.classList.add('active');
        if (!twoFingerStartTime) twoFingerStartTime = performance.now();
        if (performance.now() - twoFingerStartTime >= THRESHOLD && !isBlurred) {
            applyBlur();
        }
    } else {
        counterCircle.classList.remove('active');
        twoFingerStartTime = null;
        if (isBlurred) removeBlur();
    }
}

function applyBlur() {
    isBlurred = true;
    blurOverlay.classList.add('active');
    setTimeout(function() { notification.classList.add('show'); }, 100);
    statusText.textContent = '2 Jari! ✌️';
    statusDot.classList.add('warning');
}

function removeBlur() {
    isBlurred = false;
    blurOverlay.classList.remove('active');
    notification.classList.remove('show');
    statusText.textContent = 'Mendeteksi...';
    statusDot.classList.remove('warning');
}

// ============================================
// INIT
// ============================================
async function init() {
    try {
        log('Mengakses kamera...');
        video = document.getElementById('webcam');
        canvas = document.getElementById('outputCanvas');
        ctx = canvas.getContext('2d');
        
        await getCameras();
        
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: isMobile ? 720 : 1280 }, height: { ideal: isMobile ? 480 : 720 }, facingMode: isMobile ? 'environment' : 'user' }
        });
        
        video.srcObject = currentStream;
        var track = currentStream.getVideoTracks()[0];
        if (track) currentDeviceId = track.getSettings().deviceId;
        if (availableCameras.length === 0) await getCameras();
        updateCamInfo(currentDeviceId);
        renderCamList();
        
        log('Menunggu video...');
        await new Promise(function(resolve, reject) {
            video.onloadedmetadata = function() {
                video.play().then(resolve).catch(reject);
            };
            setTimeout(function() { reject(new Error('Timeout')); }, 8000);
        });
        
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        window.addEventListener('resize', function() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
        
        log('Memuat AI Model...');
        detector = await handPoseDetection.createDetector(
            handPoseDetection.SupportedModels.MediaPipeHands,
            {
                runtime: 'tfjs',
                modelType: 'full',
                maxHands: 2,
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240'
            }
        );
        
        log('Selesai!');
        setTimeout(function() {
            loadingScreen.classList.add('hidden');
            setTimeout(function() { loadingScreen.style.display = 'none'; }, 500);
        }, 300);
        
        statusText.textContent = 'Mendeteksi...';
        statusDot.classList.remove('warning');
        
        detectHands();
        
    } catch (err) {
        console.error('Error:', err);
        log('Error: ' + err.message);
        if (loadingScreen) {
            loadingScreen.innerHTML = '<div class="loading-content"><p style="color:#ff4444;">Error: ' + err.message + '</p><button onclick="location.reload()" style="margin-top:15px;padding:10px 20px;background:#00d4ff;border:none;border-radius:20px;color:#000;font-weight:bold;cursor:pointer;">Coba Lagi</button></div>';
        }
    }
}

// ============================================
// EVENTS
// ============================================
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    } else {
        if (!animationId) { fpsCounter = 0; fpsUpdateTime = performance.now(); detectHands(); }
    }
});

window.addEventListener('beforeunload', function() {
    if (animationId) cancelAnimationFrame(animationId);
    if (currentStream) currentStream.getTracks().forEach(function(t) { t.stop(); });
});

// ============================================
// START
// ============================================
window.addEventListener('load', function() {
    console.log('🚀 Starting...');
    init();
});
