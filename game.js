// ====================== GRAPHICS ======================
const Graphics = {
  setup(scene) {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 20, 150);
  },

  addLights(scene) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(30, 50, 30);
    sun.castShadow = true;
    scene.add(sun);
  },

  addGround(scene) {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(60, 2, 60),
      new THREE.MeshLambertMaterial({ color: 0x3a7a3a })
    );
    platform.position.y = 0;
    platform.receiveShadow = true;
    scene.add(platform);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(62, 3, 62),
      new THREE.MeshLambertMaterial({ color: 0x2a5a2a })
    );
    border.position.y = -0.51; 
    scene.add(border);
    return platform;
  },

  init(scene) {
    this.setup(scene);
    this.addLights(scene);
    return this.addGround(scene);
  }
};

// ====================== CUBE MANAGER ======================
class Cube {
  constructor(scene) {
    this.scene = scene;
    this.size = 1.2;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.size, this.size, this.size),
      new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff })
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this.velocity = new THREE.Vector3();
    this.isHeld = false;
    this.spawn();
  }

  spawn() {
    this.mesh.position.set((Math.random() - 0.5) * 40, 10, (Math.random() - 0.5) * 40);
    this.velocity.set(0, 0, 0);
    this.isHeld = false;
  }

  update() {
    if (this.isHeld) return;
    this.velocity.y -= 0.015;
    this.velocity.x *= 0.95;
    this.velocity.z *= 0.95;
    this.mesh.position.add(this.velocity);

    const halfSize = this.size / 2;
    const insideX = this.mesh.position.x >= -30 && this.mesh.position.x <= 30;
    const insideZ = this.mesh.position.z >= -30 && this.mesh.position.z <= 30;

    if (insideX && insideZ && this.mesh.position.y - halfSize <= 1) {
      this.mesh.position.y = 1 + halfSize;
      this.velocity.y = 0;
    }
    if (this.mesh.position.y < -20) this.spawn();
  }
}

