// ============================================================
// WORLD.JS — Fasi 1-3
// Stanza in prima persona + intro a stati + interazione:
//   SEATED -> seduto sul divano (guardi col mouse, WASD spento)
//   STANDING_UP -> ti alzi (transizione morbida)
//   EXPLORE -> cammini, raccogli il telecomando (E), usi la TV (LMB)
//   TV_ZOOM / TV_VIEW / TV_ZOOM_OUT -> camera in fullscreen sulla TV
// Tutto volutamente semplice e lineare.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


// ------------------------------------------------------------
// RENDERER
// ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);


// ------------------------------------------------------------
// SCENA E CAMERA
// ------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171109);   // dark caldo (mood cozy)

const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);

const STANDING_HEIGHT = 1.7;     // altezza occhi in piedi
const CROUCH_HEIGHT = 1.0;       // altezza occhi accovacciato
const SEATED_HEIGHT = 1.1;       // altezza occhi da seduto

camera.position.set(0, SEATED_HEIGHT, -3.6);   // si parte SEDUTI sul divano

let yaw = Math.PI;               // sinistra/destra: parte rivolto verso la TV (+z)
let pitch = 0;                   // su/giu
camera.rotation.set(pitch, yaw, 0, 'YXZ');

// La camera va aggiunta alla scena: cosi' gli oggetti "attaccati" ad essa
// (il telecomando in mano) vengono disegnati.
scene.add(camera);


// ------------------------------------------------------------
// LUCI
// ------------------------------------------------------------
const ambientLight = new THREE.AmbientLight(0xffd9a0, 0.6);    // luce ambientale calda (mood cozy)
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffc078, 0.85);   // "sole" caldo (da una finestra immaginaria)
sunLight.position.set(3, 6, 2);
scene.add(sunLight);

// Luce calda della lampada da terra: parte SPENTA (intensita' 0), si accende cliccando il paralume.
// La posizione viene messa sul paralume quando il modello e' caricato (vedi placeModel della lampada).
const lampLight = new THREE.PointLight(0xffcc66, 0, 8, 1.5);
scene.add(lampLight);


// ------------------------------------------------------------
// AUDIO (i file stanno nella cartella Audio/)
// ------------------------------------------------------------
const sounds = {};
function loadSound(name, file, loop, volume, rate) {
    const a = new Audio('Audio/' + file);
    a.loop = !!loop;
    a.volume = (volume === undefined) ? 1 : volume;
    a.playbackRate = rate || 1;   // 1 = velocita' normale, 1.15 = +15%
    sounds[name] = a;
}
loadSound('wake', 'WakeUp(Risveglio).mp3', false, 0.7);
loadSound('pickup', 'PickUp.mp3', false, 0.8);
loadSound('drop', 'Drop.mp3', false, 0.8);
loadSound('book', 'Book.mp3', false, 0.8);
loadSound('click', 'Click.mp3', false, 0.7);
loadSound('painting', 'Painting.mp3', false, 0.7, 1.15);   // rotazione quadri +15% di velocita'
loadSound('plantMove', 'PlantMove.mp3', false, 0.8);
loadSound('plantFall', 'PlantFall.mp3', false, 0.63);   // -30%
loadSound('remoteBreak', 'Telecomando.mp3', false, 0.9);
loadSound('navBlip', 'BlipNav.mp3', false, 0.5);
loadSound('zoomIn', 'ZoomOnTV.mp3', false, 0.7);
loadSound('zoomOut', 'ZoomOutTV.mp3', false, 0.7);
loadSound('radio', 'Lo-Fi.mp3', true, 0.45);
loadSound('tvStatic', 'TVStatic.mp3', true, 0.115);   // -20% + altro -20%
loadSound('footsteps', 'WalkingWood.mp3', true, 0.45, 1.15);   // camminata +15% di velocita'

// Suono singolo (riparte da capo a ogni richiamo).
function playSound(name) {
    const a = sounds[name];
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});   // ignora errori (es. audio non ancora sbloccato prima del primo click)
}
// Loop: avvia (se fermo), metti in pausa (riprende), o ferma (riparte da capo).
function startLoop(name) { const a = sounds[name]; if (a && a.paused) a.play().catch(() => {}); }
function pauseLoop(name) { const a = sounds[name]; if (a) a.pause(); }
function stopLoop(name) { const a = sounds[name]; if (a) { a.pause(); a.currentTime = 0; } }


// ------------------------------------------------------------
// STANZA (pavimento + 4 muri + soffitto)
// ------------------------------------------------------------
const ROOM_HALF = 5;
const WALL_HEIGHT = 3;

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x6b4f3a })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xb8b3a8 });

function addWall(width, depth, x, z) {
    const wall = new THREE.Mesh(
        new THREE.BoxGeometry(width, WALL_HEIGHT, depth),
        wallMaterial
    );
    wall.position.set(x, WALL_HEIGHT / 2, z);
    scene.add(wall);
}

addWall(ROOM_HALF * 2, 0.2, 0, -ROOM_HALF);
addWall(ROOM_HALF * 2, 0.2, 0,  ROOM_HALF);
addWall(0.2, ROOM_HALF * 2, -ROOM_HALF, 0);
addWall(0.2, ROOM_HALF * 2,  ROOM_HALF, 0);

const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0xcfcac0 })
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = WALL_HEIGHT;
scene.add(ceiling);


// ------------------------------------------------------------
// MOBILI (modelli low-poly Kenney Furniture Kit) + collisioni
// ------------------------------------------------------------
const PLAYER_RADIUS = 0.35;
const colliders = [];                 // ingombri (footprint) per le collisioni
const interactables = [];             // decor interagibili (LMB): lampada, radio, orologio, libreria, pianta, quadri
const modelLoader = new GLTFLoader();
const FURNITURE_SCALE = 2.3;          // i modelli sono ~1 unita': li scaliamo per la stanza (metri)

// Carica un modello, lo scala, lo ruota e ne appoggia la base alla quota 'baseY'.
// Se 'solid' = true, dopo il caricamento crea l'ingombro per le collisioni.
function placeModel(file, x, z, rotY, baseY, solid, onLoaded, scale) {
    modelLoader.load('models/' + encodeURIComponent(file), (gltf) => {   // encodeURI: regge i nomi con spazi
        const obj = gltf.scene;
        const s = (scale === undefined) ? FURNITURE_SCALE : scale;       // scala per-oggetto (props piccoli)
        obj.scale.set(s, s, s);
        obj.rotation.y = rotY || 0;
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const y = (baseY === undefined) ? 0 : baseY;
        // Centra il modello su (x,z) usando il suo bounding box (alcuni modelli hanno
        // l'origine su un bordo, non al centro) e appoggia la base a quota 'y'.
        obj.position.set(
            x - (box.min.x + box.max.x) / 2,
            y - box.min.y,
            z - (box.min.z + box.max.z) / 2
        );
        scene.add(obj);

        if (solid) {
            obj.updateMatrixWorld(true);
            const b = new THREE.Box3().setFromObject(obj);
            colliders.push({
                minX: b.min.x - PLAYER_RADIUS, maxX: b.max.x + PLAYER_RADIUS,
                minZ: b.min.z - PLAYER_RADIUS, maxZ: b.max.z + PLAYER_RADIUS,
            });
        }

        if (onLoaded) onLoaded(obj);   // callback opzionale dopo il caricamento del modello
    });
}

// Crea un box invisibile attorno a un oggetto gia' caricato. Serve da bersaglio per il raycast
// (cosi' miri/clicchi TUTTO l'oggetto, non una singola mesh: es. la pianta col vaso, o la
// poltrona che e' grande). Se addCollider = true aggiunge anche l'ingombro per le collisioni;
// per oggetti gia' 'solid=true' basta il bersaglio. Restituisce il box.
function addHitBox(object, addCollider) {
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const box = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })   // invisibile ma raycastabile
    );
    box.position.copy(center);
    scene.add(box);

    if (addCollider) {   // alcuni oggetti hanno gia' il collider (solid=true): qui basta il bersaglio del raycast
        colliders.push({
            minX: bounds.min.x - PLAYER_RADIUS, maxX: bounds.max.x + PLAYER_RADIUS,
            minZ: bounds.min.z - PLAYER_RADIUS, maxZ: bounds.max.z + PLAYER_RADIUS,
        });
    }
    return box;
}

