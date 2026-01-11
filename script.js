import * as THREE from 'three';

// --- CONFIG & DATA ---
const CHARACTERS = [
    { id: 0, name: "Red Cube", color: 0xff0000, type: "box", speed: 1.0, jump: 1.0 },
    { id: 1, name: "Blue Cyl", color: 0x0000ff, type: "cylinder", speed: 1.2, jump: 0.9 }, // Fast runner
    { id: 2, name: "Green Cone", color: 0x00ff00, type: "cone", speed: 0.9, jump: 1.2 },   // High jumper
    { id: 3, name: "Yellow Sphere", color: 0xffff00, type: "sphere", speed: 1.1, jump: 1.1 }, // Balanced
    { id: 4, name: "Purple Box", color: 0x800080, type: "box", speed: 0.8, jump: 0.8 },     // Heavy
    { id: 5, name: "Orange Cyl", color: 0xffa500, type: "cylinder", speed: 1.3, jump: 0.8 },
    { id: 6, name: "White Ball", color: 0xffffff, type: "sphere", speed: 1.0, jump: 1.3 },
    { id: 7, name: "Pink Cone", color: 0xffc0cb, type: "cone", speed: 1.1, jump: 1.1 },
    { id: 8, name: "Black Box", color: 0x333333, type: "box", speed: 0.9, jump: 1.0 },
    { id: 9, name: "Cyan Cyl", color: 0x00ffff, type: "cylinder", speed: 1.2, jump: 1.0 }
];

// Save Data
let playerData = {
    ownedIds: [0],
    party: [0],
    coins: 500
};

// Load from LocalStorage
const savedData = localStorage.getItem('athleticGameData');
if (savedData) {
    try {
        const parsed = JSON.parse(savedData);
        playerData = { ...playerData, ...parsed };
    } catch(e) {
        console.error("Save data error", e);
    }
}

function saveData() {
    localStorage.setItem('athleticGameData', JSON.stringify(playerData));
}

// --- ENGINE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- GAME STATE ---
const STATE = {
    MENU: 0,
    PLAY: 1,
    GACHA: 2,
    PARTY: 3,
    GAMEOVER: 4
};
let currentState = STATE.MENU;
let currentLevelIdx = 0;

// --- OBJECT MANAGEMENT ---
let platforms = [];
let enemies = [];
let squadMeshes = [];
let squadData = []; // Store character stats for active squad
let squadHistory = [];
let particles = [];

// Base Physics
const GRAVITY = 0.015;
const BASE_JUMP_FORCE = 0.4;
const BASE_MOVE_SPEED = 0.15;
const ROTATION_SPEED = 0.05;

let velocity = new THREE.Vector3();
let isGrounded = false;
const leaderRotation = new THREE.Euler(0, 0, 0);

// Input
const keys = { ArrowUp: false, ArrowLeft: false, ArrowRight: false };
window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.code)) keys[e.code] = true; });
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.code)) keys[e.code] = false; });

// --- LEVEL SYSTEM ---
function clearLevel() {
    platforms.forEach(p => scene.remove(p));
    enemies.forEach(e => scene.remove(e.mesh));
    platforms = [];
    enemies = [];

    squadMeshes.forEach(m => scene.remove(m));
    squadMeshes = [];
    squadData = [];
}

function createPlatform(x, y, z, w, d, color = 0x88cc88) {
    const geo = new THREE.BoxGeometry(w, 1, d);
    const mat = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    platforms.push(mesh);
    return mesh;
}

function createGoal(x, y, z) {
    const p = createPlatform(x, y, z, 5, 5, 0xffd700);
    p.userData.isGoal = true;
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 5),
        new THREE.MeshStandardMaterial({ color: 0xc0c0c0 })
    );
    pole.position.y = 2.5;
    p.add(pole);
    const flag = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.5, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    flag.position.set(1, 4, 0);
    p.add(flag);
}

function createEnemy(x, y, z, range, speedMult = 1.0) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x550000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 1, z);
    mesh.castShadow = true;
    scene.add(mesh);

    const spikeGeo = new THREE.ConeGeometry(0.2, 0.5, 4);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    for(let i=0; i<4; i++) {
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        spike.position.y = 0.6;
        spike.position.x = (i%2===0 ? 0.4 : -0.4) * (i<2?1:0);
        spike.position.z = (i%2!==0 ? 0.4 : -0.4) * (i>=2?1:0);
        mesh.add(spike);
    }

    enemies.push({
        mesh: mesh,
        basePos: new THREE.Vector3(x, y + 1, z),
        range: range,
        offset: Math.random() * Math.PI * 2,
        speed: (0.05 + (currentLevelIdx * 0.02)) * speedMult
    });
}

