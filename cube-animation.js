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

// Initialize everything once dependencies are loaded
const initialize = () => {
    // Wait for all scripts and work-section to load before initializing
    Promise.all([
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'),
        loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'),
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.7/dat.gui.min.js'),
        waitForElement('.work-section'),
        waitForElement('.canvas')
    ]).then(([,,, workSection, canvasContainer]) => {
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

        // Handle window resize
        function onWindowResize() {
            const width = workSection.clientWidth;
            const height = workSection.clientHeight;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }

        // Initialize the scene
        function init() {
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

            // Add file input if it doesn't exist
            if (!document.getElementById('image-upload')) {
                createFileInput();
            }

            // Add window resize listener
            window.addEventListener('resize', onWindowResize, false);
            
            console.log('Initialization complete');
        }

        function createFileInput() {
            if (!document.querySelector('.work-section')) {
                console.error('Work section not found');
                return;
            }

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'image-upload';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            
            const label = document.createElement('label');
            label.htmlFor = 'image-upload';
            label.className = 'upload-label';
            label.innerHTML = '<span class="upload-icon">📁</span>Choose Image';
            
            const container = document.createElement('div');
            container.id = 'file-input';
            container.appendChild(fileInput);
            container.appendChild(label);
            
            const workSection = document.querySelector('.work-section');
            workSection.appendChild(container);
            
            fileInput.addEventListener('change', handleFileUpload);
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

            const time = Date.now() * 0.001;

            cubes.forEach(cube => {
                // Rotation
                cube.rotation.x += cube.userData.rotationSpeed.x * params.rotationSpeed;
                cube.rotation.y += cube.userData.rotationSpeed.y * params.rotationSpeed;
                cube.rotation.z += cube.userData.rotationSpeed.z * params.rotationSpeed;

                // Pulse animation
                const scale = 1 + Math.sin(time * 2) * params.pulseStrength * 0.2;
                cube.scale.set(scale, scale, scale);
            });

            controls.update();
            renderer.render(scene, camera);
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

        // Initialize and start animation
        init();
        animate();
    }).catch(error => {
        console.error('Error loading scripts or finding elements:', error);
    });
};

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
} 
