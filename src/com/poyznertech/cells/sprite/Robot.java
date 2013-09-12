package com.poyznertech.cells.sprite;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Engine;
import com.poyznertech.cells.Physics;

public class Robot extends Avatar {
	public Robot(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super("Dummy", x, y, cellInit, cell);
	}

	@Override
	protected String getDefaultAction() {
		return RUN_LEFT_ACTION;
		//return RUN_RIGHT_ACTION;
		//return STAND_RIGHT_ACTION;
	}

	@Override
	protected void doAction() {
		physics.gravitate(this);
		
		if (engine.actionMatchesFrequency(Engine.HALF_STEP)) {
			physics.move(this, Physics.LEFT, Physics.NONE, RUN_STEP_DISTANCE);
			
		}
	}
}