const LEVELS = [
    // Level 1: Tutorial
    () => {
        createPlatform(0, 0, 0, 6, 6, 0x555555);
        createPlatform(0, 0, -8, 4, 4);
        createPlatform(0, 1, -16, 3, 3);
        createPlatform(4, 2, -22, 3, 3);
        createPlatform(8, 3, -28, 3, 3);
        createPlatform(4, 4, -34, 3, 3);
        createPlatform(0, 5, -40, 3, 3);
        createEnemy(0, 5, -40, 0);
        createPlatform(-5, 6, -46, 3, 3);
        createPlatform(-5, 7, -54, 3, 6);
        createGoal(0, 8, -65);
    },
    // Level 2: Movement
    () => {
        createPlatform(0, 0, 0, 6, 6, 0x555555);
        createPlatform(0, 0, -10, 3, 10);
        createEnemy(0, 0, -10, 4);
        createPlatform(0, 1, -20, 3, 3);
        createPlatform(-5, 2, -25, 3, 3);
        createEnemy(-5, 2, -25, 0);
        createPlatform(5, 3, -30, 3, 3);
        createPlatform(0, 4, -38, 2, 8);
        createEnemy(0, 4, -38, 3, 1.5); // Faster
        createGoal(0, 5, -50);
    },
    // Level 3: Hard
    () => {
        createPlatform(0, 0, 0, 6, 6, 0x555555);
        for(let i=1; i<=12; i++) {
            const x = (i % 2 === 0) ? 5 : -5;
            createPlatform(x, i, -i * 8, 3, 3);
            if (i > 2) createEnemy(x, i, -i * 8, 2.5, 1.2);
        }
        createGoal(0, 14, -110);
    }
];

function initGame() {
    clearLevel();

    // Spawn Squad
    if (playerData.party.length === 0) {
        // Fallback if empty
        playerData.party = [0];
    }

    playerData.party.forEach((charId) => {
        const charDef = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
        let geo;
        switch(charDef.type) {
            case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1); break;
            case 'cone': geo = new THREE.ConeGeometry(0.5, 1); break;
            case 'sphere': geo = new THREE.SphereGeometry(0.5); break;
            default: geo = new THREE.BoxGeometry(1, 1, 1);
        }
        const mat = new THREE.MeshStandardMaterial({ color: charDef.color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        scene.add(mesh);
        squadMeshes.push(mesh);
        squadData.push(charDef);
    });

    velocity.set(0, 0, 0);
    leaderRotation.set(0, 0, 0);

    if (squadMeshes.length > 0) {
        squadMeshes[0].position.set(0, 2, 0);
    }

    squadHistory = [];
    for(let i=0; i<100; i++) {
        squadHistory.push(new THREE.Vector3(0, 2, 0));
    }

    if (LEVELS[currentLevelIdx]) {
        LEVELS[currentLevelIdx]();
    } else {
        currentLevelIdx = 0;
        LEVELS[0]();
    }

    document.getElementById('level-display').innerText = currentLevelIdx + 1;
    updateSquadDisplay();

    currentState = STATE.PLAY;
}

function updateSquadDisplay() {
    document.getElementById('squad-display').innerText = `${squadMeshes.length}/${playerData.party.length}`;
}

// --- GAME LOGIC ---

const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);

function updateGame() {
    if (squadMeshes.length === 0) return;

    const leader = squadMeshes[0];
    const stats = squadData[0]; // Current leader stats

    // 1. Rotation
    if (keys.ArrowLeft) leaderRotation.y += ROTATION_SPEED;
    if (keys.ArrowRight) leaderRotation.y -= ROTATION_SPEED;
    leader.rotation.y = leaderRotation.y;

    // 2. Ground Check
    raycaster.set(leader.position, downVector);
    const intersects = raycaster.intersectObjects(platforms);
    isGrounded = false;

    if (intersects.length > 0 && intersects[0].distance < 0.6 && velocity.y <= 0) {
        isGrounded = true;
        leader.position.y = intersects[0].point.y + 0.5;
        velocity.y = 0;

        if (intersects[0].object.userData.isGoal) {
            handleWin();
        }
    }

    // 3. Movement
    if (isGrounded) {
        if (keys.ArrowUp) {
            velocity.y = BASE_JUMP_FORCE * stats.jump;
            const forward = new THREE.Vector3(0, 0, -1).applyEuler(leaderRotation);
            const speed = BASE_MOVE_SPEED * stats.speed;
            velocity.x = forward.x * speed;
            velocity.z = forward.z * speed;
            isGrounded = false;
        } else {
            velocity.x *= 0.8;
            velocity.z *= 0.8;
        }
    } else {
        velocity.y -= GRAVITY;
    }
    leader.position.add(velocity);

    // 4. History
    squadHistory.unshift(leader.position.clone());
    if (squadHistory.length > 100) squadHistory.pop();

    // 5. Followers
    const delay = 6;
    for (let i = 1; i < squadMeshes.length; i++) {
        const histIdx = i * delay;
        if (histIdx < squadHistory.length) {
            const pos = squadHistory[histIdx];
            squadMeshes[i].position.copy(pos);
            squadMeshes[i].rotation.copy(leader.rotation);
        }
    }

    // 6. Enemies
    updateEnemies();

    // Death
    if (leader.position.y < -10) {
        killLeader("Fall");
    }
}

