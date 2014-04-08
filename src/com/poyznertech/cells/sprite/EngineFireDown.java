package com.poyznertech.cells.sprite;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Frame;

public class EngineFireDown extends EngineFire {
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	
	public EngineFireDown(int x, int y, Thruster mana, Cell cell)  throws ClusteredInitException {
		super(x, y, mana, cell);
	}
	
	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
	
	public static void init(CellData cellData) {
		addActions(cellData, FIRE_ACTION, "mana/engine/fire/down", 2, actionFrames);
	}

	@Override
	public int getWidth() {
		return FIRE_WIDTH;
	}

	@Override
	public int getHeight() {
		return FIRE_LENGTH;
	}
}
