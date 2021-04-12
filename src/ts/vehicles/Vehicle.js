import { Character } from '../characters/Character';
import * as THREE from 'three';
import * as CANNON from 'cannon';
import { World } from '../world/World';
//import _ = require('lodash');
import * as _ from 'lodash';
import { KeyBinding } from '../core/KeyBinding';
import { VehicleSeat } from './VehicleSeat';
import { Wheel } from './Wheel';
import { VehicleDoor } from './VehicleDoor';
import * as Utils from '../core/FunctionLibrary';
import { CollisionGroups } from '../enums/CollisionGroups';
import { SwitchingSeats } from '../characters/character_states/vehicles/SwitchingSeats';
import { EntityType } from '../enums/EntityType';
import { IWorldEntity } from '../interfaces/IWorldEntity';

export  class Vehicle extends THREE.Object3D
{
	updateOrder= 2;
	 entityType;
	
	controllingCharacter;
	actions = {};
	rayCastVehicle;
	seats= [];
	wheels= [];
	drive;
	camera;
	world;
	help;
	collision;
	materials= [];
	spawnPoint;
	modelContainer;

	firstPerson= false;

	constructor(gltf, handlingSetup)
	{
		super();

		if (handlingSetup === undefined) handlingSetup = {};
		handlingSetup.chassisConnectionPointLocal = new CANNON.Vec3(),
		handlingSetup.axleLocal = new CANNON.Vec3(-1, 0, 0);
		handlingSetup.directionLocal = new CANNON.Vec3(0, -1, 0);

		// Physics mat
		let mat = new CANNON.Material('Mat');
		mat.friction = 0.01;

		// Collision body
		this.collision = new CANNON.Body({ mass: 50 });
		this.collision.material = mat;

		// Read GLTF
		this.readVehicleData(gltf);

		this.modelContainer = new THREE.Group();
		this.add(this.modelContainer);
		this.modelContainer.add(gltf.scene);
		// this.setModel(gltf.scene);

		// Raycast vehicle component
		this.rayCastVehicle = new CANNON.RaycastVehicle({
			chassisBody: this.collision,
			indexUpAxis: 1,
			indexRightAxis: 0,
			indexForwardAxis: 2
		});

		this.wheels.forEach((wheel) =>
		{
			handlingSetup.chassisConnectionPointLocal.set(wheel.position.x, wheel.position.y + 0.2, wheel.position.z);
			const index = this.rayCastVehicle.addWheel(handlingSetup);
			wheel.rayCastWheelInfoIndex = index;
		});

		this.help = new THREE.AxesHelper(2);
	}

	noDirectionPressed()
	{
		return true;
	}

	update(timeStep)
	{
		this.position.set(
			this.collision.interpolatedPosition.x,
			this.collision.interpolatedPosition.y,
			this.collision.interpolatedPosition.z
		);

		this.quaternion.set(
			this.collision.interpolatedQuaternion.x,
			this.collision.interpolatedQuaternion.y,
			this.collision.interpolatedQuaternion.z,
			this.collision.interpolatedQuaternion.w
		);

		this.seats.forEach((seat) => {
			seat.update(timeStep);
		});

		for (let i = 0; i < this.rayCastVehicle.wheelInfos.length; i++)
		{
			this.rayCastVehicle.updateWheelTransform(i);
			let transform = this.rayCastVehicle.wheelInfos[i].worldTransform;

			let wheelObject = this.wheels[i].wheelObject;
			wheelObject.position.copy(Utils.threeVector(transform.position));
			wheelObject.quaternion.copy(Utils.threeQuat(transform.quaternion));

			let upAxisWorld = new CANNON.Vec3();
			this.rayCastVehicle.getVehicleAxisWorld(this.rayCastVehicle.indexUpAxis, upAxisWorld);
		}

		this.updateMatrixWorld();
	}

	forceCharacterOut()
	{
		this.controllingCharacter.modelContainer.visible = true;
		this.controllingCharacter.exitVehicle();
	}

