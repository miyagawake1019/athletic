import * as THREE from 'three';

// --- シーン、カメラ、レンダラー ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, 150);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- ライト ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

// --- ゲーム状態 ---
const gameState = {
    lap: 1,
    maxLaps: 3,
    checkpointIndex: 0,
    startTime: Date.now(),
    isFinished: false
};

const ui = {
    lap: document.getElementById('lap-counter'),
    time: document.getElementById('time-counter'),
    message: document.getElementById('message')
};

// --- カート作成 ---
function createKart() {
    const kartGroup = new THREE.Group();

    // ボディ
    const bodyGeo = new THREE.BoxGeometry(1, 0.5, 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    kartGroup.add(body);

    // ウィング（飾り）
    const wingGeo = new THREE.BoxGeometry(1.2, 0.1, 0.5);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, 0.8, -0.8);
    wing.castShadow = true;
    kartGroup.add(wing);

    // タイヤ
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const positions = [
        { x: 0.6, y: 0.3, z: 0.8 },
        { x: -0.6, y: 0.3, z: 0.8 },
        { x: 0.6, y: 0.3, z: -0.8 },
        { x: -0.6, y: 0.3, z: -0.8 },
    ];

    positions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        kartGroup.add(wheel);
    });

    return kartGroup;
}

const kart = createKart();
scene.add(kart);

// カートの物理パラメータ
const physics = {
    speed: 0,
    maxSpeed: 0.8,
    acceleration: 0.01,
    deceleration: 0.02,
    friction: 0.005,
    turnSpeed: 0.04,
    angle: 0
};

// --- コース作成 ---
const walls = [];
const checkpoints = [];

function createWall(x, y, z, w, h, d, color = 0x888888) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color: color });
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    walls.push(wall); // 衝突判定用
}

function createCheckpoint(x, z, w, d, index) {
    // 可視化用（半透明）
    const geo = new THREE.BoxGeometry(w, 5, d);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.2, transparent: true });
    const cp = new THREE.Mesh(geo, mat);
    cp.position.set(x, 2.5, z);
    cp.userData = { isCheckpoint: true, index: index };
    // scene.add(cp); // デバッグ用に見たい場合はコメントアウトを外す

    // 衝突判定用にオブジェクトとして保持（シーンに追加しなくてもRaycaster用配列に入れれば判定可能だが、今回はBox3判定など簡易的なものにするか、Raycasterを使うか）
    // ここでは単純なBox3判定を行うために保持する
    const box = new THREE.Box3().setFromObject(cp);
    checkpoints.push({ box: box, index: index, mesh: cp });
}

function initTrack() {
    // 地面
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x228B22 }); // ForestGreen
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 路面（グレーのリングっぽいものを作る代わりに、地面の上に平たいキューブを敷く）
    // シンプルなオーバルコースを作る
    // コース幅: 20
    // 直線部分: 長さ 60
    // カーブ部分: 半径 30

    // 外壁
    // 直線（左）
    createWall(-40, 1, 0, 2, 2, 100);
    // 直線（右）
    createWall(40, 1, 0, 2, 2, 100);
    // カーブ（手前）- 簡易的に壁を並べる
    createWall(0, 1, 50, 82, 2, 2);
    // カーブ（奥）
    createWall(0, 1, -50, 82, 2, 2);

    // 内壁
    // 直線（左）
    createWall(-20, 1, 0, 2, 2, 60, 0x555555);
    // 直線（右）
    createWall(20, 1, 0, 2, 2, 60, 0x555555);
    // カーブ（手前）
    createWall(0, 1, 30, 42, 2, 2, 0x555555);
    // カーブ（奥）
    createWall(0, 1, -30, 42, 2, 2, 0x555555);

    // チェックポイント設置 (順番に通る必要がある)
    // 0: スタート地点 (右側の直線の真ん中あたり)
    // カートは (30, 0, 0) あたりからスタートし、Zマイナス方向へ進む想定
    createCheckpoint(30, 0, 18, 5, 0); // スタート/ゴールライン
    createCheckpoint(30, -40, 18, 5, 1); // 第1コーナー手前
    createCheckpoint(0, -40, 5, 18, 2); // 奥のカーブ
    createCheckpoint(-30, -40, 18, 5, 3); // バックストレート入り口
    createCheckpoint(-30, 40, 18, 5, 4); // バックストレート出口
    createCheckpoint(0, 40, 5, 18, 5); // 手前のカーブ

    // スタートラインの描画
    const lineGeo = new THREE.PlaneGeometry(18, 2);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(30, 0.05, 0);
    scene.add(line);
}

initTrack();

// カートの初期位置
function resetKart() {
    kart.position.set(30, 0, 0);
    physics.angle = Math.PI; // Zマイナス方向を向く
    physics.speed = 0;

    // 回転を適用
    kart.rotation.set(0, physics.angle, 0);
}

resetKart();

// --- 操作 ---
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

