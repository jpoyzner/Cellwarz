package com.poyznertech.cells.sprite;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.poyznertech.cells.CellData;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Frame;
import com.poyznertech.cells.Physics;
import com.poyznertech.cells.cell.Cell;

public class Missile extends Sprite {
	private static final String FLY_RIGHT_ACTION = "flyRight";
	private static final String FLY_LEFT_ACTION = "flyLeft";
	
	private final int direction;
	
	static Map<String, List<Frame>> actionFrames = new HashMap<String, List<Frame>>();
	
	public static void init(CellData cellData) {
		addAction(cellData, FLY_RIGHT_ACTION, "projectiles/missile", 1, false, actionFrames);
		addAction(cellData, FLY_LEFT_ACTION, "projectiles/missile", 1, true, actionFrames);		
	}
	
	public Missile(int x, int y, int direction, Cell cell) throws ClusteredInitException {
		super(x, y, false, cell);
		this.direction = direction;
		animationSequence = getDefaultAction();
	}

	@Override
	public int getWidth() {
		return 2;
	}

	@Override
	public int getHeight() {
		return 1;
	}

	@Override
	public int getLayer() {
		return Physics.EFFECTS_LAYER;
	}

	@Override
	public Map<String, List<Frame>> getActionFrames() {
		return actionFrames;
	}
	
	@Override
	void doAction() {
		physics.move(this, direction, Physics.NONE, 1);
		
		for (Sprite sprite: physics.getSpritesAtSamePosition(this)) {
			if (sprite instanceof Avatar) {
				((Avatar) sprite).die();
				removePermanently();
			}
		}
	}
	
	@Override
	public boolean isEffect() {
		return true;
	}
	
	String getDefaultAction() {
		return direction == Physics.RIGHT ? FLY_RIGHT_ACTION : FLY_LEFT_ACTION;
	}
}