// ====================== PLAYER ======================
class Player {
  constructor(scene, camera, cubes) {
    this.scene = scene;
    this.camera = camera;
    this.cubes = cubes;

    this.width = 1.0; this.height = 2.0; this.depth = 1.0;
    const mat = new THREE.MeshLambertMaterial({ color: 0x00ff44 });

    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(this.width, this.height, this.depth), mat.clone());
    this.mesh.position.set(0, 5, 0);
    scene.add(this.mesh);

    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat.clone());
    scene.add(this.head);

    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), mat.clone());
    this.leftArm  = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), mat.clone());
    scene.add(this.rightArm); scene.add(this.leftArm);

    this.fpHand = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.2), mat.clone());
    this.fpHand.visible = false;
    scene.add(this.fpHand);

    this.velocity = new THREE.Vector3();
    this.speed = 0.18; this.jumpPower = 0.38;
    this.grounded = false; this.isDead = false;

    this.keys = {}; this.yaw = 0; this.pitch = 0;
    this.isFirstPerson = false; this.isPunching = false;
    this.punchProgress = 0; this.heldCube = null;
    this.isPointerLocked = false;   // ← Added

    this.initInputs();
  }

  updateMeshColors(body, head, limb) {
    this.mesh.material.color.set(body);
    this.head.material.color.set(head);
    this.rightArm.material.color.set(limb);
    this.leftArm.material.color.set(limb);
    this.fpHand.material.color.set(limb);
  }

  initInputs() {
    window.addEventListener("keydown", e => {
      this.keys[e.code] = true;
      if ((e.code === "KeyI" || e.code === "KeyO") && this.isPointerLocked) {
        this.isFirstPerson = !this.isFirstPerson;
        this.fpHand.visible = this.isFirstPerson;
      }
    });
    window.addEventListener("keyup", e => this.keys[e.code] = false);

    // Pointer Lock Handlers
    document.addEventListener("pointerlockchange", () => {
      this.isPointerLocked = document.pointerLockElement !== null;
    });

    document.addEventListener("pointerlockerror", () => {
      console.error("Pointer Lock Error occurred");
    });

    document.addEventListener("mousemove", e => {
      if (!this.isPointerLocked) return;
      this.yaw -= e.movementX * 0.002;
      this.pitch -= e.movementY * 0.002;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    });

    document.addEventListener("mousedown", e => {
      if (!this.isPointerLocked) {
        document.body.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        if (this.heldCube) this.throwCube(); 
        else this.punch();
      } else if (e.button === 2) {
        if (this.heldCube) this.dropCube(); 
        else this.tryPickUpCube();
      }
    });

    // Allow ESC to exit and click to re-lock
    window.addEventListener("keydown", e => {
      if (e.code === "Escape" && this.isPointerLocked) {
        document.exitPointerLock();
      }
    });
  }

  punch() { 
    if (this.isPunching) return;
    this.isPunching = true;
    this.punchProgress = 0;

    const punchRange = 3.5;
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    
    this.cubes.forEach(cube => {
      const dist = this.mesh.position.distanceTo(cube.mesh.position);
      if (dist <= punchRange) {
        const toCube = new THREE.Vector3().subVectors(cube.mesh.position, this.mesh.position).normalize();
        if (forwardDir.dot(toCube) > 0.65) {
          cube.velocity.addScaledVector(forwardDir, 0.4);
          cube.velocity.y += 0.15;
        }
      }
    });

    if (window.socket) {
      Object.keys(remotePlayers).forEach(id => {
        const remote = remotePlayers[id];
        const dist = this.mesh.position.distanceTo(remote.group.position);
        if (dist <= punchRange) {
          const toPlayer = new THREE.Vector3().subVectors(remote.group.position, this.mesh.position).normalize();
          if (forwardDir.dot(toPlayer) > 0.65) {
            const force = new THREE.Vector3().copy(forwardDir).multiplyScalar(0.6);
            force.y = 0.25; 
            window.socket.emit('hitPlayer', id, { x: force.x, y: force.y, z: force.z });
          }
        }
      });
    }
  }

  tryPickUpCube() {
    let closestCube = null; let closestDist = 4.5;
    this.cubes.forEach(cube => {
      const dist = this.mesh.position.distanceTo(cube.mesh.position);
      if (dist < closestDist) { closestDist = dist; closestCube = cube; }
    });
    if (closestCube) { this.heldCube = closestCube; closestCube.isHeld = true; }
  }

  dropCube() {
    if (!this.heldCube) return;
    this.heldCube.isHeld = false;
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).normalize();
    this.heldCube.mesh.position.addScaledVector(forward, 0.5);
    this.heldCube.velocity.set(0, 0, 0);
    this.heldCube = null;
  }

  throwCube() {
    if (!this.heldCube) return;
    this.isPunching = true; this.punchProgress = 0;
    const throwDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.heldCube.isHeld = false;
    this.heldCube.velocity.copy(throwDir).multiplyScalar(0.65);
    this.heldCube = null;
  }

  handleCubeCollisions() {
    const pMinX = this.mesh.position.x - this.width / 2; const pMaxX = this.mesh.position.x + this.width / 2;
    const pMinY = this.mesh.position.y - this.height / 2; const pMaxY = this.mesh.position.y + this.height / 2;
    const pMinZ = this.mesh.position.z - this.depth / 2; const pMaxZ = this.mesh.position.z + this.depth / 2;

    this.cubes.forEach(cube => {
      if (cube.isHeld) return;
      const cHalf = cube.size / 2;
      const cMinX = cube.mesh.position.x - cHalf; const cMaxX = cube.mesh.position.x + cHalf;
      const cMinY = cube.mesh.position.y - cHalf; const cMaxY = cube.mesh.position.y + cHalf;
      const cMinZ = cube.mesh.position.z - cHalf; const cMaxZ = cube.mesh.position.z + cHalf;

      if (pMaxX > cMinX && pMinX < cMaxX && pMaxY > cMinY && pMinY < cMaxY && pMaxZ > cMinZ && pMinZ < cMaxZ) {
        const diffs = [pMaxX - cMinX, cMaxX - pMinX, pMaxY - cMinY, cMaxY - pMinY, pMaxZ - cMinZ, cMaxZ - pMinZ];
        const minDist = Math.min(...diffs);

        if (minDist === diffs[2]) { this.mesh.position.y += diffs[2]; this.velocity.y = Math.max(0, this.velocity.y); this.grounded = true; }
        else if (minDist === diffs[3]) { this.mesh.position.y -= diffs[3]; this.velocity.y = Math.min(0, this.velocity.y); }
        else if (minDist === diffs[0]) this.mesh.position.x -= diffs[0];
        else if (minDist === diffs[1]) this.mesh.position.x += diffs[1];
        else if (minDist === diffs[4]) this.mesh.position.z -= diffs[4];
        else if (minDist === diffs[5]) this.mesh.position.z += diffs[5];
      }
    });
  }

  update() {
    if (this.isDead) return;

    const move = new THREE.Vector3();
    if (this.keys["KeyW"]) move.z -= 1; if (this.keys["KeyS"]) move.z += 1;
    if (this.keys["KeyA"]) move.x -= 1; if (this.keys["KeyD"]) move.x += 1;
    move.normalize();

    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0,1,0), this.yaw);
    const right   = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), this.yaw);
    const finalMove = new THREE.Vector3().addScaledVector(forward, move.z).addScaledVector(right, move.x);

    this.mesh.position.x += finalMove.x * this.speed;
    this.mesh.position.z += finalMove.z * this.speed;
    if (move.length() > 0) this.mesh.rotation.y = this.yaw;

    this.velocity.y -= 0.022;
    this.mesh.position.y += this.velocity.y;

    const insidePlatform = this.mesh.position.x >= -30 && this.mesh.position.x <= 30 && this.mesh.position.z >= -30 && this.mesh.position.z <= 30;
    if (insidePlatform && this.mesh.position.y <= 2) {
      this.mesh.position.y = 2; this.velocity.y = 0; this.grounded = true;
    } else { this.grounded = false; }

    this.handleCubeCollisions();

    if (this.keys["Space"] && this.grounded) { this.velocity.y = this.jumpPower; this.grounded = false; }

    if (this.heldCube) {
      if (this.isFirstPerson) {
        const holdPos = new THREE.Vector3(0.5, -0.2, -1.8).applyQuaternion(this.camera.quaternion);
        this.heldCube.mesh.position.copy(this.camera.position).add(holdPos);
      } else {
        const holdPos = new THREE.Vector3(0, 0.2, -1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);
        this.heldCube.mesh.position.copy(this.mesh.position).add(holdPos);
      }
    }

    if (this.mesh.position.y < -25) { this.mesh.position.set(0, 5, 0); this.velocity.set(0,0,0); }

    let armSwingX = 0;
    if (this.isPunching) {
      this.punchProgress += 0.25;
      armSwingX = Math.sin(this.punchProgress * Math.PI) * 1.5;
      if (this.punchProgress >= 1.0) this.isPunching = false;
    }

    if (this.isFirstPerson) {
      this.camera.position.set(this.mesh.position.x, this.mesh.position.y + 0.65, this.mesh.position.z);
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      const offset = new THREE.Vector3(0.45, -0.35 - (armSwingX * 0.1), -0.5 - (armSwingX * 0.3)).applyQuaternion(this.camera.quaternion);
      this.fpHand.position.copy(this.camera.position).add(offset);
      this.fpHand.quaternion.copy(this.camera.quaternion);
      this.fpHand.rotation.x -= armSwingX;
      this.mesh.visible = this.head.visible = this.rightArm.visible = this.leftArm.visible = false;
    } else {
      this.camera.position.copy(this.mesh.position).add(new THREE.Vector3(0, 5, 10).applyAxisAngle(new THREE.Vector3(0,1,0), this.yaw));
      this.camera.lookAt(this.mesh.position.x, this.mesh.position.y + 0.5, this.mesh.position.z);
      this.mesh.visible = this.head.visible = this.rightArm.visible = this.leftArm.visible = true;

      const rotY = this.mesh.rotation.y;
      this.head.position.copy(this.mesh.position).add(new THREE.Vector3(0, 1.45, 0));
      this.head.rotation.y = rotY;

      const rightArmOffset = new THREE.Vector3(0.8, 0.1 + (armSwingX * 0.2), -(armSwingX * 0.5)).applyAxisAngle(new THREE.Vector3(0,1,0), rotY);
      this.rightArm.position.copy(this.mesh.position).add(rightArmOffset);
      this.leftArm.position.copy(this.mesh.position).add(new THREE.Vector3(-0.8, 0.1, 0).applyAxisAngle(new THREE.Vector3(0,1,0), rotY));
      this.rightArm.rotation.y = this.leftArm.rotation.y = rotY;
      this.rightArm.rotation.x = -armSwingX;
    }

    if (window.socket && window.socket.connected) {
      window.socket.emit('playerMovement', { x: this.mesh.position.x, y: this.mesh.position.y, z: this.mesh.position.z, yaw: this.yaw });
    }
  }
}

