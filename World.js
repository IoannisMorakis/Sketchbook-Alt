//<script src="src/ts/world/World.js" type= "module" style="display: none;" ></script>
//<script src="build/sketchbook.min.js" style="display: none;"></script>
import * as THREE from './node_modules/three/src/Three';
import * as CANNON from './src/lib/cannon';
import Swal from './node_modules/sweetalert2';

//
import { CameraOperator } from './src/ts/core/CameraOperator';
import { EffectComposer } from './node_modules/three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from './node_modules/three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from './node_modules/three/examples/jsm/postprocessing/ShaderPass';
import { FXAAShader  } from './node_modules/three/examples/jsm/shaders/FXAAShader';

import { Detector } from './src/lib/utils/Detector';
import { Stats } from './src/lib/utils/Stats';
import * as GUI from './src/lib/utils/dat.gui';
import { CannonDebugRenderer } from './src/lib/cannon/CannonDebugRenderer';
import * as _ from './node_modules/@types/lodash/ts3.1/index';

import { InputManager } from './src/ts/core/InputManager';
import * as Utils from './src/ts/core/FunctionLibrary';
import { LoadingManager } from './src/ts/core/LoadingManager';
import { InfoStack } from './src/ts/core/InfoStack';
import { UIManager } from './src/ts/core/UIManager';
import { IWorldEntity } from './src/ts/interfaces/IWorldEntity';
import { IUpdatable } from './src/ts/interfaces/IUpdatable';
import { Character } from './src/ts/characters/Character';
import { Path } from './src/ts/world/Path';
import { CollisionGroups } from './src/ts/enums/CollisionGroups';
import { BoxCollider } from './src/ts/physics/colliders/BoxCollider';
import { TrimeshCollider } from './src/ts/physics/colliders/TrimeshCollider';
import { Vehicle } from './src/ts/vehicles/Vehicle';
import { Scenario } from './src/ts/world/Scenario';
import { Sky } from './src/ts/world/Sky';
import { Ocean } from './src/ts/world/Ocean';

export class World
{

	constructor(worldScenePath)
	{
		const scope = this;

		// WebGL not supported
		if (!Detector.webgl)
		{
			Swal.fire({
				icon: 'warning',
				title: 'WebGL compatibility',
				text: 'This browser doesn\'t seem to have the required WebGL capabilities. The application may not work correctly.',
				footer: '<a href="https://get.webgl.org/" target="_blank">Click here for more information</a>',
				showConfirmButton: false,
				buttonsStyling: false
			});
		}

		// Renderer
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.0;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		document.body.appendChild(this.renderer.domElement);
		this.renderer.domElement.id = 'canvas';

		// Auto window resize
		function onWindowResize()
		{
			scope.camera.aspect = window.innerWidth / window.innerHeight;
			scope.camera.updateProjectionMatrix();
			scope.renderer.setSize(window.innerWidth, window.innerHeight);
			fxaaPass.uniforms['resolution'].value.set(1 / (window.innerWidth * pixelRatio), 1 / (window.innerHeight * pixelRatio));
			scope.composer.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
		}
		window.addEventListener('resize', onWindowResize, false);

		// Three.js scene
		this.graphicsWorld = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1010);

		// Passes
		let renderPass = new RenderPass( this.graphicsWorld, this.camera );
		let fxaaPass = new ShaderPass( FXAAShader );

		// FXAA
		let pixelRatio = this.renderer.getPixelRatio();
		fxaaPass.material['uniforms'].resolution.value.x = 1 / ( window.innerWidth * pixelRatio );
		fxaaPass.material['uniforms'].resolution.value.y = 1 / ( window.innerHeight * pixelRatio );

		// Composer
		this.composer = new EffectComposer( this.renderer );
		this.composer.addPass( renderPass );
		this.composer.addPass( fxaaPass );

		// Physics
		this.physicsWorld = new CANNON.World();
		this.physicsWorld.gravity.set(0, -9.81, 0);
		this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
		this.physicsWorld.solver.iterations = 10;
		this.physicsWorld.allowSleep = true;

		this.parallelPairs = [];
		this.physicsFrameRate = 60;
		this.physicsFrameTime = 1 / this.physicsFrameRate;
		this.physicsMaxPrediction = this.physicsFrameRate;