// --- 更新処理 ---
const clock = new THREE.Clock();

function updatePhysics() {
    if (gameState.isFinished) return;

    // アクセル・ブレーキ
    if (keys.ArrowUp) {
        physics.speed += physics.acceleration;
    } else if (keys.ArrowDown) {
        physics.speed -= physics.deceleration; // ブレーキまたはバック
    } else {
        // 自然減速
        if (physics.speed > 0) {
            physics.speed -= physics.friction;
            if (physics.speed < 0) physics.speed = 0;
        } else if (physics.speed < 0) {
            physics.speed += physics.friction;
            if (physics.speed > 0) physics.speed = 0;
        }
    }

    // 最高速度制限
    if (physics.speed > physics.maxSpeed) physics.speed = physics.maxSpeed;
    if (physics.speed < -physics.maxSpeed / 2) physics.speed = -physics.maxSpeed / 2; // バックは遅く

    // ハンドリング (速度が出ているときのみ曲がれる)
    if (Math.abs(physics.speed) > 0.01) {
        const turn = keys.ArrowLeft ? 1 : (keys.ArrowRight ? -1 : 0);
        // バックのときはハンドル操作が逆になるのがリアルだが、操作性重視でそのままにするか、逆にするか。
        // マリオカート等はバック時も見たままの方向に曲がる（車としては逆ハンドル）
        // ここでは単純に前進後退に関わらず回転させる
        physics.angle += turn * physics.turnSpeed * (physics.speed > 0 ? 1 : -1);
    }

    // 移動計算
    const velocityX = Math.sin(physics.angle) * physics.speed;
    const velocityZ = Math.cos(physics.angle) * physics.speed;

    // 壁衝突判定 (簡易的: 次の位置が壁の中なら進まない)
    const nextX = kart.position.x + velocityX;
    const nextZ = kart.position.z + velocityZ;
    const kartBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(nextX, 0.5, nextZ),
        new THREE.Vector3(1, 1, 2)
    );

    let collision = false;
    for (const wall of walls) {
        const wallBox = new THREE.Box3().setFromObject(wall);
        if (wallBox.intersectsBox(kartBox)) {
            collision = true;
            break;
        }
    }

    if (collision) {
        // 衝突したら速度をゼロにする（あるいは跳ね返る）
        physics.speed *= -0.5; // 跳ね返り
    } else {
        kart.position.x = nextX;
        kart.position.z = nextZ;
    }

    // 回転適用
    kart.rotation.y = physics.angle;

    // チェックポイント判定
    const currentKartBox = new THREE.Box3().setFromObject(kart);
    for (const cp of checkpoints) {
        if (cp.box.intersectsBox(currentKartBox)) {
            // 正しい順序で通っているか
            const nextIndex = (gameState.checkpointIndex + 1) % checkpoints.length;

            if (cp.index === nextIndex) {
                gameState.checkpointIndex = nextIndex;
                console.log("Checkpoint:", nextIndex);

                // スタートライン(index 0)を通過したら周回カウント
                if (nextIndex === 0) {
                    gameState.lap++;
                    if (gameState.lap > gameState.maxLaps) {
                        finishGame();
                    } else {
                        updateUI();
                    }
                }
            }
        }
    }
}

function updateCamera() {
    // カートの後ろにカメラを追従させる
    // カートの向きに合わせてカメラ位置を計算
    const relativeCameraOffset = new THREE.Vector3(0, 5, -10); // カートの後ろ(Zマイナス)ではなく、Zプラスが後ろ（モデルによる）
    // モデルはZ軸方向が長さ。初期向きはZマイナス。
    // Math.sin(angle)で計算してるので、angle=0はZ+方向、angle=PIはZ-方向。
    // angle=PIのとき、カートはZ-に進む。カメラはZ+側にいてほしい。

    // シンプルに計算:
    // カメラの理想位置 = カート位置 - (進行方向ベクトル * 距離) + (上方向 * 高さ)
    const dist = 10;
    const height = 5;

    const camX = kart.position.x - Math.sin(physics.angle) * dist;
    const camZ = kart.position.z - Math.cos(physics.angle) * dist;

    // 少し遅延させると滑らかになるが、酔い防止のため直接セットしてLookAt
    camera.position.set(camX, height, camZ);
    camera.lookAt(kart.position);
}

function updateUI() {
    ui.lap.innerText = `${gameState.lap} / ${gameState.maxLaps}`;
}

function finishGame() {
    gameState.isFinished = true;
    ui.message.style.display = 'block';
}

function updateTime() {
    if (!gameState.isFinished) {
        const now = Date.now();
        const diff = (now - gameState.startTime) / 1000;
        ui.time.innerText = diff.toFixed(2);
    }
}

// --- アニメーション ---
function animate() {
    requestAnimationFrame(animate);

    updatePhysics();
    updateCamera();
    updateTime();

    renderer.render(scene, camera);
}

animate();

// ウィンドウリサイズ
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
