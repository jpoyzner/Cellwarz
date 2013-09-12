package com.poyznertech.cells.sprite;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;

public class EngineMana extends Mana {
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	static int dashboardImageIndex;
	
	private static final int HORIZONTAL_FLIGHT_STEP = 1;
	private static final int VERTICAL_FLIGHT_STEP = 1;
	
	private final EngineFire leftFire;
	private final EngineFire downFire;
	private final EngineFire rightFire;
	
	private int leftThrust;
	private int upThrust;
	private int rightThrust;
	
	public EngineMana(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
		leftFire = new EngineFireLeft(x - EngineFire.FIRE_LENGTH, y, this, cell);
		leftFire.remove();
		downFire = new EngineFireDown(x, y + Mana.SIZE, this, cell);
		downFire.remove();
		rightFire = new EngineFireRight(x + Mana.SIZE, y, this, cell);
		rightFire.remove();
		leftThrust = 0;
		upThrust = 0;
		rightThrust = 0;
	}
	
	public static final void init(CellData cellData) {
		addAction(cellData, DEFAULT_ACTION, "mana/engine/engine", 1, false, actionFrames);
		dashboardImageIndex = addImage(cellData, "mana/engine/control");
		EngineFireDown.init(cellData);
		EngineFireLeft.init(cellData);
		EngineFireRight.init(cellData);
	}
	
	@Override
	List<ManaAction> addManaActions() {
		return Arrays.asList(new FireLeft(), new FireDown(), new FireRight());
	}
	
	@Override
	void doAction() {
		boolean movedVertically = false;
		
		if (upThrust > 0) {
			movedVertically = physics.move(this, Physics.NONE, Physics.UP, VERTICAL_FLIGHT_STEP);
		} else {
			physics.gravitate(this);
		}
		
		if (physics.move(this, rightThrust - leftThrust, Physics.NONE, HORIZONTAL_FLIGHT_STEP) || movedVertically) {
			physics.moveTo(leftFire, getX() - EngineFire.FIRE_LENGTH, getY());
			physics.moveTo(downFire, getX(), getY() + Mana.SIZE);
			physics.moveTo(rightFire, getX() + Mana.SIZE, getY());
		}
		
		if (leftThrust == 1) {
			leftFire.burnKill();
		}
		
		if (upThrust == 1) {
			downFire.burnKill();
		}
		
		if (rightThrust == 1) {
			rightFire.burnKill();
		}
	}

	private class FireLeft extends ManaAction {
		@Override
		public void activate() {
			leftThrust = 1;
			rightFire.replace();
		}

		@Override
		public void deactivate() {
			leftThrust = 0; 
			rightFire.remove();
		}
	}
	
	private class FireDown extends ManaAction {
		@Override
		public void activate() {
			upThrust = 1;
			downFire.replace();
		}

		@Override
		public void deactivate() {
			upThrust = 0;
			downFire.remove();
		}
	}
	
	private class FireRight extends ManaAction {
		@Override
		public void activate() {
			rightThrust = 1;
			leftFire.replace();
		}

		@Override
		public void deactivate() {
			rightThrust = 0;
			leftFire.remove();
		}
	}

	@Override
	public 	int getDashboardImageIndex() {
		return dashboardImageIndex;
	}

	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
}
