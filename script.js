import * as THREE from 'three';

// --- シーン、カメラ、レンダラーのセットアップ ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // 空の色
scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- 照明 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- ステージ生成 ---
const platforms = []; // 衝突判定用に板を格納する配列

function createPlatform(x, y, z, width, depth, color = 0x88cc88) {
    const geometry = new THREE.BoxGeometry(width, 1, depth);
    const material = new THREE.MeshStandardMaterial({ color: color });
    const platform = new THREE.Mesh(geometry, material);
    platform.position.set(x, y, z);
    platform.receiveShadow = true;
    scene.add(platform);

    // 衝突判定のためにバウンディングボックス情報を保持しておく
    // 実際の判定にはMeshのBoundingBoxを使うが、参照用配列に入れておく
    platforms.push(platform);
    return platform;
}

// ゴールマーカー
function createGoal(x, y, z) {
    const platform = createPlatform(x, y, z, 5, 5, 0xffd700); // 金色

    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 5, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xc0c0c0 });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(0, 2.5, 0);
    pole.castShadow = true;
    platform.add(pole);

    const flagGeometry = new THREE.BoxGeometry(2, 1.5, 0.1);
    const flagMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(1, 4, 0);
    flag.castShadow = true;
    platform.add(flag);

    platform.userData.isGoal = true;
}

function initLevel() {
    // スタート地点
    createPlatform(0, 0, 0, 6, 6, 0x555555);

    // 道中
    createPlatform(0, 0, -8, 4, 4);
    createPlatform(0, 1, -16, 3, 3);
    createPlatform(4, 2, -22, 3, 3);
    createPlatform(8, 3, -28, 3, 3);
    createPlatform(4, 4, -34, 3, 3);
    createPlatform(0, 5, -40, 3, 3);
    createPlatform(-5, 6, -46, 3, 3);
    createPlatform(-5, 7, -54, 3, 6);

    // ゴール
    createGoal(0, 8, -65);
}

initLevel();

// --- プレイヤーと操作 ---
const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, 2, 0);
player.castShadow = true;
scene.add(player);

// 物理パラメータ
const GRAVITY = 0.015;
const JUMP_FORCE = 0.4;
const MOVE_SPEED = 0.15; // ジャンプ時の前進速度
const ROTATION_SPEED = 0.05;

let velocity = new THREE.Vector3();
let isGrounded = false;
let canJump = false; // ジャンプ可能状態（接地後、一度キーを離す必要があるなどの制御用、今回はシンプルに接地判定で）

// キー入力管理
// 上矢印: 前進
// 下矢印: 後退
// スペース: ジャンプ
// 右矢印: 右回転
// 左矢印: 左回転
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = false;
    }
});

// Raycaster設定
const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);

function updatePlayer() {
    // 1. 回転
    if (keys.ArrowLeft) {
        player.rotation.y += ROTATION_SPEED;
    }
    if (keys.ArrowRight) {
        player.rotation.y -= ROTATION_SPEED;
    }

    // 2. 接地判定 (Raycast)
    // プレイヤーの中心から下方向にレイを飛ばす
    raycaster.set(player.position, downVector);
    // 交差判定はすべてのプラットフォームに対して行う
    const intersects = raycaster.intersectObjects(platforms);

    isGrounded = false;
    // 距離判定 (プレイヤーの半分(0.5) + マージン)
    if (intersects.length > 0 && intersects[0].distance < 0.51 && velocity.y <= 0) {
        isGrounded = true;
        // めり込み防止
        player.position.y = intersects[0].point.y + 0.5;
        velocity.y = 0;

        // ゴール判定
        if (intersects[0].object.userData.isGoal) {
            checkWin();
        }
    }

    // 3. 移動・ジャンプ処理
    if (isGrounded) {
        // 接地時の移動
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);

        // 速度リセット（慣性をつけすぎない）
        velocity.x = 0;
        velocity.z = 0;

        if (keys.ArrowUp) {
            velocity.x += forward.x * MOVE_SPEED;
            velocity.z += forward.z * MOVE_SPEED;
        }
        if (keys.ArrowDown) {
            velocity.x -= forward.x * MOVE_SPEED;
            velocity.z -= forward.z * MOVE_SPEED;
        }

        // ジャンプ
        if (keys.Space) {
            velocity.y = JUMP_FORCE;
            isGrounded = false;
        }
    } else {
        // 空中
        // 重力適用
        velocity.y -= GRAVITY;

        // 空中でも多少の移動制御を許すか、あるいは慣性のみにするか
        // ユーザーの要望は「板から板に飛びついて」なので、空中制御があると簡単すぎるかもしれないが、
        // 完全に制御不能だと難しい。
        // ここでは「慣性は維持される」が「空中での加速はできない」設定にする。
        // ただし、前回のコードでは空中制御なしだった。
        // 今回の変更で、updatePlayerの冒頭で velocity.x/z をリセットするロジックに変えると、空中移動ができなくなる（速度0で落ちる）
        // なので、空中では x, z は維持する必要がある。
    }

    // 位置更新
    player.position.add(velocity);

    // 4. 落下判定 (リセット)
    if (player.position.y < -10) {
        resetGame();
    }
}

function updateCamera() {
    // プレイヤーの後ろ上方にカメラを配置
    // 現在のプレイヤー位置を基準にするが、回転も考慮する

    // 理想的なカメラ位置（プレイヤーのローカル座標系での後ろ上）
    const idealOffset = new THREE.Vector3(0, 5, 10);

    // プレイヤーの回転に合わせてオフセットを回転させる
    // ただし、カメラが激しく回転すると酔うので、プレイヤーのY回転に対して少し遅れて追従するか、
    // あるいは単純にプレイヤーの後ろから常に映すか。
    // 今回はシンプルに「プレイヤーの背後」に固定してスムーズに動かす

    // プレイヤーの背後位置を計算
    const offset = idealOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
    const targetPosition = player.position.clone().add(offset);

    // カメラ位置を滑らかに更新 (Lerp)
    camera.position.lerp(targetPosition, 0.1);

    // カメラは常にプレイヤーを見る
    camera.lookAt(player.position);
}

function resetGame() {
    player.position.set(0, 2, 0);
    player.rotation.set(0, 0, 0);
    velocity.set(0, 0, 0);
    // メッセージがあれば消す
    const msg = document.getElementById('message');
    if(msg) msg.remove();
}

function checkWin() {
    // 既にメッセージが出ていれば何もしない
    if (document.getElementById('message')) return;

    const msg = document.createElement('div');
    msg.id = 'message';
    msg.style.position = 'absolute';
    msg.style.top = '50%';
    msg.style.left = '50%';
    msg.style.transform = 'translate(-50%, -50%)';
    msg.style.fontSize = '50px';
    msg.style.color = 'gold';
    msg.style.textShadow = '2px 2px 4px black';
    msg.style.fontFamily = 'sans-serif';
    msg.innerText = 'GOAL!!';
    document.body.appendChild(msg);

    // 数秒後にリセット
    setTimeout(() => {
        resetGame();
    }, 3000);
}


// --- ウィンドウリサイズ対応 ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- アニメーションループ ---
function animate() {
    requestAnimationFrame(animate);

    updatePlayer();
    updateCamera();

    renderer.render(scene, camera);
}

animate();
