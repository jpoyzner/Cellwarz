package com.poyznertech.cells.sprite;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;

public class CryogenicDoor extends Entrance implements Stable {
	public static final int WIDTH = 12;
	public static final int HEIGHT = 14;
	
	private static final String CLOSED_ACTION = "closed";
	private static final String OPENING_ACTION = "opening";
	private static final String OPEN_ACTION = "open";
	private static final String CLOSING_ACTION = "closing";
	
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	
	//private int openInterval; //TODO: redo correctly;
	
	public CryogenicDoor(int x, int y, boolean cellInit, Cell cell) throws ClusteredInitException {
		super(x, y, cellInit, cell);
		//openInterval = 0;
	}

	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
	
	public static void init(CellData cellData) {
		addAction(cellData, CLOSED_ACTION, "doors/cryo/closed", 1, false, actionFrames);
		addAction(cellData, OPENING_ACTION, "doors/cryo/opening", 6, false, actionFrames);		
		addAction(cellData, OPEN_ACTION, "doors/cryo/open", 1, false, actionFrames);
		addAction(cellData, CLOSING_ACTION, "doors/cryo/closing", 6, false, actionFrames);	
	}
	
	@Override
	protected String getDefaultAction() {
		return CLOSED_ACTION;
	}
	
	@Override
	void doAction() {
		//openInterval++;
		
//		if (openInterval == 6 * 4) {
//			setAnimationSequence(CLOSING_ACTION);
//		} else if (openInterval == 12 * 4) {
//			setAnimationSequence(OPENING_ACTION);
//			openInterval = 0;
//		}
	}

	@Override
	public int getWidth() {
		return WIDTH;
	}

	@Override
	public int getHeight() {
		return HEIGHT;
	}

	@Override
	public int getLayer() {
		return Physics.BACKGROUND_LAYER;
	}
	
	@Override
	boolean animate() {
		return true;
	}
	
	@Override
	public int getAnimationFrequency() {
		return 12;
	}

	@Override
	int getEntranceXOffest() {
		return 1;
	}

	@Override
	int getEntranceYOffset() {
		return 6;
	}
	
	@Override
	public int getMass() {
		return 0;
	}
}