		// RenderLoop
		this.clock = new THREE.Clock();
		this.renderDelta = 0;
		this.logicDelta = 0;
		this.sinceLastFrame = 0;
		this.justRendered = false;

		// Stats (FPS, Frame time, Memory)
		this.stats = Stats();
		// Create right panel GUI
		this.createParamsGUI(scope);

		// Initialization
		this.inputManager = new InputManager(this, this.renderer.domElement);
		this.cameraOperator = new CameraOperator(this, this.camera, this.params.Mouse_Sensitivity);
		this.sky = new Sky(this);
		
		// Load scene if path is supplied
		if (worldScenePath !== undefined)
		{
			let loadingManager = new LoadingManager(this);
			loadingManager.onFinishedCallback = () =>
			{
				this.update(1, 1);
				this.setTimeScale(1);
	
				Swal.fire({
					title: 'Welcome to Sketchbook!',
					text: 'Feel free to explore the world and interact with available vehicles. There are also various scenarios ready to launch from the right panel.',
					footer: '<a href="https://github.com/swift502/Sketchbook" target="_blank">GitHub page</a><a href="https://discord.gg/fGuEqCe" target="_blank">Discord server</a>',
					confirmButtonText: 'Okay',
					buttonsStyling: false,
					onClose: () => {
						UIManager.setUserInterfaceVisible(true);
					}
				});
			};
			loadingManager.loadGLTF(worldScenePath, (gltf) =>
				{
					this.loadScene(loadingManager, gltf);
				}
			);
		}
		else
		{
			UIManager.setUserInterfaceVisible(true);
			UIManager.setLoadingScreenVisible(false);
			Swal.fire({
				icon: 'success',
				title: 'Hello world!',
				text: 'Empty Sketchbook world was succesfully initialized. Enjoy the blueness of the sky.',
				buttonsStyling: false
			});
		}

