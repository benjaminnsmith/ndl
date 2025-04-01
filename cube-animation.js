// Scene setup
let scene, camera, renderer, controls;
let cubes = [];
let depthMap = null;
let imageData = null;

// GUI controls
const gui = new dat.GUI();
const params = {
    cubeDensity: 0.5,
    rotationSpeed: 0.5,
    pulseStrength: 0.5,
    zDepthMultiplier: 1.0,
    cubeSize: 1.0,
    contrastThreshold: 0.5,
    colorMode: 'monochrome',
    customColor: '#ffffff'
};

// Initialize the scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    
    // Get container dimensions
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Add OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = true;
    controls.enableRotate = true;

    // Setup GUI
    setupGUI();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

// Setup GUI controls
function setupGUI() {
    gui.add(params, 'cubeDensity', 0, 1).onChange(updateCubes);
    gui.add(params, 'rotationSpeed', 0, 2);
    gui.add(params, 'pulseStrength', 0, 1);
    gui.add(params, 'zDepthMultiplier', 0, 2);
    gui.add(params, 'cubeSize', 0.1, 2);
    gui.add(params, 'contrastThreshold', 0, 1).onChange(updateCubes);
    
    const colorModeFolder = gui.addFolder('Color Settings');
    colorModeFolder.add(params, 'colorMode', ['monochrome', 'sampled', 'custom']);
    colorModeFolder.addColor(params, 'customColor');
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Update camera
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Update renderer
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
}

// Process image and create depth map
function processImage(image) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
    
    ctx.drawImage(image, 0, 0);
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Create depth map from image data
    depthMap = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        // Calculate contrast value (simple luminance)
        depthMap[i / 4] = (r + g + b) / (255 * 3);
    }
    
    updateCubes();
}

// Update cubes based on current parameters
function updateCubes() {
    // Clear existing cubes
    cubes.forEach(cube => scene.remove(cube));
    cubes = [];

    if (!depthMap) return;

    const gridSize = Math.floor(20 * params.cubeDensity);
    const stepX = imageData.width / gridSize;
    const stepY = imageData.height / gridSize;

    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            const index = Math.floor(y * stepY) * imageData.width + Math.floor(x * stepX);
            const depth = depthMap[index];

            if (depth > params.contrastThreshold) {
                const cube = createCube(depth);
                cube.position.x = (x - gridSize / 2) * 0.5;
                cube.position.y = (y - gridSize / 2) * 0.5;
                cube.position.z = depth * params.zDepthMultiplier;
                scene.add(cube);
                cubes.push(cube);
            }
        }
    }
}

// Create a single cube
function createCube(depth) {
    // Define vertices for a cube
    const vertices = new Float32Array([
        // Front face
        -0.5, -0.5,  0.5,
         0.5, -0.5,  0.5,
         0.5,  0.5,  0.5,
        -0.5,  0.5,  0.5,
        
        // Back face
        -0.5, -0.5, -0.5,
         0.5, -0.5, -0.5,
         0.5,  0.5, -0.5,
        -0.5,  0.5, -0.5,
    ]);

    // Define indices for connecting vertices (edges)
    const indices = new Uint16Array([
        // Front face
        0, 1, 1, 2, 2, 3, 3, 0,
        // Back face
        4, 5, 5, 6, 6, 7, 7, 4,
        // Connecting edges
        0, 4, 1, 5, 2, 6, 3, 7
    ]);

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    // Create material
    let material;
    if (params.colorMode === 'monochrome') {
        material = new THREE.LineBasicMaterial({ color: 0xffffff });
    } else if (params.colorMode === 'sampled') {
        const index = Math.floor(depth * (imageData.data.length / 4));
        const color = new THREE.Color(
            imageData.data[index * 4] / 255,
            imageData.data[index * 4 + 1] / 255,
            imageData.data[index * 4 + 2] / 255
        );
        material = new THREE.LineBasicMaterial({ color });
    } else {
        material = new THREE.LineBasicMaterial({ color: params.customColor });
    }

    // Create the cube
    const cube = new THREE.LineSegments(geometry, material);
    
    // Scale the cube
    cube.scale.set(params.cubeSize, params.cubeSize, params.cubeSize);
    
    // Set random rotation speeds
    cube.userData.rotationSpeed = {
        x: (Math.random() - 0.5) * params.rotationSpeed,
        y: (Math.random() - 0.5) * params.rotationSpeed,
        z: (Math.random() - 0.5) * params.rotationSpeed
    };
    
    return cube;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;

    cubes.forEach(cube => {
        // Rotation
        cube.rotation.x += cube.userData.rotationSpeed.x;
        cube.rotation.y += cube.userData.rotationSpeed.y;
        cube.rotation.z += cube.userData.rotationSpeed.z;

        // Pulse animation
        const scale = 1 + Math.sin(time * 2) * params.pulseStrength;
        cube.scale.set(scale, scale, scale);
    });

    controls.update();
    renderer.render(scene, camera);
}

// Handle file upload
document.getElementById('image-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                processImage(img);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Initialize and start animation
init();
animate(); 
