package com.poyznertech.cells.sprite;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;
import com.poyznertech.cells.cell.Cell;

public class CellBlock extends Sprite implements Stable {
	public static final int SIZE = 2;
	
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	
	public CellBlock(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
	}
	
	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
	
	public static void init(CellData cellData) {
		addAction(cellData, DEFAULT_ACTION, "blocks/blockC", 1, false, actionFrames);
	}

	@Override
	public int getWidth() {
		return SIZE;
	}

	@Override
	public int getHeight() {
		return SIZE;
	}
	
	public int getLayer() {
		return Physics.LEVEL_LAYER;
	}
	
	@Override
	public int getMass() {
		return 10;
	}
}