// --- Disposizione della stanza ---
// Le quote 'baseY' degli oggetti appoggiati vengono dalle altezze reali misurate:
// piano scrivania 0.88, mobile TV 0.71, seduta divano ~0.48.
placeModel('rugRectangle.glb',      0,    -1.6, 0,            0.01);
placeModel('loungeSofa.glb',        0,    -4.0, 0,            0,    true, (o) => addSittable(o, { x: 0, y: SEATED_HEIGHT, z: -3.6 }, Math.PI, { x: 0, y: STANDING_HEIGHT, z: -2.4 }, "Oh you're getting comfy? You should be checking my work!"));   // divano (sittable)
placeModel('tableCoffeeSquare.glb', 0,    -1.3, 0,            0,    true);   // tavolino davanti al divano
placeModel('cabinetTelevision.glb', 0,     4.6, 0,            0,    true);   // mobile TV (parete davanti)
placeModel('televisionModern.glb',  0,     4.6, Math.PI,      0.71, false, alignStaticToTv);   // TV: aggancia lo static allo schermo
placeModel('speaker.glb',          -1.3,   4.55, 0,    0,    true);   // speaker a sinistra della TV (solido)
placeModel('speaker.glb',           1.3,   4.55, 0,    0,    true);   // speaker a destra della TV (solido)
placeModel('desk.glb',             -4.5,   0,   Math.PI / 2,  0,    true, (o) => addSittable(o, { x: -3.7, y: SEATED_HEIGHT, z: 0 }, Math.PI / 2, { x: -3.0, y: STANDING_HEIGHT, z: 0 }, "That's the wrong screen, does it look like a TV to you?"));   // scrivania: cliccandola ti siedi alla sedia
placeModel('chairDesk.glb',        -3.7,   0,  -Math.PI / 2, 0, true, (o) => addSittable(o, { x: -3.7, y: SEATED_HEIGHT, z: 0 }, Math.PI / 2, { x: -3.0, y: STANDING_HEIGHT, z: 0 }, "That's the wrong screen, does it look like a TV to you?"));   // sedia scrivania (sittable + collider)
placeModel('Bookcase with Books.glb', -4.6, -3.9, Math.PI / 2, 0,   true, (o) => addInteractable(o, 'bookshelf', "Yeah, I won't lie here... it's just a display, nothing to read there"), 0.9);   // libreria (click = prendi il libro)
placeModel('loungeChairRelax.glb',  3.7,  -1.2,-Math.PI / 2,  0,    true, (o) => { const box = addHitBox(o, false); addSittable(box, { x: 3.7, y: SEATED_HEIGHT, z: -1.3 }, Math.PI, { x: 3.7, y: STANDING_HEIGHT, z: 0.2 }, "Oh you're getting comfy? You should be checking my work!"); });   // poltrona: box per il sit + battuta
placeModel('sideTable.glb',         4.5,  -2.8, 0,    0,    true);   // tavolino solido (ci sta sopra la radio)
placeModel('table.glb',             4.35,  2.5, Math.PI / 2,  0,    true);   // tavolo: lato lungo contro il muro destro
placeModel('pottedPlant.glb',      -4.5,   4.5, 0, 0, false, (o) => { const box = addHitBox(o, true); const entry = addInteractable(box, 'plant', "Ehi, stop shaking the plant, you will make a mess"); entry.model = o; plantEntry = entry; });   // pianta: box per collisione/click, model per shake/caduta
placeModel('ceilingFan.glb',        0,     0,   0,            WALL_HEIGHT - 0.32);   // ventilatore a soffitto

// Oggetti appoggiati su altri mobili (baseY = altezza del piano sotto)
placeModel('computerScreen.glb',   -4.7,   0,    Math.PI / 2,  0.88, false, alignStaticToComputer);   // monitor con schermo statico
placeModel('computerKeyboard.glb', -4.3,   0,    Math.PI / 2,  0.88);   // tastiera davanti al monitor
placeModel('computerMouse.glb',    -4.3,  -0.45, Math.PI / 2,  0.88);   // mouse sull'altro lato della tastiera

// --- Arredo extra (props scaricati): lampada, orologio, radio ---
placeModel('Lamp Round Floor.glb',   4.55, -0.4,  0,       0, true, (o) => { addInteractable(o, 'lamp', "Yeah light... it's a lamp... I don't know what you expected"); const b = new THREE.Box3().setFromObject(o); lampLight.position.set((b.min.x + b.max.x) / 2, b.max.y - 0.15, (b.min.z + b.max.z) / 2); });    // lampada (click = paralume + luce calda)
placeModel('Grandfathers Clock.glb', -4.6,  1.8,  Math.PI / 2, 0, true, (o) => addInteractable(o, 'clock', "This is not working... I said I would fix it but got distracted eheh"), 1.84);   // orologio interagibile (a sinistra della scrivania)
placeModel('Radio.glb',              4.5,  -2.8,  Math.PI, 0.88, false, (o) => addInteractable(o, 'radio', "Ehi, you! I said TV remote, not radio, come on!"), 0.18);  // radio interagibile, ruotata verso il player (rotY = Math.PI, da regolare)

// Libro: chiuso + aperto, nascosti sotto il pavimento finche' la libreria non te li da' (poi li apri/chiudi in mano)
placeModel('Book.glb',      0, 0, 0, 0, false, (o) => { bookClosedObj = o; parkBookModel(o); tryCreateBook(); }, 0.5);
placeModel('Open Book.glb', 0, 0, 0, 0, false, (o) => { bookOpenObj  = o; parkBookModel(o); tryCreateBook(); }, 0.5);


// ------------------------------------------------------------
// QUADRI DEI COMANDI (sul muro dietro il divano, z = -5)
// Ogni quadro = cornice (box) + un pannello con una texture disegnata su canvas
// (il tasto in un riquadro + l'azione sotto). Il pannello e' "unlit" cosi' la
// scritta resta sempre leggibile anche con luci basse.
// ------------------------------------------------------------

// Disegna la texture di un quadro: sfondo a gradiente, strisce d'accento,
// tasto "key-cap" arrotondato con riflesso, e l'azione in maiuscolo sotto.
function makeControlTexture(key, action) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    // sfondo "carta" con leggero gradiente verticale
    const bg = ctx.createLinearGradient(0, 0, 0, 300);
    bg.addColorStop(0, '#fbf6ea');
    bg.addColorStop(1, '#ece1c9');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 300);

    // strisce d'accento calde (alto e basso)
    ctx.fillStyle = '#c2693f';
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillRect(0, 288, 256, 12);

    // tasto stile "key-cap": base scura (ombra) + faccia + riflesso in cima
    const bx = 63, by = 58, bw = 130, bh = 94, r = 18;
    ctx.fillStyle = '#1e2024';
    ctx.beginPath(); ctx.roundRect(bx, by + 8, bw, bh, r); ctx.fill();
    ctx.fillStyle = '#34373f';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh - 4, r); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath(); ctx.roundRect(bx + 12, by + 8, bw - 24, 20, 10); ctx.fill();

    // testo del tasto (bianco): piu' grande se e' un solo carattere
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (key.length === 1 ? 60 : 34) + 'px Segoe UI, Arial, sans-serif';
    ctx.fillText(key, bx + bw / 2, by + bh / 2);

    // azione (maiuscolo) sotto il tasto
    ctx.fillStyle = '#3b3530';
    ctx.font = '600 32px Segoe UI, Arial, sans-serif';
    ctx.fillText(action.toUpperCase(), 128, 228);

    return new THREE.CanvasTexture(canvas);
}

// Crea un quadro (cornice + pannello) sul muro dietro il divano, alla x data.
function makeControlPainting(key, action, x) {
    const PIC_W = 0.92;
    const PIC_H = 1.08;        // proporzione ~256:300
    const y = 1.8;             // sopra la spalliera del divano

    // Cornice + pannello in un GRUPPO, cosi' ruotano insieme come un quadro solo.
    const group = new THREE.Group();

    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(PIC_W + 0.12, PIC_H + 0.12, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x4a3725 })   // cornice di legno (illuminata)
    );
    frame.position.set(0, 0, -0.04);      // un filo dietro al pannello
    group.add(frame);

    const picture = new THREE.Mesh(
        new THREE.PlaneGeometry(PIC_W, PIC_H),
        new THREE.MeshBasicMaterial({ map: makeControlTexture(key, action) })   // unlit: sempre leggibile
    );
    group.add(picture);

    group.position.set(x, y, -4.82);
    scene.add(group);

    // LMB ruota il quadro di 90°. Raggio lungo (12): i quadri sono dietro al divano, irraggiungibili da vicino.
    addInteractable(group, 'painting', null, 12);
}

// Cinque quadri-comando in fila sul muro dietro il divano (sinistra -> destra).
makeControlPainting('E', 'Grab', -3.5);
makeControlPainting('LMB', 'Interact', -1.75);
makeControlPainting('RMB', 'Drop', 0);
makeControlPainting('C', 'Crouch', 1.75);
makeControlPainting('Shift', 'Sprint', 3.5);


// ------------------------------------------------------------
// TV + STATICA
// ------------------------------------------------------------
const tvScreen = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.78, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
);
tvScreen.position.set(0, 1.235, 4.42);   // posizione iniziale; viene agganciata alla TV quando carica
scene.add(tvScreen);

