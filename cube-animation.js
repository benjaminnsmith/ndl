// Add required scripts
const loadScript = (url) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

// Function to wait for element
const waitForElement = (selector) => {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
};

// Scene setup
let scene, camera, renderer, controls;
let cubes = [];
let depthMap = null;
let imageData = null;

// GUI controls
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

// Function to wait for scripts to load
const loadScripts = async () => {
    try {
        await Promise.all([
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'),
            loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.7/dat.gui.min.js')
        ]);
        return true;
    } catch (error) {
        console.error('Error loading scripts:', error);
        return false;
    }
};

// Initialize the scene
async function init() {
    try {
        // Wait for scripts to load
        const scriptsLoaded = await loadScripts();
        if (!scriptsLoaded) {
            console.error('Failed to load required scripts');
            return;
        }

        // Wait for required elements
        const [workSection, canvasContainer] = await Promise.all([
            waitForElement('.work-section'),
            waitForElement('.canvas')
        ]);

        if (!workSection || !canvasContainer) {
            console.error('Required elements not found after waiting');
            return;
        }

        console.log('Initializing scene...');
        
        // Scene setup
        scene = new THREE.Scene();
        
        // Get container dimensions
        const width = workSection.clientWidth;
        const height = workSection.clientHeight;
        
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
        
        // Add canvas to the canvas div
        canvasContainer.appendChild(renderer.domElement);

        // Add OrbitControls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = false;
        controls.enablePan = true;
        controls.enableRotate = true;

        // Limit controls
        controls.target.set(0, 0, 0);
        controls.minDistance = 2;
        controls.maxDistance = 10;
        controls.maxPolarAngle = Math.PI / 2;

        // Setup GUI
        const gui = new dat.GUI({ autoPlace: false });
        gui.domElement.style.position = 'absolute';
        gui.domElement.style.top = '20px';
        gui.domElement.style.right = '20px';
        workSection.appendChild(gui.domElement);

        gui.add(params, 'cubeDensity', 0, 1).onChange(updateCubes);
        gui.add(params, 'rotationSpeed', 0, 2);
        gui.add(params, 'pulseStrength', 0, 1);
        gui.add(params, 'zDepthMultiplier', 0, 2);
        gui.add(params, 'cubeSize', 0.1, 2);
        gui.add(params, 'contrastThreshold', 0, 1).onChange(updateCubes);
        
        const colorModeFolder = gui.addFolder('Color Settings');
        colorModeFolder.add(params, 'colorMode', ['monochrome', 'sampled', 'custom']);
        colorModeFolder.addColor(params, 'customColor');

        // Create file input
        await createFileInput(workSection);

        // Handle window resize
        window.addEventListener('resize', () => {
            const width = workSection.clientWidth;
            const height = workSection.clientHeight;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        });

        // Start animation
        animate();
        
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Modified createFileInput to return a promise
function createFileInput(workSection) {
    return new Promise((resolve, reject) => {
        if (!workSection) {
            reject(new Error('Work section not found'));
            return;
        }

        try {
            // Create file input element
            const fileInput = document.createElement('input');
            if (!fileInput) {
                reject(new Error('Failed to create file input element'));
                return;
            }

            // Configure file input
            fileInput.type = 'file';
            fileInput.id = 'image-upload';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';

            // Create label
            const label = document.createElement('label');
            label.htmlFor = 'image-upload';
            label.className = 'upload-label';
            label.innerHTML = '<span class="upload-icon">📁</span>Choose Image';

            // Create container
            const container = document.createElement('div');
            container.id = 'file-input';

            // Add event listener before appending to DOM
            fileInput.addEventListener('change', handleFileUpload);

            // Append elements
            container.appendChild(fileInput);
            container.appendChild(label);
            workSection.appendChild(container);

            resolve(container);
        } catch (error) {
            reject(error);
        }
    });
}

function handleFileUpload(e) {
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
}

// Process image and create depth map
function processImage(image) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
    
    ctx.drawImage(image, 0, 0);
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    depthMap = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        depthMap[i / 4] = (r + g + b) / (255 * 3);
    }
    
    updateCubes();
}

// Update cubes based on current parameters
function updateCubes() {
    if (!scene) return;
    
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

    const indices = new Uint16Array([
        // Front face
        0, 1, 1, 2, 2, 3, 3, 0,
        // Back face
        4, 5, 5, 6, 6, 7, 7, 4,
        // Connecting edges
        0, 4, 1, 5, 2, 6, 3, 7
    ]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    let material;
    if (params.colorMode === 'monochrome') {
        material = new THREE.LineBasicMaterial({ color: 0xffffff });
    } else if (params.colorMode === 'sampled' && imageData) {
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

    const cube = new THREE.LineSegments(geometry, material);
    cube.scale.set(params.cubeSize, params.cubeSize, params.cubeSize);
    
    cube.userData.rotationSpeed = {
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02
    };
    
    return cube;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (!scene || !camera || !renderer || cubes.length === 0) return;

    const time = Date.now() * 0.001;

    cubes.forEach(cube => {
        // Rotation
        cube.rotation.x += cube.userData.rotationSpeed.x * params.rotationSpeed;
        cube.rotation.y += cube.userData.rotationSpeed.y * params.rotationSpeed;
        cube.rotation.z += cube.userData.rotationSpeed.z * params.rotationSpeed;

        // Pulse animation
        const scale = 1 + Math.sin(time * 2) * params.pulseStrength * 0.2;
        cube.scale.set(scale * params.cubeSize, scale * params.cubeSize, scale * params.cubeSize);
    });

    controls.update();
    renderer.render(scene, camera);
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init().catch(error => {
            console.error('Failed to initialize:', error);
        });
    });
} else {
    init().catch(error => {
        console.error('Failed to initialize:', error);
    });
} 