function updateEnemies() {
    const time = Date.now() * 0.001;
    const leader = squadMeshes[0];
    const leaderBox = new THREE.Box3().setFromObject(leader);

    enemies.forEach(e => {
        if (e.range > 0) {
            e.mesh.position.x = e.basePos.x + Math.sin(time * e.speed + e.offset) * e.range;
        }
        e.mesh.rotation.y += 0.02;

        const enemyBox = new THREE.Box3().setFromObject(e.mesh);
        if (leaderBox.intersectsBox(enemyBox)) {
            killLeader("Hit");
        }
    });
}

function killLeader(reason) {
    const deadLeader = squadMeshes.shift();
    scene.remove(deadLeader);
    squadData.shift(); // Remove stats

    if (squadMeshes.length === 0) {
        setTimeout(resetGame, 500);
    } else {
        velocity.y = Math.max(0, velocity.y);
        updateSquadDisplay();
    }
}

function handleWin() {
    if (document.getElementById('msg')) return;

    const msg = document.createElement('div');
    msg.id = 'msg';
    msg.innerText = "STAGE CLEAR!";
    msg.style.cssText = "position:absolute; top:40%; left:50%; transform:translateX(-50%); font-size:40px; color:gold; font-weight:bold; text-shadow:2px 2px black;";
    document.body.appendChild(msg);

    setTimeout(() => {
        msg.remove();
        currentLevelIdx++;
        if (currentLevelIdx >= LEVELS.length) currentLevelIdx = 0;
        initGame();
    }, 2000);
}

function resetGame() {
    currentState = STATE.MENU;
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('party-screen').style.display = 'none';
    document.getElementById('gacha-screen').style.display = 'none';
}

function updateCamera() {
    if (squadMeshes.length === 0) return;
    const target = squadMeshes[0];

    const idealOffset = new THREE.Vector3(0, 5, 10);
    const offset = idealOffset.clone().applyEuler(new THREE.Euler(0, leaderRotation.y, 0));
    const targetPos = target.position.clone().add(offset);

    camera.position.lerp(targetPos, 0.1);
    camera.lookAt(target.position);
}

// --- UI HANDLERS ---

document.getElementById('start-btn').onclick = () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    initGame();
};

document.getElementById('back-to-menu-btn').onclick = () => {
    resetGame();
};

document.getElementById('gacha-btn').onclick = () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('gacha-screen').style.display = 'flex';
    document.getElementById('gacha-result').innerText = "";
    document.getElementById('gacha-animation').innerText = "?";
};

document.getElementById('gacha-back-btn').onclick = () => {
    document.getElementById('gacha-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
};

document.getElementById('pull-btn').onclick = () => {
    const roll = Math.floor(Math.random() * CHARACTERS.length);
    const char = CHARACTERS[roll];

    const anim = document.getElementById('gacha-animation');
    anim.innerText = "!";
    anim.style.color = "white";

    setTimeout(() => {
        anim.innerText = char.name;
        anim.style.color = "#" + char.color.toString(16);
        document.getElementById('gacha-result').innerText = `You got ${char.name}!`;

        if (!playerData.ownedIds.includes(char.id)) {
            playerData.ownedIds.push(char.id);
            saveData();
        }
    }, 300);
};

document.getElementById('party-btn').onclick = () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('party-screen').style.display = 'flex';
    renderPartyUI();
};

document.getElementById('party-back-btn').onclick = () => {
    document.getElementById('party-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
};

function renderPartyUI() {
    const ownedList = document.getElementById('owned-list');
    const activeList = document.getElementById('active-list');
    ownedList.innerHTML = "<h3>Owned</h3>";
    activeList.innerHTML = "<h3>Active Party (Max 7)</h3>";

    playerData.party.forEach((id, idx) => {
        const char = CHARACTERS.find(c => c.id === id);
        const div = document.createElement('div');
        div.className = 'char-item';
        div.innerHTML = `<div class="char-icon" style="background-color: #${char.color.toString(16)}"></div> ${char.name}`;
        div.onclick = () => {
            playerData.party.splice(idx, 1);
            saveData();
            renderPartyUI();
        };
        activeList.appendChild(div);
    });

    playerData.ownedIds.forEach(id => {
        const char = CHARACTERS.find(c => c.id === id);
        const div = document.createElement('div');
        div.className = 'char-item';
        div.innerHTML = `<div class="char-icon" style="background-color: #${char.color.toString(16)}"></div> ${char.name} (S:${char.speed} J:${char.jump})`;
        div.onclick = () => {
            if (playerData.party.length < 7) {
                playerData.party.push(id);
                saveData();
                renderPartyUI();
            } else {
                alert("Party is full!");
            }
        };
        ownedList.appendChild(div);
    });
}

function animate() {
    requestAnimationFrame(animate);
    if (currentState === STATE.PLAY) {
        updateGame();
        updateCamera();
    }
    renderer.render(scene, camera);
}

animate();