// Aggancia lo static (tvScreen) allo schermo del modello TV: ne calcola dimensione
// e posizione dal bounding box reale della TV (chiamata quando la TV ha caricato),
// cosi' resta allineato anche se il modello viene centrato/spostato.
function alignStaticToTv(tv) {
    tv.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(tv);
    const width = b.max.x - b.min.x;
    const height = b.max.y - b.min.y;
    const centerX = (b.min.x + b.max.x) / 2;
    const screenW = width * 0.86;              // lo schermo e' poco piu' piccolo della TV (cornice)
    const screenH = height * 0.70;             // lo stand sta in basso: lo schermo non occupa tutta l'altezza
    const screenY = b.min.y + height * 0.58;   // centro schermo, un po' sopra il centro (sopra lo stand)
    const screenZ = b.min.z + 0.04;            // dentro la cornice (la TV guarda -z): a filo dello schermo, niente gap di lato

    tvScreen.geometry.dispose();
    tvScreen.geometry = new THREE.BoxGeometry(screenW, screenH, 0.04);
    tvScreen.position.set(centerX, screenY, screenZ);

    // il punto di zoom si mette davanti al centro dello schermo
    TV_VIEW_POS.x = centerX;
    TV_VIEW_POS.y = screenY;
    TV_VIEW_POS.z = screenZ - 0.85;
}

const noiseCanvas = document.createElement('canvas');
noiseCanvas.width = 64;
noiseCanvas.height = 64;
const noiseCtx = noiseCanvas.getContext('2d');
const noiseTexture = new THREE.CanvasTexture(noiseCanvas);
const noiseImage = noiseCtx.createImageData(noiseCanvas.width, noiseCanvas.height);  // creata UNA volta, riusata

let tvOn = false;

function turnOnTV() {
    tvOn = true;
    startLoop('tvStatic');   // fruscio statico finche' la TV mostra la statica
    tvScreen.material.map = noiseTexture;
    tvScreen.material.color.set(0xffffff);
    tvScreen.material.needsUpdate = true;
}

function updateStatic() {
    const data = noiseImage.data;   // riusiamo lo stesso buffer (niente allocazioni per frame)
    for (let i = 0; i < data.length; i += 4) {
        const shade = Math.random() * 255;
        data[i] = shade;
        data[i + 1] = shade;
        data[i + 2] = shade;
        data[i + 3] = 255;
    }
    noiseCtx.putImageData(noiseImage, 0, 0);
    noiseTexture.needsUpdate = true;
}

// --- Statica anche sul monitor del computer (riusa la stessa noiseTexture della TV) ---
const computerStatic = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.4),
    new THREE.MeshBasicMaterial({ map: noiseTexture })
);
computerStatic.visible = false;   // diventa visibile quando il monitor ha caricato
scene.add(computerStatic);

// Aggancia il pannello statico allo schermo del monitor (con rotY=PI/2 lo schermo guarda +x).
function alignStaticToComputer(comp) {
    comp.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(comp);
    const zSpan = b.max.z - b.min.z;   // la larghezza dello schermo e' lungo z (il monitor guarda +x)
    const ySpan = b.max.y - b.min.y;
    const xSpan = b.max.x - b.min.x;   // profondita' del monitor
    computerStatic.geometry.dispose();
    // Dimensioni e posizione ricavate MISURANDO il vero vetro del monitor (con una griglia di raggi):
    // il vetro e' ~97% della larghezza e ~89% dell'altezza del box; e' INCASSATO ~0.44 della profondita'
    // dietro il bordo frontale; il suo centro e' piu' in alto del centro del box (sotto c'e' il piede).
    // Mettendo la statica un filo DAVANTI al vetro resta allineata, dentro la cornice e senza z-fighting.
    computerStatic.geometry = new THREE.PlaneGeometry(zSpan * 0.97, ySpan * 0.82);
    computerStatic.position.set(
        b.max.x - xSpan * 0.44,    // appena davanti al vetro (che e' a ~0.46 di profondita'), niente z-fighting
        b.min.y + ySpan * 0.585,   // centro dello schermo VERO (sotto il vetro c'e' un "mento": niente statica li')
        (b.min.z + b.max.z) / 2
    );
    computerStatic.rotation.set(0, Math.PI / 2, 0);   // la faccia guarda +x (verso la stanza)
    // Lo schermo del monitor e' INCLINATO all'indietro di ~8 gradi (misurato coi raggi: il vetro in alto
    // e' piu' indietro che in basso). Inclino la statica della stessa quantita' attorno all'asse Z del
    // mondo, cosi' resta PARALLELA al vetro e non lo interseca piu' (niente meta' rumore / meta' beige).
    computerStatic.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), 0.139);
    computerStatic.visible = true;
}


// ------------------------------------------------------------
// TELECOMANDO (oggetto raccoglibile)
// Uno sul tavolo (nel mondo) e una copia "in mano" che compare
// davanti alla camera quando lo prendi.
// ------------------------------------------------------------
const remote = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.08, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
);
remote.position.set(0, 0.56, -1.3);   // sul tavolino, davanti al divano
scene.add(remote);

// Il telecomando "in mano" e' gestito dal sistema grabbabili generico
// (vedi addGrabbable / grabObject piu' sotto): l'oggetto stesso viene
// agganciato alla camera, quindi non serve una copia dedicata.


// ------------------------------------------------------------
// TOOLTIP (messaggi guida)
// Aggiorniamo il DOM solo quando il testo cambia: niente sfarfallio
// e nessuna scrittura inutile a ogni frame.
// ------------------------------------------------------------
const tooltipEl = document.getElementById('tooltip');
let currentTooltip = '';

function showTooltip(text) {
    if (text === currentTooltip) return;
    currentTooltip = text;
    tooltipEl.textContent = text;
    tooltipEl.classList.add('show');
}

function hideTooltip() {
    if (currentTooltip === '') return;
    currentTooltip = '';
    tooltipEl.classList.remove('show');
}

// Riquadro dei comandi ([LMB]/[E]): separato, sta SOPRA il #tooltip e si vede insieme a esso.
const lookTipEl = document.getElementById('lookTip');
const crosshairEl = document.getElementById('crosshair');
let currentLookTip = '';

function showLookTip(text) {
    if (text === currentLookTip) return;
    currentLookTip = text;
    lookTipEl.textContent = text;
    lookTipEl.classList.add('show');
}

function hideLookTip() {
    if (currentLookTip === '') return;
    currentLookTip = '';
    lookTipEl.classList.remove('show');
}

// Sequenza dei tooltip iniziali: 4 messaggi, uno ogni 3.5 secondi.
// 1-2 = il "padrone di casa" che ti accoglie; 3 = mouse; 4 = WASD.
// Ci si puo' alzare/muovere solo dal 4o tooltip in poi (canStandUp).
const TOOLTIP_DURATION = 3500;    // durata di un tooltip dell'intro (e default dei tooltip temporanei)
let introStarted = false;
let canStandUp = false;

function startIntro() {
    // Ogni tooltip resta 4s; il successivo parte al multiplo giusto di TOOLTIP_DURATION.
    showTooltip('Ehi! What the hell are you doing on my sofa?');
    gameTimeout(() => showTooltip("Oh... you're here to check my work? Fair fair, then let me help you"), TOOLTIP_DURATION);
    gameTimeout(() => showTooltip('You can look around by moving the mouse'), TOOLTIP_DURATION * 2);
    gameTimeout(() => {
        showTooltip('And obviously, WASD to move around');
        canStandUp = true;                 // da qui il player puo' alzarsi/muoversi (4o tooltip)
    }, TOOLTIP_DURATION * 3);
    gameTimeout(() => {
        if (gameState === 'SEATED') hideTooltip();
    }, TOOLTIP_DURATION * 4);
}

// FASE "TELECOMANDO": parte ~5s dopo essersi alzati. Mostra un prompt per 10s e,
// in base a cosa fa il player in quei 10s, risponde con una battuta diversa.
function startRemotePhase() {
    remotePhase = true;
    showTempTooltip('Ok, if you want to check some projects you need the TV remote', 10000);
    remotePhaseTimer = gameTimeout(() => {
        // 10s di gioco senza interazioni: il padrone di casa si rassegna.
        remotePhase = false;
        remotePhaseTimer = null;
        showTempTooltip('Or just do nothing, yeah sure why not', 7000);
    }, 10000);
}

// Chiude la fase (il player ha interagito): ferma il timer dei 10s.
function endRemotePhase() {
    remotePhase = false;
    if (remotePhaseTimer) {
        cancelGameTimeout(remotePhaseTimer);
        remotePhaseTimer = null;
    }
    clearTempTooltips();   // interrompe il prompt che sta scorrendo: la risposta parte SUBITO
}


// ------------------------------------------------------------
// CONTROLLI: cattura del mouse (Pointer Lock)
// ------------------------------------------------------------
const startScreen = document.getElementById('startScreen');
const blink = document.getElementById('blink');