	onInputChange()
	{
		if (this.actions.seat_switch.justPressed && this.controllingCharacter?.occupyingSeat?.connectedSeats.length > 0)
		{
			this.controllingCharacter.modelContainer.visible = true;
			this.controllingCharacter.setState(
				new SwitchingSeats(
					this.controllingCharacter,
					this.controllingCharacter.occupyingSeat,
					this.controllingCharacter.occupyingSeat.connectedSeats[0]
				)
			);
			this.controllingCharacter.stopControllingVehicle();
		}
	}

	resetControls()
	{
		for (const action in this.actions) {
			if (this.actions.hasOwnProperty(action)) {
				this.triggerAction(action, false);
			}
		}
	}

	allowSleep(value)
	{
		this.collision.allowSleep = value;

		if (value === false)
		{
			this.collision.wakeUp();
		}
	}

	handleKeyboardEvent(event, code, pressed)
	{
		// Free camera
		if (code === 'KeyC' && pressed === true && event.shiftKey === true)
		{
			this.resetControls();
			this.world.cameraOperator.characterCaller = this.controllingCharacter;
			this.world.inputManager.setInputReceiver(this.world.cameraOperator);
		}
		else if (code === 'KeyR' && pressed === true && event.shiftKey === true)
		{
			this.world.restartScenario();
		}
		else
		{
			for (const action in this.actions) {
				if (this.actions.hasOwnProperty(action)) {
					const binding = this.actions[action];

					if (_.includes(binding.eventCodes, code))
					{
						this.triggerAction(action, pressed);
					}
				}
			}
		}
	}

	setFirstPersonView(value)
	{
		this.firstPerson = value;
		if (this.controllingCharacter !== undefined) this.controllingCharacter.modelContainer.visible = !value;

		if (value)
		{
			this.world.cameraOperator.setRadius(0, true);
		}
		else
		{
			this.world.cameraOperator.setRadius(3, true);
		}
	}

	toggleFirstPersonView()
	{
		this.setFirstPersonView(!this.firstPerson);
	}
	
	triggerAction(actionName, value)
	{
		// Get action and set it's parameters
		let action = this.actions[actionName];

		if (action.isPressed !== value)
		{
			// Set value
			action.isPressed = value;

			// Reset the 'just' attributes
			action.justPressed = false;
			action.justReleased = false;

			// Set the 'just' attributes
			if (value) action.justPressed = true;
			else action.justReleased = true;

			this.onInputChange();

			// Reset the 'just' attributes
			action.justPressed = false;
			action.justReleased = false;
		}
	}

	handleMouseButton(event, code, pressed)
	{
		return;
	}

	handleMouseMove(event, deltaX, deltaY)
	{
		this.world.cameraOperator.move(deltaX, deltaY);
	}

	handleMouseWheel(event, value)
	{
		this.world.scrollTheTimeScale(value);
	}

	inputReceiverInit()
	{
		this.collision.allowSleep = false;
		this.setFirstPersonView(false);
	}

	inputReceiverUpdate(timeStep)
	{
		if (this.firstPerson)
		{
			// this.world.cameraOperator.target.set(
			//     this.position.x + this.camera.position.x,
			//     this.position.y + this.camera.position.y,
			//     this.position.z + this.camera.position.z
			// );

			let temp = new THREE.Vector3().copy(this.camera.position);
			temp.applyQuaternion(this.quaternion);
			this.world.cameraOperator.target.copy(temp.add(this.position));
		}
		else
		{
			// Position camera
			this.world.cameraOperator.target.set(
				this.position.x,
				this.position.y + 0.5,
				this.position.z
			);
		}
	}

	setPosition(x, y, z)
	{
		this.collision.position.x = x;
		this.collision.position.y = y;
		this.collision.position.z = z;
	}

	setSteeringValue(val)
	{
		this.wheels.forEach((wheel) =>
		{
			if (wheel.steering) this.rayCastVehicle.setSteeringValue(val, wheel.rayCastWheelInfoIndex);
		});
	}

	applyEngineForce(force)
	{
		this.wheels.forEach((wheel) =>
		{
			if (this.drive === wheel.drive || this.drive === 'awd')
			{
				this.rayCastVehicle.applyEngineForce(force, wheel.rayCastWheelInfoIndex);
			}
		});
	}

