package com.poyznertech.cells.sprite;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Engine;
import com.poyznertech.cells.Physics;

public class Robot extends Avatar {
	private static int count = 0;
	
	public Robot(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super("Cyborg" + ++count, x, y, cellInit, cell);
		runRight();
	}

	@Override
	protected String getDefaultAction() {
		return RUN_RIGHT_ACTION;
	}

	@Override
	void doAction() {
		if (yPower == Physics.NONE) {
			if (physics.touchSprite(this, Physics.NONE, Physics.DOWN, false)) {
				if (xPower == Physics.NONE) {
					setAnimationSequence(facingRight ? STAND_RIGHT_ACTION : STAND_LEFT_ACTION);
				} else {
					setAnimationSequence(facingRight ? RUN_RIGHT_ACTION : RUN_LEFT_ACTION);
				}
			} else {
				setAnimationSequence(facingRight ? LAND_RIGHT_ACTION : LAND_LEFT_ACTION);
			}
			
			physics.gravitate(this);
		} else {
			if (yPower > START_FLOAT_INTERVAL) {
				setAnimationSequence(facingRight ? JUMP_RIGHT_ACTION : JUMP_LEFT_ACTION);
			} else if (yPower > START_LAND_INTERVAL) {
				setAnimationSequence(facingRight ? FLOAT_RIGHT_ACTION : FLOAT_LEFT_ACTION);
			}
			
			if (!physics.move(this, Physics.NONE, Physics.UP, JUMP_DISTANCE)) {
				yPower = 1;
			}
			
			yPower --;
		}
		
		if (xPower != Physics.NONE) {
			if (engine.actionMatchesFrequency(Engine.HALF_STEP)) {
				if (!physics.move(this, xPower, Physics.NONE, RUN_STEP_DISTANCE)) {
					if (facingRight) {
						runLeft();
					} else {
						runRight();
					}
				}
			}
		} else if (slidePower != Physics.NONE) {
			physics.move(this, slidePower, Physics.NONE, RUN_STEP_DISTANCE);
			slidePower = Physics.NONE;
		}

		//if (firstDraw != 0) {
		//	firstDraw--;
		//}
	}
	
	public boolean showName() {
		return false;
	}
}