// ====================== ENGINE MAIN / NETWORKING ======================
let scene, camera, renderer, player;
const cubes = [];
const remotePlayers = {};

function initGame() {
  scene = new THREE.Scene();
  Graphics.init(scene);

  for (let i = 0; i < 8; i++) cubes.push(new Cube(scene));

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  player = new Player(scene, camera, cubes);
  window.player = player;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Click on canvas to lock pointer
  renderer.domElement.addEventListener('click', () => {
    if (!document.pointerLockElement) {
      document.body.requestPointerLock();
    }
  });

  animate();
}

function createRemotePlayer(info) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1,2,1), new THREE.MeshLambertMaterial({color: info.colors.body}));
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,0.7), new THREE.MeshLambertMaterial({color: info.colors.head}));
  head.position.y = 1.45;
  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.9,0.25), new THREE.MeshLambertMaterial({color: info.colors.limb}));
  rArm.position.set(0.8,0.1,0);
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.9,0.25), new THREE.MeshLambertMaterial({color: info.colors.limb}));
  lArm.position.set(-0.8,0.1,0);

  group.add(torso); group.add(head); group.add(rArm); group.add(lArm);
  group.position.set(info.x, info.y, info.z);
  scene.add(group);

  remotePlayers[info.id] = { group, torso, head, rArm, lArm };
}

