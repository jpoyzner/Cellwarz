package com.poyznertech.cells.sprite;

import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Engine;
import com.poyznertech.cells.Physics;
import com.poyznertech.cells.cell.Cell;

public abstract class EngineFire extends Sprite {
	static final String FIRE_ACTION = "fire";
	
	static final int FIRE_WIDTH = 3;
	static final int FIRE_LENGTH = 6;
	
	private final Mana mana;
	
	public EngineFire(int x, int y, Thruster mana, Cell cell) throws ClusteredInitException {
		super(x, y, false, cell);
		this.mana = mana;
	}
	
	//TODO: flames get pushed when jumping under a ledge with engine on it, thus pushing the engine
	
	@Override
	protected String getDefaultAction() {
		return FIRE_ACTION;
	}

	@Override
	public int getLayer() {
		return Physics.EFFECTS_LAYER;
	}
	
	@Override
	boolean animate() {
		return true;
	}
	
	@Override
	public int getAnimationFrequency() {
		return Engine.EIGHTH_STEP;
	}
	
	@Override
	public boolean melts() {
		return true;
	}
	
	public final void burnKill() {
		for (Sprite sprite: physics.getSpritesAtSamePosition(this)) {
			if (sprite instanceof Avatar && sprite != mana.getStructure().getAvatar()) {
				((Avatar) sprite).die();
			}
		}
	}
}
