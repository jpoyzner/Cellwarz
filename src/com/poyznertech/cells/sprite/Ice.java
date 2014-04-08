package com.poyznertech.cells.sprite;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Engine;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;

public final class Ice extends Mana {
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	static int dashboardImageIndex;
	
	private static final int SLIDE_STEP_DISTANCE = 1;
	
	int slidePower;
	
	public static void init(CellData cellData) {
		addAction(cellData, DEFAULT_ACTION, "mana/ice/ice", 1, false, actionFrames);
		dashboardImageIndex = addImage(cellData, "mana/engine/control");
	}
	
	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
	
	public Ice(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
		slidePower = Physics.RIGHT;
	}
	
	@Override
	List<ManaAction> addManaActions() {
		return Arrays.asList();
	}

	@Override
	public int getDashboardImageIndex() {
		return dashboardImageIndex;
	}
	
	@Override
	void doAction() {
		physics.gravitate(this);
		
		if (engine.actionMatchesFrequency(Engine.HALF_STEP)) {
			if (!physics.move(this, slidePower, Physics.NONE, SLIDE_STEP_DISTANCE)) {
				slidePower *= -1;
			}
		}
	}
}