		this.render(this);
	}

	// Update
	// Handles all logic updates.
	update(timeStep, unscaledTimeStep)
	{
		this.updatePhysics(timeStep);

		// Update registred objects
		this.updatables.forEach((entity) => {
			entity.update(timeStep, unscaledTimeStep);
		});

		// Lerp time scale
		this.params.Time_Scale = THREE.MathUtils.lerp(this.params.Time_Scale, this.timeScaleTarget, 0.2);

		// Physics debug
		if (this.params.Debug_Physics) this.cannonDebugRenderer.update();
	}

	 updatePhysics(timeStep)
	{
		// Step the physics world
		this.physicsWorld.step(this.physicsFrameTime, timeStep);

		this.characters.forEach((char) => {
			if (this.isOutOfBounds(char.characterCapsule.body.position))
			{
				this.outOfBoundsRespawn(char.characterCapsule.body);
			}
		});

		this.vehicles.forEach((vehicle) => {
			if (this.isOutOfBounds(vehicle.rayCastVehicle.chassisBody.position))
			{
				let worldPos = new THREE.Vector3();
				vehicle.spawnPoint.getWorldPosition(worldPos);
				worldPos.y += 1;
				this.outOfBoundsRespawn(vehicle.rayCastVehicle.chassisBody, Utils.cannonVector(worldPos));
			}
		});
	}

     isOutOfBounds(position)
	{
		let inside = position.x > -211.882 && position.x < 211.882 &&
					position.z > -169.098 && position.z < 153.232 &&
					position.y > 0.107;
		let belowSeaLevel = position.y < 14.989;

		return !inside && belowSeaLevel;
	}

	outOfBoundsRespawn(body, position)
	{
		let newPos = position || new CANNON.Vec3(0, 16, 0);
		let newQuat = new CANNON.Quaternion(0, 0, 0, 1);

		body.position.copy(newPos);
		body.interpolatedPosition.copy(newPos);
		body.quaternion.copy(newQuat);
		body.interpolatedQuaternion.copy(newQuat);
		body.velocity.setZero();
		body.angularVelocity.setZero();
	}

	/**
	 * Rendering loop.
	 * Implements fps limiter and frame-skipping
	 * Calls world's "update" function before rendering.
	 * @param {World} world 
	 */
	 render(world)
	{
		this.requestDelta = this.clock.getDelta();

		requestAnimationFrame(() =>
		{
			world.render(world);
		});

		// Getting timeStep
		let unscaledTimeStep = (this.requestDelta + this.renderDelta + this.logicDelta) ;
		let timeStep = unscaledTimeStep * this.params.Time_Scale;
		timeStep = Math.min(timeStep, 1 / 30);    // min 30 fps

		// Logic
		world.update(timeStep, unscaledTimeStep);

		// Measuring logic time
		this.logicDelta = this.clock.getDelta();

		// Frame limiting
		let interval = 1 / 60;
		this.sinceLastFrame += this.requestDelta + this.renderDelta + this.logicDelta;
		this.sinceLastFrame %= interval;

		// Stats end
		this.stats.end();
		this.stats.begin();

		// Actual rendering with a FXAA ON/OFF switch
		if (this.params.FXAA) this.composer.render();
		else this.renderer.render(this.graphicsWorld, this.camera);

		// Measuring render time
		this.renderDelta = this.clock.getDelta();
	}

	 setTimeScale(value)
	{
		this.params.Time_Scale = value;
		this.timeScaleTarget = value;
	}

	 add(worldEntity)
	{
		worldEntity.addToWorld(this);
		this.registerUpdatable(worldEntity);
	}

	 registerUpdatable(registree)
	{
		this.updatables.push(registree);
		this.updatables.sort((a, b) => (a.updateOrder > b.updateOrder) ? 1 : -1);
	}

	 remove(worldEntity)
	{
		worldEntity.removeFromWorld(this);
		this.unregisterUpdatable(worldEntity);
	}

	 unregisterUpdatable(registree)
	{
		_.pull(this.updatables, registree);
	}

	 loadScene(loadingManager, gltf)
	{
		gltf.scene.traverse((child) => {
			if (child.hasOwnProperty('userData'))
			{
				if (child.type === 'Mesh')
				{
					Utils.setupMeshProperties(child);
					this.sky.csm.setupMaterial(child.material);

					if (child.material.name === 'ocean')
					{
						this.registerUpdatable(new Ocean(child, this));
					}
				}

				if (child.userData.hasOwnProperty('data'))
				{
					if (child.userData.data === 'physics')
					{
						if (child.userData.hasOwnProperty('type')) 
						{
							// Convex doesn't work! Stick to boxes!
							if (child.userData.type === 'box')
							{
								let phys = new BoxCollider({size: new THREE.Vector3(child.scale.x, child.scale.y, child.scale.z)});
								phys.body.position.copy(Utils.cannonVector(child.position));
								phys.body.quaternion.copy(Utils.cannonQuat(child.quaternion));
								phys.body.computeAABB();

								phys.body.shapes.forEach((shape) => {
									shape.collisionFilterMask = ~CollisionGroups.TrimeshColliders;
								});

								this.physicsWorld.addBody(phys.body);
							}
							else if (child.userData.type === 'trimesh')
							{
								let phys = new TrimeshCollider(child, {});
								this.physicsWorld.addBody(phys.body);
							}

							child.visible = false;
						}
					}

					if (child.userData.data === 'path')
					{
						this.paths.push(new Path(child));
					}

					if (child.userData.data === 'scenario')
					{
						this.scenarios.push(new Scenario(child, this));
					}
				}
			}
		});

		this.graphicsWorld.add(gltf.scene);

		// Launch default scenario
		let defaultScenarioID;
		for (const scenario of this.scenarios) {
			if (scenario.default) {
				defaultScenarioID = scenario.id;
				break;
			}
		}
		if (defaultScenarioID !== undefined) this.launchScenario(defaultScenarioID, loadingManager);
	}
	
	 launchScenario(scenarioID, loadingManager)
	{
		this.lastScenarioID = scenarioID;

		this.clearEntities();

		// Launch default scenario
		if (!loadingManager) loadingManager = new LoadingManager(this);
		for (const scenario of this.scenarios) {
			if (scenario.id === scenarioID || scenario.spawnAlways) {
				scenario.launch(loadingManager, this);
			}
		}
	}

	 restartScenario()
	{
		if (this.lastScenarioID !== undefined)
		{
			document.exitPointerLock();
			this.launchScenario(this.lastScenarioID);
		}
		else
		{
			console.warn('Can\'t restart scenario. Last scenarioID is undefined.');
		}
	}

	 clearEntities()
	{
		for (let i = 0; i < this.characters.length; i++) {
			this.remove(this.characters[i]);
			i--;
		}

		for (let i = 0; i < this.vehicles.length; i++) {
			this.remove(this.vehicles[i]);
			i--;
		}
	}

	 scrollTheTimeScale(scrollAmount)
	{
		// Changing time scale with scroll wheel
		const timeScaleBottomLimit = 0.003;
		const timeScaleChangeSpeed = 1.3;
	
		if (scrollAmount > 0)
		{
			this.timeScaleTarget /= timeScaleChangeSpeed;
			if (this.timeScaleTarget < timeScaleBottomLimit) this.timeScaleTarget = 0;
		}
		else
		{
			this.timeScaleTarget *= timeScaleChangeSpeed;
			if (this.timeScaleTarget < timeScaleBottomLimit) this.timeScaleTarget = timeScaleBottomLimit;
			this.timeScaleTarget = Math.min(this.timeScaleTarget, 1);
		}
	}

	 updateControls(controls)
	{
		let html = '';
		html += '<h2 class="controls-title">Controls:</h2>';

		controls.forEach((row) =>
		{
			html += '<div class="ctrl-row">';
			row.keys.forEach((key) => {
				if (key === '+' || key === 'and' || key === 'or' || key === '&') html += '&nbsp;' + key + '&nbsp;';
				else html += '<span class="ctrl-key">' + key + '</span>';
			});

			html += '<span class="ctrl-desc">' + row.desc + '</span></div>';
		});

		document.getElementById('controls').innerHTML = html;
	}

	 createParamsGUI(scope)
	{
		this.params = {
			Pointer_Lock: true,
			Mouse_Sensitivity: 0.3,
			Time_Scale: 1,
			Shadows: true,
			FXAA: true,
			Debug_Physics: false,
			Debug_FPS: false,
			Sun_Elevation: 50,
			Sun_Rotation: 145,
		};

		const gui = new GUI.GUI();

		// Scenario
		this.scenarioGUIFolder = gui.addFolder('Scenarios');
		this.scenarioGUIFolder.open();

		// World
		let worldFolder = gui.addFolder('World');
		worldFolder.add(this.params, 'Time_Scale', 0, 1).listen()
			.onChange((value) =>
			{
				scope.timeScaleTarget = value;
			});
		worldFolder.add(this.params, 'Sun_Elevation', 0, 180).listen()
			.onChange((value) =>
			{
				scope.sky.phi = value;
			});
		worldFolder.add(this.params, 'Sun_Rotation', 0, 360).listen()
			.onChange((value) =>
			{
				scope.sky.theta = value;
			});

		// Input
		let settingsFolder = gui.addFolder('Settings');
		settingsFolder.add(this.params, 'FXAA');
		settingsFolder.add(this.params, 'Shadows')
			.onChange((enabled) =>
			{
				if (enabled)
				{
					this.sky.csm.lights.forEach((light) => {
						light.castShadow = true;
					});
				}
				else
				{
					this.sky.csm.lights.forEach((light) => {
						light.castShadow = false;
					});
				}
			});
		settingsFolder.add(this.params, 'Pointer_Lock')
			.onChange((enabled) =>
			{
				scope.inputManager.setPointerLock(enabled);
			});
		settingsFolder.add(this.params, 'Mouse_Sensitivity', 0, 1)
			.onChange((value) =>
			{
				scope.cameraOperator.setSensitivity(value, value * 0.8);
			});
		settingsFolder.add(this.params, 'Debug_Physics')
			.onChange((enabled) =>
			{
				if (enabled)
				{
					this.cannonDebugRenderer = new CannonDebugRenderer( this.graphicsWorld, this.physicsWorld );
				}
				else
				{
					this.cannonDebugRenderer.clearMeshes();
					this.cannonDebugRenderer = undefined;
				}

				scope.characters.forEach((char) =>
				{
					char.raycastBox.visible = enabled;
				});
			});
		settingsFolder.add(this.params, 'Debug_FPS')
			.onChange((enabled) =>
			{
				UIManager.setFPSVisible(enabled);
			});

		gui.open();
	}
}