let isLocked = false;

startScreen.addEventListener('click', () => {
    document.body.requestPointerLock();
    playSound('wake');   // "risveglio" + sblocca l'audio (e' il primo gesto utente)
});

document.addEventListener('pointerlockchange', () => {
    isLocked = (document.pointerLockElement === document.body);

    if (isLocked) {
        startScreen.classList.add('hidden');
        document.body.classList.add('playing');
        if (!blink.classList.contains('played')) {
            blink.classList.add('play', 'played');
        }
        if (!introStarted) {
            introStarted = true;
            startIntro();
        }
        if (returningToRoom) {        // ri-agganciato per uscire dalla TV -> parte lo zoom-out
            returningToRoom = false;
            gameState = 'TV_ZOOM_OUT';
        }
    } else {
        // Se siamo nel menu/pagina della TV, l'uscita dal lock e' VOLUTA
        // (serve il cursore libero): non mostriamo "click to resume".
        if (gameState !== 'TV_MENU' && gameState !== 'TV_PAGE') {
            document.body.classList.remove('playing');
            startScreen.querySelector('p').textContent = 'click to resume';
            startScreen.classList.remove('hidden');
        }
    }
});


// ------------------------------------------------------------
// STATO DEL GIOCO
// ------------------------------------------------------------
let gameState = 'SEATED';        // SEATED -> STANDING_UP -> EXPLORE -> TV_ZOOM -> TV_VIEW -> TV_ZOOM_OUT

// Interazione (mira al centro dello schermo).
const raycaster = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0, 0);   // (0,0) = centro schermo
const GRAB_DISTANCE = 1.9261;     // quanto vicino bisogna essere per raccogliere/sedersi/interagire (aumentato del 3%)
const DROP_DISTANCE = GRAB_DISTANCE * 1.15;   // per POSARE un oggetto: un filo piu' lungo del grab (+15%)
let remotePhase = false;          // fase "telecomando" (10s) con battute condizionali
let remotePhaseTimer = null;      // timer dei 10s (lo annulliamo se il player interagisce prima)
let tempTipQueue = [];            // coda dei tooltip temporanei: ognuno finisce prima del successivo
let tempTipTimer = null;          // timer del tooltip in corso (serve per poterlo interrompere, es. il prompt)
let lookAction = null;            // azione sull'oggetto mirato: 'grab' | 'tv' | 'interact' | null
let lookTarget = null;            // l'oggetto/voce mirato (per grab o interact)
let heldObject = null;            // l'oggetto che hai in mano (o null)
const grabbables = [];            // tutti gli oggetti raccoglibili (vedi addGrabbable)
let showingTempTip = false;       // true mentre un tooltip temporaneo (drop/flavor) e' visibile: ha priorita'

// Zoom sulla TV.
const TV_VIEW_POS = { x: 0, y: 1.235, z: 3.7 };   // davanti allo schermo, lo riempie
let returnState = null;           // dove tornare quando esci dalla TV
let tvTargetYaw = Math.PI;

// Menu della TV (elementi HTML dell'overlay).
const tvUi = document.getElementById('tvUi');
const tvMenu = document.getElementById('tvMenu');
const tvPage = document.getElementById('tvPage');
const tvFrame = document.getElementById('tvFrame');
const tvBack = document.getElementById('tvBack');
const tvExit = document.getElementById('tvExit');
const tvItems = Array.from(document.querySelectorAll('.tv-item'));
let selectedIndex = 0;
let returningToRoom = false;     // true mentre usciamo dalla TV (ri-aggancio mouse -> zoom-out)


// ------------------------------------------------------------
// ROTAZIONE CAMERA COL MOUSE
// Disattivata mentre la camera e' "agganciata" alla TV.
// ------------------------------------------------------------
const LOOK_SPEED = 0.001;
const PITCH_LIMIT = Math.PI / 2 - 0.15;
const MAX_LOOK_STEP = 0.3;    // rotazione massima per frame (radianti): frena gli scatti anomali, non i giri veloci normali

// Il mouse NON ruota la camera a ogni evento: accumula solo lo spostamento.
// La rotazione si applica UNA volta per frame (applyMouseLook), con un tetto
// per frame. Cosi', se molti eventi arrivano insieme (es. dopo un micro-blocco
// del PC), la vista non puo' fare uno scatto improvviso.
let mouseDX = 0;
let mouseDY = 0;

document.addEventListener('mousemove', (event) => {
    if (!isLocked) return;
    if (gameState === 'TV_ZOOM' || gameState === 'TV_VIEW' || gameState === 'TV_ZOOM_OUT') return;

    const d = Math.max(Math.abs(event.movementX), Math.abs(event.movementY));
    if (d > 300) return;   // FILTRO ANTI-SPIKE: un movimento normale e' piccolo; 300+ in un
                           // singolo evento e' un glitch del mouse, quindi lo ignoriamo

    mouseDX += event.movementX;
    mouseDY += event.movementY;
});

function applyMouseLook() {
    let dYaw = -mouseDX * LOOK_SPEED;       // mouse a destra -> giro a destra
    let dPitch = -mouseDY * LOOK_SPEED;     // mouse in alto  -> guardo in alto

    // Tetto per frame: niente scatti anche con tanti eventi accumulati.
    dYaw = Math.max(-MAX_LOOK_STEP, Math.min(MAX_LOOK_STEP, dYaw));
    dPitch = Math.max(-MAX_LOOK_STEP, Math.min(MAX_LOOK_STEP, dPitch));

    yaw += dYaw;
    pitch += dPitch;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    mouseDX = 0;   // svuotiamo l'accumulatore per il prossimo frame
    mouseDY = 0;
}


// ------------------------------------------------------------
// INPUT DA TASTIERA
// ------------------------------------------------------------
const keys = {};
let isCrouching = false;

const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyE'];
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

window.addEventListener('keydown', (event) => {
    keys[event.code] = true;
    if (isLocked && GAME_KEYS.includes(event.code)) {
        event.preventDefault();
    }

    // Alzarsi dal divano (dopo che il 2o tooltip e' apparso).
    if (isLocked && gameState === 'SEATED' && canStandUp && MOVE_KEYS.includes(event.code)) {
        gameState = 'STANDING_UP';
        hideTooltip();
    }

    // Da seduto su uno spot: WASD per rialzarsi.
    if (isLocked && gameState === 'SITTING' && MOVE_KEYS.includes(event.code)) {
        gameState = 'STAND_FROM_SIT';
        hideTooltip();
    }

    // Crouch a toggle, solo mentre si esplora.
    if (isLocked && gameState === 'EXPLORE' && event.code === 'KeyC' && !event.repeat) {
        isCrouching = !isCrouching;
    }

    // Raccogliere un oggetto: E mentre lo stai guardando (qualsiasi grabbabile).
    if (isLocked && gameState === 'EXPLORE' && event.code === 'KeyE' && lookAction === 'grab') {
        grabObject(lookTarget);
    }

    // Navigazione del menu TV (anche da tastiera, oltre al mouse).
    if (gameState === 'TV_MENU') {
        if (event.code === 'KeyW' || event.code === 'ArrowUp') { event.preventDefault(); moveMenuSelection(-1); }
        else if (event.code === 'KeyS' || event.code === 'ArrowDown') { event.preventDefault(); moveMenuSelection(1); }
        else if (event.code === 'Enter' || event.code === 'KeyE') { event.preventDefault(); openPage(selectedIndex); }
    } else if (gameState === 'TV_PAGE') {
        if (event.code === 'Escape' || event.code === 'Backspace') backToMenu();
    }
});
window.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});


// ------------------------------------------------------------
// INPUT MOUSE (tasto sinistro) — usare/uscire dalla TV
// ------------------------------------------------------------
document.addEventListener('mousedown', (event) => {
    if (!isLocked) return;
    // Tasto sinistro: usa la TV (col telecomando) oppure interagisci con un oggetto decor.
    if (event.button === 0 && gameState === 'EXPLORE') {
        if (lookAction === 'tv') startTvZoom();
        else if (lookAction === 'book') swapHeldBook();
        else if (lookAction === 'sit') startSitting(lookTarget);
        else if (lookAction === 'interact') interactWith(lookTarget);
    }
    // Tasto destro: posare l'oggetto che hai in mano dove stai guardando.
    if (event.button === 2 && gameState === 'EXPLORE' && heldObject) {
        dropHeldObject();
    }
    // (nel menu/pagina il mouse e' libero: i click li gestiscono i bottoni/voci)
});

// Niente menu contestuale del tasto destro mentre giochi: il RMB lo usiamo per posare.
document.addEventListener('contextmenu', (event) => {
    if (isLocked) event.preventDefault();
});


