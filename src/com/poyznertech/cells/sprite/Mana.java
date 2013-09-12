package com.poyznertech.cells.sprite;

import java.util.ArrayList;
import java.util.List;

import com.poyznertech.cells.Cell;
import com.poyznertech.cells.ClusteredInitException;
import com.poyznertech.cells.Physics;

public abstract class Mana extends Sprite {
	public static final int SIZE = 3;
	
	private final List<ManaAction> actions;
	
	private Structure structure;
	private boolean handlingMelt;
	private boolean beingHandled;
	
	public Mana(int x, int y, boolean cellInit, Cell cell)  throws ClusteredInitException {
		super(x, y, cellInit, cell);
		actions = addManaActions();
		structure = new Structure().addMana(this);
		handlingMelt = false;
		beingHandled = false;
	}
	
	List<ManaAction> addManaActions() {
		return new ArrayList<ManaAction>();
	}
	
	@Override
	public int getWidth() {
		return SIZE;
	}

	@Override
	public int getHeight() {
		return SIZE;
	}
	
	@Override
	public int getLayer() {
		return Physics.OBJECT_LAYER;
	}
	
	@Override
	void doAction() {
		physics.gravitate(this);
	}
	
	@Override
	public int getMass() {
		return beingHandled ? 0 : 5;
	}
	
	public final List<ManaAction> getActions() {
		return actions;
	}
	
	public final void activateAction(int index) {
		if (actions.size() > index) {
			actions.get(index).activate();
		}
	}
	
	public final void deactivateAction(int index) {
		if (actions.size() > index) {
			actions.get(index).deactivate();
		}
	}
	
	public final void deactivateAllActions() {
		for (ManaAction action: actions) {
			action.deactivate();
		}
	}

	public Structure getStructure() {
		return structure;
	}

	public void setStructure(Structure structure) {
		this.structure = structure;
	}
	
	@Override
	public boolean melts() {
		return handlingMelt;
	}

	public void handleMelt() {
		handlingMelt = true;
	}
	
	public void removeHandleMelt() {
		handlingMelt = false;
	}
	
	public void beingHandled() {
		beingHandled = true;
	}
	
	public void setDown() {
		beingHandled = false;
	}
	
	public boolean isBeingHandled() {
		return beingHandled;
	}

	abstract public int getDashboardImageIndex();
}