window.startMultiplayerEngine = function() {
  initGame();
  
  window.socket = io();

  window.socket.emit('playerColors', {
    body: document.getElementById('body-color').value,
    head: document.getElementById('head-color').value,
    limb: document.getElementById('limb-color').value
  });

  window.socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach(id => {
      if (id !== window.socket.id) createRemotePlayer(players[id]);
    });
  });

  window.socket.on('newPlayer', info => createRemotePlayer(info));

  window.socket.on('playerMoved', info => {
    if (remotePlayers[info.id]) {
      remotePlayers[info.id].group.position.set(info.x, info.y, info.z);
      remotePlayers[info.id].group.rotation.y = info.yaw;
    }
  });

  window.socket.on('playerUpdated', info => {
    if (remotePlayers[info.id]) {
      remotePlayers[info.id].torso.material.color.set(info.colors.body);
      remotePlayers[info.id].head.material.color.set(info.colors.head);
      remotePlayers[info.id].rArm.material.color.set(info.colors.limb);
      remotePlayers[info.id].lArm.material.color.set(info.colors.limb);
    }
  });

  window.socket.on('getHit', force => {
    if (player) {
      player.velocity.set(force.x, force.y, force.z);
      player.grounded = false;
    }
  });

  window.socket.on('playerDisconnected', id => {
    if (remotePlayers[id]) {
      scene.remove(remotePlayers[id].group);
      delete remotePlayers[id];
    }
  });

  // Try to lock immediately (will work better after user interaction)
  setTimeout(() => document.body.requestPointerLock(), 300);
};

function animate() {
  requestAnimationFrame(animate);
  cubes.forEach(c => c.update());
  if (player) player.update();
  renderer.render(scene, camera);
}