// ------------------------------------------------------------
// OGGETTI GRABBABILI (sistema generico)
// Ogni grabbabile ha: il modello nel mondo, un nome (per il tooltip "[E] ..."),
// un messaggio "flavor" mostrato quando lo prendi, e come appare "in mano"
// (posizione/rotazione/scala relative alla camera). 'tvRemote' = oggetto
// speciale che usa la TV (il telecomando).
// ------------------------------------------------------------
function addGrabbable(object, name, message, inHand, tvRemote) {
    grabbables.push({
        object: object,
        name: name,
        message: message,
        inHand: inHand,
        tvRemote: tvRemote || false,
        worldScale: object.scale.clone(),   // per ripristinarla quando lo riposi
    });
}

// Prendi in mano un grabbabile: lo togli dal mondo e lo agganci alla camera.
function grabObject(g, silent) {
    playSound('pickup');
    if (g.isBook) removeBookCollider();     // se era a terra con un ingombro, toglilo
    heldObject = g;
    scene.remove(g.object);
    camera.add(g.object);                   // figlio della camera => "in mano"
    const pose = (g.isBook && g.isOpen) ? g.inHandOpen : g.inHand;   // il libro aperto ha la sua posa
    g.object.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    g.object.rotation.set(pose.rot.x, pose.rot.y, pose.rot.z);
    g.object.scale.setScalar(pose.scale);

    if (remotePhase) endRemotePhase();   // prendere qualcosa chiude la fase "telecomando"

    if (silent || g.isBook) return;   // libro: nessun tooltip alla presa (mostra solo "[LMB] Open/Close book")

    // Il telecomando: la battuta SOLO finche' non l'hai ancora droppato (dopo il 1o drop, niente).
    if (g.tvRemote) {
        if (remoteDrops === 0) showObjectDialogue("Yeah that's the one, just don't break it please, I don't have a spare");   // 6s + sovrascrive
        return;
    }

    // Altri grabbabili: mostra il messaggio dell'oggetto.
    showTempTooltip(g.message);
}

// Posa l'oggetto in mano dove stai guardando (raggio dal centro -> prima superficie),
// appoggiandone la base sul punto colpito.
function dropHeldObject() {
    if (!heldObject) return;
    raycaster.setFromCamera(SCREEN_CENTER, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (hits.length === 0) return;                  // niente sotto il mirino: non posiamo (raro)
    if (hits[0].distance > DROP_DISTANCE) return;   // posa solo su una superficie abbastanza vicina (+15% del grab)

    playSound('drop');
    const g = heldObject;
    camera.remove(g.object);
    g.object.scale.copy(g.worldScale);              // ripristina la scala "nel mondo"
    // Rotazione "a terra": il libro CHIUSO va girato di 90° su Z per stare piatto;
    // l'aperto (gia' piatto) e gli altri oggetti restano a 0.
    if (g.isBook && !g.isOpen) {
        g.object.rotation.set(0, 0, Math.PI / 2);
    } else {
        g.object.rotation.set(0, 0, 0);
    }
    g.object.position.set(hits[0].point.x, hits[0].point.y, hits[0].point.z);
    scene.add(g.object);
    g.object.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g.object);
    g.object.position.y += hits[0].point.y - b.min.y;   // base appoggiata sulla superficie
    heldObject = null;

    // Se e' il libro: crea un ingombro dove l'hai posato (lo togli quando lo riprendi).
    if (g.isBook) {
        g.object.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(g.object);
        g.collider = {
            minX: groundBox.min.x - PLAYER_RADIUS, maxX: groundBox.max.x + PLAYER_RADIUS,
            minZ: groundBox.min.z - PLAYER_RADIUS, maxZ: groundBox.max.z + PLAYER_RADIUS,
        };
        colliders.push(g.collider);
    }

    // Se e' il telecomando: conta i drop. 1 e 2 = avvertimenti; al 3o si rompe + reload.
    if (g.tvRemote) {
        remoteDrops++;
        if (remoteDrops === 1) {
            showObjectDialogue("I said to be careful, if you break it, you can't check the projects!");
        } else if (remoteDrops === 2) {
            showObjectDialogue("Oh so you're actually trying to break it, cool");
        } else {
            breakRemote(g.object);
        }
    }
}

// Quante volte e' stato droppato il telecomando (si azzera al reload della pagina).
let remoteDrops = 0;

// Al 3o drop: sostituisce il telecomando con 9 cubetti neri (3x3) sparpagliati, poi ricarica la pagina.
function breakRemote(remoteObj) {
    playSound('remoteBreak');
    remoteObj.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(remoteObj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    scene.remove(remoteObj);

    const pieceMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });   // nero come il telecomando
    const pieceX = size.x / 3;
    const pieceZ = size.z / 3;
    for (let ix = 0; ix < 3; ix++) {
        for (let iz = 0; iz < 3; iz++) {
            const piece = new THREE.Mesh(
                new THREE.BoxGeometry(pieceX * 0.85, size.y * 0.85, pieceZ * 0.85),
                pieceMaterial
            );
            piece.position.set(
                bounds.min.x + pieceX * (ix + 0.5) + (Math.random() - 0.5) * pieceX * 0.6,
                center.y + (Math.random() - 0.5) * size.y * 0.6,
                bounds.min.z + pieceZ * (iz + 0.5) + (Math.random() - 0.5) * pieceZ * 0.6
            );
            piece.rotation.set(Math.random() * 0.6, Math.random() * 0.6, Math.random() * 0.6);
            scene.add(piece);
        }
    }

    showObjectDialogue("There you go, you broke it, now you can't see my work, just leave");
    gameTimeout(() => { location.reload(); }, 5000);
}

// Toglie l'ingombro del libro posato a terra (quando lo riprendi in mano).
function removeBookCollider() {
    if (bookGrab && bookGrab.collider) {
        const i = colliders.indexOf(bookGrab.collider);
        if (i !== -1) colliders.splice(i, 1);
        bookGrab.collider = null;
    }
}

// Tooltip temporaneo (drop/flavor/battute): ha priorita' sugli altri.
// Vanno in CODA: ognuno resta per la sua durata intera e solo dopo parte il successivo,
// cosi' nessun tooltip viene "sovrascritto" da uno nuovo.
function showTempTooltip(text, duration) {
    tempTipQueue.push({ text: text, duration: duration || TOOLTIP_DURATION });
    if (!showingTempTip) showNextTempTooltip();
}

// Mostra il prossimo tooltip in coda (se c'e'); a fine durata richiama se stesso.
function showNextTempTooltip() {
    if (tempTipQueue.length === 0) {
        showingTempTip = false;
        tempTipTimer = null;
        hideTooltip();          // niente piu' in coda: libera il riquadro principale
        return;
    }
    const tip = tempTipQueue.shift();
    showingTempTip = true;
    showTooltip(tip.text);
    tempTipTimer = gameTimeout(showNextTempTooltip, tip.duration);
}

// Svuota la coda e nasconde (es. entrando nella TV: niente tooltip di gioco sopra il menu).
function clearTempTooltips() {
    tempTipQueue = [];
    if (tempTipTimer) { cancelGameTimeout(tempTipTimer); tempTipTimer = null; }
    showingTempTip = false;
    hideTooltip();
}

// --- Registrazione dei grabbabili ---
// Telecomando: oggetto speciale (usa la TV). Messaggio = placeholder, da ritoccare.
addGrabbable(
    remote,
    'Remote',
    'The TV remote. Time to see what is on.',
    { pos: { x: 0.42, y: -0.32, z: -0.7 }, rot: { x: -0.15, y: 1.2, z: 0.12 }, scale: 0.45 },
    true
);

// Registra un decor interagibile (LMB): kind = comportamento, message = battuta (o null),
// range = distanza max per mirarlo (di default GRAB_DISTANCE; i quadri usano un raggio lungo).
function addInteractable(object, kind, message, range) {
    const entry = { object: object, kind: kind, message: message, on: false, range: range };
    interactables.push(entry);
    return entry;
}

// Accende/spegne il "paralume" della lampada (effetto visivo: materiale emissive).
function toggleLamp(entry) {
    entry.on = !entry.on;
    playSound('click');
    lampLight.intensity = entry.on ? 4 : 0;   // accende/spegne la luce calda della lampada (regola il 4 se serve)
    const glow = new THREE.Color(entry.on ? 0xffcc66 : 0x000000);
    // Accendi SOLO il paralume: nel modello e' il materiale chiamato 'lamp'
    // (l'altro materiale, 'metal', e' il palo + la base e resta spento).
    entry.object.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => {
            if (m && m.name === 'lamp' && m.emissive) m.emissive = glow;
        });
    });
}

// Accende/spegne un glow ambra sulla faccia della radio quando la accendi (il pezzo 'Red' e' degenere/invisibile).
function setRadioGlow(entry) {
    const glow = new THREE.Color(entry.on ? 0xffaa33 : 0x000000);
    entry.object.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => {
            if (m && m.name === 'LightGrey' && m.emissive) m.emissive = glow;
        });
    });
}

