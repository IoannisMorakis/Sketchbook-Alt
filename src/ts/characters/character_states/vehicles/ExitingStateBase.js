import * as THREE from 'three';
import * as Utils from '../../../core/FunctionLibrary';

import
{
	CharacterStateBase,
} from '../_stateLibrary';
import { Character } from '../../Character';
import { VehicleSeat } from '../../../vehicles/VehicleSeat';
import { IControllable } from '../../../interfaces/IControllable';
import { Vehicle } from 'src/ts/vehicles/Vehicle';

export class ExitingStateBase extends CharacterStateBase
{
	vehicle;
	seat;
	startPosition= new THREE.Vector3();
	endPosition= new THREE.Vector3();
	startRotation= new THREE.Quaternion();
	endRotation= new THREE.Quaternion();
	exitPoint;
	dummyObj;

	constructor(character, seat)
	{
		super(character);

		this.canFindVehiclesToEnter = false;
		this.seat = seat;
		this.vehicle = seat.vehicle;

		this.seat.door?.open();

		this.startPosition.copy(this.character.position);
		this.startRotation.copy(this.character.quaternion);

		this.dummyObj = new THREE.Object3D();
	}

	detachCharacterFromVehicle()
	{
		this.character.controlledObject = undefined;
		this.character.resetOrientation();
		this.character.world.graphicsWorld.attach(this.character);
		this.character.resetVelocity();
		this.character.setPhysicsEnabled(true);
		this.character.setPosition(this.character.position.x, this.character.position.y, this.character.position.z);
		this.character.inputReceiverUpdate(0);
		this.character.characterCapsule.body.velocity.copy((this.vehicle).rayCastVehicle.chassisBody.velocity);
		this.character.feetRaycast();
	}

	updateEndRotation()
	{
		const forward = Utils.getForward(this.exitPoint);
		forward.y = 0;
		forward.normalize();

		this.character.world.graphicsWorld.attach(this.dummyObj);
		this.exitPoint.getWorldPosition(this.dummyObj.position);
		let target = this.dummyObj.position.clone().add(forward);
		this.dummyObj.lookAt(target);
		this.seat.seatPointObject.parent.attach(this.dummyObj);
		this.endRotation.copy(this.dummyObj.quaternion);
	}
}