	setBrake(brakeForce, driveFilter)
	{
		this.wheels.forEach((wheel) =>
		{
			if (driveFilter === undefined || driveFilter === wheel.drive)
			{
				this.rayCastVehicle.setBrake(brakeForce, wheel.rayCastWheelInfoIndex);
			}
		});
	}

	addToWorld(world)
	{
		if (_.includes(world.vehicles, this))
		{
			console.warn('Adding character to a world in which it already exists.');
		}
		else if (this.rayCastVehicle === undefined)
		{
			console.error('Trying to create vehicle without raycastVehicleComponent');
		}
		else
		{
			this.world = world;
			world.vehicles.push(this);
			world.graphicsWorld.add(this);
			// world.physicsWorld.addBody(this.collision);
			this.rayCastVehicle.addToWorld(world.physicsWorld);

			this.wheels.forEach((wheel) =>
			{
				world.graphicsWorld.attach(wheel.wheelObject);
			});

			this.materials.forEach((mat) =>
			{
				world.sky.csm.setupMaterial(mat);
			});
		}
	}

	removeFromWorld(world)
	{
		if (!_.includes(world.vehicles, this))
		{
			console.warn('Removing character from a world in which it isn\'t present.');
		}
		else
		{
			this.world = undefined;
			_.pull(world.vehicles, this);
			world.graphicsWorld.remove(this);
			// world.physicsWorld.remove(this.collision);
			this.rayCastVehicle.removeFromWorld(world.physicsWorld);

			this.wheels.forEach((wheel) =>
			{
				world.graphicsWorld.remove(wheel.wheelObject);
			});
		}
	}

	readVehicleData(gltf)
	{
		gltf.scene.traverse((child) => {

			if (child.isMesh)
			{
				Utils.setupMeshProperties(child);

				if (child.material !== undefined)
				{
					this.materials.push(child.material);
				}
			}

			if (child.hasOwnProperty('userData'))
			{
				if (child.userData.hasOwnProperty('data'))
				{
					if (child.userData.data === 'seat')
					{
						this.seats.push(new VehicleSeat(this, child, gltf));
					}
					if (child.userData.data === 'camera')
					{
						this.camera = child;
					}
					if (child.userData.data === 'wheel')
					{
						this.wheels.push(new Wheel(child));
					}
					if (child.userData.data === 'collision')
					{
						if (child.userData.shape === 'box')
						{
							child.visible = false;

							let phys = new CANNON.Box(new CANNON.Vec3(child.scale.x, child.scale.y, child.scale.z));
							phys.collisionFilterMask = ~CollisionGroups.TrimeshColliders;
							this.collision.addShape(phys, new CANNON.Vec3(child.position.x, child.position.y, child.position.z));
						}
						else if (child.userData.shape === 'sphere')
						{
							child.visible = false;

							let phys = new CANNON.Sphere(child.scale.x);
							phys.collisionFilterGroup = CollisionGroups.TrimeshColliders;
							this.collision.addShape(phys, new CANNON.Vec3(child.position.x, child.position.y, child.position.z));
						}
					}
					if (child.userData.data === 'navmesh')
					{
						child.visible = false;
					}
				}
			}
		});

		if (this.collision.shapes.length === 0)
		{
			console.warn('Vehicle ' + typeof(this) + ' has no collision data.');
		}
		if (this.seats.length === 0)
		{
			console.warn('Vehicle ' + typeof(this) + ' has no seats.');
		}
		else
		{
			this.connectSeats();
		}
	}

	connectSeats()
	{
		for (const firstSeat of this.seats)
		{
			if (firstSeat.connectedSeatsString !== undefined)
			{
				// Get list of connected seat names
				let conn_seat_names = firstSeat.connectedSeatsString.split(';');
				for (const conn_seat_name of conn_seat_names)
				{
					// If name not empty
					if (conn_seat_name.length > 0)
					{
						// Run through seat list and connect seats to this seat,
						// based on this seat's connected seats list
						for (const secondSeat of this.seats)
						{
							if (secondSeat.seatPointObject.name === conn_seat_name) 
							{
								firstSeat.connectedSeats.push(secondSeat);
							}
						}
					}
				}
			}
		}
	}
}