// Azione (LMB) su un decor: esegue l'azione + mostra la battuta (5s, a ogni click).
// Battute dei quadri in base a quante volte QUEL quadro e' stato ruotato (ogni quadro ha il suo conteggio).
function paintingLine(count) {
    if (count === 1) return "Ehi! that's not nice, rotate it back";
    if (count === 2) return "Stop! It's ugly and unreadable like that";
    if (count === 4) return "Okay thanks, now stop messing with them";
    return null;   // 3 e dal 5 in poi: nessuna battuta
}

// Dialogo di un oggetto (battuta): dura 6s e SOVRASCRIVE quello in corso,
// cosi' cliccando un altro oggetto parte subito la nuova battuta (niente coda).
function showObjectDialogue(text) {
    clearTempTooltips();
    showTempTooltip(text, 6000);
}

function interactWith(entry) {
    if (entry.kind === 'lamp') {
        toggleLamp(entry);
    } else if (entry.kind === 'radio') {
        entry.on = !entry.on;
        playSound('click');
        setRadioGlow(entry);         // spia accesa/spenta
        if (entry.on) startLoop('radio'); else stopLoop('radio');   // musica lo-fi on/off
    } else if (entry.kind === 'plant') {
        if (remotePhase) endRemotePhase();   // interagire chiude la fase telecomando
        if (entry.fallen) {
            entry.fallen = false;            // FIX: si rialza (animazione in updatePlantTilt)
            entry.clicks = 0;
            playSound('plantMove');          // fruscio mentre si rialza
            return;                          // nessuna battuta al fix
        }
        // conta i click ravvicinati: 5 entro 10 secondi e la pianta cade
        const now = gameTime;
        if (entry.windowStart === undefined || now - entry.windowStart > 10000) {
            entry.windowStart = now;
            entry.clicks = 1;
        } else {
            entry.clicks++;
        }
        if (entry.clicks >= 5) {
            entry.fallen = true;             // CADE (animazione in updatePlantTilt)
            entry.clicks = 0;
            playSound('plantFall');
            showObjectDialogue('Yeah, well done, look at this mess');
        } else {
            startShake(entry.model);
            showObjectDialogue(entry.message);   // la battuta base
        }
        return;
    } else if (entry.kind === 'painting') {
        playSound('painting');
        entry.object.rotation.z -= Math.PI / 2;            // ruota il quadro di 90° verso destra
        entry.rotations = (entry.rotations || 0) + 1;      // contatore proprio di QUESTO quadro
        entry.message = paintingLine(entry.rotations);     // la battuta dipende dal conteggio (o null)
    } else if (entry.kind === 'bookshelf') {
        takeBook();                  // ti mette il libro chiuso in mano
    }

    // Interagire durante la fase "telecomando" la chiude (niente "do nothing"); poi la battuta normale.
    if (remotePhase) endRemotePhase();
    if (entry.message) showObjectDialogue(entry.message);   // 6s e sovrascrive il dialogo precedente
}

// --- Scuotimento (es. la pianta su LMB): oscillazione smorzata sull'asse X ---
let shakeModel = null;       // l'oggetto che si sta scuotendo (uno alla volta)
let shakeTime = 0;           // secondi di scuotimento rimanenti

function startShake(model) {
    shakeModel = model;
    shakeTime = 0.6;
    playSound('plantMove');   // fruscio quando scuoti la pianta
}

// Chiamata ogni frame: oscilla l'oggetto sull'asse X, partendo forte e spegnendosi piano.
function updateShake(delta) {
    if (shakeTime <= 0) return;
    shakeTime -= delta;
    if (shakeTime <= 0) {
        shakeModel.rotation.x = 0;   // fine: raddrizza
        return;
    }
    shakeModel.rotation.x = Math.sin(shakeTime * 40) * 0.15 * (shakeTime / 0.6);
}

// --- Caduta/rialzo della pianta (asse Z, indipendente dallo shake su X) ---
let plantEntry = null;                   // l'interagibile della pianta (per animarla)
const PLANT_FALL_ANGLE = -Math.PI / 2;   // stesa di lato (segno da regolare se cade verso il muro)

// Chiamata ogni frame: porta la pianta verso "stesa" (se caduta) o "dritta" (altrimenti),
// tenendo il punto piu' basso appoggiato al pavimento (altrimenti ruotando sprofonda).
function updatePlantTilt(delta) {
    if (!plantEntry || !plantEntry.model) return;
    const target = plantEntry.fallen ? PLANT_FALL_ANGLE : 0;
    const z = plantEntry.model.rotation.z;
    const diff = target - z;
    if (Math.abs(diff) < 0.002) {
        plantEntry.model.rotation.z = target;
        return;   // ferma: posizione gia' a posto
    }
    plantEntry.model.rotation.z = z + diff * Math.min(1, delta * 7);
    // dopo aver ruotato, rialza finche' il punto piu' basso torna a y=0 (niente sprofondamento)
    plantEntry.model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(plantEntry.model);
    plantEntry.model.position.y += -bounds.min.y;
    syncPlantHitBox();   // il box cliccabile segue la pianta: da stesa la clicchi tutta, non solo il vaso
}

// Allinea il box invisibile (quello che intercetta il click) all'ingombro ATTUALE della pianta.
// Senza, da caduta restava cliccabile solo dove il box "dritto" originale combaciava: il vaso.
function syncPlantHitBox() {
    const box = plantEntry.object;
    if (!box || !box.geometry.parameters) return;
    plantEntry.model.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(plantEntry.model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    b.getSize(size);
    b.getCenter(center);
    const g = box.geometry.parameters;   // dimensioni del box da dritto
    box.scale.set(size.x / g.width, size.y / g.height, size.z / g.depth);
    box.position.copy(center);
}

// --- LIBRO (dalla libreria): chiuso <-> aperto (LMB), RMB per posarlo ---
let bookClosedObj = null;
let bookOpenObj = null;
let bookGrab = null;

function parkBookModel(obj) {
    if (obj.parent) obj.parent.remove(obj);
    scene.add(obj);
    obj.position.set(0, -5, 0);      // nascosto sotto il pavimento finche' non e' in mano
}

function tryCreateBook() {
    if (bookClosedObj && bookOpenObj && !bookGrab) {
        bookGrab = {
            isBook: true,
            isOpen: false,
            name: 'Book',                // per il tooltip "[E] Book" quando e' a terra
            collider: null,              // ingombro creato quando lo posi a terra (vedi dropHeldObject)
            closedObj: bookClosedObj,
            openObj: bookOpenObj,
            object: bookClosedObj,
            inHand:     { pos: { x: 0.3,  y: -0.28, z: -0.55 }, rot: { x: -0.4, y: 0, z: 0.1 }, scale: 0.5 },   // libro CHIUSO in mano
            inHandOpen: { pos: { x: 0.50, y: -0.30, z: -0.50 }, rot: { x: 1.0,  y: 0, z: 0   }, scale: 0.5 },   // libro APERTO: pagine verso il player, spostato a destra (lontano dal tooltip)
            worldScale: bookClosedObj.scale.clone(),
        };
        grabbables.push(bookGrab);       // cosi' il sistema "[E]" lo trova quando e' a terra
    }
}

// Click sulla libreria: mette il libro CHIUSO in mano.
function takeBook() {
    if (!bookGrab || heldObject) return;
    parkBookModel(bookGrab.openObj);
    parkBookModel(bookGrab.closedObj);
    bookGrab.object = bookGrab.closedObj;
    bookGrab.isOpen = false;
    grabObject(bookGrab, true);      // silent: la battuta della libreria la mostra interactWith
}

// LMB col libro in mano: swap chiuso <-> aperto.
function swapHeldBook() {
    playSound('book');
    const b = bookGrab;
    parkBookModel(b.object);                    // via il modello attuale (sotto il pavimento)
    b.isOpen = !b.isOpen;
    b.object = b.isOpen ? b.openObj : b.closedObj;
    camera.add(b.object);                       // l'altro modello in mano
    const pose = b.isOpen ? b.inHandOpen : b.inHand;   // l'aperto ha una posa propria (pagine verso il player)
    b.object.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    b.object.rotation.set(pose.rot.x, pose.rot.y, pose.rot.z);
    b.object.scale.setScalar(pose.scale);
    if (b.isOpen) {
        showTempTooltip("I just told you there's nothing, but you're stubborn!", 5000);
    }
}


// ------------------------------------------------------------
// COLLISIONI
// ------------------------------------------------------------
function collidesWithFurniture(x, z) {
    for (const box of colliders) {
        if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) {
            return true;
        }
    }
    return false;
}


// ------------------------------------------------------------
// INTERAZIONE: cosa sto guardando? (raggio dal centro dello schermo)
// Aggiorna 'lookingAt' e il tooltip relativo.
// ------------------------------------------------------------
function updateInteraction() {
    // Aggiorniamo le matrici PRIMA del raycast: il raggio parte dopo che la
    // camera si e' mossa in questo frame, ma il render (che aggiorna le matrici)
    // arriva dopo. Senza questo, il raggio userebbe lo stato del frame precedente
    // e non aggancerebbe gli oggetti. La scena e' piccola: costo trascurabile.
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(SCREEN_CENTER, camera);
    lookAction = null;
    lookTarget = null;

    if (heldObject) {
        // Con qualcosa in mano: solo le azioni dell'oggetto tenuto.
        if (heldObject.tvRemote) {
            const hits = raycaster.intersectObject(tvScreen);
            if (hits.length > 0) lookAction = 'tv';          // guardi la TV col telecomando
        } else if (heldObject.isBook) {
            lookAction = 'book';                             // tieni il libro: aprilo/chiudilo
        }
    } else {
        // Mani libere: interazioni col mondo (il primo colpito abbastanza vicino).
        // Grabbabile (E): es. telecomando.
        for (const g of grabbables) {
            const hits = raycaster.intersectObject(g.object, true);
            if (hits.length > 0 && hits[0].distance < GRAB_DISTANCE) {
                lookAction = 'grab';
                lookTarget = g;
                break;
            }
        }
        // Sedersi (LMB): divano, poltrona, sedia scrivania.
        if (!lookAction) {
            for (const s of sittables) {
                const hits = raycaster.intersectObject(s.object, true);
                if (hits.length > 0 && hits[0].distance < GRAB_DISTANCE) {
                    lookAction = 'sit';
                    lookTarget = s;
                    break;
                }
            }
        }
        // Decor interagibile (LMB): radio, lampada, orologio, libreria, pianta, quadri.
        if (!lookAction) {
            for (const it of interactables) {
                const hits = raycaster.intersectObject(it.object, true);
                if (hits.length > 0 && hits[0].distance < (it.range || GRAB_DISTANCE)) {
                    lookAction = 'interact';
                    lookTarget = it;
                    break;
                }
            }
        }
    }

    // I suggerimenti "guarda l'oggetto" hanno un riquadro tutto loro (#lookTip) SOPRA quello
    // delle battute, e si vedono SEMPRE: anche mentre nel riquadro principale scorre una battuta.
    if (lookAction === 'tv') {
        showLookTip('[LMB] Use the TV');
    } else if (lookAction === 'book') {
        showLookTip('[LMB] ' + (heldObject.isOpen ? 'Close book' : 'Open book'));
    } else if (lookAction === 'sit') {
        showLookTip('[LMB] Sit');
    } else if (lookAction === 'interact') {
        showLookTip(lookTarget.fallen ? '[LMB] Fix plant' : '[LMB] Interact');
    } else if (lookAction === 'grab') {
        showLookTip('[E] ' + lookTarget.name);
    } else {
        hideLookTip();
    }
    if (crosshairEl) crosshairEl.classList.toggle('active', lookAction !== null);   // mirino: anello se miri qualcosa
}


// ------------------------------------------------------------
// ALZATA DAL DIVANO (SEATED -> EXPLORE)
// ------------------------------------------------------------
const STAND_TARGET = { x: 0, y: STANDING_HEIGHT, z: -2.4 };

function updateStandingUp(delta) {
    const k = Math.min(1, delta * 6);
    camera.position.x += (STAND_TARGET.x - camera.position.x) * k;
    camera.position.y += (STAND_TARGET.y - camera.position.y) * k;
    camera.position.z += (STAND_TARGET.z - camera.position.z) * k;

    const dx = STAND_TARGET.x - camera.position.x;
    const dy = STAND_TARGET.y - camera.position.y;
    const dz = STAND_TARGET.z - camera.position.z;
    if (Math.hypot(dx, dy, dz) < 0.03) {
        camera.position.set(STAND_TARGET.x, STAND_TARGET.y, STAND_TARGET.z);
        gameState = 'EXPLORE';
        turnOnTV();
        startRemotePhase();   // appena ti alzi parte subito la fase "telecomando" (prompt 10s)
    }
}


// ------------------------------------------------------------
// SEDERSI (in-game): divano, poltrona, sedia scrivania
// Ogni sittable: oggetto + posa da seduto (sitPos, sitYaw) + posizione in piedi
// dove ci si rialza (standPos). LMB per sederti, WASD per rialzarti.
// ------------------------------------------------------------
const sittables = [];
let currentSit = null;            // su quale sittable sei seduto / ti stai sedendo

function addSittable(object, sitPos, sitYaw, standPos, message) {
    sittables.push({ object: object, sitPos: sitPos, sitYaw: sitYaw, standPos: standPos, message: message });
}

function startSitting(s) {
    currentSit = s;
    gameState = 'SIT_DOWN';
    hideLookTip();   // esci da EXPLORE: via il "[LMB] Sit"

    if (remotePhase) endRemotePhase();   // sederti durante la fase la chiude (niente "do nothing")
}

// SIT_DOWN: la camera scivola sulla seduta e si gira verso sitYaw.
function updateSitDown(delta) {
    const k = Math.min(1, delta * 5);
    const t = currentSit.sitPos;
    camera.position.x += (t.x - camera.position.x) * k;
    camera.position.y += (t.y - camera.position.y) * k;
    camera.position.z += (t.z - camera.position.z) * k;
    const targetYaw = nearestAngle(currentSit.sitYaw, yaw);
    yaw += (targetYaw - yaw) * k;
    pitch += (0 - pitch) * k;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    if (Math.hypot(t.x - camera.position.x, t.y - camera.position.y, t.z - camera.position.z) < 0.03) {
        camera.position.set(t.x, t.y, t.z);
        yaw = currentSit.sitYaw;
        pitch = 0;
        camera.rotation.set(0, yaw, 0, 'YXZ');
        gameState = 'SITTING';
        if (currentSit.message) {
            showObjectDialogue(currentSit.message);   // battuta del "padrone di casa" appena ti siedi
        } else {
            showTempTooltip('Press WASD to get up');
        }
    }
}

// STAND_FROM_SIT: la camera torna in piedi davanti alla seduta, poi EXPLORE.
function updateStandFromSit(delta) {
    const k = Math.min(1, delta * 5);
    const t = currentSit.standPos;
    camera.position.x += (t.x - camera.position.x) * k;
    camera.position.y += (t.y - camera.position.y) * k;
    camera.position.z += (t.z - camera.position.z) * k;

    if (Math.hypot(t.x - camera.position.x, t.y - camera.position.y, t.z - camera.position.z) < 0.03) {
        camera.position.set(t.x, t.y, t.z);
        gameState = 'EXPLORE';
        currentSit = null;
    }
}


// ------------------------------------------------------------
// MOVIMENTO (EXPLORE): WASD + collisioni + sprint/crouch
// ------------------------------------------------------------
const WALK_SPEED = 3.0;
const SPRINT_SPEED = 5.5;
const CROUCH_SPEED = 1.5;

function updateMovement(delta) {
    const crouching = isCrouching;
    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];

    let currentSpeed = WALK_SPEED;
    if (crouching) {
        currentSpeed = CROUCH_SPEED;
    } else if (sprinting) {
        currentSpeed = SPRINT_SPEED;
    }

    const distance = currentSpeed * delta;
    const oldX = camera.position.x;
    const oldZ = camera.position.z;

    let moveX = 0;
    let moveZ = 0;
    if (keys['KeyW']) { moveX += -Math.sin(yaw); moveZ += -Math.cos(yaw); }
    if (keys['KeyS']) { moveX +=  Math.sin(yaw); moveZ +=  Math.cos(yaw); }
    if (keys['KeyD']) { moveX +=  Math.cos(yaw); moveZ += -Math.sin(yaw); }
    if (keys['KeyA']) { moveX += -Math.cos(yaw); moveZ +=  Math.sin(yaw); }

    const length = Math.hypot(moveX, moveZ);
    if (length > 0) {
        moveX = (moveX / length) * distance;
        moveZ = (moveZ / length) * distance;
    }

    let newX = oldX + moveX;
    let newZ = oldZ + moveZ;

    const limit = ROOM_HALF - 0.4;
    newX = Math.max(-limit, Math.min(limit, newX));
    newZ = Math.max(-limit, Math.min(limit, newZ));

    // Blocca solo i movimenti che ENTRANO in un ingombro partendo da fuori.
    // Se sei gia' dentro (es. appena alzato da una sedia che ora ha il collider),
    // puoi comunque uscire: niente "intrappolamento".
    const alreadyInside = collidesWithFurniture(oldX, oldZ);
    if (!alreadyInside && collidesWithFurniture(newX, oldZ)) newX = oldX;
    if (!alreadyInside && collidesWithFurniture(newX, newZ)) newZ = oldZ;

    camera.position.x = newX;
    camera.position.z = newZ;
    if (camera.position.x !== oldX || camera.position.z !== oldZ) startLoop('footsteps'); else pauseLoop('footsteps');   // passi solo se ti muovi davvero

    const targetHeight = crouching ? CROUCH_HEIGHT : STANDING_HEIGHT;
    camera.position.y += (targetHeight - camera.position.y) * Math.min(1, delta * 12);
}


// ------------------------------------------------------------
// ZOOM SULLA TV (camera "agganciata" allo schermo)
// ------------------------------------------------------------
// Sceglie l'angolo equivalente a 'target' piu' vicino a 'current'
// (evita giri di 360 gradi durante la rotazione).
function nearestAngle(target, current) {
    let a = target;
    while (a - current > Math.PI) a -= 2 * Math.PI;
    while (a - current < -Math.PI) a += 2 * Math.PI;
    return a;
}

function startTvZoom() {
    playSound('zoomIn');
    pauseLoop('tvStatic');     // niente fruscio statico dentro il menu
    pauseLoop('footsteps');
    returnState = {
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        yaw: yaw, pitch: pitch,
    };
    tvTargetYaw = nearestAngle(Math.PI, yaw);   // guardare verso lo schermo (+z)
    clearTempTooltips();   // niente tooltip di gioco (es. battute in coda) sopra il menu TV
    hideLookTip();         // e nemmeno il "[LMB] Use the TV"
    gameState = 'TV_ZOOM';
}

function updateTvZoom(delta) {
    const k = Math.min(1, delta * 4);
    camera.position.x += (TV_VIEW_POS.x - camera.position.x) * k;
    camera.position.y += (TV_VIEW_POS.y - camera.position.y) * k;
    camera.position.z += (TV_VIEW_POS.z - camera.position.z) * k;
    yaw += (tvTargetYaw - yaw) * k;
    pitch += (0 - pitch) * k;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    if (Math.abs(camera.position.z - TV_VIEW_POS.z) < 0.02) {
        camera.position.set(TV_VIEW_POS.x, TV_VIEW_POS.y, TV_VIEW_POS.z);
        yaw = tvTargetYaw;
        pitch = 0;
        camera.rotation.set(0, yaw, 0, 'YXZ');
        gameState = 'TV_MENU';
        enterTvMenu();
    }
}

function updateTvZoomOut(delta) {
    const k = Math.min(1, delta * 4);
    camera.position.x += (returnState.x - camera.position.x) * k;
    camera.position.y += (returnState.y - camera.position.y) * k;
    camera.position.z += (returnState.z - camera.position.z) * k;
    yaw += (returnState.yaw - yaw) * k;
    pitch += (returnState.pitch - pitch) * k;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    if (Math.abs(camera.position.z - returnState.z) < 0.02) {
        camera.position.set(returnState.x, returnState.y, returnState.z);
        yaw = returnState.yaw;
        pitch = returnState.pitch;
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        gameState = 'EXPLORE';
        startLoop('tvStatic');   // la statica (col suo fruscio) torna in EXPLORE
        showTempTooltip("Well, now that you checked out my work, feel free to play around with the items in my room!");   // uscito dalla TV
    }
}


// ------------------------------------------------------------
// MENU DELLA TV (overlay HTML, cursore libero)
// ------------------------------------------------------------
function enterTvMenu() {
    document.exitPointerLock();        // libera il cursore per usare il menu
    tvUi.classList.remove('hidden');
    tvMenu.classList.remove('hidden');
    tvPage.classList.add('hidden');
    tvBack.classList.add('hidden');
    selectedIndex = 0;
    highlightMenu();
}

function highlightMenu() {
    tvItems.forEach((item, i) => item.classList.toggle('selected', i === selectedIndex));
}

function moveMenuSelection(step) {
    selectedIndex = (selectedIndex + step + tvItems.length) % tvItems.length;
    highlightMenu();
    playSound('navBlip');
}

function openPage(index) {
    playSound('click');
    // Quando l'iframe ha caricato, nascondiamo nav/footer aggiungendo .tv-mode
    // dal genitore (stessa origine). E' piu' robusto del parametro ?view=tv,
    // che il server puo' perdere nei redirect "URL puliti".
    tvFrame.onload = () => {
        try { tvFrame.contentDocument.body.classList.add('tv-mode'); } catch (e) {}
    };
    tvFrame.src = tvItems[index].dataset.page;
    tvMenu.classList.add('hidden');
    tvPage.classList.remove('hidden');
    tvBack.classList.remove('hidden');
    gameState = 'TV_PAGE';
}

function backToMenu() {
    tvFrame.src = 'about:blank';        // scarica la pagina
    tvPage.classList.add('hidden');
    tvMenu.classList.remove('hidden');
    tvBack.classList.add('hidden');
    gameState = 'TV_MENU';
}

function exitTv() {
    playSound('zoomOut');
    tvUi.classList.add('hidden');
    returningToRoom = true;
    document.body.requestPointerLock();   // il click ri-aggancia il mouse, poi parte lo zoom-out
}

// Mouse: passare sopra una voce la seleziona, il click la apre.
tvItems.forEach((item, i) => {
    item.addEventListener('mouseenter', () => { selectedIndex = i; highlightMenu(); playSound('navBlip'); });
    item.addEventListener('click', () => openPage(i));
});
tvBack.addEventListener('click', backToMenu);
tvExit.addEventListener('click', exitTv);


// ------------------------------------------------------------
// AGGIORNAMENTO PER STATO
// ------------------------------------------------------------
function update(delta) {
    if (!isLocked) return;

    if (gameState === 'STANDING_UP') {
        updateStandingUp(delta);
    } else if (gameState === 'EXPLORE') {
        updateMovement(delta);
        updateInteraction();
    } else if (gameState === 'TV_ZOOM') {
        updateTvZoom(delta);
    } else if (gameState === 'TV_ZOOM_OUT') {
        updateTvZoomOut(delta);
    } else if (gameState === 'SIT_DOWN') {
        updateSitDown(delta);
    } else if (gameState === 'STAND_FROM_SIT') {
        updateStandFromSit(delta);
    }
    // SEATED e TV_VIEW: posizione fissa.

    // Mouse look: applicato una volta per frame (non durante la TV).
    if (gameState === 'SEATED' || gameState === 'STANDING_UP' || gameState === 'EXPLORE' ||
        gameState === 'SITTING' || gameState === 'STAND_FROM_SIT') {
        applyMouseLook();
    }
}


// ------------------------------------------------------------
// GAME LOOP
// ------------------------------------------------------------
const clock = new THREE.Clock();

// --- Tempo di GIOCO: avanza solo quando NON sei in pausa (pointer lock perso). ---
let gameTime = 0;            // ms di gioco totali (per finestre come i click ravvicinati sulla pianta)
const gameTimers = [];       // timer in tempo di gioco: { remaining, callback }

// Come setTimeout, ma in tempo di GIOCO (si congela in pausa). Restituisce un handle annullabile.
function gameTimeout(callback, ms) {
    const timer = { remaining: ms, callback: callback };
    gameTimers.push(timer);
    return timer;
}

function cancelGameTimeout(timer) {
    const i = gameTimers.indexOf(timer);
    if (i !== -1) gameTimers.splice(i, 1);
}

function updateGameTimers(delta) {
    const ms = delta * 1000;
    gameTime += ms;
    for (let i = gameTimers.length - 1; i >= 0; i--) {
        gameTimers[i].remaining -= ms;
        if (gameTimers[i].remaining <= 0) {
            const callback = gameTimers[i].callback;
            gameTimers.splice(i, 1);
            callback();
        }
    }
}

// --- Nudge se il player resta fermo (nessun input) per 15s mentre gironzola ---
let lastActivityTime = 0;   // tempo di gioco dell'ultimo input del player
['mousemove', 'mousedown', 'keydown'].forEach((ev) => {
    document.addEventListener(ev, () => { lastActivityTime = gameTime; });
});

function updateIdleNudge() {
    if (gameState !== 'EXPLORE') return;            // solo in esplorazione libera
    if (gameTime - lastActivityTime > 15000) {
        showTempTooltip("Ehi, we don't have all day you know?");
        lastActivityTime = gameTime;                // riparte il conteggio (ri-nudge se resta fermo)
    }
}

function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);   // tetto anti-teletrasporto

    // In pausa (pointer lock perso) il tempo di gioco e' 0: non aggiorniamo nulla del gioco.
    if (isLocked) {
        update(delta);
        updateStatic();   // anima sempre la statica (la TV la mostra solo da accesa; il monitor sempre)
        updateShake(delta);
        updatePlantTilt(delta);
        updateGameTimers(delta);
        updateIdleNudge();   // nudge se il player resta fermo da 15s
    }

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);


// ------------------------------------------------------------
// RIDIMENSIONAMENTO FINESTRA
// ------------------------------------------------------------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
